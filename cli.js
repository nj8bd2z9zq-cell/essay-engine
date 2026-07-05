#!/usr/bin/env node
/* =============================================================================
   cli.js — Voluntary or Violence drafting engine for Claude Code / terminal.
   Run with no arguments for full help.
   ============================================================================= */

const fs = require("fs");
const path = require("path");
const E = require("./engine.js");
const RULES = require("./rules.js");

const MODEL_DEFAULT = process.env.VV_MODEL || "claude-opus-4-8";
const SESSION_FILE = ".vv-session.json";
const METAPHOR_FILE = "vv-metaphor-history.json";

const argv = process.argv.slice(2);
const cmd = argv[0];
const positional = [];
for (let i = 1; i < argv.length; i++) {
  if (argv[i].startsWith("--")) { i++; continue; }
  positional.push(argv[i]);
}
function flag(name, def) {
  const i = argv.indexOf("--" + name);
  return i !== -1 && argv[i + 1] !== undefined ? argv[i + 1] : def;
}
function hasFlag(name){ return argv.includes("--" + name); }
const C = { r:"\x1b[31m", g:"\x1b[32m", y:"\x1b[33m", b:"\x1b[1m", d:"\x1b[2m", x:"\x1b[0m" };

function readJSON(p){ return JSON.parse(fs.readFileSync(p, "utf8")); }
function readText(p){ return fs.readFileSync(p, "utf8"); }
function die(m){ console.error(C.r + m + C.x); process.exit(1); }

/* ---------------- API: streaming by default ---------------- */
async function callAPI(prompt, opts = {}) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) die("Set ANTHROPIC_API_KEY in your environment first.");
  const model = flag("model", MODEL_DEFAULT);
  const body = {
    model,
    max_tokens: opts.maxTokens || 8192,
    system: prompt.system,
    messages: opts.messages || [{ role: "user", content: prompt.user }],
    stream: true
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
    body: JSON.stringify(body)
  });
  if (!res.ok) die("API " + res.status + ": " + (await res.text()).slice(0, 400));

  const quiet = opts.quiet;
  let full = "";
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const ev = JSON.parse(payload);
        if (ev.type === "content_block_delta" && ev.delta && ev.delta.text) {
          full += ev.delta.text;
          if (!quiet) process.stdout.write(ev.delta.text);
        }
      } catch (e) { /* partial frame */ }
    }
  }
  if (!quiet) process.stdout.write("\n");
  return full;
}

/* ---------------- session (reply rounds) ---------------- */
function saveSession(s){ fs.writeFileSync(SESSION_FILE, JSON.stringify(s, null, 2)); }
function loadSession(){
  if (!fs.existsSync(SESSION_FILE)) die("No active session. Run a pass (review/steelman/reductio/bridge/spec/drift/verify) first.");
  return readJSON(SESSION_FILE);
}

async function runPass(passId, prompt, opts = {}) {
  const text = await callAPI(prompt, opts);
  saveSession({ passId, prompt: { system: prompt.system, user: prompt.user }, exchanges: [{ assistant: text }] });
  console.log(C.d + "\n(Push back with:  node cli.js reply \"your rebuttal\")" + C.x);
  return text;
}

/* ---------------- helpers ---------------- */
const BLANK = {
  mode: "blog", voiceProfile: "polemic", stance: "mock", voicePreset: "standard",
  productionMode: "collaborative", subject: "", thesis: "",
  targetReaderPicture: "", actors: [], incidents: [], figures: [],
  opposition: "", oppositionDefender: "", nonVolSources: [], notes: ""
};

function lastParagraphs(text, n) {
  const ps = text.split(/\n\s*\n/).map(p => p.trim()).filter(p => p && !/^#/.test(p));
  return ps.slice(-n).join("\n\n");
}

function printLint(text, mode, brief) {
  const L = E.runLinters(text, brief), V = E.lintVerdict(L, mode), c = RULES.constraints, sp = L.specificity;
  const tag = ok => ok ? C.g + "ok" + C.x : C.r + "FLAG" + C.x;
  console.log(C.b + "\n  DETERMINISTIC LINT  " + C.x + C.d + "(" + E.wordCount(text) + " words, " + L.rhythm.total + " sentences)" + C.x);
  console.log("  passive voice     " + L.passive.pct + "%   " + tag(L.passive.pct <= c.maxPassivePct));
  console.log("  avg sentence      " + L.rhythm.avg + "w  " + tag(L.rhythm.avgInBand) + C.d + "  band " + c.avgSentenceLenMin + "-" + c.avgSentenceLenMax + C.x);
  console.log("  length std-dev    " + L.rhythm.sd + "   " + tag(L.rhythm.sdOk) + C.d + "  need >=" + c.sentenceLenStdDevMin + C.x);
  console.log("  transitions       " + L.transitions.pct + "%   " + tag(L.transitions.ok));
  console.log("  em-dash / 1k      " + L.emDash.per1k + "   " + tag(!L.emDash.heavy));
  console.log("  same-start pairs  " + L.sameStart.length + "   " + tag(L.sameStart.length === 0));
  console.log("  long paragraphs   " + L.longParagraphs.length + "   " + tag(L.longParagraphs.length === 0));
  console.log(C.b + "\n  OPENING" + C.x + C.d + "  \"" + L.opening.first + "\"" + C.x);
  if (L.opening.flags.length) L.opening.flags.forEach(f => console.log("  " + C.r + "- " + f + C.x));
  else console.log("  no deterministic opening flags " + C.d + "(pattern match still needs the drift audit)" + C.x);
  console.log(C.b + "\n  SPECIFICITY FLOOR" + C.x);
  console.log("  named actors      " + sp.namedActorsEstimate + " (~est)  need " + sp.need.namedActors + "   " + tag(sp.namedActorsEstimate >= sp.need.namedActors));
  console.log("  dated incidents   " + sp.datedIncidents + "  need " + sp.need.datedIncidents + "   " + tag(sp.datedIncidents >= sp.need.datedIncidents));
  console.log("  figures/citations " + sp.figuresOrCitations + "  need " + sp.need.figuresOrCitations + "   " + tag(sp.figuresOrCitations >= sp.need.figuresOrCitations));
  if (brief && L.actors.length) {
    console.log(C.b + "\n  BRIEF ACTORS IN DRAFT" + C.x);
    L.actors.forEach(a => console.log("  " + (a.present ? C.g + "present " : C.r + "MISSING ") + C.x + a.actor));
  }
  if (mode === "longEssay" && L.sections.length) {
    const m = RULES.modes.longEssay;
    console.log(C.b + "\n  SECTIONS  " + C.x + C.d + "(need " + m.sections + " of " + m.sectionMinWords + "-" + m.sectionMaxWords + "w)" + C.x);
    L.sections.forEach((s, i) => {
      const ok = s.words >= m.sectionMinWords && s.words <= m.sectionMaxWords;
      console.log("  " + (i + 1) + ". " + s.title.slice(0, 50) + "  " + s.words + "w  " + tag(ok));
    });
  }
  if (L.verifySignals.length) {
    console.log(C.y + C.b + "\n  FABRICATION-TELL SIGNALS" + C.x + C.d + "  (run: node cli.js verify <draft>)" + C.x);
    L.verifySignals.forEach(v => console.log("  " + C.y + "- " + v.signal + " x" + v.count + C.x));
  }
  if (L.forbiddenVocab.length) console.log(C.r + "\n  forbidden vocab:  " + C.x + L.forbiddenVocab.map(f => f.term + " x" + f.count).join(", "));
  if (L.bannedTitles.length) console.log(C.r + "  banned titles:    " + C.x + L.bannedTitles.join(", "));
  console.log("\n  " + (V.pass ? C.g + C.b + "VERDICT: deterministic checks clear." + C.x
                              : C.r + C.b + "VERDICT: " + V.fails.length + " flag(s)" + C.x));
  if (!V.pass) V.fails.forEach(f => console.log("    " + C.r + "-" + C.x + " " + f));
  console.log("");
}

/* ---------------- staged long-essay drafting ---------------- */
async function stagedDraft(brief, outPath) {
  const m = RULES.modes.longEssay;
  console.log(C.b + "STAGE A — structure plan" + C.x);
  const plan = await callAPI(E.buildStructure(brief), { maxTokens: 4096 });
  const planPath = (outPath || "draft.md").replace(/\.md$/, "") + ".plan.md";
  fs.writeFileSync(planPath, plan);
  console.log(C.d + "\nPlan saved to " + planPath + C.x);

  let full = "";
  for (let s = 1; s <= m.sections; s++) {
    console.log(C.b + "\nSTAGE " + (s === m.sections ? "D" : "B/C") + " — section " + s + " of " + m.sections + C.x);
    const tail = full ? lastParagraphs(full, 2) : null;
    const sectionText = await callAPI(E.buildSectionDraft(brief, plan, s, tail), { maxTokens: 8192 });
    full += (full ? "\n\n" : "") + sectionText.trim();
    if (outPath) fs.writeFileSync(outPath, full); // checkpoint after every section
    const w = E.wordCount(sectionText);
    const ok = w >= m.sectionMinWords && w <= m.sectionMaxWords;
    console.log(C.d + "\n  section " + s + ": " + w + " words " + (ok ? C.g + "in band" : C.y + "OUT OF BAND " + m.sectionMinWords + "-" + m.sectionMaxWords) + C.x);
  }

  console.log(C.b + "\nSTAGE E — integration seam report" + C.x);
  const seams = await callAPI(E.buildIntegration(brief, full), { maxTokens: 4096 });
  if (outPath) {
    const seamPath = outPath.replace(/\.md$/, "") + ".seams.md";
    fs.writeFileSync(seamPath, seams);
    console.log(C.g + "\nDraft: " + outPath + "  (" + E.wordCount(full) + " words)" + C.x);
    console.log(C.g + "Seam report: " + seamPath + C.x);
  }
  return full;
}

/* ---------------- metaphor history ---------------- */
function loadMetaphorHistory(){
  try { return readJSON(METAPHOR_FILE); } catch (e) { return []; }
}

/* ================= command dispatch ================= */
(async function () {
  switch (cmd) {

    case "new": {
      const out = positional[0] || "intake-brief.json";
      if (fs.existsSync(out)) die(out + " already exists.");
      fs.writeFileSync(out, JSON.stringify(BLANK, null, 2));
      console.log(C.g + "Wrote " + out + C.x + "  — fill in thesis + actors, then run review.");
      break;
    }

    case "lint": {
      if (!positional[0]) die("usage: cli.js lint <draft.md> [--brief brief.json] [--mode blog|shortEssay|longEssay]");
      const brief = flag("brief", null) ? readJSON(flag("brief")) : null;
      printLint(readText(positional[0]), flag("mode", brief ? brief.mode : "blog"), brief);
      break;
    }

    case "docx": {
      if (!positional[0]) die("usage: cli.js docx <draft.md> --title \"Headline\" [--out file.docx]");
      let docx; try { docx = require("docx"); } catch (e) { die("Run `npm install` first (docx is a dependency)."); }
      const { build } = require("./docx-export.js");
      const title = flag("title", path.basename(positional[0]).replace(/\.[^.]+$/, ""));
      const out = flag("out", title.replace(/\W+/g, "-") + ".docx");
      const doc = build(docx, { title, byline: "Voluntary or Violence", body: readText(positional[0]) });
      const buf = await docx.Packer.toBuffer(doc);
      fs.writeFileSync(out, buf);
      console.log(C.g + "Wrote " + out + C.x + "  (" + buf.length + " bytes, Broadsheet Georgia / #" + RULES.broadsheet.accentColor + ")");
      break;
    }

    case "review":   { await runPass("review",   E.buildIntakeReview(readJSON(positional[0]))); break; }
    case "steelman": { await runPass("steelman", E.buildSteelman(readJSON(positional[0]))); break; }
    case "reductio": { await runPass("reductio", E.buildReductio(readJSON(positional[0]))); break; }
    case "bridge":   { await runPass("bridge",   E.buildBridgeInspector(readJSON(positional[0]))); break; }

    case "gauntlet": {
      if (!positional[0]) die("usage: cli.js gauntlet <brief.json>");
      const b = readJSON(positional[0]);
      const passes = [
        ["INTAKE REVIEW", E.buildIntakeReview(b)],
        ["STEELMAN", E.buildSteelman(b)],
        ["REDUCTIO", E.buildReductio(b)],
        ["BRIDGE INSPECTOR", E.buildBridgeInspector(b)]
      ];
      for (const [name, prompt] of passes) {
        console.log(C.b + "\n" + "=".repeat(60) + "\n  " + name + "\n" + "=".repeat(60) + C.x + "\n");
        await callAPI(prompt);
      }
      console.log(C.d + "\nGauntlet complete. Reply rounds attach to single passes — rerun the one you want to argue with." + C.x);
      break;
    }

    case "draft": {
      const b = readJSON(positional[0]);
      if (!b.thesis || !b.thesis.trim()) die("Brief has no thesis. The engine never proposes one — write it first.");
      const out = flag("out", null);
      if (b.mode === "longEssay") {
        if (!out) die("Long-essay mode is staged and checkpoints to disk — give it --out draft.md");
        await stagedDraft(b, out);
      } else {
        const txt = await callAPI(E.buildDraft(b), { quiet: !!out });
        if (out) { fs.writeFileSync(out, txt); console.log(C.g + "Draft written to " + out + C.x); }
      }
      break;
    }

    case "spec": {
      if (positional.length < 2) die("usage: cli.js spec <draft.md> <brief.json>");
      await runPass("spec", E.buildSpecificityAudit(readText(positional[0]), readJSON(positional[1])));
      break;
    }

    case "drift": {
      if (!positional[0]) die("usage: cli.js drift <draft.md> [preset] [--brief b.json]");
      const briefArg = flag("brief", null) ? readJSON(flag("brief"))
        : { voiceProfile: "polemic", voicePreset: positional[1] || "standard" };
      await runPass("drift", E.buildDriftAudit(readText(positional[0]), briefArg));
      break;
    }

    case "audit": {
      if (!positional[0]) die("usage: cli.js audit <draft.md> [--brief b.json]");
      const b = flag("brief", null) ? readJSON(flag("brief")) : {};
      // Auditor doctrine: stateless, fresh context — no reply session saved.
      await callAPI(E.buildAuditor(readText(positional[0]), b));
      console.log(C.d + "\n(The Auditor is detect-only and stateless — no reply session. Fix, then run delta.)" + C.x);
      break;
    }

    case "delta": {
      if (positional.length < 2) die("usage: cli.js delta <old.md> <new.md> [--report prior-audit.md]");
      const rep = flag("report", null) ? readText(flag("report")) : null;
      await callAPI(E.buildDelta(readText(positional[0]), readText(positional[1]), rep));
      break;
    }

    case "verify": {
      if (!positional[0]) die("usage: cli.js verify <draft.md>");
      const text = readText(positional[0]);
      const sig = E.verifySignals(text);
      if (sig.length) {
        console.log(C.y + C.b + "Deterministic signature scan:" + C.x);
        sig.forEach(v => console.log("  " + C.y + "- " + v.signal + " x" + v.count + C.x));
        console.log("");
      }
      await runPass("verify", E.buildVerification(text));
      break;
    }

    case "metaphors": {
      if (!positional[0]) die("usage: cli.js metaphors <draft.md> [--save]");
      const raw = await callAPI(E.buildMetaphorExtract(readText(positional[0])), { quiet: true, maxTokens: 2048 });
      let list;
      try { list = JSON.parse(raw.replace(/```json|```/g, "").trim()); }
      catch (e) { die("Couldn't parse metaphor list from model output:\n" + raw.slice(0, 300)); }
      const history = loadMetaphorHistory();
      const rec = E.metaphorRecurrence(list, history);
      console.log(C.b + "\n  METAPHOR RECURRENCE  " + C.x + C.d + "(vs last " + Math.min(history.length, 10) + " saved outputs; retire at >40%)" + C.x);
      rec.forEach(r => console.log("  " + (r.retire ? C.r + "RETIRE " : C.g + "fresh  ") + C.x + r.metaphor + C.d + "  " + r.recurrencePct + "%" + C.x));
      if (hasFlag("save")) {
        history.push(list);
        fs.writeFileSync(METAPHOR_FILE, JSON.stringify(history.slice(-20), null, 2));
        console.log(C.g + "\nSaved to history (" + METAPHOR_FILE + ", " + Math.min(history.length, 20) + " outputs tracked)." + C.x);
      } else {
        console.log(C.d + "\nAdd --save to record this output in the recurrence history." + C.x);
      }
      break;
    }

    case "reply": {
      const rebuttal = positional.join(" ") || flag("say", "");
      if (!rebuttal) die("usage: cli.js reply \"your rebuttal to the last pass\"");
      const s = loadSession();
      console.log(C.d + "(continuing " + s.passId + " — " + s.exchanges.length + " prior exchange(s))\n" + C.x);
      const msgs = E.continueMessages(s.prompt, s.exchanges, rebuttal);
      const text = await callAPI(s.prompt, { messages: msgs });
      s.exchanges[s.exchanges.length - 1].user = rebuttal;
      s.exchanges.push({ assistant: text });
      saveSession(s);
      console.log(C.d + "\n(Continue with another:  node cli.js reply \"...\")" + C.x);
      break;
    }

    default:
      console.log([
        C.b + "Voluntary or Violence — drafting engine" + C.x,
        "",
        C.d + "Offline (no key):" + C.x,
        "  node cli.js new [brief.json]                 scaffold a blank intake brief",
        "  node cli.js lint <draft.md> [--brief b.json] linters + actor check + verdict",
        "  node cli.js docx <draft.md> --title \"…\"      build the Broadsheet .docx",
        "",
        C.d + "API (needs ANTHROPIC_API_KEY) — all responses stream live:" + C.x,
        "  node cli.js review   <brief.json>            intake gate / kill criteria",
        "  node cli.js steelman <brief.json>            strongest opposing case",
        "  node cli.js reductio <brief.json>            does the thesis prove too much?",
        "  node cli.js bridge   <brief.json>            dissect non-voluntaryist sources",
        "  node cli.js gauntlet <brief.json>            all four passes in sequence",
        "  node cli.js draft    <brief.json> --out d.md (longEssay mode auto-stages: plan,",
        "                                                5 sections, seam report)",
        "  node cli.js spec     <draft.md> <brief.json> specificity audit",
        "  node cli.js drift    <draft.md> [preset]     voice + opening/closing/title audit",
        "  node cli.js verify   <draft.md>              Verification Protocol (T1–T4 tiers)",
        "  node cli.js audit    <draft.md> [--brief b]  The Auditor: detect-only, P0/P1/P2",
        "  node cli.js delta    <old.md> <new.md>       FIXED / RE-SKINNED / UNTOUCHED",
        "  node cli.js metaphors <draft.md> [--save]    recurrence vs last 10 outputs",
        "  node cli.js reply    \"rebuttal…\"             argue with the last pass",
        "",
        C.d + "Flags: --model <id>  --out <path>  --title \"…\"  --brief <b.json>  --mode <m>" + C.x
      ].join("\n"));
  }
})().catch(e => die(e.message));
