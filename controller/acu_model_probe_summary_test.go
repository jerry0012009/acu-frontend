package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetACUModelProbeSummaryReturnsOnlyPublicTypedFields(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/admin/execution-profiles/model-probe-summary", r.URL.RequestURI())
		assert.Equal(t, "Bearer internal-fixture-token", r.Header.Get("Authorization"))
		_, _ = io.WriteString(w, `{"generatedAt":123,"models":{"visible":{"buckets":"nnnnnngr","latencyMs":2000,"protocol":"responses","executionProfileId":"private"},"gemini-4-carbon":{"buckets":"gggggggg"}},"history":[{}]}`)
	}))
	t.Cleanup(upstream.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "internal-fixture-token")

	out := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(out)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/pricing/model-probe-summary?profile=private", nil)
	GetACUModelProbeSummary(c)
	require.Equal(t, http.StatusOK, out.Code)
	assert.JSONEq(t, `{"success":true,"data":{"generatedAt":123,"models":{"visible":{"buckets":"nnnnnngr","latencyMs":2000,"protocol":"responses"}}}}`, out.Body.String())
}
