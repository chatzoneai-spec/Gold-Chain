package processor

import (
	"testing"

	"github.com/stretchr/testify/require"
)

// Checkpoint submission is owned by CheckpointProcessor (bridge/processor/checkpoint.go),
// started from service.go. CommitmentProcessor is only the validator-set handoff path
// and must not grow a second checkpoint producer.

func TestNextCheckpointStart_NoPriorCheckpoint(t *testing.T) {
	t.Parallel()
	require.Equal(t, uint64(0), NextCheckpointStart(0))
}

func TestNextCheckpointStart_AfterCheckpoint(t *testing.T) {
	t.Parallel()
	require.Equal(t, uint64(101), NextCheckpointStart(100))
	require.Equal(t, uint64(2), NextCheckpointStart(1))
}

func TestNextCheckpointStart_SequentialWindows(t *testing.T) {
	t.Parallel()

	windows := []struct {
		previousEnd uint64
		start       uint64
		end         uint64
	}{
		{previousEnd: 0, start: 0, end: 99},
		{previousEnd: 99, start: 100, end: 199},
		{previousEnd: 199, start: 200, end: 299},
	}

	var priorEnd uint64
	for i, window := range windows {
		start := NextCheckpointStart(priorEnd)
		require.Equal(t, window.start, start, "window %d start", i)

		if i > 0 {
			require.Equal(t, priorEnd+1, start, "window %d must follow previous end", i)
			require.Greater(t, start, windows[i-1].end, "window %d must not overlap", i)
		}

		require.GreaterOrEqual(t, window.end, start, "window %d end must cover start", i)
		priorEnd = window.end
	}
}
