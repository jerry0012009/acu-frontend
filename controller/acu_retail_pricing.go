package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACURetailPricing(c *gin.Context) {
	days, err := strconv.Atoi(c.DefaultQuery("days", "30"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.GetACURetailPricing(c.Request.Context(), days)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}

func PreviewACURetailPricing(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.PreviewACURetailPricing(c.Request.Context(), input, fmt.Sprintf("console-user:%d", c.GetInt("id")))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if input["publish"] == true || input["cancelVersion"] != nil {
		model.RecordOperationAuditLog(c.GetInt("id"), "Scheduled ACU retail price book", c.ClientIP(), "acu_retail.publish", result, auditOperatorInfo(c), nil)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
