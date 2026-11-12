package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestLocalCaptchaEmailGuardRejectsMissingWrongReplayAndAllowsValid(t *testing.T) {
	oldEnabled, oldRDB := common.RedisEnabled, common.RDB
	server := miniredis.RunT(t)
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = common.RDB.Close(); common.RedisEnabled, common.RDB = oldEnabled, oldRDB })
	gin.SetMode(gin.TestMode)
	router := gin.New()
	require.NoError(t, router.SetTrustedProxies(nil))
	passed := 0
	router.GET("/mail", AuthEmailProtection("register-email"), func(c *gin.Context) { passed++; c.JSON(200, gin.H{"success": true}) })
	request := func(query string) *httptest.ResponseRecorder {
		req := httptest.NewRequest("GET", "/mail?email=alice@example.com"+query, nil)
		req.RemoteAddr = "192.0.2.20:1234"
		rec := httptest.NewRecorder()
		router.ServeHTTP(rec, req)
		return rec
	}
	assert.Contains(t, request("").Body.String(), "CAPTCHA_REQUIRED")
	store := func(id string) {
		require.NoError(t, common.RDB.Set(context.Background(), "auth-protection:v1:captcha:"+id, common.GenerateHMAC(id+"\x00register-email\x00192.0.2.20\x0012345"), 2*time.Minute).Err())
	}
	store("wrong")
	assert.Contains(t, request("&captcha_id=wrong&captcha_answer=54321").Body.String(), "CAPTCHA_REQUIRED")
	assert.Contains(t, request("&captcha_id=wrong&captcha_answer=12345").Body.String(), "CAPTCHA_REQUIRED")
	store("good")
	assert.Contains(t, request("&captcha_id=good&captcha_answer=12345").Body.String(), `"success":true`)
	assert.Contains(t, request("&captcha_id=good&captcha_answer=12345").Body.String(), "CAPTCHA_REQUIRED")
	store("limited")
	assert.Equal(t, 429, request("&captcha_id=limited&captcha_answer=12345").Code)
	assert.Equal(t, 1, passed, "no email handler runs for rejected or replayed challenges")
}

func TestLocalCaptchaLoginDefaultAndFailureThreshold(t *testing.T) {
	oldDB, oldRedis, oldPassword := model.DB, common.RedisEnabled, common.PasswordLoginEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	common.RedisEnabled = false
	common.PasswordLoginEnabled = true
	t.Cleanup(func() { model.DB = oldDB; common.RedisEnabled = oldRedis; common.PasswordLoginEnabled = oldPassword })
	gin.SetMode(gin.TestMode)
	request := func(ip string) *httptest.ResponseRecorder {
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Request = httptest.NewRequest(http.MethodPost, "/api/user/login", strings.NewReader(`{"username":"local-captcha-no-user","password":"wrong-password"}`))
		c.Request.RemoteAddr = ip + ":1234"
		Login(c)
		return rec
	}
	for i := 0; i < 2; i++ {
		assert.NotContains(t, request("192.0.2.31").Body.String(), "CAPTCHA_REQUIRED")
	}
	assert.Contains(t, request("192.0.2.31").Body.String(), "CAPTCHA_REQUIRED")
	assert.Contains(t, request("192.0.2.31").Body.String(), "CAPTCHA_REQUIRED")
	assert.NotContains(t, request("192.0.2.32").Body.String(), "CAPTCHA_REQUIRED")
	required, err := service.LoginCaptchaRequired(context.Background(), "192.0.2.32", "local-captcha-no-user")
	require.NoError(t, err)
	assert.False(t, required)
}

func TestLocalCaptchaRegistrationCannotBypassEmailOrImage(t *testing.T) {
	oldRegister, oldPassword, oldEmail, oldRedis := common.RegisterEnabled, common.PasswordRegisterEnabled, common.EmailVerificationEnabled, common.RedisEnabled
	common.RegisterEnabled = true
	common.PasswordRegisterEnabled = true
	common.RedisEnabled = false
	t.Cleanup(func() {
		common.RegisterEnabled = oldRegister
		common.PasswordRegisterEnabled = oldPassword
		common.EmailVerificationEnabled = oldEmail
		common.RedisEnabled = oldRedis
	})
	for _, emailRequired := range []bool{true, false} {
		common.EmailVerificationEnabled = emailRequired
		rec := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(rec)
		c.Request = httptest.NewRequest("POST", "/api/user/register", strings.NewReader(`{"username":"captcha-user","password":"valid-password"}`))
		Register(c)
		assert.Contains(t, rec.Body.String(), `"success":false`)
		if !emailRequired {
			assert.Contains(t, rec.Body.String(), "CAPTCHA_REQUIRED")
		}
	}
}
