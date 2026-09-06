package router

import (
	"embed"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/controller"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/gin-contrib/gzip"
	"github.com/gin-contrib/static"
	"github.com/gin-gonic/gin"
)

// WebAssets holds the embedded dashboard frontend assets.
type WebAssets struct {
	BuildFS   embed.FS
	IndexPage []byte
}

func SetWebRouter(router *gin.Engine, assets WebAssets) {
	frontendFS := common.EmbedFolder(assets.BuildFS, "web/dist")
	commercialIndex, err := assets.BuildFS.ReadFile("web/dist/acu-index-site/index.html")
	if err != nil {
		panic(err)
	}

	router.Use(gzip.Gzip(gzip.DefaultCompression))
	router.Use(middleware.GlobalWebRateLimit())
	router.Use(middleware.Cache())
	serveCommercialIndex := func(c *gin.Context) {
		c.Header("Cache-Control", "no-cache")
		if c.Request.Method == http.MethodHead {
			c.Status(http.StatusOK)
			return
		}
		c.Data(http.StatusOK, "text/html; charset=utf-8", commercialIndex)
	}
	for _, path := range []string{"/index", "/index/"} {
		router.GET(path, serveCommercialIndex)
		router.HEAD(path, serveCommercialIndex)
	}
	router.Use(static.Serve("/", frontendFS))
	router.NoRoute(webFallbackHandler(assets.IndexPage))
}

func webFallbackHandler(indexPage []byte) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set(middleware.RouteTagKey, "web")
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/v1") ||
			strings.HasPrefix(path, "/api") ||
			strings.HasPrefix(path, "/assets") ||
			path == "/static" ||
			strings.HasPrefix(path, "/static/") {
			c.Header("Cache-Control", "no-store")
			controller.RelayNotFound(c)
			return
		}
		c.Header("Cache-Control", "no-cache")
		c.Data(http.StatusOK, "text/html; charset=utf-8", indexPage)
	}
}
