package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/QuantumNous/new-api/common"
)

type ACUModelProbeSummary struct {
	GeneratedAt int64                         `json:"generatedAt"`
	Models      map[string]ACUModelProbeStats `json:"models"`
}

type ACUModelProbeStats struct {
	Buckets   string `json:"buckets"`
	LatencyMs int    `json:"latencyMs,omitempty"`
	Protocol  string `json:"protocol,omitempty"`
}

func GetACUModelProbeSummary(ctx context.Context) (ACUModelProbeSummary, error) {
	var summary ACUModelProbeSummary
	response, err := acuRouterAdminRequestWithTimeout(ctx, 2*time.Second, http.MethodGet, "/internal/admin/execution-profiles/model-probe-summary", nil)
	if err != nil {
		return summary, err
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return summary, fmt.Errorf("ACU model probe summary returned HTTP %d", response.StatusCode)
	}
	err = common.DecodeJson(io.LimitReader(response.Body, 128<<10), &summary)
	if err == nil && (summary.GeneratedAt <= 0 || summary.Models == nil) {
		err = fmt.Errorf("invalid ACU model probe summary")
	}
	return summary, err
}
