package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func FinalizeACUUsage(c *gin.Context) {
	var request dto.ACUUsageFinalizeRequest
	if err := common.DecodeJson(c.Request.Body, &request); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ACU usage report"})
		return
	}
	response, err := service.FinalizeACUUsage(request, c.GetString(middleware.ACUFinalizePayloadHashKey))
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, response)
}
