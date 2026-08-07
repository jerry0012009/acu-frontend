package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/require"
)

func TestGetACUChannelMonitorValidatesAndForwardsViewParameters(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{
		"ACURoutingUtilityConfig": `{"schemaVersion":"acu-routing-utility-config-v1","formulaMode":"active","qualityPresets":{"economy":-10,"balanced":20,"quality":70},"acuHighBiasOffset":40,"modelCostLogScale":0.75,"supplyPresets":{"lowest_cost":{"cost":100,"speed":0,"reliability":0},"balanced":{"cost":40,"speed":25,"reliability":35},"low_latency":{"cost":10,"speed":80,"reliability":10},"high_reliability":{"cost":10,"speed":10,"reliability":80}},"profileCostLogScale":7,"profileSpeedLogScale":2.5,"latency":{"windowHours":24,"longContextThresholdTokens":100000,"minimumSamples":17,"unknownLatencyMultiplier":1.2},"reliability":{"windowHours":24,"minimumSamples":5,"unknownDefault":0.75,"degradedMultiplier":0.85},"workPhaseBiasOffsets":{"inspection":-10,"general":0,"implementation":0,"verification":0,"planning":10,"recovery":20}}`,
	}
	requests := make(chan *http.Request, 2)
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		requests <- request.Clone(request.Context())
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"range":"24h","supplyStrategy":"balanced","scenario":"standard","profiles":[],"history":[],"cooldownIntervals":[],"probeHistory":[],"supplyInventory":[],"modelPool":[]}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	result, err := GetACUChannelMonitor(context.Background(), "7d", "low_latency", "long")
	require.NoError(t, err)
	require.Equal(t, float64(118), result.DefaultCandidatePreferenceScores["claude-opus-4-8"])
	forwarded := <-requests
	require.Equal(t, "7d", forwarded.URL.Query().Get("range"))
	require.Equal(t, "low_latency", forwarded.URL.Query().Get("supplyStrategy"))
	require.Equal(t, "long", forwarded.URL.Query().Get("scenario"))
	var forwardedPolicy map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(forwarded.Header.Get("X-ACU-Monitor-Routing-Utility-Policy"), &forwardedPolicy))
	require.Equal(t, float64(7), forwardedPolicy["profileCostLogScale"])
	require.Equal(t, float64(17), forwardedPolicy["latency"].(map[string]interface{})["minimumSamples"])
	require.Equal(t, float64(80), forwardedPolicy["supplyWeights"].(map[string]interface{})["speed"])

	_, err = GetACUChannelMonitor(context.Background(), "invalid", "invalid", "invalid")
	require.NoError(t, err)
	defaults := <-requests
	require.Equal(t, "24h", defaults.URL.Query().Get("range"))
	require.Equal(t, "balanced", defaults.URL.Query().Get("supplyStrategy"))
	require.Equal(t, "standard", defaults.URL.Query().Get("scenario"))
}

func TestGetACUSelectionCorridorSendsCandidatePolicy(t *testing.T) {
	var requestBody []byte
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		requestBody, _ = io.ReadAll(request.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"series":{}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	_, err := GetACUSelectionCorridor(context.Background(), 10_000, 1_000, &ACUEffectiveRoutingPolicy{
		AllowedCandidateIDs: []string{"gpt-5.6-luna@max"},
		CandidatePreferenceScores: map[string]float64{
			"gpt-5.6-luna@max": 140.5,
		},
	}, "messages")
	require.NoError(t, err)
	var body map[string]interface{}
	require.NoError(t, common.Unmarshal(requestBody, &body))
	require.Equal(t, []interface{}{"gpt-5.6-luna@max"}, body["allowedCandidateIds"])
	require.Equal(t, 140.5, body["candidatePreferenceScores"].(map[string]interface{})["gpt-5.6-luna@max"])
	require.Equal(t, "messages", body["protocol"])
}

func TestGetACUSelectionCorridorPropagatesPreferenceValidationError(t *testing.T) {
	requests := 0
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		requests++
		rawBody, _ := io.ReadAll(request.Body)
		var body map[string]interface{}
		require.NoError(t, common.Unmarshal(rawBody, &body))
		require.Equal(t, 99.7, body["candidatePreferenceScores"].(map[string]interface{})["gpt-5.6-luna@max"])
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"message":"Selection Corridor candidate preference scores are invalid"}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	_, err := GetACUSelectionCorridor(context.Background(), 10_000, 1_000, &ACUEffectiveRoutingPolicy{
		AllowedModelIDs:     []string{"gpt-5.6-luna"},
		AllowedCandidateIDs: []string{"gpt-5.6-luna@max"},
		CandidatePreferenceScores: map[string]float64{
			"gpt-5.6-luna@max": 99.7,
		},
	})

	require.EqualError(t, err, "ACU selection corridor returned HTTP 503")
	require.Equal(t, 1, requests)
}

func TestGetACUSelectionCorridorDoesNotRetryUnrelatedRouter503(t *testing.T) {
	requests := 0
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		requests++
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":{"message":"No execution profile satisfies the routing policy"}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	_, err := GetACUSelectionCorridor(context.Background(), 10_000, 1_000, &ACUEffectiveRoutingPolicy{
		CandidatePreferenceScores: map[string]float64{"gpt-5.6-luna@max": 99.7},
	})

	require.EqualError(t, err, "ACU selection corridor returned HTTP 503")
	require.Equal(t, 1, requests)
}
