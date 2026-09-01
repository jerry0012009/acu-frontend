package controller

import (
	"net/http"
	"os"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/service"
	"github.com/gin-gonic/gin"
)

func GetACUInternalStatus(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{
		"runningCommit":         common.BuildCommit,
		"buildTime":             common.BuildTime,
		"buildBranch":           common.BuildBranch,
		"schemaVersion":         common.SchemaVersion,
		"latestMigration":       os.Getenv("ACU_SCHEMA_VERSION"),
		"judgePrimaryModel":     os.Getenv("ACU_JUDGE_PRIMARY_MODEL"),
		"judgeBackupModel":      os.Getenv("ACU_JUDGE_BACKUP_MODEL"),
		"routingFormulaVersion": os.Getenv("ACU_ROUTING_FORMULA_VERSION"),
	})
}

func GetACUFullPoolProbeScope(c *gin.Context) {
	profileIDs, err := service.CurrentGlobalACUProfileIDs(c.Request.Context())
	if err != nil {
		common.ApiError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"profileIds": profileIDs})
}
