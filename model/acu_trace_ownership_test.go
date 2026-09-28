package model

import (
	"fmt"
	"testing"

	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestACUTraceQueriesEnforceUserOwnership(t *testing.T) {
	previousDB, previousLogDB := DB, LOG_DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}, &ACUUsageFinalize{}))
	DB, LOG_DB = db, db
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
	})

	require.NoError(t, db.Create(&Log{
		Id: 101, UserId: 2, RequestId: "request-user-b", CreatedAt: 100,
		Other: `{"acu_logical_request_id":"req_user_b"}`,
	}).Error)
	require.NoError(t, db.Create(&ACUUsageFinalize{
		ReportIdempotencyKey: "report-user-b",
		LogicalRequestId:     "req_user_b",
		PayloadHash:          "hash-user-b",
		UserId:               2,
		TokenId:              2,
		LogId:                "request-user-b",
		Status:               ACUFinalizeStatusFinalized,
	}).Error)

	logs, err := GetUserACUTimelineLogs(1, 0, 200)
	require.NoError(t, err)
	require.Empty(t, logs)

	_, err = ResolveOwnedACULogicalRequest(1, "req_user_b")
	require.Error(t, err)
	_, err = ResolveOwnedACULogicalRequest(1, "101")
	require.Error(t, err)

	logs, err = GetUserACUTimelineLogs(2, 0, 200)
	require.NoError(t, err)
	require.Len(t, logs, 1)
	logicalRequestID, err := ResolveOwnedACULogicalRequest(2, "req_user_b")
	require.NoError(t, err)
	require.Equal(t, "req_user_b", logicalRequestID)
}

func TestGetAllUsersACUTimelineLogsUsesBoundedFilteredQuery(t *testing.T) {
	previousDB, previousLogDB := DB, LOG_DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&Log{}))
	DB, LOG_DB = db, db
	t.Cleanup(func() {
		DB, LOG_DB = previousDB, previousLogDB
	})

	require.NoError(t, db.Create(&Log{
		Id: 1, UserId: 2, CreatedAt: 110, Type: LogTypeConsume,
		Other: `{"acu_logical_request_id":"included-later"}`,
	}).Error)
	require.NoError(t, db.Create(&Log{
		Id: 2, UserId: 1, CreatedAt: 100, Type: LogTypeError,
		Other: `{"acu_logical_request_id":"included-first"}`,
	}).Error)
	require.NoError(t, db.Create(&Log{
		Id: 3, UserId: 3, CreatedAt: 105, Type: LogTypeManage,
		Other: `{"acu_logical_request_id":"excluded-type"}`,
	}).Error)
	require.NoError(t, db.Create(&Log{
		Id: 4, UserId: 4, CreatedAt: 115, Type: LogTypeConsume,
		Other: `{"request_id":"excluded-non-acu"}`,
	}).Error)

	logs, truncated, err := GetAllUsersACUTimelineLogs(90, 120)
	require.NoError(t, err)
	require.False(t, truncated)
	require.Len(t, logs, 2)
	require.Contains(t, logs[0].Other, `"acu_logical_request_id":"included-first"`)
	require.Equal(t, int64(110), logs[1].CreatedAt)
}
