package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestPrivateACUAdminProxyReadsPromptsAndMemory(t *testing.T) {
	requests := make(chan struct {
		method string
		path   string
		body   []byte
		auth   string
	}, 3)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		requests <- struct {
			method string
			path   string
			body   []byte
			auth   string
		}{
			method: request.Method,
			path:   request.URL.Path,
			body:   body,
			auth:   request.Header.Get("Authorization"),
		}
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/internal/admin/private-acu/prompts":
			_, _ = writer.Write([]byte(`{"prompts":{"observerPrompt":"observer","advisorPrompt":"advisor","learningPrompt":"learning","promptVersion":2,"source":"default"}}`))
		case "/internal/admin/private-acu/memory":
			_, _ = writer.Write([]byte(`{"memory":{"enabled":true,"userId":"3","spaceId":"space-1","skills":[]}}`))
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-private-acu-token")

	prompts, err := GetPrivateACUPrompts(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(2), prompts.PromptVersion)

	memory, err := GetPrivateACUMemory(context.Background())
	require.NoError(t, err)
	require.Equal(t, "space-1", memory.SpaceID)

	for _, expected := range []struct {
		method string
		path   string
	}{
		{http.MethodGet, "/internal/admin/private-acu/prompts"},
		{http.MethodGet, "/internal/admin/private-acu/memory"},
	} {
		request := <-requests
		require.Equal(t, expected.method, request.method)
		require.Equal(t, expected.path, request.path)
		require.Equal(t, "Bearer test-private-acu-token", request.auth)
	}
}

func TestPrivateACUAdminProxySavesPrompts(t *testing.T) {
	var body []byte
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ = io.ReadAll(request.Body)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"prompts":{"observerPrompt":"updated","advisorPrompt":"updated","learningPrompt":"updated","promptVersion":3,"source":"database","updatedBy":"root"}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-private-acu-token")

	result, err := SavePrivateACUPrompts(context.Background(), dto.ACUPrivatePromptsRequest{
		ObserverPrompt: "updated",
		AdvisorPrompt:  "updated",
		LearningPrompt: "updated",
	}, "root")
	require.NoError(t, err)
	require.Equal(t, int64(3), result.PromptVersion)

	var payload map[string]string
	require.NoError(t, common.Unmarshal(body, &payload))
	require.Equal(t, map[string]string{
		"observerPrompt": "updated",
		"advisorPrompt":  "updated",
		"learningPrompt": "updated",
		"updatedBy":      "root",
	}, payload)
}
