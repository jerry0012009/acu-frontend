package controller

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestLogStatControllerContract(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "logs.db")), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	previousDB := model.LOG_DB
	previousQuota, previousFX := common.QuotaPerUnit, operation_setting.USDExchangeRate
	model.LOG_DB = db
	common.QuotaPerUnit, operation_setting.USDExchangeRate = 500000, 6.74
	t.Cleanup(func() {
		model.LOG_DB = previousDB
		common.QuotaPerUnit, operation_setting.USDExchangeRate = previousQuota, previousFX
		require.NoError(t, sqlDB.Close())
	})
	now := time.Now().Unix()
	require.NoError(t, db.Create(&[]model.Log{
		{UserId: 7, Username: "owner", Type: model.LogTypeConsume, CreatedAt: now, RequestId: "k3", UpstreamRequestId: "up-k3", Quota: 213, PromptTokens: 10, CompletionTokens: 20, Other: `{"user_charge_cny":"0.0028740000"}`},
		{UserId: 7, Username: "owner", Type: model.LogTypeConsume, CreatedAt: now, RequestId: "legacy", UpstreamRequestId: "up-legacy", Quota: 500000, Other: `{}`},
		{UserId: 8, Username: "other", Type: model.LogTypeConsume, CreatedAt: now, RequestId: "k3", UpstreamRequestId: "up-k3", Quota: 100, Other: `{"user_charge_cny":"1"}`},
		{UserId: 7, Username: "owner", Type: model.LogTypeTopup, CreatedAt: now, RequestId: "topup", Quota: 900000, Other: `{"user_charge_cny":"999"}`},
	}).Error)

	for _, tc := range []struct {
		name    string
		handler gin.HandlerFunc
		query   string
		quota   int
		rpm     int
		tpm     int
		cny     string
		exact   int
		legacy  int
	}{
		{"admin request id", GetLogsStat, "?type=0&username=owner&request_id=k3", 213, 1, 30, "0.002874", 1, 0},
		{"admin upstream id", GetLogsStat, "?type=2&username=owner&upstream_request_id=up-legacy", 500000, 1, 0, "6.74", 0, 1},
		{"admin both ids intersect", GetLogsStat, "?request_id=k3&upstream_request_id=up-legacy", 0, 0, 0, "0", 0, 0},
		{"admin non-consume", GetLogsStat, "?type=1&username=owner", 0, 0, 0, "0", 0, 0},
		{"self request id cannot override user", GetLogsSelfStat, "?type=0&request_id=k3&username=other", 213, 1, 30, "0.002874", 1, 0},
		{"self upstream id", GetLogsSelfStat, "?type=2&upstream_request_id=up-legacy", 500000, 1, 0, "6.74", 0, 1},
		{"self non-consume", GetLogsSelfStat, "?type=1", 0, 0, 0, "0", 0, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(recorder)
			context.Request = httptest.NewRequest(http.MethodGet, "/api/log/stat"+tc.query, nil)
			context.Set("id", 7)
			context.Set("username", "owner")
			tc.handler(context)
			assert.Equal(t, http.StatusOK, recorder.Code)
			var response struct {
				Success bool                   `json:"success"`
				Data    map[string]interface{} `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
			require.True(t, response.Success)
			assert.Equal(t, float64(tc.quota), response.Data["quota"])
			assert.Equal(t, float64(tc.rpm), response.Data["rpm"])
			assert.Equal(t, float64(tc.tpm), response.Data["tpm"])
			assert.Equal(t, tc.cny, response.Data["user_charge_cny"])
			assert.Equal(t, float64(tc.exact), response.Data["exact_charge_count"])
			assert.Equal(t, float64(tc.legacy), response.Data["legacy_charge_count"])
		})
	}
}

func TestLogSelfStatFailsClosedWithoutAuthenticatedUser(t *testing.T) {
	for _, userID := range []int{0, -1} {
		recorder := httptest.NewRecorder()
		context, _ := gin.CreateTestContext(recorder)
		context.Request = httptest.NewRequest(http.MethodGet, "/api/log/self/stat", nil)
		context.Set("id", userID)
		GetLogsSelfStat(context)
		assert.Equal(t, http.StatusUnauthorized, recorder.Code)
		var response struct {
			Success bool `json:"success"`
		}
		require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &response))
		assert.False(t, response.Success)
	}
}
