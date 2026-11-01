import type { EveAuthFn } from "eve/channels/eve";
import { eveChannel } from "eve/channels/eve";
import { bearerTokenMatches } from "../../src/api/handlers.js";
import { config } from "../../src/config.js";

const bearerAuth: EveAuthFn = (request) => {
  if (!config.hackclawdApiKey || !bearerTokenMatches(request, config.hackclawdApiKey)) {
    return null;
  }
  return {
    authenticator: "hackclawd-api-key",
    principalId: "hackclawd-api",
    principalType: "service",
    attributes: {},
  };
};

export default eveChannel({ auth: [bearerAuth] });
