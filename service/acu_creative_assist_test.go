package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestCreativeAssistValidatesInputBeforeDependencies(t *testing.T) {
	_, err := AssistCreativeRequest(context.Background(), 0, 1, "request", CreativeAssistRequest{Prompt: "draw a car", Mode: "generate"})
	require.Error(t, err)
	_, err = AssistCreativeRequest(context.Background(), 3, 1, "request", CreativeAssistRequest{Prompt: "draw a car", Mode: "unexpected"})
	require.Error(t, err)
}

// Exercise the same internal forwarding contract with the authenticated identity;
// scope computation itself is covered by existing POC membership tests.
func TestCreativeAssistScopesActualUserAndChecksBalance(t *testing.T) {
	previousDB, previousRedis := model.DB, common.RedisEnabled
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	require.NoError(t, db.AutoMigrate(&model.User{}))
	model.DB, common.RedisEnabled = db, false
	common.OptionMapRWMutex.Lock()
	previousOptions := common.OptionMap
	if common.OptionMap == nil {
		common.OptionMap = map[string]string{}
	}
	previousAccess := common.OptionMap[acuPrivatePOCAccessOption]
	common.OptionMap[acuPrivatePOCAccessOption] = `{"spaces":[{"key":"GYZ","spaceId":"film","memberUserIds":[3],"enabled":true}]}`
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() {
		model.DB, common.RedisEnabled = previousDB, previousRedis
		common.OptionMapRWMutex.Lock()
		common.OptionMap[acuPrivatePOCAccessOption] = previousAccess
		common.OptionMap = previousOptions
		common.OptionMapRWMutex.Unlock()
	})
	require.NoError(t, db.Create(&model.User{Id: 3, Username: "creative-member", AffCode: "creative3", Quota: 1000, Status: 1}).Error)
	require.NoError(t, db.Create(&model.User{Id: 4, Username: "creative-other", AffCode: "creative4", Quota: 1000, Status: 1}).Error)
	require.NoError(t, db.Create(&model.User{Id: 5, Username: "creative-empty", AffCode: "creative5", Quota: 0, Status: 1}).Error)
	var requests []map[string]any
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "Bearer internal", r.Header.Get("Authorization"))
		var body map[string]any
		require.NoError(t, common.DecodeJson(r.Body, &body))
		requests = append(requests, body)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"status":"disabled","prompt":"original","supplement":"","references":[]}`))
	}))
	defer server.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", server.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "internal")
	result, err := AssistCreativeRequest(context.Background(), 3, 7, "request", CreativeAssistRequest{Prompt: "original", Mode: "generate"})
	require.NoError(t, err)
	assert.Equal(t, "disabled", result.Status)
	assert.Equal(t, "original", result.Prompt)
	assert.Equal(t, "3", requests[0]["userId"])
	assert.Equal(t, "7", requests[0]["tokenId"])
	assert.Equal(t, true, requests[0]["filmAllowed"])
	assert.Equal(t, "film", requests[0]["filmSpaceId"])
	_, err = AssistCreativeRequest(context.Background(), 4, 8, "other", CreativeAssistRequest{Prompt: "original", Mode: "review"})
	require.NoError(t, err)
	assert.Equal(t, false, requests[1]["filmAllowed"])
	_, err = AssistCreativeRequest(context.Background(), 5, 9, "empty", CreativeAssistRequest{Prompt: "original", Mode: "generate"})
	require.Error(t, err)
	assert.Len(t, requests, 2)
}
