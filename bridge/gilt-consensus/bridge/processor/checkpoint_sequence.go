package processor

// NextCheckpointStart returns the start block for the next RootChain checkpoint.
// RootChain requires the first checkpoint to start at 0; every later checkpoint
// must start at previousEnd+1 (see RootChain._buildHeaderBlock).
func NextCheckpointStart(previousEnd uint64) uint64 {
	if previousEnd == 0 {
		return 0
	}
	return previousEnd + 1
}
