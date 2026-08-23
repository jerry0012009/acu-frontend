package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetPrivateACUPrompts(c *gin.Context) {
	result, err := service.GetPrivateACUPrompts(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func SavePrivateACUPrompts(c *gin.Context) {
	var input dto.ACUPrivatePromptsRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.SavePrivateACUPrompts(c.Request.Context(), input, c.GetString("username"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func ResetPrivateACUPrompts(c *gin.Context) {
	result, err := service.ResetPrivateACUPrompts(c.Request.Context(), c.GetString("username"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACUMemory(c *gin.Context) {
	result, err := service.GetPrivateACUMemory(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}
