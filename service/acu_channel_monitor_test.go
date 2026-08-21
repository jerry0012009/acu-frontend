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
	requests := make(chan *http.Request, 3)
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		requests <- request.Clone(request.Context())
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"range":"24h","supplyStrategy":"balanced","scenario":"standard","profiles":[],"history":[],"cooldownIntervals":[],"probeHistory":[],"supplyInventory":[],"modelPool":[]}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	result, err := GetACUChannelMonitor(context.Background(), "24h", "low_latency", "long", "48h", "messages")
	require.NoError(t, err)
	require.Equal(t, float64(118), result.DefaultCandidatePreferenceScores["claude-opus-4-8"])
	forwarded := <-requests
	require.Equal(t, "24h", forwarded.URL.Query().Get("range"))
	require.Equal(t, "low_latency", forwarded.URL.Query().Get("supplyStrategy"))
	require.Equal(t, "long", forwarded.URL.Query().Get("scenario"))
	require.Equal(t, "48h", forwarded.URL.Query().Get("probeRange"))
	require.Equal(t, "messages", forwarded.URL.Query().Get("protocol"))
	var forwardedPolicy map[string]interface{}
	require.NoError(t, common.UnmarshalJsonStr(forwarded.Header.Get("X-ACU-Monitor-Routing-Utility-Policy"), &forwardedPolicy))
	require.Equal(t, float64(7), forwardedPolicy["profileCostLogScale"])
	require.Equal(t, float64(17), forwardedPolicy["latency"].(map[string]interface{})["minimumSamples"])
	require.Equal(t, float64(80), forwardedPolicy["supplyWeights"].(map[string]interface{})["speed"])

	_, err = GetACUChannelMonitor(context.Background(), "7d", "balanced", "standard", "7d", "all")
	require.NoError(t, err)
	sevenDays := <-requests
	require.Equal(t, "7d", sevenDays.URL.Query().Get("range"))
	require.Equal(t, "7d", sevenDays.URL.Query().Get("probeRange"))
	require.Equal(t, "all", sevenDays.URL.Query().Get("protocol"))

	_, err = GetACUChannelMonitor(context.Background(), "invalid", "invalid", "invalid", "invalid", "invalid")
	require.NoError(t, err)
	defaults := <-requests
	require.Equal(t, "24h", defaults.URL.Query().Get("range"))
	require.Equal(t, "balanced", defaults.URL.Query().Get("supplyStrategy"))
	require.Equal(t, "standard", defaults.URL.Query().Get("scenario"))
	require.Equal(t, "48h", defaults.URL.Query().Get("probeRange"))
	require.Equal(t, "responses", defaults.URL.Query().Get("protocol"))
}

func TestExecutionProfileManagementForwardsOnlyTargetedRouterOperations(t *testing.T) {
	type observedRequest struct {
		method string
		path   string
		body   []byte
	}
	requests := make(chan observedRequest, 5)
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		requests <- observedRequest{method: request.Method, path: request.URL.Path, body: body}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"ok","profiles":[]}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	_, err := GetACUExecutionProfiles(context.Background())
	require.NoError(t, err)
	_, err = CreateACUExecutionProfile(context.Background(), map[string]interface{}{
		"profile": map[string]interface{}{"executionProfileId": "test:model:responses"},
	})
	require.NoError(t, err)
	_, err = UpdateACUExecutionProfile(context.Background(), "test:model:responses", map[string]interface{}{
		"profile": map[string]interface{}{"enabled": false},
	})
	require.NoError(t, err)
	_, err = ProbeACUExecutionProfile(context.Background(), map[string]interface{}{
		"executionProfileId": "test:model:responses", "protocol": "responses",
	})
	require.NoError(t, err)
	_, err = ReconcileACUExecutionProfileEconomics(
		context.Background(),
		"test:model:responses",
		map[string]interface{}{"observedBillingMultiplier": 0.06},
	)
	require.NoError(t, err)
	_, err = ApplyACUExecutionProfiles(context.Background())
	require.NoError(t, err)

	expected := []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/internal/admin/execution-profiles"},
		{http.MethodPost, "/internal/admin/execution-profiles"},
		{http.MethodPut, "/internal/admin/execution-profiles/test:model:responses"},
		{http.MethodPost, "/internal/admin/execution-profiles/probe"},
		{http.MethodPatch, "/internal/admin/execution-profiles/test:model:responses/economics"},
		{http.MethodPost, "/internal/admin/execution-profiles/apply"},
	}
	for _, item := range expected {
		actual := <-requests
		require.Equal(t, item.method, actual.method)
		require.Equal(t, item.path, actual.path)
	}
}

func TestGetACURoutingCatalogOmitsSupplyTelemetry(t *testing.T) {
	previous := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previous })
	common.OptionMap = map[string]string{}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"range":"24h","supplyStrategy":"balanced","scenario":"standard",
			"profiles":[{
				"executionProfileId":"lucen:luna:responses","canonicalModel":"gpt-5.6-luna",
				"protocol":["responses"],"provider":"lucen","channel":"cx014",
				"enabled":true,"administratorAllowed":true,"autoRouteEnabled":true,
				"supportedReasoningEfforts":["default","max"],"probeCostCny":12.5,
				"state":"healthy"
			},{
				"executionProfileId":"disabled:profile","canonicalModel":"gpt-5.6-sol",
				"protocol":["responses"],"provider":"secret-provider","channel":"secret-channel",
				"enabled":false,"administratorAllowed":true,"autoRouteEnabled":true
			}],
			"modelPool":[{
				"modelId":"gpt-5.6-luna","vendor":"OpenAI","modelCategory":"text_agent",
				"capabilityTier":"LUNA","protocols":["responses"],
				"verificationStatus":"verified","autoRouteEnabled":true,
				"currentBestChannel":"secret-channel",
				"routingCandidates":[{
					"candidateId":"gpt-5.6-luna","modelId":"gpt-5.6-luna",
					"displayName":"Luna","kind":"base","protocols":["responses"]
				}]
			},{
				"modelId":"rejected","vendor":"Unknown","modelCategory":"text_agent",
				"capabilityTier":"LUNA","protocols":["responses"],
				"verificationStatus":"rejected","autoRouteEnabled":false
			}],
			"defaultCandidatePreferenceScores":{"gpt-5.6-luna":99.7},
			"history":[{"provider":"secret-provider"}],
			"supplyInventory":[{"channel":"secret-channel"}]
		}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	result, err := GetACURoutingCatalog(context.Background())
	require.NoError(t, err)
	require.Len(t, result.Models, 1)
	require.Len(t, result.Profiles, 1)
	require.Equal(t, "lucen:luna:responses", result.Profiles[0].ExecutionProfileID)
	require.Equal(t, []string{"default", "max"}, result.Profiles[0].SupportedReasoningEfforts)
	require.NotContains(t, string(mustMarshalTestJSON(t, result)), "secret-channel")
	require.NotContains(t, string(mustMarshalTestJSON(t, result)), "probeCostCny")
}

func mustMarshalTestJSON(t *testing.T, value interface{}) []byte {
	t.Helper()
	data, err := common.Marshal(value)
	require.NoError(t, err)
	return data
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
