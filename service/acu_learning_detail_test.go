package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestLearningDetailSummaryKeepsChangesWithoutShippingRawContextAndAllSnapshots(t *testing.T) {
	original := dto.ACUPrivateLearningRunDetail{
		Evidence:     map[string]interface{}{"agentContext": strings.Repeat("x", 100000), "feedbackReason": "Please verify", "latestUserFeedback": "Use real data"},
		SkillsBefore: []dto.ACUPrivateMemorySkill{{ID: "before"}},
		SkillsAfter:  []dto.ACUPrivateMemorySkill{{ID: "after"}},
		Distillation: map[string]interface{}{"distilled_context": "Prefer verification"},
		SkillChanges: []map[string]interface{}{{"skillId": "changed", "files": []interface{}{map[string]interface{}{"before": "old", "after": "new", "diff": "-old\n+new"}}}},
	}
	original.RunID = "run-42"
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		require.Equal(t, "/internal/admin/private-acu/learning-runs/run-42", r.URL.Path)
		body, err := common.Marshal(map[string]interface{}{"run": original})
		require.NoError(t, err)
		_, _ = w.Write(body)
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	summary, err := GetPrivateACULearningRunSummary(context.Background(), "run-42")
	require.NoError(t, err)
	require.NotContains(t, summary.Evidence, "agentContext")
	require.Equal(t, "Use real data", summary.Evidence["latestUserFeedback"])
	require.Empty(t, summary.SkillsBefore)
	require.Empty(t, summary.SkillsAfter)
	require.Equal(t, original.SkillChanges, summary.SkillChanges)
	require.Equal(t, original.Distillation, summary.Distillation)
	full, err := GetPrivateACULearningRunDetail(context.Background(), "run-42")
	require.NoError(t, err)
	require.Equal(t, original.Evidence, full.Evidence)
	require.Len(t, full.SkillsBefore, 1)
	require.Len(t, full.SkillsAfter, 1)
}
