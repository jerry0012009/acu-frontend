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
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
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

func TestObservedImageOutputChargesWithoutSyntheticTokens(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
	for _, count := range []int{0, 1, 2, dto.MaxImageN + 1} {
		info := &relaycommon.RelayInfo{
			OriginModelName:            "grok-imagine-image",
			StartTime:                  time.Now(),
			ImageResponseCountObserved: true,
			ImageResponseCount:         count,
			PriceData:                  types.PriceData{UsePrice: true, ModelPrice: 0.001, GroupRatioInfo: types.GroupRatioInfo{GroupRatio: 1}},
		}
		if count > 0 && count <= dto.MaxImageN {
			info.PriceData.AddOtherRatio("n", float64(count))
		}
		summary := calculateTextQuotaSummary(ctx, info, &dto.Usage{})
		if count > 0 && count <= dto.MaxImageN {
			require.True(t, summary.hasBillableUsage())
			assert.Equal(t, common.QuotaRound(0.001*common.QuotaPerUnit*float64(count)), summary.Quota)
		} else {
			assert.False(t, summary.hasBillableUsage())
			assert.Zero(t, summary.Quota)
		}
		assert.Zero(t, summary.TotalTokens)
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
