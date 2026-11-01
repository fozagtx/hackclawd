import { config } from "../src/config.js";
import { registerSwitchAgent } from "../src/switch/register.js";

async function main(): Promise<void> {
  if (!config.switchUrl) {
    throw new Error("SWITCH_URL is required to register the agent.");
  }
  if (!config.switchRegistrationKey) {
    throw new Error("SWITCH_REGISTRATION_KEY is required to register the agent.");
  }

  const result = await registerSwitchAgent({
    baseUrl: config.switchUrl,
    registrationKey: config.switchRegistrationKey,
    overwrite: process.argv.includes("--overwrite"),
  });

  console.log(`SWITCH_AGENT_ID=${result.id}`);
  console.log(`SWITCH_AGENT_API_KEY=${result.apiKey}`);
  console.log("Save these values as Render secrets; the API key is shown only once.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Switch registration failed.");
  process.exitCode = 1;
});
