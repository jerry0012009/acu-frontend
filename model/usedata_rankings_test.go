package model

import (
	"testing"

	"github.com/stretchr/testify/require"
)

func TestRankingQuotaDataIncludesFinalizedACUUsage(t *testing.T) {
	truncateTables(t)
	require.NoError(t, DB.AutoMigrate(&ACUUsageFinalize{}))

	require.NoError(t, DB.Create(&QuotaData{
		ModelName: "legacy-model",
		CreatedAt: 7200,
		TokenUsed: 40,
		Quota:     400,
		Count:     1,
	}).Error)
	require.NoError(t, DB.Create(&ACUUsageFinalize{
		ReportIdempotencyKey: "ranking-report",
		LogicalRequestId:     "ranking-request",
		PayloadHash:          "ranking-payload",
		LogId:                "ranking-log",
		UserId:               1,
		TokenId:              1,
		ActualModel:          "acu-model",
		InputTokens:          100,
		OutputTokens:         20,
		FinalQuota:           600,
		Status:               ACUFinalizeStatusFinalized,
		CreatedAt:            7300,
	}).Error)

	totals, err := GetRankingQuotaTotals(7000, 8000)
	require.NoError(t, err)
	require.Equal(t, []RankingQuotaTotal{
		{ModelName: "acu-model", TotalTokens: 120},
		{ModelName: "legacy-model", TotalTokens: 40},
	}, totals)

	buckets, err := GetRankingQuotaBuckets(7000, 8000, 3600)
	require.NoError(t, err)
	require.Equal(t, []RankingQuotaBucket{
		{ModelName: "acu-model", Bucket: 7200, Tokens: 120},
		{ModelName: "legacy-model", Bucket: 7200, Tokens: 40},
	}, buckets)
}
