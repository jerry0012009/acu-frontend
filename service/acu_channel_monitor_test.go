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
	})
	require.NoError(t, err)
	var body map[string]interface{}
	require.NoError(t, common.Unmarshal(requestBody, &body))
	require.Equal(t, []interface{}{"gpt-5.6-luna@max"}, body["allowedCandidateIds"])
	require.Equal(t, 140.5, body["candidatePreferenceScores"].(map[string]interface{})["gpt-5.6-luna@max"])
}

func TestGetACUSelectionCorridorRetriesWithoutPreferencesForLegacyRouter(t *testing.T) {
	var requestBodies []map[string]interface{}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		rawBody, _ := io.ReadAll(request.Body)
		var body map[string]interface{}
		require.NoError(t, common.Unmarshal(rawBody, &body))
		requestBodies = append(requestBodies, body)
		if _, hasScores := body["candidatePreferenceScores"]; hasScores {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":{"message":"Selection Corridor candidate preference scores are invalid"}}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"series":{"balanced":[]}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	result, err := GetACUSelectionCorridor(context.Background(), 10_000, 1_000, &ACUEffectiveRoutingPolicy{
		AllowedModelIDs:     []string{"gpt-5.6-luna"},
		AllowedCandidateIDs: []string{"gpt-5.6-luna@max"},
		CandidatePreferenceScores: map[string]float64{
			"gpt-5.6-luna@max": 99.7,
		},
	})

	require.NoError(t, err)
	require.Equal(t, map[string]interface{}{"series": map[string]interface{}{"balanced": []interface{}{}}}, result)
	require.Len(t, requestBodies, 2)
	require.Equal(t, 99.7, requestBodies[0]["candidatePreferenceScores"].(map[string]interface{})["gpt-5.6-luna@max"])
	_, hasScores := requestBodies[1]["candidatePreferenceScores"]
	require.False(t, hasScores)
	require.Equal(t, []interface{}{"gpt-5.6-luna@max"}, requestBodies[1]["allowedCandidateIds"])
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
