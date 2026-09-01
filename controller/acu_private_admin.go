package controller

import (
	"net/http"
	"strconv"

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
	result, err := service.GetPrivateACUMemory(
		c.Request.Context(),
		c.Query("newapiUserId"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACUFilmStatus(c *gin.Context) {
	result, err := service.GetPrivateACUFilmStatus(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACUPOCAccess(c *gin.Context) {
	result, err := service.GetPrivateACUPOCAccess()
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func SavePrivateACUPOCAccess(c *gin.Context) {
	var input dto.ACUPrivatePOCAccess
	if err := c.ShouldBindJSON(&input); err != nil {
		common.ApiError(c, err)
		return
	}
	if err := service.SavePrivateACUPOCAccess(input); err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": input})
}

func GetPrivateACUUsage(c *gin.Context) {
	userID := c.Query("newapiUserId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "newapiUserId is required"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit <= 0 {
		limit = 100
	}
	result, err := service.GetPrivateACUUsage(c.Request.Context(), userID, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func GetPrivateACUExperiences(c *gin.Context) {
	userID := c.Query("newapiUserId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "newapiUserId is required"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 {
		limit = 50
	}
	result, err := service.GetPrivateACUExperiences(c.Request.Context(), userID, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}

func GetPrivateACUExperienceDetail(c *gin.Context) {
	userID := c.Query("newapiUserId")
	experienceID := c.Param("experienceId")
	if userID == "" || experienceID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "newapiUserId and experienceId are required"})
		return
	}
	result, err := service.GetPrivateACUExperienceDetail(
		c.Request.Context(),
		userID,
		experienceID,
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACULearningRuns(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "100"))
	if limit <= 0 {
		limit = 100
	}
	result, err := service.GetPrivateACULearningRuns(
		c.Request.Context(),
		limit,
		c.Query("learningKind"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACULearningRunDetail(c *gin.Context) {
	runID := c.Param("runId")
	if runID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "runId is required"})
		return
	}
	result, err := service.GetPrivateACULearningRunDetail(c.Request.Context(), runID)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": result})
}

func GetPrivateACULearningRunMedia(c *gin.Context) {
	content, contentType, disposition, err := service.GetPrivateACULearningRunMedia(
		c.Request.Context(),
		c.Param("runId"),
		c.Param("mediaId"),
	)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if contentType != "" {
		c.Header("Content-Type", contentType)
	}
	if disposition != "" {
		c.Header("Content-Disposition", disposition)
	}
	c.Data(http.StatusOK, contentType, content)
}

func GetPrivateACUAdvisorsByUserID(c *gin.Context) {
	userID := c.Query("newapiUserId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "newapiUserId is required"})
		return
	}
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 {
		limit = 50
	}
	result, err := service.GetPrivateACUAdvisorsByUserID(c.Request.Context(), userID, limit)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, result)
}
