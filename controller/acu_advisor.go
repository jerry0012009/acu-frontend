package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetPrivateACUAdvisors(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 {
		limit = 20
	}
	result, err := service.GetPrivateACUAdvisors(c.Request.Context(), c.GetInt("id"), limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACUMemoryForUser(c *gin.Context) {
	result, err := service.GetPrivateACUMemoryForUser(c.Request.Context(), c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACUFilmForUser(c *gin.Context) {
	result, err := service.GetPrivateACUFilmMemberView(c.Request.Context(), c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if len(result.Spaces) == 0 {
		c.JSON(http.StatusForbidden, gin.H{
			"success": false,
			"message": "Private ACU film access is not configured for this user",
		})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func UpdatePrivateACUAdvisorFeedback(c *gin.Context) {
	var input dto.ACUAdvisorFeedbackRequest
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.UpdatePrivateACUAdvisorFeedback(
		c.Request.Context(),
		c.GetInt("id"),
		c.Param("advisor_id"),
		input.Feedback,
	); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"updated": true}})
}

func GetPrivateACUAdvisorNotifications(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	result, err := service.ListPrivateACUAdvisorNotifications(c.Request.Context(), c.GetInt("id"), limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func MarkPrivateACUAdvisorNotificationRead(c *gin.Context) {
	if err := service.MarkPrivateACUAdvisorNotificationRead(
		c.Request.Context(), c.GetInt("id"), c.Param("advisor_id"),
	); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"updated": true}})
}

func MarkAllPrivateACUAdvisorNotificationsRead(c *gin.Context) {
	if err := service.MarkAllPrivateACUAdvisorNotificationsRead(c.Request.Context(), c.GetInt("id")); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": gin.H{"updated": true}})
}

func GetPrivateACUAdvisorNotificationPreferences(c *gin.Context) {
	result, err := service.GetPrivateACUAdvisorNotificationPreferences(c.Request.Context(), c.GetInt("id"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func UpdatePrivateACUAdvisorNotificationPreferences(c *gin.Context) {
	var input dto.ACUAdvisorNotificationPreferences
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	result, err := service.UpdatePrivateACUAdvisorNotificationPreferences(
		c.Request.Context(), c.GetInt("id"), input,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func ReceivePrivateACUAdvisorEvent(c *gin.Context) {
	var input dto.ACUAdvisorNotificationEvent
	if err := common.DecodeJson(c.Request.Body, &input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid ACU Advisor event"})
		return
	}
	if err := service.ReceivePrivateACUAdvisorEvent(c.Request.Context(), input); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"status": "acknowledged"})
}
