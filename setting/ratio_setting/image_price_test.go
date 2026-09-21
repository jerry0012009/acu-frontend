package ratio_setting

import (
	"testing"

	"github.com/QuantumNous/new-api/common"
)

func TestDefaultGPTImagePricesUseCNYSettlementConversion(t *testing.T) {
	models := []string{
		"gpt-image-1",
		"gpt-image-1-mini",
		"gpt-image-1.5",
		"gpt-image-1.5-2025-12-16",
		"gpt-image-2",
		"gpt-image-2-2026-04-21",
		"gpt-image-2.5-flare",
		"gpt-image-2.5-flare-2026-09-08",
		"gpt-image-2.5-sunburst",
		"gpt-image-2.5-sunburst-2026-09-08",
	}
	for _, model := range models {
		if got := defaultModelPrice[model]; got != common.ImageDefaultPriceUSD {
			t.Fatalf("%s price = %v, want %v", model, got, common.ImageDefaultPriceUSD)
		}
	}
}
