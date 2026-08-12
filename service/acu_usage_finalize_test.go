package service

import (
	"fmt"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/glebarez/sqlite"
	"github.com/shopspring/decimal"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupACUFinalizeTestDB(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	previousRedis := common.RedisEnabled
	previousLogConsume := common.LogConsumeEnabled
	previousQuotaPerUnit := common.QuotaPerUnit
	previousUSDExchangeRate := operation_setting.USDExchangeRate
	dsn := fmt.Sprintf("file:acu-finalize-%d?mode=memory&cache=shared", time.Now().UnixNano())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Log{}, &model.QuotaData{}, &model.ACUUsageFinalize{}))
	model.DB, model.LOG_DB = db, db
	common.RedisEnabled = false
	common.LogConsumeEnabled = true
	common.QuotaPerUnit = 500_000
	operation_setting.USDExchangeRate = 5
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
		common.RedisEnabled = previousRedis
		common.LogConsumeEnabled = previousLogConsume
		common.QuotaPerUnit = previousQuotaPerUnit
		operation_setting.USDExchangeRate = previousUSDExchangeRate
	})
}

func TestFinalizeACUUsageChargesRouterFinalUserChargeExactlyOnce(t *testing.T) {
	setupACUFinalizeTestDB(t)
	user := model.User{Username: "acu-actual-cash-user", Password: "test-only-password", Status: common.UserStatusEnabled, Quota: 10_000}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "test-only-actual-cash-token", Name: "acu-actual-cash", Status: common.TokenStatusEnabled, RemainQuota: 10_000}
	require.NoError(t, model.DB.Create(&token).Error)

	request := dto.ACUUsageFinalizeRequest{
		ReportIdempotencyKey: "report_actual_cash_1", NewAPIUserID: fmt.Sprint(user.Id), NewAPITokenID: fmt.Sprint(token.Id),
		NewAPILogID: "req_actual_cash_1", LogicalRequestID: "logical_actual_cash_1", ActualModel: "gpt-5.6-luna",
		Provider: "lucen", Channel: "cx006", JudgeCostUSD: "0.0020000000", ProviderCostUSD: "0.1393640000",
		FailedBilledCostUSD: "0.0000000000", FinalUserCostUSD: "0.0000000000",
		NominalProviderCostUSD: "0.1393640000", ProviderBalanceCharge: "0.0083618400",
		ProviderBalanceCurrency: "USD-denominated credits", ProviderCreditCashCostCNY: "1.0000000000",
		EffectiveProviderCashCostCNY: "0.0083618400", JudgeCashCostCNY: "0.0001200000",
		JudgeInputTokens: 1000, JudgeOutputTokens: 100,
		JudgeOfficialPaygEquivalentCost: "0.0006500000", JudgeCostCurrency: "CNY",
		JudgeCostStatus: "estimated_blended",
		JudgeCostSource: "midpoint_openrouter_payg_and_mimo99_plan_v1",
		JudgeProvider:   "xiaomi_mimo", JudgeModel: "mimo-v2.5-pro",
		FailedAttemptCashCostCNY: "0.0010000000", ActualTotalCashCostCNY: "0.0094818400", UserChargeCNY: "0.0106023000",
	}

	result, err := FinalizeACUUsage(request, "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd")
	require.NoError(t, err)
	require.False(t, result.AlreadyProcessed)

	var updated model.User
	require.NoError(t, model.DB.First(&updated, user.Id).Error)
	require.Equal(t, 8_940, updated.Quota)
	var finalized model.ACUUsageFinalize
	require.NoError(t, model.DB.First(&finalized).Error)
	require.Equal(t, 1060, finalized.FinalQuota)
	require.True(t, decimal.RequireFromString("0.0094818400").Equal(
		decimal.RequireFromString(finalized.ActualTotalCashCostCny),
	))
	require.True(t, decimal.RequireFromString("0.0106023000").Equal(
		decimal.RequireFromString(finalized.UserChargeCny),
	))
	require.True(t, decimal.RequireFromString("0.0083618400").Equal(
		decimal.RequireFromString(finalized.ProviderBalanceCharge),
	))
	require.Equal(t, "USD-denominated credits", finalized.ProviderBalanceCurrency)
	require.True(t, decimal.RequireFromString("1.0000000000").Equal(
		decimal.RequireFromString(finalized.ProviderCreditCashCostCny),
	))
	require.EqualValues(t, 1000, finalized.JudgeInputTokens)
	require.EqualValues(t, 100, finalized.JudgeOutputTokens)
	require.Equal(t, "estimated_blended", finalized.JudgeCostStatus)
	require.Equal(t, "midpoint_openrouter_payg_and_mimo99_plan_v1", finalized.JudgeCostSource)
	require.Equal(t, "mimo-v2.5-pro", finalized.JudgeModel)
}

func TestFinalizeACUUsageChargesAndUpdatesLogExactlyOnce(t *testing.T) {
	setupACUFinalizeTestDB(t)
	user := model.User{Username: "acu-alpha-user", Password: "test-only-password", Status: common.UserStatusEnabled, Quota: 10_000}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "test-only-token-key", Name: "acu-alpha-token", Status: common.TokenStatusEnabled, RemainQuota: 10_000}
	require.NoError(t, model.DB.Create(&token).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId: user.Id, TokenId: token.Id, RequestId: "req_usage_1", Type: model.LogTypeConsume,
		ModelName: "acu-auto", ChannelId: 42, Quota: 0, Other: `{"acu_pending_finalize":true}`,
	}).Error)
	request := dto.ACUUsageFinalizeRequest{
		ReportIdempotencyKey: "report_key_1",
		NewAPIUserID:         fmt.Sprintf("%d", user.Id),
		NewAPITokenID:        fmt.Sprintf("%d", token.Id),
		NewAPILogID:          "req_usage_1",
		LogicalRequestID:     "logical_request_1",
		ActualModel:          "claude-sonnet-test",
		Provider:             "closeai",
		Channel:              "closeai-anthropic-primary",
		Usage:                dto.ACUUsage{InputTokens: 100, CachedInputTokens: 20, OutputTokens: 30, ReasoningTokens: 5},
		JudgeCostUSD:         "0.0002000000",
		ProviderCostUSD:      "0.0008000000",
		FailedBilledCostUSD:  "0.0000000000",
		FinalUserCostUSD:     "0.0010000000",
		CostBreakdown:        map[string]interface{}{"judge": "0.0002000000", "provider": "0.0008000000"},
	}

	first, err := FinalizeACUUsage(request, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	require.NoError(t, err)
	require.False(t, first.AlreadyProcessed)
	second, err := FinalizeACUUsage(request, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	require.NoError(t, err)
	require.True(t, second.AlreadyProcessed)

	var updatedUser model.User
	require.NoError(t, model.DB.First(&updatedUser, user.Id).Error)
	require.Equal(t, 9_500, updatedUser.Quota)
	require.Equal(t, 500, updatedUser.UsedQuota)
	require.Equal(t, 1, updatedUser.RequestCount)
	var updatedToken model.Token
	require.NoError(t, model.DB.First(&updatedToken, token.Id).Error)
	require.Equal(t, 9_500, updatedToken.RemainQuota)
	require.Equal(t, 500, updatedToken.UsedQuota)
	var reports int64
	require.NoError(t, model.DB.Model(&model.ACUUsageFinalize{}).Count(&reports).Error)
	require.EqualValues(t, 1, reports)
	var finalized model.ACUUsageFinalize
	require.NoError(t, model.DB.First(&finalized).Error)
	require.Equal(t, model.ACUFinalizeStatusFinalized, finalized.Status)
	var logEntry model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ?", "req_usage_1").First(&logEntry).Error)
	require.Equal(t, "claude-sonnet-test", logEntry.ModelName)
	require.Equal(t, 42, logEntry.ChannelId)
	require.Equal(t, 500, logEntry.Quota)
	require.Equal(t, 100, logEntry.PromptTokens)
	require.Equal(t, 30, logEntry.CompletionTokens)
	var logOther map[string]interface{}
	require.NoError(t, common.Unmarshal([]byte(logEntry.Other), &logOther))
	require.NotContains(t, logOther, "actual_channel")
	adminInfo, ok := logOther["admin_info"].(map[string]interface{})
	require.True(t, ok)
	require.Equal(t, "closeai-anthropic-primary", adminInfo["actual_channel"])
	require.Contains(t, logOther, "user_charge_cny")
	data, err := model.GetQuotaDataByUserId(user.Id, 0, time.Now().Unix()+1)
	require.NoError(t, err)
	require.Len(t, data, 1)
	require.Equal(t, 500, data[0].Quota)
}

func TestFinalizeACUUsageRejectsIdempotencyPayloadMismatchWithoutSecondCharge(t *testing.T) {
	setupACUFinalizeTestDB(t)
	user := model.User{Username: "acu-idempotency-user", Password: "test-only-password", Status: common.UserStatusEnabled, Quota: 10_000}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "test-only-token-two", Name: "acu-token-two", Status: common.TokenStatusEnabled, RemainQuota: 10_000}
	require.NoError(t, model.DB.Create(&token).Error)
	request := dto.ACUUsageFinalizeRequest{
		ReportIdempotencyKey: "report_key_mismatch", NewAPIUserID: fmt.Sprint(user.Id), NewAPITokenID: fmt.Sprint(token.Id),
		NewAPILogID: "req_usage_mismatch", LogicalRequestID: "logical_request_mismatch", ActualModel: "model-a", Provider: "closeai", Channel: "channel-a",
		JudgeCostUSD: "0", ProviderCostUSD: "0.001", FailedBilledCostUSD: "0", FinalUserCostUSD: "0.001",
	}
	_, err := FinalizeACUUsage(request, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
	require.NoError(t, err)
	_, err = FinalizeACUUsage(request, "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc")
	require.ErrorContains(t, err, "payload mismatch")
	var updated model.User
	require.NoError(t, model.DB.First(&updated, user.Id).Error)
	require.Equal(t, 9_500, updated.Quota)
}

func TestFinalizeACUUsageRecordsUnsettledSnapshotThenFinalizesSameLog(t *testing.T) {
	setupACUFinalizeTestDB(t)
	user := model.User{Username: "acu-unsettled", Password: "test-password", Status: common.UserStatusEnabled, Quota: 499}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "unsettled-token", Name: "acu-unsettled", Status: common.TokenStatusEnabled, RemainQuota: 10_000}
	require.NoError(t, model.DB.Create(&token).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId: user.Id, TokenId: token.Id, RequestId: "req-unsettled", Type: model.LogTypeConsume,
		ModelName: "acu-auto", Other: `{"acu_pending_finalize":true,"preserved":"value"}`,
	}).Error)
	request := dto.ACUUsageFinalizeRequest{
		ReportIdempotencyKey: "report-unsettled", NewAPIUserID: fmt.Sprint(user.Id), NewAPITokenID: fmt.Sprint(token.Id),
		NewAPILogID: "req-unsettled", LogicalRequestID: "logical-unsettled", ActualModel: "gpt-5.6-luna",
		Provider: "lucen", Channel: "cx006", Usage: dto.ACUUsage{InputTokens: 100, CachedInputTokens: 20, OutputTokens: 30, ReasoningTokens: 5},
		JudgeCostUSD: "0.0002", ProviderCostUSD: "0.0008", FailedBilledCostUSD: "0", FinalUserCostUSD: "0.001",
		CostBreakdown: map[string]interface{}{"logical_request_status": "success", "decision_summary": map[string]interface{}{"selected_model": "gpt-5.6-luna"}},
	}
	payloadHash := "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

	_, err := FinalizeACUUsage(request, payloadHash)
	require.ErrorIs(t, err, model.ErrACUInsufficientWallet)
	var logEntry model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ?", "req-unsettled").First(&logEntry).Error)
	assert.Contains(t, logEntry.Other, `"acu_billing_status":"unsettled"`)
	assert.Contains(t, logEntry.Other, `"acu_finalize_error_code":"insufficient_quota"`)
	assert.Contains(t, logEntry.Other, `"acu_logical_request_id":"logical-unsettled"`)
	assert.Contains(t, logEntry.Other, `"acu_cost_breakdown"`)
	assert.Contains(t, logEntry.Other, `"preserved":"value"`)
	assert.Equal(t, 100, logEntry.PromptTokens)
	var finalizeCount int64
	require.NoError(t, model.DB.Model(&model.ACUUsageFinalize{}).Count(&finalizeCount).Error)
	assert.Zero(t, finalizeCount)

	require.NoError(t, model.DB.Model(&model.User{}).Where("id = ?", user.Id).Update("quota", 2_000).Error)
	result, err := FinalizeACUUsage(request, payloadHash)
	require.NoError(t, err)
	assert.False(t, result.AlreadyProcessed)
	result, err = FinalizeACUUsage(request, payloadHash)
	require.NoError(t, err)
	assert.True(t, result.AlreadyProcessed)
	require.NoError(t, model.LOG_DB.Where("request_id = ?", "req-unsettled").First(&logEntry).Error)
	assert.Contains(t, logEntry.Other, `"acu_billing_status":"finalized"`)
	assert.NotContains(t, logEntry.Other, "acu_finalize_error_code")
	require.NoError(t, model.DB.Model(&model.ACUUsageFinalize{}).Count(&finalizeCount).Error)
	assert.EqualValues(t, 1, finalizeCount)
	var logCount int64
	require.NoError(t, model.LOG_DB.Model(&model.Log{}).Where("request_id = ?", "req-unsettled").Count(&logCount).Error)
	assert.EqualValues(t, 1, logCount)
	require.NoError(t, model.DB.First(&user, user.Id).Error)
	assert.Equal(t, 1_500, user.Quota)
}

func TestFinalizeACUUsagePreservesDifficultyInPublicBreakdown(t *testing.T) {
	setupACUFinalizeTestDB(t)
	user := model.User{Username: "acu-difficulty-user", Password: "test-only-password", Status: common.UserStatusEnabled, Quota: 10_000}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "difficulty-token", Name: "acu-difficulty", Status: common.TokenStatusEnabled, RemainQuota: 10_000}
	require.NoError(t, model.DB.Create(&token).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId: user.Id, TokenId: token.Id, RequestId: "req-difficulty", Type: model.LogTypeConsume,
		ModelName: "acu-auto", Other: `{"acu_pending_finalize":true,"acu_cost_breakdown":{"difficulty":67,"difficultyScore":67,"requested_model":"acu-auto","canonical_model":"gpt-5.6-terra","billing_status":"finalized","logical_request_status":"completed","billing_multiplier":1.25,"actual_provider":"lucen","actual_channel":"cx006","actual_total_cash_cost_cny":"0.0100000000","user_charge_cny":"0.0125000000"}}`,
	}).Error)
	request := dto.ACUUsageFinalizeRequest{
		ReportIdempotencyKey: "report-difficulty",
		NewAPIUserID:         fmt.Sprint(user.Id),
		NewAPITokenID:        fmt.Sprint(token.Id),
		NewAPILogID:          "req-difficulty",
		LogicalRequestID:     "logical-difficulty",
		ActualModel:          "gpt-5.6-terra",
		Provider:             "lucen",
		Channel:              "cx006",
		Usage:                dto.ACUUsage{InputTokens: 100, CachedInputTokens: 20, OutputTokens: 30, ReasoningTokens: 5},
		JudgeCostUSD:         "0",
		ProviderCostUSD:      "0.0010000000",
		FailedBilledCostUSD:  "0",
		FinalUserCostUSD:     "0.0010000000",
		CostBreakdown:        map[string]interface{}{"requested_model": "acu-auto", "canonical_model": "gpt-5.6-terra"},
	}

	_, err := FinalizeACUUsage(request, "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff")
	require.NoError(t, err)
	var logEntry model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ?", "req-difficulty").First(&logEntry).Error)
	var other map[string]interface{}
	require.NoError(t, common.Unmarshal([]byte(logEntry.Other), &other))
	breakdown, ok := other["acu_cost_breakdown"].(map[string]interface{})
	require.True(t, ok)
	assert.Equal(t, 67.0, breakdown["difficulty"])
	assert.Equal(t, 67.0, breakdown["difficultyScore"])
	assert.Equal(t, "acu-auto", breakdown["requested_model"])
	assert.NotContains(t, breakdown, "actual_provider")
}

func TestFinalizeACUUsageKeepsExplicitModelWithoutInventingDifficulty(t *testing.T) {
	setupACUFinalizeTestDB(t)
	user := model.User{Username: "acu-explicit-user", Password: "test-only-password", Status: common.UserStatusEnabled, Quota: 10_000}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "explicit-token", Name: "acu-explicit", Status: common.TokenStatusEnabled, RemainQuota: 10_000}
	require.NoError(t, model.DB.Create(&token).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId: user.Id, TokenId: token.Id, RequestId: "req-explicit", Type: model.LogTypeConsume,
		ModelName: "gpt-5.6-terra", Other: `{"acu_pending_finalize":true,"acu_cost_breakdown":{"requested_model":"gpt-5.6-terra","canonical_model":"gpt-5.6-terra","logical_request_status":"completed","billing_status":"finalized","billing_multiplier":1.25,"actual_total_cash_cost_cny":"0.0100000000","user_charge_cny":"0.0125000000"}}`,
	}).Error)
	request := dto.ACUUsageFinalizeRequest{
		ReportIdempotencyKey: "report-explicit",
		NewAPIUserID:         fmt.Sprint(user.Id),
		NewAPITokenID:        fmt.Sprint(token.Id),
		NewAPILogID:          "req-explicit",
		LogicalRequestID:     "logical-explicit",
		ActualModel:          "gpt-5.6-terra",
		Provider:             "lucen",
		Channel:              "cx006",
		Usage:                dto.ACUUsage{InputTokens: 100, CachedInputTokens: 20, OutputTokens: 30, ReasoningTokens: 5},
		JudgeCostUSD:         "0",
		ProviderCostUSD:      "0.0010000000",
		FailedBilledCostUSD:  "0",
		FinalUserCostUSD:     "0.0010000000",
		CostBreakdown:        map[string]interface{}{"requested_model": "gpt-5.6-terra", "canonical_model": "gpt-5.6-terra"},
	}

	_, err := FinalizeACUUsage(request, "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee")
	require.NoError(t, err)
	var logEntry model.Log
	require.NoError(t, model.LOG_DB.Where("request_id = ?", "req-explicit").First(&logEntry).Error)
	var other map[string]interface{}
	require.NoError(t, common.Unmarshal([]byte(logEntry.Other), &other))
	breakdown, ok := other["acu_cost_breakdown"].(map[string]interface{})
	require.True(t, ok)
	_, hasDifficulty := breakdown["difficulty"]
	assert.False(t, hasDifficulty)
	_, hasDifficultyScore := breakdown["difficultyScore"]
	assert.False(t, hasDifficultyScore)
	assert.Equal(t, "gpt-5.6-terra", breakdown["requested_model"])
}
