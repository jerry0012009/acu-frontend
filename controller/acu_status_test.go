package controller

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestGetACUInternalStatusReturnsBuildMigrationAndJudgeIdentity(t *testing.T) {
	previousCommit, previousTime := common.BuildCommit, common.BuildTime
	previousBranch, previousSchema := common.BuildBranch, common.SchemaVersion
	common.BuildCommit = "commit-fixture"
	common.BuildTime = "2026-07-30T00:00:00Z"
	common.BuildBranch = "acu/alpha-rc1-validation"
	common.SchemaVersion = "acu_usage_finalize_rc22"
	t.Setenv("ACU_SCHEMA_VERSION", "0007_rc22_judge_cutover")
	t.Setenv("ACU_JUDGE_PRIMARY_MODEL", "mimo-v2.5-pro")
	t.Setenv("ACU_JUDGE_BACKUP_MODEL", "deepseek-v4-flash")
	t.Setenv("ACU_ROUTING_FORMULA_VERSION", "acu-routing-model-v0.3")
	t.Cleanup(func() {
		common.BuildCommit, common.BuildTime = previousCommit, previousTime
		common.BuildBranch, common.SchemaVersion = previousBranch, previousSchema
	})

	gin.SetMode(gin.TestMode)
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	GetACUInternalStatus(context)

	var response map[string]any
	require.NoError(t, json.Unmarshal(recorder.Body.Bytes(), &response))
	require.Equal(t, "commit-fixture", response["runningCommit"])
	require.Equal(t, "0007_rc22_judge_cutover", response["latestMigration"])
	require.Equal(t, "mimo-v2.5-pro", response["judgePrimaryModel"])
	require.Equal(t, "deepseek-v4-flash", response["judgeBackupModel"])
	require.Equal(t, "acu-routing-model-v0.3", response["routingFormulaVersion"])
}
