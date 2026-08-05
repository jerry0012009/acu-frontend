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
