package router

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/gin-gonic/gin"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestACUChannelMonitorRequiresAdminWhileRoutingCatalogRemainsUserScoped(t *testing.T) {
	gin.SetMode(gin.TestMode)
	previousDB := model.DB
	previousType := common.MainDatabaseType()
	previousRedis := common.RedisEnabled
	previousOptions := common.OptionMap
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB = db
	common.SetMainDatabaseType(common.DatabaseTypeSQLite)
	common.RedisEnabled = false
	common.OptionMap = map[string]string{}
	t.Cleanup(func() {
		model.DB = previousDB
		common.SetMainDatabaseType(previousType)
		common.RedisEnabled = previousRedis
		common.OptionMap = previousOptions
	})

	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, request *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"range":"24h","supplyStrategy":"balanced","scenario":"standard",
			"profiles":[],"history":[],"cooldownIntervals":[],"probeHistory":[],
			"supplyInventory":[],"modelPool":[],"generatedAt":"2026-08-10T00:00:00Z"
		}`))
	}))
	defer upstream.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", upstream.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "router-authz-test-token")

	createUser := func(username, token string, role int) {
		user := &model.User{
			Username: username, Password: "password-placeholder", Role: role,
			Status: common.UserStatusEnabled, Group: "default", AccessToken: &token,
			AuthVersion: 1, AffCode: "aff-" + username,
		}
		require.NoError(t, model.DB.Create(user).Error)
	}
	createUser("regular-user", "regular-user-pat", common.RoleCommonUser)
	createUser("admin-user", "admin-user-pat", common.RoleAdminUser)
	createUser("root-user", "root-user-pat", common.RoleRootUser)

	engine := gin.New()
	SetApiRouter(engine)
	request := func(path, token string) *httptest.ResponseRecorder {
		recorder := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodGet, path, nil)
		req.Header.Set("Authorization", "Bearer "+token)
		engine.ServeHTTP(recorder, req)
		return recorder
	}

	require.Equal(t, http.StatusForbidden, request("/api/log/acu-channel-monitor", "regular-user-pat").Code)
	require.Equal(t, http.StatusOK, request("/api/log/acu-channel-monitor", "admin-user-pat").Code)
	require.Equal(t, http.StatusOK, request("/api/log/acu-channel-monitor", "root-user-pat").Code)
	require.Equal(t, http.StatusForbidden, request("/api/log/acu-execution-profiles", "admin-user-pat").Code)
	require.Equal(t, http.StatusOK, request("/api/log/acu-execution-profiles", "root-user-pat").Code)
	require.Equal(t, http.StatusOK, request("/api/user/self/acu-routing-catalog", "regular-user-pat").Code)
}
