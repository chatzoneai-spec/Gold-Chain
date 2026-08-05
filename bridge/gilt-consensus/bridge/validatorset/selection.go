package validatorset

import (
	"container/heap"
	"math/big"

	"github.com/ethereum/go-ethereum/common"
)

const BreatheBlockInterval = 86400

// ValidatorItem mirrors parlia.ValidatorItem.
type ValidatorItem struct {
	Address     common.Address
	VotingPower *big.Int
	VoteAddress []byte
}

// ValidatorHeap is a max-heap of validator voting power (parlia/feynmanfork.go).
type ValidatorHeap []ValidatorItem

func (h *ValidatorHeap) Len() int { return len(*h) }

func (h *ValidatorHeap) Less(i, j int) bool {
	if (*h)[i].VotingPower.Cmp((*h)[j].VotingPower) == 0 {
		return (*h)[i].Address.Hex() < (*h)[j].Address.Hex()
	}
	return (*h)[i].VotingPower.Cmp((*h)[j].VotingPower) == 1
}

func (h *ValidatorHeap) Swap(i, j int) { (*h)[i], (*h)[j] = (*h)[j], (*h)[i] }

func (h *ValidatorHeap) Push(x interface{}) {
	*h = append(*h, x.(ValidatorItem))
}

func (h *ValidatorHeap) Pop() interface{} {
	old := *h
	n := len(old)
	x := old[n-1]
	*h = old[0 : n-1]
	return x
}

// IsBreatheBlock returns true when blockTime crosses a UTC day boundary from parentTime.
func IsBreatheBlock(parentTime, blockTime uint64) bool {
	return parentTime != 0 && parentTime/BreatheBlockInterval != blockTime/BreatheBlockInterval
}

// ElectedValidator is the top-N selection result after 1e10 power scaling.
type ElectedValidator struct {
	Address     common.Address
	VotingPower uint64
	VoteAddress []byte
}

// GetTopValidatorsByVotingPower ports parlia getTopValidatorsByVotingPower byte-for-byte.
func GetTopValidatorsByVotingPower(validatorItems []ValidatorItem, maxElectedValidators *big.Int) []ElectedValidator {
	var validatorHeap ValidatorHeap
	for i := 0; i < len(validatorItems); i++ {
		if validatorItems[i].VotingPower.Cmp(big.NewInt(0)) == 1 {
			validatorHeap = append(validatorHeap, validatorItems[i])
		}
	}
	hp := &validatorHeap
	heap.Init(hp)

	topN := int(maxElectedValidators.Int64())
	if topN > len(validatorHeap) {
		topN = len(validatorHeap)
	}

	elected := make([]ElectedValidator, topN)
	for i := 0; i < topN; i++ {
		item := heap.Pop(hp).(ValidatorItem)
		elected[i] = ElectedValidator{
			Address:     item.Address,
			VotingPower: new(big.Int).Div(item.VotingPower, big.NewInt(1e10)).Uint64(),
			VoteAddress: item.VoteAddress,
		}
	}

	return elected
}
