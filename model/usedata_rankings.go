package model

import (
	"fmt"
	"sort"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
)

type RankingQuotaTotal struct {
	ModelName   string `json:"model_name"`
	TotalTokens int64  `json:"total_tokens"`
}

type RankingQuotaBucket struct {
	ModelName string `json:"model_name"`
	Bucket    int64  `json:"bucket"`
	Tokens    int64  `json:"tokens"`
}

func GetRankingQuotaTotals(startTime int64, endTime int64) ([]RankingQuotaTotal, error) {
	var rows []RankingQuotaTotal
	query := DB.Table("quota_data").
		Select("model_name, sum(token_used) as total_tokens").
		Where("model_name <> ''").
		Group("model_name").
		Having("sum(token_used) > 0").
		Order("total_tokens DESC")
	query = applyRankingQuotaTimeRange(query, startTime, endTime)
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}
	if !DB.Migrator().HasTable("acu_usage_finalizes") {
		return rows, nil
	}

	var acuRows []RankingQuotaTotal
	acuQuery := DB.Table("acu_usage_finalizes").
		Select("actual_model as model_name, sum(input_tokens + output_tokens) as total_tokens").
		Where("status = ? AND actual_model <> ''", ACUFinalizeStatusFinalized).
		Group("actual_model").
		Having("sum(input_tokens + output_tokens) > 0")
	acuQuery = applyRankingQuotaTimeRange(acuQuery, startTime, endTime)
	if err := acuQuery.Find(&acuRows).Error; err != nil {
		return nil, err
	}
	return mergeRankingQuotaTotals(rows, acuRows), nil
}

func GetRankingQuotaBuckets(startTime int64, endTime int64, bucketSize int64) ([]RankingQuotaBucket, error) {
	if bucketSize <= 0 {
		bucketSize = 3600
	}
	bucketExpr := rankingBucketExpr(bucketSize)
	var rows []RankingQuotaBucket
	query := DB.Table("quota_data").
		Select(fmt.Sprintf("model_name, %s as bucket, sum(token_used) as tokens", bucketExpr)).
		Where("model_name <> ''").
		Group(fmt.Sprintf("model_name, %s", bucketExpr)).
		Having("sum(token_used) > 0").
		Order("bucket ASC")
	query = applyRankingQuotaTimeRange(query, startTime, endTime)
	if err := query.Find(&rows).Error; err != nil {
		return nil, err
	}
	if !DB.Migrator().HasTable("acu_usage_finalizes") {
		return rows, nil
	}

	acuBucketExpr := rankingBucketExpr(bucketSize)
	var acuRows []RankingQuotaBucket
	acuQuery := DB.Table("acu_usage_finalizes").
		Select(fmt.Sprintf("actual_model as model_name, %s as bucket, sum(input_tokens + output_tokens) as tokens", acuBucketExpr)).
		Where("status = ? AND actual_model <> ''", ACUFinalizeStatusFinalized).
		Group(fmt.Sprintf("actual_model, %s", acuBucketExpr)).
		Having("sum(input_tokens + output_tokens) > 0").
		Order("bucket ASC")
	acuQuery = applyRankingQuotaTimeRange(acuQuery, startTime, endTime)
	if err := acuQuery.Find(&acuRows).Error; err != nil {
		return nil, err
	}
	return mergeRankingQuotaBuckets(rows, acuRows), nil
}

func mergeRankingQuotaTotals(groups ...[]RankingQuotaTotal) []RankingQuotaTotal {
	byModel := make(map[string]int64)
	for _, group := range groups {
		for _, row := range group {
			if row.ModelName == "" || row.TotalTokens <= 0 {
				continue
			}
			byModel[row.ModelName] += row.TotalTokens
		}
	}
	rows := make([]RankingQuotaTotal, 0, len(byModel))
	for modelName, totalTokens := range byModel {
		rows = append(rows, RankingQuotaTotal{ModelName: modelName, TotalTokens: totalTokens})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].TotalTokens == rows[j].TotalTokens {
			return rows[i].ModelName < rows[j].ModelName
		}
		return rows[i].TotalTokens > rows[j].TotalTokens
	})
	return rows
}

func mergeRankingQuotaBuckets(groups ...[]RankingQuotaBucket) []RankingQuotaBucket {
	type bucketKey struct {
		model  string
		bucket int64
	}
	byKey := make(map[bucketKey]int64)
	for _, group := range groups {
		for _, row := range group {
			if row.ModelName == "" || row.Tokens <= 0 {
				continue
			}
			key := bucketKey{model: row.ModelName, bucket: row.Bucket}
			byKey[key] += row.Tokens
		}
	}
	rows := make([]RankingQuotaBucket, 0, len(byKey))
	for key, tokens := range byKey {
		rows = append(rows, RankingQuotaBucket{
			ModelName: key.model,
			Bucket:    key.bucket,
			Tokens:    tokens,
		})
	}
	sort.Slice(rows, func(i, j int) bool {
		if rows[i].Bucket == rows[j].Bucket {
			return rows[i].ModelName < rows[j].ModelName
		}
		return rows[i].Bucket < rows[j].Bucket
	})
	return rows
}

func rankingBucketExpr(bucketSize int64) string {
	if common.UsingMainDatabase(common.DatabaseTypeMySQL) {
		return fmt.Sprintf("FLOOR(created_at / %d) * %d", bucketSize, bucketSize)
	}
	return fmt.Sprintf("(created_at / %d) * %d", bucketSize, bucketSize)
}

func applyRankingQuotaTimeRange(query *gorm.DB, startTime int64, endTime int64) *gorm.DB {
	if startTime > 0 {
		query = query.Where("created_at >= ?", startTime)
	}
	if endTime > 0 {
		query = query.Where("created_at <= ?", endTime)
	}
	return query
}
