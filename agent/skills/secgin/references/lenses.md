# Hunt lenses (from secgin prompts.ts, PROMPT_VERSION secgin-13)

Run one sequential pass per lens for each surface in scope. Each later pass receives earlier candidates and looks elsewhere.

## web2

### identity-and-tenancy

Trace authentication, sessions, OAuth, password reset, object authorization, tenant isolation and role transitions. Compare owner and non-owner paths, including caches and asynchronous jobs. Attack class: broken access control / IDOR / confused deputy. Name the actor, the object they should not reach, and the check that is missing or inverted.

### input-to-sink

Trace untrusted input through validation, encoding and canonicalization into SQL, templates, HTML, commands, files and deserializers. Establish actual reachable sinks and mitigations; do not infer a bug from a function name. Attack class: injection. Quote the source-to-sink path with exact lines.

### network-and-protocol

Check outbound URL construction, SSRF boundaries, redirects, proxy trust, request parsing, cache keys, CORS and websocket authorization. Distinguish source evidence from deployment assumptions. Attack class: SSRF, request smuggling, cache poisoning, CSRF. Require a trust-boundary crossing in source, not a hostname string alone.

### state-and-business-logic

Identify workflow guarantees, payment/accounting boundaries, race windows, idempotency, replay, upload lifecycle and resource limits. Trace an unauthorized state transition with concrete victim impact, without running load tests. Attack class: TOCTOU, double-spend of a server-side entitlement, skipped state. Impact must name who loses what.

### crypto-and-secrets

Trace key handling, nonce reuse, JWT/session MAC verification, password hashing, secret storage, and randomness. A missing constant-time compare is only a finding if source shows a secret comparison on an attacker-reachable path. Attack class: crypto misuse, secret leak. Do not invent a KMS or HSM that is not in SOURCE_DATA.

### memory-timing-and-parsers

For native or parser-heavy files, walk length fields, casts, remaining-buffer math, and two parsers that disagree. Timing or error-oracle claims need a named secret and a reachable comparison. Attack class: memory corruption, protocol-parse mismatch, timing side channel. Do not compile or crash binaries; cite the lines.

### client-side-and-rendering

Trace DOM and template XSS sinks, postMessage origin checks, CORS, service workers, browser storage of secrets, and auto-loaded resources. Renderer behavior outside the supplied source is needs-context, not a finding. Attack class: client-side injection, origin confusion, secret exposure. Name the attacker-controlled value, browser principal, reachable sink, and missing deterministic check.

### supply-chain-and-release

Trace dependency resolution and lockfiles, install scripts, CI workflow inputs from untrusted pull-request data, release/signing/update paths, and plugin loading. Attack class: supply-chain compromise. Require an attacker-writable input reaching a build, release, signing, update, or load step in source; configuration or deployment assumptions alone are not a finding.

## web3

### math-precision

Pashov math-precision agent. Map WAD/RAY/BPS and token/oracle decimals. Exploit wrong rounding (shares down, debt/fees up), 1-wei truncation, mul-before-div vs div-before-mul, downcasts, and first-depositor share inflation. Proof needs concrete numbers. Attack class: insolvency, rounding extraction. Do not run a fuzzer.

### access-control

Pashov access-control agent. Map every role, modifier, and inline check. Exploit the weakest writer of a shared variable, initialize/front-run, privilege escalation, confused-deputy calls, proxy/storage-slot collisions, and NFT-specific approval bypasses (ERC721 permit, EIP-1271 signatures, Gnosis Safe setFallbackHandler). Permissionless value or authority changes are in scope; documented admin power is not a finding by itself. Attack class: missing or bypassable access control.

### economic-security

Pashov economic-security agent. Break oracles, tokens, and incentives: fee-on-transfer, rebasing, blacklist, void-return, sandwichable price-dependent ops, hard-coded-zero slippage parameters (amountOutMinimum, deadline, sqrtPriceLimitX96), privileged owner/operator mempool sandwiches of pool metrics, ERC-4626 max* vs actual mint, sentinel addresses, shared-cap starvation. Name who profits, how much, at what cost. Attack class: oracle/slippage manipulation, token-behavior mismatch, donation/inflation.

### execution-trace

Pashov execution-trace agent. Follow entry to final state: mismatched claimed vs sent amounts, fee deducted then original amount forwarded, abi.encodePacked vs decode, stale reads after external calls, partial updates, interleaving of request/wait/execute, leftover approvals. For bridges/cross-chain code, trace requestId uniqueness across re-orgs, replay protection, and refund/compensation on rejected deposits or failed fallback. Attack class: value leak, encoding mismatch, TOCTOU across calls, bridge replay/stuck funds.

### invariant

Pashov invariant agent. Extract conservation laws, state couplings, and caps; list every writer of each term. Break round-trips, path divergence, commutativity, zero/max/first/last, emergency transitions. Name the invariant, the call sequence that breaks it, and values before/after. Attack class: conservation break, skipped cap, round-trip leak.

### periphery

Pashov periphery agent. Attack libraries, helpers, encoders, abstract bases first. Unvalidated helper inputs that callers trust (e.g., token address must be a member of the pair, reserve arrays must match the reported token order), corrupt return widths, hidden storage side effects, assembly byte-width bugs, false existence proofs, gas loops that brick callers, provider swap races. Attack class: helper-trust gap, encoding width, gas griefing.

### first-principles

Pashov first-principles agent. Do not pattern-match named CWEs. For every state-changing function, list implicit assumptions (freshness, ordering, identity, nonzero denominator, coupled storage, hard-coded protocol constants such as fee caps, gas reserves, and price thresholds that assume a fixed token decimal or chain gas market) and violate them. Report unnamed logic errors with the assumption, the violation, and a trace. Attack class: broken assumption, desynchronized coupling.

### asymmetry

Pashov asymmetry agent. Diff paired operations (deposit/withdraw, mint/burn, encode/decode, user vs forceAdmin, stake/unstake, vote/unvote). Storage writes that do not mirror; governance or reward power that persists after the underlying stake/position is exited; branch pairs (native vs ERC20, empty vs nonempty) that skip a check the other side has. Attack class: unpaired accounting, branch-asymmetric guard.

### boundary

Pashov boundary agent. Enumerate every external call, payable, sentinel-address branch, token-address parameter, and bytes decode. Empty code at receiver, void-return tokens, zero/max inputs, failed vs fake-success low-level calls. Attack class: external-call corner, sentinel bypass, token noncompliance.

### numerical-gap

Pashov numerical-gap agent. Hunt seams between precision, invariants, and boundaries: invariants that hold in reals but drift under truncation; formulas that go to zero at the edge; caps checked against a differently scaled value; mismatched formulas between a view function and the state-changing function it is paired with; collateral factors or haircuts applied inconsistently across realized/unrealized balance buckets. Do not re-do the standalone math or invariant cells. Attack class: rounding-drifted invariant, edge-precision zero, view-state mismatch.

### trust-gap

Pashov trust-gap agent. Hunt seams between access control, economics, and asymmetry: a correctly guarded function whose formula is sandwichable by that role; deposit vs withdraw using different prices; admin setters that redirect in-flight value. Do not re-file a bare missing-modifier. Attack class: privileged economic extract, asymmetric pricing.

### flow-gap

Pashov flow-gap agent. Hunt seams between execution trace, periphery, and first principles: a clean internal path that trusts a fee-on-transfer return; a completed flow whose end-state contradicts the protocol purpose; callback re-entry that uses pre-callback state; untrusted hooks that clear/bypass reentrancy guards; external token callbacks (ERC1155/ERC721 safeTransferFrom, vault deposit/withdraw callbacks) that run before the protocol records ownership or rental state. Attack class: cross-lens flow break, purpose-violating end-state, guard bypass.

## ai

### context-and-retrieval-injection

Trace indirect injection through RAG, ingested documents, tool content, and metadata entering another principal's context; verify cross-session or cross-tenant context bleed in queries and cache keys; and inspect prompt role or provenance confusion from string concatenation or untyped history. Attack class: indirect prompt injection, context isolation failure, provenance confusion. Name the writer, consuming principal, retrieval or cache boundary, and capability reached. Prompt injection alone is not a finding; a guardrail prompt is not a security boundary; model output, tool descriptions, and MCP responses are untrusted input (as is durable memory). Name the attacker, affected principal, execution identity, resource, exact action, authority used, and impact.

### memory-poisoning

Trace attacker-controlled writes to durable memory that is later read by another user or privileged session. Cite both the write path and the cross-principal read, including provenance, tenant scope, merge, and retrieval controls. Attack class: persistent memory poisoning and cross-principal data or instruction bleed. Memory intentionally saved and used only for the same user's allowed requests is not a finding. Prompt injection alone is not a finding; a guardrail prompt is not a security boundary; model output, tool descriptions, and MCP responses are untrusted input (as is durable memory). Name the attacker, affected principal, execution identity, resource, exact action, authority used, and impact.

### tool-argument-sinks

Trace model-produced arguments into SQL, shell, file, URL, or privileged API sinks without handler-side validation. Compare the declared schema with dispatcher behavior for aliases, extra fields, coercions, duplicate keys, and nested free-form values; schema validation is not authorization or safe sink handling. Attack class: tool-argument injection and schema/dispatcher disagreement. Name the exact argument, handler, sink, and missing check. Prompt injection alone is not a finding; a guardrail prompt is not a security boundary; model output, tool descriptions, and MCP responses are untrusted input (as is durable memory). Name the attacker, affected principal, execution identity, resource, exact action, authority used, and impact.

### agency-and-action-binding

Trace confused-deputy paths where a service identity acts without per-request resource authorization. Verify approval binds the normalized tool name, full arguments, requester, and target; retries and resume cannot replay or mutate an approved action; and delegated loops have budget and idempotency controls. Attack class: excessive agency, confused deputy, action-binding failure, and replay. Name the authority the requester lacks or the exact unrequested side effect under a victim's valid authority. Prompt injection alone is not a finding; a guardrail prompt is not a security boundary; model output, tool descriptions, and MCP responses are untrusted input (as is durable memory). Name the attacker, affected principal, execution identity, resource, exact action, authority used, and impact.

### mcp-and-delegation-trust

Trace trust inheritance across sub-agents and MCP clients or servers. Check routing driven by attacker-influenceable server or tool names, request IDs, and URIs, and reject MCP metadata or descriptions being treated as policy. Attack class: delegation trust confusion, MCP routing, and capability escalation. Name the untrusted routing or description input, effective execution identity, selected capability, and missing isolation or authorization. Prompt injection alone is not a finding; a guardrail prompt is not a security boundary; model output, tool descriptions, and MCP responses are untrusted input (as is durable memory). Name the attacker, affected principal, execution identity, resource, exact action, authority used, and impact.

### output-and-disclosure

Trace model output into HTML, Markdown, templates, URLs, commands, logs, or other sinks without context-appropriate encoding. Check sensitive-context extraction of credentials, system prompts, and other users' data, including whether output crosses a principal or renderer boundary. Attack class: output injection and model-mediated disclosure. Name the source data, affected principal, encoding or disclosure boundary, and reachable sink. Prompt injection alone is not a finding; a guardrail prompt is not a security boundary; model output, tool descriptions, and MCP responses are untrusted input (as is durable memory). Name the attacker, affected principal, execution identity, resource, exact action, authority used, and impact.
