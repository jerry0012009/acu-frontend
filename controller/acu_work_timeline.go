package controller

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUWorkTimeline(c *gin.Context) {
	now := time.Now().Unix()
	from := now - 3600
	to := now
	if value, err := strconv.ParseInt(c.Query("from"), 10, 64); err == nil && value > 0 {
		from = value
	}
	if value, err := strconv.ParseInt(c.Query("to"), 10, 64); err == nil && value > 0 {
		to = value
	}
	if from > to || to-from > 24*3600 {
		common.ApiError(c, errors.New("invalid time range"))
		return
	}
	timeline, err := service.GetOwnedACUWorkTimeline(c.GetInt("id"), from, to)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": timeline})
}
