package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
)

const RuntimeLatestReleaseURL = "https://github.com/jerry0012009/acu-runtime/releases/latest"
const RuntimeDownloadProxy = "https://gh-proxy.com/"

type RuntimeRelease struct {
	Version   string            `json:"version"`
	Downloads map[string]string `json:"downloads"`
}

type runtimeReleaseCache struct {
	sync.Mutex
	release   RuntimeRelease
	err       error
	expiresAt time.Time
}

var latestRuntimeRelease runtimeReleaseCache
var runtimeReleaseClient = &http.Client{Timeout: 8 * time.Second}
var runtimeReleaseTag = regexp.MustCompile(`^v[0-9]+\.[0-9]+\.[0-9]+$`)

func GetLatestRuntimeRelease(ctx context.Context) (RuntimeRelease, error) {
	return latestRuntimeRelease.get(ctx, runtimeReleaseClient,
		"https://api.github.com/repos/jerry0012009/acu-runtime/releases/latest", time.Now())
}

func (cache *runtimeReleaseCache) get(ctx context.Context, client *http.Client, releaseURL string, now time.Time) (RuntimeRelease, error) {
	cache.Lock()
	defer cache.Unlock()
	if now.Before(cache.expiresAt) {
		return cache.release, cache.err
	}
	cache.release, cache.err = fetchRuntimeRelease(ctx, client, releaseURL)
	cache.expiresAt = now.Add(5 * time.Minute)
	if cache.err != nil {
		// Never silently offer an expired installer as the latest release.
		cache.release = RuntimeRelease{}
		cache.expiresAt = now.Add(time.Minute)
	}
	return cache.release, cache.err
}

func fetchRuntimeRelease(ctx context.Context, client *http.Client, releaseURL string) (RuntimeRelease, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, releaseURL, nil)
	if err != nil {
		return RuntimeRelease{}, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "acu-frontend")
	resp, err := client.Do(req)
	if err != nil {
		return RuntimeRelease{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return RuntimeRelease{}, fmt.Errorf("runtime release lookup failed: status=%d", resp.StatusCode)
	}
	var payload struct {
		Tag        string `json:"tag_name"`
		Draft      bool   `json:"draft"`
		Prerelease bool   `json:"prerelease"`
		Assets     []struct {
			Name  string `json:"name"`
			State string `json:"state"`
			URL   string `json:"browser_download_url"`
		} `json:"assets"`
	}
	if err := common.DecodeJson(io.LimitReader(resp.Body, 2<<20), &payload); err != nil {
		return RuntimeRelease{}, err
	}
	if payload.Draft || payload.Prerelease || !runtimeReleaseTag.MatchString(payload.Tag) {
		return RuntimeRelease{}, fmt.Errorf("invalid stable runtime release")
	}
	release := RuntimeRelease{Version: strings.TrimPrefix(payload.Tag, "v"), Downloads: make(map[string]string)}
	for platform, suffix := range map[string]string{
		"windows":   "windows-amd64-Setup.exe",
		"mac-arm":   "macos-arm64.dmg",
		"mac-intel": "macos-amd64.dmg",
	} {
		name := "ACU-Runtime-" + release.Version + "-" + suffix
		expectedURL := "https://github.com/jerry0012009/acu-runtime/releases/download/" + payload.Tag + "/" + name
		for _, asset := range payload.Assets {
			if asset.Name == name && asset.State == "uploaded" && asset.URL == expectedURL {
				release.Downloads[platform] = RuntimeDownloadProxy + asset.URL
				break
			}
		}
	}
	return release, nil
}
