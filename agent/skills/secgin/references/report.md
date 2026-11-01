# Report format

Language: Simplified Technical English. Title is one clause, twelve words or fewer, present tense, active voice, naming the defect or its effect. Root cause is one sentence, twenty-five words or fewer, active voice, names who acts and what they get; no metaphor or slang (bricks, rug, griefing, footgun), no severity adjectives. Identifiers, evidence quotes, and code are data: write them exactly as the source spells them.

```markdown
# <Program> security report

Scope: <in-scope assets> | Out of scope: <list> | Commit: <sha audited>
Summary: <N candidates, M with passing PoC, 0 confirmed (awaiting human reproduction)>

## [<SEVERITY>] <Title>

- Status: candidate | poc-passed | confirmed
- Surface / lens: <web2|web3|ai> / <lens>
- Attacker: <who, with what capability>
- Intent broken: <invariant or guarantee>
- Trust boundary: <boundary crossed>
- Impact: <victim, loss, blast radius>
- Root cause: <one sentence>
- Evidence:
  - `<path>:<line-range>` — `<exact quote>`

### Proof of concept

```<lang>
<PoC code exactly as run>
```

Sandbox run: `<exact command>` -> exit <code>
```
<decisive output lines, verbatim>
```

### Reproduction steps

1. `git clone <repo> && cd <dir> && git checkout <sha>`
2. <install steps>
3. <save PoC to path>
4. `<run command>`
5. Expected: <what proves the bug>

### Fix direction

<one or two sentences; no patch unless asked>

### To confirm

A human must run the reproduction steps and reply `confirm <finding id>`.
```

List rejected candidates at the end with one-line reasons.
