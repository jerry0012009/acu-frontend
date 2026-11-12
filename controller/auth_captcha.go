package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetAuthCaptcha(c *gin.Context) {
	purpose := c.Query("purpose")
	switch purpose {
	case "login", "register", "register-email", "reset-email":
	default:
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Invalid verification purpose"})
		return
	}
	challenge, err := service.NewAuthCaptcha(c.Request.Context(), purpose, c.ClientIP())
	if err != nil {
		authProtectionUnavailable(c)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": challenge})
}

func authProtectionUnavailable(c *gin.Context) {
	c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "code": "AUTH_PROTECTION_UNAVAILABLE", "message_key": "Verification is temporarily unavailable. Please retry.", "message": "Verification is temporarily unavailable. Please retry."})
	c.Abort()
}

func requireAuthCaptcha(c *gin.Context, purpose, id, answer string) bool {
	ok, err := service.VerifyAuthCaptcha(c.Request.Context(), id, answer, purpose, c.ClientIP())
	if err != nil {
		authProtectionUnavailable(c)
		return false
	}
	if !ok {
		c.JSON(http.StatusOK, gin.H{"success": false, "code": "CAPTCHA_REQUIRED", "message_key": "Please enter a new image verification code.", "message": "Please enter a new image verification code."})
		c.Abort()
		return false
	}
	return true
}

func AuthEmailProtection(purpose string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if !requireAuthCaptcha(c, purpose, c.Query("captcha_id"), c.Query("captcha_answer")) {
			return
		}
		allowed, err := service.TakeAuthEmailLimit(c.Request.Context(), c.Query("email"), purpose)
		if err != nil {
			authProtectionUnavailable(c)
			return
		}
		if !allowed {
			c.Header("Retry-After", "60")
			c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "message_key": "Too many verification emails. Please try again later.", "message": "Too many verification emails. Please try again later."})
			c.Abort()
			return
		}
		c.Next()
	}
}
