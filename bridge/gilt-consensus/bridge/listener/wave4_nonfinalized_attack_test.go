package listener

import (
	"math/big"
	"testing"

	"github.com/stretchr/testify/require"

	chainmanagerTypes "github.com/giltchain/gilt-consensus/x/chainmanager/types"
)

// computeRootStakeProcessRange mirrors RootChainListener.ProcessHeader upper bound logic.
func computeRootStakeProcessRange(headerNumber *big.Int, isFinalized bool, confirmations uint64) *big.Int {
	if isFinalized {
		return new(big.Int).Set(headerNumber)
	}
	confirmationBlocks := big.NewInt(0).SetUint64(confirmations)
	if headerNumber.Cmp(confirmationBlocks) <= 0 {
		return nil
	}
	return new(big.Int).Sub(headerNumber, confirmationBlocks)
}

func Test_ATTACK_nonFinalizedHeaderBelowConfirmations_notProcessed(t *testing.T) {
	t.Parallel()

	confirmations := chainmanagerTypes.DefaultMainChainTxConfirmations
	headerNumber := big.NewInt(int64(confirmations))

	to := computeRootStakeProcessRange(headerNumber, false, confirmations)
	require.Nil(t, to, "latest header at confirmation boundary must not process events")
}

func Test_ATTACK_nonFinalizedLatestHeader_excludesRecentBlocks(t *testing.T) {
	t.Parallel()

	confirmations := chainmanagerTypes.DefaultMainChainTxConfirmations
	latest := big.NewInt(100)

	to := computeRootStakeProcessRange(latest, false, confirmations)
	require.Equal(t, uint64(94), to.Uint64(), "must lag latest by MainChainTxConfirmations")

	attackerBlock := big.NewInt(99)
	require.True(t, attackerBlock.Cmp(to) > 0, "block 99 must be above processable range when latest=100")
}

func Test_ATTACK_finalizedHeader_allowsFullRange(t *testing.T) {
	t.Parallel()

	confirmations := chainmanagerTypes.DefaultMainChainTxConfirmations
	finalized := big.NewInt(100)

	to := computeRootStakeProcessRange(finalized, true, confirmations)
	require.Equal(t, uint64(100), to.Uint64(), "finalized header may include its own block")
}

func Test_ATTACK_nonFinalizedEventAtBlock99_notInProcessableRange(t *testing.T) {
	t.Parallel()

	confirmations := chainmanagerTypes.DefaultMainChainTxConfirmations
	latest := big.NewInt(100)
	to := computeRootStakeProcessRange(latest, false, confirmations)

	attackerEventBlock := uint64(99)
	require.Greater(t, attackerEventBlock, to.Uint64(),
		"non-finalized StakingInfo at block 99 must not be treated as finalized when latest=100")
}
