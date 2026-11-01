import { config } from "../src/config.js";
import { prepareWorkflowStorage } from "../src/persistence.js";
import { startServices } from "../src/startup.js";

let services: ReturnType<typeof startServices> | undefined;
let pendingSignal: NodeJS.Signals | undefined;
const stop = (signal: NodeJS.Signals) => {
  if (services) services.stop(signal);
  else pendingSignal = signal;
};
process.once("SIGTERM", stop);
process.once("SIGINT", stop);

async function main(): Promise<void> {
  await prepareWorkflowStorage(config.dataDir);
  services = startServices(config);
  if (pendingSignal) services.stop(pendingSignal);
  const code = await services.completion;
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
  process.exitCode = code;
}

void main().catch((error: unknown) => {
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
  console.error(error instanceof Error ? error.message : "Service startup failed.");
  process.exitCode = 1;
});
