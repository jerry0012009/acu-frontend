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
	if err := service.ValidateACURoutingScopeAgainstPool(c.Request.Context(), normalized); err != nil {
		common.ApiError(c, err)
		return
	}
	raw, err := common.Marshal(normalized)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if err := model.UpdateOption("ACUGlobalRoutingPolicy", string(raw)); err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordOperationAuditLog(c.GetInt("id"), "Updated ACU global routing policy", c.ClientIP(), "acu_routing_policy.update", map[string]interface{}{"model_count": len(normalized.AllowedModelIDs), "profile_count": len(normalized.AllowedProfileIDs)}, auditOperatorInfo(c), nil)
	c.JSON(http.StatusOK, gin.H{"success": true, "data": normalized})
}
