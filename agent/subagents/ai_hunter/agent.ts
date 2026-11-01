import { defineAgent } from "eve";
import { config } from "../../../src/config.js";
import { createNebiusModel } from "../../../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  description:
    "Hunts AI and agent application vulnerabilities in an already-cloned source tree: indirect prompt injection through RAG and tool content, cross-tenant context bleed, durable memory poisoning, model-produced tool arguments reaching SQL/shell/file/API sinks, confused-deputy and excessive agency, MCP and delegation trust confusion, and unencoded model output reaching sinks. Give it the sandbox box ID, the repo path, and the recon notes. It returns candidate findings with exact file:line evidence.",
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
});
