package service

import (
	"math"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/setting/operation_setting"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func TestImageFixedPriceSettlementUsesActualCount(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		OriginModelName: "gpt-image-2.5-flare",
		StartTime:       time.Now(),
		PriceData: types.PriceData{
			UsePrice:       true,
			ModelPrice:     common.ImageDefaultPriceUSD,
			GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
		},
	}
	info.PriceData.AddOtherRatio("n", 2)

	summary := calculateTextQuotaSummary(ctx, info, &dto.Usage{
		PromptTokens:     15,
		CompletionTokens: 515,
		TotalTokens:      530,
	})

	want := common.QuotaRound(common.ImageDefaultPriceUSD * common.QuotaPerUnit * 2)
	if summary.Quota != want {
		t.Fatalf("quota = %d, want %d", summary.Quota, want)
	}
}

func TestImageFallbackChargesWithoutUsage(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		OriginModelName:      "gpt-image-2.5-flare",
		StartTime:            time.Now(),
		ImageBillingFallback: true,
		PriceData: types.PriceData{
			UsePrice:       true,
			ModelPrice:     common.ImageFallbackPriceUSD,
			GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
		},
	}
	info.PriceData.AddOtherRatio("n", 2)

	summary := calculateTextQuotaSummary(ctx, info, &dto.Usage{})

	want := common.QuotaRound(common.ImageFallbackPriceUSD * common.QuotaPerUnit * 2)
	if summary.Quota != want {
		t.Fatalf("quota = %d, want %d", summary.Quota, want)
	}
	if !summary.hasBillableUsage() {
		t.Fatal("fallback image response must remain billable without token usage")
	}
}

func TestImageBillingLogShowsEffectiveCNYMultiplier(t *testing.T) {
	originalFX := operation_setting.USDExchangeRate
	operation_setting.USDExchangeRate = common.ImageBillingFXCNYPerUSD
	t.Cleanup(func() {
		operation_setting.USDExchangeRate = originalFX
	})

	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	now := time.Now()
	info := &relaycommon.RelayInfo{
		OriginModelName:   "gpt-image-2.5-flare",
		StartTime:         now,
		FirstResponseTime: now,
		ChannelMeta:       &relaycommon.ChannelMeta{},
		PriceData: types.PriceData{
			UsePrice:       true,
			ModelPrice:     common.ImageDefaultPriceUSD,
			GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1},
		},
	}
	info.PriceData.AddOtherRatio("n", 2)

	other := GenerateTextOtherInfo(ctx, info, 0, 1, 0, 0, 0, common.ImageDefaultPriceUSD, -1)

	multiplier, ok := other["image_public_multiplier"].(float64)
	if !ok || math.Abs(multiplier-common.ImagePublicMultiplier) > 1e-12 {
		t.Fatalf("public multiplier = %v, want %v", other["image_public_multiplier"], common.ImagePublicMultiplier)
	}
	if got := other["image_count"]; got != float64(2) {
		t.Fatalf("image count = %v, want 2", got)
	}
	if got := other["image_settlement_fx_cny_per_usd"]; got != common.ImageBillingFXCNYPerUSD {
		t.Fatalf("settlement FX = %v, want %v", got, common.ImageBillingFXCNYPerUSD)
	}
}
