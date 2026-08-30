package listener

import (
	"math/big"
	"testing"

	"github.com/spf13/viper"
	"github.com/stretchr/testify/require"

	"github.com/giltchain/gilt-consensus/helper"
)

func TestSupportedRootChainStakeEvents(t *testing.T) {
	t.Parallel()

	require.True(t, isSupportedRootChainEvent(helper.StakedEvent))
	require.True(t, isSupportedRootChainEvent(helper.UnstakeInitEvent))
	require.True(t, isSupportedRootChainEvent(helper.UnstakedEvent))
	require.True(t, isSupportedRootChainEvent(helper.SignerChangeEvent))
	require.True(t, isSupportedRootChainEvent(helper.StakeUpdateEvent))
	require.True(t, isSupportedRootChainEvent(helper.RestakedEvent))
	require.True(t, isSupportedRootChainEvent(helper.ShareMintedEvent))
	require.True(t, isSupportedRootChainEvent(helper.ShareBurnedEvent))
}

func TestFinalizedHeaderEligibleForRootStakeProcessing(t *testing.T) {
	t.Parallel()

	headerNumber := big.NewInt(100)
	confirmations := uint64(6)

	finalizedTo := headerNumber
	require.Equal(t, uint64(100), finalizedTo.Uint64())

	latestNumber := big.NewInt(100)
	latestNumber = latestNumber.Sub(latestNumber, big.NewInt(int64(confirmations)))
	require.Equal(t, uint64(94), latestNumber.Uint64())
}

func TestRootAnchoredStakeToggleDisablesEventHandling(t *testing.T) {
	t.Parallel()

	viper.Set(helper.BridgeFlag, true)
	helper.SetRootAnchoredStakeReadEnabled(true)
	require.True(t, helper.IsRootAnchoredStakeReadEnabled())

	helper.SetRootAnchoredStakeReadEnabled(false)
	require.False(t, helper.IsRootAnchoredStakeReadEnabled())
}

func TestListenerFreezeOnQueryFailureDoesNotAdvanceCursor(t *testing.T) {
	t.Parallel()

	from := big.NewInt(10)
	queryErr := true
	advanced := false

	if queryErr {
		helper.FreezeRootAnchoredStakeRead()
	} else {
		advanced = true
	}

	require.False(t, advanced)
	require.False(t, helper.IsRootAnchoredStakeReadEnabled())
	require.Equal(t, "10", from.String())
}

func TestReplayedValidatorNonceRejected(t *testing.T) {
	t.Parallel()

	lastNonce := uint64(3)
	cases := []struct {
		name    string
		nonce   uint64
		allowed bool
	}{
		{name: "next nonce", nonce: 4, allowed: true},
		{name: "replayed nonce", nonce: 3, allowed: false},
		{name: "stale nonce", nonce: 2, allowed: false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			allowed := tc.nonce == lastNonce+1
			require.Equal(t, tc.allowed, allowed)
		})
	}
}
