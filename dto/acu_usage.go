package dto

type ACUUsage struct {
	InputTokens       int64 `json:"input_tokens"`
	CachedInputTokens int64 `json:"cached_input_tokens"`
	OutputTokens      int64 `json:"output_tokens"`
	ReasoningTokens   int64 `json:"reasoning_tokens"`
}

type ACUUsageFinalizeRequest struct {
	ReportIdempotencyKey                string                 `json:"report_idempotency_key"`
	NewAPIUserID                        string                 `json:"newapi_user_id"`
	NewAPITokenID                       string                 `json:"newapi_token_id"`
	NewAPILogID                         string                 `json:"newapi_log_id"`
	LogicalRequestID                    string                 `json:"logical_request_id"`
	ActualModel                         string                 `json:"actual_model"`
	Provider                            string                 `json:"provider"`
	Channel                             string                 `json:"channel"`
	Usage                               ACUUsage               `json:"usage"`
	JudgeCostUSD                        string                 `json:"judge_cost_usd"`
	ProviderCostUSD                     string                 `json:"provider_cost_usd"`
	FailedBilledCostUSD                 string                 `json:"failed_billed_cost_usd"`
	FinalUserCostUSD                    string                 `json:"final_user_cost_usd"`
	NominalProviderCostUSD              string                 `json:"nominal_provider_cost_usd"`
	ProviderBalanceCharge               string                 `json:"provider_balance_charge"`
	ProviderBalanceCurrency             string                 `json:"provider_balance_currency"`
	ProviderCreditCashCostCNY           string                 `json:"provider_credit_cash_cost_cny"`
	ProviderBalanceChargeUSD            string                 `json:"provider_balance_charge_usd,omitempty"`
	EffectiveProviderCashCostCNY        string                 `json:"effective_provider_cash_cost_cny"`
	JudgeCashCostCNY                    string                 `json:"judge_cash_cost_cny"`
	FailedAttemptCashCostCNY            string                 `json:"failed_attempt_cash_cost_cny"`
	ActualTotalCashCostCNY              string                 `json:"actual_total_cash_cost_cny"`
	UserChargeCNY                       string                 `json:"user_charge_cny"`
	CounterfactualQualityCeilingCostCNY string                 `json:"counterfactual_quality_ceiling_cost_cny,omitempty"`
	CostBreakdown                       map[string]interface{} `json:"cost_breakdown"`
	DisplaySummary                      string                 `json:"display_summary,omitempty"`
}

type ACUUsageFinalizeResponse struct {
	Status           string `json:"status"`
	AlreadyProcessed bool   `json:"already_processed"`
}
