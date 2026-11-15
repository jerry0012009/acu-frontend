package service

import (
	"context"
	"fmt"
	"github.com/QuantumNous/new-api/common"
	"net/http"
)

func ForwardImageLearningFeedback(ctx context.Context, body []byte) (map[string]interface{}, error) {
	response, err := acuRouterAdminRequest(ctx, http.MethodPost, "/internal/admin/private-acu/image-feedback", body)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	if response.StatusCode != 200 {
		return nil, fmt.Errorf("image feedback unavailable")
	}
	var result map[string]interface{}
	err = common.DecodeJson(response.Body, &result)
	return result, err
}
