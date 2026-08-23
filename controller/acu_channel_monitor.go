package controller

import (
	"fmt"
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUChannelMonitor(c *gin.Context) {
	result, err := service.GetACUChannelMonitor(
		c.Request.Context(),
		c.DefaultQuery("range", "24h"),
		c.DefaultQuery("supplyStrategy", "balanced"),
		c.DefaultQuery("scenario", "standard"),
		c.DefaultQuery("probeRange", "48h"),
		c.DefaultQuery("protocol", "responses"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetACURoutingCatalog(c *gin.Context) {
	result, err := service.GetACURoutingCatalog(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetACUTokenProfileRouting(c *gin.Context) {
	tokenID, err := strconv.Atoi(c.Param("id"))
	if err != nil || tokenID <= 0 {
		common.ApiError(c, fmt.Errorf("invalid API key ID"))
		return
	}
	result, err := service.GetACUTokenProfileRoutingScope(
		c.Request.Context(),
		c.GetInt("id"),
		tokenID,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func UpdateACUTokenProfileRouting(c *gin.Context) {
	tokenID, err := strconv.Atoi(c.Param("id"))
	if err != nil || tokenID <= 0 {
		common.ApiError(c, fmt.Errorf("invalid API key ID"))
		return
	}
	var input dto.ACUTokenProfileRoutingUpdate
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.UpdateACUTokenProfileRouting(
		c.Request.Context(),
		c.GetInt("id"),
		tokenID,
		input,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func UpdateACUProfilePublicNote(c *gin.Context) {
	var input dto.ACUProfilePublicNoteUpdate
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.UpdateACUProfilePublicNote(c.Request.Context(), input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	model.RecordOperationAuditLog(
		c.GetInt("id"),
		"Updated ACU Profile public note",
		c.ClientIP(),
		"acu_profile_public_note.update",
		map[string]interface{}{
			"execution_profile_id": input.ExecutionProfileID,
			"note_length":          len(result.Note),
		},
		auditOperatorInfo(c),
		nil,
	)
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

func GetACUExecutionProfiles(c *gin.Context) {
	result, err := service.GetACUExecutionProfiles(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func CreateACUExecutionProfile(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.CreateACUExecutionProfile(c.Request.Context(), input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func UpdateACUExecutionProfile(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.UpdateACUExecutionProfile(c.Request.Context(), c.Param("id"), input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func ProbeACUExecutionProfile(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.ProbeACUExecutionProfile(c.Request.Context(), input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func ReconcileACUExecutionProfileEconomics(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.ReconcileACUExecutionProfileEconomics(
		c.Request.Context(),
		c.Param("id"),
		input,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func ApplyACUExecutionProfiles(c *gin.Context) {
	result, err := service.ApplyACUExecutionProfiles(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, gin.H{"success": true, "message": "", "data": result})
}

func QuickAddACUProviderDiscover(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.QuickAddACUProviderDiscover(c.Request.Context(), input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func QuickAddACUProviderProbe(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.QuickAddACUProviderProbe(c.Request.Context(), input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func QuickAddACUProviderSave(c *gin.Context) {
	var input map[string]interface{}
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.QuickAddACUProviderSave(c.Request.Context(), input)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}
