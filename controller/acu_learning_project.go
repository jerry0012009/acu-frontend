package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func ResolveACULearningProject(c *gin.Context) {
	var input struct {
		UserID    int    `json:"userId"`
		TokenID   int    `json:"tokenId"`
		ProjectID string `json:"projectId"`
	}
	if common.DecodeJson(c.Request.Body, &input) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid project context"})
		return
	}
	project, err := service.ResolveACULearningProject(input.UserID, input.TokenID, input.ProjectID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "project unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"project": project})
}
