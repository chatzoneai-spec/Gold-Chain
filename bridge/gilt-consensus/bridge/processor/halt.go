package processor

import "sync/atomic"

var checkpointSubmissionHalted atomic.Bool

// SetCheckpointSubmissionHalted blocks or unblocks checkpoint submission when validator sets diverge.
func SetCheckpointSubmissionHalted(halted bool) {
	checkpointSubmissionHalted.Store(halted)
}

// IsCheckpointSubmissionHalted reports whether checkpoint submission is halted.
func IsCheckpointSubmissionHalted() bool {
	return checkpointSubmissionHalted.Load()
}
