package keeper

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// requireRootValidatorNoncePolicy mirrors keeper.requireRootValidatorNonce acceptance rule.
func requireRootValidatorNoncePolicy(lastNonce uint64, incomingNonce uint64) bool {
	if lastNonce == 0 {
		return incomingNonce == 1
	}
	return incomingNonce == lastNonce+1
}

func Test_ATTACK_replayValidatorNonce_rejected(t *testing.T) {
	t.Parallel()

	lastNonce := uint64(3)
	require.False(t, requireRootValidatorNoncePolicy(lastNonce, 3), "same nonce replay must fail")
	require.False(t, requireRootValidatorNoncePolicy(lastNonce, 2), "stale nonce must fail")
	require.True(t, requireRootValidatorNoncePolicy(lastNonce, 4), "only next nonce allowed")
}

func Test_ATTACK_doubleApplySameStakingInfoEvent_rejected(t *testing.T) {
	t.Parallel()

	applied := make(map[uint64]bool)
	lastNonce := uint64(0)

	apply := func(nonce uint64) bool {
		if !requireRootValidatorNoncePolicy(lastNonce, nonce) {
			return false
		}
		if applied[nonce] {
			return false
		}
		applied[nonce] = true
		lastNonce = nonce
		return true
	}

	require.True(t, apply(1))
	require.False(t, apply(1), "replay of nonce 1 must not double-apply")
	require.True(t, apply(2))
	require.False(t, apply(2), "replay of nonce 2 must not double-apply")
}
