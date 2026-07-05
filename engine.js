/* =============================================================================
   engine.js — The brain. Two layers:
     1. Deterministic linters  (no API, instant, offline)
     2. Adversarial prompt builders (fed to the Anthropic API by app or CLI)
   Works in the browser (window.VVENGINE) and in Node (module.exports).
   ============================================================================= */

(function (root, factory) {
  const RULES = (typeof require !== "undefined") ? require("./rules.js")
              : (root.VVRULES);
  const api = factory(RULES);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof window !== "undefined") window.VVENGINE = api;
})(typeof self !== "undefined" ? self : this, function (RULES) {

  /* ---- text utilities ---------------------------------------------------- */
  function splitSentences(text) {
    // Strip markdown headers/subheads (lines starting with # or all-caps short lines)
    const body = text
      .split("\n")
      .filter(l => !/^\s*#{1,6}\s/.test(l))
      .join(" ");
    const matches = body.match(/[^.!?]+[.!?]+(?=\s|$)/g) || [];
    return matches.map(s => s.trim()).filter(Boolean);
  }
  function splitParagraphs(text) {
    return text.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
  }
  function words(s) { return (s.match(/\b[\w'$-]+\b/g) || []); }
  function wordCount(text) { return words(text).length; }
  function firstWord(s) { return (s.match(/[A-Za-z']+/) || [""])[0].toLowerCase(); }
  function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0; }
  function stddev(a) {
    if (a.length < 2) return 0;
    const m = mean(a);
    return Math.sqrt(mean(a.map(x => (x - m) ** 2)));
  }

  const TRANSITIONS = [
    "but","yet","still","so","because","since","while","when","after","before",
    "though","although","instead","then","thus","therefore","meanwhile","once",
    "until","unless","if","where","as","and so","not that","worse","better"
  ];
  const IRREGULAR_PARTICIPLES = [
    "done","made","said","taken","given","seen","known","shown","held","kept",
    "told","built","sold","paid","sent","spent","caught","taught","bought",
    "brought","found","left","lost","meant","put","set","run","beaten","driven",
    "written","stolen","forced","killed","jailed","taxed","funded","passed"
  ];

  /* ---- LINTER 1: passive voice estimate ---------------------------------- */
  function passiveVoice(text) {
    const sents = splitSentences(text);
    const beVerb = /\b(is|are|was|were|be|been|being)\b/i;
    let passive = 0;
    const flagged = [];
    sents.forEach(s => {
      const toks = words(s.toLowerCase());
      for (let i = 0; i < toks.length - 1; i++) {
        if (beVerb.test(toks[i])) {
          // look ahead up to 2 tokens for a participle
          for (let j = i + 1; j <= Math.min(i + 3, toks.length - 1); j++) {
            const w = toks[j];
            if (/ed$/.test(w) && w.length > 3 || IRREGULAR_PARTICIPLES.includes(w)) {
              passive++; flagged.push(s.slice(0, 90)); return;
            }
          }
        }
      }
    });
    const pct = sents.length ? Math.round((passive / sents.length) * 100) : 0;
    return { pct, count: passive, total: sents.length, flagged: flagged.slice(0, 8) };
  }

  /* ---- LINTER 2: sentence rhythm ----------------------------------------- */
  function rhythm(text) {
    const lens = splitSentences(text).map(wordCount);
    const c = RULES.constraints;
    const avg = +mean(lens).toFixed(1);
    const sd = +stddev(lens).toFixed(1);
    const over35 = lens.filter(l => l > 35).length;
    return {
      avg, sd, over35, total: lens.length,
      avgInBand: avg >= c.avgSentenceLenMin && avg <= c.avgSentenceLenMax,
      sdOk: sd >= c.sentenceLenStdDevMin,
      lens
    };
  }

  /* ---- LINTER 3: consecutive same-start sentences ------------------------ */
  function sameStart(text) {
    const sents = splitSentences(text);
    const hits = [];
    for (let i = 1; i < sents.length; i++) {
      const a = firstWord(sents[i - 1]), b = firstWord(sents[i]);
      if (a && a === b) hits.push({ word: a, sentence: sents[i].slice(0, 80) });
    }
    return hits;
  }

  /* ---- LINTER 4: paragraph length ---------------------------------------- */
  function paragraphLength(text) {
    const max = RULES.constraints.maxSentencesPerParagraph;
    return splitParagraphs(text)
      .map((p, i) => ({ i, n: splitSentences(p).length, preview: p.slice(0, 70) }))
      .filter(p => p.n > max);
  }

  /* ---- LINTER 5: forbidden vocabulary ------------------------------------ */
  function forbiddenVocab(text) {
    const lower = text.toLowerCase();
    return RULES.forbiddenVocab
      .filter(term => new RegExp("\\b" + term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "i").test(lower))
      .map(term => ({ term, count: (lower.match(new RegExp("\\b" + term.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&") + "\\b", "g")) || []).length }));
  }

  /* ---- LINTER 6: em-dash density ----------------------------------------- */
  function emDash(text) {
    const n = (text.match(/\u2014|--/g) || []).length;
    const per1k = wordCount(text) ? +(n / wordCount(text) * 1000).toFixed(1) : 0;
    return { count: n, per1k, heavy: per1k > 3 };
  }

  /* ---- LINTER 7: transition frequency ------------------------------------ */
  function transitions(text) {
    const sents = splitSentences(text);
    let withT = 0;
    sents.forEach(s => {
      const low = " " + s.toLowerCase() + " ";
      if (TRANSITIONS.some(t => low.includes(" " + t + " "))) withT++;
    });
    const pct = sents.length ? Math.round(withT / sents.length * 100) : 0;
    return { pct, ok: pct >= RULES.constraints.minTransitionPct, total: sents.length };
  }

  /* ---- LINTER 8: banned titles ------------------------------------------- */
  function bannedTitles(text) {
    return RULES.bannedTitles.filter(t =>
      new RegExp(t.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&"), "i").test(text));
  }

  /* ---- LINTER 9: specificity floor counts -------------------------------- */
  function specificity(text) {
    const wc = wordCount(text);
    const per1k = wc / 1000 || 1;

    const years = text.match(/\b(1[89]\d\d|20\d\d)\b/g) || [];
    const datePhrases = text.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}\b/g) || [];
    const datedIncidents = new Set([...years, ...datePhrases]).size;

    const dollars = (text.match(/\$\s?[\d,]+(?:\.\d+)?\s?(?:billion|million|trillion|thousand|k|m|bn)?/gi) || []).length
                  + (text.match(/\b[\d,]+\s?(?:billion|million|trillion)\s+dollars?\b/gi) || []).length;
    const statutes = (text.match(/\b(U\.?S\.?C\.?|§|Section\s+\d|Title\s+\d|Public Law|Act of\s+\d{4}|Amendment|\bv\.\s+[A-Z])/g) || []).length;
    const figuresOrCitations = dollars + statutes;

    // named actors: capitalized multiword runs not at sentence start (heuristic)
    const sents = splitSentences(text);
    const actorSet = new Set();
    sents.forEach(s => {
      const tokens = s.split(/\s+/);
      let run = [];
      tokens.forEach((tok, idx) => {
        const clean = tok.replace(/[^A-Za-z.&'-]/g, "");
        const cap = /^[A-Z][a-zA-Z.&'-]+$/.test(clean);
        if (cap && idx !== 0) run.push(clean);
        else { if (run.length >= 1) actorSet.add(run.join(" ")); run = []; }
      });
      if (run.length >= 1) actorSet.add(run.join(" "));
    });

    const floor = RULES.specificityFloor;
    return {
      wordCount: wc, per1k: +per1k.toFixed(2),
      datedIncidents, figuresOrCitations,
      namedActorsEstimate: actorSet.size,
      need: {
        namedActors: Math.ceil(floor.namedActors * per1k),
        datedIncidents: Math.ceil(floor.datedIncidents * per1k),
        figuresOrCitations: Math.ceil(floor.figuresOrCitations * per1k)
      }
    };
  }

  /* ---- LINTER 10: per-section word counts (longEssay) --------------------- */
  function sectionStats(text) {
    const lines = text.split("\n");
    const sections = [];
    let cur = null;
    lines.forEach(l => {
      const m = l.match(/^#\s+(.+)/);
      if (m) { if (cur) sections.push(cur); cur = { title: m[1].trim(), body: "" }; }
      else if (cur) cur.body += l + "\n";
    });
    if (cur) sections.push(cur);
    return sections.map(s => ({ title: s.title, words: wordCount(s.body) }));
  }

  /* ---- LINTER 11: brief actors present in draft? -------------------------- */
  function actorCheck(text, brief) {
    const lower = text.toLowerCase();
    const actors = (brief && brief.actors) || [];
    return actors.map(a => {
      // match on the longest token of the actor name (surname / institution key word)
      const key = a.split(/\s+/).sort((x, y) => y.length - x.length)[0] || a;
      return { actor: a, present: lower.includes(key.toLowerCase()) };
    });
  }

  /* ---- LINTER 12: opening pattern heuristics ------------------------------ */
  function openingCheck(text) {
    const sents = splitSentences(text);
    const first = sents[0] || "";
    const flags = [];
    if (/\?\s*$/.test(first)) flags.push("Opens with a rhetorical question (banned).");
    if (/^(in today's|in our modern|in an era|in a world|throughout history|since the dawn)/i.test(first.trim()))
      flags.push("Banned setup opening ('in today's world' family).");
    if (/^(it is|there is|there are)\b/i.test(first.trim()))
      flags.push("Weak existential opening — likely fails all five legal patterns.");
    return { first: first.slice(0, 140), flags };
  }

  /* ---- LINTER 13: verification signature scan (fabrication tells) --------- */
  const VERIFY_SIGNALS = [
    { rx: /\bapproximately\b/gi, label: "approximately" },
    { rx: /\breportedly\b/gi, label: "reportedly" },
    { rx: /\ballegedly\b/gi, label: "allegedly" },
    { rx: /\bseveral\b/gi, label: "several (vague count)" },
    { rx: /\bmany (experts|studies|reports|observers)\b/gi, label: "many experts/studies" },
    { rx: /\bsome (say|argue|believe|estimate)\b/gi, label: "some say/argue" },
    { rx: /\bit is (said|believed|estimated|reported)\b/gi, label: "it is said/believed" },
    { rx: /\bI read somewhere\b/gi, label: "I read somewhere" },
    { rx: /\bestimates suggest\b/gi, label: "estimates suggest" },
    { rx: /\baccording to (some|one|a) (report|study|estimate)s?\b/gi, label: "according to a report (unnamed)" },
    { rx: /\bup to \$?[\d,]+/gi, label: "'up to' figure" },
    { rx: /\bas (many|much) as\b/gi, label: "'as many as' figure" }
  ];
  function verifySignals(text) {
    const hits = [];
    VERIFY_SIGNALS.forEach(s => {
      const m = text.match(s.rx);
      if (m) hits.push({ signal: s.label, count: m.length });
    });
    // round-number cluster: 3+ figures all ending in 000 / 00%
    const figs = (text.match(/\$[\d,]+|[\d,]+ (?:billion|million|thousand)|\b\d{1,3}%/g) || []);
    const round = figs.filter(f => /(?:000|00%|0 (?:billion|million|thousand))\b|0%$/.test(f.replace(/,/g, "")));
    if (figs.length >= 3 && round.length / figs.length > 0.7)
      hits.push({ signal: "round-number cluster (" + round.length + "/" + figs.length + " figures suspiciously round)", count: round.length });
    return hits;
  }


  /* ---- LINTER 14: closing discipline (universal) --------------------------- */
  function closingCheck(text) {
    const sents = splitSentences(text);
    const last = (sents[sents.length - 1] || "").trim();
    const flags = [];
    const finalWord = (last.match(/([A-Za-z']+)[.!?"']*$/) || [,""])[1].toLowerCase();
    if (finalWord === "freedom" || finalWord === "liberty")
      flags.push("Ends on '" + finalWord + "' as the final noun (banned in every profile).");
    if (/\b(we must|it's time to|it is time to|let us|join the|stand up and)\b/i.test(last))
      flags.push("Final line reads as a call to action (banned in every profile).");
    if (/^in (conclusion|summary|short|the end)\b/i.test(last))
      flags.push("Final line is a summary formula (banned in every profile).");
    return { last: last.slice(0, 140), flags };
  }

  /* ---- run all deterministic linters ------------------------------------- */
  function runLinters(text, brief) {
    return {
      passive: passiveVoice(text),
      rhythm: rhythm(text),
      sameStart: sameStart(text),
      longParagraphs: paragraphLength(text),
      forbiddenVocab: forbiddenVocab(text),
      emDash: emDash(text),
      transitions: transitions(text),
      bannedTitles: bannedTitles(text),
      specificity: specificity(text),
      sections: sectionStats(text),
      actors: actorCheck(text, brief),
      opening: openingCheck(text),
      closing: closingCheck(text),
      verifySignals: verifySignals(text)
    };
  }

  /* score the linter output into pass/warn for a quick verdict */
  function lintVerdict(L, mode) {
    const c = RULES.constraints;
    const fails = [];
    if (L.passive.pct > c.maxPassivePct) fails.push(`Passive voice ~${L.passive.pct}% (max ${c.maxPassivePct}%)`);
    if (!L.rhythm.avgInBand) fails.push(`Avg sentence ${L.rhythm.avg}w (band ${c.avgSentenceLenMin}\u2013${c.avgSentenceLenMax})`);
    if (!L.rhythm.sdOk) fails.push(`Length variance low (sd ${L.rhythm.sd}, need \u2265${c.sentenceLenStdDevMin})`);
    if (L.sameStart.length) fails.push(`${L.sameStart.length} consecutive same-start sentence pair(s)`);
    if (L.longParagraphs.length) fails.push(`${L.longParagraphs.length} paragraph(s) over ${c.maxSentencesPerParagraph} sentences`);
    if (L.forbiddenVocab.length) fails.push(`Forbidden vocab: ${L.forbiddenVocab.map(f => f.term).join(", ")}`);
    if (L.emDash.heavy) fails.push(`Em-dash heavy (${L.emDash.per1k}/1k)`);
    if (!L.transitions.ok) fails.push(`Transitions ${L.transitions.pct}% (need \u2265${c.minTransitionPct}%)`);
    if (L.bannedTitles.length) fails.push(`Banned title(s): ${L.bannedTitles.join(", ")}`);
    const sp = L.specificity;
    if (sp.datedIncidents < sp.need.datedIncidents) fails.push(`Dated incidents ${sp.datedIncidents}/${sp.need.datedIncidents}`);
    if (sp.figuresOrCitations < sp.need.figuresOrCitations) fails.push(`Figures/citations ${sp.figuresOrCitations}/${sp.need.figuresOrCitations}`);
    if (L.opening && L.opening.flags.length) L.opening.flags.forEach(f => fails.push("Opening: " + f));
    if (L.closing && L.closing.flags.length) L.closing.flags.forEach(f => fails.push("Closing: " + f));
    if (L.actors) {
      const missing = L.actors.filter(a => !a.present);
      if (missing.length) fails.push(`Brief actors missing from draft: ${missing.map(a => a.actor).join("; ")}`);
    }
    if (mode === "longEssay" && L.sections) {
      const m = RULES.modes.longEssay;
      if (L.sections.length !== m.sections) fails.push(`Section count ${L.sections.length} (need ${m.sections})`);
      L.sections.forEach((s, i) => {
        if (s.words < m.sectionMinWords || s.words > m.sectionMaxWords)
          fails.push(`Section ${i + 1} "${s.title.slice(0, 40)}" is ${s.words}w (band ${m.sectionMinWords}\u2013${m.sectionMaxWords})`);
      });
    }
    if (L.verifySignals && L.verifySignals.length)
      fails.push(`Fabrication-tell signals: ${L.verifySignals.map(v => v.signal + " \u00d7" + v.count).join(", ")} \u2014 run Verification pass`);
    return { pass: fails.length === 0, fails };
  }

  /* ======================================================================== */
  /*  ADVERSARIAL PROMPT BUILDERS                                             */
  /*  Each returns { system, user } for an Anthropic /v1/messages call.       */
  /* ======================================================================== */

  function philosophyBlock() {
    const p = RULES.philosophy;
    return [
      "PHILOSOPHICAL FRAME (anarcho-capitalist / voluntaryist):",
      "Axioms: " + p.axioms.join(" "),
      "State: " + p.state,
      "Economics: " + p.economics,
      "Education: " + p.education,
      "Psychiatry: " + p.psychiatry,
      RULES.framingConstant
    ].join("\n");
  }


  /* ---- Voice Profile System resolution ------------------------------------ */
  function resolveProfile(brief) {
    const id = (brief && brief.voiceProfile) || "polemic";
    return { id, def: RULES.voiceProfiles[id] || RULES.voiceProfiles.polemic };
  }
  // Craft Core never flexes; this block carries only the flexible layer.
  function voiceBlock(brief) {
    const { id, def } = resolveProfile(brief);
    if (id === "polemic") {
      const preset = RULES.voicePresets[brief.voicePreset] || RULES.voicePresets.standard;
      const stance = def.stances.includes(brief.stance) ? brief.stance : "mock";
      return "VOICE PROFILE: Polemic (stance: " + stance + "). Preset " + preset.label +
        " \u2014 " + preset.wit + "% wit / " + preset.venom + "% venom. Register: " + preset.register + ". " +
        "Metaphors: " + def.metaphorRegister + "; banned registers: " + def.metaphorBans.join(", ") + ".";
    }
    if (id === "analyst") {
      return "VOICE PROFILE: Analyst. " + def.register + ". No wit targets, no venom targets \u2014 " +
        "restraint is the register, not a deficiency. Every verdict lands in under 15 words. " +
        "The Framing Constant still binds: the premise is never granted, it is dissected.";
    }
    return "VOICE PROFILE: Narrative. " + def.register + ". The philosophy operates through " +
      "demonstrated outcomes; if a sentence states the thesis, it fails. " +
      "The Framing Constant still binds: the scene never grants the premise.";
  }
  function openingRules(brief) {
    const { id, def } = resolveProfile(brief);
    let r = "OPENING (universal): " + RULES.universal.openingDiscipline +
      " BANNED in every profile: " + RULES.bannedOpenings.join("; ") + ".";
    if (id === "polemic")
      r += " Polemic implementation \u2014 the first sentence must match one of: " + def.openings.join("; ") + ".";
    if (id === "narrative")
      r += " Narrative implementation \u2014 open inside the scene, mid-motion, no establishing narration.";
    if (id === "analyst")
      r += " Analyst implementation \u2014 open on the specific claim or piece of evidence under examination.";
    return r;
  }
  function closingRules(brief) {
    const { id, def } = resolveProfile(brief);
    let r = "CLOSING (universal): " + RULES.universal.closingDiscipline;
    if (id === "polemic")
      r += " Polemic implementation \u2014 must be one of: " + def.closings.join("; ") + ".";
    if (id === "narrative")
      r += " Narrative implementation \u2014 the scene closes on the proof; no authorial verdict appended.";
    if (id === "analyst")
      r += " Analyst implementation \u2014 the verdict, under 15 words, already earned by the evidence.";
    return r;
  }

  const HARD_RULE =
    "HARD RULE: You never propose, soften, or rewrite the author's thesis. " +
    "Your role is adversarial collaborator: attack, pressure-test, and surface " +
    "what is missing. You may identify weaknesses and demand evidence, but the " +
    "author owns the argument. Do not write in a sycophantic tone. Be concrete.";

  function briefToText(b) {
    return [
      `Mode: ${b.mode}`,
      `Voice profile: ${b.voiceProfile || "polemic"}${(b.voiceProfile||"polemic")==="polemic" ? " / stance: " + (b.stance||"mock") + " / preset: " + b.voicePreset : ""}`,
      `Production mode: ${b.productionMode || "collaborative"}`,
      `Subject: ${b.subject}`,
      `Thesis (author-stated, do not alter): ${b.thesis}`,
      `Target-reader picture: ${b.targetReaderPicture || "(not stated)"}`,
      `Named actors available: ${(b.actors || []).join("; ") || "(none listed)"}`,
      `Dated incidents available: ${(b.incidents || []).join("; ") || "(none listed)"}`,
      `Figures / citations available: ${(b.figures || []).join("; ") || "(none listed)"}`,
      `Opposition's strongest CURRENT argument: ${b.opposition || "(not stated)"}`,
      `Named defender of that argument: ${b.oppositionDefender || "(not named)"}`,
      `Non-voluntaryist sources cited: ${(b.nonVolSources || []).join("; ") || "(none)"}`,
      `Notes: ${b.notes || ""}`
    ].join("\n");
  }

  // Intake review: does the brief clear the gates before drafting?
  function buildIntakeReview(brief) {
    return {
      system: [
        HARD_RULE, philosophyBlock(),
        "TASK: Adjudicate this intake brief against five gates and the Sovereignty Filter. " +
        "Do NOT draft anything.",
        "Sovereignty Filter: " + RULES.sovereigntyFilter,
        "Kill criteria (any one = recommend ABANDON or RE-INTAKE): " + RULES.killCriteria.map((k, i) => `(${i + 1}) ${k}`).join(" "),
        "Output: For each kill criterion, state PASS / FAIL with one line of reasoning. " +
        "Then a verdict line: PROCEED / RESTRUCTURE / KILL. If anything below the " +
        "Specificity Floor (3 named actors, 2 dated incidents, 1 figure-or-citation per 1000 words), say so."
      ].join("\n\n"),
      user: briefToText(brief)
    };
  }

  // Steelman check
  function buildSteelman(brief) {
    return {
      system: [
        HARD_RULE, philosophyBlock(),
        "TASK: Steelman the opposition. State the strongest CURRENT version of the " +
        "opposing position in its own best vocabulary, attributed to a real named " +
        "defender who holds it today. Then ask the author, pointedly, whether the " +
        "thesis actually answers THAT version or only a weaker strawman. Identify " +
        "the single hardest objection the draft must survive. Do not resolve it for him."
      ].join("\n\n"),
      user: briefToText(brief)
    };
  }

  // Reductio gate
  function buildReductio(brief) {
    return {
      system: [
        HARD_RULE, philosophyBlock(),
        "TASK: Run the author's thesis through its own logic. (1) Restate the thesis " +
        "as a general principle. (2) Apply that principle to 2\u20133 adjacent cases to test " +
        "whether it proves too much or collapses. (3) Report whether it survives, and " +
        "where the seam is. Apply the proves-too-much check. If it fails its own reductio, " +
        "say so plainly \u2014 that triggers a kill criterion."
      ].join("\n\n"),
      user: briefToText(brief)
    };
  }

  // Bridge inspector (3-step protocol for non-voluntaryist sources)
  function buildBridgeInspector(brief) {
    return {
      system: [
        HARD_RULE, philosophyBlock(),
        "TASK: For each non-voluntaryist source the author cites, run the 3-step protocol. " +
        "(1) State the author's DESCRIPTIVE claim in his own vocabulary. (2) State his " +
        "NORMATIVE claim, isolated. (3) Inspect the inferential bridge \u2014 it typically " +
        "requires that policy designers have legitimate authority, or that experts " +
        "identify preferences better than individuals. Show where the bridge fails. " +
        "Conclude: which descriptive findings are safe to cite (with attribution) and " +
        "which normative prescriptions must be rejected."
      ].join("\n\n"),
      user: "Sources: " + ((brief.nonVolSources || []).join("; ") || "(author listed none \u2014 ask whether any are being leaned on implicitly)") + "\n\n" + briefToText(brief)
    };
  }

  // Specificity audit against a draft
  function buildSpecificityAudit(draft, brief) {
    const counts = specificity(draft);
    return {
      system: [
        HARD_RULE,
        "TASK: Audit the draft against the Specificity Floor (per 1000 words: " +
        `${RULES.specificityFloor.namedActors} named actors, ` +
        `${RULES.specificityFloor.datedIncidents} dated incidents, ` +
        `${RULES.specificityFloor.figuresOrCitations} figure-or-citation). ` +
        "A deterministic pre-count is provided; verify it, then identify the WEAKEST " +
        "spots \u2014 paragraphs leaning on abstraction where a named actor, a date, or a " +
        "dollar figure should be. List concrete insertions the author should source. " +
        "Do not invent facts; mark anything you are unsure of as VERIFY."
      ].join("\n\n"),
      user: `Deterministic pre-count: ${JSON.stringify(counts)}\n\nDRAFT:\n${draft}`
    };
  }

  // Voice Fidelity Audit — measures against the DECLARED profile's own markers.
  // Drift = rewrite in the declared profile, never patch. Whole-piece mismatch
  // is a re-declaration decision for the author, not drift correction.
  // Accepts a brief object or (compat) a preset-id string.
  function buildDriftAudit(draft, briefOrPreset) {
    const brief = typeof briefOrPreset === "string"
      ? { voiceProfile: "polemic", voicePreset: briefOrPreset }
      : (briefOrPreset || { voiceProfile: "polemic", voicePreset: "standard" });
    const { id, def } = resolveProfile(brief);
    const markers = [];
    if (id === "polemic") {
      const preset = RULES.voicePresets[brief.voicePreset] || RULES.voicePresets.standard;
      markers.push(
        "Profile: POLEMIC, preset " + preset.label + " (" + preset.wit + "% wit / " +
        preset.venom + "% venom, tolerance \u00b1" + RULES.voiceBandTolerance + "). Per section, " +
        "estimate wit and venom density; flag sections outside the band and quote the proving line.",
        "Metaphor register: " + def.metaphorRegister + "; banned: " + def.metaphorBans.join(", ") + ".");
    } else if (id === "analyst") {
      markers.push(
        "Profile: ANALYST. Markers: zero irony, evidence-forward, every verdict under 15 words. " +
        "CALIBRATION: restraint is the register, NOT drift \u2014 do not flag the absence of wit or venom. " +
        "Flag irony, sneer, or editorializing as drift; flag any verdict over 15 words; flag " +
        "evidence-free assertion.");
    } else {
      markers.push(
        "Profile: NARRATIVE. Markers: scene-driven, thesis demonstrated never stated. " +
        "Flag any sentence that states the thesis or appends an authorial verdict as drift. " +
        "Flag narration that summarizes instead of showing.");
    }
    return {
      system: [
        HARD_RULE,
        "TASK: Voice Fidelity Audit against the DECLARED profile only. " + RULES.framingConstant,
        markers.join("\n"),
        "Report in five parts:",
        "1. FIDELITY \u2014 section-by-section measurement against the declared profile's markers above.",
        "2. OPENING \u2014 universal test first (" + RULES.universal.openingDiscipline + "), then the " +
        "profile implementation: " + (id === "polemic" ? "classify against the five Polemic patterns (" +
        RULES.voiceProfiles.polemic.openings.join("; ") + ")" : id === "analyst" ?
        "opens on the specific claim or evidence" : "opens inside the scene, mid-motion") + ". FAIL if neither holds.",
        "3. CLOSING \u2014 universal test first (" + RULES.universal.closingDiscipline + "), then the " +
        "profile implementation: " + (id === "polemic" ? "INVERSION or RECEIPT" : id === "analyst" ?
        "a verdict under 15 words, already earned" : "the scene closes on the proof, no verdict appended") + ".",
        "4. TITLE PORTABILITY \u2014 for every section title and subhead: would it fit a different " +
        "piece? Any YES is an automatic fail; list them.",
        "5. VERDICT \u2014 for each flagged section prescribe REWRITE IN " + def.label.toUpperCase() +
        " (never a line patch). If the piece as a whole reads like a different profile, say " +
        "'RE-DECLARATION QUESTION: this reads as [profile] \u2014 the author decides whether to " +
        "re-declare or rewrite'; do not issue line fixes for a profile mismatch.",
        "Also flag forbidden structures: " + RULES.forbiddenStructures.slice(0, 8).join("; ") + "."
      ].join("\n\n"),
      user: `DRAFT:\n${draft}`
    };
  }

  // Verification Protocol (post-draft): inventory, tier, signature scan
  function buildVerification(draft) {
    const signals = verifySignals(draft);
    return {
      system: [
        HARD_RULE,
        "TASK: Run the Verification Protocol on this draft. You are hunting fabrication " +
        "risk, not improving prose.",
        "STEP 1 \u2014 CLAIM INVENTORY: list every named individual, dollar figure, date, " +
        "direct quote, statute, and statistic in the draft.",
        "STEP 2 \u2014 TIER each claim: T1 = well-documented, safe; T2 = specific and checkable, " +
        "needs a source before publishing; T3 = uncertain, verify or cut; T4 = fabrication " +
        "risk (plausible-sounding specifics with no clear source) \u2014 AUTO-CUT, no exceptions.",
        "STEP 3 \u2014 SIGNATURE SCAN: a deterministic pre-scan of estimation language is " +
        "provided; confirm or dismiss each hit, and catch anything it missed (round-number " +
        "clusters, decimal precision without a source, unnamed attributions).",
        "STEP 4 \u2014 OUTPUT: a 'VERIFY BEFORE PUBLISHING' block listing every unresolved T2 " +
        "and T3 with what exactly must be checked, and a 'CUT' block listing every T4 with " +
        "the sentence it lives in. Inventing plausible specifics is disqualifying \u2014 say so " +
        "plainly when you see it."
      ].join("\n\n"),
      user: "Deterministic signature pre-scan: " + JSON.stringify(signals) + "\n\nDRAFT:\n" + draft
    };
  }

  /* ---- Staged long-essay drafting (Phased Drafting, Stage 2) -------------- */

  function draftCommonSystem(brief) {
    return [
      philosophyBlock(),
      "ROLE: Execute the author's argument in his declared voice profile. The thesis is fixed; render it, do not redirect it.",
      voiceBlock(brief),
      "CRAFT CORE (never flexes in any profile): max " + RULES.constraints.maxPassivePct + "% passive; max " +
        RULES.constraints.maxSentencesPerParagraph + " sentences/paragraph; no two consecutive " +
        "sentences start with the same word; \u226530% of sentences carry a transition; vary " +
        "sentence length (accordion). Continuous prose, no bullets in body.",
      "FORBIDDEN VOCABULARY: " + RULES.forbiddenVocab.join(", ") + ".",
      "FORBIDDEN STRUCTURES: " + RULES.forbiddenStructures.join("; ") + ".",
      "BANNED TITLES: " + RULES.bannedTitles.join("; ") + ".",
      "STYLE: never name or allude to any author or influence. Never mention the word essay, " +
      "word counts, or announce the thesis verbatim. No signposting, no process narration, " +
      "no cross-references between sections."
    ].join("\n\n");
  }

  // Stage A: structure plan
  function buildStructure(brief) {
    const m = RULES.modes.longEssay;
    return {
      system: [
        draftCommonSystem(brief),
        `TASK: Produce a structure plan for a ${m.sections}-section piece, sections of ` +
        `${m.sectionMinWords}\u2013${m.sectionMaxWords} words each. For each section give: ` +
        "(1) an essay-specific title in the established voice \u2014 if the title would fit any " +
        "other essay it fails; (2) 3\u20135 subhead candidates; (3) which named actors, dated " +
        "incidents, and figures from the brief that section will carry (distribute them so " +
        "every section clears the Specificity Floor); (4) one line on the section's job in " +
        "the argument. State how section 1 will open and how the piece will close, obeying: " +
        openingRules(brief) + " " + closingRules(brief) + " Plan only \u2014 no prose."
      ].join("\n\n"),
      user: briefToText(brief)
    };
  }

  // Stage B/C: one section at a time, with the plan and the tail of prior text
  function buildSectionDraft(brief, plan, sectionNum, priorTail) {
    const m = RULES.modes.longEssay;
    const isFirst = sectionNum === 1, isLast = sectionNum === m.sections;
    const extra = [];
    if (isFirst) extra.push("This is SECTION 1. " + openingRules(brief));
    if (isLast) extra.push("This is the FINAL section. " + closingRules(brief) +
      " Close exactly as the structure plan specifies.");
    return {
      system: [
        draftCommonSystem(brief),
        `TASK: Write SECTION ${sectionNum} of ${m.sections} only \u2014 ` +
        `${m.sectionMinWords}\u2013${m.sectionMaxWords} words, with its title on a line starting ` +
        `"# " and subheads on lines starting "## " every ${m.subheadEveryWords[0]}\u2013${m.subheadEveryWords[1]} words. ` +
        "Follow the structure plan. Do not write any other section. Do not summarize what " +
        "came before or preview what comes next.",
        ...extra
      ].join("\n\n"),
      user: [
        briefToText(brief),
        "\nSTRUCTURE PLAN:\n" + plan,
        priorTail ? "\nFINAL PARAGRAPHS OF THE PREVIOUS SECTION (for voice and rhythm continuity \u2014 do not repeat their content):\n" + priorTail : ""
      ].join("\n")
    };
  }

  // Stage E: integration pass — seam report on the assembled essay
  function buildIntegration(brief, fullDraft) {
    return {
      system: [
        HARD_RULE,
        "TASK: Integration pass on the assembled piece. It was drafted section by section; " +
        "find the seams. Report: (1) transitions between sections \u2014 any jolt, repeated " +
        "ground, or tonal discontinuity at each boundary; (2) metaphors or images reused " +
        "across sections (max 1 extended metaphor per section, 3 metaphoric phrases per " +
        "1,000 words \u2014 and, ONLY if the declared profile is Polemic, modern 1980s+ register " +
        "with religious/aristocratic/nostalgic/mythological framings banned); (3) named actors or incidents introduced " +
        "twice as if new; (4) any drift in wit/venom across the arc; (5) whether the close " +
        "actually answers the opening. Give surgical fix instructions per seam \u2014 the author " +
        "applies them, you do not rewrite the piece."
      ].join("\n\n"),
      user: "BRIEF:\n" + briefToText(brief) + "\n\nASSEMBLED DRAFT:\n" + fullDraft
    };
  }

  // Metaphor extraction (for recurrence tracking across outputs)
  function buildMetaphorExtract(draft) {
    return {
      system:
        "TASK: Extract every metaphoric phrase and extended metaphor from this draft. " +
        "Respond with ONLY a JSON array of short strings, each the metaphor's core image " +
        "in 2\u20136 words (e.g. \"licensing as protection racket\", \"budget as ransom note\"). " +
        "No commentary, no markdown fences, no preamble \u2014 raw JSON array only.",
      user: draft
    };
  }

  // Compare a new metaphor list against history (array of past lists)
  function metaphorRecurrence(newList, history) {
    const norm = s => s.toLowerCase().replace(/[^a-z\s]/g, "").split(/\s+/).filter(w => w.length > 3);
    const overlap = (a, b) => {
      const A = new Set(norm(a)); 
      return norm(b).filter(w => A.has(w)).length >= 2; // share 2+ significant words
    };
    const window = history.slice(-10);
    return newList.map(m => {
      const hits = window.filter(past => past.some(p => overlap(m, p))).length;
      const pct = window.length ? Math.round(hits / window.length * 100) : 0;
      return { metaphor: m, recurrencePct: pct, retire: pct > 40 };
    });
  }

  /* ---- The Auditor (v3 doctrine): detect-only, never rewrites -------------- */
  function buildAuditor(draft, brief) {
    const { id, def } = resolveProfile(brief || {});
    const calib = id === "polemic"
      ? "Declared profile POLEMIC: intensity is NEVER a tell \u2014 venom, sneer, and heat are the register, not AI inflation. Emptiness is the tell: heat with no named actor, no date, no figure under it."
      : id === "analyst"
      ? "Declared profile ANALYST: restraint is NEVER a tell \u2014 flatness and short verdicts are the register, not AI blandness. Emptiness is the tell: neutral prose that asserts without evidence."
      : "Declared profile NARRATIVE: scene-work and withheld verdicts are NEVER tells. Emptiness is the tell: scenes that decorate instead of demonstrate.";
    return {
      system: [
        "ROLE: The Auditor \u2014 a detect-only editor. You FLAG; you NEVER rewrite. If asked " +
        "to rewrite, fix, or provide replacement text, refuse and restate the flag. This " +
        "pass runs stateless \u2014 you share no context with whatever drafted the piece; judge " +
        "only what is on the page.",
        "TASK: Hunt AI tells and production-rule violations in this finished draft.",
        "CALIBRATION: " + calib + " Intensity is never a tell. Restraint is never a tell. Emptiness is.",
        "DETECTION LIST (a superset of the production rules \u2014 anything on the production " +
        "lists plus every generic AI signature you know):",
        "\u2014 Forbidden vocabulary: " + RULES.forbiddenVocab.join(", ") + ".",
        "\u2014 Forbidden structures: " + RULES.forbiddenStructures.join("; ") + ".",
        "\u2014 Banned titles: " + RULES.bannedTitles.join("; ") + ".",
        "\u2014 Banned openings: " + RULES.bannedOpenings.join("; ") + ". Universal closing " +
        "discipline: " + RULES.universal.closingDiscipline,
        "\u2014 Fabrication signatures (estimation language, unnamed attributions, round-number " +
        "clusters, decimal precision without source).",
        "\u2014 Generic tells beyond the lists: uniform sentence rhythm, hedged both-sidesing, " +
        "summary paragraphs, antithesis stacking ('not X but Y'), triadic escalation, " +
        "empty transitions, adjective inflation, symmetrical paragraph shapes.",
        "SEVERITY: P0 = disqualifying (fabrication signature, forbidden structure carrying " +
        "the argument, banned title/opening/closing); P1 = strong tell (reads AI-authored to " +
        "a careful reader); P2 = weak or possible tell (note it, author decides).",
        "OUTPUT: (1) numbered flag list \u2014 each with severity, the quoted line, and WHY it " +
        "tells; (2) SCORECARD \u2014 declared profile: " + def.label + "; counts by severity; " +
        "overall verdict PUBLISHABLE / NEEDS WORK / DISQUALIFYING in one line. No rewrites, " +
        "no suggested replacement lines, anywhere."
      ].join("\n\n"),
      user: "DRAFT:\n" + draft
    };
  }

  // Delta audit: classify each prior flag FIXED / RE-SKINNED / UNTOUCHED
  function buildDelta(oldDraft, newDraft, priorReport) {
    return {
      system: [
        "ROLE: The Auditor, delta pass \u2014 detect-only, never rewrites.",
        "TASK: Compare the revised draft against the prior draft" +
        (priorReport ? " and the prior audit report." : ".") +
        " For each prior flag" + (priorReport ? "" : " (derive them by auditing the prior draft first, briefly)") +
        ", classify:",
        "FIXED \u2014 the underlying problem is gone, not just the wording.",
        "RE-SKINNED \u2014 the flagged wording changed but the tell survives in new clothes " +
        "(same empty structure, same fabrication signature, same banned move re-phrased). " +
        "Quote both versions to prove it.",
        "UNTOUCHED \u2014 still present as flagged.",
        "Then flag anything NEW the revision introduced, with severity P0/P1/P2. " +
        "End with a one-line verdict: how many fixed, re-skinned, untouched, new."
      ].join("\n\n"),
      user: (priorReport ? "PRIOR AUDIT REPORT:\n" + priorReport + "\n\n" : "") +
            "PRIOR DRAFT:\n" + oldDraft + "\n\nREVISED DRAFT:\n" + newDraft
    };
  }

  /* ---- Reply rounds: continue any pass as a conversation ------------------ */
  // prompt = original {system,user}; exchanges = [{assistant, user}, ...]
  // Returns the messages array for the next API call.
  function continueMessages(prompt, exchanges, newReply) {
    const msgs = [{ role: "user", content: prompt.user }];
    (exchanges || []).forEach(e => {
      msgs.push({ role: "assistant", content: e.assistant });
      if (e.user) msgs.push({ role: "user", content: e.user });
    });
    if (newReply) msgs.push({ role: "user", content:
      "AUTHOR'S REPLY \u2014 press the point if his answer is weak, concede only to a superior " +
      "argument, never to social discomfort:\n\n" + newReply });
    return msgs;
  }

  // Full draft generation (author's thesis is fixed; model executes only)
  function buildDraft(brief) {
    const m = RULES.modes[brief.mode] || RULES.modes.blog;
    const { def } = resolveProfile(brief);
    const arc = (m.id !== "longEssay")
      ? "Three-act movement (universal): " + RULES.universal.blogArc +
        ". This profile's implementation: " + (def.blogArc || RULES.universal.blogArc) + "."
      : "";
    const spec =
      m.id === "longEssay"
        ? `${m.minWords}\u2013${m.maxWords} words across ${m.sections} sections of ${m.sectionMinWords}\u2013${m.sectionMaxWords} words each, with essay-specific section titles and subheadings every ${m.subheadEveryWords[0]}\u2013${m.subheadEveryWords[1]} words.`
        : `${m.minWords}\u2013${m.maxWords} words. Subheadings optional, every ${m.subheadEveryWords[0]}\u2013${m.subheadEveryWords[1]} words if used.`;
    return {
      system: [
        draftCommonSystem(brief),
        `MODE: ${m.label}. ${spec} ${m.notes} ${arc}`,
        openingRules(brief),
        closingRules(brief)
      ].join("\n\n"),
      user: briefToText(brief) + "\n\nWrite the piece now."
    };
  }

  return {
    RULES,
    // linters
    runLinters, lintVerdict,
    passiveVoice, rhythm, sameStart, paragraphLength,
    forbiddenVocab, emDash, transitions, bannedTitles, specificity,
    sectionStats, actorCheck, openingCheck, closingCheck, verifySignals,
    wordCount,
    // prompt builders
    briefToText,
    buildIntakeReview, buildSteelman, buildReductio, buildBridgeInspector,
    buildSpecificityAudit, buildDriftAudit, buildDraft,
    buildVerification, buildStructure, buildSectionDraft, buildIntegration,
    buildMetaphorExtract, metaphorRecurrence, continueMessages,
    resolveProfile, voiceBlock, openingRules, closingRules,
    buildAuditor, buildDelta
  };
});
