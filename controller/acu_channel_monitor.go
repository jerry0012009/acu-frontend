package controller

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUChannelMonitor(c *gin.Context) {
	result, err := service.GetACUChannelMonitor(
		c.Request.Context(),
		c.DefaultQuery("range", "24h"),
		c.DefaultQuery("supplyStrategy", "balanced"),
		c.DefaultQuery("scenario", "standard"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func PauseACUChannel(c *gin.Context) {
	var input dto.ACUChannelPauseRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.PauseACUChannel(c.Request.Context(), input, fmt.Sprintf("new-api-user:%d", c.GetInt("id")))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}
