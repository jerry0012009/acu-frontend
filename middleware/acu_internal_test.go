package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func signACUTestBody(body []byte, timestamp, secret string) (string, string) {
	digest := sha256.Sum256(body)
	bodyHash := hex.EncodeToString(digest[:])
	mac := hmac.New(sha256.New, []byte(secret))
	_, _ = mac.Write([]byte(timestamp + "\n" + bodyHash))
	return bodyHash, hex.EncodeToString(mac.Sum(nil))
}

func TestACUInternalAuthAcceptsPrivateSignedBodyWithoutChangingBytes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-internal-secret")
	body := []byte("{\n  \"logical_request_id\": \"logical_1\"\n}\n")
	timestamp := time.Now().UTC().Format(time.RFC3339)
	bodyHash, signature := signACUTestBody(body, timestamp, "test-only-internal-secret")
	request := httptest.NewRequest(http.MethodPost, "/internal/acu/usage/finalize", strings.NewReader(string(body)))
	request.RemoteAddr = "172.20.0.9:44000"
	request.Header.Set("X-ACU-Timestamp", timestamp)
	request.Header.Set("X-ACU-Body-SHA256", bodyHash)
	request.Header.Set("X-ACU-Signature", signature)
	recorder := httptest.NewRecorder()
	router := gin.New()
	router.Use(ACUInternalAuth())
	router.POST("/internal/acu/usage/finalize", func(c *gin.Context) {
		received := make([]byte, len(body))
		_, err := c.Request.Body.Read(received)
		require.NoError(t, err)
		require.Equal(t, body, received)
		require.Equal(t, bodyHash, c.GetString(ACUFinalizePayloadHashKey))
		c.Status(http.StatusNoContent)
	})

	router.ServeHTTP(recorder, request)
	require.Equal(t, http.StatusNoContent, recorder.Code)
}

func TestACUInternalAuthRejectsPublicSourceAndTamperedBody(t *testing.T) {
	gin.SetMode(gin.TestMode)
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", "test-only-internal-secret")
	timestamp := time.Now().UTC().Format(time.RFC3339)
	bodyHash, signature := signACUTestBody([]byte(`{"ok":true}`), timestamp, "test-only-internal-secret")

	for name, testCase := range map[string]string{
		"public source": "203.0.113.10:44000|{\"ok\":true}",
		"tampered body": "127.0.0.1:44000|{\"ok\":false}",
	} {
		t.Run(name, func(t *testing.T) {
			parts := strings.SplitN(testCase, "|", 2)
			request := httptest.NewRequest(http.MethodPost, "/internal/acu/usage/finalize", strings.NewReader(parts[1]))
			request.RemoteAddr = parts[0]
			request.Header.Set("X-ACU-Timestamp", timestamp)
			request.Header.Set("X-ACU-Body-SHA256", bodyHash)
			request.Header.Set("X-ACU-Signature", signature)
			recorder := httptest.NewRecorder()
			router := gin.New()
			router.Use(ACUInternalAuth())
			router.POST("/internal/acu/usage/finalize", func(c *gin.Context) { c.Status(http.StatusNoContent) })
			router.ServeHTTP(recorder, request)
			require.NotEqual(t, http.StatusNoContent, recorder.Code)
		})
	}
}
