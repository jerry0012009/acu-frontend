package channel

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestApplyACUTrustedIdentityReplacesForgedHeadersAndBindsBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-shared-secret")
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	ctx.Request.Header.Set("User-Agent", "codex_exec/0.145.0 (Linux; x86_64)")
	body := []byte(`{"model":"acu-auto","input":"hello"}`)
	req := httptest.NewRequest(http.MethodPost, "http://acu-router/v1/responses", nil)
	req.Header.Set("X-ACU-NewAPI-User-ID", "forged-user")
	req.Header.Set("X-ACU-Signature", "forged-signature")
	req.Header.Set("X-ACU-Client-Version", "forged-version")
	req.Header.Set("X-ACU-Unrecognized-Internal", "forged-extra")
	info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: 17, TokenId: 29, RequestId: "req_alpha_1"}
	ctx.Set("acu_allowed_candidate_ids", []string{"gpt-5.6-luna@max", "gpt-5.6-sol@high"})
	ctx.Set("acu_candidate_preference_scores", map[string]float64{
		"gpt-5.6-sol@high": 70.5,
		"gpt-5.6-luna@max": 150,
	})

	require.NoError(t, applyACUTrustedIdentity(req, ctx, info, body))
	require.Equal(t, "17", req.Header.Get("X-ACU-NewAPI-User-ID"))
	require.Equal(t, "29", req.Header.Get("X-ACU-NewAPI-Token-ID"))
	require.Equal(t, "req_alpha_1", req.Header.Get("X-ACU-NewAPI-Log-ID"))
	require.Equal(t, "req_alpha_1", req.Header.Get("X-ACU-Request-ID"))
	require.Equal(t, "0.145.0", req.Header.Get("X-ACU-Client-Version"))
	require.Equal(t, "custom_allowlist", req.Header.Get("X-ACU-Routing-Policy"))
	require.Equal(t, "balanced", req.Header.Get("X-ACU-Routing-Preference"))
	require.Equal(t, "v6", req.Header.Get("X-ACU-Identity-Version"))
	require.Equal(t, "20", req.Header.Get("X-ACU-Quality-Bias"))
	require.Equal(t, "balanced", req.Header.Get("X-ACU-Supply-Strategy"))
	require.Equal(t, `{"cost":40,"speed":25,"reliability":35}`, req.Header.Get("X-ACU-Supply-Weights"))
	require.Equal(t, `["gpt-5.6-luna","gpt-5.6-sol"]`, req.Header.Get("X-ACU-Allowed-Model-Ids"))
	require.Equal(t, "[]", req.Header.Get("X-ACU-Allowed-Profile-Ids"))
	require.Equal(t, `{}`, req.Header.Get("X-ACU-Model-Access"))
	require.Equal(t, "false", req.Header.Get("X-ACU-Token-Model-Limit-Enabled"))
	require.Equal(t, "[]", req.Header.Get("X-ACU-Token-Allowed-Model-Ids"))
	require.Equal(t, `["gpt-5.6-luna@max","gpt-5.6-sol@high"]`, req.Header.Get("X-ACU-Allowed-Candidate-Ids"))
	require.Equal(t, `{"gpt-5.6-luna@max":150,"gpt-5.6-sol@high":70.5}`, req.Header.Get("X-ACU-Candidate-Preference-Scores"))
	require.Equal(t, `{}`, req.Header.Get("X-ACU-Profile-Preference-Scores"))
	require.NotEmpty(t, req.Header.Get("X-ACU-Routing-Policy-Version"))
	require.Empty(t, req.Header.Get("X-ACU-Unrecognized-Internal"))

	digest := sha256.Sum256(body)
	bodyHash := hex.EncodeToString(digest[:])
	require.Equal(t, bodyHash, req.Header.Get("X-ACU-Body-SHA256"))
	payload := strings.Join([]string{
		"17", "29", "req_alpha_1", "req_alpha_1", "0.145.0",
		"custom_allowlist", req.Header.Get("X-ACU-Allowed-Model-Ids"),
		req.Header.Get("X-ACU-Allowed-Profile-Ids"), req.Header.Get("X-ACU-Model-Access"),
		req.Header.Get("X-ACU-Token-Model-Limit-Enabled"),
		req.Header.Get("X-ACU-Token-Allowed-Model-Ids"),
		req.Header.Get("X-ACU-Routing-Policy-Version"),
		"balanced", req.Header.Get("X-ACU-Quality-Bias"), req.Header.Get("X-ACU-Supply-Strategy"),
		req.Header.Get("X-ACU-Supply-Weights"), req.Header.Get("X-ACU-High-Bias-Offset"),
		req.Header.Get("X-ACU-Model-Cost-Log-Scale"), req.Header.Get("X-ACU-Profile-Cost-Log-Scale"),
		req.Header.Get("X-ACU-Profile-Speed-Log-Scale"), req.Header.Get("X-ACU-Latency-Policy"),
		req.Header.Get("X-ACU-Reliability-Policy"), req.Header.Get("X-ACU-Work-Phase-Bias-Offsets"),
		req.Header.Get("X-ACU-Allowed-Candidate-Ids"), req.Header.Get("X-ACU-Candidate-Preference-Scores"),
		req.Header.Get("X-ACU-Profile-Preference-Scores"),
		req.Header.Get("X-ACU-Routing-Utility-Version"), req.Header.Get("X-ACU-Formula-Mode"),
		"v6", req.Header.Get("X-ACU-Timestamp"), bodyHash,
	}, "\n")
	mac := hmac.New(sha256.New, []byte("test-only-shared-secret"))
	_, _ = mac.Write([]byte(payload))
	require.Equal(t, hex.EncodeToString(mac.Sum(nil)), req.Header.Get("X-ACU-Signature"))
}

func TestApplyACUTrustedIdentitySignsCustomUserAllowlist(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-shared-secret")
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
	req := httptest.NewRequest(http.MethodPost, "http://acu-router/v1/responses", nil)
	info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: 17, TokenId: 29, RequestId: "req_policy"}
	ctx.Set("token_model_limit_enabled", true)
	ctx.Set("token_model_limit", map[string]bool{
		"acu-auto": true, "acu-high": true, "gpt-5.6-sol": true, "gpt-5.6-luna": true,
	})
	ctx.Set("acu_profile_limit_enabled", true)
	ctx.Set("acu_profile_limits", []string{"lucen:luna:responses", "closeai:luna:responses"})
	ctx.Set("acu_routing_preference", "quality")
	ctx.Set("acu_allowed_candidate_ids", []string{"gpt-5.6-luna", "gpt-5.6-luna@max"})
	ctx.Set("acu_candidate_preference_scores", map[string]float64{"gpt-5.6-luna@max": 150.5})

	require.NoError(t, applyACUTrustedIdentity(req, ctx, info, []byte(`{"model":"acu-auto"}`)))
	require.Equal(t, "custom_allowlist", req.Header.Get("X-ACU-Routing-Policy"))
	require.Equal(t, `["gpt-5.6-luna"]`, req.Header.Get("X-ACU-Allowed-Model-Ids"))
	require.Equal(t, `["closeai:luna:responses","lucen:luna:responses"]`, req.Header.Get("X-ACU-Allowed-Profile-Ids"))
	require.Equal(t, "quality", req.Header.Get("X-ACU-Routing-Preference"))
	require.Equal(t, `["gpt-5.6-luna","gpt-5.6-luna@max"]`, req.Header.Get("X-ACU-Allowed-Candidate-Ids"))
	require.Equal(t, `{"gpt-5.6-luna":99.7,"gpt-5.6-luna@max":150.5}`, req.Header.Get("X-ACU-Candidate-Preference-Scores"))
	require.Contains(t, req.Header.Get("X-ACU-Routing-Policy-Version"), "acu-user-policy-v2-")
}

func TestACUProfileAllowlistChangesRoutingPolicyVersion(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-shared-secret")
	versionFor := func(profileID string) string {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		ctx.Set("acu_profile_limit_enabled", true)
		ctx.Set("acu_profile_limits", []string{profileID})
		req := httptest.NewRequest(http.MethodPost, "http://acu-router/v1/responses", nil)
		info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: 17, TokenId: 29, RequestId: "req_profile_policy"}
		require.NoError(t, applyACUTrustedIdentity(req, ctx, info, []byte(`{"model":"acu-auto"}`)))
		return req.Header.Get("X-ACU-Routing-Policy-Version")
	}
	require.NotEqual(t, versionFor("lucen:luna:responses"), versionFor("closeai:luna:responses"))
}

func TestACUClientVersionUsesOnlyRecognizedNativeUserAgents(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)

	ctx.Request.Header.Set("User-Agent", "claude-cli/2.1.220 (external, sdk-cli)")
	require.Equal(t, "2.1.220", acuClientVersion(ctx))
	ctx.Request.Header.Set("User-Agent", "curl/8.0")
	require.Equal(t, "unknown", acuClientVersion(ctx))
}

func TestACUHeadersAreNeverPassedThroughFromClient(t *testing.T) {
	require.True(t, shouldSkipPassthroughHeader("x-acu-newapi-user-id"))
	require.True(t, shouldSkipPassthroughHeader("X-ACU-Arbitrary-Forged-Field"))
}

func TestApplyACUTrustedIdentityFailsClosedWithoutSecret(t *testing.T) {
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "")
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/messages", nil)
	req := httptest.NewRequest(http.MethodPost, "http://acu-router/v1/messages", nil)
	info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: 1, TokenId: 2, RequestId: "req_missing_secret"}
	require.ErrorContains(t, applyACUTrustedIdentity(req, ctx, info, []byte("{}")), "not configured")
}
