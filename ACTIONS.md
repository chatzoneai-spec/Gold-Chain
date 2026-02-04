# GOLD CHAIN: Action Plan & Priority Order

## PHASE 1: CORE INFRASTRUCTURE (Weeks 1-4)

### 1.1 BSC Fork Setup
- [ ] Clone BSC repository
- [ ] Set up 3 validator nodes (local/testnet first)
- [ ] Configure genesis file with GOLD + GOV tokens
- [ ] Modify `StakeHub.sol` for two-token reward distribution
- [ ] Modify `BSCValidatorSet.sol` for dual token tracking
- [ ] Register both tokens as valid gas tokens in genesis config
- [ ] Test block production and consensus

### 1.2 Token Contracts (L1)
- [ ] Deploy GOLD token contract (ERC-20, mint/burn by bridge only)
- [ ] Deploy GOV token contract (ERC-20 + governance, 100M pre-mined)
- [ ] Test two-token gas payment
- [ ] Verify token interactions with system contracts

### 1.3 Block Explorer
- [ ] Deploy Blockscout instance
- [ ] Configure for your L1
- [ ] Verify token tracking works
- [ ] Test transaction explorer

---

## PHASE 2: BRIDGE INFRASTRUCTURE (Weeks 3-6)

### 2.1 Ethereum Vault Contract
- [ ] Write vault contract accepting PAXG, XAUT, USDC, USDT, ETH
- [ ] Implement deposit function with event emission
- [ ] Implement redemption function (relayer-triggered)
- [ ] Add governance-controlled pause mechanism (GOLD bridge only)
- [ ] Track each asset separately: `paxgLocked`, `xautLocked`, `usdcLocked`, etc.
- [ ] Deploy to Ethereum testnet (Sepolia)

### 2.2 L1 Bridge Contract
- [ ] Write GOLD minting contract (verifies relayer signatures)
- [ ] Implement 5-of-7 threshold signature verification
- [ ] Add nonce tracking for replay protection
- [ ] Implement redemption initiation (burn GOLD, emit event)
- [ ] Deploy to your L1 testnet

### 2.3 Relayer Service
- [ ] Fork Sygma relayer codebase
- [ ] Configure for your validator set
- [ ] Implement Ethereum event monitoring
- [ ] Implement L1 event monitoring
- [ ] Set up 12-block finality wait
- [ ] Test deposit flow (Ethereum → L1)
- [ ] Test redemption flow (L1 → Ethereum)

### 2.4 Wrapped Asset Contracts (L1)
- [ ] Deploy wUSDC contract
- [ ] Deploy wUSDT contract
- [ ] Deploy wETH contract
- [ ] Test bridging for each asset

---

## PHASE 3: DEX DEPLOYMENT (Weeks 5-8)

### 3.1 Fork Velodrome/Aerodrome
- [ ] Clone Velodrome contracts repository
- [ ] Configure DEX token parameters (name, initial supply 500M)
- [ ] Set up emission schedule (10M/week initial, +3% growth, then -1% decay)
- [ ] Configure veToken locking mechanics

### 3.2 Deploy DEX Contracts
- [ ] Deploy DEX token contract
- [ ] Deploy veToken contract
- [ ] Deploy Router contract
- [ ] Deploy Pool Factory
- [ ] Deploy Gauge Factory
- [ ] Deploy Voter contract
- [ ] Deploy Rewards Distributor

### 3.3 Initialize Pools
- [ ] Create GOLD/wETH pool
- [ ] Create GOLD/wUSDC pool
- [ ] Create GOV/wETH pool
- [ ] Create GOV/GOLD pool
- [ ] Create wETH/wUSDC pool
- [ ] Set up gauges for each pool

### 3.4 Seed Liquidity
- [ ] Add initial liquidity to GOLD/wETH
- [ ] Add initial liquidity to GOLD/wUSDC
- [ ] Add initial liquidity to GOV/wETH
- [ ] Lock team veTokens (50M)
- [ ] Vote for initial gauge allocations

---

## PHASE 4: LIQUID STAKING PROTOCOL (Weeks 6-9)

### 4.1 Fork Lido Contracts
- [ ] Clone Lido core repository (github.com/lidofinance/core)
- [ ] Review GPL-3.0 license requirements
- [ ] Adapt contracts for GOLD token (instead of ETH)
- [ ] Configure rebase mechanics for stGOLD
- [ ] Implement wstGOLD wrapper contract

### 4.2 Liquid Staking Token
- [ ] Design tokenomics (supply, emissions, distribution)
- [ ] Deploy liquid staking governance token
- [ ] Set up liquidity mining rewards
- [ ] Configure fee structure (90% to stakers, 10% protocol)

### 4.3 Node Operator Setup
- [ ] Define whitelisted validator set
- [ ] Implement validator selection governance
- [ ] Set up delegation distribution logic

### 4.4 Testing
- [ ] Test stake GOLD → receive stGOLD flow
- [ ] Test daily rebase mechanics
- [ ] Test unstake flow (7-day wait)
- [ ] Test wstGOLD wrap/unwrap
- [ ] Test stGOLD in DEX pools

---

## PHASE 5: LENDING PROTOCOL (Compound Fork)

### 5.1 Fork Compound Contracts
- [ ] Clone Compound repository (github.com/compound-finance/compound-protocol)
- [ ] Review BSD-3 license (permissive, no restrictions)
- [ ] Adapt contracts for GOLD, GILT, stGOLD, wETH, wUSDC
- [ ] Configure interest rate models
- [ ] Set up oracle integration (Uniswap TWAP)

### 5.2 Lending Token
- [ ] Design tokenomics (supply, emissions, distribution)
- [ ] Deploy lending governance token
- [ ] Set up liquidity mining rewards for suppliers/borrowers
- [ ] Configure reserve factor and protocol fees

### 5.3 Markets Setup
- [ ] GOLD market (supply/borrow)
- [ ] GILT market (supply/borrow)
- [ ] stGOLD market (supply as collateral)
- [ ] wETH market
- [ ] wUSDC market

### 5.4 Testing
- [ ] Test supply → receive cToken flow
- [ ] Test borrow against collateral
- [ ] Test liquidation mechanics
- [ ] Test interest accrual

---

## PHASE 6: GOVERNANCE SETUP

### 6.1 Governance Contracts
- [ ] Deploy Governor contract (OpenZeppelin Governor fork)
- [ ] Configure parameters: 100K GILT proposal threshold, 7-day voting, 4% quorum
- [ ] Deploy Timelock contract (48-hour standard, 6-hour emergency)
- [ ] Connect governance to bridge pause mechanism

### 6.2 Multisig Setup
- [ ] Set up 5-of-7 multisig for emergency reserve
- [ ] Configure relayer keys
- [ ] Set up team multisig for treasury

---

## PHASE 7: TESTING & AUDIT

### 7.1 Internal Testing
- [ ] Full deposit flow test (PAXG → GOLD)
- [ ] Full redemption flow test (GOLD → PAXG)
- [ ] DEX swap tests
- [ ] Liquid staking flow test (GOLD → stGOLD → unstake)
- [ ] Lending flow test (supply, borrow, repay, liquidate)
- [ ] Governance proposal test
- [ ] Bridge pause mechanism test
- [ ] Two-token gas payment stress test

### 7.2 Security
- [ ] Internal code review
- [ ] External audit (bridge contracts priority)
- [ ] External audit (liquid staking contracts)
- [ ] External audit (lending contracts)
- [ ] Bug bounty program setup
- [ ] Penetration testing

---

## PHASE 8: TESTNET LAUNCH

### 8.1 Public Testnet
- [ ] Deploy all contracts to public testnet
- [ ] Faucet for test GOLD/GILT
- [ ] Documentation for testers
- [ ] Community testing period (2-4 weeks)

### 8.2 Bug Fixes
- [ ] Address issues found in testing
- [ ] Re-audit critical fixes
- [ ] Final security review

---

## PHASE 9: MAINNET LAUNCH

### 9.1 Mainnet Deployment
- [ ] Deploy Ethereum vault to mainnet
- [ ] Deploy L1 genesis (validators live)
- [ ] Deploy bridge contracts
- [ ] Deploy DEX contracts
- [ ] Deploy liquid staking contracts
- [ ] Deploy lending contracts
- [ ] Deploy governance contracts

### 9.2 Token Distribution
- [ ] Pre-mine 100M GILT at genesis
- [ ] Distribute team allocation (20M, locked)
- [ ] Set up treasury allocation (35M, locked)
- [ ] Prepare Season 1 airdrop (10M)

### 9.3 Liquidity Bootstrap
- [ ] Seed initial DEX liquidity
- [ ] Enable bridging (PAXG/XAUT → GOLD)
- [ ] Enable stablecoin bridging (USDC/USDT)
- [ ] Start DEX token emissions
- [ ] Start liquid staking token emissions
- [ ] Start lending token emissions

---

## PHASE 10: POST-LAUNCH (Ongoing)

### 10.1 Season 1 Airdrop
- [ ] Announce snapshot criteria (14 days notice)
- [ ] Take snapshot
- [ ] Calculate allocations
- [ ] Deploy claim contract
- [ ] Enable claims (25% immediate, 75% 6-month vest)

### 10.2 Growth
- [ ] Marketing and community building
- [ ] Partnership outreach (protocols wanting to build on your L1)
- [ ] Additional validator onboarding
- [ ] DEX bribe programs to attract liquidity

### 10.3 Future Additions
- [ ] Additional bridged assets
- [ ] Additional DeFi protocols as needed

---

## CRITICAL PATH

The minimum viable launch requires completing in order:

1. **BSC fork running** (can't do anything without L1)
2. **Token contracts** (GOLD + GILT deployed)
3. **Bridge vault on Ethereum** (can't bridge without it)
4. **Bridge contract on L1** (minting side)
5. **Relayer service** (connects the two)
6. **DEX deployed** (users need to trade)
7. **Liquid staking deployed** (stGOLD for liquidity)
8. **Lending deployed** (borrow/lend markets)
9. **Blockscout** (users need to see transactions)

Everything else (governance, audits, airdrops) can happen in parallel or after.

---

## DEPENDENCIES

```
BSC Fork ─────────────────┬─────────────────────────────────────┐
                          │                                     │
                          v                                     v
                    Token Contracts                       Blockscout
                    (GOLD + GILT)
                          │
                          v
              ┌───────────┴───────────┐
              │                       │
              v                       v
        Ethereum Vault          L1 Bridge Contract
              │                       │
              └───────────┬───────────┘
                          │
                          v
                    Relayer Service
                          │
              ┌───────────┼───────────┐
              │           │           │
              v           v           v
           DEX    Liquid Staking   Lending
              │           │           │
              └───────────┼───────────┘
                          │
                          v
                    Governance Setup
                          │
                          v
                    Testing & Audit
                          │
                          v
                    Mainnet Launch
```

---

## GILT CHAIN ECOSYSTEM SUMMARY

| Protocol | Token | License | Fork From |
|----------|-------|---------|-----------|
| L1 Blockchain | GOLD + GILT | Apache 2.0 | BSC |
| DEX | Separate (TBD) | MIT | Velodrome/Aerodrome |
| Liquid Staking | Separate (TBD) | GPL-3.0 | Lido |
| Lending | Separate (TBD) | BSD-3 | Compound |

---

*Last Updated: February 2026*
