package controller

import (
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAccountOverviewUsesAuthenticatedUserAndBoundedDays(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "overview.db")), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.Log{}))
	previous, kind := model.LOG_DB, common.LogDatabaseType()
	model.LOG_DB = db
	common.SetLogDatabaseType(common.DatabaseTypeSQLite)
	t.Cleanup(func() { model.LOG_DB = previous; common.SetLogDatabaseType(kind); require.NoError(t, sqlDB.Close()) })
	now := time.Now().Unix()
	require.NoError(t, db.Create(&[]model.Log{
		{UserId: 122, Type: model.LogTypeConsume, CreatedAt: now - 3600, ModelName: "sol", Other: `{"user_charge_cny":"2"}`},
		{UserId: 122, Type: model.LogTypeConsume, CreatedAt: now - 2*86400, ModelName: "old", Other: `{"user_charge_cny":"3"}`},
		{UserId: 123, Type: model.LogTypeConsume, CreatedAt: now, Other: `{"user_charge_cny":"999"}`},
	}).Error)
	for _, tc := range []struct {
		user          int
		query, charge string
		code          int
	}{{122, "?days=1&userId=123", "2", 200}, {122, "?days=999", "5", 200}, {0, "?days=7", "", 401}} {
		recorder := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(recorder)
		ctx.Set("id", tc.user)
		ctx.Request = httptest.NewRequest(http.MethodGet, "/api/user/self/acu-account-overview"+tc.query, nil)
		GetACUAccountOverview(ctx)
		assert.Equal(t, tc.code, recorder.Code)
		if tc.code == 200 {
			var body struct {
				Success bool                     `json:"success"`
				Data    model.ACUAccountOverview `json:"data"`
			}
			require.NoError(t, common.Unmarshal(recorder.Body.Bytes(), &body))
			assert.True(t, body.Success)
			assert.Equal(t, tc.charge, body.Data.ChargeCNY)
		}
	}
}
