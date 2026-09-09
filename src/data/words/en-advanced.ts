import type { Corpus } from "../types";

/**
 * Longer, lower-frequency English words.
 *
 * These are where bigram weaknesses actually surface -- awkward rolls and
 * hand alternations that short common words never demand. Used for later
 * Onslaught waves and for players who want a harder Sprint.
 */
const corpus: Corpus = {
  id: "en-advanced",
  label: "English \u00b7 advanced",
  kind: "words",
  language: "en",
  wpmUnit: "chars5",
  source: {
    name: "Public-domain English frequency lists",
    license: "CC0-1.0",
  },
  words: [
  "abstract", "accuracy", "adjacent", "algorithm", "ambiguous", "analysis", "appropriate", "architecture", "assessment", "assumption",
  "asymmetric", "authentic", "background", "bandwidth", "benchmark", "boundary", "calibrate", "capacity", "catalyst", "certificate",
  "challenge", "characteristic", "coefficient", "cognitive", "coherent", "collaborate", "commodity", "comparison", "compatible", "compelling",
  "complexity", "component", "comprehensive", "concurrent", "configuration", "consequence", "consistent", "constraint", "contemporary", "continuous",
  "contribute", "conventional", "convergence", "correlation", "credential", "criterion", "cumulative", "curriculum", "deliberate", "demonstrate",
  "dependency", "deployment", "derivative", "deterministic", "diagnostic", "dimension", "discrete", "distinguish", "distribute", "documentation",
  "efficiency", "elaborate", "elementary", "eliminate", "emphasize", "empirical", "encapsulate", "encounter", "enterprise", "environment",
  "equilibrium", "equivalent", "essential", "establish", "evaluate", "eventually", "evidence", "exceptional", "exclusive", "executable",
  "expedite", "experiment", "explicit", "exponential", "extensive", "facilitate", "fluctuate", "framework", "frequency", "fundamental",
  "generate", "granular", "guarantee", "heuristic", "hierarchy", "hypothesis", "identical", "illustrate", "immediate", "implement",
  "implication", "incentive", "incremental", "independent", "indicator", "individual", "inevitable", "infrastructure", "inherent", "initiative",
  "innovation", "instrument", "integrate", "intelligence", "interpretation", "intersection", "intervention", "intrinsic", "intuitive", "invariant",
  "iterative", "jurisdiction", "justification", "legitimate", "leverage", "magnitude", "maintenance", "manipulate", "mechanism", "methodology",
  "migration", "momentum", "negotiate", "normalize", "notification", "objective", "observation", "occurrence", "operational", "opportunity",
  "optimization", "orchestrate", "orientation", "paradigm", "parallel", "parameter", "particular", "perception", "performance", "peripheral",
  "permanent", "perpetual", "persistent", "perspective", "phenomenon", "philosophy", "plausible", "portfolio", "precedent", "precision",
  "predominant", "preliminary", "prerequisite", "prevalence", "probability", "proficiency", "projection", "proportional", "prospective", "provision",
  "publication", "qualitative", "quantitative", "rationale", "reciprocal", "recognition", "reconciliation", "redundant", "reference", "reinforce",
  "reliability", "remarkable", "representative", "requirement", "resilient", "resolution", "resonance", "restriction", "retrospective", "revolution",
  "rigorous", "satisfaction", "saturation", "significant", "simulation", "simultaneous", "specification", "spectrum", "spontaneous", "stabilize",
  "statistical", "strategic", "subsequent", "substantial", "sufficient", "superficial", "supplementary", "surveillance", "susceptible", "sustainable",
  "symmetrical", "synchronize", "synthesis", "systematic", "tangible", "technique", "temporary", "terminology", "theoretical", "threshold",
  "trajectory", "transaction", "transformation", "transition", "transparent", "turbulence", "ubiquitous", "unanimous", "uncertainty", "underlying",
  "undertake", "uniform", "unprecedented", "validation", "variable", "verification", "versatile", "vulnerability", "whereas", "widespread",
  "workflow",
  ],
};

export default corpus;
