import { defineAgent } from "eve";
import { config } from "../src/config.js";
import { createNebiusModel } from "../src/model.js";

const nebius = createNebiusModel(config);

export default defineAgent({
  model: nebius.model,
  modelContextWindowTokens: nebius.modelContextWindowTokens,
});
