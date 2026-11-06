package service

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestPreferenceProfileScopesAuthenticatedUserAndRetainsStaleSnapshot(t *testing.T) {
	status := http.StatusOK
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/internal/admin/private-acu/preference-profile", r.URL.Path)
		assert.Equal(t, "42", r.URL.Query().Get("newapiUserId"))
		assert.Equal(t, "Bearer test-token", r.Header.Get("Authorization"))
		w.WriteHeader(status)
		_, _ = w.Write([]byte(`{"profile":{"status":"error","profile":{"summary":"Evidence first","rays":[],"sourceCount":2,"excluded":[]},"error":"profile_refresh_failed"}}`))
	}))
	t.Cleanup(server.Close)
	t.Setenv("ACU_ROUTER_INTERNAL_URL", server.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-token")
	result, err := GetPrivateACUPreferenceProfile(context.Background(), 42)
	require.NoError(t, err)
	require.NotNil(t, result.Profile)
	assert.Equal(t, "Evidence first", result.Profile.Summary)
	assert.Equal(t, "error", result.Status)
	status = http.StatusServiceUnavailable
	_, err = GetPrivateACUPreferenceProfile(context.Background(), 42)
	require.ErrorContains(t, err, "503")
	_, err = GetPrivateACUPreferenceProfile(context.Background(), 0)
	require.Error(t, err)
}
