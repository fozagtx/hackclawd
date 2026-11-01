import { defineAgent } from "eve";
import { config } from "../../../src/config.js";
import { createNebiusModel } from "../../../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  description:
    "Hunts web2 application vulnerabilities in an already-cloned source tree: broken access control and IDOR, injection into SQL/template/command/file sinks, SSRF and request smuggling, business-logic and race conditions, crypto and secret misuse, client-side injection, and supply-chain gaps. Give it the sandbox box ID, the repo path, and the recon notes. It returns candidate findings with exact file:line evidence.",
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
});
