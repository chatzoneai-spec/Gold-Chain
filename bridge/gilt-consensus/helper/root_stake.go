package helper

import (
	"sync/atomic"

	"github.com/spf13/viper"

	"github.com/giltchain/gilt-consensus/metrics"
)

var rootAnchoredStakeReadEnabled atomic.Bool

func init() {
	rootAnchoredStakeReadEnabled.Store(true)
}

// IsRootAnchoredStakeReadEnabled reports whether finalized root StakingInfo events
// may update the gilt-consensus validator set. Disabled when bridge is off or frozen.
func IsRootAnchoredStakeReadEnabled() bool {
	if !viper.GetBool(BridgeFlag) {
		return false
	}
	return rootAnchoredStakeReadEnabled.Load()
}

// SetRootAnchoredStakeReadEnabled toggles the root-anchored stake read path.
// When disabled, the validator set freezes at the last-known-good state.
func SetRootAnchoredStakeReadEnabled(enabled bool) {
	rootAnchoredStakeReadEnabled.Store(enabled)
	metrics.SetRootAnchoredStakeReadMetrics(enabled)
}

// FreezeRootAnchoredStakeRead disables root stake consumption after listener errors.
func FreezeRootAnchoredStakeRead() {
	SetRootAnchoredStakeReadEnabled(false)
}
