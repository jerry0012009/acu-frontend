package controller

import (
	"testing"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResolveTextPriceDataSkipsStaticPricingForACUChannel(t *testing.T) {
	gin.SetMode(gin.TestMode)
	ctx, _ := gin.CreateTestContext(nil)
	info := &relaycommon.RelayInfo{
		IsACUChannel:    true,
		OriginModelName: "acu-auto-not-in-new-api-price-table",
	}

	priceData, err := resolveTextPriceData(ctx, info, 1234, &types.TokenCountMeta{MaxTokens: 512})

	require.NoError(t, err)
	require.True(t, priceData.FreeModel)
	require.Equal(t, priceData, info.PriceData)
}
