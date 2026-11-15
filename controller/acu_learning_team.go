package controller

import (
	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
	"net/http"
)

func ResolveACULearningTeam(c *gin.Context) {
	var input struct {
		UserID  int `json:"userId"`
		TokenID int `json:"tokenId"`
	}
	if common.DecodeJson(c.Request.Body, &input) != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid team context"})
		return
	}
	team, err := service.ResolveACULearningTeam(input.UserID, input.TokenID)
	if err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "team unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"team": team})
}
