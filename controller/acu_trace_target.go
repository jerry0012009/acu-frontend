package controller

import (
	"net/http"
	"strconv"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
)

func resolveACUTraceTargetUserID(c *gin.Context) (int, bool) {
	currentUserID := c.GetInt("id")
	rawTargetUserID := c.Query("user_id")
	if rawTargetUserID == "" {
		return currentUserID, true
	}

	targetUserID, err := strconv.Atoi(rawTargetUserID)
	if err != nil || targetUserID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "user_id must be a positive integer"})
		return 0, false
	}
	if targetUserID == currentUserID {
		return currentUserID, true
	}
	if c.GetInt("role") < common.RoleAdminUser {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "permission denied"})
		return 0, false
	}

	targetUser, err := model.GetUserById(targetUserID, false)
	if err != nil || !canManageTargetRole(c.GetInt("role"), targetUser.Role) {
		c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "permission denied"})
		return 0, false
	}
	return targetUserID, true
}
