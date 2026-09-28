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

func TestMonitorScoreEvidenceSurvivesDecodeAndPublicAPISerialization(t *testing.T) {
	var profile ACUChannelMonitorProfile
	require.NoError(t, common.Unmarshal([]byte(`{"routingEnabled":true,"rawCostUtility":0.25,"rawSpeedUtility":0,"scoredProbeCount":3,"scoredProbeLatencyP50Ms":1200,"productionReliabilitySamples":2,"productionReliabilitySuccesses":1,"targetedProbeCount":1}`), &profile))
	encoded, err := common.Marshal(profile)
	require.NoError(t, err)
	var result map[string]interface{}
	require.NoError(t, common.Unmarshal(encoded, &result))
	assert.Equal(t, 0.25, result["rawCostUtility"])
	assert.Equal(t, float64(0), result["rawSpeedUtility"])
	assert.Equal(t, float64(1200), result["scoredProbeLatencyP50Ms"])
	assert.Equal(t, float64(3), result["scoredProbeCount"])
	assert.Equal(t, float64(1), result["productionReliabilitySuccesses"])
	assert.Equal(t, float64(1), result["targetedProbeCount"])
	assert.Nil(t, result["rawReliabilityUtility"])
}
