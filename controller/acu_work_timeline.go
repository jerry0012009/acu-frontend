package controller

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUWorkTimeline(c *gin.Context) {
	if scope := c.Query("scope"); scope != "" && scope != "all" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "scope must be all when provided"})
		return
	}
	allUsers := c.Query("scope") == "all"
	if allUsers && c.GetInt("role") < common.RoleAdminUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "permission denied"})
		return
	}
	if allUsers && c.Query("user_id") != "" {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "scope=all cannot be combined with user_id"})
		return
	}
	targetUserID := c.GetInt("id")
	if !allUsers {
		var ok bool
		targetUserID, ok = resolveACUTraceTargetUserID(c)
		if !ok {
			return
		}
	}
	now := time.Now().Unix()
	from, to, err := parseACUTimelineRange(c.Query("from"), c.Query("to"), now)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": err.Error()})
		return
	}
	isAdmin := c.GetInt("role") >= common.RoleAdminUser
	var timeline dto.ACUWorkTimeline
	if allUsers {
		if to-from > 24*3600 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "all-users time range must not exceed 24 hours"})
			return
		}
		timeline, err = service.GetAllUsersACUWorkTimelineAccurateTiming(from, to)
	} else {
		timeline, err = service.GetOwnedACUWorkTimelineAccurateTiming(targetUserID, from, to, isAdmin)
	}
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if !isAdmin {
		timeline = service.PublicACUWorkTimeline(timeline)
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
