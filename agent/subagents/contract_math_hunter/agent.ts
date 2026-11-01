import { defineAgent } from "eve";
import { config } from "../../../src/config.js";
import { createNebiusModel } from "../../../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  description:
    "Hunts Solidity math, precision and economic bugs in an already-cloned contract repo: wrong rounding direction, mul-before-div truncation, decimal and WAD/RAY/BPS mismatches, first-depositor share inflation, oracle and slippage manipulation, fee-on-transfer and rebasing token mismatches, and ERC-4626 accounting gaps. Give it the sandbox box ID, the repo path, and the recon notes. It returns candidate findings with exact file:line evidence.",
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
});
