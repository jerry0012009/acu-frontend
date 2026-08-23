package model

import (
	"encoding/json"
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestACUUsageLogOtherIncludesCacheCreationTokens(t *testing.T) {
	input := ACUUsageChargeInput{
		ReportIdempotencyKey: "report-1",
		CachedInputTokens:    16530,
		ReasoningTokens:      0,
		UserChargeCny:        "10.1650995313",
		CostBreakdownJson:    `{"cache_creation_input_tokens":761793,"channel_attempts":[]}`,
	}

	other := acuUsageLogOther(input, false, "finalized", "")
	if got, ok := other["cache_creation_tokens"].(float64); !ok || got != 761793 {
		t.Fatalf("cache_creation_tokens = %#v, want 761793", other["cache_creation_tokens"])
	}

	var serialized map[string]interface{}
	if err := json.Unmarshal([]byte(common.MapToJsonStr(other)), &serialized); err != nil {
		t.Fatal(err)
	}
	if got, ok := serialized["cache_creation_tokens"].(float64); !ok || got != 761793 {
		t.Fatalf("serialized cache_creation_tokens = %#v, want 761793", serialized["cache_creation_tokens"])
	}
}
