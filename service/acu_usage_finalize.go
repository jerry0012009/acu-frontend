package service

import (
	"errors"
	"fmt"
	"strconv"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
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
	usageValues := []int64{request.Usage.InputTokens, request.Usage.CachedInputTokens, request.Usage.OutputTokens, request.Usage.ReasoningTokens}
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
	if !judgeCost.Add(providerCost).Add(failedCost).Equal(finalCost) {
		return dto.ACUUsageFinalizeResponse{}, errors.New("final_user_cost_usd does not match the cost components")
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
	record, alreadyProcessed, err := model.ApplyACUUsageCharge(model.ACUUsageChargeInput{
		ReportIdempotencyKey: strings.TrimSpace(request.ReportIdempotencyKey),
		LogicalRequestId:     strings.TrimSpace(request.LogicalRequestID),
		PayloadHash:          payloadHash,
		UserId:               userID,
		TokenId:              tokenID,
		LogId:                strings.TrimSpace(request.NewAPILogID),
		ActualModel:          strings.TrimSpace(request.ActualModel),
		Provider:             strings.TrimSpace(request.Provider),
		Channel:              strings.TrimSpace(request.Channel),
		InputTokens:          request.Usage.InputTokens,
		CachedInputTokens:    request.Usage.CachedInputTokens,
		OutputTokens:         request.Usage.OutputTokens,
		ReasoningTokens:      request.Usage.ReasoningTokens,
		JudgeCostUsd:         judgeCost.StringFixed(10),
		ProviderCostUsd:      providerCost.StringFixed(10),
		FailedBilledCostUsd:  failedCost.StringFixed(10),
		FinalUserCostUsd:     finalCost.StringFixed(10),
		FinalQuota:           finalQuota,
		CostBreakdownJson:    string(costBreakdown),
	})
	if err != nil {
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
