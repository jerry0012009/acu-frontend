package service

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestRuntimeReleaseRefreshAndFailure(t *testing.T) {
	version, calls, fail := "0.1.52", 0, false
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if fail {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		fmt.Fprintf(w, `{"tag_name":"v%s","assets":[{"name":"ACU-Runtime-%s-windows-amd64-Setup.exe","state":"uploaded","browser_download_url":"https://github.com/jerry0012009/acu-runtime/releases/download/v%s/ACU-Runtime-%s-windows-amd64-Setup.exe"}]}`, version, version, version, version)
	}))
	defer server.Close()
	cache := runtimeReleaseCache{}
	now := time.Now()
	release, err := cache.get(context.Background(), server.Client(), server.URL, now)
	require.NoError(t, err)
	assert.Equal(t, "0.1.52", release.Version)
	assert.Contains(t, release.Downloads["windows"], "/v0.1.52/")
	assert.Equal(t, "https://gh-proxy.com/https://github.com/jerry0012009/acu-runtime/releases/download/v0.1.52/ACU-Runtime-0.1.52-windows-amd64-Setup.exe", release.Downloads["windows"])
	assert.Empty(t, release.Downloads["mac-arm"])
	version = "0.1.53"
	_, err = cache.get(context.Background(), server.Client(), server.URL, now.Add(time.Minute))
	require.NoError(t, err)
	assert.Equal(t, 1, calls)
	release, err = cache.get(context.Background(), server.Client(), server.URL, now.Add(6*time.Minute))
	require.NoError(t, err)
	assert.Equal(t, "0.1.53", release.Version)
	fail = true
	release, err = cache.get(context.Background(), server.Client(), server.URL, now.Add(12*time.Minute))
	require.Error(t, err)
	assert.Empty(t, release.Version, "expired versions must not be served as latest")
	_, err = cache.get(context.Background(), server.Client(), server.URL, now.Add(12*time.Minute+time.Second))
	require.Error(t, err)
	assert.Equal(t, 3, calls, "failures are briefly cached to avoid exhausting GitHub rate limits")
}

func TestRuntimeReleaseRejectsUnsafeOrUnstableAssets(t *testing.T) {
	for _, body := range []string{
		`{"tag_name":"v0.1.52","draft":true}`,
		`{"tag_name":"v0.1.52","prerelease":true}`,
		`{"tag_name":"bad/tag"}`,
		`not json`,
	} {
		t.Run(body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { fmt.Fprint(w, body) }))
			defer server.Close()
			_, err := fetchRuntimeRelease(context.Background(), server.Client(), server.URL)
			require.Error(t, err)
		})
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		fmt.Fprint(w, `{"tag_name":"v0.1.52","assets":[
		{"name":"ACU-Runtime-0.1.52-windows-amd64-Setup.exe","state":"uploaded","browser_download_url":"https://evil.example/setup.exe"},
		{"name":"ACU-Runtime-0.1.52-macos-arm64.dmg","state":"new","browser_download_url":"https://github.com/jerry0012009/acu-runtime/releases/download/v0.1.52/ACU-Runtime-0.1.52-macos-arm64.dmg"},
		{"name":"ACU-Runtime-0.1.52-macos-amd64.dmg","state":"uploaded","browser_download_url":"https://github.com/jerry0012009/acu-runtime/releases/download/v0.1.52/ACU-Runtime-0.1.52-macos-amd64.dmg"}]}`)
	}))
	defer server.Close()
	release, err := fetchRuntimeRelease(context.Background(), server.Client(), server.URL)
	require.NoError(t, err)
	assert.Empty(t, release.Downloads["windows"])
	assert.Empty(t, release.Downloads["mac-arm"])
	assert.Contains(t, release.Downloads["mac-intel"], "macos-amd64.dmg")
	assert.Equal(t, "https://gh-proxy.com/https://github.com/jerry0012009/acu-runtime/releases/download/v0.1.52/ACU-Runtime-0.1.52-macos-amd64.dmg", release.Downloads["mac-intel"])
}
