package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUSessionTrace(c *gin.Context) {
	targetUserID, ok := resolveACUTraceTargetUserID(c)
	if !ok {
		return
	}
	trace, err := service.GetOwnedACUSessionTrace(c.Request.Context(), targetUserID, c.Param("identifier"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	if c.GetInt("role") < common.RoleAdminUser {
		trace = service.PublicACUSessionTrace(trace)
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": trace})
}
