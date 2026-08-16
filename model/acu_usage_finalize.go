package model

import (
	"errors"
	"fmt"
	"time"

	"github.com/QuantumNous/new-api/common"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

const (
	ACUFinalizeStatusCharged   = "charged"
	ACUFinalizeStatusFinalized = "finalized"
)

var (
	ErrACUInsufficientWallet = errors.New("ACU wallet balance is insufficient")
	ErrACUInsufficientToken  = errors.New("ACU token quota is insufficient")
)

type ACUUsageFinalize struct {
	Id                                  int    `json:"id"`
	ReportIdempotencyKey                string `json:"report_idempotency_key" gorm:"type:varchar(128);uniqueIndex;not null"`
	LogicalRequestId                    string `json:"logical_request_id" gorm:"type:varchar(128);uniqueIndex;not null"`
	PayloadHash                         string `json:"payload_hash" gorm:"type:char(64);not null"`
	UserId                              int    `json:"user_id" gorm:"index;not null"`
	TokenId                             int    `json:"token_id" gorm:"index;not null"`
	LogId                               string `json:"log_id" gorm:"type:varchar(128);index;not null"`
	ActualModel                         string `json:"actual_model" gorm:"type:varchar(128);not null"`
	Provider                            string `json:"provider" gorm:"type:varchar(128);not null"`
	Channel                             string `json:"channel" gorm:"type:varchar(128);not null"`
	InputTokens                         int64  `json:"input_tokens" gorm:"not null"`
	CachedInputTokens                   int64  `json:"cached_input_tokens" gorm:"not null"`
	OutputTokens                        int64  `json:"output_tokens" gorm:"not null"`
	ReasoningTokens                     int64  `json:"reasoning_tokens" gorm:"not null"`
	JudgeCostUsd                        string `json:"judge_cost_usd" gorm:"type:decimal(20,10);not null"`
	ProviderCostUsd                     string `json:"provider_cost_usd" gorm:"type:decimal(20,10);not null"`
	FailedBilledCostUsd                 string `json:"failed_billed_cost_usd" gorm:"type:decimal(20,10);not null"`
	FinalUserCostUsd                    string `json:"final_user_cost_usd" gorm:"type:decimal(20,10);not null"`
	NominalProviderCostUsd              string `json:"nominal_provider_cost_usd" gorm:"type:decimal(20,10);not null;default:0"`
	ProviderBalanceChargeUsd            string `json:"provider_balance_charge_usd" gorm:"type:decimal(20,10);not null;default:0"`
	ProviderBalanceCharge               string `json:"provider_balance_charge" gorm:"type:decimal(20,10);not null;default:0"`
	ProviderBalanceCurrency             string `json:"provider_balance_currency" gorm:"type:varchar(64);not null;default:'USD-denominated credits'"`
	ProviderCreditCashCostCny           string `json:"provider_credit_cash_cost_cny" gorm:"type:decimal(20,10);not null;default:0"`
	EffectiveProviderCashCostCny        string `json:"effective_provider_cash_cost_cny" gorm:"type:decimal(20,10);not null;default:0"`
	JudgeCashCostCny                    string `json:"judge_cash_cost_cny" gorm:"type:decimal(20,10);not null;default:0"`
	JudgeInputTokens                    int64  `json:"judge_input_tokens" gorm:"not null;default:0"`
	JudgeOutputTokens                   int64  `json:"judge_output_tokens" gorm:"not null;default:0"`
	JudgeOfficialPaygEquivalentCost     string `json:"judge_official_payg_equivalent_cost" gorm:"type:decimal(20,10);not null;default:0"`
	JudgeCostCurrency                   string `json:"judge_cost_currency" gorm:"type:varchar(16);not null;default:'CNY'"`
	JudgeCostStatus                     string `json:"judge_cost_status" gorm:"type:varchar(32);not null;default:'not_applicable'"`
	JudgeCostSource                     string `json:"judge_cost_source" gorm:"type:varchar(128);not null;default:'not_applicable'"`
	JudgeProvider                       string `json:"judge_provider" gorm:"type:varchar(128)"`
	JudgeModel                          string `json:"judge_model" gorm:"type:varchar(128)"`
	FailedAttemptCashCostCny            string `json:"failed_attempt_cash_cost_cny" gorm:"type:decimal(20,10);not null;default:0"`
	ActualTotalCashCostCny              string `json:"actual_total_cash_cost_cny" gorm:"type:decimal(20,10);not null;default:0"`
	UserChargeCny                       string `json:"user_charge_cny" gorm:"type:decimal(20,10);not null;default:0"`
	CounterfactualQualityCeilingCostCny string `json:"counterfactual_quality_ceiling_cost_cny" gorm:"type:decimal(20,10)"`
	FinalQuota                          int    `json:"final_quota" gorm:"not null"`
	CostBreakdownJson                   string `json:"cost_breakdown_json" gorm:"type:text;not null"`
	Status                              string `json:"status" gorm:"type:varchar(16);index;not null"`
	CreatedAt                           int64  `json:"created_at" gorm:"bigint;not null"`
	UpdatedAt                           int64  `json:"updated_at" gorm:"bigint;not null"`
}

type ACUUsageChargeInput struct {
	ReportIdempotencyKey                string
	LogicalRequestId                    string
	PayloadHash                         string
	UserId                              int
	TokenId                             int
	LogId                               string
	ActualModel                         string
	Provider                            string
	Channel                             string
	InputTokens                         int64
	CachedInputTokens                   int64
	OutputTokens                        int64
	ReasoningTokens                     int64
	JudgeCostUsd                        string
	ProviderCostUsd                     string
	FailedBilledCostUsd                 string
	FinalUserCostUsd                    string
	NominalProviderCostUsd              string
	ProviderBalanceChargeUsd            string
	ProviderBalanceCharge               string
	ProviderBalanceCurrency             string
	ProviderCreditCashCostCny           string
	EffectiveProviderCashCostCny        string
	JudgeCashCostCny                    string
	JudgeInputTokens                    int64
	JudgeOutputTokens                   int64
	JudgeOfficialPaygEquivalentCost     string
	JudgeCostCurrency                   string
	JudgeCostStatus                     string
	JudgeCostSource                     string
	JudgeProvider                       string
	JudgeModel                          string
	FailedAttemptCashCostCny            string
	ActualTotalCashCostCny              string
	UserChargeCny                       string
	CounterfactualQualityCeilingCostCny string
	FinalQuota                          int
	CostBreakdownJson                   string
}

func sameACUFinalizePayload(record *ACUUsageFinalize, input ACUUsageChargeInput) bool {
	return record != nil && record.PayloadHash == input.PayloadHash &&
		record.ReportIdempotencyKey == input.ReportIdempotencyKey &&
		record.LogicalRequestId == input.LogicalRequestId &&
		record.UserId == input.UserId && record.TokenId == input.TokenId && record.LogId == input.LogId
}

// ApplyACUUsageCharge atomically claims the idempotency key and charges the
// invited Alpha user's wallet/token exactly once. Log finalization is separate
// because LOG_DB may be configured independently.
func ApplyACUUsageCharge(input ACUUsageChargeInput) (*ACUUsageFinalize, bool, error) {
	var result ACUUsageFinalize
	alreadyProcessed := false
	err := DB.Transaction(func(tx *gorm.DB) error {
		var existing ACUUsageFinalize
		err := tx.Where("report_idempotency_key = ?", input.ReportIdempotencyKey).First(&existing).Error
		if err == nil {
			if !sameACUFinalizePayload(&existing, input) {
				return errors.New("ACU finalize idempotency key payload mismatch")
			}
			result = existing
			alreadyProcessed = true
			return nil
		}
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		}

		now := time.Now().Unix()
		record := ACUUsageFinalize{
			ReportIdempotencyKey:                input.ReportIdempotencyKey,
			LogicalRequestId:                    input.LogicalRequestId,
			PayloadHash:                         input.PayloadHash,
			UserId:                              input.UserId,
			TokenId:                             input.TokenId,
			LogId:                               input.LogId,
			ActualModel:                         input.ActualModel,
			Provider:                            input.Provider,
			Channel:                             input.Channel,
			InputTokens:                         input.InputTokens,
			CachedInputTokens:                   input.CachedInputTokens,
			OutputTokens:                        input.OutputTokens,
			ReasoningTokens:                     input.ReasoningTokens,
			JudgeCostUsd:                        input.JudgeCostUsd,
			ProviderCostUsd:                     input.ProviderCostUsd,
			FailedBilledCostUsd:                 input.FailedBilledCostUsd,
			FinalUserCostUsd:                    input.FinalUserCostUsd,
			NominalProviderCostUsd:              input.NominalProviderCostUsd,
			ProviderBalanceChargeUsd:            input.ProviderBalanceChargeUsd,
			ProviderBalanceCharge:               input.ProviderBalanceCharge,
			ProviderBalanceCurrency:             input.ProviderBalanceCurrency,
			ProviderCreditCashCostCny:           input.ProviderCreditCashCostCny,
			EffectiveProviderCashCostCny:        input.EffectiveProviderCashCostCny,
			JudgeCashCostCny:                    input.JudgeCashCostCny,
			JudgeInputTokens:                    input.JudgeInputTokens,
			JudgeOutputTokens:                   input.JudgeOutputTokens,
			JudgeOfficialPaygEquivalentCost:     input.JudgeOfficialPaygEquivalentCost,
			JudgeCostCurrency:                   input.JudgeCostCurrency,
			JudgeCostStatus:                     input.JudgeCostStatus,
			JudgeCostSource:                     input.JudgeCostSource,
			JudgeProvider:                       input.JudgeProvider,
			JudgeModel:                          input.JudgeModel,
			FailedAttemptCashCostCny:            input.FailedAttemptCashCostCny,
			ActualTotalCashCostCny:              input.ActualTotalCashCostCny,
			UserChargeCny:                       input.UserChargeCny,
			CounterfactualQualityCeilingCostCny: input.CounterfactualQualityCeilingCostCny,
			FinalQuota:                          input.FinalQuota,
			CostBreakdownJson:                   input.CostBreakdownJson,
			Status:                              ACUFinalizeStatusCharged,
			CreatedAt:                           now,
			UpdatedAt:                           now,
		}
		created := tx.Clauses(clause.OnConflict{DoNothing: true}).Create(&record)
		if created.Error != nil {
			return created.Error
		}
		if created.RowsAffected == 0 {
			if err := tx.Where("report_idempotency_key = ?", input.ReportIdempotencyKey).First(&existing).Error; err == nil {
				if !sameACUFinalizePayload(&existing, input) {
					return errors.New("ACU finalize idempotency key payload mismatch")
				}
				result = existing
				alreadyProcessed = true
				return nil
			}
			if err := tx.Where("logical_request_id = ?", input.LogicalRequestId).First(&existing).Error; err == nil {
				return errors.New("ACU logical request already finalized with a different report")
			}
			return errors.New("ACU finalize idempotency claim failed")
		}

		var user User
		if err := lockForUpdate(tx).Where("id = ?", input.UserId).First(&user).Error; err != nil {
			return err
		}
		if user.Status != common.UserStatusEnabled {
			return errors.New("ACU user is disabled")
		}
		if user.Quota < input.FinalQuota {
			return ErrACUInsufficientWallet
		}
		userUpdate := tx.Model(&User{}).
			Where("id = ? AND status = ? AND quota >= ?", input.UserId, common.UserStatusEnabled, input.FinalQuota).
			Updates(map[string]interface{}{
				"quota":         gorm.Expr("quota - ?", input.FinalQuota),
				"used_quota":    gorm.Expr("used_quota + ?", input.FinalQuota),
				"request_count": gorm.Expr("request_count + 1"),
			})
		if userUpdate.Error != nil {
			return userUpdate.Error
		}
		if userUpdate.RowsAffected != 1 {
			return errors.New("ACU wallet charge lost its locked user row")
		}

		var token Token
		if err := lockForUpdate(tx).Where("id = ? AND user_id = ?", input.TokenId, input.UserId).First(&token).Error; err != nil {
			return err
		}
		if token.Status != common.TokenStatusEnabled {
			return errors.New("ACU token is disabled")
		}
		tokenUpdates := map[string]interface{}{
			"used_quota":    gorm.Expr("used_quota + ?", input.FinalQuota),
			"accessed_time": now,
		}
		tokenQuery := tx.Model(&Token{}).Where("id = ? AND user_id = ? AND status = ?", input.TokenId, input.UserId, common.TokenStatusEnabled)
		if !token.UnlimitedQuota {
			tokenQuery = tokenQuery.Where("remain_quota >= ?", input.FinalQuota)
			tokenUpdates["remain_quota"] = gorm.Expr("remain_quota - ?", input.FinalQuota)
		}
		tokenUpdate := tokenQuery.Updates(tokenUpdates)
		if tokenUpdate.Error != nil {
			return tokenUpdate.Error
		}
		if tokenUpdate.RowsAffected != 1 {
			return ErrACUInsufficientToken
		}
		result = record
		return nil
	})
	if err != nil {
		return nil, false, err
	}
	if common.RedisEnabled && !alreadyProcessed {
		if err := invalidateUserCache(input.UserId); err != nil {
			common.SysLog(fmt.Sprintf("failed to invalidate ACU user cache: %s", err.Error()))
		}
		if token, err := GetTokenByIds(input.TokenId, input.UserId); err == nil {
			if err := cacheSetToken(*token); err != nil {
				common.SysLog(fmt.Sprintf("failed to refresh ACU token cache: %s", err.Error()))
			}
		}
	}
	return &result, alreadyProcessed, nil
}

func MarkACUUsageFinalized(id int) error {
	return DB.Model(&ACUUsageFinalize{}).Where("id = ?", id).Updates(map[string]interface{}{
		"status":     ACUFinalizeStatusFinalized,
		"updated_at": time.Now().Unix(),
	}).Error
}

func FinalizeACUConsumeLog(record *ACUUsageFinalize) error {
	if record == nil {
		return errors.New("ACU usage finalize record is nil")
	}
	user, err := GetUserById(record.UserId, false)
	if err != nil {
		return err
	}
	token, err := GetTokenByIds(record.TokenId, record.UserId)
	if err != nil {
		return err
	}
	var existing Log
	err = LOG_DB.Where(
		"user_id = ? AND token_id = ? AND request_id = ? AND type = ?",
		record.UserId, record.TokenId, record.LogId, LogTypeConsume,
	).First(&existing).Error
	if err != nil && !errors.Is(err, gorm.ErrRecordNotFound) {
		return err
	}
	input := ACUUsageChargeInput{
		ReportIdempotencyKey:                record.ReportIdempotencyKey,
		LogicalRequestId:                    record.LogicalRequestId,
		ActualModel:                         record.ActualModel,
		Provider:                            record.Provider,
		Channel:                             record.Channel,
		InputTokens:                         record.InputTokens,
		CachedInputTokens:                   record.CachedInputTokens,
		OutputTokens:                        record.OutputTokens,
		ReasoningTokens:                     record.ReasoningTokens,
		JudgeCostUsd:                        record.JudgeCostUsd,
		ProviderCostUsd:                     record.ProviderCostUsd,
		FailedBilledCostUsd:                 record.FailedBilledCostUsd,
		FinalUserCostUsd:                    record.FinalUserCostUsd,
		NominalProviderCostUsd:              record.NominalProviderCostUsd,
		ProviderBalanceCharge:               record.ProviderBalanceCharge,
		ProviderBalanceCurrency:             record.ProviderBalanceCurrency,
		ProviderCreditCashCostCny:           record.ProviderCreditCashCostCny,
		EffectiveProviderCashCostCny:        record.EffectiveProviderCashCostCny,
		JudgeCashCostCny:                    record.JudgeCashCostCny,
		JudgeInputTokens:                    record.JudgeInputTokens,
		JudgeOutputTokens:                   record.JudgeOutputTokens,
		JudgeOfficialPaygEquivalentCost:     record.JudgeOfficialPaygEquivalentCost,
		JudgeCostCurrency:                   record.JudgeCostCurrency,
		JudgeCostStatus:                     record.JudgeCostStatus,
		JudgeCostSource:                     record.JudgeCostSource,
		JudgeProvider:                       record.JudgeProvider,
		JudgeModel:                          record.JudgeModel,
		FailedAttemptCashCostCny:            record.FailedAttemptCashCostCny,
		ActualTotalCashCostCny:              record.ActualTotalCashCostCny,
		UserChargeCny:                       record.UserChargeCny,
		CounterfactualQualityCeilingCostCny: record.CounterfactualQualityCeilingCostCny,
		CostBreakdownJson:                   record.CostBreakdownJson,
	}
	other := acuUsageLogOther(input, false, "finalized", "")
	if err == nil && existing.Other != "" {
		existingOther := map[string]interface{}{}
		if common.UnmarshalJsonStr(existing.Other, &existingOther) == nil {
			existingBreakdown, _ := existingOther["acu_cost_breakdown"].(map[string]interface{})
			finalBreakdown, _ := other["acu_cost_breakdown"].(map[string]interface{})
			if finalBreakdown == nil {
				finalBreakdown = map[string]interface{}{}
			}
			for _, key := range acuPublicRoutingTelemetryKeys {
				if _, exists := finalBreakdown[key]; exists {
					continue
				}
				if value, exists := existingBreakdown[key]; exists {
					finalBreakdown[key] = value
				}
			}
			other["acu_cost_breakdown"] = finalBreakdown
		}
	}
	updates := Log{
		UserId:           record.UserId,
		Username:         user.Username,
		CreatedAt:        common.GetTimestamp(),
		Type:             LogTypeConsume,
		Content:          "ACU usage finalized",
		TokenName:        token.Name,
		ModelName:        record.ActualModel,
		Quota:            record.FinalQuota,
		PromptTokens:     int(record.InputTokens),
		CompletionTokens: int(record.OutputTokens),
		TokenId:          record.TokenId,
		RequestId:        record.LogId,
		Other:            common.MapToJsonStr(other),
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return createLog(&updates)
	}
	return LOG_DB.Model(&Log{}).Where("id = ?", existing.Id).Updates(map[string]interface{}{
		"content":           updates.Content,
		"model_name":        updates.ModelName,
		"quota":             updates.Quota,
		"prompt_tokens":     updates.PromptTokens,
		"completion_tokens": updates.CompletionTokens,
		"other":             updates.Other,
	}).Error
}

func RecordACUUnsettledUsage(input ACUUsageChargeInput) error {
	var existing Log
	if err := LOG_DB.Where(
		"user_id = ? AND token_id = ? AND request_id = ? AND type = ?",
		input.UserId, input.TokenId, input.LogId, LogTypeConsume,
	).First(&existing).Error; err != nil {
		return err
	}
	other := map[string]interface{}{}
	if existing.Other != "" {
		_ = common.UnmarshalJsonStr(existing.Other, &other)
	}
	for key, value := range acuUsageLogOther(input, true, "unsettled", "insufficient_quota") {
		other[key] = value
	}
	return updateACUUsageLog(existing.Id, input, "ACU usage pending settlement", 0, other)
}

var acuPublicRoutingTelemetryKeys = []string{
	"requested_model",
	"canonical_model",
	"logical_request_status",
	"protocol",
	"session_id",
	"task_id",
	"segment_id",
	"judge_calls",
	"judge_reused",
	"judge_trigger",
	"route_refresh_reason",
	"routed_by_acu",
	"mode",
	"difficulty",
	"difficultyScore",
	"candidate_count",
	"selected_model",
	"route_reason",
	"reasoning_effort",
	"routing_preference",
	"phase",
	"end_to_end_latency_ms",
	"judge_latency_ms",
	"provider_latency_ms",
	"first_model_event_latency_ms",
	"usageSource",
	"billing_status",
}

func acuUsageLogOther(input ACUUsageChargeInput, pending bool, status, errorCode string) map[string]interface{} {
	other := map[string]interface{}{
		"acu_pending_finalize":       pending,
		"acu_billing_status":         status,
		"acu_logical_request_id":     input.LogicalRequestId,
		"acu_report_idempotency_key": input.ReportIdempotencyKey,
		"cached_input_tokens":        input.CachedInputTokens,
		"reasoning_tokens":           input.ReasoningTokens,
		"user_charge_cny":            input.UserChargeCny,
	}
	if errorCode != "" {
		other["acu_finalize_error_code"] = errorCode
	}
	var breakdown map[string]interface{}
	if common.UnmarshalJsonStr(input.CostBreakdownJson, &breakdown) == nil {
		publicBreakdown := map[string]interface{}{}
		for _, key := range acuPublicRoutingTelemetryKeys {
			if value, exists := breakdown[key]; exists {
				publicBreakdown[key] = value
			}
		}
		publicBreakdown["user_charge_cny"] = input.UserChargeCny
		if value, exists := breakdown["costCompletenessStatus"]; exists {
			publicBreakdown["cost_status"] = value
		}
		if attempts, ok := breakdown["channel_attempts"].([]interface{}); ok {
			publicAttempts := make([]interface{}, 0, len(attempts))
			for _, value := range attempts {
				attempt, ok := value.(map[string]interface{})
				if !ok {
					continue
				}
				publicAttempt := map[string]interface{}{}
				for _, key := range []string{
					"attempt_index",
					"status",
					"latency_ms",
					"first_model_event_latency_ms",
				} {
					if field, exists := attempt[key]; exists {
						publicAttempt[key] = field
					}
				}
				if len(publicAttempt) > 0 {
					publicAttempts = append(publicAttempts, publicAttempt)
				}
			}
			if len(publicAttempts) > 0 {
				publicBreakdown["channel_attempts"] = publicAttempts
			}
		}
		other["acu_cost_breakdown"] = publicBreakdown
		other["admin_info"] = map[string]interface{}{
			"acu_cost_breakdown":                      breakdown,
			"actual_provider":                         input.Provider,
			"actual_channel":                          input.Channel,
			"judge_cost_usd":                          input.JudgeCostUsd,
			"provider_cost_usd":                       input.ProviderCostUsd,
			"failed_billed_cost_usd":                  input.FailedBilledCostUsd,
			"final_user_cost_usd":                     input.FinalUserCostUsd,
			"nominal_provider_cost_usd":               input.NominalProviderCostUsd,
			"provider_balance_charge":                 input.ProviderBalanceCharge,
			"provider_balance_currency":               input.ProviderBalanceCurrency,
			"provider_credit_cash_cost_cny":           input.ProviderCreditCashCostCny,
			"effective_provider_cash_cost_cny":        input.EffectiveProviderCashCostCny,
			"judge_cash_cost_cny":                     input.JudgeCashCostCny,
			"judge_input_tokens":                      input.JudgeInputTokens,
			"judge_output_tokens":                     input.JudgeOutputTokens,
			"judge_official_payg_equivalent_cost":     input.JudgeOfficialPaygEquivalentCost,
			"judge_cost_currency":                     input.JudgeCostCurrency,
			"judge_cost_status":                       input.JudgeCostStatus,
			"judge_cost_source":                       input.JudgeCostSource,
			"judge_provider":                          input.JudgeProvider,
			"judge_model":                             input.JudgeModel,
			"failed_attempt_cash_cost_cny":            input.FailedAttemptCashCostCny,
			"actual_total_cash_cost_cny":              input.ActualTotalCashCostCny,
			"counterfactual_quality_ceiling_cost_cny": input.CounterfactualQualityCeilingCostCny,
		}
	}
	return other
}

func updateACUUsageLog(logID int, input ACUUsageChargeInput, content string, quota int, other map[string]interface{}) error {
	updates := map[string]interface{}{
		"content": content, "model_name": input.ActualModel, "quota": quota,
		"prompt_tokens": int(input.InputTokens), "completion_tokens": int(input.OutputTokens),
		"other": common.MapToJsonStr(other),
	}
	result := LOG_DB.Model(&Log{}).Where("id = ?", logID).Updates(updates)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return errors.New("ACU pending usage log was not found")
	}
	return nil
}
