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
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Token{}, &model.Log{}, &model.ACUUsageFinalize{}))
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

func TestFinalizeACUUsageChargesFounderAlphaActualCashAtOneTimes(t *testing.T) {
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
		FailedAttemptCashCostCNY: "0.0000000000", ActualTotalCashCostCNY: "0.0084818400", UserChargeCNY: "0.0084818400",
	}

	result, err := FinalizeACUUsage(request, "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd")
	require.NoError(t, err)
	require.False(t, result.AlreadyProcessed)

	var updated model.User
	require.NoError(t, model.DB.First(&updated, user.Id).Error)
	require.Equal(t, 9_152, updated.Quota)
	var finalized model.ACUUsageFinalize
	require.NoError(t, model.DB.First(&finalized).Error)
	require.Equal(t, 848, finalized.FinalQuota)
	require.True(t, decimal.RequireFromString("0.0084818400").Equal(
		decimal.RequireFromString(finalized.ActualTotalCashCostCny),
	))
	require.Equal(t, finalized.ActualTotalCashCostCny, finalized.UserChargeCny)
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
	require.Contains(t, logEntry.Other, `"actual_channel":"closeai-anthropic-primary"`)
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
