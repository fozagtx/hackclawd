# hackclawd

**A Slack bug-bounty agent: paste an authorized program, get back a report with a proof of concept and reproduction steps.**

|                                                                                                                                                                                                                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [How it works](#how-it-works) · [Requirements](#requirements) · [Quickstart](#quickstart) · [Slack](#slack) · [HTTP API](#http-api) · [Configuration](#configuration) · [Sandbox](#sandbox) · [Render](#render) · [Data layout](#data-layout) · [Tests](#tests) · [Repository layout](#repository-layout) |

## How it works

```
Slack ──► Switch room ──► eve agent ──► secgin skill ──► Upstash Box PoC ──► report back in Slack
                          │              │                │
                          Nebius model   recon, hunt,     egress limited to
                                         validate, report package registries + git
```

1. **Ask**: mention `@hackclawd` in a Slack channel with the program, scope, and your authorization.
2. **Route**: Switch forwards the message to an eve session, one per room and thread.
3. **Hunt**: the `secgin` skill drives recon, specialist hunts across web2, Solidity, and AI surfaces, then skeptical validation.
4. **Prove**: proof-of-concept code runs only in an Upstash Box against local copies, never against live targets.
5. **Report**: progress and the final report (PoC, evidence, reproduction steps) go back to the same room.
6. **Confirm**: findings stay candidates until a human confirms them through the HTTP API.

## Requirements

- **Node.js 24+**
- **Docker Desktop**, running (for the local Switch server)
- **Nebius Token Factory API key**
- **Upstash Box API key**, to run PoCs
- **Slack app tokens** (`xoxb-`, `xapp-`), to use it from Slack

## Quickstart

```bash
git clone https://github.com/fozagtx/hackclawd && cd hackclawd && npm ci && cp .env.example .env
```

Open `.env` and paste your keys after the `=`:

```bash
NEBIUS_API_KEY=your-nebius-key     # tokenfactory.nebius.com → API keys
UPSTASH_BOX_API_KEY=your-box-key   # console.upstash.com → Box → API Keys
SLACK_BOT_TOKEN=xoxb-...           # api.slack.com/apps → Hackclawd → Install App
SLACK_APP_TOKEN=xapp-...           # Basic Information → App-Level Tokens (connections:write)
```

Leave everything else empty. Then start everything:

```bash
npm run local
```

This starts a private Switch server in Docker, registers the agent, connects Slack, and serves hackclawd on `http://localhost:3000`. The first run downloads the Switch images. Keep the terminal open.

Check it in a second terminal:

```bash
curl http://localhost:3000/api/health
```

To change a key, edit `.env` and rerun `npm run local`. Stop the Switch server with `docker compose -p hackclawd-switch down`.

## Slack

After `npm run local` prints `Connected Slack workspace "..." to Switch`:

```
/invite @Hackclawd
/invite-agent @hackclawd
@hackclawd Audit https://github.com/OWNER/REPO. In scope: the whole repo. I am authorized to test it.
```

## HTTP API

```bash
export API_KEY=$(grep ^HACKCLAWD_API_KEY= .env | cut -d= -f2)

# Start an audit
curl -X POST http://localhost:3000/api/audits \
  -H "Authorization: Bearer $API_KEY" -H "Content-Type: application/json" \
  -d '{"program":"Audit https://github.com/OWNER/REPO. In scope: the whole repo. I am authorized to test it."}'

# List reports, or fetch one as Markdown
curl -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/reports
curl -H "Authorization: Bearer $API_KEY" -H "Accept: text/markdown" http://localhost:3000/api/reports/REPORT_ID

# Confirm a finding (humans only)
curl -X POST -H "Authorization: Bearer $API_KEY" http://localhost:3000/api/reports/REPORT_ID/findings/FINDING_ID/confirm
```

`/api/health` is public. Everything else needs the bearer key. `POST /api/audits` accepts an optional `Idempotency-Key` header.

## Configuration

| Variable                                                | Purpose                                               |
| ------------------------------------------------------- | ----------------------------------------------------- |
| `NEBIUS_API_KEY`                                        | Required. Nebius model key.                           |
| `UPSTASH_BOX_API_KEY`                                   | Runs PoCs in Upstash Box.                             |
| `SLACK_BOT_TOKEN`, `SLACK_APP_TOKEN`                    | Slack tokens `npm run local` hands to Switch.         |
| `HACKCLAWD_API_KEY`                                     | API password. Generated on the first `npm run local`. |
| `SWITCH_URL`, `SWITCH_AGENT_ID`, `SWITCH_AGENT_API_KEY` | Switch connection. Filled in by `npm run local`.      |

Optional overrides: `NEBIUS_MODEL` (default `moonshotai/Kimi-K2.7-Code`), `NEBIUS_BASE_URL`, `HACKCLAWD_DATA_DIR` (default `.data`), `HACKCLAWD_SANDBOX_ALLOWED_DOMAINS`, `PORT`.

Using your own Switch server instead of the local one: set `SWITCH_URL` and `SWITCH_REGISTRATION_KEY`, run `npm run switch:register`, put the printed `SWITCH_AGENT_ID` and `SWITCH_AGENT_API_KEY` in `.env`, then `npm start`.

## Sandbox

- Every Box starts with a custom egress policy: package registries (npm, PyPI, Go, crates, RubyGems) and GitHub/GitLab only.
- Live targets are unreachable, and there is no fallback to open networking.
- `HACKCLAWD_SANDBOX_ALLOWED_DOMAINS` lets an operator add bare hostnames (for example a private git host). The model can't change it.

## Render

Create a Blueprint from `render.yaml` and add the keys as secret env vars. It is one Starter web service with a 1 GB disk at `/var/data` and no database. Render needs a Switch server reachable from the internet; a Switch running on your laptop won't work.

## Data layout

```
.data/
├── reports/<id>.json         # reports and findings
├── switch-connection.json    # Switch connection id and cursor
└── .eve/.workflow-data/      # eve sessions
local/switch/.env             # generated local Switch secrets (git-ignored)
```

## Tests

```bash
npm test                  # unit tests
npm run test:integration  # real Upstash Box run; skipped without UPSTASH_BOX_API_KEY
npm run typecheck && npm run lint && npm run build
```

## Repository layout

```
agent/                eve agent, instructions, channels (api, switch, eve), tools (sandbox_run, sandbox_close, submit_report)
agent/skills/secgin/  security workflow skill and its references
src/api/              HTTP handlers
src/switch/           Switch protocol, WebSocket client, bridge, registration, gateway
src/sandbox/          Upstash Box runner and egress policy
src/reports/          report store
scripts/              local, start, switch-register
local/switch/         Docker Compose for the local Switch server
tests/                Vitest suite
```
