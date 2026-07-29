package middleware

import (
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const (
	ACUFinalizePayloadHashKey = "acu_finalize_payload_hash"
	maxACUFinalizeBodyBytes   = 1 << 20
)

func ACUInternalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		host, _, err := net.SplitHostPort(c.Request.RemoteAddr)
		if err != nil {
			host = c.Request.RemoteAddr
		}
		ip := net.ParseIP(strings.TrimSpace(host))
		if ip == nil || (!ip.IsLoopback() && !ip.IsPrivate()) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "ACU internal endpoint requires a private network source"})
			return
		}
		secret := os.Getenv("ACU_TRUSTED_IDENTITY_SECRET")
		if secret == "" {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{"error": "ACU internal authentication is not configured"})
			return
		}
		timestamp := c.GetHeader("X-ACU-Timestamp")
		parsedAt, err := time.Parse(time.RFC3339, timestamp)
		if err != nil || time.Since(parsedAt) > 5*time.Minute || time.Until(parsedAt) > 5*time.Minute {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid ACU timestamp"})
			return
		}
		body, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, maxACUFinalizeBodyBytes))
		if err != nil {
			c.AbortWithStatusJSON(http.StatusRequestEntityTooLarge, gin.H{"error": "invalid ACU finalize body"})
			return
		}
		c.Request.Body = io.NopCloser(strings.NewReader(string(body)))
		digest := sha256.Sum256(body)
		bodyHash := hex.EncodeToString(digest[:])
		if !hmac.Equal([]byte(strings.ToLower(c.GetHeader("X-ACU-Body-SHA256"))), []byte(bodyHash)) {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "ACU body hash mismatch"})
			return
		}
		mac := hmac.New(sha256.New, []byte(secret))
		_, _ = mac.Write([]byte(timestamp + "\n" + bodyHash))
		expected := hex.EncodeToString(mac.Sum(nil))
		received := strings.ToLower(strings.TrimSpace(c.GetHeader("X-ACU-Signature")))
		if len(received) != len(expected) || subtle.ConstantTimeCompare([]byte(received), []byte(expected)) != 1 {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "ACU signature mismatch"})
			return
		}
		c.Set(ACUFinalizePayloadHashKey, bodyHash)
		c.Next()
	}
}
