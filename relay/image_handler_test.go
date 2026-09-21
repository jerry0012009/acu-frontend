package relay

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

func TestImageBillingPrices(t *testing.T) {
	normalCNY := common.ImageDefaultPriceUSD * common.ImageBillingFXCNYPerUSD
	if normalCNY != 0.201*common.ImagePublicMultiplier {
		t.Fatalf("normal image price = %v CNY, want %v", normalCNY, 0.201*common.ImagePublicMultiplier)
	}
	fallbackCNY := common.ImageFallbackPriceUSD * common.ImageBillingFXCNYPerUSD
	if fallbackCNY != 0.075 {
		t.Fatalf("fallback image price = %v CNY, want 0.075", fallbackCNY)
	}
}

func TestHasCompleteGPTImageUsage(t *testing.T) {
	complete := &dto.Usage{
		PromptTokens:     15,
		CompletionTokens: 515,
		TotalTokens:      530,
		CompletionTokenDetails: dto.OutputTokenDetails{
			ImageTokens: 515,
		},
	}
	if !hasCompleteGPTImageUsage(complete) {
		t.Fatal("complete image usage should be accepted")
	}

	incomplete := *complete
	incomplete.CompletionTokenDetails.ImageTokens = 0
	if hasCompleteGPTImageUsage(&incomplete) {
		t.Fatal("usage without image output token detail should use fallback")
	}
}
