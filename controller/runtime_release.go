package controller

import (
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetRuntimeRelease(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	release, err := service.GetLatestRuntimeRelease(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"success": false, "message": "Runtime release lookup unavailable"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "data": release})
}

func DownloadRuntime(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	platform := c.Param("platform")
	if platform != "windows" && platform != "mac-arm" && platform != "mac-intel" {
		c.Status(http.StatusNotFound)
		return
	}
	release, err := service.GetLatestRuntimeRelease(c.Request.Context())
	if err != nil || release.Downloads[platform] == "" {
		c.Redirect(http.StatusFound, service.RuntimeLatestReleaseURL)
		return
	}
	download := release.Downloads[platform]
	if c.Query("source") == "github" {
		download = strings.TrimPrefix(download, service.RuntimeDownloadProxy)
	}
	c.Redirect(http.StatusFound, download)
}
