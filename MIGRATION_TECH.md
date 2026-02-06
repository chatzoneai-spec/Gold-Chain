# GILT CHAIN: Migration Technical Specification

## Overview

Migration transitions from PAXG/XAUT-backed GOLD to physical-backed GOLD. This requires handling 3 native tokens during migration, then 2 native tokens post-migration.

| Phase | Native Tokens | Gas Payment | Staking |
|-------|---------------|-------------|---------|
| Pre-Migration | GOLD (tokenID 0), GILT (tokenID 1) | GOLD, GILT | GOLD, GILT |
| Migration (6 months) | GOLD (0), GILT (1), GOLD-X (2) | GOLD, GILT, GOLD-X | GOLD, GILT, GOLD-X |
| Post-Migration | GILT (1), GOLD-X (2) | GILT, GOLD-X | GILT, GOLD-X |

---

## System Contracts

### 1. GeneralNativeTokenManager

Controls which tokenIDs are valid for gas payment.

**State:**
```
mapping(uint64 => bool) public allowedGasTokens;
mapping(uint64 => uint256) public gasConversionRate;  // tokenID => rate vs base
```

**Functions:**
```
payAsGas(uint64 tokenID, uint64 gas, uint256 gasPrice) → (uint8 refundRate, uint256 convertedPrice)
  - Reverts if allowedGasTokens[tokenID] == false
  - Returns converted gas price for multi-token accounting

enableGasToken(uint64 tokenID, uint256 conversionRate) → onlyGovernance
  - Sets allowedGasTokens[tokenID] = true
  - Sets gasConversionRate[tokenID] = conversionRate

disableGasToken(uint64 tokenID) → onlyGovernance
  - Sets allowedGasTokens[tokenID] = false
```

**Genesis Config:**
```
allowedGasTokens[0] = true   // GOLD
allowedGasTokens[1] = true   // GILT
```

---

### 2. StakeHub Modifications

Controls which tokenIDs are valid for validator staking.

**New State:**
```
mapping(uint64 => bool) public allowedStakingTokens;
mapping(address => mapping(uint64 => uint256)) public validatorStakeByToken;  // validator => tokenID => amount
```

**Modified Functions:**
```
createValidator(... uint64 tokenID)
  - Requires allowedStakingTokens[tokenID] == true
  - Records stake under validatorStakeByToken[validator][tokenID]

delegate(address validator, uint64 tokenID, uint256 amount)
  - Requires allowedStakingTokens[tokenID] == true

distributeReward(address validator)
  - Calculates total valid stake = sum of validatorStakeByToken[validator][tokenID]
    where allowedStakingTokens[tokenID] == true
  - Validators with only disabled tokens get 0 rewards

undelegate(address validator, uint64 tokenID, uint256 amount)
  - Always allowed regardless of token status
  - Users can always withdraw their stake
```

**New Functions:**
```
enableStakingToken(uint64 tokenID) → onlyGovernance
  - Sets allowedStakingTokens[tokenID] = true

disableStakingToken(uint64 tokenID) → onlyGovernance
  - Sets allowedStakingTokens[tokenID] = false
  - Does NOT force unstake existing validators
```

**Genesis Config:**
```
allowedStakingTokens[0] = true   // GOLD
allowedStakingTokens[1] = true   // GILT
```

---

### 3. State Processor (Go)

**Transaction Validation:**
```go
func validateTransaction(tx *Transaction) error {
    tokenID := tx.GasTokenID()

    // Call GeneralNativeTokenManager.isAllowed(tokenID)
    allowed := callSystemContract(GeneralNativeTokenManager, "isAllowed", tokenID)
    if !allowed {
        return ErrInvalidGasToken
    }

    return nil
}
```

**Gas Payment:**
```go
func buyGas(st *StateTransition) error {
    tokenID := st.msg.GasTokenID()

    // Call GeneralNativeTokenManager.payAsGas(tokenID, gas, gasPrice)
    refundRate, convertedPrice := callSystemContract(
        GeneralNativeTokenManager,
        "payAsGas",
        tokenID,
        st.gas,
        st.gasPrice,
    )

    // Deduct from sender's balance of tokenID
    st.state.SubBalance(st.msg.From(), tokenID, requiredGas)

    return nil
}
```

---

## Migration Phases

### Phase 1: Pre-Migration (Launch)

**Genesis State:**
- tokenID 0 = GOLD (PAXG-backed)
- tokenID 1 = GILT (governance, 100M pre-mined)
- GeneralNativeTokenManager: [0, 1] allowed
- StakeHub: [0, 1] allowed

**Bridge (Ethereum → L1):**
- User deposits PAXG/XAUT to Vault
- Relayer mints tokenID 0 (GOLD) on L1

**Bridge (L1 → Ethereum):**
- User burns tokenID 0 (GOLD) on L1
- Relayer releases PAXG/XAUT from Vault

---

### Phase 2: Migration Window (6 Months)

**Governance Actions (Day 1 of migration):**
1. Deploy new bridge contract for physical-backed deposits
2. Call `GeneralNativeTokenManager.enableGasToken(2, rate)`
3. Call `StakeHub.enableStakingToken(2)`

**State After:**
- tokenID 0 = GOLD (PAXG-backed, legacy)
- tokenID 1 = GILT (governance)
- tokenID 2 = GOLD-X (physical-backed, new)
- GeneralNativeTokenManager: [0, 1, 2] allowed
- StakeHub: [0, 1, 2] allowed

**New Issuance (Physical-Backed):**
- User sends USDC/ETH to protocol treasury
- Protocol buys physical gold
- Mints tokenID 2 (GOLD-X) to user

**Migration Contract (L1):**
```
migrate(uint256 amount) payable
  - User sends: amount of tokenID 0 + equivalent USDC/ETH value
  - Contract burns tokenID 0
  - Contract mints tokenID 2
  - Emits MigrationEvent(user, amount)

  - Relayer picks up event
  - Marks PAXG in Ethereum vault as protocol-owned
```

**Validator Migration:**
- Validators can stake tokenID 2 alongside existing stakes
- Validators earning on tokenID 0 should migrate before deadline
- No forced unstaking

---

### Phase 3: Post-Migration

**Governance Actions (End of 6-month window):**
1. Call `GeneralNativeTokenManager.disableGasToken(0)`
2. Call `StakeHub.disableStakingToken(0)`
3. Disable PAXG bridge for new deposits (redemptions still work)

**State After:**
- tokenID 0 = GOLD (PAXG-backed, DISABLED for gas/staking)
- tokenID 1 = GILT (governance)
- tokenID 2 = GOLD-X (physical-backed, renamed to GOLD)
- GeneralNativeTokenManager: [1, 2] allowed
- StakeHub: [1, 2] allowed

**TokenID 0 Holders:**
- Cannot pay gas with tokenID 0
- Cannot stake tokenID 0
- CAN transfer tokenID 0 between wallets
- CAN redeem tokenID 0 for PAXG via bridge
- CAN swap tokenID 0 on DEX (if pools exist)

**Validators with TokenID 0 Staked:**
- Stop receiving gas fee rewards
- Can unstake anytime
- Should migrate to tokenID 2

**Transaction Rejection:**
```go
// Transaction with GasTokenID = 0 after migration
tx := Transaction{
    GasTokenID: 0,  // GOLD (disabled)
    ...
}
// Rejected at validation: ErrInvalidGasToken
```

---

## Bridge Contract Changes

### Ethereum Vault

**Pre-Migration State:**
```
uint256 public paxgLocked;
uint256 public xautLocked;
```

**Post-Migration State:**
```
uint256 public paxgLocked;           // User-redeemable
uint256 public xautLocked;           // User-redeemable
uint256 public protocolOwnedPaxg;    // From migrations, protocol treasury
uint256 public protocolOwnedXaut;    // From migrations, protocol treasury
```

**New Function:**
```
markProtocolOwned(address user, uint256 goldAmount) → onlyRelayer
  - Called when user migrates on L1
  - Moves user's backing from paxgLocked to protocolOwnedPaxg
  - User can no longer redeem that portion
```

### L1 Bridge Contract

**Token Minting:**
```
// Pre-migration: mint tokenID 0
mintFromBridge(address user, uint256 amount, uint64 tokenID)
  - tokenID 0 for PAXG/XAUT deposits
  - tokenID 2 for physical-backed deposits (post-migration start)
```

---

## File Modifications Required

### Go (geth fork)

| File | Changes |
|------|---------|
| `core/types/transaction.go` | Add GasTokenID, TransferTokenID fields |
| `core/state_transition.go` | Call GeneralNativeTokenManager for gas validation |
| `core/state_processor.go` | Validate GasTokenID before processing |
| `core/vm/evm.go` | Track token balances per tokenID |
| `core/state/statedb.go` | Multi-token balance storage |

### Solidity (system contracts)

| Contract | Changes |
|----------|---------|
| `GeneralNativeTokenManager.sol` | New contract for gas token management |
| `StakeHub.sol` | Multi-token staking support |
| `BSCValidatorSet.sol` | Reward distribution per token type |

### Bridge

| Component | Changes |
|-----------|---------|
| `Vault.sol` (Ethereum) | Add protocolOwned tracking |
| `Bridge.sol` (L1) | Multi-tokenID minting |
| `Relayer` | Handle migration events |

---

## Governance Proposals

### Migration Start Proposal
```
1. enableGasToken(2, 1e18)      // GOLD-X at 1:1 rate
2. enableStakingToken(2)         // Allow GOLD-X staking
3. deployMigrationContract()     // Deploy migration contract
4. updateBridge(tokenID=2)       // New deposits mint tokenID 2
```

### Migration End Proposal
```
1. disableGasToken(0)            // GOLD can't pay gas
2. disableStakingToken(0)        // GOLD can't stake
3. pauseBridgeDeposits(0)        // No new PAXG→GOLD minting
4. renameToken(2, "GOLD")        // GOLD-X becomes GOLD
```

---

## Testing Checklist

- [ ] Transaction with tokenID 0 succeeds pre-migration
- [ ] Transaction with tokenID 2 fails pre-migration (not enabled)
- [ ] Governance can enable tokenID 2
- [ ] Transaction with tokenID 2 succeeds after enable
- [ ] Staking with tokenID 2 succeeds after enable
- [ ] Governance can disable tokenID 0
- [ ] Transaction with tokenID 0 fails after disable
- [ ] Staking with tokenID 0 fails after disable
- [ ] Unstaking tokenID 0 succeeds after disable
- [ ] Redemption of tokenID 0 for PAXG succeeds after disable
- [ ] Validator with only tokenID 0 stake receives 0 rewards after disable
- [ ] Migration contract burns tokenID 0, mints tokenID 2

---

*Last Updated: February 2026*
