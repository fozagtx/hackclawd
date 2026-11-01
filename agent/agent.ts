import { defineAgent } from "eve";
import { config } from "../src/config.js";
import { createNebiusModel } from "../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
  // Hackclawd runs unattended on one durable per-channel session, so Eve's
  // default sessionUsage cap would pause a turn on a human continuation prompt
  // that no one answers, silently stalling an audit mid-run. Leave it uncapped;
  // spend is bounded by the Nebius account.
  limits: { sessionUsage: false },
});
