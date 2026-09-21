package openai

import (
	"testing"

	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
)

func TestOpenAIImageResponseCountCountsPayloadEntriesOnce(t *testing.T) {
	body := []byte(`{
		"data": [
			{"b64_json": "a"},
			{"url": "https://example.test/b"},
			{"b64_json": "c", "url": "https://example.test/c"},
			{"b64_json": "", "url": ""}
		]
	}`)
	if got := openaiImageResponseCount(body); got != 3 {
		t.Fatalf("count = %d, want 3", got)
	}
}

func TestNormalizeOpenAIImageUsagePreservesImageOutputTokens(t *testing.T) {
	usage := &dto.Usage{
		InputTokens:  15,
		OutputTokens: 515,
		InputTokensDetails: &dto.InputTokenDetails{
			TextTokens: 15,
		},
		OutputTokensDetails: &dto.OutputTokenDetails{
			ImageTokens: 515,
		},
	}

	normalizeOpenAIUsage(usage)

	if usage.PromptTokens != 15 || usage.CompletionTokens != 515 || usage.TotalTokens != 530 {
		t.Fatalf("normalized totals = %d/%d/%d, want 15/515/530", usage.PromptTokens, usage.CompletionTokens, usage.TotalTokens)
	}
	if usage.CompletionTokenDetails.ImageTokens != 515 {
		t.Fatalf("image output tokens = %d, want 515", usage.CompletionTokenDetails.ImageTokens)
	}
}

func TestUpdateOpenAIImageCountRecordsMissingPayload(t *testing.T) {
	info := &relaycommon.RelayInfo{
		PriceData: types.PriceData{UsePrice: true},
	}
	info.PriceData.AddOtherRatio("n", 2)

	updateOpenAIImageCount(info, 0)

	if !info.ImageResponseCountObserved {
		t.Fatal("response count should be marked observed")
	}
	if info.ImageResponseCount != 0 {
		t.Fatalf("response count = %d, want 0", info.ImageResponseCount)
	}
	if got := info.PriceData.OtherRatios()["n"]; got != 2 {
		t.Fatalf("billing count = %v, want requested count 2", got)
	}
}
