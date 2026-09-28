package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestVeridropValidatesRequestAndRecoversFromUpstreamFailure(t *testing.T) {
	acuVeridropMu.Lock()
	previous := acuVeridropLastRun
	acuVeridropLastRun = map[string]time.Time{}
	acuVeridropMu.Unlock()
	t.Cleanup(func() { acuVeridropMu.Lock(); acuVeridropLastRun = previous; acuVeridropMu.Unlock() })
	var calls atomic.Int32
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPost, r.Method)
		assert.Equal(t, "/internal/admin/execution-profiles/veridrop", r.URL.Path)
		var body map[string]interface{}
		if !assert.NoError(t, common.DecodeJson(r.Body, &body)) {
			w.WriteHeader(400)
			return
		}
		assert.Equal(t, map[string]interface{}{"executionProfileId": "fixture:model:responses", "protocol": "responses"}, body)
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"supported":true,"verdict":"pass"}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	for _, input := range []map[string]interface{}{
		{"executionProfileId": "", "protocol": "responses"},
		{"executionProfileId": "fixture:model:responses", "protocol": "invalid"},
		{"executionProfileId": "fixture:model:responses", "protocol": "responses", "routingEnabled": false},
	} {
		_, err := RunACUProfileVeridrop(context.Background(), 42, input)
		require.Error(t, err)
	}
	require.Equal(t, int32(0), calls.Load())
	input := map[string]interface{}{"executionProfileId": " fixture:model:responses ", "protocol": "responses"}
	_, err := RunACUProfileVeridrop(context.Background(), 42, input)
	require.Error(t, err)
	result, err := RunACUProfileVeridrop(context.Background(), 42, input)
	require.NoError(t, err, "upstream failure must allow retry")
	assert.Equal(t, "pass", result["verdict"])
	_, err = RunACUProfileVeridrop(context.Background(), 42, input)
	require.ErrorContains(t, err, "cooling down")
	assert.Equal(t, int32(2), calls.Load(), "cooldown must not reach the upstream")
	_, err = RunACUProfileVeridrop(context.Background(), 43, input)
	require.NoError(t, err, "cooldown is scoped to the requesting account")
	assert.Equal(t, int32(3), calls.Load())
}
