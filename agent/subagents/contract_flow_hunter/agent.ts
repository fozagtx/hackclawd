import { defineAgent } from "eve";
import { config } from "../../../src/config.js";
import { createNebiusModel } from "../../../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  description:
    "Hunts Solidity execution-flow bugs in an already-cloned contract repo: reentrancy and callback re-entry, stale reads after external calls, mismatched claimed vs sent amounts, encoding mismatches, bridge replay and stuck funds, unvalidated library and helper inputs, gas griefing, and broken implicit assumptions. Give it the sandbox box ID, the repo path, and the recon notes. It returns candidate findings with exact file:line evidence.",
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
});
