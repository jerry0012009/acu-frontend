package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUWorkTimeline(c *gin.Context) {
	now := time.Now().Unix()
	from, to, err := parseACUTimelineRange(c.Query("from"), c.Query("to"), now)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	timeline, err := service.GetOwnedACUWorkTimeline(c.GetInt("id"), from, to)
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": timeline})
}

func parseACUTimelineRange(fromRaw, toRaw string, now int64) (int64, int64, error) {
	from := now - 3600
	to := now
	if fromRaw != "" {
		raw := fromRaw
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || value <= 0 {
			return 0, 0, fmt.Errorf("from must be a positive Unix timestamp")
		}
		from = value
	}
	if toRaw != "" {
		raw := toRaw
		value, err := strconv.ParseInt(raw, 10, 64)
		if err != nil || value <= 0 {
			return 0, 0, fmt.Errorf("to must be a positive Unix timestamp")
		}
		to = value
	}
	if from >= to {
		return 0, 0, fmt.Errorf("to must be greater than from")
	}
	if to > now {
		return 0, 0, fmt.Errorf("to must not be in the future")
	}
	if to-from > 7*24*3600 {
		return 0, 0, fmt.Errorf("time range must not exceed 7 days")
	}
	return from, to, nil
}
