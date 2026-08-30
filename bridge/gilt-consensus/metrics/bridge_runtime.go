package metrics

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

var (
	bridgeEnabledGauge = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: Namespace,
			Subsystem: "bridge",
			Name:      "enabled",
			Help:      "Whether bridge runtime is enabled (1 enabled, 0 disabled).",
		},
		[]string{"bridge_mode"},
	)

	bridgeModeGauge = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: Namespace,
			Subsystem: "bridge",
			Name:      "mode",
			Help:      "Bridge mode metadata gauge (always 1 for active mode label).",
		},
		[]string{"bridge_mode"},
	)

	bridgeFinalityPolicyGauge = promauto.NewGaugeVec(
		prometheus.GaugeOpts{
			Namespace: Namespace,
			Subsystem: "bridge",
			Name:      "finality_policy",
			Help:      "Bridge finality policy metadata gauge (always 1 for active policy label).",
		},
		[]string{"finality_policy"},
	)

	rootAnchoredStakeReadGauge = promauto.NewGauge(
		prometheus.GaugeOpts{
			Namespace: Namespace,
			Subsystem: "bridge",
			Name:      "root_anchored_stake_read_enabled",
			Help:      "Whether finalized root StakingInfo events may update the validator set (1 enabled, 0 frozen).",
		},
	)
)

func SetRootAnchoredStakeReadMetrics(enabled bool) {
	value := 0.0
	if enabled {
		value = 1.0
	}
	rootAnchoredStakeReadGauge.Set(value)
}

func SetBridgeRuntimeHealthMetrics(bridgeEnabled bool, bridgeMode, finalityPolicy string) {
	enabled := 0.0
	if bridgeEnabled {
		enabled = 1.0
	}
	bridgeEnabledGauge.WithLabelValues(bridgeMode).Set(enabled)
	bridgeModeGauge.WithLabelValues(bridgeMode).Set(1)
	bridgeFinalityPolicyGauge.WithLabelValues(finalityPolicy).Set(1)
}
