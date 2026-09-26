package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func GetACUGlobalRoutingPolicy(c *gin.Context) {
	policy, err := service.GetACUGlobalRoutingScope()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": policy})
}

func UpdateACUGlobalRoutingPolicy(c *gin.Context) {
	var policy service.ACURoutingScope
	if err := common.DecodeJson(c.Request.Body, &policy); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid ACU routing policy"})
		return
	}
	normalized, err := service.NormalizeACURoutingScope(policy)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	normalized, err = service.ApplyACUGlobalRoutingScope(
		c.Request.Context(),
		normalized,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordOperationAuditLog(c.GetInt("id"), "Updated ACU global routing policy", c.ClientIP(), "acu_routing_policy.update", map[string]interface{}{"model_count": len(normalized.AllowedModelIDs)}, auditOperatorInfo(c), nil)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": normalized})
}

func UpdateACUGlobalProfileRouting(c *gin.Context) {
	var input struct {
		ExecutionProfileID string `json:"executionProfileId"`
		Enabled            bool   `json:"enabled"`
	}
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid ACU Profile routing update"})
		return
	}
	policy, err := service.UpdateACUGlobalProfileRouting(
		c.Request.Context(),
		input.ExecutionProfileID,
		input.Enabled,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordOperationAuditLog(
		c.GetInt("id"),
		"Updated ACU global Profile routing",
		c.ClientIP(),
		"acu_profile_routing.update",
		map[string]interface{}{
			"execution_profile_id": input.ExecutionProfileID,
			"enabled":              input.Enabled,
		},
		auditOperatorInfo(c),
		nil,
	)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": policy})
}

func GetACURoutingUtilityConfig(c *gin.Context) {
	config, err := service.GetACURoutingUtilityConfig()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": config})
}

func UpdateACURoutingUtilityConfig(c *gin.Context) {
	var config service.ACURoutingUtilityConfig
	if err := common.DecodeJson(c.Request.Body, &config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "invalid ACU routing utility config"})
		return
	}
	normalized, err := service.NormalizeACURoutingUtilityConfig(config)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	if err := service.ValidateACUCandidatePolicyAgainstPool(c.Request.Context(), nil, normalized.DefaultCandidatePreferenceScores); err != nil {
		common.ApiError(c, err)
		return
	}
	raw, err := common.Marshal(normalized)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOptionsBulk(map[string]string{
		"ACURoutingUtilityConfig": string(raw),
	}); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordOperationAuditLog(c.GetInt("id"), "Updated ACU routing utility config", c.ClientIP(), "acu_routing_utility.update", map[string]interface{}{
		"formula_mode":                       normalized.FormulaMode,
		"schema_version":                     normalized.SchemaVersion,
		"default_candidate_preference_count": len(normalized.DefaultCandidatePreferenceScores),
	}, auditOperatorInfo(c), nil)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": normalized})
}
