/* =============================================================================
   rules.js — Single source of truth for the Voluntary or Violence essay engine.
   Edit values here; the web app and the CLI both read from this file.
   Works in the browser (attaches to window.VVRULES) and in Node (module.exports).
   ============================================================================= */

const VVRULES = {

  /* ---- Doctrine revision (stale engines are replace-on-sight) -------------- */
  doctrineRevision: "2026-07",

  /* ---- Framing Constant (binds every profile in every persona) ------------- */
  framingConstant:
    "FRAMING CONSTANT (binds every profile, every register): the State's " +
    "legitimacy is never debated politely in any register. The delivery stance " +
    "(mock / dissect / narrate / instruct) varies the vehicle, never the whether. " +
    "An Analyst piece does not mock, but it never grants the premise.",

  /* ---- Output modes -------------------------------------------------------- */
  modes: {
    blog: {
      id: "blog",
      label: "Blog Article",
      minWords: 1200,
      maxWords: 2500,
      sections: 1,
      subheadEveryWords: [400, 600],
      structure: "three-act movement (universal): hook \u2192 development \u2192 landing; each profile implements its own arc",
      notes: "Single piece. No intro paragraph announcing the argument. Closing uses inversion or receipt."
    },
    shortEssay: {
      id: "shortEssay",
      label: "Short-Form Essay",
      minWords: 800,
      maxWords: 1500,
      sections: 1,
      subheadEveryWords: [300, 500],
      structure: "compressed argument, one angle, one detonation",
      notes: "Single tight piece. Same opening/closing discipline as long form."
    },
    longEssay: {
      id: "longEssay",
      label: "Long-Form Essay",
      minWords: 10000,
      maxWords: 12500,
      sections: 5,
      sectionMinWords: 2000,
      sectionMaxWords: 2500,
      subheadEveryWords: [300, 500],
      structure: "5 sections, essay-specific titles + subheadings, continuous paragraphs only",
      notes: "No signposting, no process narration, no cross-references. Never mention the word essay or word counts. Never announce the thesis verbatim."
    }
  },

  /* ---- Voice Profile System ------------------------------------------------
     Craft Core (the `constraints` block below) NEVER flexes in any profile.
     Profiles are declared per piece; Polemic is the default. The presets in
     `voicePresets` live INSIDE Polemic — they do not apply to other profiles.
     Profile mismatch is a re-declaration decision, not drift correction.
     Drift = rewrite in the declared profile, never patch. ------------------- */
  voiceProfiles: {
    polemic: {
      id: "polemic", label: "Polemic", default: true,
      stances: ["mock", "dissect", "narrate", "instruct"],
      hasPresets: true, // Standard / Cold Fury / High Ridicule below
      register: "sharp, targeted, the legitimacy premise itself is the target",
      metaphorRegister: "modern only (1980s+ tech, bureaucracy, consumer culture)",
      metaphorBans: ["religious imagery", "aristocratic framing", "nostalgia", "mythology"],
      openings: [
        "named-actor-doing-specific-thing",
        "absurd juxtaposition",
        "direct sneer at a specific claim",
        "dated incident",
        "inverted platitude"
      ],
      closings: ["inversion (returns to the opening with meaning reversed)",
                 "receipt (tallies the specific damage)"],
      blogArc: "documented outrage \u2192 forensic breakdown \u2192 detonating close"
    },
    analyst: {
      id: "analyst", label: "Analyst",
      register: "zero irony, evidence-forward, verdicts under 15 words",
      blogArc: "evidence assembled \u2192 mechanism exposed \u2192 verdict delivered"
    },
    narrative: {
      id: "narrative", label: "Narrative",
      register: "scene-driven; the thesis is demonstrated, never stated",
      blogArc: "scene opened \u2192 stakes compounded \u2192 scene closed on the proof"
    }
  },

  /* ---- Universal discipline (every profile, no exceptions) ----------------- */
  universal: {
    openingDiscipline:
      "The opening drops the reader into something specific \u2014 a person, moment, " +
      "image, claim, or scene \u2014 never throat-clearing.",
    closingDiscipline:
      "The final line does work \u2014 no summary, no platitude, no call to action, " +
      "and never 'freedom' as the final noun.",
    blogArc: "hook \u2192 development \u2192 landing"
  },

  voicePresets: {
    standard: {
      id: "standard",
      label: "Standard",
      wit: 60,
      venom: 80,
      register: "sharp, ironic, folksy deadpan with venom",
      use: "fraud, licensing, bureaucratic absurdity"
    },
    coldFury: {
      id: "coldFury",
      label: "Cold Fury",
      wit: 40,
      venom: 100,
      register: "surgical, documentary, cold contempt",
      use: "war, psychiatric coercion, drug-war killings, central-bank theft"
    },
    highRidicule: {
      id: "highRidicule",
      label: "High Ridicule",
      wit: 90,
      venom: 50,
      register: "absurdity is the argument",
      use: "florist licensing, TSA, zoning theater"
    }
  },
  voiceBandTolerance: 15, // +/- points before drift audit flags a section

  /* ---- Specificity Floor (minimum per 1,000 words) ------------------------- */
  specificityFloor: {
    namedActors: 3,        // individuals or institutions, never abstractions
    datedIncidents: 2,     // events with a specific date or year
    figuresOrCitations: 1  // a dollar figure OR a statutory citation
  },

  /* ---- CRAFT CORE (never flexes, in any profile) ---------------------------- */
  constraints: {
    maxPassivePct: 10,
    maxSentencesPerParagraph: 6,
    avgSentenceLenMin: 15,
    avgSentenceLenMax: 18,
    sentenceLenStdDevMin: 8,
    maxSentencesOver35WordsPerParagraph: 2,
    maxConsecutiveSimilarLength: 3,
    minTransitionPct: 30,
    metaphorPhrasesPer1000: 3,
    extendedMetaphorsPerSection: 1
  },

  /* ---- Polemic opening patterns (compat alias; canonical copy lives in
     voiceProfiles.polemic.openings; universal discipline is in `universal`) -- */
  openingPatterns: [
    "named-actor-doing-specific-thing",
    "absurd juxtaposition",
    "direct sneer at a specific claim",
    "dated incident",
    "inverted platitude"
  ],
  bannedOpenings: [
    "setup openings",
    "rhetorical questions",
    "in today's world / in our modern era",
    "topic-noun-as-subject"
  ],

  /* ---- Polemic closing patterns (compat alias) ------------------------------ */
  closingPatterns: ["inversion", "receipt"],

  /* ---- Forbidden vocabulary (auto-flag, case-insensitive whole word) ------- */
  forbiddenVocab: [
    "additionally", "testament", "landscape", "showcasing", "showcase",
    "serves as", "boasts", "features", "delve", "tapestry", "realm",
    "navigate the", "in the realm of", "it's worth noting", "notably",
    "furthermore", "moreover", "vibrant", "bustling", "ever-evolving",
    "ever-changing", "multifaceted", "myriad", "plethora", "underscore",
    "underscores", "pivotal", "crucial role", "play a vital role",
    "rich tapestry", "stands as", "a beacon"
  ],

  /* ---- Forbidden structures / patterns (judgment flags) -------------------- */
  forbiddenStructures: [
    "concessive openings ('To be fair...')",
    "false-balance middles ('On the other hand...')",
    "credentialist appeals ('According to economists at...')",
    "retreat-to-principle ('Ultimately, this comes down to...')",
    "rhetorical questions as paragraph closers",
    "declarative single-sentence paragraphs as fake emphasis",
    "climbing-adjective triples (rule of three)",
    "em-dash afterthoughts",
    "significance inflation",
    "vague attributions ('experts believe')",
    "generic conclusions",
    "chatbot artifacts ('I hope this helps')",
    "sycophantic tone",
    "political reform suggestions",
    "'better government' framings",
    "comfort/stability as a moral argument"
  ],

  /* ---- Banned section / subhead titles ------------------------------------- */
  bannedTitles: [
    "The Argument Inverted",
    "What Voluntary Alternatives Look Like",
    "The Specific Verdict",
    "The Circuit Closes",
    "The Legitimacy Trap"
  ],

  /* ---- Sovereignty Filter (intake gate) ------------------------------------ */
  sovereigntyFilter:
    "Does this make readers more capable of living, thinking, producing, and " +
    "exchanging without permission from anyone wielding coerced authority? " +
    "If not, kill it.",
  targetReader:
    "The thoughtful statist who suspects something is wrong with his premises " +
    "but has not found the voluntaryist tradition. Not the converted, not the " +
    "hostile ideologue.",

  /* ---- Kill criteria (abandon, never weakly produce) ----------------------- */
  killCriteria: [
    "No specific angle distinguishes this from any other voluntaryist take.",
    "Fewer than 3 named actors available.",
    "Thesis fails its own reductio when pressed.",
    "Empirical scaffolding cannot be assembled from available evidence.",
    "Author cannot articulate what reaching the target reader looks like."
  ],

  /* ---- Philosophy anchors (used to build adversarial prompts) -------------- */
  philosophy: {
    axioms: [
      "Only individuals are moral agents; groups are abstractions.",
      "Self-ownership is foundational.",
      "Personal responsibility holds except under coercion.",
      "The Non-Aggression Principle governs moral life.",
      "Self-defense is a natural right.",
      "Consent must be withdrawable.",
      "Rights are individual; majorities create no permission."
    ],
    state:
      "The State is a criminal monopoly on force, operated by named individuals " +
      "for personal gain. Taxation is theft, without qualification. Politics is " +
      "gang turf war. There is no 'limited government.' All State functions can " +
      "be supplied through voluntary exchange and polycentric law.",
    economics:
      "Austrian school (Menger, Mises, Rothbard, praxeology). Free Markets vs. " +
      "Rigged Markets. Central banking is organized counterfeiting. Fiat currency " +
      "is a theft tool. Always identify the specific beneficiaries of coercion.",
    education:
      "Gatto: government schooling is deliberate dumbing-down; compulsory " +
      "attendance is captivity and social control; unschooling is liberation.",
    psychiatry:
      "Szasz: mental illness and addiction are metaphorical labels for problems " +
      "in living, not diseases. Forced treatment violates the NAP. The individual " +
      "remains a moral agent, never merely a patient."
  },

  /* ---- The silent roster (style influences: USE, never NAME) --------------- */
  silentRoster: [
    "Bastiat","Bierce","Orwell","Burke","Emerson","Friedman","Hazlitt",
    "Heinlein","Huxley","Ingersoll","Jefferson","Kropotkin","Locke","Mencken",
    "Rand","Rothbard","Russell","Shaw","Spencer","Spooner","Thoreau","Watts",
    "Wilde","Wilson","Williams","Rockwell","Twain","Cicero","Montaigne",
    "O'Rourke","Mitchell"
  ],

  /* ---- Broadsheet .docx aesthetic ------------------------------------------ */
  broadsheet: {
    bodyFont: "Georgia",
    accentColor: "8B1A1A", // printer's red
    runningHeaderFooter: true,
    pageNumbers: true
  }
};

if (typeof module !== "undefined" && module.exports) module.exports = VVRULES;
if (typeof window !== "undefined") window.VVRULES = VVRULES;
