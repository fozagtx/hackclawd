import { defineAgent } from "eve";
import { config } from "../../../src/config.js";
import { createNebiusModel } from "../../../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  description:
    "Independent skeptic that tries to reject candidate findings before they reach a report. Give it the sandbox box ID, the repo path, and the candidate list from the hunt specialists. It re-reads the cited code and returns, for each candidate, keep or reject with a one-line reason, plus a merged and deduplicated survivor list.",
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
});
