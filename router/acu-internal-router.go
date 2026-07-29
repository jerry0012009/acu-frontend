package router

import (
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-gonic/gin"
)

func SetACUInternalRouter(router *gin.Engine) {
	internal := router.Group("/internal/acu")
	internal.Use(middleware.ACUInternalAuth())
	internal.GET("/status", controller.GetACUInternalStatus)
	internal.POST("/usage/finalize", controller.FinalizeACUUsage)
}
