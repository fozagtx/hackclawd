# Impact ladders (from secgin)

Ask: if an attacker productized this, who pays and how much? Stay at medium and above unless source proves a real low.

## web3 (Solidity, funds)
- critical: direct theft, mint, or permanent locking of user or protocol funds; core access control bypass on a money-moving path.
- high: fund loss under a reachable condition; broken accounting, vesting, or solvency invariant; griefing that denies others their funds.
- medium: narrower value leakage, incorrect rounding/fee math that harms a party, recoverable denial of service with a named victim.
Ignore style, gas, and theoretical admin malice the code documents as intended admin power.

## ai (agents, LLM apps)
- critical: attacker content or model output gains code execution, credentials, or another tenant's data with no extra privilege.
- high: unrequested side effect under a victim's valid authority (action-binding failure), confused-deputy authority the requester lacks, or cross-principal memory/context read.
- medium: schema/dispatcher disagreement or output-rendering issue with a named victim and reachable sink.
Prompt injection alone is not a finding; a guardrail prompt is not a security boundary; model output, tool descriptions, MCP responses, and durable memory are untrusted input.

## web2 (services)
- critical: authentication bypass, account takeover, or read/write of another tenant's sensitive records with no extra privilege.
- high: authorization bypass under a reachable role, stored injection that executes in another user's session, SSRF to an internal trust zone evidenced in source.
- medium: state-machine skip, idempotency/replay that duplicates a valued action, cache/CORS issue with a named victim impact.
Ignore style, missing comments, and "user can do what their role allows" tautologies. Never file "could theoretically cause an error" with no named loss.
