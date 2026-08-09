package model

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestGetQuotaDataByUserIdAggregatesFinalizedACUByHour(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&ACUUsageFinalize{}))
	require.NoError(t, DB.Exec("DELETE FROM acu_usage_finalizes").Error)
	t.Cleanup(func() {
		DB.Exec("DELETE FROM acu_usage_finalizes")
	})

	require.NoError(t, DB.Create(&User{
		Id:       1,
		Username: "acu-hour-user",
		Status:   common.UserStatusEnabled,
	}).Error)

	const hourStart int64 = 7 * 3600
	items := []ACUUsageFinalize{
		{
			ReportIdempotencyKey: "acu-hour-report-1",
			LogicalRequestId:     "acu-hour-request-1",
			PayloadHash:          "acu-hour-payload-1",
			LogId:                "acu-hour-log-1",
			UserId:               1,
			ActualModel:          "acu-model",
			InputTokens:          100,
			OutputTokens:         20,
			FinalQuota:           100,
			Status:               ACUFinalizeStatusFinalized,
			CreatedAt:            hourStart + 12*60,
		},
		{
			ReportIdempotencyKey: "acu-hour-report-2",
			LogicalRequestId:     "acu-hour-request-2",
			PayloadHash:          "acu-hour-payload-2",
			LogId:                "acu-hour-log-2",
			UserId:               1,
			ActualModel:          "acu-model",
			InputTokens:          200,
			OutputTokens:         30,
			FinalQuota:           200,
			Status:               ACUFinalizeStatusFinalized,
			CreatedAt:            hourStart + 35*60,
		},
		{
			ReportIdempotencyKey: "acu-hour-report-3",
			LogicalRequestId:     "acu-hour-request-3",
			PayloadHash:          "acu-hour-payload-3",
			LogId:                "acu-hour-log-3",
			UserId:               1,
			ActualModel:          "acu-model",
			InputTokens:          300,
			OutputTokens:         40,
			FinalQuota:           300,
			Status:               ACUFinalizeStatusFinalized,
			CreatedAt:            hourStart + 58*60,
		},
		{
			ReportIdempotencyKey: "acu-hour-report-4",
			LogicalRequestId:     "acu-hour-request-4",
			PayloadHash:          "acu-hour-payload-4",
			LogId:                "acu-hour-log-4",
			UserId:               1,
			ActualModel:          "acu-model",
			InputTokens:          400,
			OutputTokens:         50,
			FinalQuota:           400,
			Status:               ACUFinalizeStatusFinalized,
			CreatedAt:            hourStart + 3600 + 5*60,
		},
	}
	for _, item := range items {
		require.NoError(t, DB.Create(&item).Error)
	}

	rows, err := GetQuotaDataByUserId(1, hourStart, hourStart+2*3600)
	require.NoError(t, err)
	require.Len(t, rows, 2)

	rowsByHour := make(map[int64]*QuotaData, len(rows))
	for _, row := range rows {
		rowsByHour[row.CreatedAt] = row
	}

	firstHour := rowsByHour[hourStart]
	require.NotNil(t, firstHour)
	assert.Equal(t, 3, firstHour.Count)
	assert.Equal(t, 600, firstHour.Quota)
	assert.Equal(t, 690, firstHour.TokenUsed)

	secondHour := rowsByHour[hourStart+3600]
	require.NotNil(t, secondHour)
	assert.Equal(t, 1, secondHour.Count)
	assert.Equal(t, 400, secondHour.Quota)
	assert.Equal(t, 450, secondHour.TokenUsed)
}
