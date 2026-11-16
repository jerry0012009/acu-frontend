package model

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// Explicit read-only production regression; no migrations or model calls.
func TestAccountOverviewLiveRanges(t *testing.T) {
	dsn := os.Getenv("ACU_OVERVIEW_LIVE_DSN")
	if dsn == "" {
		t.Skip("explicit live database acceptance only")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Default.LogMode(logger.Silent)})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	previous := LOG_DB
	LOG_DB = db
	t.Cleanup(func() { LOG_DB = previous; _ = sqlDB.Close() })
	for _, days := range []int64{1, 7, 30} {
		start := time.Now()
		now := start.Unix()
		result, err := GetACUAccountOverview(context.Background(), 122, now-days*86400, now)
		require.NoError(t, err)
		require.Positive(t, result.Count)
		require.Equal(t, result.Count, result.ExactChargeCount+result.LegacyChargeCount)
		t.Logf("range=%dd elapsed=%dms records=%d comparable=%d", days, time.Since(start).Milliseconds(), result.Count, result.Comparison.Count)
	}
}
