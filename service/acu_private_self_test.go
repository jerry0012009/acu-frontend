package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPrivateACUUserSettingsForwardsAuthenticatedUserAndExplicitFalse(t *testing.T) {
	var payload map[string]interface{}
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, http.MethodPut, r.Method)
		assert.Equal(t, "/internal/admin/private-acu/user-config", r.URL.Path)
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		assert.NoError(t, common.DecodeJson(r.Body, &payload))
		_, _ = w.Write([]byte(`{"config":{"observerEnabled":false,"learningEnabled":true,"observerInterval":null}}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	result, err := UpdatePrivateACUUserConfig(context.Background(), 42, dto.ACUPrivateUserConfigRequest{LearningEnabled: true})
	require.NoError(t, err)
	assert.Equal(t, "42", payload["newapiUserId"])
	assert.Equal(t, false, payload["observerEnabled"])
	assert.Equal(t, false, payload["advisorEnabled"])
	assert.Equal(t, false, payload["injectionEnabled"])
	assert.Equal(t, true, payload["learningEnabled"])
	assert.Contains(t, payload, "observerInterval")
	assert.Nil(t, payload["observerInterval"])
	assert.False(t, result.ObserverEnabled)
	assert.True(t, result.LearningEnabled)
}

func TestPrivateACULearningDetailRejectsAnotherUserAndProjectsOwnRecord(t *testing.T) {
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"run":{"runId":"run-42","newapiUserId":"42","learningKind":"user_dissatisfaction","distillation":{"distilled_context":"own preference","element_count":1,"internal_prompt":"hidden"},"skillChanges":[]}}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	_, err := GetPrivateACULearningRunDetailForUser(context.Background(), 7, "run-42")
	require.ErrorContains(t, err, "not found")
	result, err := GetPrivateACULearningRunDetailForUser(context.Background(), 42, "run-42")
	require.NoError(t, err)
	assert.Equal(t, "run-42", result.RunID)
	assert.Equal(t, "own preference", result.Distillation["distilled_context"])
	assert.NotContains(t, result.Distillation, "internal_prompt")
}

func TestPrivateACULearningListScopesUserAndReportsUpstreamFailure(t *testing.T) {
	status := http.StatusOK
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "42", r.URL.Query().Get("newapiUserId"))
		assert.Equal(t, "user_dissatisfaction", r.URL.Query().Get("learningKind"))
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"runs":[]}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	result, err := GetPrivateACULearningRunsForUser(context.Background(), 42)
	require.NoError(t, err)
	assert.NotNil(t, result.Runs)
	assert.Empty(t, result.Runs)
	status = http.StatusServiceUnavailable
	_, err = GetPrivateACULearningRunsForUser(context.Background(), 42)
	require.ErrorContains(t, err, "503")
}
