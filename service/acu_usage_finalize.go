package service

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/shopspring/decimal"
)

func validateACUIdentifier(name, value string) error {
	value = strings.TrimSpace(value)
	if value == "" || len(value) > 128 {
		return fmt.Errorf("%s is invalid", name)
	}
	return nil
}

func parseACUCost(name, value string) (decimal.Decimal, error) {
	if strings.TrimSpace(value) == "" {
		value = "0"
	}
	cost, err := decimal.NewFromString(value)
	if err != nil || cost.IsNegative() {
		return decimal.Zero, fmt.Errorf("%s must be a non-negative decimal", name)
	}
	if cost.Exponent() < -10 {
		return decimal.Zero, fmt.Errorf("%s has more than 10 decimal places", name)
	}
	return cost, nil
}

func FinalizeACUUsage(request dto.ACUUsageFinalizeRequest, payloadHash string) (dto.ACUUsageFinalizeResponse, error) {
	for name, value := range map[string]string{
		"report_idempotency_key": request.ReportIdempotencyKey,
		"logical_request_id":     request.LogicalRequestID,
		"newapi_log_id":          request.NewAPILogID,
		"actual_model":           request.ActualModel,
		"provider":               request.Provider,
		"channel":                request.Channel,
	} {
		if err := validateACUIdentifier(name, value); err != nil {
			return dto.ACUUsageFinalizeResponse{}, err
		}
	}
	userID, err := strconv.Atoi(request.NewAPIUserID)
	if err != nil || userID <= 0 {
		return dto.ACUUsageFinalizeResponse{}, errors.New("newapi_user_id is invalid")
	}
	tokenID, err := strconv.Atoi(request.NewAPITokenID)
	if err != nil || tokenID <= 0 {
		return dto.ACUUsageFinalizeResponse{}, errors.New("newapi_token_id is invalid")
	}
	usageValues := []int64{request.Usage.InputTokens, request.Usage.CachedInputTokens, request.Usage.OutputTokens,
		request.Usage.ReasoningTokens, request.JudgeInputTokens, request.JudgeOutputTokens}
	for _, value := range usageValues {
		if value < 0 || value > int64(common.MaxQuota) {
			return dto.ACUUsageFinalizeResponse{}, errors.New("ACU usage token count is out of range")
		}
	}
	judgeCost, err := parseACUCost("judge_cost_usd", request.JudgeCostUSD)
	if err != nil {
		return dto.ACUUsageFinalizeResponse{}, err
	}
	providerCost, err := parseACUCost("provider_cost_usd", request.ProviderCostUSD)
	if err != nil {
		return dto.ACUUsageFinalizeResponse{}, err
	}
	failedCost, err := parseACUCost("failed_billed_cost_usd", request.FailedBilledCostUSD)
	if err != nil {
		return dto.ACUUsageFinalizeResponse{}, err
	}
	finalCost, err := parseACUCost("final_user_cost_usd", request.FinalUserCostUSD)
	if err != nil {
		return dto.ACUUsageFinalizeResponse{}, err
	}
	actualCashV2 := strings.TrimSpace(request.ActualTotalCashCostCNY) != "" || strings.TrimSpace(request.UserChargeCNY) != ""
	nominalProviderCost := providerCost
	providerBalanceCharge := decimal.Zero
	providerCreditCashCost := decimal.Zero
	providerBalanceCurrency := strings.TrimSpace(request.ProviderBalanceCurrency)
	effectiveProviderCash := decimal.Zero
	judgeCash := decimal.Zero
	failedAttemptCash := decimal.Zero
	actualTotalCash := decimal.Zero
	userChargeCny := decimal.Zero
	counterfactualCost := decimal.Zero
	judgeOfficialPaygEquivalent := decimal.Zero
	judgeCostCurrency := strings.TrimSpace(request.JudgeCostCurrency)
	judgeCostStatus := strings.TrimSpace(request.JudgeCostStatus)
	judgeCostSource := strings.TrimSpace(request.JudgeCostSource)
	if actualCashV2 {
		providerBalanceChargeRaw := request.ProviderBalanceCharge
		legacyProviderBalance := strings.TrimSpace(providerBalanceChargeRaw) == ""
		if legacyProviderBalance {
			providerBalanceChargeRaw = request.ProviderBalanceChargeUSD
		}
		for name, raw := range map[string]string{
			"nominal_provider_cost_usd":        request.NominalProviderCostUSD,
			"provider_balance_charge":          providerBalanceChargeRaw,
			"provider_credit_cash_cost_cny":    request.ProviderCreditCashCostCNY,
			"effective_provider_cash_cost_cny": request.EffectiveProviderCashCostCNY,
			"judge_cash_cost_cny":              request.JudgeCashCostCNY,
			"failed_attempt_cash_cost_cny":     request.FailedAttemptCashCostCNY,
			"actual_total_cash_cost_cny":       request.ActualTotalCashCostCNY,
			"user_charge_cny":                  request.UserChargeCNY,
		} {
			value, parseErr := parseACUCost(name, raw)
			if parseErr != nil {
				return dto.ACUUsageFinalizeResponse{}, parseErr
			}
			switch name {
			case "nominal_provider_cost_usd":
				nominalProviderCost = value
			case "provider_balance_charge":
				providerBalanceCharge = value
			case "provider_credit_cash_cost_cny":
				providerCreditCashCost = value
			case "effective_provider_cash_cost_cny":
				effectiveProviderCash = value
			case "judge_cash_cost_cny":
				judgeCash = value
			case "failed_attempt_cash_cost_cny":
				failedAttemptCash = value
			case "actual_total_cash_cost_cny":
				actualTotalCash = value
			case "user_charge_cny":
				userChargeCny = value
			}
		}
		if strings.TrimSpace(request.CounterfactualQualityCeilingCostCNY) != "" {
			counterfactualCost, err = parseACUCost("counterfactual_quality_ceiling_cost_cny", request.CounterfactualQualityCeilingCostCNY)
			if err != nil {
				return dto.ACUUsageFinalizeResponse{}, err
			}
		}
		judgeOfficialPaygEquivalent, err = parseACUCost(
			"judge_official_payg_equivalent_cost", request.JudgeOfficialPaygEquivalentCost,
		)
		if err != nil {
			return dto.ACUUsageFinalizeResponse{}, err
		}
		if judgeCostCurrency == "" {
			judgeCostCurrency = "CNY"
		}
		if judgeCostStatus == "" {
			if judgeCash.IsZero() {
				judgeCostStatus = "not_applicable"
			} else {
				judgeCostStatus = "verified"
			}
		}
		if judgeCostSource == "" {
			judgeCostSource = "legacy_closeai_cash_semantics"
		}
		if judgeCostCurrency != "CNY" {
			return dto.ACUUsageFinalizeResponse{}, errors.New("judge_cost_currency must be CNY")
		}
		validJudgeCostStatus := map[string]bool{
			"estimated_blended": true, "estimated_upper_bound": true,
			"verified": true, "mixed": true, "not_applicable": true,
		}
		if !validJudgeCostStatus[judgeCostStatus] {
			return dto.ACUUsageFinalizeResponse{}, errors.New("judge_cost_status is invalid")
		}
		if judgeCostSource == "" || len(judgeCostSource) > 256 {
			return dto.ACUUsageFinalizeResponse{}, errors.New("judge_cost_source is invalid")
		}
		if !nominalProviderCost.Equal(providerCost) {
			return dto.ACUUsageFinalizeResponse{}, errors.New("nominal_provider_cost_usd does not match provider_cost_usd")
		}
		if providerBalanceCurrency != "USD-denominated credits" {
			if legacyProviderBalance && providerBalanceCurrency == "" {
				providerBalanceCurrency = "USD-denominated credits"
			}
		}
		if providerBalanceCurrency != "USD-denominated credits" {
			return dto.ACUUsageFinalizeResponse{}, errors.New("provider_balance_currency must be USD-denominated credits")
		}
		if legacyProviderBalance && strings.TrimSpace(request.ProviderCreditCashCostCNY) == "" && !providerBalanceCharge.IsZero() {
			providerCreditCashCost = effectiveProviderCash.Div(providerBalanceCharge)
		}
		if !providerBalanceCharge.Mul(providerCreditCashCost).Round(10).Equal(effectiveProviderCash) {
			return dto.ACUUsageFinalizeResponse{}, errors.New("effective_provider_cash_cost_cny does not match Provider Credits conversion")
		}
		if !effectiveProviderCash.Add(judgeCash).Add(failedAttemptCash).Equal(actualTotalCash) {
			return dto.ACUUsageFinalizeResponse{}, errors.New("actual_total_cash_cost_cny does not match the cash cost components")
		}
		if operation_setting.USDExchangeRate <= 0 {
			return dto.ACUUsageFinalizeResponse{}, errors.New("USD/CNY exchange rate is invalid")
		}
		finalCost = userChargeCny.Div(decimal.NewFromFloat(operation_setting.USDExchangeRate))
	} else if !judgeCost.Add(providerCost).Add(failedCost).Equal(finalCost) {
		return dto.ACUUsageFinalizeResponse{}, errors.New("final_user_cost_usd does not match the cost components")
	}
	if judgeCostCurrency == "" {
		judgeCostCurrency = "CNY"
	}
	if judgeCostStatus == "" {
		judgeCostStatus = "not_applicable"
	}
	if judgeCostSource == "" {
		judgeCostSource = "legacy_nominal_usd_semantics"
	}
	quotaDecimal := finalCost.Mul(decimal.NewFromFloat(common.QuotaPerUnit))
	finalQuota, clamp := common.QuotaFromDecimalChecked(quotaDecimal)
	if clamp != nil {
		return dto.ACUUsageFinalizeResponse{}, clamp
	}
	costBreakdown, err := common.Marshal(request.CostBreakdown)
	if err != nil {
		return dto.ACUUsageFinalizeResponse{}, err
	}
	chargeInput := model.ACUUsageChargeInput{
		ReportIdempotencyKey:                strings.TrimSpace(request.ReportIdempotencyKey),
		LogicalRequestId:                    strings.TrimSpace(request.LogicalRequestID),
		PayloadHash:                         payloadHash,
		UserId:                              userID,
		TokenId:                             tokenID,
		LogId:                               strings.TrimSpace(request.NewAPILogID),
		ActualModel:                         strings.TrimSpace(request.ActualModel),
		Provider:                            strings.TrimSpace(request.Provider),
		Channel:                             strings.TrimSpace(request.Channel),
		InputTokens:                         request.Usage.InputTokens,
		CachedInputTokens:                   request.Usage.CachedInputTokens,
		OutputTokens:                        request.Usage.OutputTokens,
		ReasoningTokens:                     request.Usage.ReasoningTokens,
		JudgeCostUsd:                        judgeCost.StringFixed(10),
		ProviderCostUsd:                     providerCost.StringFixed(10),
		FailedBilledCostUsd:                 failedCost.StringFixed(10),
		FinalUserCostUsd:                    finalCost.StringFixed(10),
		NominalProviderCostUsd:              nominalProviderCost.StringFixed(10),
		ProviderBalanceChargeUsd:            providerBalanceCharge.StringFixed(10),
		ProviderBalanceCharge:               providerBalanceCharge.StringFixed(10),
		ProviderBalanceCurrency:             providerBalanceCurrency,
		ProviderCreditCashCostCny:           providerCreditCashCost.StringFixed(10),
		EffectiveProviderCashCostCny:        effectiveProviderCash.StringFixed(10),
		JudgeCashCostCny:                    judgeCash.StringFixed(10),
		JudgeInputTokens:                    request.JudgeInputTokens,
		JudgeOutputTokens:                   request.JudgeOutputTokens,
		JudgeOfficialPaygEquivalentCost:     judgeOfficialPaygEquivalent.StringFixed(10),
		JudgeCostCurrency:                   judgeCostCurrency,
		JudgeCostStatus:                     judgeCostStatus,
		JudgeCostSource:                     judgeCostSource,
		JudgeProvider:                       strings.TrimSpace(request.JudgeProvider),
		JudgeModel:                          strings.TrimSpace(request.JudgeModel),
		FailedAttemptCashCostCny:            failedAttemptCash.StringFixed(10),
		ActualTotalCashCostCny:              actualTotalCash.StringFixed(10),
		UserChargeCny:                       userChargeCny.StringFixed(10),
		CounterfactualQualityCeilingCostCny: counterfactualCost.StringFixed(10),
		FinalQuota:                          finalQuota,
		CostBreakdownJson:                   string(costBreakdown),
	}
	record, alreadyProcessed, err := model.ApplyACUUsageCharge(chargeInput)
	if err != nil {
		if errors.Is(err, model.ErrACUInsufficientWallet) || errors.Is(err, model.ErrACUInsufficientToken) {
			if logErr := model.RecordACUUnsettledUsage(chargeInput); logErr != nil {
				return dto.ACUUsageFinalizeResponse{}, fmt.Errorf("%w; failed to record validated usage snapshot: %v", err, logErr)
			}
		}
		return dto.ACUUsageFinalizeResponse{}, err
	}
	if record.Status != model.ACUFinalizeStatusFinalized {
		if err := model.FinalizeACUConsumeLog(record); err != nil {
			return dto.ACUUsageFinalizeResponse{}, err
		}
		if err := model.MarkACUUsageFinalized(record.Id); err != nil {
			return dto.ACUUsageFinalizeResponse{}, err
		}
	}
	return dto.ACUUsageFinalizeResponse{Status: "acknowledged", AlreadyProcessed: alreadyProcessed}, nil
}
