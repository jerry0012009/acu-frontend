package service

import (
	"context"
	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestTeamPreferencesReuseSpaceMembershipAndKeepTeamSources(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{acuPrivatePOCAccessOption: `{"spaces":[{"key":"GYZ","spaceId":"team","memberUserIds":[42],"enabled":true}]}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() { common.OptionMapRWMutex.Lock(); common.OptionMap = previous; common.OptionMapRWMutex.Unlock() })
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		assert.Equal(t, "/internal/admin/private-acu/team-preference-profile", r.URL.Path)
		assert.Equal(t, "team", r.URL.Query().Get("spaceId"))
		_, _ = w.Write([]byte(`{"profile":{"status":"ready","profile":{"summary":"GYZ","rays":[{"id":"ray","summary":"夜景保留暗区","sourceIds":["source"],"evidence":[{"sourceId":"source","quote":"保留暗区"}]},{"id":"ray2","summary":"局部光池","sourceIds":["source"],"evidence":[{"sourceId":"source","quote":"局部光池"}]}],"sourceCount":1,"excluded":[]}}}`))
	}))
	defer server.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", server.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	result, err := GetPrivateACUTeamPreferences(context.Background(), 43)
	require.NoError(t, err)
	assert.Empty(t, result.Spaces)
	assert.Zero(t, calls)
	result, err = GetPrivateACUTeamPreferences(context.Background(), 42)
	require.NoError(t, err)
	require.Len(t, result.Spaces, 1)
	assert.Equal(t, "GYZ", result.Spaces[0].Key)
	assert.Equal(t, "source", result.Spaces[0].Records[0].ID)
	assert.Len(t, result.Spaces[0].Records, 1)
	assert.Equal(t, "夜景保留暗区", result.Spaces[0].Records[0].Summary)
	assert.Equal(t, "保留暗区", result.Spaces[0].View.Profile.Rays[0].Evidence[0].Quote)
	common.OptionMapRWMutex.Lock()
	common.OptionMap[acuPrivatePOCAccessOption] = `{"spaces":[]}`
	common.OptionMapRWMutex.Unlock()
	result, err = GetPrivateACUTeamPreferences(context.Background(), 42)
	require.NoError(t, err)
	assert.Empty(t, result.Spaces)
	assert.Equal(t, 1, calls)
}

func TestTeamPreferencesPropagatesUnavailableProfileRatherThanReturningNoMembership(t *testing.T) {
	common.OptionMapRWMutex.Lock()
	previous := common.OptionMap
	common.OptionMap = map[string]string{acuPrivatePOCAccessOption: `{"spaces":[{"key":"GYZ","spaceId":"team","memberUserIds":[122],"enabled":true}]}`}
	common.OptionMapRWMutex.Unlock()
	t.Cleanup(func() { common.OptionMapRWMutex.Lock(); common.OptionMap = previous; common.OptionMapRWMutex.Unlock() })
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/admin/private-acu/team-preference-profile", r.URL.Path)
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"temporarily unavailable"}`))
	}))
	defer server.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", server.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	_, err := GetPrivateACUTeamPreferences(context.Background(), 122)
	require.Error(t, err)
}
