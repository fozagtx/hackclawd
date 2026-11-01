# hackclawd

hackclawd is a TypeScript security-research agent for Slack rooms connected through Switch. It receives an authorized program and scope, asks the Nebius model to investigate, runs requested proof-of-concept code in an Upstash Box, and returns progress and a report to the originating room. Reports remain candidates until a human confirms a finding through the API.

## Architecture

1. A researcher addresses the Switch agent in a Slack-connected room with program details.
2. The Switch connection forwards addressed messages to an eve session, keyed by room and optional thread.
3. eve uses the authored `secgin` skill and Nebius model; its sandbox tools execute code only in Upstash Box.
4. The report tool stores Markdown and findings under `HACKCLAWD_DATA_DIR/reports`.
5. Completed text and progress are posted to the same Switch room. The HTTP API provides audit submission, report retrieval, and human-only finding confirmation.

The HTTP API and eve routes use bearer authentication. `/api/health` is public and reports integration readiness as booleans. The app uses eve's local workflow store on disk and does not require `DATABASE_URL` or a database service. The Render startup script keeps both report/connection data and eve workflow data on the service disk.

## Requirements

- Node.js 24 or newer
- A Nebius Token Factory API key
- An Upstash Box API key for proof-of-concept execution
- A Switch server and an agent registration/API key to connect Slack

## Environment

Copy `.env.example` to `.env` for local development. Values are read centrally by `src/config.ts`. The model defaults are public constants in the code; leave their overrides unset to use those defaults.

| Variable                  | Where to get it                                                              | Required?                                                 |
| ------------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `NEBIUS_API_KEY`          | Nebius Token Factory                                                         | Required for model calls                                  |
| `NEBIUS_BASE_URL`         | Override only; defaults to `https://api.tokenfactory.nebius.com/v1`          | No                                                        |
| `NEBIUS_MODEL`            | Override only; defaults to `moonshotai/Kimi-K2.7-Code`                       | No                                                        |
| `UPSTASH_BOX_API_KEY`     | Upstash Console                                                              | Required to run PoC commands                              |
| `HACKCLAWD_API_KEY`       | Generate a private bearer secret                                             | Required for API/eve authentication and the Switch bridge |
| `SWITCH_URL`              | Your Switch server base URL (not its gateway URL)                            | Required only to connect Switch                           |
| `SWITCH_AGENT_ID`         | Output of `npm run switch:register`, or your existing agent                  | Required only to connect Switch                           |
| `SWITCH_AGENT_API_KEY`    | Printed once by registration, or your existing agent key                     | Required only to connect Switch                           |
| `SWITCH_REGISTRATION_KEY` | Switch server registration credentials                                       | Only needed when registering                              |
| `HACKCLAWD_DATA_DIR`      | Writable persistent directory; defaults to `.data`                           | No                                                        |
| `PORT`                    | Set by the host; defaults to `3000`                                          | No                                                        |
| `RENDER_EXTERNAL_URL`     | Supplied by Render at runtime                                                | No                                                        |
| `WORKFLOW_LOCAL_BASE_URL` | Public callback-origin override; takes precedence over `RENDER_EXTERNAL_URL` | No                                                        |

`SWITCH_URL`, `SWITCH_AGENT_ID`, and `SWITCH_AGENT_API_KEY` must be configured together. The bridge also requires `HACKCLAWD_API_KEY`. Without Switch configured, the service starts without attempting a Switch connection.

## Local setup

1. Install Node.js 24+, then install dependencies:

   ```sh
   npm ci
   ```

2. Create a Nebius API key in Token Factory and set `NEBIUS_API_KEY`.
3. Create an Upstash Box API key and set `UPSTASH_BOX_API_KEY`.
4. Generate a long random value for `HACKCLAWD_API_KEY`.
5. Configure a Switch server with its Slack connector. In Switch, provide the Slack bot/app credentials (`xoxb-…`, `xapp-…`) and the Slack workspace ID (`T…`) required by that connector.
6. Register the agent once from a trusted shell:

   ```sh
   SWITCH_URL=https://switch.example \
   SWITCH_REGISTRATION_KEY=your-registration-key \
   npm run switch:register
   ```

   The command prints `SWITCH_AGENT_ID` and `SWITCH_AGENT_API_KEY` once. Save both in your secret store. If the name already exists and you intend to replace it, rerun with `--overwrite`.
7. Set `SWITCH_URL`, `SWITCH_AGENT_ID`, and `SWITCH_AGENT_API_KEY` alongside the other values in `.env`.
8. Start the service:

   ```sh
   npm start
   ```

   For development, use `npm run dev`. The service does not need `DATABASE_URL`.

Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before deployment. `npm run test:integration` runs the opt-in Upstash Box integration test; without `UPSTASH_BOX_API_KEY`, it is skipped.

## Render deployment

Create a Render Blueprint from `render.yaml`. Add the Nebius, Upstash Box, Hackclawd API, and Switch values as secret environment variables. The starter web service runs continuously for the Switch WebSocket connection. Its persistent disk is mounted at `/var/data`; `HACKCLAWD_DATA_DIR` points there, and startup links eve's `.eve/.workflow-data` directory onto the same disk. No database is declared or required.

The service exposes `/api/health` for Render's health check. Keep the service on one instance when using eve's local workflow store; use a shared workflow-world implementation before scaling to multiple instances. If deploying behind a proxy, forward both `/eve/` and `/.well-known/workflow/` without path rewriting.

## HTTP API

Set `API_KEY` in the shell to the same value as `HACKCLAWD_API_KEY`.

Health is public:

```sh
curl https://your-service.example.com/api/health
```

Submit an audit; the optional `Idempotency-Key` is forwarded to eve:

```sh
curl -X POST https://your-service.example.com/api/audits \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: audit-123" \
  -d '{"program":"Example program","scope":{"targets":["https://authorized.example"]}}'
```

List reports or fetch one as Markdown:

```sh
curl -H "Authorization: Bearer $API_KEY" \
  https://your-service.example.com/api/reports

curl -H "Authorization: Bearer $API_KEY" \
  -H "Accept: text/markdown" \
  https://your-service.example.com/api/reports/REPORT_ID
```

An authorized human can confirm a finding:

```sh
curl -X POST \
  -H "Authorization: Bearer $API_KEY" \
  https://your-service.example.com/api/reports/REPORT_ID/findings/FINDING_ID/confirm
```

The eve session API is available under `/eve/v1` and uses the same bearer key. Do not expose the service or its API key to untrusted users.
