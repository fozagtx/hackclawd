import { randomUUID } from "node:crypto";
import { z } from "zod";

const registrationSchema = z.object({
  id: z.string().min(1),
  api_key: z.string().min(1),
});

export class SwitchRegistrationConflictError extends Error {
  constructor() {
    super("A Switch agent named hackclawd already exists. Re-run with --overwrite to replace it.");
    this.name = "SwitchRegistrationConflictError";
  }
}

export async function registerSwitchAgent(options: {
  baseUrl: string;
  registrationKey: string;
  overwrite?: boolean;
  connectionId?: string;
  fetchImpl?: typeof fetch;
}): Promise<{ id: string; apiKey: string }> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const registration = await fetchImpl(new URL("/agents", options.baseUrl), {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.registrationKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "hackclawd",
      description: "Security assessment agent for authorized vulnerability research.",
      connector_type: "eve",
      integration_profile: {
        connection_model: "always_on",
        message_exchange: true,
        pre_invocation_mediation: [],
        post_invocation_mediation: [],
        event_reporting: [],
      },
      ...(options.overwrite ? { overwrite: true } : {}),
    }),
  });

  if (registration.status === 409) throw new SwitchRegistrationConflictError();
  if (!registration.ok)
    throw new Error(`Switch registration failed with HTTP ${registration.status}.`);

  const registered = registrationSchema.parse(await registration.json());
  const connectionId = options.connectionId ?? randomUUID();
  const update = await fetchImpl(
    new URL(
      `/agents/${encodeURIComponent(registered.id)}/ops/update_agent_detail`,
      options.baseUrl,
    ),
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${registered.api_key}`,
        "content-type": "application/json",
        "x-switch-connection-id": connectionId,
      },
      body: JSON.stringify({
        agent_id: registered.id,
        addressing: "anyone",
      }),
    },
  );
  if (!update.ok) throw new Error(`Switch addressing update failed with HTTP ${update.status}.`);
  return { id: registered.id, apiKey: registered.api_key };
}
