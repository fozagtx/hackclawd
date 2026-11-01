import { defineAgent } from "eve";
import { config } from "../../../src/config.js";
import { createNebiusModel } from "../../../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  description:
    "Hunts Solidity state and authority bugs in an already-cloned contract repo: missing or bypassable access control, privilege escalation, initialize/front-run, proxy and storage-slot collisions, unpaired accounting between mint/burn and deposit/withdraw, privileged economic extraction, and broken conservation invariants. Give it the sandbox box ID, the repo path, and the recon notes. It returns candidate findings with exact file:line evidence.",
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
});
