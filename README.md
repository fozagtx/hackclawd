# hackclawd

hackclawd is a TypeScript security-research agent for Slack rooms connected through Switch. It receives an authorized program and scope, asks the Nebius model to investigate, runs requested proof-of-concept code in an Upstash Box, and returns progress and a report to the originating room. Reports remain candidates until a human confirms a finding through the API.

## Quick start (Mac or Linux)

You need [Node.js 24+](https://nodejs.org) and [Docker Desktop](https://www.docker.com/products/docker-desktop/) (open it so it's running).

1. Get the code:

   ```sh
   git clone https://github.com/fozagtx/hackclawd && cd hackclawd && npm ci && cp .env.example .env
   ```

2. Open `.env` in any editor and paste your keys after the `=` (no quotes, no spaces):

   ```sh
   NEBIUS_API_KEY=your-nebius-key          # required: tokenfactory.nebius.com → API keys
   UPSTASH_BOX_API_KEY=your-box-key        # for PoCs: console.upstash.com → Box → API Keys
   SLACK_BOT_TOKEN=xoxb-...                # optional, Slack: api.slack.com/apps → Hackclawd → Install App
   SLACK_APP_TOKEN=xapp-...                # optional, Slack: Basic Information → App-Level Tokens (connections:write)
   ```

   Leave everything else empty. `HACKCLAWD_API_KEY` and all `SWITCH_*` values are filled in for you on the first run.

3. Start everything (a local Switch server in Docker, then hackclawd):

   ```sh
   npm run local
   ```

   The first run downloads the Switch images, which takes a few minutes. Keep this terminal open.

4. In a second terminal, check it's up. Every value should be `true` (`upstashBox` is `false` until you add that key):

   ```sh
   curl http://localhost:3000/api/health
   ```

5. Start an audit from the terminal:

   ```sh
   export API_KEY=$(grep ^HACKCLAWD_API_KEY= .env | cut -d= -f2)
   curl -X POST http://localhost:3000/api/audits \
     -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
     -d '{"program":"Audit https://github.com/OWNER/REPO. In scope: the whole repo. I am authorized to test it."}'
   ```

6. Read the reports:

   ```sh
   curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/reports
   ```

7. Use it from Slack: after adding the two Slack tokens to `.env`, stop step 3 with Ctrl+C and run `npm run local` again. It should print `Connected Slack workspace "..." to Switch`. Then in a Slack channel run `/invite @Hackclawd`, then `/invite-agent @hackclawd`, and post `@hackclawd` followed by the program details.

To change a key later, edit `.env` and rerun `npm run local`. Never commit `.env`; it's already in `.gitignore`. To stop the local Switch server, run `docker compose -p hackclawd-switch down`.


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

| Variable                  | Where to get it                                                                       | Required?                                                 |
| ------------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| `NEBIUS_API_KEY`          | Nebius Token Factory                                                                  | Required for model calls                                  |
| `NEBIUS_BASE_URL`         | Override only; defaults to `https://api.tokenfactory.nebius.com/v1`                   | No                                                        |
| `NEBIUS_MODEL`            | Override only; defaults to `moonshotai/Kimi-K2.7-Code`                                | No                                                        |
| `UPSTASH_BOX_API_KEY`     | Upstash Console                                                                       | Required to run PoC commands                              |
| `HACKCLAWD_API_KEY`       | Generate a private bearer secret                                                      | Required for API/eve authentication and the Switch bridge |
| `SWITCH_URL`              | Your Switch server base URL (not its gateway URL)                                     | Required only to connect Switch                           |
| `SWITCH_AGENT_ID`         | Output of `npm run switch:register`, or your existing agent                           | Required only to connect Switch                           |
| `SWITCH_AGENT_API_KEY`    | Printed once by registration, or your existing agent key                              | Required only to connect Switch                           |
| `SWITCH_REGISTRATION_KEY` | Switch server registration credentials                                                | Only needed when registering                              |
| `SLACK_BOT_TOKEN`         | Slack app → Install App → Bot User OAuth Token (`xoxb-`)                              | Only for `npm run local` to connect Slack                 |
| `SLACK_APP_TOKEN`         | Slack app → Basic Information → App-Level Tokens, scope `connections:write` (`xapp-`) | Only for `npm run local` to connect Slack                 |
| `HACKCLAWD_DATA_DIR`      | Writable persistent directory; defaults to `.data`                                    | No                                                        |
| `PORT`                    | Set by the host; defaults to `3000`                                                   | No                                                        |
| `RENDER_EXTERNAL_URL`     | Supplied by Render at runtime                                                         | No                                                        |
| `WORKFLOW_LOCAL_BASE_URL` | Public callback-origin override; takes precedence over `RENDER_EXTERNAL_URL`          | No                                                        |

`SWITCH_URL`, `SWITCH_AGENT_ID`, and `SWITCH_AGENT_API_KEY` must be configured together. The bridge also requires `HACKCLAWD_API_KEY`. Without Switch configured, the service starts without attempting a Switch connection.

## Sandbox safety

Every new Box uses a custom egress policy. The default allowlist is:

- `registry.npmjs.org`, `registry.yarnpkg.com`, `pypi.org`, `files.pythonhosted.org`
- `proxy.golang.org`, `sum.golang.org`
- `crates.io`, `index.crates.io`, `static.crates.io`
- `rubygems.org`
- `github.com`, `codeload.github.com`, `objects.githubusercontent.com`,
  `raw.githubusercontent.com`, `gitlab.com`

Set `HACKCLAWD_SANDBOX_ALLOWED_DOMAINS` only as an operator to add comma-separated
bare hostnames, such as a private Git host. Leave it unset to use only the defaults.
It is intentionally omitted from `render.yaml`; configure it only when an operator
has reviewed the additional destinations. The model cannot change the allowlist.
Run proof-of-concept code against local copies in the sandbox; live targets are
unreachable from Box network egress.

## Local setup

The [quick start](#quick-start-mac-or-linux) runs a private Switch server in Docker (`local/switch/docker-compose.yml`, API on `http://localhost:8000`) and writes its generated secrets to `local/switch/.env`, which is git-ignored. `npm run local` registers the agent, opens its addressing to anyone in the room, connects Slack when `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN` are set, then builds and starts hackclawd.

To use a Switch server you already run instead, register the agent once:

```sh
SWITCH_URL=https://switch.example \
SWITCH_REGISTRATION_KEY=your-registration-key \
npm run switch:register
```

It prints `SWITCH_AGENT_ID` and `SWITCH_AGENT_API_KEY` once. Put them and `SWITCH_URL` in `.env`, then run `npm start`. Add `--overwrite` to replace an existing agent with the same name.

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
