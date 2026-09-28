package dto

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestMonitorRoutingWeightPreservesWireUnitsAndExplicitZero(t *testing.T) {
	for _, tc := range []struct {
		name    string
		payload string
		weight  float64
	}{
		{"legacy missing weight is neutral", `{}`, 100},
		{"explicit zero remains zero", `{"routingWeight":0}`, 0},
		{"weight is not the utility multiplier", `{"routingWeight":130,"profilePreferenceMultiplier":1.3}`, 130},
		{"special weight retains its range", `{"routingWeight":500}`, 500},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var profile ACUChannelMonitorProfile
			require.NoError(t, common.Unmarshal([]byte(tc.payload), &profile))
			assert.Equal(t, tc.weight, profile.RoutingWeight)
		})
	}
}
