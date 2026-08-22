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

func TestPrivateACUAdvisorProxyScopesListToAuthenticatedUser(t *testing.T) {
	requests := make(chan *http.Request, 1)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests <- request.Clone(request.Context())
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"advisors":[{"advisorId":"advisor-1","newapiUserId":"42","status":"risk","problem":"drift","needAdvisor":true}]}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-advisor-token")

	result, err := GetPrivateACUAdvisors(context.Background(), 42, 7)
	require.NoError(t, err)
	require.Len(t, result.Advisors, 1)
	require.Equal(t, "advisor-1", result.Advisors[0].AdvisorID)

	forwarded := <-requests
	require.Equal(t, http.MethodGet, forwarded.Method)
	require.Equal(t, "/internal/admin/private-advisors", forwarded.URL.Path)
	require.Equal(t, "42", forwarded.URL.Query().Get("newapiUserId"))
	require.Equal(t, "7", forwarded.URL.Query().Get("limit"))
	require.Equal(t, "Bearer test-advisor-token", forwarded.Header.Get("Authorization"))
}

func TestPrivateACUAdvisorProxyForwardsFeedback(t *testing.T) {
	requests := make(chan struct {
		method string
		path   string
		body   []byte
		auth   string
	}, 1)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		requests <- struct {
			method string
			path   string
			body   []byte
			auth   string
		}{
			method: request.Method,
			path:   request.URL.EscapedPath(),
			body:   body,
			auth:   request.Header.Get("Authorization"),
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"updated":true}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-advisor-token")

	err := UpdatePrivateACUAdvisorFeedback(context.Background(), 42, "advisor/1", "helpful")
	require.NoError(t, err)

	request := <-requests
	require.Equal(t, http.MethodPost, request.method)
	require.Equal(t, "/internal/admin/private-advisors/advisor%2F1/feedback", request.path)
	require.Equal(t, "Bearer test-advisor-token", request.auth)

	var body map[string]string
	require.NoError(t, common.Unmarshal(request.body, &body))
	require.Equal(t, map[string]string{
		"newapiUserId": "42",
		"feedback":     "helpful",
	}, body)
}
