package service

import (
	"fmt"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/stretchr/testify/require"
)

func TestFixedRetailChargeUsesLockedFXAndRejectsInconsistentMultiplier(t *testing.T) {
	setupACUFinalizeTestDB(t)
	user := model.User{Username: "fixed-retail", Password: "test-password", Status: common.UserStatusEnabled, Quota: 10000}
	require.NoError(t, model.DB.Create(&user).Error)
	token := model.Token{UserId: user.Id, Key: "fixed-retail-token", Name: "fixed-retail", Status: common.TokenStatusEnabled, RemainQuota: 10000}
	require.NoError(t, model.DB.Create(&token).Error)
	request := dto.ACUUsageFinalizeRequest{
		ReportIdempotencyKey: "fixed-retail-report", NewAPIUserID: fmt.Sprint(user.Id), NewAPITokenID: fmt.Sprint(token.Id),
		NewAPILogID: "fixed-retail-log", LogicalRequestID: "fixed-retail-logical", ActualModel: "fixture", Provider: "fixture", Channel: "fixture",
		JudgeCostUSD: "0", ProviderCostUSD: "0.01", FailedBilledCostUSD: "0", FinalUserCostUSD: "0",
		NominalProviderCostUSD: "0.01", ProviderBalanceCharge: "0.01", ProviderBalanceCurrency: "USD-denominated credits", ProviderCreditCashCostCNY: "1",
		EffectiveProviderCashCostCNY: "0.01", JudgeCashCostCNY: "0", FailedAttemptCashCostCNY: "0", ActualTotalCashCostCNY: "0.01", UserChargeCNY: "0.014",
		JudgeOfficialPaygEquivalentCost: "0", JudgeCostCurrency: "CNY", JudgeCostStatus: "not_applicable", JudgeCostSource: "fixture",
		CostBreakdown: map[string]interface{}{"retail_price_version": "retail-v1", "retail_fx_cny_per_usd": "7", "retail_model_multiplier": "0.1", "retail_reference_amount_cny": "0.14"},
	}
	operation_setting.USDExchangeRate = 10
	result, err := FinalizeACUUsage(request, "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
	require.NoError(t, err)
	require.False(t, result.AlreadyProcessed)
	var finalized model.ACUUsageFinalize
	require.NoError(t, model.DB.First(&finalized).Error)
	require.Equal(t, 1000, finalized.FinalQuota)
	request.ReportIdempotencyKey = "inconsistent-retail-report"
	request.CostBreakdown["retail_model_multiplier"] = "0.2"
	_, err = FinalizeACUUsage(request, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb")
	require.ErrorContains(t, err, "invalid fixed model retail charge")
}
