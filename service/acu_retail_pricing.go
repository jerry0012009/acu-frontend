package service

import (
	"context"
	"net/http"
	"strconv"
	"time"
)

func GetACUPublishedPricing(ctx context.Context) (*http.Response, error) {
	return acuRouterAdminRequestWithTimeout(ctx, 5*time.Second, http.MethodGet, "/internal/admin/execution-profiles/public-pricing", nil)
}

func GetACURetailPricing(ctx context.Context, days int) (map[string]interface{}, error) {
	return acuExecutionProfileRequestWithTimeout(ctx, 60*time.Second, http.MethodGet, "/internal/admin/execution-profiles/retail-pricing?days="+strconv.Itoa(days), nil)
}

func PreviewACURetailPricing(ctx context.Context, input map[string]interface{}, actor string) (map[string]interface{}, error) {
	input["actor"] = actor
	return acuExecutionProfileRequest(ctx, http.MethodPost, "/internal/admin/execution-profiles/retail-pricing", input)
}
