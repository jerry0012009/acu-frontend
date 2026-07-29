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
	body := []byte(`{"model":"acu-auto","input":"hello"}`)
	req := httptest.NewRequest(http.MethodPost, "http://acu-router/v1/responses", nil)
	req.Header.Set("X-ACU-NewAPI-User-ID", "forged-user")
	req.Header.Set("X-ACU-Signature", "forged-signature")
	req.Header.Set("X-ACU-Unrecognized-Internal", "forged-extra")
	info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: 17, TokenId: 29, RequestId: "req_alpha_1"}

	require.NoError(t, applyACUTrustedIdentity(req, ctx, info, body))
	require.Equal(t, "17", req.Header.Get("X-ACU-NewAPI-User-ID"))
	require.Equal(t, "29", req.Header.Get("X-ACU-NewAPI-Token-ID"))
	require.Equal(t, "req_alpha_1", req.Header.Get("X-ACU-NewAPI-Log-ID"))
	require.Equal(t, "req_alpha_1", req.Header.Get("X-ACU-Request-ID"))
	require.Empty(t, req.Header.Get("X-ACU-Unrecognized-Internal"))

	digest := sha256.Sum256(body)
	bodyHash := hex.EncodeToString(digest[:])
	require.Equal(t, bodyHash, req.Header.Get("X-ACU-Body-SHA256"))
	payload := strings.Join([]string{"17", "29", "req_alpha_1", "req_alpha_1", req.Header.Get("X-ACU-Timestamp"), bodyHash}, "\n")
	mac := hmac.New(sha256.New, []byte("test-only-shared-secret"))
	_, _ = mac.Write([]byte(payload))
	require.Equal(t, hex.EncodeToString(mac.Sum(nil)), req.Header.Get("X-ACU-Signature"))
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
