# hackclawd

A security research agent that lives in a Switch room. Paste an authorized bug-bounty program into Slack and get back a report with sandboxed proofs of concept and reproduction steps, in the same conversation.

Built for the [Flip the Switch Hackathon](https://www.wemakedevs.org/hackathons/switch) (4 to 7 November 2026). Switch is not decoration here: without it the agent is a terminal-only tool, and with it the whole audit runs inside a Slack channel where the team can watch, ask, and decide.

## Start here

Reviewers, these are the links and the answers you need first.

| Item | Link |
| --- | --- |
| Project repository (public) | https://github.com/fozagtx/hackclawd |
| Demo video | TODO: add the YouTube or Loom link before submitting. Keep it under 3 minutes, public or unlisted, showing the agent working in a real chat with teammates |
| Live demo | None. Run it locally with `npm run local`, see [How to run it](#how-to-run-it) |
| Blog post (Best Blog side track, optional) | TODO: add the link if you publish one |
| Wispr Usage Card (Code with Wispr side track) | TODO: upload a screenshot from Insights in the Wispr Flow desktop app under Track Details |
| Hackathon page | https://www.wemakedevs.org/hackathons/switch |
| Switch documentation | https://docs.switchagents.ai/ |
| Switch source | https://github.com/sandbox-quantum/switch |

Jump straight to an answer:

- [What problem does it solve, and who is it for?](#the-problem)
- [Which tracks are we submitting for?](#tracks)
- [How did we use Switch?](#how-we-used-switch)
- [How is the channel set up?](#how-the-channel-is-set-up)
- [What real work does it do?](#the-workflow)
- [How do we run it?](#how-to-run-it)
- [What does every .env.example variable do?](#configuration-reference)
- [What did we like, and what would we improve?](#what-we-liked-and-what-we-would-improve)

> [!NOTE]
> The three TODO rows are the only pieces that do not live in the repository. Fill them in before you submit. Everything described below is implemented and covered by the test suite.

## Submission answers

Short, copy-pasteable answers to the seven required fields on the submission form. Longer versions are linked.

**Project title:** hackclawd

**Tracks:** Track 01, Best Business Workflow. Also eligible for the Best Blog and Code with Wispr side tracks once the blog post and the Wispr Usage Card are added. Track 03, Best Core Contribution, does not apply, because this is a standalone project rather than a pull request to Switch core. See [Tracks](#tracks).

**Project description (what problem, who for):** Security teams and bug-bounty hunters have to triage an authorized program quickly, but the useful work happens in a terminal only one person can drive, and the findings end up in a document nobody saw being written. hackclawd puts the research agent in the team's Slack room through Switch. A human posts a program, scope, and authorization, the agent hunts and proves findings in a locked-down sandbox, the report lands back in the same conversation, and a human confirms the findings. See [The problem](#the-problem).

**GitHub Repository:** https://github.com/fozagtx/hackclawd (public, README included, setup in [How to run it](#how-to-run-it))

**Demo video:** TODO, under 3 minutes on YouTube or Loom, public or unlisted, showing the agent working in a real chat with teammates.

**Live demo or deployment:** None yet. `render.yaml` is a deployment blueprint, but the demo runs locally with `npm run local`. See [Render deployment](#render-deployment).

**How did we use Switch in the project?** We connected an Eve agent (something else, not Claude Code, Codex, LangChain, or Google ADK) to Slack through a self-hosted Switch server. One durable agent session serves each room and thread, and only addressed mentions wake it. The agent runs security audits, posts progress into the room, and uploads the full Markdown report as a file. Teammates @mention it, ask follow-ups mid-run, resume interrupted audits, and confirm findings through the HTTP API. See [How we used Switch](#how-we-used-switch).

**What did we like about Switch, and what would we improve?** Rooms plus the addressed filter plus a resumable cursor made long unattended runs possible, and posting text and files needed no Slack SDK. We would like a typed client SDK for the frame protocol, a CLI for credential rotation, a scoped setup token instead of an admin cookie, a lighter local dev stack, and native card actions so a human can confirm a finding inside the room. See [What we liked and what we would improve](#what-we-liked-and-what-we-would-improve).

## The problem

Security research is slow to share. A researcher clones a repo, runs tools locally, and pastes results into a ticket. Teammates cannot see the work in progress, cannot redirect it, and cannot tell which findings were actually proven. The person driving the terminal becomes a bottleneck.

hackclawd moves that loop into the chat the team already uses:

- **Who it is for:** enterprise security teams, AppSec engineers, and bug-bounty hunters working on assets they are authorized to test.
- **What it solves:** it turns an authorized program into a visible, auditable workflow with evidence, instead of a private terminal session and a static document.
- **Who stays in charge:** a human. The agent never marks a finding confirmed, only a person does that through the HTTP API.

## What it is

| Part | Role | Required |
| --- | --- | --- |
| Human in Slack | Posts the program, scope, and authorization, asks follow-ups, confirms findings | Yes |
| Switch server and Slack bridge | Turns a Slack channel into a room, routes addressed messages, carries replies and files | Yes |
| hackclawd Eve agent | One durable session per room and thread, owns recon, dispatch, and the final report | Yes |
| `secgin` skill and six subagents | Recon, specialist hunts, skeptical validation | Yes |
| Upstash Box sandbox | Runs proofs of concept against local copies with egress restricted | Yes for PoCs, optional for a read-only audit |
| HTTP API | Start an audit, list reports, confirm a finding | Optional |

The agent is defined in `agent/agent.ts` with the `eve` framework, its behavior in `agent/instructions.md`, and the security workflow in `agent/skills/secgin/`. The model is a Nebius Token Factory model, `moonshotai/Kimi-K2.7-Code` by default, reached through the Vercel AI SDK (`ai` and `@ai-sdk/openai-compatible`).

## Tracks

- **Primary: Track 01, Best Business Workflow.** A security audit is a practical workflow where a person and an agent get real work done together, with a shared conversation, visible progress, and a human decision gate at the end.
- **Side track, Best Blog:** optional, add the link under [Start here](#start-here) if you publish a write-up of the build.
- **Side track, Code with Wispr:** open to every submission, but only scored if the Wispr Usage Card is uploaded under Track Details.
- **Not entering Track 03, Best Core Contribution:** that track requires a pull request to Switch core, and this project is a standalone agent, not a core change.

Confirm the final selection on the submission form before the deadline. You can enter more than one track.

## How it works

```
Slack message (@hackclawd)
        |
        v
Switch room (slack bridge, addressed filter)
        |
        v
hackclawd eve agent, one session per room and thread
        |
        +-> secgin skill: recon, then at most 3 specialist hunters at a time
        |      web2_hunter, contract_state_hunter, contract_math_hunter,
        |      contract_flow_hunter, ai_hunter
        |
        +-> validator: independent skeptic, rejects weak candidates
        |
        +-> Upstash Box: PoC against a local copy, egress locked down
        |
        v
progress lines and a full Markdown report posted into the same room
        |
        v
human confirms findings through the HTTP API
```

Stop conditions: the agent asks one clear question when scope or authorization is missing, it never guesses scope, and it never sends attack traffic to live hosts. Findings stay candidates until a human confirms them. A candidate without quoted sandbox evidence is rejected.

## How we used Switch

This is the answer to the "How did you use Switch" section of the form, in detail.

**Which agent did we connect?** Something else: an **Eve agent**, not Claude Code, Codex, LangChain, or Google ADK. `agent/agent.ts` uses `defineAgent` from `eve` 1.0.0-rc.1, and `agent/channels/switch.ts` uses `defineChannel` from `eve/channels`. Switch sees it as `connector_type: "eve"` with `connection_model: "always_on"` and `message_exchange: true`, registered in `src/switch/register.ts`. The model behind the agent is Nebius Token Factory (`moonshotai/Kimi-K2.7-Code` by default), wired in `src/model.ts` through the Vercel AI SDK.

**Which platforms does it run on?** **Slack.** `scripts/local.ts` connects the Slack workspace to Switch as a Socket Mode bridge (`bridge_type: "slack"`, set as default), so every Slack channel becomes a Switch room. Switch itself also supports Microsoft Teams, Discord, Telegram, and Mattermost, and the bundled Compose stack includes Mattermost, but hackclawd wires and tests the Slack bridge only. There is no Slack SDK code in this repo: all messaging goes through Switch.

**What real work does it do?** It runs an authorized security assessment end to end. Recon in a sandbox, specialist hunts across web2, Solidity, and AI surfaces, a validator that tries to reject candidates, proofs of concept executed in an Upstash Box, then a Markdown report with evidence and reproduction steps. The report is posted into the room as a file, and a header calls out the highest severity confirmed finding when a PoC passed.

**How do teammates work with it?**

- Invite it once with `/invite @Hackclawd` and `/invite-agent @hackclawd`, then mention it with a program, scope, and authorization.
- During a run it posts one short progress line per stage (scope, recon, each hunt lens, validation, PoC, report), so the team can follow along.
- A mid-run message gets a real status reply instead of a canned acknowledgement.
- Each room remembers its last audited program, so a follow-up like "find a critical there" needs no repo URL.
- A restart announces the interrupted audit and offers `resume`, so nobody pastes the request twice.
- A human confirms findings through `POST /api/reports/{id}/findings/{findingId}/confirm`. The agent is not allowed to do this.

## How the channel is set up

Everything below is real code in this repository. The one-command path is `npm run local`, which runs `scripts/local.ts`.

1. **Start a private Switch server.** `scripts/local.ts` generates `local/switch/.env` (Switch version 0.31.0, Postgres credentials, `AGENT_REGISTRATION_TOKEN`, `SECRET_KEYS`, gateway admin login), then runs `docker compose -p hackclawd-switch -f local/switch/docker-compose.yml --env-file local/switch/.env up -d`. That starts Postgres, `init-db`, and `switch-core` from published GHCR images, and waits for `http://localhost:8000/health`.
2. **Register the agent.** `POST /agents` creates `hackclawd` with `connector_type: "eve"`, `connection_model: "always_on"`, and `message_exchange: true`. The returned `SWITCH_AGENT_ID` and `SWITCH_AGENT_API_KEY` are written into `.env` automatically. `npm run switch:register` is the manual equivalent for a remote Switch server; the API key is shown only once, so save it as a secret.
3. **Open addressing and connect Slack.** The gateway client in `src/switch/gateway.ts` logs into `/gateway/auth/login`, sets the agent addressing policy to `null` (`PUT /gateway/agents/{id}/addressing-policy`) so it can be mentioned in any room, then checks the Slack tokens and creates the collaboration bridge via `/gateway/collaborations`.
4. **Hold one WebSocket connection at runtime.** `src/switch/client.ts` connects to `/agents/{id}/connection/ws` with `scope=all`, `filter=addressed`, a bearer `SWITCH_AGENT_API_KEY`, a persisted `connection_id`, and a cursor. It answers pings, handles `connection_state`, `gap`, and `evicted` frames, and persists the cursor in `.data/switch-connection.json` so a reconnect resumes instead of replaying. Only messages with `payload.addressed: true` and a sender other than the agent are forwarded.
5. **Bridge into Eve.** `src/switch/bridge.ts` POSTs each message to `http://127.0.0.1:3000/switch/events` with the `x-hackclawd-bridge-secret` header set to `HACKCLAWD_API_KEY`. `agent/channels/switch.ts` verifies that secret, parses room, thread, message id, sender, and body, then calls `from(address).send(prompt, { idempotencyKey: message_id, state: { roomId, threadId } })`. One durable Eve session per room and thread, with the message id as the idempotency key.
6. **Post back into the room.** `src/switch/http.ts` posts progress lines to `/agents/{id}/message`, streams the final text on `content.completed`, and uploads the full Markdown report as a file with `/agents/{id}/rooms/{roomId}/media` on `call.settled`.

Relevant files: `src/switch/protocol.ts` (frame parsing), `src/switch/run-status.ts` (status and resume), `src/switch/target-memory.ts` (per-room target memory), `src/switch/progress.ts` (progress lines), `src/reports/delivery.ts` (report file and header).

## The workflow

What a teammate actually sees, from one message to a confirmed finding:

1. **Ask:** `@hackclawd Audit https://github.com/OWNER/REPO. In scope: the whole repo. I am authorized to test it.`
2. **Route:** Switch forwards the addressed message to the eve session for that room and thread.
3. **Hunt:** the `secgin` skill does recon, then dispatches only the hunters whose surface is in scope, at most three at a time. A plain web app gets `web2_hunter` alone, a Solidity repo gets the three contract hunters, an agent framework gets `ai_hunter`.
4. **Validate:** `validator` tries to reject the combined candidate list, and its rejection reasons are kept for the report.
5. **Prove:** PoC code runs only in an Upstash Box against local copies, never against live targets.
6. **Report:** progress lines and the final report (findings, evidence, reproduction steps) go back to the same room as text and a Markdown file.
7. **Confirm:** findings are candidates until a human confirms them through the HTTP API.

Why this is worth putting in a room instead of a terminal: the whole team sees the same evidence, anyone can redirect the run with a follow-up, and the human decision at the end is explicit. Results depend on the target, the model, and the scope you supply. A report is a set of candidates, not a guarantee of correctness.

## How to run it

### Requirements

- **Node.js 24+**
- **Docker Desktop**, running (for the local Switch server)
- **Nebius Token Factory API key**
- **Upstash Box API key**, to execute PoCs
- **Slack app tokens** (`xoxb-` and `xapp-`), to use it from Slack

### Quickstart

```bash
git clone https://github.com/fozagtx/hackclawd && cd hackclawd && npm ci && cp .env.example .env
```

Open `.env` and paste your keys after the `=`:

```bash
NEBIUS_API_KEY=your-nebius-key     # tokenfactory.nebius.com, API keys
UPSTASH_BOX_API_KEY=your-box-key   # console.upstash.com, Box, API Keys
SLACK_BOT_TOKEN=xoxb-...           # api.slack.com/apps, Hackclawd, Install App
SLACK_APP_TOKEN=xapp-...           # Basic Information, App-Level Tokens, connections:write
```

Leave the remaining lines blank. Blank values are treated as unset, so the defaults in `src/config.ts` apply. `npm run local` writes `HACKCLAWD_API_KEY`, `SWITCH_URL`, `SWITCH_AGENT_ID`, and `SWITCH_AGENT_API_KEY` into `.env` for you. See [Configuration reference](#configuration-reference) for all 16 variables. Then start everything:

```bash
npm run local
```

This starts the private Switch server in Docker, registers the agent, connects Slack, builds, and serves hackclawd on `http://localhost:3000`. The first run downloads the Switch images. Keep the terminal open.

Check it in a second terminal:

```bash
curl http://localhost:3000/api/health
```

To change a key, edit `.env` and rerun `npm run local`. Stop the Switch server with `docker compose -p hackclawd-switch down`.

Honest limits on a fresh setup: without `SLACK_BOT_TOKEN` and `SLACK_APP_TOKEN`, Slack is not connected but the app still starts. Without `UPSTASH_BOX_API_KEY`, audits run but PoCs cannot execute. A Switch server on your laptop cannot be reached from Render, so a hosted deployment needs a Switch server reachable from the internet.

### Slack

After `npm run local` prints `Connected Slack workspace "..." to Switch`:

```text
/invite @Hackclawd
/invite-agent @hackclawd
@hackclawd Audit https://github.com/OWNER/REPO. In scope: the whole repo. I am authorized to test it.
```

Follow-ups such as `find a critical there` work because each room remembers its last target. If the process restarts mid-run, the room offers `resume`.

### HTTP API

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

## Configuration reference

All 16 keys in [`.env.example`](.env.example), checked against `src/config.ts`, `scripts/local.ts`, and `scripts/switch-register.ts`. A blank value is treated as unset, so the defaults below apply without editing the line.

| Variable | If left blank | Who sets it | Purpose |
| --- | --- | --- | --- |
| `NEBIUS_API_KEY` | Required. `npm run local` exits and tells you to add it | You | Nebius Token Factory API key for the model. |
| `NEBIUS_BASE_URL` | `https://api.tokenfactory.nebius.com/v1` | You, optional | OpenAI-compatible base URL. Trailing slashes are stripped. |
| `NEBIUS_MODEL` | `moonshotai/Kimi-K2.7-Code` | You, optional | Model ID handed to the provider. |
| `UPSTASH_BOX_API_KEY` | PoCs cannot execute, but audits still run | You | Runs proofs of concept in an Upstash Box. |
| `HACKCLAWD_API_KEY` | Unset. `npm run local` generates a 32-byte hex secret | `npm run local` or you | Bearer token for the HTTP API, the `x-hackclawd-bridge-secret` header, and eve channel auth. Required before the Switch bridge will start. |
| `SWITCH_URL` | Unset. `npm run local` sets `http://localhost:8000` | `npm run local` or you | Base URL of the Switch server. Trailing slashes are stripped. |
| `SWITCH_AGENT_ID` | Unset. Registration fills it | `npm run local` or `npm run switch:register` | Registered agent id used in every Switch URL. |
| `SWITCH_AGENT_API_KEY` | Unset. Registration fills it | `npm run local` or `npm run switch:register` | Agent bearer token for the WebSocket and HTTP calls. Printed only once at registration. |
| `SWITCH_REGISTRATION_KEY` | Unset. Only needed for remote registration | You | Bearer token for `POST /agents`, used only by `npm run switch:register`. `npm run local` uses `AGENT_REGISTRATION_TOKEN` from `local/switch/.env` instead, so leave this blank locally. |
| `SLACK_BOT_TOKEN` | Slack bridge is not connected, but the app still starts | You | `xoxb-` bot token, read only by `scripts/local.ts`. It is not part of the runtime config schema. |
| `SLACK_APP_TOKEN` | Slack bridge is not connected, but the app still starts | You | `xapp-` app-level token with `connections:write`, read only by `scripts/local.ts`. |
| `HACKCLAWD_SANDBOX_ALLOWED_DOMAINS` | Empty list, so only the built-in allowlist applies | You, optional | Comma-separated bare hostnames added to sandbox egress. Schemes, paths, wildcards, and IP addresses are rejected. The model cannot change it. |
| `HACKCLAWD_DATA_DIR` | `.data` | You or `render.yaml` | Holds reports, the Switch cursor, run and target memory, and eve sessions. Render sets `/var/data`. |
| `PORT` | `3000` | You, optional | HTTP port, an integer from 1 to 65535. If you change it, also update `FRONTEND_BASE_URL` in `local/switch/.env` and every `localhost:3000` in the examples above. |
| `RENDER_EXTERNAL_URL` | Unset. Render injects it automatically | Render | Public origin of the service. Becomes the eve workflow callback base when `WORKFLOW_LOCAL_BASE_URL` is blank. |
| `WORKFLOW_LOCAL_BASE_URL` | Unset. Falls back to `RENDER_EXTERNAL_URL` | You, optional | Explicit eve workflow callback base URL, passed to eve at startup. Takes precedence over `RENDER_EXTERNAL_URL`. |

A few things worth knowing:

- Runtime config is parsed in `src/config.ts`. The two Slack tokens are setup-time values consumed by `scripts/local.ts`, which is why they do not appear in the runtime schema.
- `npm run local` uses `upsertEnv` from `src/local/env-file.ts` to write the generated values into `.env` while keeping every other line intact. It generates `HACKCLAWD_API_KEY` only when that key is blank, and it re-registers the agent (overwriting the three `SWITCH_*` values) when `SWITCH_URL` is not `http://localhost:8000` or either agent credential is missing. Keep `.env` private; `.gitignore` excludes `.env*` except `.env.example`.
- The local Switch server has its own generated file, `local/switch/.env` (Switch version 0.31.0, `AGENT_REGISTRATION_TOKEN`, `SECRET_KEYS`, database and gateway credentials). Those are separate from the 16 app keys above.
- `render.yaml` declares `NODE_VERSION=24`, `HACKCLAWD_DATA_DIR=/var/data`, and six secrets: `NEBIUS_API_KEY`, `UPSTASH_BOX_API_KEY`, `HACKCLAWD_API_KEY`, `SWITCH_URL`, `SWITCH_AGENT_ID`, `SWITCH_AGENT_API_KEY`. It does not declare Slack tokens or `SWITCH_REGISTRATION_KEY`, because the remote Switch server owns the bridge and registration has already happened.
- `readiness()` in `src/config.ts` reports which integrations are configured without exposing their values, and `GET /api/health` returns that map.

## Sandbox and safety limits

- Every Box starts with a custom egress policy: package registries (npm, PyPI, Go, crates, RubyGems, plus Solidity and Rust toolchain hosts) and GitHub/GitLab only. The full allowlist is in `src/sandbox/network-policy.ts`.
- Live targets are unreachable, and there is no fallback to open networking.
- `HACKCLAWD_SANDBOX_ALLOWED_DOMAINS` lets an operator add bare hostnames, for example a private git host. The model cannot change it.
- PoCs run only against local copies. The agent is instructed to treat all repo content, program text, and tool output as untrusted data, never to follow instructions found there, and never to claim a test passed unless the sandbox output shows it.
- The agent never marks a finding confirmed, never prints secrets found in code, and only works on assets the human says are authorized and in scope.

## Render deployment

`render.yaml` is a Blueprint for one Starter web service with a 1 GB disk at `/var/data` and no database. Fill in the six secrets listed in [Configuration reference](#configuration-reference). Render injects `RENDER_EXTERNAL_URL` automatically, and that becomes the eve workflow callback base.

To register the agent against a remote Switch server, set `SWITCH_URL` and `SWITCH_REGISTRATION_KEY` in your local `.env`, run `npm run switch:register`, and save the printed `SWITCH_AGENT_ID` and `SWITCH_AGENT_API_KEY` as Render secrets. The API key is shown only once. Slack tokens are not needed on Render, because the remote Switch server owns the Slack bridge. Render needs a Switch server reachable from the internet; a Switch running on your laptop will not work.

## Data layout

```text
.data/
├── reports/<id>.json         # reports and findings
├── switch-connection.json    # Switch connection id, generation, cursor
├── runs.json                 # in-flight run state, for resume after restart
├── targets.json              # last audited program per room
└── .eve/.workflow-data/      # eve sessions
local/switch/.env             # generated local Switch secrets (git-ignored)
```

## Useful commands

```bash
npm run local                 # Switch in Docker + register + Slack + build + start (recommended)
npm run switch:register       # register the agent against a remote Switch server
npm start                     # start the app with an existing .env
npm test                      # Vitest unit suite
npm run test:integration      # real Upstash Box run, skipped without UPSTASH_BOX_API_KEY
npm run typecheck && npm run lint && npm run build
docker compose -p hackclawd-switch down   # stop the local Switch server
```

## What we liked and what we would improve

These are the answers we paste into the "What did you like about Switch, and what would you improve?" field. Adjust the wording to your own voice before submitting.

**What worked**

- **Rooms plus the addressed filter.** `filter=addressed` and `payload.addressed` mean one always-on agent serves every channel but only wakes when a human @mentions it. That is what let us build a durable session per room and thread instead of a stateless chatbot, with no per-channel webhook configuration.
- **Resumable connections.** The WebSocket carries `connection_id`, `cursor`, and `generation`, and we persist them in `.data/switch-connection.json`. Reconnects resume from the cursor instead of replaying or losing messages, which is what makes a multi-minute unattended audit survivable.
- **One bridge, no chat SDK.** Connecting Slack is a gateway call, and posting text and files is `POST /agents/{id}/message` and `POST /agents/{id}/rooms/{roomId}/media`. We wrote zero Slack API code, and delivering the full Markdown report as a file in the room was a few lines.
- **Events that match an agent lifecycle.** `call.requested`, `content.completed`, and `call.settled` line up with Eve channel events, so progress lines and the final report came from small handlers rather than a custom polling loop.

**What got in the way**

- **The frame protocol is easy to get subtly wrong.** Control frames arrive as `{event, data}`, message frames as `{event: "message", data: {...}}`, and ping, gap, and evicted frames each need their own handling. We ship a normalizer in `src/switch/protocol.ts` and still spent several commits on parsing. A versioned, typed client SDK with a documented schema would remove that whole class of bug for custom agents.
- **Credentials are out of band.** `POST /agents` returns an id and an API key shown only once. `scripts/local.ts` automates it locally, but a first-class CLI that writes and rotates credentials would help anyone self-hosting a custom agent.
- **Gateway setup uses an admin cookie.** Addressing policy and bridge connection require `POST /gateway/auth/login` and a session cookie. A scoped setup token with narrow permissions would be easier to automate and safer to keep in CI.
- **The local stack is heavy for a first demo.** Postgres, `init-db`, `switch-core`, plus optional Mattermost and gateway, with a pinned `SWITCH_VERSION` that has no default. A single-container dev mode or a hosted sandbox would shorten the first run considerably.
- **Human confirmation needs a second surface.** We added `POST /api/reports/{id}/findings/{findingId}/confirm` because a person has to be the last gate. Structured card actions that report a decision back into the agent session would let a human confirm a finding inside the room instead of curling an endpoint.

## Before you submit

- [ ] Demo video recorded, under 3 minutes, hosted on YouTube or Loom, public or unlisted, and the link added under [Start here](#start-here). It should show the agent working in a real chat with teammates.
- [ ] The two TODO links under [Start here](#start-here) replaced (demo video, and blog post if you publish one).
- [ ] Team details filled in on the form for everyone on the team, up to 4 people.
- [ ] Tracks confirmed on the form: Track 01, plus side tracks if applicable.
- [ ] Wispr Usage Card uploaded under Track Details if entering Code with Wispr.
- [ ] Repository is public at https://github.com/fozagtx/hackclawd and this README is committed.
- [ ] `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` pass.

## Repository layout

```text
agent/                eve agent, instructions, channels (api, switch, eve), tools
agent/skills/secgin/  security workflow skill and its references
agent/subagents/      six specialist hunters and the validator
src/api/              HTTP handlers
src/switch/           Switch protocol, WebSocket client, bridge, registration, gateway
src/sandbox/          Upstash Box runner and egress policy
src/reports/          report store and delivery
scripts/              local, start, switch-register
local/switch/         Docker Compose for the local Switch server
tests/                Vitest suite
```
