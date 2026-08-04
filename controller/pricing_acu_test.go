package controller

import (
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetACUSelectionCorridorUsesGlobalPolicy(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousOptions := common.OptionMap
	t.Cleanup(func() { common.OptionMap = previousOptions })
	common.OptionMap = map[string]string{
		"ACUGlobalRoutingPolicy": `{"modelPolicy":"custom_allowlist","allowedModelIds":["gpt-5.6-sol"],"profilePolicy":"custom_allowlist","allowedProfileIds":["sol:responses"]}`,
	}
	var method string
	var body []byte
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		method = r.Method
		body, _ = io.ReadAll(r.Body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"series":{},"defaultPreference":"balanced"}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")

	request := httptest.NewRequest(http.MethodGet, "/api/pricing/acu-selection-corridor", nil)
	response := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(response)
	c.Request = request
	GetACUSelectionCorridor(c)

	require.Equal(t, http.StatusOK, response.Code)
	require.Equal(t, http.MethodPost, method)
	require.Contains(t, string(body), `"allowedModelIds":["gpt-5.6-sol"]`)
	require.Contains(t, string(body), `"allowedProfileIds":["sol:responses"]`)
	require.Contains(t, string(body), `"qualityPresets":{"balanced":20,"economy":-10,"quality":70}`)
	require.Contains(t, string(body), `"formulaMode":"legacy"`)
}
