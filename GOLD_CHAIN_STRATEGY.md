# GOLD CHAIN: Yield-Bearing Gold L1 Blockchain Strategy

## EXECUTIVE SUMMARY

**The Problem**: Commodities don't pay yield. Physical gold, PAXG, gold ETFs - all earn 0%.

**The Solution**: A two-token L1 blockchain where gold-backed tokens earn 7-13% APY from actual network activity (gas fees).

**The Unique Value Proposition**: First yield-bearing gold token backed by real reserves.

---

## PART 1: TECHNICAL ARCHITECTURE

### 1.1 Blockchain Framework: BSC Fork

**Why BSC Fork:**
- EVM compatible (Solidity, existing tooling)
- Proven at scale (12M+ daily transactions)
- Fast finality (<2 seconds)
- Low gas fees (~$0.02/tx)
- Two-token gas support already exists in codebase
- Open source (Apache License, free to fork)

**Hardware Requirements (Per Validator):**
- 8-core CPU
- 16GB RAM
- 2TB NVMe SSD
- Azure cost: ~$150-200/month per node
- Self-hosted: $0 (existing ETH node hardware works)

**System Contracts to Modify:**
1. `StakeHub.sol` - Add two-token reward distribution
2. `BSCValidatorSet.sol` - Track validator rewards in both GOLD and GOV
3. Genesis configuration - Register both tokens as valid gas tokens

**Infrastructure Stack:**
- L1 Blockchain: BSC fork (3 validators initially)
- Block Explorer: Blockscout (open source, self-hosted)
- DEX: ve(3,3) fork - Velodrome/Aerodrome (open source MIT, separate protocol with own token)
- Bridge: Sygma (open source LGPL, ChainSafe)
- Oracle: Uniswap TWAP (on-chain, no external dependency)

---

### 1.2 Bridge Architecture (Sygma-Based)

**Why Sygma:**
- Open source (LGPL v3.0 license)
- Evolution of ChainSafe's ChainBridge (secured billions before evolving)
- Production-proven EVM-to-EVM bridging
- Modular relayer architecture - swap their relayer set for your validators
- Handles lock-mint-burn pattern out of the box
- Repos: github.com/sygmaprotocol/sygma-core, github.com/ChainSafe/sygma-ui

**Components:**

1. **Vault Contract (Ethereum)**
   - Stores PAXG + XAUT in escrow
   - Emits events: `GoldLocked(user, tokenType, amount, nonce)`
   - Tracks separately: `paxgLocked[user]`, `xautLocked[user]`
   - tokenType: 0 = PAXG, 1 = XAUT

2. **GOLD Token Contract (Your L1)**
   - Verifies Ethereum block proofs via Sygma's verification module
   - Mints GOLD when proof validated
   - 100 GOLD per 1 PAXG or 1 XAUT locked
   - Tracks origin: `goldFromPaxg`, `goldFromXaut` (for redemption routing)

3. **Relayer Set (Your Validators)**
   - Replace Sygma's default relayers with your GOV stakers
   - Threshold signature: 5-of-7 relayers must sign
   - Monitors Ethereum for `GoldLocked` events
   - Waits 12 blocks for Ethereum finality
   - Submits signed proof to your L1

**Deposit Flow:**
```
User approves PAXG/XAUT to Vault contract
User calls vault.deposit(tokenType, amount)
    -> Vault transfers PAXG/XAUT from user
    -> Vault emits GoldLocked(user, tokenType, amount, nonce)
    -> Relayers detect event, wait 12 blocks
    -> 5-of-7 relayers sign attestation
    -> Any relayer submits signed proof to L1
    -> L1 verifies 5-of-7 threshold signature
    -> L1 mints 100 GOLD per token deposited
    -> User receives GOLD on L1
```

**Redemption Flow:**
```
User calls l1Bridge.redeem(amount, preferredToken)
    -> L1 burns GOLD from user
    -> L1 emits GoldRedeemed(user, amount, preferredToken, nonce)
    -> Relayers detect event on L1
    -> 5-of-7 relayers sign attestation
    -> Proof submitted to Ethereum vault
    -> Vault verifies signature, releases PAXG or XAUT
    -> User receives gold token on Ethereum
```

**Redemption Token Selection:**
- User specifies preference (PAXG or XAUT)
- If preferred token insufficient, falls back to other
- Contract maintains: `availablePaxg`, `availableXaut`

**Safety Mechanisms:**
- Nonce tracking prevents double-spending
- 5-of-7 threshold prevents single relayer compromise
- 12-block wait prevents reorg attacks
- Merkle proof verification ensures event authenticity
- Relayer misbehavior: Slash their GOV stake

**Governance-Controlled Bridge Pause (GOLD Bridge Only):**

The GOLD bridge (PAXG/XAUT) has a governance-controlled pause mechanism for supply cap enforcement. This does NOT apply to wUSDC, wUSDT, or wETH bridges.

| Feature | GOLD Bridge | Other Bridges (wUSDC/wUSDT/wETH) |
|---------|-------------|----------------------------------|
| Pause mechanism | Yes (governance-controlled) | No |
| Supply cap | Can be enabled by governance | No cap |
| Redemptions | Always enabled (never paused) | Always enabled |

**How the Pause Works:**

1. **Governance Vote on L1:**
   - GOV holders vote to enable supply cap (triggered when APY < 3% for 30 days)
   - Vote passes with quorum (4M GOV) + majority
   - L1 emits `BridgePauseVoted(pauseEnabled, timestamp)`

2. **Relayers Bridge the Decision:**
   - Relayers detect `BridgePauseVoted` event on L1
   - 5-of-7 relayers sign attestation
   - Relayers submit signed proof to Ethereum vault contract

3. **Ethereum Vault Updates State:**
   - Vault verifies 5-of-7 threshold signature
   - Vault sets `depositsPaused = true` for PAXG/XAUT
   - Vault emits `DepositsStatusChanged(paused: true)`

4. **Deposit Behavior When Paused:**
   - `vault.deposit(PAXG/XAUT)` → reverts with "Deposits paused by governance"
   - Redemptions ALWAYS work (no pause check on withdrawals)
   - Users can still exit at any time

5. **Lifting the Pause:**
   - APY recovers above 5% for 14 consecutive days
   - Governance votes to lift cap
   - Same relayer flow: L1 event → relayers sign → vault sets `depositsPaused = false`

**Vault Contract Pseudo-logic:**
```
// State
bool public depositsPaused = false;

// Only GOLD deposits can be paused
function deposit(uint8 tokenType, uint256 amount) external {
    require(!depositsPaused, "Deposits paused by governance");
    // ... normal deposit logic
}

// Redemptions NEVER check pause state
function redeem(address user, uint256 amount, uint8 preferredToken) external onlyRelayers {
    // NO pause check here - redemptions always work
    // ... normal redemption logic
}

// Called by relayers with governance proof
function updatePauseStatus(bool paused, bytes[] signatures) external {
    require(verifyThresholdSignature(signatures), "Invalid signatures");
    depositsPaused = paused;
    emit DepositsStatusChanged(paused);
}
```

**Why This Design:**
- Redemptions always work = users never trapped
- Only deposits paused = supply cap enforced
- Governance controlled = decentralized decision
- Relayers bridge the decision = trustless cross-chain

---

### 1.3 DEX Architecture (ve(3,3) Model)

**DEX is a Separate Protocol on Your L1**

The DEX is not part of the L1 tokenomics. It's a separate protocol you deploy and own, with its own token.

- **L1 tokens:** GOLD (backed), GOV (governance, validators)
- **DEX token:** Separate (e.g., SWAP) - ve(3,3) model with emissions

This mirrors how Velodrome is separate from Optimism, Aerodrome is separate from Base.

**Why ve(3,3):**
- Open source: github.com/velodrome-finance/contracts (MIT License)
- You own the DEX token = massive value capture
- Bribes revenue: Projects pay to attract liquidity
- Trading fees: veToken holders earn fees from pools they vote for
- Proven model: Velodrome dominates Optimism, Aerodrome dominates Base

**DEX Token (Separate from L1):**
- Name: TBD (e.g., SWAP, FLOW, etc.)
- Supply: Inflationary (weekly emissions to LPs)
- veToken: Locked DEX token for voting power
- You control initial distribution and own significant veToken position

**How ve(3,3) Works:**
1. LPs provide liquidity to pools
2. LPs stake LP tokens in gauges
3. Weekly DEX token emissions distributed to gauges
4. veToken holders vote which gauges get emissions
5. Projects bribe veToken holders to vote for their pools
6. veToken holders earn: trading fees + bribes

**Fee Structure:**
- 0.3% per swap (volatile pairs)
- 0.05% per swap (stable pairs)
- 100% of fees → veToken holders who voted for that pool

**Initial Pools:**
- GOLD/wETH (primary pair)
- GOLD/wUSDC (stablecoin exit)
- GOV/wETH (L1 governance token liquidity)
- GOV/GOLD (internal ecosystem)
- wETH/wUSDC (standard DeFi routing)

**Your Revenue as DEX Owner:**
- Hold significant veToken allocation (team/treasury)
- Earn bribes from projects wanting liquidity
- Earn trading fees from pools you vote for
- Can accumulate more veTokens over time

*Full DEX tokenomics in Section 2.6 (to be added after research)*

---

### 1.4 Block Explorer (Blockscout)

**Why Blockscout:**
- Open source (GPL-3.0 license)
- Self-hosted (no third-party dependency)
- EVM compatible out of the box
- Repo: github.com/blockscout/blockscout

**Staking UI Requirements:**

Blockscout has a staking module but it needs configuration. It's NOT automatic.

| Feature | MetaMask | Blockscout |
|---------|----------|------------|
| Show validator list | ❌ No | ✅ Yes (needs config) |
| Delegation UI | ❌ No | ✅ Yes (needs config) |
| APY display | ❌ No | ✅ Yes (needs config) |
| Sign transactions | ✅ Yes | ❌ No (uses MetaMask) |

**How staking works for users:**

1. User goes to Blockscout staking page (or standalone staking dApp)
2. Sees list of validators with APY, commission, total staked
3. Clicks "Delegate" on chosen validator
4. MetaMask pops up to sign the transaction
5. Done - user is now staking

**Setup required:**

- Enable Blockscout staking module
- Configure to read from chain's staking contracts (`StakeHub.sol`, `BSCValidatorSet.sol`)
- Connect validator metadata (names, logos, commission rates)
- Test delegation flow end-to-end

**Alternative:** Build standalone staking dApp if Blockscout's module doesn't support BSC-style staking natively. Simple React app that connects MetaMask, reads validator list from contracts, submits delegation transactions.

---

### 1.5 Liquid Staking Protocol (Lido Fork)

**Liquid Staking is a Separate Protocol on Gilt Chain**

Just like Lido is separate from Ethereum and has its own LDO token, the liquid staking protocol on Gilt Chain is a separate protocol with its own token.

- **L1 tokens:** GOLD (backed), GILT (governance, validators)
- **Liquid staking token:** Separate (e.g., LSTK) - inflationary, used for incentives

**Why Liquid Staking:**
- Users stake GOLD → get stGOLD (liquid receipt token)
- stGOLD can be traded, used as collateral, LP'd while still earning staking yield
- Unlocks liquidity without sacrificing yield

**Why Fork Lido:**
- Open source (GPL-3.0 license)
- Battle-tested (billions in TVL)
- Proven rebase mechanics
- Audited contracts
- Repo: github.com/lidofinance/core

**How It Works:**

1. **Stake:** User deposits 100 GOLD → receives 100 stGOLD
2. **Rebase:** stGOLD balance increases daily (e.g., 100 → 100.02 → 100.04...)
3. **Use in DeFi:** stGOLD can be:
   - Sold instantly on DEX (no unstaking wait)
   - Used as collateral in lending protocol
   - LP'd in stGOLD/GOLD pool for extra yield
4. **Unstake:** User burns stGOLD → waits 7 days → receives GOLD back

**Wrapped stGOLD (wstGOLD):**

Some DeFi protocols don't support rebasing tokens. wstGOLD solves this:

| Token | Balance | Value |
|-------|---------|-------|
| stGOLD | Increases daily (rebase) | 1 stGOLD ≈ 1 GOLD |
| wstGOLD | Fixed | Price increases to reflect rewards |

User can wrap/unwrap anytime: stGOLD ↔ wstGOLD

**Liquid Staking Token (Separate from L1):**

| Aspect | Details |
|--------|---------|
| Name | TBD (e.g., LSTK, STAKE) |
| Supply | Inflationary (emissions for incentives) |
| Purpose | Governance + liquidity incentives |

**Token Utility:**

1. **Liquidity Mining:** Stake stGOLD/GOLD LP → earn liquid staking token
2. **Governance:** Vote on protocol parameters (fees, node operators)
3. **Incentives:** Distributed to stGOLD holders to bootstrap adoption
4. **Fee Sharing:** Protocol takes cut of staking rewards → distributed to token stakers

**Fee Structure:**

| Fee | Amount | Recipient |
|-----|--------|-----------|
| Staking rewards | 90% | stGOLD holders (via rebase) |
| Protocol fee | 10% | Treasury + token stakers |

**Node Operators:**

The liquid staking protocol delegates staked GOLD to whitelisted validators. Protocol governance (token holders) votes on which validators to include.

**GPL-3.0 License Note:**

Forking Lido means the liquid staking contracts must remain open source under GPL-3.0. This is fine because:
- All smart contracts are visible on-chain anyway
- Open source builds trust
- Commercial use is still allowed

---

## PART 2: TOKENOMICS

### 2.1 L1 Two-Token Model

**The L1 has two tokens. The DEX and Liquid Staking protocols are separate with their own tokens.**

| Aspect | GOLD Token | GILT Token |
|--------|------------|-----------|
| **Purpose** | Stable value, transactions | Governance, validator staking |
| **Backing** | 100% PAXG/XAUT (1 gold token = 100 GOLD) | None (pre-mined) |
| **Supply** | Elastic (= gold tokens bridged x 100) | Fixed 100M (no inflation) |
| **Minting** | Only when PAXG/XAUT bridged | Cannot mint - all pre-mined |
| **Gas Payment** | Yes | Yes |
| **Staking Rewards** | Transaction fees only | Transaction fees only |
| **Volatility** | Low (tracks gold price) | High (speculative) |

**Gilt Chain Ecosystem - Separate Protocols:**

| Protocol | Token | Purpose |
|----------|-------|---------|
| L1 Blockchain | GOLD + GILT | Core chain, gas, governance |
| DEX (ve(3,3)) | Separate token | LP incentives, trading fees |
| Liquid Staking | Separate token | stGOLD liquidity incentives |
| Lending (Year 2) | TBD | Borrowing/lending incentives |

Each protocol is independent with its own token economics and governance.

---

### 2.2 GOLD Token Mechanics

**Supply Formula:**
```
GOLD Supply = (PAXG Locked x 100) + (XAUT Locked x 100)
```

**Key Properties:**
- **Elastic supply** - no hard cap
- Mint: User bridges 1 PAXG/XAUT → 100 GOLD minted on L1
- Burn: User redeems 100 GOLD → burned on L1, 1 PAXG/XAUT unlocked on Ethereum
- Theoretical max: ~45M GOLD (based on ~450K total PAXG supply)
- No governance vote needed to increase - automatically elastic based on bridged collateral

**Why No Hard Cap (But Governance Can Enable One):**
- GOLD is 100% backed, so more GOLD = more collateral locked = stronger system
- Yield dilution is natural and acceptable (see section 2.5)
- 1-3% APY on gold is still killer - nothing else offers yield on gold without lending counterparty risk

**Supply Cap Provision (Governance-Controlled):**

If staking APY drops too low, governance can enable a supply cap:

| Trigger | Action |
|---------|--------|
| Staking APY < 3% for 30 consecutive days | Governance can vote to enable cap |
| Vote passes (quorum + majority) | Cap = current GOLD supply at time of vote |
| Cap enabled | New bridging paused, redemptions still work |
| APY recovers above 5% for 14 days | Governance can vote to lift cap |

This protects yield attractiveness while keeping the default as elastic supply.

**Yield Sources (Fee Distribution ONLY - BSC Model):**
- GOLD cannot be minted for rewards (no inflation)
- Stakers earn proportional share of transaction fees paid by users
- APY = (Total fees collected) / (Total GOLD staked)
- Early: 15-30% APY (low supply, concentrated fees)
- Mature: 3-7% APY (still beats 0% everywhere else)

**Yield Token Composition:**

Users pay gas in GOLD or GOV (their choice per transaction). Stakers receive rewards in the same mix:

```
Block fees collected:
- User A pays 0.01 GOLD
- User B pays 0.05 GOV
- User C pays 0.02 GOLD

Validator/Staker receives: 0.03 GOLD + 0.05 GOV (mixed)
```

**Why mixed rewards are good:**
- Diversified yield (not dependent on single token)
- GOLD portion = stable value (tracks gold price)
- GOV portion = speculative upside
- No auto-conversion needed (simpler, no DEX dependency)

---

### 2.3 GOV Token Mechanics

**Total Supply:** 100M GOV (fixed, all pre-mined at genesis)

**Distribution:**
| Allocation | Amount | Purpose | Unlock Schedule |
|------------|--------|---------|-----------------|
| Airdrop (4 Seasons) | 40M | Early bridgers, LPs, active users, migrators | Per season vesting (see Section 3.1) |
| Treasury | 35M | Governance-controlled | Locked, GOV vote to release |
| Team/Ops | 20M | Development, operations | 12-month cliff, 24-month linear vest |
| Emergency Reserve | 5M | Security, bug bounties | Multisig controlled |

**Note:** LP incentives come from the DEX token (separate protocol), NOT GOV. See Section 2.6.

**No Inflation:**
- All 100M GOV exist at genesis
- No new GOV can ever be minted
- Scarcity increases as tokens get locked in staking/governance

**GOV Utility:**
1. **Gas payment** - Pay transaction fees in GOV instead of GOLD
2. **Governance voting** - Protocol parameter changes, treasury spending
3. **Validator staking** - Stake GOV to run validator node
4. **Bridge security** - Relayers must stake GOV (slashed if misbehave)

**Governance Powers:**
- Change fee parameters (gas price floors, distribution ratios)
- Add new collateral types (future gold tokens)
- Protocol upgrades (contract migrations)
- Treasury spending (grants, partnerships)
- Emergency actions (pause bridge, freeze malicious contracts)

**Governance Mechanics (Based on OpenZeppelin Governor):**

| Parameter | Value |
|-----------|-------|
| Proposal threshold | 100,000 GOV (0.1% of supply) |
| Voting period | 7 days (604,800 blocks at 0.75s) |
| Quorum | 4% of total supply (4M GOV) |
| Timelock delay | 48 hours (standard proposals) |
| Emergency timelock | 6 hours (guardian-initiated) |
| Vote options | For, Against, Abstain |

**Proposal Lifecycle:**
1. **Create:** Holder with ≥100,000 GOV submits proposal
2. **Delay:** 1 day before voting starts (allows discussion)
3. **Vote:** 7-day voting period
4. **Queue:** If passed (quorum + majority For), enters timelock
5. **Execute:** After timelock delay, anyone can execute

**Guardian Multisig (Emergency Only):**
- 3-of-5 multisig held by team initially
- Can pause bridge, pause DEX, freeze specific addresses
- Cannot: mint tokens, change backing, access treasury
- Must be ratified by governance within 7 days or auto-reverts
- Transferred to community multisig in Year 2

---

### 2.4 Gas Fee Economics (BSC Model)

**BSC Gas Mechanics (What We Inherit):**

| Parameter | BSC Value | Your Chain |
|-----------|-----------|------------|
| Block time | 0.75 seconds (post-Maxwell) | 0.75 seconds |
| Finality | ~1.875 seconds (fast finality via BEP-126) | ~1.875 seconds |
| Gas price model | EIP-1559 with base fee = 0 | EIP-1559 with base fee = 0 |
| Min gas price | 1 gwei | 1 gwei (configurable) |
| Block gas limit | 140M gas | 140M gas |
| Gas per simple transfer | 21,000 | 21,000 |

**How Gas Price Works (EIP-1559 Variant):**
- BSC uses EIP-1559 transaction format but with base fee fixed at 0
- Users set `maxFeePerGas` and `maxPriorityFeePerGas`
- Validators receive the priority fee (tip)
- No base fee burning (unlike Ethereum) - separate burn mechanism instead

**Your Model:**
- Users pay gas in GOLD or GOV (their choice per tx)
- Block proposer gets the fees from transactions in their block
- No GOLD inflation (backed token, can't inflate)
- No GOV inflation (fixed supply, can't inflate)

**Fee Split (Configurable in System Contracts):**

| Recipient | Share |
|-----------|-------|
| Block Validator | 70% |
| Protocol Treasury | 20% |
| Burn | 10% |

Example: User pays 0.01 GOLD gas fee
- Validator gets: 0.007 GOLD
- Treasury gets: 0.002 GOLD
- Burned: 0.001 GOLD

Treasury accumulation funds: development, physical gold acquisition, GOV buybacks.

Burn creates deflationary pressure on GOLD (offset by new minting when users bridge).

**Staking Yield (Separate from Gas):**
GOLD and GOV staking yield comes from:
1. **DEX trading fees** - 0.3% per swap, distributed to LPs
2. **Bridge fees** - 0.1% on deposits/withdrawals, distributed to stakers
3. **Protocol fees** - future revenue streams

**Yield Calculation Example:**
```
DEX volume: $100K/day
Bridge volume: $50K/day

DEX fees (0.3%): $300/day to LPs
Bridge fees (0.1%): $50/day to GOLD stakers

If 1M GOLD staked:
$50/day / 1M GOLD = $0.00005/GOLD/day
= $0.018/GOLD/year
= 1.8% APY at $1/GOLD

Higher volume = higher APY
Lower GOLD staked = higher APY per token
```

**No Inflation Subsidy:**
Unlike Solana/Cosmos that print tokens to pay stakers, your stakers earn only from actual economic activity. This means:
- Early: Lower APY (less activity)
- Growth: APY increases with usage
- Mature: Sustainable yield from real fees

---

### 2.5 Yield Expectations

**Reality Check:**
- GOLD yield comes from fees, not inflation
- More GOLD staked = lower yield per token (same fees, more stakers)
- This is natural and acceptable

**Yield Trajectory:**
| Phase | GOLD Staked | Daily Fees | APY |
|-------|-------------|------------|-----|
| Launch | 100K GOLD | $50 | 18% |
| Growth | 500K GOLD | $200 | 14% |
| Mature | 2M GOLD | $500 | 9% |
| Scale | 10M GOLD | $2,000 | 7% |

**Why 3-7% Mature APY is Still Killer:**
- Physical gold: 0% yield
- PAXG: 0% yield
- Gold ETFs: -0.4% (management fee)
- Bank gold accounts: 0% yield

Even 3% APY on gold is unprecedented. The pitch isn't "high APY" - it's "any APY on gold at all."

**No Artificial Inflation:**
- Cannot mint GOLD to boost APY (would break backing)
- Cannot mint GOV to boost APY (fixed supply)
- Yield must come from real usage
- This is a feature, not a bug - sustainable model

---

### 2.6 DEX Token (ve(3,3) Model) - Separate Protocol

**The DEX is a separate protocol you own, deployed on your L1. It has its own token.**

This mirrors Velodrome on Optimism, Aerodrome on Base. You own the DEX, you own the token, you capture the value.

**Repo:** github.com/velodrome-finance/contracts (MIT License) or github.com/aerodrome-finance/contracts

---

#### Token Name & Supply

**Name:** TBD (e.g., FLOW, SWAP, AURA, etc.)

**Initial Supply:** 500M tokens

**Max Supply:** Uncapped (inflationary via emissions)

---

#### Initial Distribution (Based on Aerodrome Model)

| Allocation | % | Amount | Purpose |
|------------|---|--------|---------|
| veToken Airdrop (locked) | 40% | 200M | Airdrop to GOV stakers as locked veTokens |
| Ecosystem/Protocols | 21% | 105M | Grants to protocols building on your L1 |
| Liquidity Pools | 5% | 25M | Seed initial liquidity |
| Team | 10% | 50M | veToken locked, voting for key pairs |
| Treasury | 24% | 120M | Protocol-owned liquidity, future grants |

**Key:** 90% of initial supply is locked as veTokens (cannot be sold immediately).

---

#### Emission Schedule

**Initial Phase (Weeks 1-14): Growth Mode**
- Starting emissions: 10M tokens/week
- Growth rate: +3% per week
- By week 14: ~15M tokens/week

**Decay Phase (Week 15+): Sustainable Mode**
- Decay rate: -1% per week
- Week 67: ~3.5M tokens/week
- Emissions continue indefinitely but decrease

**Governance Control (After Week 67):**
- veToken holders vote weekly on emission rate
- Range: 0.01% to 1% of total supply per week
- Prevents runaway inflation or complete stop

---

#### veToken Mechanics

**Locking:**
- Lock DEX tokens for 1 week to 4 years
- Longer lock = more voting power
- 4-year lock = 1:1 voting power
- 1-year lock = 0.25 voting power
- Voting power decays linearly as lock expires

**What veToken Holders Earn:**
1. **100% of trading fees** from pools they voted for
2. **Bribes** from protocols wanting emissions directed to their pools
3. **Rebase** (anti-dilution) - veToken holders receive proportional new emissions

---

#### Fee Structure

| Pool Type | Trading Fee | Distribution |
|-----------|-------------|--------------|
| Volatile pairs (GOLD/wETH) | 0.3% | 100% to veToken voters |
| Stable pairs (wUSDC/wUSDT) | 0.05% | 100% to veToken voters |

**Key difference from Uniswap:** Fees go to veToken voters, NOT LPs. LPs earn from emissions only.

---

#### Gauge Voting & Bribes

**Weekly Epoch:**
1. veToken holders vote for which pools receive emissions
2. Votes determine emission allocation to each pool's gauge
3. LPs stake LP tokens in gauges → earn DEX token emissions
4. Protocols bribe veToken holders to vote for their pools

**Bribe Economics:**
- Protocol wants liquidity for TOKEN/wETH pool
- Protocol offers 10,000 TOKEN as bribe
- veToken holders vote for TOKEN/wETH gauge
- Gauge receives emissions → attracts LPs → liquidity deepens
- veToken voters split the 10,000 TOKEN bribe proportionally

---

#### Your Revenue as DEX Owner

**Team veToken Position (50M tokens locked):**
- Vote for GOLD/wETH, GOLD/wUSDC, GOV/wETH pools
- Earn 100% of trading fees from those pools
- Earn bribes from protocols wanting emissions

**Example (Mature DEX):**
```
Daily volume: $5M
Fee rate: 0.3% average
Daily fees: $15,000

Your veToken = 10% of voting power
Your fee share: $1,500/day = $547K/year

Plus bribes from protocols:
Average $500/week in bribes
= $26K/year

Total: ~$573K/year from DEX ownership
```

**Treasury veToken Position (120M tokens worth):**
- Accumulate more veTokens over time
- Increase voting power → increase revenue share
- Can sell accumulated fees for runway

---

#### DEX Token Value Capture

**Why the DEX token has value:**
1. **Real yield** - Fees + bribes paid to veToken holders
2. **Governance** - Control emission direction
3. **Scarcity** - Most tokens locked 2-4 years
4. **Demand** - Protocols buy tokens to bribe/accumulate veTokens

**Flywheel:**
- More TVL → more volume → more fees
- More fees → higher veToken yield
- Higher yield → more demand for DEX token
- Higher token price → more attractive emissions
- More attractive emissions → more TVL

---

#### Comparison: Your DEX vs Aerodrome

| Metric | Aerodrome (Base) | Your DEX |
|--------|------------------|----------|
| Initial supply | 500M | 500M |
| veToken airdrop | 40% to veVELO | 40% to GOV stakers |
| Week 1 emissions | 10M | 10M |
| Emission decay | 1%/week after epoch 14 | 1%/week after epoch 14 |
| Trading fee | 0.3%/0.05% | 0.3%/0.05% |
| Fee recipient | veAERO voters | veToken voters |

---

## PART 3: BOOTSTRAP & LAUNCH STRATEGY

### 3.1 GOV Airdrop Strategy (4 Seasons)

**Why NOT a Sacrifice Phase:**
PulseChain's sacrifice worked because Richard Heart had a massive following. You're unknown - no one will send tokens to an unproven contract.

**How Other L1/L2s Did It:**

| Chain | Model | Allocation | Key Criteria |
|-------|-------|------------|--------------|
| Arbitrum | Points (3-15 scale) | 1.16B ARB (11.6%) | 6 criteria, min 3 points required, 625-10,250 token range, 2x multiplier for pre-Nitro activity, -1 point if all txs within 48hrs |
| zkSync | Time-weighted balance | 3.675B ZK (17.5%) | 7 binary criteria (1 point each), must score ≥1, allocation = daily balance avg over 366 days, DeFi positions count 2x, min 917 ZK / max 100K ZK |
| Starknet | Category-based | 700M STRK (7%) | 4 categories with hard thresholds: users (5 txs + 3 months + $100 volume + 0.005 ETH), devs (3 commits), StarkEx (8 txs), ETH stakers (pre-Merge) |
| Aptos | Two-tier flat | 20M APT (2%) | Testnet applicants = 300 APT flat, NFT minters = 150 APT flat, 110K addresses total |

---

## DEFINITIONS

Before eligibility criteria, these terms have exact meanings:

| Term | Definition |
|------|------------|
| **Snapshot block** | A specific L1 block number, chosen randomly within the announced snapshot day. All balances and states measured at this block. |
| **"Held" / "Balance"** | Token balance in wallet at snapshot block. Includes: tokens in wallet, tokens in approved staking contracts, LP tokens representing underlying assets. Excludes: tokens in pending bridge transactions, tokens in unapproved contracts. |
| **"Bridged"** | Completed a deposit via the GOLD bridge contract where: PAXG/XAUT was locked on Ethereum, corresponding GOLD was minted on L1, and mint transaction confirmed on L1. |
| **"Transaction"** | Any confirmed transaction on L1 where the address is the `msg.sender`. Includes: transfers, contract calls, approvals. Excludes: receiving tokens (not initiated by you), failed transactions, internal transactions. |
| **"Active day"** | A calendar day (00:00:00 - 23:59:59 UTC) where the address sent ≥1 confirmed transaction. |
| **"LP position"** | Liquidity deposited to Uniswap V2 pool contract, evidenced by holding LP tokens. Position value = (LP tokens held / total LP supply) × pool TVL at snapshot. |
| **"LP-day"** | 1 LP-day = holding $1 of LP position for 24 hours. Calculated as: (position value in USD at each block) × (blocks held / blocks per day). Sum across all blocks in measurement period. |
| **"Contract interaction"** | Transaction where `to` address is a smart contract (code size > 0) and transaction did not revert. |
| **"DEX swap"** | Transaction that emitted a `Swap` event from an approved DEX router or pool contract. |
| **"Governance vote"** | Transaction calling `castVote()` or `castVoteWithReason()` on the GOV governance contract. |

---

## TIMELINE

| Event | Timing | Duration |
|-------|--------|----------|
| Chain launch | Day 0 | - |
| Season 1 snapshot announcement | Day 166 | - |
| Season 1 snapshot | Day 180 (Month 6) | - |
| Season 1 claim window | Day 187 - Day 277 | 90 days |
| Season 2 snapshot | Day 365 (Month 12) | - |
| Season 2 claim window | Day 372 - Day 462 | 90 days |
| Season 3 snapshot | Day 548 (Month 18) | - |
| Season 3 claim window | Day 555 - Day 645 | 90 days |
| Migration window opens | Day 730 (Month 24) | - |
| Season 4 runs during migration | Day 730 - Day 912 | 182 days (6 months) |
| Season 4 claim window | Day 919 - Day 1009 | 90 days |
| Unclaimed tokens return to treasury | Day 1009 | - |

---

## SEASON 1: Early Bridgers

**Allocation:** 10,000,000 GOV

**Snapshot:** Block on Day 180, random within 24hr window, announced Day 166

**Measurement period:** Day 0 to snapshot block

---

**Eligibility (must meet ALL):**

| # | Requirement | Exact threshold |
|---|-------------|-----------------|
| 1 | Bridged PAXG or XAUT | ≥1 completed bridge deposit |
| 2 | GOLD balance at snapshot | ≥100 GOLD |
| 3 | Non-bridge transaction | ≥1 transaction where `to` ≠ bridge contract |
| 4 | Wallet ETH balance at snapshot | ≥0.001 GOLD or GOV (prevents dust wallets) |
| 5 | Not flagged as Sybil | Pass all Sybil checks (see below) |

---

**Points calculation:**

**Base points:**
```
base_points = floor(GOLD_balance_at_snapshot / 100)
```

**Time multiplier** (based on block number of first bridge deposit):
| First bridge occurred | Multiplier |
|-----------------------|------------|
| Day 0 - Day 30 | 2.0x |
| Day 31 - Day 60 | 1.75x |
| Day 61 - Day 90 | 1.5x |
| Day 91 - Day 120 | 1.25x |
| Day 121 - Day 180 | 1.0x |

**Early bridger bonus:**
| Bridge order (by block number) | Bonus points |
|--------------------------------|--------------|
| First 500 addresses | +1,000 |
| Addresses 501 - 1,000 | +500 |
| Addresses 1,001 - 2,500 | +250 |
| Addresses 2,501+ | +0 |

**Total points formula:**
```
total_points = (base_points × time_multiplier) + early_bonus
```

---

**Allocation formula:**
```
your_GOV = (your_total_points / sum_of_all_points) × 10,000,000
```

**Floor/Cap:**
- If calculated GOV < 500: receive 500 GOV (floor)
- If calculated GOV > 200,000: receive 200,000 GOV (cap)
- Excess from caps redistributed to floor recipients proportionally

**Vesting:**
- 50% claimable immediately at claim window open
- 50% vests linearly over 90 days (claimable daily)

---

**Example calculation:**

```
Address: 0xABC...
- Bridged 25 PAXG on Day 15 (within first 500 bridgers)
- Balance at snapshot: 2,500 GOLD
- Has 3 DEX swap transactions

Eligibility check:
✓ Bridged PAXG: Yes
✓ GOLD balance ≥100: 2,500 ≥ 100
✓ Non-bridge tx: 3 DEX swaps
✓ Wallet balance ≥0.001: Yes
✓ Sybil check: Passed

Points:
- Base: floor(2,500 / 100) = 25 points
- Time multiplier: Day 15 = 2.0x → 25 × 2.0 = 50 points
- Early bonus: First 500 = +1,000 points
- Total: 50 + 1,000 = 1,050 points

Allocation (assuming 500,000 total points across all users):
- Share: 1,050 / 500,000 = 0.21%
- GOV: 10,000,000 × 0.0021 = 21,000 GOV

Vesting:
- Day 187: Claim 10,500 GOV
- Day 188-276: Claim ~117 GOV per day
- Day 277: Final 117 GOV
```

---

## SEASON 2: Liquidity Providers

**Allocation:** 8,000,000 GOV

**Snapshot:** Block on Day 365

**Measurement period:** Day 0 to snapshot block

---

**Eligibility (must meet ALL):**

| # | Requirement | Exact threshold |
|---|-------------|-----------------|
| 1 | LP position in approved pool | ≥1 approved pool |
| 2 | Cumulative LP-days | ≥30 LP-days |
| 3 | Minimum position size (ever) | ≥$50 USD value at time of deposit |
| 4 | Position duration | LP held for ≥7 consecutive days at some point |
| 5 | Not flagged as Sybil | Pass all Sybil checks |

---

**Approved pools and weights:**

| Pool | Contract address | Weight |
|------|------------------|--------|
| GOLD/wETH | [deployed address] | 1.5x |
| GOLD/USDC | [deployed address] | 1.5x |
| GOV/wETH | [deployed address] | 1.0x |
| GOV/GOLD | [deployed address] | 1.0x |

---

**Points calculation:**

**LP-day calculation (per pool):**
```
For each block b from genesis to snapshot:
  position_value_usd = (your_lp_tokens / total_lp_supply) × pool_tvl_usd
  block_lp_days = position_value_usd / blocks_per_day

total_lp_days = sum of block_lp_days across all blocks
weighted_lp_days = total_lp_days × pool_weight
```

**Duration bonus:**
| Longest continuous LP period | Bonus |
|------------------------------|-------|
| ≥180 days | +2,000 points |
| ≥90 days but <180 days | +1,000 points |
| ≥30 days but <90 days | +500 points |
| <30 days | +0 points |

"Continuous" = no block where LP balance was 0

**Total points formula:**
```
total_points = sum(weighted_lp_days across all pools) + duration_bonus
```

---

**Allocation formula:**
```
your_GOV = (your_total_points / sum_of_all_points) × 8,000,000
```

**Floor/Cap:**
- Floor: 400 GOV
- Cap: 150,000 GOV

**Vesting:**
- 50% immediate
- 50% linear over 90 days

---

**Example calculation:**

```
Address: 0xDEF...
- Provided $5,000 to GOLD/wETH pool on Day 50
- Maintained position until snapshot (Day 365)
- Position grew to $6,200 by snapshot (price appreciation)

LP-days calculation:
- Days held: 315 days
- Average position value: ~$5,600
- Raw LP-days: 5,600 × 315 = 1,764,000 dollar-days
- Weighted (1.5x): 2,646,000 points

Duration bonus:
- Continuous days: 315 ≥ 180 → +2,000 points

Total: 2,646,000 + 2,000 = 2,648,000 points

Allocation (assuming 500,000,000 total points):
- Share: 2,648,000 / 500,000,000 = 0.53%
- GOV: 8,000,000 × 0.0053 = 42,400 GOV
- Cap check: 42,400 < 150,000 ✓

Vesting:
- Immediate: 21,200 GOV
- Over 90 days: 21,200 GOV
```

---

## SEASON 3: Active Users

**Allocation:** 6,000,000 GOV

**Snapshot:** Block on Day 548

**Measurement period:** Day 0 to snapshot block

---

**Eligibility (must meet ≥4 of 7 criteria):**

| # | Criterion | Threshold | How measured |
|---|-----------|-----------|--------------|
| 1 | Transaction count | ≥25 transactions | Count of confirmed txs where address = msg.sender |
| 2 | Active days | ≥15 unique days | Count of calendar days (UTC) with ≥1 tx |
| 3 | Gas spent | ≥1.0 GOLD in gas | Sum of (gasUsed × gasPrice) across all txs, converted to GOLD |
| 4 | DEX activity | ≥10 swaps | Count of txs emitting Swap event from approved DEX |
| 5 | Staking | ≥100 GOLD staked | Balance in staking contract at snapshot |
| 6 | Governance | ≥1 vote cast | Count of castVote() calls to governance contract |
| 7 | Contract diversity | ≥8 unique contracts | Count of distinct `to` addresses that are contracts |

---

**Points calculation:**

**Base points (for meeting criteria):**
| Criteria met | Base points |
|--------------|-------------|
| 4 of 7 | 400 |
| 5 of 7 | 550 |
| 6 of 7 | 750 |
| 7 of 7 | 1,000 |

**Scaling points (for exceeding thresholds):**

| Activity | Scaling formula |
|----------|-----------------|
| Transactions | +5 points per 10 txs beyond 25 (max +100) |
| Active days | +10 points per 5 days beyond 15 (max +100) |
| Gas spent | +20 points per 0.5 GOLD beyond 1.0 (max +200) |
| DEX swaps | +5 points per 5 swaps beyond 10 (max +50) |
| Staking | +10 points per 500 GOLD beyond 100 (max +100) |
| Governance | +50 points per vote beyond 1 (max +200) |
| Contracts | +5 points per 2 contracts beyond 8 (max +50) |

**Activity duration bonus:**
| Active in distinct months | Bonus |
|---------------------------|-------|
| ≥12 months | +500 points |
| ≥9 months | +300 points |
| ≥6 months | +150 points |
| <6 months | +0 points |

"Distinct month" = calendar month with ≥1 transaction

**Total points formula:**
```
total_points = base_points + sum(scaling_points) + duration_bonus
```

---

**Allocation formula:**
```
your_GOV = (your_total_points / sum_of_all_points) × 6,000,000
```

**Floor/Cap:**
- Floor: 300 GOV
- Cap: 75,000 GOV

**Vesting:** 100% immediate (no vesting)

---

**Example calculation:**

```
Address: 0xGHI...

Criteria check:
1. Transactions: 85 ✓ (≥25)
2. Active days: 42 ✓ (≥15)
3. Gas spent: 2.3 GOLD ✓ (≥1.0)
4. DEX swaps: 23 ✓ (≥10)
5. Staking: 0 GOLD ✗ (<100)
6. Governance: 3 votes ✓ (≥1)
7. Contracts: 12 ✓ (≥8)

Criteria met: 6 of 7 → Eligible

Base points: 750

Scaling:
- Txs: 85 - 25 = 60 extra → 60/10 × 5 = 30 points (capped at 100, so 30)
- Days: 42 - 15 = 27 extra → 27/5 × 10 = 50 points (capped at 100, so 50)
- Gas: 2.3 - 1.0 = 1.3 extra → 1.3/0.5 × 20 = 52 points (capped at 200, so 52)
- Swaps: 23 - 10 = 13 extra → 13/5 × 5 = 10 points (capped at 50, so 10)
- Staking: N/A (didn't meet threshold)
- Governance: 3 - 1 = 2 extra → 2 × 50 = 100 points (capped at 200, so 100)
- Contracts: 12 - 8 = 4 extra → 4/2 × 5 = 10 points (capped at 50, so 10)

Duration bonus: Active in 10 months → +300 points

Total: 750 + 30 + 50 + 52 + 10 + 100 + 10 + 300 = 1,302 points

Allocation (assuming 3,000,000 total points):
- Share: 1,302 / 3,000,000 = 0.0434%
- GOV: 6,000,000 × 0.000434 = 2,604 GOV
```

---

## SEASON 4: Migration Bonus

**Allocation:** 6,000,000 GOV

**Window:** Day 730 to Day 912 (6 months)

**No snapshot** - points calculated in real-time as migrations occur

---

**Eligibility (must meet ALL):**

| # | Requirement | Exact threshold |
|---|-------------|-----------------|
| 1 | Migration action | Completed migration tx on migration contract |
| 2 | Minimum amount | ≥100 GOLD migrated per address total |
| 3 | Source verification | GOLD must have been held ≥7 days before migration |
| 4 | Not flagged as Sybil | Pass all Sybil checks |

---

**Points calculation:**

**Base points per 100 GOLD migrated:**
| Migration timing | Points per 100 GOLD |
|------------------|---------------------|
| Day 730 - Day 760 (Month 1) | 100 points |
| Day 761 - Day 790 (Month 2) | 80 points |
| Day 791 - Day 821 (Month 3) | 60 points |
| Day 822 - Day 851 (Month 4) | 40 points |
| Day 852 - Day 882 (Month 5) | 20 points |
| Day 883 - Day 912 (Month 6) | 10 points |

**Loyalty multiplier:**
| Prior season participation | Multiplier |
|---------------------------|------------|
| Received airdrop in 0 prior seasons | 1.0x |
| Received airdrop in 1 prior season | 1.15x |
| Received airdrop in 2 prior seasons | 1.3x |
| Received airdrop in all 3 prior seasons | 1.5x |

**Total points formula:**
```
base_points = floor(GOLD_migrated / 100) × timing_points
total_points = base_points × loyalty_multiplier
```

---

**Allocation formula:**

Season 4 uses a fixed pool that depletes:
```
your_GOV = min(your_total_points × 1.5, remaining_pool × (your_points / pending_points))
```

First-come allocation with diminishing returns as pool depletes.

**Floor/Cap:**
- Floor: 250 GOV
- Cap: 100,000 GOV

**Vesting:** 100% immediate

---

**Example calculation:**

```
Address: 0xJKL...
- Migrates 3,000 GOLD on Day 775 (Month 2)
- Received airdrops in Season 1 and Season 3

Points:
- Base: floor(3,000 / 100) = 30 units
- Timing: Month 2 = 80 points per 100 GOLD
- Raw points: 30 × 80 = 2,400 points
- Loyalty: 2 prior seasons = 1.3x
- Total: 2,400 × 1.3 = 3,120 points

Allocation:
- If pool not depleted: 3,120 × 1.5 = 4,680 GOV
- Subject to cap: 4,680 < 100,000 ✓
```

---

## SEASON SUMMARY

| Season | Timing | Allocation | Eligibility | Floor | Cap | Vesting |
|--------|--------|------------|-------------|-------|-----|---------|
| 1 | Day 180 | 10M GOV | Bridge + 100 GOLD + 1 tx + 0.001 balance | 500 | 200K | 50/50/90d |
| 2 | Day 365 | 8M GOV | LP in approved pool + 30 LP-days + $50 min + 7d hold | 400 | 150K | 50/50/90d |
| 3 | Day 548 | 6M GOV | Meet 4 of 7 criteria | 300 | 75K | 100% |
| 4 | Day 730-912 | 6M GOV | Migrate ≥100 GOLD held ≥7 days | 250 | 100K | 100% |

**Total:** 30,000,000 GOV (30% of supply)

---

## SYBIL DETECTION (Based on Arbitrum/zkSync methodology)

**Graph-based clustering:**

Two transaction graphs built from L1 data:

1. **Funding graph:** Edge from A→B if A's first ETH/GOLD inbound came from B
2. **Sweep graph:** Edge from A→B if A's last significant outbound went to B

Clusters identified via:
- Strongly connected components (addresses that fund each other circularly)
- Louvain community detection algorithm on weakly connected subgraphs

**Cluster thresholds:**
| Cluster size | Action |
|--------------|--------|
| ≤10 addresses | No action |
| 11-20 addresses | Manual review |
| >20 addresses | All addresses disqualified |

---

**Behavioral Sybil flags (each flag = -1 point, disqualified if net points < minimum):**

| Flag | Condition | Rationale |
|------|-----------|-----------|
| Compressed activity | All transactions occurred within 48 hours | Arbitrum rule: bots batch actions |
| Dust wallet | Balance < 0.005 GOLD AND interacted with ≤1 contract | zkSync rule: Sybils minimize capital per wallet |
| CEX deposit clustering | Multiple addresses sent to same CEX deposit address within 30 days | zkSync rule: same person consolidating |
| Identical funding | Multiple addresses received first funding from same source, same amount (±5%), within 7 days | Batch wallet creation pattern |
| Sequential transactions | Addresses transacted in sequence (A, then B, then C) with <60 seconds between | Bot script pattern |
| Bridge-only | Only interaction is bridge deposit, no other L1 activity | Airdrop farming pattern |

---

**Disqualification (automatic, no appeal for Season 1-3):**

| Condition | Result |
|-----------|--------|
| Address in cluster >20 | Disqualified |
| ≥3 Sybil flags | Disqualified |
| Identified in external Sybil lists (Hop, Nansen) | Disqualified |
| Contract address (code size > 0) | Disqualified (unless approved multisig) |
| Known CEX/exchange address | Disqualified |
| Bridge/router contract | Disqualified |

---

**Data sources for Sybil detection:**

| Source | Data type |
|--------|-----------|
| L1 transaction history | All txs from genesis to snapshot |
| Ethereum bridge contract | Deposit origins |
| Nansen labels | Known entity addresses |
| Hop protocol Sybil list | Cross-referenced addresses |
| CEX deposit address database | Clustering detection |
| Internal flagged addresses | Manual review results |

---

## ANNOUNCEMENT SCHEDULE

| Season | Criteria announced | Snapshot announced | Snapshot occurs | Claim opens |
|--------|-------------------|-------------------|-----------------|-------------|
| 1 | Day 166 | Day 166 | Day 180 | Day 187 |
| 2 | Day 187 (at S1 claim) | Day 358 | Day 365 | Day 372 |
| 3 | Day 372 (at S2 claim) | Day 541 | Day 548 | Day 555 |
| 4 | Day 730 (migration start) | N/A (real-time) | N/A | Day 919 |

**Rationale:**
- 14-day notice for snapshots: too short to meaningfully Sybil, long enough for awareness
- Criteria announced at prior claim: creates clear incentive without early gaming
- Random block within snapshot day: prevents last-second manipulation

---

### 3.2 LP Incentives (ve(3,3) DEX Token Emissions)

**LP incentives come from the DEX token, NOT GOV.**

The DEX is a separate protocol with its own token (see Section 2.6). LPs earn:
1. DEX token emissions (from gauge voting)
2. Trading fees (if veToken holders vote for their pool)

**How It Works (ve(3,3) Model):**
- Weekly DEX token emissions distributed to gauges
- veToken holders vote which pools get emissions
- LPs stake LP tokens in gauges → earn DEX tokens
- Projects bribe veToken holders to vote for their pools

**Your Role as DEX Owner:**
- Hold significant veToken position
- Earn bribes + trading fees
- Direct emissions to bootstrap key pools (GOLD/wETH, GOLD/wUSDC)

*Full DEX tokenomics including emission schedule in Section 2.6 (after research)*

---

### 3.3 Liquidity Onboarding

**The Chicken-Egg Problem:**
- Pools start empty
- Users won't LP in empty pool
- Need initial liquidity

**Solution: Bootstrap with DEX Token Emissions**

Phase A: Early bridgers provide liquidity
- Users bridge PAXG/XAUT → get GOLD
- DEX token emissions attract them to pool
- GOLD/wETH and GOLD/USDC pools become liquid

Phase B: Secondary pairs form organically
- GOV/USDC pool: Seed with $10K from treasury
- Users can swap: GOLD -> GOV -> USDC (multi-hop)
- Arbitrageurs create price discovery

Phase C: LP Mining Incentives
- 25M GOV distributed over 24 months to LPs (see Section 3.2)
- Decay schedule front-loads rewards (1.5x in months 1-6)

---

### 3.4 Validator Economics

**Initial Setup:**
- 3 validators (you control all initially)
- All gas fees -> you
- 100% of network security

**Revenue Sources:**
1. Gas fees (GOLD + GOV mix)
2. Protocol fees (treasury share)

**Revenue Projections:**
| Daily Txs | Daily Fees | Monthly | Annual |
|-----------|------------|---------|--------|
| 1,000 | $20 | $600 | $7,200 |
| 10,000 | $200 | $6,000 | $72,000 |
| 100,000 | $2,000 | $60,000 | $720,000 |
| 1,000,000 | $20,000 | $600,000 | $7,200,000 |

**Progressive Decentralization:**
- Month 1-6: 3 validators (you)
- Month 7-12: Add 2-4 community validators
- Year 2+: 10+ validators, delegate rewards

---

### 3.5 Community Validator Requirements (Based on BSC Model)

**How BSC Does It:**
- Minimum self-stake: 2,000 BNB (~$1.2M) to avoid jail
- Minimum to be candidate: 10,000 BNB (~$6M)
- Daily election at 00:00 UTC selects top 45 validators by stake
- Top 21 = "Cabinets" (always produce blocks)
- Next 24 = "Candidates" (3 randomly selected per epoch to join Cabinets)
- Commission: Validator sets rate (e.g., 20%), rest goes to delegators

**Your Model (Scaled Down for Launch):**

| Phase | Min Self-Stake | Max Validators | Election |
|-------|----------------|----------------|----------|
| Launch (Month 1-6) | N/A | 3 (you) | None |
| Phase 2 (Month 7-12) | 100,000 GOV | 7 | Top 7 by stake |
| Phase 3 (Year 2+) | 50,000 GOV | 21 | Top 21 by stake |

**Hardware Requirements (Same as BSC):**
| Component | Minimum |
|-----------|---------|
| CPU | 8 cores |
| RAM | 16 GB |
| Storage | 2 TB NVMe SSD |
| Network | 100 Mbps dedicated |
| OS | Ubuntu 22.04 LTS |

**Slashing Conditions (BSC Model Adapted):**

| Offense | Penalty | Jail Time |
|---------|---------|-----------|
| Double signing (signs 2 blocks same height) | 10,000 GOV slashed | 30 days |
| Malicious finality vote | 10,000 GOV slashed | 30 days |
| Missing >150 blocks in 24 hours | 1,000 GOV slashed | 2 days |
| Self-stake drops below minimum | No slash | 2 days (must top up) |

**How Slashing Works:**
- Anyone can submit slash evidence transaction with proof
- System contract verifies evidence
- If valid: Slashed GOV distributed to other validators
- Submitter receives 10% of slashed amount as bounty
- Only self-staked GOV is slashed (delegators protected)

**Validator Application Process (Month 7+):**

1. **Hardware setup:** Run full node, sync to chain tip
2. **Stake deposit:** Send 100,000+ GOV to ValidatorStaking contract
3. **Registration:** Call `registerValidator(commissionRate, description)`
4. **Wait for election:** Next 00:00 UTC, if in top 7, you're active
5. **Maintain uptime:** Miss too many blocks = jail + slash

**Commission Structure:**
- Validator sets commission rate (5-20% typical)
- Example: Block produces 100 GOLD in fees
  - Commission 15%: Validator keeps 15 GOLD
  - Remaining 85 GOLD: Distributed to delegators proportionally

**Delegation:**
- Anyone can delegate GOV to validators
- Delegators earn proportional share of fees (minus commission)
- 7-day unbonding period to withdraw
- Delegators NOT slashed for validator misbehavior

---

## PART 4: TRANSITION TO PHYSICAL GOLD CUSTODY

### 4.1 Phase Evolution

**Phase 1: Pure DeFi (Launch - Month 12)**
- Smart contract holds PAXG + XAUT on Ethereum
- All operations trustless: deposit, mint, burn, redeem
- No company needed
- Revenue accumulates in treasury (GOV-controlled)
- Goal: Prove model works, build TVL to $1M+

**Phase 2: Entity Formation (Month 12-18)**
- Form Delaware LLC (cheapest, fastest)
- Cost: $500 formation + $300/year registered agent
- Purpose: Hold bank account for fiat on-ramp
- Become Paxos institutional customer (requires LLC)
- New flow: User sends USD → LLC buys PAXG → bridges to L1
- Original smart contract still works (trustless path remains)

**Phase 3: Physical Gold Acquisition (Month 18-36)**

Trigger: Treasury accumulates $500K+ in protocol fees

**Two Paths to Physical Gold:**

**Path A: Redeem PAXG for Physical (Paxos Route)**

Requirements:
- Delaware LLC already formed (Phase 2)
- Become Paxos Institutional Customer
- Minimum: 430 PAXG (~$1.2M at current prices)

Step-by-step process:
```
1. Contact Paxos sales team (sales@paxos.com)
   - Provide LLC documentation (Articles, EIN, bank statements)
   - Complete institutional KYC (officers, beneficial owners)
   - Wait 2-4 weeks for approval

2. Transfer PAXG from Ethereum vault to Paxos wallet
   - Call vault.withdrawForRedemption(430 PAXG)
   - Send PAXG to your Paxos institutional wallet

3. Initiate redemption via Paxos dashboard
   - Select "Redeem for Physical Gold"
   - Choose delivery location (UK vaults only)
   - Pay redemption fee: 0.02% (~$240 on 430 PAXG)

4. Receive gold at Brink's London
   - Paxos arranges delivery to Brink's
   - You receive: 1x 400oz bar + smaller bars for remainder
   - Gold is allocated to your Brink's account
   - Timeline: 1-2 weeks after redemption request
```

**Path B: Buy Physical Directly (Dealer Route)**

When to use: Treasury has cash, or want smaller amounts than 430 oz

Step-by-step process:
```
1. Open corporate account at gold dealer
   - APMEX: apmex.com/institutional
   - JM Bullion: jmbullion.com
   - SD Bullion: sdbullion.com
   - Provide LLC docs, complete KYC

2. Wire funds from LLC bank account
   - Dealers accept wire transfers for large orders
   - Credit card limits too low for bulk purchases

3. Purchase gold at spot + premium
   - 1 oz coins: Spot + 3-5% premium
   - 10 oz bars: Spot + 2-3% premium
   - 100 oz bars: Spot + 1-2% premium
   - 1 kilo bars: Spot + 1-1.5% premium

4. Ship to vault
   - Option A: Ship to Brink's London directly
     - Dealer arranges insured shipping (~$500-1,000)
     - Brink's receives and allocates to your account
   - Option B: Ship to US vault first, then transfer
     - Delaware Depository, Brink's Salt Lake City
     - Later transfer to London if needed

5. Example purchase:
   - $300K budget
   - Buy: 3x 100oz bars ($280K) + 10x 1oz coins ($28K)
   - Premium paid: ~$6K (2% average)
   - Shipping/insurance: $800
   - Total: $286,800 for ~310 oz gold
```

**Path C: Redeem XAUT for Physical (Tether Route)**

Requirements:
- Non-US entity (XAUT blocks US persons)
- Minimum: 50 XAUT (~$140K) - lower than PAXG
- Swiss vault delivery

Process:
```
1. Verify XAUT holdings via gold.tether.to
2. Contact TG Commodities for institutional redemption
3. Complete Swiss KYC requirements
4. Receive allocated gold in Swiss vault
5. Optionally transport to London (adds cost/complexity)
```

**Setting Up Brink's Custody Account:**

```
1. Contact Brink's Precious Metals
   - Website: brinks.com/precious-metals
   - Request: Corporate allocated gold account, London vault

2. Provide documentation:
   - LLC formation documents
   - Certificate of Good Standing
   - EIN confirmation
   - Bank account statements (3 months)
   - Proof of address for LLC
   - Passport/ID for all officers
   - Source of funds documentation

3. Account setup:
   - Setup fee: ~$10K-25K (negotiable based on expected volume)
   - Wait: 2-4 weeks for approval

4. Ongoing costs:
   - Storage: 0.12-0.15% of gold value per year
   - Insurance: Included (Lloyd's of London)
   - Audit: $5K-10K per audit (quarterly = $20K-40K/year)
   - Annual minimum: ~$5K even for small holdings
```

**Attestation & Proof of Reserves:**

Once physical gold is in custody, you need independent verification:

```
1. Hire auditor
   - Armanino (crypto-native, did USDC attestations)
   - BDO (traditional, did XAUT attestations)
   - Cost: $25K-50K per attestation

2. Audit process:
   - Auditor visits Brink's vault
   - Verifies bar serial numbers, weights, purity
   - Cross-references with your reported holdings
   - Issues signed attestation letter

3. On-chain publication:
   - Deploy ProofOfReserves contract
   - Store attestation hash on-chain
   - Link to full PDF on IPFS
   - Update after each quarterly audit

4. Dashboard display:
   - Show: X PAXG + Y XAUT + Z oz Physical
   - All three sum to total GOLD backing
   - Link to attestation documents
```

**Phase 4: Migration to Physical Backing (Year 2-3)**

**The Problem:**
- User PAXG/XAUT sits in bridge vault on Ethereum
- You cannot touch it - it's owed to users
- How do you transition to physical gold?

**Solution: Migration Window**

Announce a 6-month migration window where users swap their PAXG/XAUT-backed GOLD for physical-backed GOLD.

**How Migration Works:**

1. User has 1,000 GOLD on L1 (backed by 10 PAXG in Ethereum vault)

2. User wants to migrate to physical backing

3. User sends to migration contract:
   - Their 1,000 old GOLD (burned)
   - Equivalent value in USDC/ETH (~$28K at gold prices)

4. Protocol uses the USDC/ETH to:
   - Buy physical gold from dealers
   - OR accumulate until enough for Paxos redemption

5. User receives 1,000 new GOLD (now backed by physical allocation)

6. The 10 PAXG in vault is now protocol-owned (user paid for their migration)

**What Happens to Protocol-Owned PAXG:**
- Accumulate until 430+ PAXG
- Redeem via Paxos for physical gold bars
- Adds to physical reserves

**Migration Incentives:**
- Early migrators (month 1-2): 5% GOV bonus on migrated amount
- Mid migrators (month 3-4): 2% GOV bonus
- Late migrators (month 5-6): No bonus
- After window: PAXG-backed GOLD still works, but no new features/airdrops

**Users Who Don't Migrate:**
- Their GOLD still works on L1
- Can still redeem for PAXG on Ethereum anytime
- Just won't have physical backing
- May be excluded from future governance benefits

**Why This Works:**
- Users pay for their own migration (fair exchange)
- Protocol accumulates both PAXG and cash
- Clean transition without taking user funds
- Market pressure to migrate (incentives + FOMO)

**Migration Flow - Step by Step:**

User wants to migrate 1,000 GOLD (backed by 10 PAXG, worth ~$28K):

1. User goes to migration page on your dApp

2. User selects migration amount: 1,000 GOLD

3. System shows required payment: ~$28K in USDC, USDT, ETH, or WBTC
   - Price based on current gold spot price
   - Small buffer (1%) for price movement during processing

4. User approves and sends in single transaction:
   - 1,000 old GOLD (to be burned)
   - $28K worth of USDC/ETH (to migration contract)

5. Migration contract:
   - Burns the 1,000 old GOLD
   - Marks user's 10 PAXG in Ethereum vault as "protocol-owned"
   - Records user in physical-backed registry
   - Mints 1,000 new GOLD (physical-backed) to user
   - Calculates and mints GOV bonus (if applicable)

6. User now has:
   - 1,000 physical-backed GOLD
   - GOV bonus (5%/2%/0% depending on timing)

7. Protocol now has:
   - 10 PAXG (can redeem for physical later)
   - $28K in stablecoins/ETH (can buy physical gold)

**What Happens to Accumulated Assets:**

Protocol accumulates from migrations:
- PAXG from vault (users' original deposits)
- USDC/ETH from migration payments

Monthly process:
- If PAXG balance > 430: Redeem via Paxos for physical bars
- If PAXG balance < 430: Hold until threshold reached
- USDC/ETH: Convert to physical via dealers (no minimum)

**Tracking Two Types of GOLD:**

On-chain, GOLD token has a flag or separate contract:

| Type | Backing | Redeemable For |
|------|---------|----------------|
| GOLD-P | PAXG/XAUT in Ethereum vault | PAXG or XAUT on Ethereum |
| GOLD-X | Physical gold at Brink's | Physical (400oz min) or PAXG |

Both are fungible for transactions/trading on L1. Difference only matters at redemption.

**Post-Migration Backing Mix (Target):**
- 100% Physical for migrated GOLD
- Remaining PAXG/XAUT-backed GOLD continues as-is until redeemed
- New deposits after migration: Physical-backed from day one (users send fiat/crypto, protocol buys gold)

**New Deposits After Migration Window:**

Once migration ends, new users don't bridge PAXG. Instead:

1. User sends USDC/ETH/fiat to protocol
2. Protocol buys physical gold (or adds to next purchase batch)
3. User receives physical-backed GOLD
4. No more PAXG-backed GOLD issued

This completes the transition from tokenized gold wrapper to actual physical gold custody.

---

### 4.2 PAXG Redemption Process

**To redeem PAXG for physical gold bars:**

1. Become Paxos Institutional Customer
   - Corporate entity (LLC, Corp)
   - KYC/AML verification
   - Process: 2-4 weeks

2. Withdraw PAXG from Smart Contract
   - Call: `withdrawPAXGForRedemption(amount)`
   - PAXG moves: contract -> your wallet

3. Redeem Through Paxos
   - Minimum: 430 PAXG (~$1.2M)
   - Fee: 0.02%
   - Location: UK delivery only (Brink's London)
   - Wait: 1-2 weeks

4. Receive Physical Gold
   - 430 oz = 1x 400oz bar + 30oz smaller bars
   - Options: Leave at Brink's, transport elsewhere

**Note:** If <430 PAXG remaining, sell on market and buy physical from dealers.

---

### 4.3 Dual Gold Backing (PAXG + XAUT)

**Why Accept Both:**
- No single issuer dependency
- Different custodians (Brink's London vs Swiss vaults)
- Different jurisdictions (US-regulated vs BVI)
- If Paxos freezes contract, XAUT portion survives
- If Tether implodes, PAXG portion survives

**PAXG vs XAUT Comparison:**

| Aspect | PAXG | XAUT |
|--------|------|------|
| Issuer | Paxos Trust (NY regulated) | TG Commodities (BVI, Tether subsidiary) |
| Regulator | NYDFS (strict oversight) | None (contractual only) |
| Custody | Brink's London | Swiss vaults |
| Audit frequency | Monthly attestations | Quarterly attestations |
| Bar verification | Yes - lookup tool shows exact bar serial | No - aggregate list only |
| Redemption fee | 0.02% | 0.25% |
| Redemption minimum | 430 oz (~$1.2M) | 50 oz (~$140K) |
| US persons | Allowed | Blocked |

**Bridge Mechanics:**
- User bridges 1 PAXG → 100 GOLD minted
- User bridges 1 XAUT → 100 GOLD minted
- GOLD is fungible regardless of source
- Redemption: User chooses PAXG or XAUT (subject to availability)
- Contract tracks: `paxgLocked` and `xautLocked` separately

**No Fixed Ratio:**
- Market decides allocation naturally
- Users choose which to bridge based on their preference
- System accepts both equally

**Direct Dealers (For Physical Transition):**
- APMEX, JM Bullion, Kitco
- Minimum: $10K-50K
- Spot + 2-5% premium
- Ship to any vault
- No 430 oz barrier

---

### 4.4 Gold Custody Costs

**Brink's London:**
- Setup: $10K-25K
- Annual storage: 0.12-0.15% of gold value
- Insurance: Included (Lloyd's)

**At $10M gold reserves:**
- Storage: $12K-15K/year
- Audits: $25K-50K/year
- Compliance: $25K-50K/year
- Total: ~$80K-115K/year

**Break-even:** ~$10M TVL to justify own custody operation

---

### 4.5 Entity Structure Options

**Option A: Wyoming SPDI**
- Crypto-friendly US state
- Federal oversight (OCC)
- Capital requirement: $10M+
- Can custody both crypto and commodities

**Option B: Delaware Trust**
- Traditional, credible
- US recognition
- Capital requirement: $50K-150K setup

**Option C: Cayman Trust**
- Offshore
- Zero taxes
- Privacy
- Capital requirement: $25K-75K setup

All three can store gold in London vaults.

---

## PART 4B: STABLECOIN STRATEGY

### 4B.1 Two Paths to Stablecoins

**Option A: Simple Wrapped (Launch Fast) - RECOMMENDED**
- Deploy wrapped versions via your Sygma bridge
- wUSDC: User locks USDC on Ethereum → mints wUSDC on your L1
- wUSDT: User locks USDT on Ethereum → mints wUSDT on your L1
- wETH: User locks ETH on Ethereum → mints wETH on your L1
- Same bridge infrastructure as GOLD (5-of-7 relayers)
- Fast to deploy, no external dependencies

**Naming and Branding:**
- Token name: "Wrapped USDC" (symbol: wUSDC)
- Token name: "Wrapped USDT" (symbol: wUSDT)
- **Logo: Use the same Circle/Tether logo** - this is standard practice
- Arbitrum, Optimism, Base all use the original USDC/USDT logos for their bridged versions
- No lawsuits, no cease-and-desist letters - issuers benefit from ecosystem expansion
- The "w" prefix clearly communicates it's bridged, not native

**Legal Clarity:**
- You are NOT issuing USDC or USDT
- You are wrapping user-deposited tokens via bridge contract
- Circle/Tether have no claim - users deposited their own tokens
- Same model as every L2 and alt-L1 in existence

**Ethereum Vault Deployment:**
- Add wUSDC/wUSDT support to existing Sygma bridge vault OR
- Deploy separate stablecoin vault contract (~$150-225 additional gas)
- Recommended: Single vault contract that accepts PAXG, XAUT, USDC, USDT, ETH
- Each asset tracked separately: `usdcLocked[user]`, `usdtLocked[user]`, etc.

**Option B: Circle Bridged USDC Standard (Better Long-Term)**

Circle has an official standard for new chains: [github.com/circlefin/stablecoin-evm](https://github.com/circlefin/stablecoin-evm)

**How it works:**
1. You deploy Circle's open-source bridged USDC contract on your L1
2. Your bridge mints bridged USDC when users lock USDC on Ethereum
3. Ecosystem builds around this single bridged USDC
4. When you hit critical mass, Circle can upgrade to native USDC
5. Upgrade is in-place - same contract address, no migration

**Why Circle's Standard:**
- Same audited code that secures billions
- Clear path to native USDC (Circle takes over contract)
- Avoids liquidity fragmentation (one USDC, not multiple wrapped versions)
- Polygon CDK, Arbitrum Orbit chains use this

**Upgrade Criteria (Unofficial):**
- $50M+ USDC bridged
- 100K+ daily transactions
- Significant DeFi ecosystem
- Circle reviews and decides

**Recommendation:** Use Circle's Bridged USDC Standard from day one. Even if native upgrade never happens, you have the cleanest implementation.

### 4B.2 What to Bridge at Launch

**Essential (Day 1):**
| Token | Why |
|-------|-----|
| USDC | Primary stablecoin, Circle standard |
| ETH | Bridge asset, gas for users coming from Ethereum |

**Nice to Have (Week 2-4):**
| Token | Why |
|-------|-----|
| USDT | Second stablecoin, some users prefer it |
| WBTC | BTC exposure for DeFi |

**Don't Bother Initially:**
- DAI (low demand, MakerDAO drama)
- Other stables (FRAX, LUSD) - wait for demand
- Random ERC-20s - let users request

### 4B.3 Required LP Pools at Launch

| Pool | TVL Target | Purpose |
|------|------------|---------|
| GOLD/wETH | $100K | Primary trading pair |
| GOLD/USDC | $100K | Stablecoin exit for GOLD |
| GOV/wETH | $50K | Governance token liquidity |
| GOV/GOLD | $50K | Internal ecosystem |
| wETH/USDC | $25K | Standard DeFi routing |

**Total target TVL at launch:** $325K

**Bootstrap Strategy:**
1. Early bridgers bring GOLD liquidity (incentivized by airdrop Season 1)
2. You seed initial pairs with personal capital (~$10-25K in ETH/USDC)
3. LP incentives (GOV rewards) attract external LPs
4. Arbitrageurs balance pools once trading starts

Note: Initial seeding comes from founder's personal capital, not external funding. This is recovered as LP rewards + trading fees once pools are active.

### 4B.4 Tether vs Circle - Who Deploys Native First?

**Circle (USDC):**
- Has formal Bridged USDC Standard
- Works with new chains proactively
- More regulatory-friendly (US licensed)
- Likely to upgrade if you grow

**Tether (USDT):**
- No formal standard for new chains
- Deploys reactively (after chains prove demand)
- Higher volume globally but less cooperative
- May never deploy native - wrapped is fine

**Strategy:** Focus on Circle relationship. USDT can stay wrapped forever - users won't notice the difference.

---

## PART 4C: PROTOCOL REVENUE MODEL

### 4C.1 Revenue Sources

**1. Gas Fees (Primary)**

Every transaction on L1 pays gas in GOLD or GOV.

| Recipient | Share |
|-----------|-------|
| Block Validator | 70% |
| Protocol Treasury | 20% |
| Burn | 10% |

At 100K daily transactions × $0.02 avg fee = $2,000/day
- Treasury: $400/day = $146K/year

**2. Bridge Fees**

0.1% fee on deposits and withdrawals.

| Volume | Daily Fee | Annual |
|--------|-----------|--------|
| $100K/day | $100 | $36.5K |
| $1M/day | $1,000 | $365K |
| $10M/day | $10,000 | $3.65M |

**3. DEX Protocol Fee (Optional)**

Uniswap V2 has a fee switch: when ON, 0.05% of trading volume goes to treasury (in addition to 0.25% to LPs).

| Daily Volume | Protocol Cut | Annual |
|--------------|--------------|--------|
| $500K | $250 | $91K |
| $5M | $2,500 | $912K |
| $50M | $25,000 | $9.1M |

Start with fee switch OFF to attract LPs. Turn ON via governance once liquidity is established.

**4. Migration Fees**

When users migrate from PAXG-backed to physical-backed GOLD:
- Migration fee: 0.5% of migrated value
- $10M migrated = $50K revenue

**5. Token Treasury**

Team/Ops allocation: 15M GOV
- Sell portions as GOV gains value
- Ethereum Foundation model: Maintain 2.5 year runway in reserves
- Don't dump - structured sales or OTC deals

### 4C.2 Revenue Projections by Phase

| Phase | TVL | Daily Txs | Annual Revenue |
|-------|-----|-----------|----------------|
| Launch (Month 1-6) | $500K | 5K | ~$50K |
| Growth (Month 7-12) | $5M | 50K | ~$500K |
| Scale (Year 2) | $25M | 200K | ~$2M |
| Mature (Year 3+) | $100M | 500K | ~$8M |

### 4C.3 How Other L1s Do It

**Ethereum Foundation:**
- Received ETH allocation at genesis
- Sells ETH periodically to fund operations
- Caps annual spend at 15% of treasury
- Current treasury: ~$970M

**Solana Foundation:**
- Holds SOL allocation
- Sells SOL at discount to strategic partners
- Funds grants, ecosystem development
- Has provided $100M+ to startups

**Your Model:**
- Treasury receives 20% of gas fees (ongoing)
- Treasury receives 0.05% DEX fees (when enabled)
- Treasury receives bridge fees
- Team holds 15M GOV for operations
- Sell GOV as needed, maintain runway

---

## PART 5: COMPETITIVE POSITIONING

### 5.1 Why This Can't Fail Like Terra/Luna

| Aspect | Terra/Luna | Your Model |
|--------|-----------|------------|
| UST Backing | Algorithmic (nothing) | 100% PAXG/physical gold |
| LUNA Supply | Unlimited minting | GOV has 100M cap |
| Peg Mechanism | Mint/burn arbitrage | Real redemption for gold |
| Death Spiral Risk | Extreme (it happened) | Impossible (real backing) |
| If GOLD depegs | Arbitrage restores (backed) | System self-corrects |
| If GOV crashes | GOLD still 100% backed | GOV is separate |

**Key Insight:** Luna's problem was circular dependency. Your GOLD is always redeemable for real gold. GOV is independent. No death spiral possible.

---

### 5.2 Competitive Advantages

**vs PAXG:**
- PAXG yields: 0%
- Your GOLD yields: 7-13% APY
- Same backing, added yield

**vs Gold ETFs:**
- GLD charges: 0.40%/year
- Your GOLD charges: 0% (earns yield instead)
- Better by ~7-13%

**vs Physical Gold:**
- Physical yields: 0%
- Your GOLD yields: 7-13%
- Plus: Programmable, divisible, instant transfer

**vs Other L1s:**
- Not another "ETH killer"
- Specific use case: Yield-bearing gold
- $13 trillion gold market to capture

---

## PART 6: INFRASTRUCTURE CHECKLIST

### 6.1 Technical Components (Day 1)

- [ ] BSC fork running (3 validators)
- [ ] Genesis file with GOLD + GOV tokens
- [ ] System contracts modified for two-token gas
- [ ] Ethereum bridge vault contract
- [ ] L1 bridge claimer contract
- [ ] Relayer service running
- [ ] Blockscout explorer
- [ ] ve(3,3) DEX deployed (separate protocol, own token)
- [ ] Oracle (Uniswap TWAP)

### 6.2 Token Contracts

- [ ] GOLD token (ERC-20 compatible, mint/burn by bridge only)
- [ ] GOV token (ERC-20 + governance, 100M pre-mined at genesis)
- [ ] wUSDC wrapper (bridged USDC)
- [ ] wUSDT wrapper (bridged USDT)
- [ ] wETH wrapper (bridged ETH)
- [ ] Staking contract (tracks GOLD/GOV staked, distributes fees)
- [ ] Treasury contract (holds GOV allocations, governance-controlled)

### 6.3 Off-Chain Infrastructure

- [ ] Website
- [ ] Documentation
- [ ] Discord community
- [ ] Governance forum
- [ ] Relayer monitoring
- [ ] Validator monitoring

---

## PART 7: RISK ANALYSIS

### 7.1 Technical Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Smart contract bug | Medium | High | Audits, bug bounties |
| Bridge exploit | Medium | Critical | Multi-sig, proof verification |
| Oracle manipulation | Low | High | TWAP, multiple sources |
| Validator downtime | Low | Medium | Redundancy, monitoring |

### 7.2 Business Risks

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| PAXG rug (freeze contract) | Low-Medium | Critical | Diversify (XAUT, physical) |
| Low adoption | Medium | High | Airdrop incentives, LP rewards |
| Regulatory action | Medium | High | Entity structure, compliance |
| Gold price crash | Low | Medium | Doesn't affect backing ratio |

### 7.3 PAXG Dependency Risk

**Problem:** Paxos can freeze your wrapper contract.

**Mitigation Strategy:**
- Diversify backing over time
- By Year 3: 50% PAXG / 30% XAUT / 20% physical
- Multiple custodians = no single point of failure
- Can survive if one source freezes

---

### 7.4 Emergency Procedures

**Scenario 1: Bridge Exploit Detected**

| Step | Action | Who | Timeframe |
|------|--------|-----|-----------|
| 1 | Pause bridge deposits/withdrawals | Guardian multisig (3-of-5) | Immediate |
| 2 | Alert on Discord/Twitter | Team | Within 1 hour |
| 3 | Assess damage: which transactions affected | Team | Within 4 hours |
| 4 | If exploit ongoing: pause all L1 contracts | Guardian | Immediate |
| 5 | Post-mortem and fix | Team | Days |
| 6 | Governance vote to unpause | GOV holders | 7 days |

**Scenario 2: Oracle Manipulation**

| Step | Action | Who | Timeframe |
|------|--------|-----|-----------|
| 1 | Pause DEX (prevents bad swaps) | Guardian | Immediate |
| 2 | Switch to backup oracle source | Team | Within 1 hour |
| 3 | Extend TWAP window (harder to manipulate) | Governance | 7 days |

**Scenario 3: Validator Compromise (>1/3 of validators)**

| Step | Action | Who | Timeframe |
|------|--------|-----|-----------|
| 1 | Honest validators stop producing blocks | Validators | Immediate |
| 2 | Chain halts (no finality) | Automatic | Immediate |
| 3 | Coordinate restart with honest validators only | Team | Hours-days |
| 4 | Slash compromised validators | System contract | On restart |
| 5 | Resume with clean validator set | Governance | Days |

**Scenario 4: PAXG/XAUT Issuer Freezes Bridge Contract**

| Step | Action | Who | Timeframe |
|------|--------|-----|-----------|
| 1 | Affected gold token no longer redeemable | Automatic | Immediate |
| 2 | Announce situation, GOLD still backed by unfrozen portion | Team | Within 1 hour |
| 3 | If PAXG frozen: XAUT redemptions continue normally | Bridge | Automatic |
| 4 | Accelerate physical gold acquisition | Treasury | Weeks |
| 5 | Governance decides on affected user compensation | GOV holders | 7 days |

**What Cannot Be Recovered:**
- If attacker drains bridge vault before pause: funds gone
- No insurance fund (would require capital we don't have)
- Users accept smart contract risk by bridging

**Pause Mechanisms Built Into Contracts:**

| Contract | Pause Function | Who Can Call |
|----------|----------------|--------------|
| Bridge Vault (Ethereum) | `pause()` | Guardian multisig |
| GOLD token (L1) | `pause()` | Guardian multisig |
| DEX Router | `pause()` | Guardian multisig |
| Staking | `pause()` | Guardian multisig |

All pauses auto-expire after 7 days unless governance extends.

---

## PART 8: FINANCIAL PROJECTIONS

### 8.1 Bootstrap Phase (No External Funding)

**Resources:**
- $4K Azure credits
- Claude Code for development
- Existing ETH node hardware

**Costs:**
| Item | Cost |
|------|------|
| Validators (Azure) | $450/month OR $0 self-hosted |
| Ethereum gas (deployments) | $200-500 |
| Blockscout hosting | $250/month |
| Total first 6 months | $4,200-6,500 |

**Revenue (at 10K txs/day):**
- Gas fees: $6,000/month
- Break-even: ~Month 3-4

### 8.2 Growth Projections

| Metric | Launch | Month 6 | Month 12 | Month 24 |
|--------|--------|---------|----------|----------|
| TVL | $100K | $1M | $5M | $20M |
| Daily Txs | 500 | 5,000 | 25,000 | 100,000 |
| Monthly Revenue | $300 | $3,000 | $15,000 | $60,000 |
| GOLD Staking APY | 30%+ | 15% | 10% | 7% |

---

## PART 9: KEY DECISIONS SUMMARY

### 9.1 Tokenomics Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| GOLD:gold token ratio | 100:1 | Simple math, nice round number |
| GOLD supply | Elastic (no cap) | 100% backed, supply = bridged collateral x 100 |
| Gold backing | PAXG + XAUT | Diversification, no single issuer risk |
| GOV supply | 100M fixed | All pre-mined, no inflation ever |
| Gas tokens | Both GOLD + GOV | User choice per transaction |
| Staking rewards | Fees only | No inflation, sustainable model |

### 9.2 Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | BSC fork | Proven, EVM, two-token gas support exists |
| Validators | 3 initially | You control, decentralize later |
| DEX model | Uniswap V2 (launch) | Simple, proven, no third token needed |
| Bridge | Sygma (ChainSafe) | Open source LGPL, production-proven, modular |
| Relayer set | Your validators | 5-of-7 threshold, stake GOV as collateral |

### 9.3 Business Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Initial backing | PAXG | No capital needed, liquid |
| Entity timing | After launch | Prove model first |
| Physical transition | Gradual (60/40) | Keep trustless option |
| Custody location | London (Brink's) | LBMA, PAXG compatible |

---

## APPENDIX A: COMPARISON TABLES

### A.1 L1 Validator Economics

| Chain | Min Stake | APY | Inflation | Fee Model |
|-------|-----------|-----|-----------|-----------|
| Ethereum | 32 ETH | 3-4% | 0.5% | Tips only |
| BSC | 10K BNB | 9-13% | 0% | 90% fees |
| Polygon | 10K POL | 3.8% | 2% | 98% fees |
| Cosmos | Variable | 16-22% | 14% | Small % |
| Solana | Variable | 7-9% | 4.7% | 20% |
| **Your L1** | **Control** | **7-15%** | **4% GOV** | **50% fees** |

### A.2 Gold-Backed Token Comparison

| Token | Market Cap | Fees | Yield | Redemption Min |
|-------|------------|------|-------|----------------|
| PAXG | $2.3B | 0.02% | 0% | 430 oz ($1.2M) |
| XAUT | $2.1B | 0.25% | 0% | 50 oz ($140K) |
| **Your GOLD** | **$0 start** | **0%** | **7-13%** | **100 GOLD** |

---

## APPENDIX B: GLOSSARY

- **GOLD**: Gold-backed token on your L1 (100 GOLD = 1 PAXG)
- **GOV**: Governance token for voting and staking
- **PAXG**: Paxos Gold token on Ethereum (1 PAXG = 1 oz gold)
- **ve(3,3)**: Vote-escrow tokenomics model for DEX
- **TWAP**: Time-Weighted Average Price (oracle mechanism)
- **Relayer**: Off-chain service that submits cross-chain proofs
- **LBMA**: London Bullion Market Association (gold standard)
- **SPDI**: Special Purpose Depository Institution (Wyoming bank charter)

---

## APPENDIX C: FUTURE PROTOCOLS (Year 2+ Roadmap)

### C.1 Lending Protocol (Compound Fork)

**Why Add Lending:**
- More yield options for GOLD holders (lend GOLD → earn interest)
- Leverage: Deposit wETH → borrow GOLD → buy more wETH
- Increases GOLD utility and demand
- Another protocol you own = another token opportunity

**License Situation:**

| Protocol | License | Status |
|----------|---------|--------|
| AAVE V3 | BSL 1.1 | Converts to MIT on **March 6, 2027** - cannot fork now |
| Compound V2/V3 | BSD-3-Clause | **Fully open source NOW** - can fork immediately |

**Recommendation:** Fork Compound. It's simpler and legally clear.

**Repo:** github.com/compound-finance/compound-protocol (BSD-3-Clause)

**Lending Token Model (Based on AAVE):**

| Aspect | AAVE Model | Your Lending Token |
|--------|------------|-------------------|
| Supply | 16M fixed | TBD (e.g., 50M fixed) |
| Safety Module | Stake AAVE → stkAAVE, slashed if bad debt | Same model |
| Governance | Token holders vote on parameters | Same model |
| Rewards | stkAAVE earns protocol revenue | Same model |
| Cooldown | 1 week to unstake | Same model |

**Safety Module Mechanics:**
- Users stake lending token → receive staked version
- Staked tokens earn share of protocol interest spread
- If protocol has shortfall (liquidation doesn't cover bad debt):
  - Staked tokens get slashed to cover deficit
  - This protects lenders from losses
  - Creates insurance layer

**Revenue Model:**
- Interest spread: Borrowers pay 5% → Lenders receive 4% → 1% to protocol
- Protocol revenue → distributed to staked token holders
- You hold significant staked position = ongoing revenue

**Markets to Launch:**

| Market | Collateral | Borrowable | LTV | Liquidation |
|--------|-----------|------------|-----|-------------|
| GOLD | wETH, wBTC, wUSDC | GOLD | 75% | 80% |
| wETH | GOLD, wUSDC | wETH | 80% | 85% |
| wUSDC | GOLD, wETH | wUSDC | 85% | 90% |

**Why Not Launch Day 1:**
- Complexity: Oracles, liquidation bots, risk parameters
- Focus: L1 + DEX is enough for launch
- TVL needed: Lending needs existing liquidity to be useful
- Audit: Another set of contracts to secure

**Timeline:**
- Year 1: L1 + Bridge + DEX
- Year 2: Lending protocol launch
- Year 2+: AAVE V3 becomes MIT (March 2027), could migrate to more features

---

### C.2 Other Future Protocols

**Perpetuals DEX (Year 3+):**
- Fork GMX or similar
- GOLD/USD perpetual futures
- Allows leveraged gold exposure without borrowing

**Options Protocol (Year 3+):**
- Fork Lyra or Dopex
- GOLD options (calls/puts)
- Hedging for gold holders

**NFT Marketplace (If Demand):**
- Fork OpenSea/Blur contracts
- Gold-themed NFT collections
- Probably low priority for gold-focused chain

---

## APPENDIX D: RESOURCES

**Repositories:**
- BSC: https://github.com/bnb-chain/bsc
- BSC Genesis Contracts: https://github.com/bnb-chain/bsc-genesis-contract
- Blockscout: https://github.com/blockscout/blockscout
- Velodrome (ve3,3): https://github.com/velodrome-finance/contracts
- Compound (lending): https://github.com/compound-finance/compound-protocol

**Documentation:**
- PAXG: https://paxos.com/paxgold/
- Brink's: https://www.brinks.com/precious-metals
- Wyoming SPDI: https://wyomingbankingdivision.wyo.gov/banks-and-trust-companies/special-purpose-depository-institutions
- AAVE Safety Module: https://docs.aave.com/aavenomics/safety-module

---

*Document Version: 1.0*
*Last Updated: February 2026*
