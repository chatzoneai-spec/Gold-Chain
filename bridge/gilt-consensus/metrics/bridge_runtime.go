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
)

func SetBridgeRuntimeHealthMetrics(bridgeEnabled bool, bridgeMode, finalityPolicy string) {
	enabled := 0.0
	if bridgeEnabled {
		enabled = 1.0
	}
	bridgeEnabledGauge.WithLabelValues(bridgeMode).Set(enabled)
	bridgeModeGauge.WithLabelValues(bridgeMode).Set(1)
	bridgeFinalityPolicyGauge.WithLabelValues(finalityPolicy).Set(1)
}
