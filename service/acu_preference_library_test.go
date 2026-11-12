package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPreferenceLibraryReturnsOnlyReadableRedactedDescriptions(t *testing.T) {
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "42", r.URL.Query().Get("newapiUserId"))
		_, _ = w.Write([]byte(`{"memory":{"skills":[{"id":"one","name":"internal-slug","description":"Prefer scoped changes; token=secret-value","files":[{"content":"raw conversation"}]},{"id":"empty","description":""}],"internalPrompts":[{"content":"private prompt"}]}}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test")
	result, err := GetPrivateACUPreferenceLibrary(context.Background(), 42)
	require.NoError(t, err)
	assert.Equal(t, []dto.ACUPreferenceRecord{{ID: "one", Summary: "Prefer scoped changes; [redacted]"}}, result.Records)
	encoded, err := common.Marshal(result)
	require.NoError(t, err)
	assert.NotContains(t, string(encoded), "raw conversation")
	assert.NotContains(t, string(encoded), "internal-slug")
	assert.Empty(t, preferenceRecordText(strings.Repeat("a", 401)))
	assert.Empty(t, preferenceRecordText("audit\nwith multiple lines"))
	_, err = GetPrivateACUPreferenceLibrary(context.Background(), 0)
	require.Error(t, err)
}

func TestPreferenceChangesRequireCompletedReadableSummaryDifferences(t *testing.T) {
	detail := dto.ACUPrivateLearningRunSelfDetail{
		RunID: "run", LearningKind: "explicit_user_preference", Status: "completed", CompletedAt: "2026-11-12T12:00:00Z",
		SkillChanges: []map[string]interface{}{
			{"skillId": "new", "changeType": "created", "descriptionAfter": "Conclusions first"},
			{"skillId": "changed", "changeType": "updated", "descriptionBefore": "Keep changes small", "descriptionAfter": "Keep maintenance changes small"},
			{"skillId": "same", "changeType": "updated", "descriptionBefore": "Same summary", "descriptionAfter": "Same summary", "files": "changed evidence"},
			{"skillId": "hidden", "changeType": "updated", "descriptionBefore": "token=old-secret", "descriptionAfter": "token=new-secret"},
			{"skillId": "missing", "changeType": "updated", "descriptionAfter": "Not enough for a comparison"},
			{"skillId": "removed", "changeType": "deleted", "descriptionBefore": "Old preference"},
		},
	}
	event := preferenceChangeEvent(detail)
	require.Len(t, event.Changes, 3)
	assert.Equal(t, "new", event.Changes[0].PreferenceID)
	assert.Equal(t, "Keep changes small", event.Changes[1].Before)
	assert.Equal(t, "removed", event.Changes[2].PreferenceID)
	assert.Empty(t, event.Changes[2].After)
	detail.Status = "failed"
	assert.Empty(t, preferenceChangeEvent(detail).Changes)
	detail.Status, detail.CompletedAt = "completed", ""
	assert.Empty(t, preferenceChangeEvent(detail).Changes)
}

func TestRuleChangeIsVisibleEvenWhenDescriptionIsUnchanged(t *testing.T) {
	detail := dto.ACUPrivateLearningRunSelfDetail{RunID: "run", Status: "completed", CompletedAt: "2026-11-12T12:00:00Z", SkillChanges: []map[string]interface{}{{"skillId": "one", "changeType": "updated", "descriptionBefore": "Keep concise", "descriptionAfter": "Keep concise", "ruleChangeSummary": "Technical reports retain evidence in an appendix."}}}
	event := preferenceChangeEvent(detail)
	require.Len(t, event.Changes, 1)
	assert.Equal(t, "rule_updated", event.Changes[0].Kind)
	assert.Equal(t, "Technical reports retain evidence in an appendix.", event.Changes[0].After)
}

func TestPreferenceControlsBindOwnerAndDoNotForwardClientIdentity(t *testing.T) {
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "42", r.URL.Query().Get("newapiUserId"))
		assert.Equal(t, "record", r.URL.Query().Get("skillId"))
		assert.Equal(t, http.MethodPut, r.Method)
		_, _ = w.Write([]byte(`{"updated":true}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test")
	result, err := PrivateACUPreferenceControls(context.Background(), 42, "record", map[string]interface{}{"action": "disable", "expected_hash": strings.Repeat("a", 64)})
	require.NoError(t, err)
	assert.Equal(t, true, result["updated"])
}

func TestPreferenceActivityFiltersOtherScopesAndDoesNotHidePartialFailure(t *testing.T) {
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/internal/admin/private-acu/learning-runs":
			assert.Equal(t, "42", r.URL.Query().Get("newapiUserId"))
			assert.Empty(t, r.URL.Query().Get("learningKind"))
			_, _ = w.Write([]byte(`{"runs":[{"runId":"explicit","newapiUserId":"42","learningKind":"explicit_user_preference","status":"completed","skillChangeCount":1},{"runId":"failed-fetch","newapiUserId":"42","learningKind":"user_dissatisfaction","status":"completed","skillChangeCount":1},{"runId":"other-user","newapiUserId":"7","learningKind":"user_dissatisfaction","status":"completed","skillChangeCount":1},{"runId":"film","newapiUserId":"42","teamScope":"film","learningKind":"film_preference_v1","status":"completed","skillChangeCount":1}]}`))
		case "/internal/admin/private-acu/learning-runs/explicit":
			_, _ = w.Write([]byte(`{"run":{"runId":"explicit","newapiUserId":"42","learningKind":"explicit_user_preference","status":"completed","completedAt":"2026-11-12T12:00:00Z","skillChanges":[{"skillId":"one","changeType":"created","descriptionAfter":"Conclusions first"}]}}`))
		case "/internal/admin/private-acu/learning-runs/failed-fetch":
			w.WriteHeader(http.StatusServiceUnavailable)
		default:
			t.Errorf("unexpected request: %s", r.URL.Path)
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test")
	result, err := GetPrivateACUPreferenceActivity(context.Background(), 42)
	require.NoError(t, err)
	require.Len(t, result.Events, 1)
	assert.Equal(t, "explicit_user_preference", result.Events[0].Trigger)
	assert.True(t, result.Partial)
	assert.Equal(t, 2, result.InspectedRuns)
}

func TestPreferenceActivityCapsDetailReadsEvenWithoutDisplayableChanges(t *testing.T) {
	reads := 0
	router := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/internal/admin/private-acu/learning-runs" {
			runs := make([]dto.ACUPrivateLearningRun, 7)
			for i := range runs {
				runs[i] = dto.ACUPrivateLearningRun{RunID: "run", NewAPIUserID: "42", LearningKind: "user_dissatisfaction", Status: "completed", SkillChangeCount: 1}
			}
			body, err := common.Marshal(dto.ACUPrivateLearningRuns{Runs: runs})
			require.NoError(t, err)
			_, _ = w.Write(body)
			return
		}
		reads++
		_, _ = w.Write([]byte(`{"run":{"runId":"run","newapiUserId":"42","learningKind":"user_dissatisfaction","status":"completed","completedAt":"2026-11-12T12:00:00Z","skillChanges":[{"skillId":"one","changeType":"updated","descriptionBefore":"Same","descriptionAfter":"Same"}]}}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test")
	result, err := GetPrivateACUPreferenceActivity(context.Background(), 42)
	require.NoError(t, err)
	assert.Empty(t, result.Events)
	assert.Equal(t, 6, reads)
	assert.True(t, result.MoreAvailable)
}
