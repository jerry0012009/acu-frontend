package controller

import (
	"net/http"

	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

func GetACUModelProbeSummary(c *gin.Context) {
	summary, err := service.GetACUModelProbeSummary(c.Request.Context())
	if err != nil {
		c.Header("Cache-Control", "no-store")
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Model probe summary temporarily unavailable"})
		return
	}
	delete(summary.Models, hiddenPublicPricingModel)
	c.Header("Cache-Control", "private, max-age=60")
	c.JSON(http.StatusOK, gin.H{"success": true, "data": summary})
}
