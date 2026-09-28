package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestPrivateACUAdvisorProxyScopesListToAuthenticatedUser(t *testing.T) {
	requests := make(chan *http.Request, 1)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests <- request.Clone(request.Context())
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"advisors":[{"advisorId":"advisor-1","newapiUserId":"42","status":"risk","problem":"drift","needAdvisor":true}]}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-advisor-token")

	result, err := GetPrivateACUAdvisors(context.Background(), 42, 7)
	require.NoError(t, err)
	require.Len(t, result.Advisors, 1)
	require.Equal(t, "advisor-1", result.Advisors[0].AdvisorID)

	forwarded := <-requests
	require.Equal(t, http.MethodGet, forwarded.Method)
	require.Equal(t, "/internal/admin/private-advisors", forwarded.URL.Path)
	require.Equal(t, "42", forwarded.URL.Query().Get("newapiUserId"))
	require.Equal(t, "7", forwarded.URL.Query().Get("limit"))
	require.Equal(t, "Bearer test-advisor-token", forwarded.Header.Get("Authorization"))
}

func TestPrivateACUMemoryForUserScopesAndHidesInternalFields(t *testing.T) {
	requests := make(chan *http.Request, 1)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests <- request.Clone(request.Context())
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"memory":{"enabled":true,"userId":"42","spaceId":"space-42","skills":[{"id":"skill-1","name":"Preference","description":"Prefer small changes","files":[{"path":"SKILL.md","mime":"text/markdown","content":"details","url":"https://internal.example/file"}]}],"internalPrompts":[{"path":"task.py","mime":"text/plain","content":"internal"}]}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-advisor-token")

	result, err := GetPrivateACUMemoryForUser(context.Background(), 42)
	require.NoError(t, err)
	require.Equal(t, "42", result.UserID)
	require.Empty(t, result.SpaceID)
	require.Empty(t, result.InternalPrompts)
	require.Len(t, result.Skills, 1)
	require.Equal(t, "details", result.Skills[0].Files[0].Content)
	require.Empty(t, result.Skills[0].Files[0].URL)

	forwarded := <-requests
	require.Equal(t, "/internal/admin/private-acu/memory", forwarded.URL.Path)
	require.Equal(t, "42", forwarded.URL.Query().Get("newapiUserId"))
	require.Equal(t, "Bearer test-advisor-token", forwarded.Header.Get("Authorization"))
}

func TestPrivateACUAdvisorProxyForwardsFeedback(t *testing.T) {
	requests := make(chan struct {
		method string
		path   string
		body   []byte
		auth   string
	}, 1)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		requests <- struct {
			method string
			path   string
			body   []byte
			auth   string
		}{
			method: request.Method,
			path:   request.URL.EscapedPath(),
			body:   body,
			auth:   request.Header.Get("Authorization"),
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"updated":true}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-advisor-token")

	err := UpdatePrivateACUAdvisorFeedback(context.Background(), 42, "advisor/1", "helpful")
	require.NoError(t, err)

	request := <-requests
	require.Equal(t, http.MethodPost, request.method)
	require.Equal(t, "/internal/admin/private-advisors/advisor%2F1/feedback", request.path)
	require.Equal(t, "Bearer test-advisor-token", request.auth)

	var body map[string]string
	require.NoError(t, common.Unmarshal(request.body, &body))
	require.Equal(t, map[string]string{
		"newapiUserId": "42",
		"feedback":     "helpful",
	}, body)
}

func TestGetUserACUChargesScopesFinalizedChargesToUserAndWindow(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.ACUUsageFinalize{}))
	model.DB = db
	t.Cleanup(func() {
		model.DB = previousDB
	})

	now := time.Unix(1_700_000_000, 0)
	records := []model.ACUUsageFinalize{
		{ReportIdempotencyKey: "report-1", LogicalRequestId: "logical-1", PayloadHash: "hash-1", UserId: 42, UserChargeCny: "1.25", Status: model.ACUFinalizeStatusFinalized, CreatedAt: now.Add(-time.Hour).Unix()},
		{ReportIdempotencyKey: "report-2", LogicalRequestId: "logical-2", PayloadHash: "hash-2", UserId: 42, UserChargeCny: "0.75", Status: model.ACUFinalizeStatusFinalized, CreatedAt: now.Add(-48 * time.Hour).Unix()},
		{ReportIdempotencyKey: "report-3", LogicalRequestId: "logical-3", PayloadHash: "hash-3", UserId: 7, UserChargeCny: "9.00", Status: model.ACUFinalizeStatusFinalized, CreatedAt: now.Add(-time.Hour).Unix()},
		{ReportIdempotencyKey: "report-4", LogicalRequestId: "logical-4", PayloadHash: "hash-4", UserId: 42, UserChargeCny: "4.00", Status: model.ACUFinalizeStatusCharged, CreatedAt: now.Add(-time.Hour).Unix()},
	}
	for index := range records {
		require.NoError(t, db.Create(&records[index]).Error)
	}

	charges := getUserACUCharges(42, now)
	require.InDelta(t, 1.25, charges["24h"], 1e-9)
	require.InDelta(t, 2.0, charges["7d"], 1e-9)
	require.InDelta(t, 2.0, charges["30d"], 1e-9)
}

func TestSummarizePrivateACUEntriesCountsValueStagesWithinWindow(t *testing.T) {
	cutoff := time.Unix(1_700_000_000, 0)
	entries := []dto.ACUPrivateUsageEntry{
		{Stage: "learning", Status: "success", UserChargeCNY: "0.10", CreatedAt: cutoff.Add(time.Minute).Format(time.RFC3339Nano)},
		{Stage: "observer", Status: "success", UserChargeCNY: "0.20", CreatedAt: cutoff.Add(time.Minute).Format(time.RFC3339Nano)},
		{Stage: "advisor", Status: "success", UserChargeCNY: "0.30", CreatedAt: cutoff.Add(time.Minute).Format(time.RFC3339Nano)},
		{Stage: "observer", Status: "error", UserChargeCNY: "0.40", CreatedAt: cutoff.Add(time.Minute).Format(time.RFC3339Nano)},
		{Stage: "acontext", Status: "success", UserChargeCNY: "9.00", CreatedAt: cutoff.Add(time.Minute).Format(time.RFC3339Nano)},
		{Stage: "learning", Status: "success", UserChargeCNY: "5.00", CreatedAt: cutoff.Add(-time.Minute).Format(time.RFC3339Nano)},
	}

	calls, charge, byStage, byStageCalls := summarizePrivateACUEntries(entries, cutoff)
	require.Equal(t, int64(5), calls)
	require.InDelta(t, 10.0, charge, 1e-9)
	require.InDelta(t, 0.1, byStage["learning"], 1e-9)
	require.InDelta(t, 0.6, byStage["observer"], 1e-9)
	require.InDelta(t, 0.3, byStage["advisor"], 1e-9)
	require.Equal(t, int64(1), byStageCalls["learning"])
	require.Equal(t, int64(1), byStageCalls["observer"])
	require.Equal(t, int64(1), byStageCalls["advisor"])
}

func TestPrivateACUPreferenceDisplayTextAdaptsAdvisorCopyOnly(t *testing.T) {
	value := "Skill Learner updated SKILL.md; prefer skills, but keep skillful wording."

	result := privateACUPreferenceDisplayText(value)

	require.Equal(
		t,
		"Preference Writer updated PREFERENCE.md; prefer preferences, but keep skillful wording.",
		result,
	)
}
