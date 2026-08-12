package controller

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func setupACUTraceTargetTestDB(t *testing.T) {
	t.Helper()
	previousDB, previousLogDB := model.DB, model.LOG_DB
	dsn := fmt.Sprintf("file:%s?mode=memory&cache=shared", t.Name())
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.Log{}, &model.ACUUsageFinalize{}))
	model.DB, model.LOG_DB = db, db
	t.Cleanup(func() {
		model.DB, model.LOG_DB = previousDB, previousLogDB
	})
}

func createACUTraceTargetTestUser(t *testing.T, id int, role int, username string) {
	t.Helper()
	require.NoError(t, model.DB.Create(&model.User{
		Id: id, Username: username, Password: "password", Role: role,
		Status: common.UserStatusEnabled, Group: "default", AffCode: fmt.Sprintf("aff-%d", id),
	}).Error)
}

func acuTraceTargetTestContext(path string, userID int, role int) (*gin.Context, *httptest.ResponseRecorder) {
	recorder := httptest.NewRecorder()
	context, _ := gin.CreateTestContext(recorder)
	context.Request = httptest.NewRequest(http.MethodGet, path, nil)
	context.Set("id", userID)
	context.Set("role", role)
	return context, recorder
}

func TestACUWorkTimelineTargetUserAuthorization(t *testing.T) {
	setupACUTraceTargetTestDB(t)
	createACUTraceTargetTestUser(t, 1, common.RoleCommonUser, "regular")
	createACUTraceTargetTestUser(t, 2, common.RoleCommonUser, "target")
	createACUTraceTargetTestUser(t, 3, common.RoleAdminUser, "admin")
	createACUTraceTargetTestUser(t, 4, common.RoleRootUser, "root")
	createACUTraceTargetTestUser(t, 5, common.RoleAdminUser, "peer-admin")
	createACUTraceTargetTestUser(t, 6, common.RoleCommonUser, "empty-target")
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId: 1, CreatedAt: 100, Type: model.LogTypeConsume,
		Other: `{"acu_logical_request_id":"req_regular","acu_cost_breakdown":{"task_id":"task_regular"}}`,
	}).Error)
	require.NoError(t, model.LOG_DB.Create(&model.Log{
		UserId: 2, CreatedAt: 100, Type: model.LogTypeConsume,
		Other: `{"acu_logical_request_id":"req_target","acu_cost_breakdown":{"task_id":"task_target"}}`,
	}).Error)

	t.Run("regular user without user_id sees only own timeline", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-work-timeline?from=1&to=200", 1, common.RoleCommonUser,
		)
		GetACUWorkTimeline(context)
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "req_regular")
		assert.NotContains(t, recorder.Body.String(), "req_target")
	})

	t.Run("regular user can explicitly select self", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-work-timeline?from=1&to=200&user_id=1", 1, common.RoleCommonUser,
		)
		GetACUWorkTimeline(context)
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "req_regular")
		assert.NotContains(t, recorder.Body.String(), "req_target")
	})

	t.Run("regular user cannot select another user", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-work-timeline?from=1&to=200&user_id=2", 1, common.RoleCommonUser,
		)
		GetACUWorkTimeline(context)
		assert.Equal(t, http.StatusForbidden, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "permission denied")
	})

	t.Run("admin can select a regular user without own data mixing", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-work-timeline?from=1&to=200&user_id=2", 3, common.RoleAdminUser,
		)
		GetACUWorkTimeline(context)
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "req_target")
		assert.NotContains(t, recorder.Body.String(), "req_regular")
	})

	t.Run("admin cannot select root or peer admin", func(t *testing.T) {
		for _, targetUserID := range []int{4, 5} {
			context, recorder := acuTraceTargetTestContext(
				fmt.Sprintf("/api/log/self/acu-work-timeline?from=1&to=200&user_id=%d", targetUserID),
				3,
				common.RoleAdminUser,
			)
			GetACUWorkTimeline(context)
			assert.Equal(t, http.StatusForbidden, recorder.Code)
			assert.Contains(t, recorder.Body.String(), "permission denied")
		}
	})

	t.Run("root can select another user with no timeline data", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-work-timeline?from=1&to=200&user_id=6", 4, common.RoleRootUser,
		)
		GetACUWorkTimeline(context)
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), `"items":[]`)
	})
}

func TestACUSessionTraceTargetUserAuthorization(t *testing.T) {
	setupACUTraceTargetTestDB(t)
	createACUTraceTargetTestUser(t, 1, common.RoleCommonUser, "regular")
	createACUTraceTargetTestUser(t, 2, common.RoleCommonUser, "target")
	createACUTraceTargetTestUser(t, 3, common.RoleAdminUser, "admin")
	createACUTraceTargetTestUser(t, 4, common.RoleRootUser, "root")
	require.NoError(t, model.DB.Create(&model.ACUUsageFinalize{
		ReportIdempotencyKey: "target-report",
		LogicalRequestId:     "req_target",
		PayloadHash:          "target-hash",
		UserId:               2,
		TokenId:              2,
		LogId:                "target-log",
		Status:               model.ACUFinalizeStatusFinalized,
	}).Error)

	routerCalls := 0
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		routerCalls++
		assert.Equal(t, "Bearer test-trace-token", request.Header.Get("Authorization"))
		assert.Equal(t, "/internal/admin/traces/req_target", request.URL.Path)
		_, _ = writer.Write([]byte(`{"session":{"session_id":"session_target"},"task":{"task_id":"task_target"}}`))
	}))
	t.Cleanup(router.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-trace-token")

	t.Run("regular user cannot retrieve another user's trace", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-session-trace/req_target?user_id=2", 1, common.RoleCommonUser,
		)
		context.Params = gin.Params{{Key: "identifier", Value: "req_target"}}
		GetACUSessionTrace(context)
		assert.Equal(t, http.StatusForbidden, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "permission denied")
		assert.Equal(t, 0, routerCalls)
	})

	t.Run("admin can retrieve a managed user's trace after ownership verification", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-session-trace/req_target?user_id=2", 3, common.RoleAdminUser,
		)
		context.Params = gin.Params{{Key: "identifier", Value: "req_target"}}
		GetACUSessionTrace(context)
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "session_target")
		assert.Equal(t, 1, routerCalls)
	})

	t.Run("root can retrieve another user's trace", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-session-trace/req_target?user_id=2", 4, common.RoleRootUser,
		)
		context.Params = gin.Params{{Key: "identifier", Value: "req_target"}}
		GetACUSessionTrace(context)
		assert.Equal(t, http.StatusOK, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "session_target")
		assert.Equal(t, 2, routerCalls)
	})

	t.Run("admin cannot retrieve a root trace", func(t *testing.T) {
		context, recorder := acuTraceTargetTestContext(
			"/api/log/self/acu-session-trace/req_target?user_id=4", 3, common.RoleAdminUser,
		)
		context.Params = gin.Params{{Key: "identifier", Value: "req_target"}}
		GetACUSessionTrace(context)
		assert.Equal(t, http.StatusForbidden, recorder.Code)
		assert.Contains(t, recorder.Body.String(), "permission denied")
		assert.Equal(t, 2, routerCalls)
	})
}
