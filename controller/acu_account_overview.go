package controller

import (
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func GetACUAccountOverview(c *gin.Context) {
	userID := c.GetInt("id")
	if userID <= 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "authentication required"})
		return
	}
	days, _ := strconv.Atoi(c.Query("days"))
	if days != 1 && days != 7 && days != 30 {
		days = 7
	}
	now := time.Now().Unix()
	result, err := model.GetACUAccountOverview(c.Request.Context(), userID, now-int64(days)*86400, now)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": result})
}
