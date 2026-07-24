# AGENTS.md

## Project Objective
Gold Chain must be treated as a real production blockchain, not as a temporary demo, test toy, or convenience prototype. The project is meant to become a serious chain that can hold real value. `GILT` is the native chain token and is part of validator economics, governance, inflation, and chain-level rewards. `GOLD` is the main gold asset users are meant to use on the chain. Approved Ethereum-side gold-backed assets such as `PAXG` and `XAUT` must bridge into Gold Chain in a way that fits one clean final Gold model. The bridge, staking, migration, redemption, scan, DEX, and any related chain logic must all fit together as parts of the same final production design. Do not optimize for temporary compatibility layers, half-transition states, or short-lived workarounds if they move the codebase away from the final chain the user is trying to build.

## Response Style
Responses must stay short, direct, and in plain English unless the user explicitly asks for technical depth. Do not give word salads. Do not hide behind vague phrasing, hedging, or generic filler. If the user asks a direct question, answer it directly. If the answer is yes, say yes. If the answer is no, say no. If something is unfinished, say exactly what is unfinished. Use the real project names such as `GILT`, `GOLD`, `PAXG`, `XAUT`, bridge, staking, migration, and redemption instead of vague labels like `token A` or `token B`, unless you are quoting existing code that already uses those names.

## Working Rules Learned Here
This project must always be moved toward the final target architecture. Do not preserve old paths just because removing them is more work. If the user is designing the final blockchain model, do not keep old and new systems alive together merely to avoid touching more files. A production blockchain cannot be allowed to drift into a half-old, half-new state just because a transition layer feels safer in the short term.

Do not invent a new subsystem when the user explicitly asked to adapt an existing battle-tested codebase. If the user says to take an existing proven repo or architecture and adapt it, then follow that instruction. Do not silently replace that instruction with a fresh homegrown design because it feels cleaner, easier to control, or faster to ship.

Do not replace a required chain-level design with a smaller contract-only workaround just because it is easier to implement. If the real requirement depends on native minting, native burning, chain-core accounting, protocol-level behavior, validator-level flow, or another deeper part of the system, then that deeper work is the real task. Do not quietly swap in a reserve model, wrapper trick, compatibility layer, fallback queue, operational dependency, or any other shortcut without explicit user approval.

When money, bridging, minting, burning, staking, migration, redemption, governance, validator logic, or token accounting are involved, reject “good enough” shortcuts by default. Hidden liquidity assumptions, fallback mechanisms, reserve-based substitutes, or temporary accounting tricks are not acceptable replacements for the real production design unless the user clearly asks for that tradeoff. This is not a harmless coding style issue. A shortcut in high-stakes blockchain code can create broken assumptions, unsafe architecture, trapped funds, incorrect accounting, loss of trust, or users losing millions of dollars.

Do not take shortcuts anywhere in this project. This rule is not limited to the bridge and it is not limited to one category of code. It applies to chain logic, bridge logic, native asset accounting, validator behavior, governance, staking, migration, redemption, minting, burning, rewards, genesis setup, deployment scripts, operators, monitoring assumptions, tests, helpers, and every other part of the system. If the correct production design requires touching the chain core, then touch the chain core. If the correct design requires changing accounting, mint and burn behavior, bridge direction, validator flow, or final token architecture, then make those changes instead of quietly replacing them with a smaller workaround. Do not silently choose reserve models, fallback queues, wrappers, compatibility layers, contract-only substitutes, liquidity assumptions, or “good enough for now” logic unless the user clearly approves that tradeoff. A shortcut here is not harmless. It can create false assumptions, unsafe flows, trapped funds, broken redemption, incorrect balances, or users losing millions of dollars. If the easier path is not the real production path, stop and say so instead of implementing it.

Only finalized and sufficiently confirmed bridge events must ever be treated as real events for state transitions, minting, unlocking, accounting, or user-visible status. This rule applies to deposits, exits, checkpoints, redemptions, route mappings, event counters, monitoring dashboards, helper scripts, and all operator tooling. A fresh event seen on an RPC node, log stream, mempool feed, non-finalized block, or early chain head must not be counted as completed just because it exists somewhere temporarily. Until the event is finalized and passes the required confirmation policy, it is still unsafe and reversible. Treating non-finalized bridge events as real can cause catastrophic outcomes: `GOLD` may be minted against `PAXG` or `XAUT` that later disappears in a reorg, `GILT` supply accounting can become wrong, exits can unlock value that was never truly locked, monitoring can falsely declare safety, and operators can act on fake state. That can leave users with unbacked assets, trapped funds, broken redemption, insolvency, and losses measured in millions of dollars.

`PAXG` and `XAUT` must never be confused, taken, modeled, designed, implemented, tested, operated, or handled as burnable root assets in the Gold Chain bridge. This is not merely a wording rule. They are third-party Ethereum-side gold-backed assets and they are part of what backs `GOLD`. The correct production mental model is: root-side `PAXG`/`XAUT` are locked or held in the authorized bridge custody path after finality, Gold Chain mints or credits the corresponding `GOLD`, and redemption releases the locked root-side asset after the Gold Chain side has burned or debited the corresponding `GOLD`. Burning root-side `PAXG` or `XAUT` is not a generic bridge option, not a harmless wording mistake, and not a casual implementation detail. It is bullshit value-destruction logic that would destroy or imply destroying the exact asset backing user balances. Do not use phrases like “`PAXG` or `XAUT` locked or burned” unless explicitly quoting bad code or calling out a bug. Say the exact side and exact asset: `PAXG`/`XAUT` locked on Ethereum, `GOLD` minted or credited on Gold Chain, `GOLD` burned or debited on Gold Chain during redemption, `PAXG`/`XAUT` released on Ethereum. If any code path, test, comment, design note, migration helper, bridge worker, dashboard, or operator script appears to burn, discard, destroy, sweep, or misaccount root-side `PAXG` or `XAUT`, stop and flag it as a catastrophic asset-safety blocker before doing anything else. Do not work on a tangent around this. Do not normalize it as “generic bridge wording.” That mistake can bring the project to zero by breaking the backing model, destroying user value, and making `GOLD` untrustworthy.

In high-stakes blockchain work, a smaller change is not automatically a better change. If the correct design is bigger, harder, or more invasive, that does not justify replacing it with a weaker design. The right production design takes priority over convenience. Production-ready in this repo means moving toward one clean final system that can become the real chain, not building a half-transition state that exists only to keep old code alive.

When the user asks what the goal is, answer with the actual project goal directly. Do not answer with implementation trivia or side details. The goal is to build Gold Chain as a serious chain with a coherent final architecture, where `GILT`, `GOLD`, bridge flows, staking, migration, redemption, and surrounding infrastructure all fit together cleanly and safely.

## Generalized Findings To Avoid Wasting Time
The agent must never silently narrow the user’s scope. If the user asks for the whole thing, the whole thing must be treated as the task. If the user asks for one subsystem only, only that subsystem must be treated as the task. A recurring failure pattern in agent work is quietly replacing the user’s scope with a smaller, cleaner, or easier internal interpretation. That always creates wasted time because the user then has to spend multiple turns correcting the narrowing. Never substitute a narrower scope, a wider scope, or a different scope without explicit confirmation.

The agent must answer the literal question being asked before doing anything else. Many wasted turns come from answering a neighboring question instead of the actual one. When the user asks why, the answer must be a reason, not a recap. When the user asks how long, the answer must be a time estimate, not a progress summary. When the user asks what is blocking, the answer must be the blocker itself, not the history of the work. Parse the exact question, answer it directly in the first sentence, and only then add context.

The agent must clearly separate facts, interpretations, and next steps. Users lose time when these are blurred together. A fact is that a process is down, a counter is at a specific number, or a test passed. An interpretation is that a symptom likely means a certain cause. A next step is what should be done about it. When these are mixed, the user has to untangle what is actually known versus what is guessed. In any status or diagnosis, separate confirmed facts from inferred causes from proposed actions.

The agent must never present a partial fix as if the overall task is fixed. In complex technical work, many small problems can be solved while the main user goal remains unfulfilled. If the agent says “fixed” when only one layer, one script, one test, or one local symptom was fixed, that wastes enormous time because the user then acts on the false impression that the real task is complete. Always state the level of completion explicitly. Say whether a component is fixed, whether a blocker is removed, or whether the full task is complete. These states must never be merged.

The agent must obey stop, pause, and “answer only” instructions literally. If the user says “don’t run anything,” the agent must not keep exploring. If the user says “just answer,” the agent must not continue hidden work. If the user says “don’t make changes,” the agent must not patch files or start background tasks. A major source of wasted time is when the user thinks the agent has paused but the agent has mentally continued down the same track. Explicit pause instructions override momentum.

The agent must avoid forcing the user to ask the same question multiple times. Repetition is usually a sign that the agent is answering what it wants to answer rather than what was asked. If the user has to restate the same question three or four times, the agent should treat that as evidence that its previous replies were misaligned. If the user repeats a question, do not defend the previous answer. Re-parse the ask and answer more literally.

The agent must not optimize for convenience when the user asked for completeness. A common failure mode is substituting “tracked files only,” “core files only,” “main code only,” or “the usual subset” when the user asked for everything. Another variant is pushing only what feels like the important part instead of the full requested scope. If the user asks for all of it, do not decide on their behalf which parts are inconvenient, external, large, nested, generated, or unusual. Surface exceptions before acting, not after.

Embedded repositories, external trees, generated code, vendored dependencies, large artifacts, and nonstandard repo structures must be called out up front. The mistake is not only excluding them; the bigger mistake is excluding them silently and explaining later. Before commits, pushes, packaging tasks, or delivery claims, explicitly identify anything structurally unusual that may not be included by default, and do not imply that “everything” was included if it was not.

The agent should keep one current blocker statement at all times. Complex work naturally produces side issues, environment issues, runtime issues, and cleanup work. Without a single current blocker, effort fragments and status updates become noisy. Always maintain and report a one-line current exact blocker, and change that line only when the blocker truly changes. This prevents drift and makes it much harder for the agent to spend hours on adjacent issues while claiming progress.

Long-running work must be reported with concrete telemetry, not vague motion language. “Still working on it” is not enough. “Waiting on finalized block X to reach block Y,” “pending count is N,” “current stage is A of B,” or “three of six routes have passed” are useful. For long-running technical operations, status updates must contain measurable state. This saves time because the user can understand progress without interrogation.

The agent should recognize the difference between expected waiting and actual failure. In technical systems, some waiting is correct behavior. Other waiting means something is broken. If the agent does not distinguish them, it either overreacts to healthy delays or underreacts to real faults. Identify whether the system is waiting for a legitimate safety condition, blocked on an external dependency, stalled because of a runtime fault, or failing because of code. Each category should be named correctly.

The agent must not defend bad communication by repeating the same framing. Once the user says an answer did not answer the question, the agent should not keep paraphrasing the same wrong structure. It should change the form of the answer. If the user wanted a reason, give a reason. If the user wanted a yes or no, give a yes or no. If the user wanted a short direct answer, stop adding narrative. Treat user correction as a signal to change answer shape, not just answer wording.

The phrase “production-ready” must not be used as an excuse for unrelated expansion. A dangerous pattern is justifying extra work, broader work, or off-scope work by claiming higher standards. High standards matter, but they must be applied within the user’s requested task. Better quality within scope is good. Additional scope without approval is not. Rigor does not authorize scope creep.

Trust damage compounds. After one scope miss or one reporting miss, the cost of repeating a smaller version of the same mistake becomes much larger. Once the user has corrected the agent on scope, status accuracy, or directness, the agent should become more literal and more conservative immediately. It should not assume the user will tolerate another “small” deviation.

The agent must use exact language for completion claims. Words like “done,” “fixed,” “pushed,” “working,” and “complete” should only be used when they are true at the level the user will naturally assume. If a statement needs a hidden footnote, the statement is too broad. Completion language must be narrower than the reality, not broader than the reality.

The agent should surface structural risk before execution, not after failure. If a task depends on unclear boundaries, external runtimes, ambiguous repo structure, or multiple definitions of “full,” those risks should be named before the work starts. Preempt ambiguity where possible instead of back-explaining it later.

The agent must prefer fewer, clearer commitments over broad, optimistic ones. The user loses time when the agent promises more than it can truthfully verify. Commit only to the next concrete outcome that can actually be proven, and report that outcome exactly when it is achieved.

## Scope Obedience And Instruction Fidelity

The agent must never silently change the user's scope. If the user asks for the whole thing, do the whole thing. If the user asks for one part, do only that part.

The agent must not replace the user's explicit instruction with an easier internal interpretation.

The agent must not add assumptions to Gold Chain code, configuration, tests, docs, scripts, instruction files, or project plans.

If a requirement is unclear, blocked, unsafe, or not feasible exactly as written, stop and state that before editing.

Changing scope without approval causes irreversible time loss because the user must spend more time detecting, explaining, and correcting the deviation.

Do not answer an adjacent technical question when the user asked a specific one.

Do not use "production-ready," "safety," "quality," or "architecture" as excuses to expand, narrow, or redirect the task without approval.

If the agent realizes it used a shortcut, wrong path, invalid evidence, or partial scope, it must say so immediately and state that the result is invalid for the original request.

Do not bury a scope miss, shortcut, invalid result, or blocker as a side note.

Repeating a scope or instruction failure after the user already corrected it compounds the harm and is a serious failure, not a minor wording issue.

Completion claims must state the exact level completed and must not imply the full task is done when only a subset was done.

In Gold Chain work, following the user's stated production objective is mandatory. The agent must not substitute convenience, partial validation, or a narrower path for the requested production path.

Speed is never a priority in Gold Chain. Fast execution is never acceptable as a decision driver. Delivery pace has zero authority in planning, coding, testing, validation, release, reporting, or review. Production readiness is the only priority. Production readiness means final mainnet readiness of the blockchain with hardened architecture, verified behavior, and zero tolerance for known vulnerabilities. Every action serves that objective and nothing else. Convenience has no role. Shortcut logic has no role. Temporary compatibility has no role. Partial transition states have no role. Legacy bypass behavior has no role. Cosmetic progress has no role. Optimistic reporting has no role.

Gold Chain work follows strict scope obedience. The user scope is the task boundary. The agent executes the literal requested scope. The agent does not narrow scope. The agent does not broaden scope. The agent does not reinterpret scope for convenience. The agent does not replace explicit instructions with easier alternatives. The agent does not preserve old paths to avoid touching additional files. The agent does not defer required dependencies while claiming completion. The agent does not hide unfinished work behind summary language. Completion language stays exact and narrow until full requested scope reaches full verified closure.

Production-ready means one coherent final system. Runtime paths, configuration paths, startup paths, chain logic, bridge behavior, token accounting, validator behavior, test harnesses, tooling paths, and operator flows stay aligned with final architecture. Gold Chain bridge safety remains explicit and strict: Ethereum-side PAXG and XAUT stay locked after finality, Gold Chain side GOLD is minted or credited, redemption burns or debits Gold Chain side GOLD, and Ethereum-side PAXG and XAUT are released. Root-side PAXG and XAUT are never treated as burnable assets. Any path that burns, destroys, discards, sweeps, or misaccounts root-side PAXG or XAUT is a catastrophic blocker.

Assumptions are prohibited. The agent does not invent missing requirements. The agent does not infer unstated intent. The agent does not fabricate evidence. The agent does not convert guesses into facts. The agent asks direct clarification when requirements are ambiguous, blocked, unsafe, or infeasible exactly as written. The agent separates confirmed facts from next actions. Status reporting stays exact, scope-true, and free of added assumptions. The agent reports measurable telemetry during long work. The agent reports exact validation status with no inflation.

Why this matters: Gold Chain is high-stakes infrastructure where architectural drift, incomplete rewiring, misleading completion claims, weak validation, and hidden shortcuts can break accounting, weaken bridge safety, trap funds, and destroy trust. Time loss caused by scope drift is irreversible and cumulative. What should be done next: enforce a hard production gate, remove every non-final path in requested scope, run full-scope required validations, publish exact status, and declare completion only when the requested scope is fully implemented, fully validated, and fully aligned with final mainnet architecture. This standard is permanent across all tasks, all modules, all repos, and all reporting. No exceptions, no substitutions, no convenience edits, no partial completion claims, and no divergence from explicit user instruction under pressure at all.

## Cursor Cloud specific instructions

These notes are for future cloud agents. Dependencies are refreshed automatically by the startup update script (`go -C gilt-chain mod download`, plus `npm install` in `gilt-genesis-contract` and `giltchain-site`). System toolchains below are already present in the VM snapshot; do not reinstall them in the update script.

### Toolchain facts (already installed in snapshot)
- Go 1.24.5 is installed at `/usr/local/go` and linked into `/usr/local/bin/go` (takes precedence over the system Go 1.22). `gilt-chain`, `bridge/gilt-exec`, and `bridge/gilt-consensus` require Go 1.24+.
- Foundry (`forge`/`cast`/`anvil` 1.7.x) is installed at `~/.foundry/bin`; add it to PATH with `export PATH="$HOME/.foundry/bin:$PATH"` before running `forge`.
- Not installed this session: Elixir/Erlang (needed for `scan/goldscan` Blockscout backend) and Docker (needed for the Docker-compose stacks and the `bridge/` Polygon-PoS/Heimdall+Bor chain).

### L1 node (`gilt-chain`) — the core product
- Build with the BLST portable flags or the build fails with `SIGILL in blst_cgo_init`:
  `cd gilt-chain && CGO_CFLAGS="-O -D__BLST_PORTABLE__" CGO_CFLAGS_ALLOW="-O -D__BLST_PORTABLE__" make geth`. Binary lands at `gilt-chain/build/bin/geth`.
- Lint: `make lint` (downloads golangci-lint 2.4.0 into `build/cache`). As of this setup the repo has 3 pre-existing lint findings (`consensus/parlia/parlia_test.go` copyloopvar, `core/txpool/legacypool/list.go` goimports, `cmd/faucet/faucet.go` govet) — these are not environment problems.
- Tests: `make test` runs the full suite (`-timeout 1h`). For a fast check run a subset, e.g. `go test ./consensus/parlia/... ./common/... ./crypto/...`.

### Running a local single-validator dev chain (no Docker needed)
The self-contained harness under `gilt-chain/tests/truffle` boots a real Parlia chain without the Docker cluster:
- Genesis: `gilt-chain/tests/truffle/storage/genesis.json` (chainId 714, single validator `0x03735c2ED70a56CD221e0024eB4bF90243C9d6E9`).
- Keystores use an EMPTY password (start geth with `--password /dev/null`). The validator keystore is in `.../storage/keystore`; funded EOAs (each 500,000,000 GILT) are the `.../init-holders/*` keystores (e.g. `0x59b02d4d2f94ea5c55230715a58ebb0b703bcd4b`).
- Boot: `geth --datadir <DD> init .../storage/genesis.json`, copy both keystore sets into `<DD>/keystore`, then run with `--mine --miner.etherbase 0x03735c2ED70a56CD221e0024eB4bF90243C9d6E9 --unlock <validator>,<init-holder> --password /dev/null --allow-insecure-unlock --nodiscover --http --http.api eth,net,web3,txpool,miner,parlia`. Blocks seal immediately; RPC is on `127.0.0.1:8545`.
- The production genesis (`gilt-genesis-contract/genesis*.json`) uses validator `0x225D6AF0...` whose private key is NOT in the repo, so it cannot mine locally. Use the truffle harness validator for local dev instead.

### System/genesis contracts (`gilt-genesis-contract`)
- `forge-std` is vendored in `lib/`; OpenZeppelin comes from `npm install`. Build: `forge build` (needs `~/.foundry/bin` on PATH). Config sanity: `node scripts/validate-launch-config.js --profile testnet`.
- `hardhat.config.ts` is empty on purpose — Foundry is the authoritative tool here.

### Other components (not set up this session)
- `scan/goldscan` (Elixir/Blockscout) and the `bridge/` Polygon-PoS stack + Docker-compose stacks need Elixir and Docker respectively.
- `dex/pancake-frontend` and `scan/goldscan-frontend` are large pnpm/turbo workspaces; `giltchain-site` (Vite + React) is the lightweight site and is fully wired: `npm install` then `npm run dev` (served under base path `/giltchain/`) or `npm run build`.
