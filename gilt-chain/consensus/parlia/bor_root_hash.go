package parlia

import (
	"encoding/hex"
	"fmt"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/consensus/parlia/checkpointroot"
)

const maxBorCheckpointLength uint64 = 1 << 15

var (
	errReorgDuringRootHash      = fmt.Errorf("reorg occurred while computing checkpoint root")
	errNonContiguousHeaderRange = fmt.Errorf("non-contiguous headers in checkpoint range")
)

// GetRootHash returns the Bor-compatible checkpoint root for the inclusive header range.
func (api *API) GetRootHash(start uint64, end uint64) (string, error) {
	head := api.chain.CurrentHeader()
	if head == nil {
		return "", errUnknownBlock
	}

	headNumber := head.Number.Uint64()
	if start > end || end > headNumber {
		return "", fmt.Errorf("invalid start/end block range: start=%d end=%d head=%d", start, end, headNumber)
	}

	length := end - start + 1
	if length > maxBorCheckpointLength {
		return "", fmt.Errorf(
			"checkpoint range exceeds maximum length: start=%d end=%d max=%d",
			start,
			end,
			maxBorCheckpointLength,
		)
	}

	endHeader := api.chain.GetHeaderByNumber(end)
	if endHeader == nil {
		return "", errUnknownBlock
	}
	endHash := endHeader.Hash()

	leaves := make([][32]byte, checkpointroot.NextPowerOfTwo(length))
	var prevHash common.Hash

	for number := start; number <= end; number++ {
		header := api.chain.GetHeaderByNumber(number)
		if header == nil {
			return "", errUnknownBlock
		}
		if number > start && header.ParentHash != prevHash {
			return "", errNonContiguousHeaderRange
		}

		prevHash = header.Hash()
		leaves[number-start] = checkpointroot.HeaderLeafHashFromHeader(header)
	}

	latestEndHeader := api.chain.GetHeaderByNumber(end)
	if latestEndHeader == nil || latestEndHeader.Hash() != endHash {
		return "", errReorgDuringRootHash
	}

	root := checkpointroot.MerkleRootFromLeaves(leaves)
	return hex.EncodeToString(root[:]), nil
}
