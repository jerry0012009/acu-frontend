package service

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
)

func acuRouterAdminRequest(ctx context.Context, method, path string, body []byte) (*http.Response, error) {
	baseURL := strings.TrimRight(strings.TrimSpace(os.Getenv("ACU_ROUTER_INTERNAL_URL")), "/")
	token := strings.TrimSpace(os.Getenv("ACU_ADMIN_TRACE_TOKEN"))
	if baseURL == "" || token == "" {
		return nil, errors.New("ACU Channel Monitor is not configured")
	}
	req, err := http.NewRequestWithContext(ctx, method, baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if len(body) > 0 {
		req.Header.Set("Content-Type", "application/json")
	}
	return (&http.Client{Timeout: 20 * time.Second}).Do(req)
}

func GetACUChannelMonitor(ctx context.Context, rangeValue string) (dto.ACUChannelMonitor, error) {
	if rangeValue != "1h" && rangeValue != "24h" && rangeValue != "7d" {
		rangeValue = "1h"
	}
	response, err := acuRouterAdminRequest(ctx, http.MethodGet, "/internal/admin/channel-monitor?range="+url.QueryEscape(rangeValue), nil)
	if err != nil {
		return dto.ACUChannelMonitor{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUChannelMonitor{}, fmt.Errorf("ACU Channel Monitor returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUChannelMonitor
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return result, err
	}
	return result, nil
}

func PauseACUChannel(ctx context.Context, input dto.ACUChannelPauseRequest, actor string) (dto.ACUChannelPauseResult, error) {
	if input.DurationMinutes != 30 && input.DurationMinutes != 120 {
		return dto.ACUChannelPauseResult{}, errors.New("pause duration must be 30 or 120 minutes")
	}
	payload, err := common.Marshal(map[string]interface{}{"channelId": input.ChannelID, "durationMinutes": input.DurationMinutes, "actor": actor})
	if err != nil {
		return dto.ACUChannelPauseResult{}, err
	}
	response, err := acuRouterAdminRequest(ctx, http.MethodPost, "/internal/admin/channel-monitor", payload)
	if err != nil {
		return dto.ACUChannelPauseResult{}, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return dto.ACUChannelPauseResult{}, fmt.Errorf("ACU Channel pause returned HTTP %d", response.StatusCode)
	}
	var result dto.ACUChannelPauseResult
	if err := common.DecodeJson(response.Body, &result); err != nil {
		return result, err
	}
	return result, nil
}
