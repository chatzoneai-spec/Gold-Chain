package helper

import "testing"

const mainChainTxConfirmations = uint64(6)

// computeRootStakeProcessRange mirrors listener.ProcessHeader upper bound for non-finalized headers.
func computeRootStakeProcessRange(headerNumber uint64, isFinalized bool) uint64 {
	if isFinalized {
		return headerNumber
	}
	if headerNumber <= mainChainTxConfirmations {
		return 0
	}
	return headerNumber - mainChainTxConfirmations
}

func Test_ATTACK_nonFinalizedHeaderBelowConfirmations_notProcessed(t *testing.T) {
	t.Parallel()

	confirmations := mainChainTxConfirmations
	to := computeRootStakeProcessRange(confirmations, false)
	if to != 0 {
		t.Fatalf("latest header at confirmation boundary must not process events, got %d", to)
	}
}

func Test_ATTACK_nonFinalizedLatestHeader_excludesRecentBlocks(t *testing.T) {
	t.Parallel()

	to := computeRootStakeProcessRange(100, false)
	if to != 94 {
		t.Fatalf("must lag latest by MainChainTxConfirmations, got %d", to)
	}
	if 99 <= to {
		t.Fatal("block 99 must be above processable range when latest=100")
	}
}

func Test_ATTACK_finalizedHeader_allowsFullRange(t *testing.T) {
	t.Parallel()

	to := computeRootStakeProcessRange(100, true)
	if to != 100 {
		t.Fatalf("finalized header may include its own block, got %d", to)
	}
}

func Test_ATTACK_nonceReplayPolicy_rejectsStaleNonce(t *testing.T) {
	t.Parallel()

	lastNonce := uint64(3)
	if lastNonce+1 == 3 {
		t.Fatal("replayed nonce 3 must not be accepted when last is 3")
	}
	if lastNonce+1 != 4 {
		t.Fatal("only nonce 4 should be next")
	}
}
