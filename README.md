# Voluntary or Violence — Adversarial Drafting Engine

**Doctrine revision: 2026-07** — matches the July 2026 persona ecosystem; earlier engine copies are stale, replace on sight.

A collaborative drafting system for the blog and essays. The engine never
proposes your thesis. Its job is to **attack** the piece — and now, to take
your counter-punches.

| File | Where it runs | What it does |
|---|---|---|
| `index.html` | Browser / mobile Safari | Projects, intake, pressure tests, staged drafting, audits, export |
| `cli.js` | Claude Code / terminal | Same engine + Broadsheet `.docx` + metaphor history |
| chat export | A Claude conversation | Paste the brief for open-ended adversarial work |

`rules.js`, `engine.js`, `docx-export.js` are shared. Edit constraints once in
**`rules.js`**; every surface follows.

---

## Doctrine alignment (v3)

**Voice Profile System.** Profiles are declared per piece; Polemic is the
default and is the only profile carrying the presets (Standard / Cold Fury /
High Ridicule) and delivery stances (mock / dissect / narrate / instruct).
Analyst: zero irony, evidence-forward, verdicts under 15 words. Narrative:
scene-driven, thesis demonstrated, never stated. Craft Core (rhythm, passive
ceiling, paragraph limits, forbidden lists) never flexes in any profile.

**Framing Constant** is baked into every prompt: legitimacy is never debated
politely in any register — the stance varies the vehicle, never the whether.

**Profile-aware Voice Fidelity Audit.** Drift measures against the declared
profile's own markers (an Analyst piece is never flagged for restraint;
intensity is never a Polemic tell). Drift prescribes rewrite-in-profile, never
line patches; whole-piece mismatch returns a RE-DECLARATION QUESTION instead
of fixes. Opening/closing checks run the universal discipline first, then the
profile implementation. Deterministic linters now also catch 'freedom' as the
final noun, call-to-action closers, and summary-formula endings.

**The Auditor** (`node cli.js audit`, or its button in Audits): detect-only —
flags with P0/P1/P2 severity and refuses to rewrite; profile-calibrated
(intensity never a tell, restraint never a tell, emptiness is); detection list
is a superset of the production lists; stateless, so no rebuttal rounds.
**Delta** (`node cli.js delta old.md new.md`, or Delta vs Snapshot in the app)
classifies each prior flag FIXED / RE-SKINNED / UNTOUCHED and flags new tells.

**Session-start order** in the app now matches doctrine: profile → stance/
preset → mode → production mode (collaborative default; single-shot is an
explicit declaration that the angle is fully specified — collaborative mode
nudges you through the pressure passes before generating).

Metaphor register restrictions (modern 1980s+, four banned framings) now
travel with Polemic only; the metaphor budget and rhythm diagnostic stay
universal. Blog arc is universal (hook → development → landing) with each
profile implementing its own version.

## What's new in v2

**Staged long-essay drafting.** Long Essay mode no longer attempts a single
call (which physically cannot produce 10,000+ words). It runs your Phased
Drafting protocol: structure plan → five sections drafted individually (each
with the plan plus the tail of the prior section for rhythm continuity, opening
patterns enforced on section 1, inversion/receipt enforced on section 5) →
an integration **seam report** listing every joint that needs hand-smoothing.
The CLI checkpoints each section to disk; the web app snapshots after each.

**Verification Protocol.** A deterministic signature scan (in the linters)
flags fabrication tells — "approximately," "reportedly," "several," unnamed
attributions, "up to" figures, round-number clusters. The API pass then runs
your full protocol: claim inventory, T1–T4 tiering, auto-cut T4, and a
VERIFY BEFORE PUBLISHING block for unresolved T2/T3.

**Reply rounds.** Every pass is now an argument, not a verdict. In the app, a
rebuttal box appears under each output; in the CLI, `node cli.js reply "…"`
continues the last pass. The model presses the point or concedes to the
superior argument — never to social discomfort.

**Structure adjudication.** The Drift audit now classifies the opening against
your five legal patterns, the closing as inversion/receipt/neither, and runs
the title-portability test on every section title. Deterministic linters also
catch banned openings (rhetorical questions, "in today's world"), per-section
word counts in long-essay mode, and cross-check every actor in your brief
against the finished draft — listed actors missing from the piece get flagged.

**Streaming everywhere.** Tokens render as they generate, app and CLI both.

**Projects + snapshots.** The app holds named projects (each with its own
brief, draft, and title). Drafts snapshot automatically before any generate
or restore, plus manually — last 8 kept per project.

**Gauntlet.** All four pressure passes in sequence: button in the app,
`node cli.js gauntlet brief.json` in the terminal.

**Metaphor recurrence.** Extracts the metaphor list from a draft and compares
against your saved history (last 10 outputs); anything recurring above 40%
is marked RETIRE. Save outputs to history as you publish. App: localStorage.
CLI: `vv-metaphor-history.json`, with `--save`.

---

## Web app (and iPhone)

Host the folder (or open `index.html` directly), and on iPhone: Safari →
Share → **Add to Home Screen**. Tap **⚙ API**, paste your key (stored only in
the browser, sent straight to Anthropic). Default model is `claude-opus-4-8`.

Workflow: pick or create a **project** → fill the **Intake** (thesis first;
everything stays locked without it) → run the **Pressure** passes or the
Gauntlet, and argue back → **Draft** (long-essay mode stages automatically and
drops its seam report in Audits) → **Audits** (Specificity, Drift + Structure,
Verification, Metaphors, Seam Report) → **Export**.

The deterministic linters run offline with no key. The `.docx` button loads
the docx library from a CDN on first use; offline, the Broadsheet HTML export
opens in Pages and prints to PDF with the same styling.

## Claude Code CLI

```bash
npm install
export ANTHROPIC_API_KEY=sk-ant-...

node cli.js new brief.json
node cli.js gauntlet brief.json            # review + steelman + reductio + bridge
node cli.js reply "My thesis survives because…"
node cli.js draft brief.json --out draft.md   # longEssay mode auto-stages
node cli.js lint draft.md --brief brief.json  # offline; includes actor check
node cli.js verify draft.md                # Verification Protocol
node cli.js drift draft.md coldFury        # voice + opening/closing/titles
node cli.js metaphors draft.md --save      # recurrence vs history
node cli.js docx draft.md --title "Headline"
```

`--model <id>` overrides per call; `VV_MODEL` sets a standing override.
Long-essay drafts checkpoint to `--out` after every section, with the plan in
`*.plan.md` and the seam report in `*.seams.md`.

## The collaboration loop

The in-app reply rounds handle most argument. For open-ended work — exploring
an angle, hunting actors, restructuring after a kill — **Copy Chat-Ready
Brief** and bring it to a Claude conversation. The export instructs Claude to
leave the thesis alone and come at the piece as an adversary.

## Tuning

Everything is data in `rules.js`: word-count bands, voice presets, the
specificity floor, forbidden vocabulary and structures, banned titles, legal
openings/closings, kill criteria, fabrication-signal list (in `engine.js`,
`VERIFY_SIGNALS`), and Broadsheet colors.
