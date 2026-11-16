package service

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAccountOverviewCacheIsAccountAndRangeScoped(t *testing.T) {
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
	require.NoError(t, db.Create(&[]model.Log{{UserId: 98301, Type: model.LogTypeConsume, CreatedAt: now, Other: `{"user_charge_cny":"2"}`}, {UserId: 98302, Type: model.LogTypeConsume, CreatedAt: now, Other: `{"user_charge_cny":"9"}`}, {UserId: 98301, Type: model.LogTypeConsume, CreatedAt: now - 2*86400, Other: `{"user_charge_cny":"3"}`}}).Error)
	a, err := GetAccountOverview(context.Background(), 98301, 1)
	require.NoError(t, err)
	assert.Equal(t, "2", a.ChargeCNY)
	b, err := GetAccountOverview(context.Background(), 98302, 1)
	require.NoError(t, err)
	assert.Equal(t, "9", b.ChargeCNY)
	c, err := GetAccountOverview(context.Background(), 98301, 7)
	require.NoError(t, err)
	assert.Equal(t, "5", c.ChargeCNY)
	require.NoError(t, db.Where("user_id = ?", 98301).Delete(&model.Log{}).Error)
	cached, err := GetAccountOverview(context.Background(), 98301, 1)
	require.NoError(t, err)
	assert.Equal(t, "2", cached.ChargeCNY, "repeat reads reuse the bounded short-lived aggregate")
}
