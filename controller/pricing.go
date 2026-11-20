package controller

import (
	"slices"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/setting/ratio_setting"

	"github.com/gin-gonic/gin"
)

const hiddenPublicPricingModel = "gemini-4-carbon"

func filterPricingByUsableGroups(pricing []model.Pricing, usableGroup map[string]string) []model.Pricing {
	if len(pricing) == 0 {
		return pricing
	}
	if len(usableGroup) == 0 {
		return []model.Pricing{}
	}

	filtered := make([]model.Pricing, 0, len(pricing))
	for _, item := range pricing {
		if common.StringsContains(item.EnableGroup, "all") {
			filtered = append(filtered, item)
			continue
		}
		for _, group := range item.EnableGroup {
			if _, ok := usableGroup[group]; ok {
				filtered = append(filtered, item)
				break
			}
		}
	}
	return filtered
}

func GetPricing(c *gin.Context) {
	pricing := model.GetPricing()
	acuCatalog, acuCatalogErr := loadACUPricingCatalog(c.Request.Context())
	if acuCatalogErr != nil {
		c.JSON(503, gin.H{"success": false, "message": "Published model prices are temporarily unavailable"})
		return
	}
	if acuCatalog != nil {
		pricing = overlayACUPricing(acuCatalog, pricing)
		// Only suppress public display; other consumers still use the full catalog.
		acuCatalog.CurveModelStatuses = slices.DeleteFunc(acuCatalog.CurveModelStatuses, func(item acuCurveModelStatus) bool {
			return item.ModelID == hiddenPublicPricingModel
		})
	}
	pricing = slices.DeleteFunc(slices.Clone(pricing), func(item model.Pricing) bool {
		return item.ModelName == hiddenPublicPricingModel
	})
	userId, exists := c.Get("id")
	usableGroup := map[string]string{}
	groupRatio := map[string]float64{}
	for s, f := range ratio_setting.GetGroupRatioCopy() {
		groupRatio[s] = f
	}
	var group string
	if exists {
		user, err := model.GetUserCache(userId.(int))
		if err == nil {
			group = user.Group
			for g := range groupRatio {
				ratio, ok := ratio_setting.GetGroupGroupRatio(group, g)
				if ok {
					groupRatio[g] = ratio
				}
			}
		}
	}

	usableGroup = service.GetUserUsableGroups(group)
	pricing = filterPricingByUsableGroups(pricing, usableGroup)
	if c.Query("view") == "runtime" {
		// The desktop table does not need quality curves or per-protocol duplicates.
		type runtimePrice struct {
			ModelName      string                  `json:"model_name"`
			DisplayName    string                  `json:"display_name,omitempty"`
			Payable        *model.PricingPayable   `json:"payable,omitempty"`
			Reference      *model.PricingReference `json:"reference,omitempty"`
			PricingVersion string                  `json:"pricing_version,omitempty"`
		}
		rows := make([]runtimePrice, 0, len(pricing))
		for _, item := range pricing {
			rows = append(rows, runtimePrice{item.ModelName, item.DisplayName, item.Payable, item.Reference, item.PricingVersion})
		}
		c.JSON(200, gin.H{"success": true, "data": rows})
		return
	}
	// check groupRatio contains usableGroup
	for group := range ratio_setting.GetGroupRatioCopy() {
		if _, ok := usableGroup[group]; !ok {
			delete(groupRatio, group)
		}
	}

	acuCatalogVersion := ""
	if acuCatalog != nil {
		acuCatalogVersion = acuCatalog.SourceCatalogVersion
	}
	c.JSON(200, gin.H{
		"success":             true,
		"data":                pricing,
		"vendors":             model.GetVendors(),
		"group_ratio":         groupRatio,
		"usable_group":        usableGroup,
		"supported_endpoint":  model.GetSupportedEndpointMap(),
		"auto_groups":         service.GetUserAutoGroup(group),
		"pricing_version":     "a42d372ccf0b5dd13ecf71203521f9d2",
		"acu_catalog_version": acuCatalogVersion,
		"acu_catalog_error":   "",
		"acu_pricing_display_mode": func() string {
			if acuCatalog == nil || acuCatalog.DisplayMode == "" {
				return "comparison"
			}
			return acuCatalog.DisplayMode
		}(),
		"acu_curve_model_statuses": sortedCurveStatuses(acuCatalog),
		"acu_curve_status_counts":  acuCurveStatusCounts(acuCatalog),
	})
}

func GetACUSelectionCorridor(c *gin.Context) {
	inputTokens, _ := strconv.Atoi(c.DefaultQuery("input_tokens", "100000"))
	expectedOutputTokens, _ := strconv.Atoi(c.DefaultQuery("output_tokens", "4000"))
	protocol := c.DefaultQuery("protocol", "responses")
	if protocol != "responses" && protocol != "messages" && protocol != "chat_completions" && protocol != "gemini" {
		c.JSON(400, gin.H{"success": false, "message": "invalid protocol"})
		return
	}
	policy, err := service.ResolveACUEffectiveRoutingPolicy(nil)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	result, err := service.GetACUSelectionCorridor(c.Request.Context(), inputTokens, expectedOutputTokens, &policy, protocol)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.PublicACUPricingCorridor(result); err != nil {
		common.ApiError(c, err)
		return
	}
	if prices, ok := result["pricing"].(map[string]interface{}); ok {
		delete(prices, hiddenPublicPricingModel)
	}
	c.JSON(200, gin.H{"success": true, "data": result})
}

func GetACUTokenSelectionCorridor(c *gin.Context) {
	inputTokens, _ := strconv.Atoi(c.DefaultQuery("input_tokens", "100000"))
	expectedOutputTokens, _ := strconv.Atoi(c.DefaultQuery("output_tokens", "4000"))
	protocol := c.DefaultQuery("protocol", "responses")
	if protocol != "responses" && protocol != "messages" && protocol != "chat_completions" && protocol != "gemini" {
		c.JSON(400, gin.H{"success": false, "message": "invalid protocol"})
		return
	}
	tokenID, err := strconv.Atoi(c.Param("tokenId"))
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": "invalid token id"})
		return
	}
	token, err := model.GetTokenByIds(tokenID, c.GetInt("id"))
	if err != nil || token == nil {
		c.JSON(404, gin.H{"success": false, "message": "token not found"})
		return
	}
	if token.Status != common.TokenStatusEnabled {
		c.JSON(400, gin.H{"success": false, "message": "token is not enabled"})
		return
	}
	policy, err := service.ResolveACUEffectiveRoutingPolicy(token)
	if err != nil {
		c.JSON(400, gin.H{"success": false, "message": err.Error()})
		return
	}
	result, err := service.GetACUSelectionCorridor(c.Request.Context(), inputTokens, expectedOutputTokens, &policy, protocol)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.PublicACUPricingCorridor(result); err != nil {
		common.ApiError(c, err)
		return
	}
	if prices, ok := result["pricing"].(map[string]interface{}); ok {
		delete(prices, hiddenPublicPricingModel)
	}
	c.JSON(200, gin.H{"success": true, "data": result, "token_id": token.Id, "routing_preference": policy.RoutingPreference})
}

func ResetModelRatio(c *gin.Context) {
	defaultStr := ratio_setting.DefaultModelRatio2JSONString()
	err := model.UpdateOption("ModelRatio", defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	err = ratio_setting.UpdateModelRatioByJSONString(defaultStr)
	if err != nil {
		c.JSON(200, gin.H{
			"success": false,
			"message": err.Error(),
		})
		return
	}
	c.JSON(200, gin.H{
		"success": true,
		"message": "重置模型倍率成功",
	})
}
