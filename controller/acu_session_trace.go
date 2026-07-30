package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUSessionTrace(c *gin.Context) {
	trace, err := service.GetOwnedACUSessionTrace(c.Request.Context(), c.GetInt("id"), c.Param("identifier"))
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "message": "", "data": trace})
}
