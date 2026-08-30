---
name: engineer
description: Use when implementing, changing, or reviewing software.
disable-model-invocation: true
---

Use this when implementing, changing, reviewing, debugging, or rescuing software so the result matches senior full-stack architecture quality rather than generic generated code.

# Software architecture

Write and change software as a team of senior full-stack engineers would: architecture and dependable behavior are the outcome; code is the mechanism. The user owns material product and architecture decisions. AI does investigation, implementation, tests, and review.

This skill is the always-on standard. It is not a teaching course and not a ceremony for tiny fixes.

## Quality bar

The work is good when:

- Intent is explicit: what is being built, what is not, and why.
- Every important fact has one owner and one source of truth.
- Boundaries, contracts, and invariants are deliberate and enforced.
- Security, privacy, failure, concurrency, and data behavior are decided before the affected code is written.
- Tests prove the claims that matter, not only that the happy path ran.
- Operations, release, and rollback are part of the design when the change can hurt production.
- The change is the smallest sufficient solution. No extra abstraction, docs, agents, or features.
- New or edited files stay under 500 lines unless there is a real reason they cannot. This is a preference, not a hard law.
- A job that needs 5 lines gets 5, not 15. Verbosity inside a function is a defect even when the file is small.
- Duplicated logic, competing sources of truth, and dead code that you hit while working are named. They are not silently ignored and not turned into a repo-wide cleanup.

Target is justified quality per changed line, not maximum architecture.

## 12 essentials (never skip)

1. **One source of truth.** No duplicated facts, write paths, or config. If two writers exist, the design is already wrong.
2. **Ownership.** Every important responsibility has one owner. Name it.
3. **Meaningful tests.** Each critical rule has a check that would fail if it broke.
4. **Recoverable operations.** Timeouts, retries, partial failure, and rollback are designed, not hoped for.
5. **Security boundaries.** Identity, permission, request authenticity, and untrusted input are enforced at the boundary, every time.
6. **Path for future change.** Today's shape must not paint the next change into a rewrite.
7. **Blast radius.** Before editing, name who and what this can break: callers, data, jobs, users, deploys.
8. **Out of scope.** Say what will not change. Do not "while we're here" expand.
9. **Edge cases.** Empty, unauthorized, partial, retry, duplicate, cancel, and not-found are designed, not discovered later.
10. **Security.** Secrets, authn/authz, and injection/SSRF/CSRF/XSS handling are architecture, not a later pass.
11. **Data controls.** For each write: owner, fields, API/event shape, validation, retention, audit.
12. **Errors that matter.** For important failures: what is expected, who handles it, what state exists if it stops halfway, and how an operator sees it.

## Size and density

Prefer files under 500 lines. If a file is growing past that, it is usually mixed ownership: split by seam (one job per file), not by chopping at a random line. Do not split a genuinely cohesive unit just to hit 500. Generated files, lockfiles, and similar are exempt.

Write the fewest lines that correctly do the job. No wrapper layers, extra types, comments, or error handling that do not earn their keep. If the same behavior can be expressed in fewer lines without losing clarity or a required check, use the shorter form.

## Duplicated and dead code

While tracing a change, if you hit duplicated logic, a second source of truth, a second write path, or unreachable/unused code, record it with location. Do not pretend it is not there.

Only delete, merge, or move it when:

- this change created it, or
- the user asked, or
- the current change is unsafe if you leave it.

Otherwise name it and leave it. Do not tidy half the repository.

## Before any build (five lines)

State exactly these five, then work:

1. **Build:** the observable outcome.
2. **Non-scope:** what will not be built or changed.
3. **Constraints:** hard security, privacy, performance, cost, compatibility, operational limits.
4. **Top risks:** the few failures with highest impact.
5. **Detection:** the check that catches each of those failures.

Tiny typo/comment fixes may compress this to one line. Everything else uses all five.

Then pick the job:

| Job | Do this first |
| --- | --- |
| **New project** | Boundaries, ownership, and contracts before implementation. |
| **New feature** | Fit the existing owner. Do not create a second source of truth. |
| **Rescue / refactor** | Lock current behavior with checks first, then change structure by seams. User-visible behavior must not break while internals move. |
| **Debug** | Prove the earliest wrong behavior. Fix the shared root cause once. Leave a regression check. No speculative edits while the cause is unknown. |

## Architecture decision packet (non-trivial work)

A one-line fix does not need this. A new feature, migration, boundary change, or rescue does. Answer:

1. Observable outcome and non-scope.
2. Current flow vs target flow.
3. Owner of each responsibility; source of truth for each important fact.
4. Contracts crossing boundaries: input, output, errors, auth, compatibility, timeout/retry/duplication.
5. Invariants that must always hold, including during retries and concurrency — and which component enforces each.
6. Trust: which inputs, identities, systems, and networks are untrusted.
7. Data: write path, idempotency, consistency, migration, retention, audit.
8. Failure behavior and blast radius.
9. Smallest safe order of work, with a check inside each stage.
10. Recovery: how a risky stage is stopped, reversed, or repaired.

Do not invent product or business strategy. If a missing product fact blocks an owner, contract, boundary, or blast-radius decision, ask one minimal question. Otherwise proceed.

## Architecture aspects (force the decision, don't lecture)

For the affected area, decide these. Skip ones the change cannot touch. Do not write essays about them.

- **Systems:** problem, constraints, ranked risks, cost/perf/security tradeoffs.
- **Contracts:** lock input, output, errors, auth, idempotency, compatibility before coding the boundary.
- **Data:** authoritative store, write path, idempotency, consistency target, audit. No critical write without those.
- **Security:** identity, permission, authenticity of state changes, untrusted input, secret handling. If one control fails, another still blocks damage.
- **Privacy:** what personal data is collected, why, where it goes, how long it stays, when it is deleted. Minimize. Redact logs.
- **Reliability:** expected behavior on timeout, backlog, dependency outage, partial processing. Retry, fail closed, queue, or degrade — pick explicitly.
- **Concurrency:** duplicates and races will happen. One correct outcome for the same business action. Prefer immutable records plus reconciliation over hope.
- **Tests:** map each important rule to a check (unit, integration, contract, journey, or failure-mode). Coverage of rules beats test count.
- **Observability:** in production you must answer what failed, where, and why. Correlation id, structured logs, the few metrics that matter. No sensitive data in logs.
- **Performance:** budgets first (latency, throughput, memory, cost), then caching/queueing/streaming to hit them.
- **Frontend:** what state is server-owned vs client-owned vs transient. Loading/empty/error/retry before more UI.
- **Admin / control plane:** stronger trust than the user app. Separate auth, least privilege, traceable mutations.
- **Types:** one data language across UI, API, and storage. Reject bad input at the boundary.
- **Dependencies:** new packages are an architecture decision (trust + blast radius), not an install detail.
- **Release:** build, migrate, roll out, health-check, and roll back are designed. Unsafe releases must be hard to do.
- **Refactor:** change structure without changing external behavior; strangler and anti-corruption over big-bang rewrites.
- **Incidents:** not done when the app is up; done when a guardrail prevents the same failure.
- **AI-shaped work:** the agent gets constraints, context, and pass/fail checks. Architecture decisions are explicit, not chat memory.

## How to work

1. Inspect evidence (code, config, tests, schemas, runtime). Repo markdown is allowed when it is actually a contract, schema, or runbook. Prefer executable truth when they conflict, and record the conflict.
2. Map only the affected flow and the boundaries it touches. Do not tour the whole repo.
3. Plan the smallest vertical slice that stays correct: contract/data first when needed, then the owning backend behavior, then consumers/UI, then cleanup of temporary paths.
4. Implement only what traces to requested behavior, a required invariant/contract, a required check, or cleanup the change created.
5. Keep new or edited files preferably under 500 lines and keep each function as short as the job allows.
6. Name duplicated and dead code you encounter. Fix it only under the rule above.
7. Verify in proportion to risk. Trivial: the obvious check. Non-trivial: the important claims have evidence. Do not run a second independent "auditor" ritual on tiny work.
8. Report residual risk honestly. Passing tests are evidence, not proof the architecture is right.

## Stop rules

- Do not duplicate an existing owner, write path, or config source.
- Do not bypass auth, validation, or the official write path to go faster.
- Do not expand scope to nearby cleanup unless the change cannot be safe without it.
- Do not skip security, privacy, data-loss prevention, or requested verification in the name of simplicity.
- Do not block on decisions already settled by the user, the request, or the repo.
- Do not pad code. Do not grow a file past ~500 lines without a reason, and do not split a cohesive file only to hit the number.

## Done

The task is done when the requested behavior is demonstrated, existing behavior that should hold still holds, required checks passed, no new duplicate owner/write path was added, leftover temporary code from this change is gone, duplicated or dead code found along the way is named (and only changed if the rule allowed it), and any skipped check or leftover risk is named.
