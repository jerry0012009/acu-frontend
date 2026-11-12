package controller

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/alicebob/miniredis/v2"
	"github.com/gin-gonic/gin"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestCompleteOnboardingPreservesUserSettingsAndDoesNotCreateKeys(t *testing.T) {
	previousDB, previousLogDB := model.DB, model.LOG_DB
	t.Cleanup(func() { model.DB = previousDB; model.LOG_DB = previousLogDB })
	db := setupModelListControllerTestDB(t)
	require.NoError(t, db.AutoMigrate(&model.Token{}))
	user := model.User{Username: "onboarding", Role: common.RoleCommonUser}
	user.SetSetting(dto.UserSetting{ACUOnboardingPending: true, Language: "zh", ACURoutingPolicy: "custom_allowlist", ACUAllowedModelIds: []string{"gpt-6.1-sol"}})
	require.NoError(t, db.Create(&user).Error)
	for _, body := range []string{`{"acu_onboarding_complete":true}`, `{"acu_onboarding_complete":false}`, `{"acu_onboarding_complete":true,"id":999}`} {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", user.Id)
		ctx.Request = httptest.NewRequest(http.MethodPut, "/api/user/self", strings.NewReader(body))
		UpdateSelf(ctx)
		var result struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &result))
		assert.Equal(t, body == `{"acu_onboarding_complete":true}`, result.Success)
	}
	var stored model.User
	require.NoError(t, db.First(&stored, user.Id).Error)
	preferences := stored.GetSetting()
	assert.False(t, preferences.ACUOnboardingPending)
	assert.Equal(t, "zh", preferences.Language)
	assert.Equal(t, []string{"gpt-6.1-sol"}, preferences.ACUAllowedModelIds)
	var count int64
	require.NoError(t, db.Model(&model.Token{}).Where("user_id = ?", user.Id).Count(&count).Error)
	assert.Zero(t, count)
}

func TestRegisterAndLoginProvideDefaultKeyAndFirstLoginGuidance(t *testing.T) {
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRegister, previousPasswordRegister := common.RegisterEnabled, common.PasswordRegisterEnabled
	previousVerification, previousLogin := common.EmailVerificationEnabled, common.PasswordLoginEnabled
	previousDefaultKey := constant.GenerateDefaultToken
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RegisterEnabled, common.PasswordRegisterEnabled = previousRegister, previousPasswordRegister
		common.EmailVerificationEnabled, common.PasswordLoginEnabled = previousVerification, previousLogin
		constant.GenerateDefaultToken = previousDefaultKey
	})
	common.RegisterEnabled, common.PasswordRegisterEnabled, common.PasswordLoginEnabled = true, true, true
	common.EmailVerificationEnabled = false
	previousRedis, previousRDB := common.RedisEnabled, common.RDB
	server := miniredis.RunT(t)
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = common.RDB.Close(); common.RedisEnabled, common.RDB = previousRedis, previousRDB })
	constant.GenerateDefaultToken = true
	db := setupModelListControllerTestDB(t)
	common.RedisEnabled = true
	require.NoError(t, db.AutoMigrate(&model.Token{}, &model.Log{}, &model.UserSession{}, &model.TwoFA{}))
	for _, action := range []struct {
		path    string
		handler func(*gin.Context)
	}{
		{"/api/user/register", Register}, {"/api/user/login", Login},
	} {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		path := action.path
		if path == "/api/user/register" {
			require.NoError(t, common.RDB.Set(context.Background(), "auth-protection:v1:captcha:onboarding", common.GenerateHMAC("onboarding\x00register\x00192.0.2.1\x0012345"), time.Minute).Err())
			path += "?captcha_id=onboarding&captcha_answer=12345"
		}
		ctx.Request = httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"username":"onboarding-new","password":"password123"}`))
		ctx.Request.RemoteAddr = "192.0.2.1:1234"
		action.handler(ctx)
		var result struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
			Data    struct {
				User struct {
					Setting string `json:"setting"`
				} `json:"user"`
			} `json:"data"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &result))
		require.True(t, result.Success, result.Message)
		if action.path == "/api/user/login" {
			assert.Contains(t, result.Data.User.Setting, `"acu_onboarding_pending":true`)
		}
	}
	var count int64
	require.NoError(t, db.Model(&model.Token{}).Count(&count).Error)
	assert.EqualValues(t, 1, count)
}
