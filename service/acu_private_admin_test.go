package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/stretchr/testify/require"
)

func TestPrivateACUAdminProxyReadsPromptsMemoryAndFilmStatus(t *testing.T) {
	requests := make(chan struct {
		method string
		path   string
		query  string
		body   []byte
		auth   string
	}, 3)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ := io.ReadAll(request.Body)
		requests <- struct {
			method string
			path   string
			query  string
			body   []byte
			auth   string
		}{
			method: request.Method,
			path:   request.URL.Path,
			query:  request.URL.RawQuery,
			body:   body,
			auth:   request.Header.Get("Authorization"),
		}
		writer.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/internal/admin/private-acu/prompts":
			_, _ = writer.Write([]byte(`{"prompts":{"observerPrompt":"observer","advisorPrompt":"advisor","learningPrompt":"learning","learningExamples":[{"id":"learning-example","title":"判断示例","origin":"reference_fixture","material":{"text":"用户要求返工"},"artifact":{"format":"json","content":{"dissatisfied_with_previous_work":true}}}],"promptVersion":2,"source":"default"}}`))
		case "/internal/admin/private-acu/memory":
			_, _ = writer.Write([]byte(`{"memory":{"enabled":true,"userId":"3","spaceId":"space-1","skills":[],"promptCards":[{"id":"account-learning","stage":"distillation","title":"账户学习","description":"账户学习示例","content":"请输出 JSON","language":"zh-CN","source":"fixture","execution":"used","examples":[{"id":"account-example","title":"账户示例","origin":"reference_fixture","material":{"text":"输入文本"},"artifact":{"format":"json","content":{"ok":true}}}]}]}}`))
		case "/internal/admin/private-acu/film":
			_, _ = writer.Write([]byte(`{"film":{"enabled":true,"teamScope":"GYZ","acontextUser":"private-acu-film:GYZ","spaceId":"film-space-1","learningModel":"gpt-5.6-sol","ingressTokenConfigured":true,"imagePolicy":{"maxImages":8,"maxInputImageBytes":16777216,"maxInputTotalBytes":67108864,"maxModelImageBytes":4194304,"maxModelTotalBytes":25165824,"maxImageDimension":2560,"outputMimeType":"image/webp","compressionPolicy":"visual-quality-first"},"skills":[],"promptCards":[{"id":"film-distillation","stage":"distillation","title":"影视蒸馏","description":"影视示例","content":"请提取影视语言","language":"zh-CN","source":"fixture","execution":"used","examples":[{"id":"film-example","title":"影视图文示例","origin":"reference_fixture","material":{"text":"夜间室内","json":{"lighting":"side"}},"artifact":{"format":"json","content":{"claims":[]}},"sourceUrl":"https://example.com/reference"}]}]}}`))
		default:
			writer.WriteHeader(http.StatusNotFound)
		}
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-private-acu-token")

	prompts, err := GetPrivateACUPrompts(context.Background())
	require.NoError(t, err)
	require.Equal(t, int64(2), prompts.PromptVersion)
	require.Len(t, prompts.LearningExamples, 1)
	require.Equal(t, "判断示例", prompts.LearningExamples[0].Title)

	memory, err := GetPrivateACUMemory(context.Background(), "3")
	require.NoError(t, err)
	require.Equal(t, "space-1", memory.SpaceID)
	require.Len(t, memory.PromptCards, 1)
	require.Len(t, memory.PromptCards[0].Examples, 1)

	film, err := GetPrivateACUFilmStatus(context.Background())
	require.NoError(t, err)
	require.Equal(t, "GYZ", film.TeamScope)
	require.Equal(t, "gpt-5.6-sol", film.LearningModel)
	require.NotNil(t, film.ImagePolicy)
	require.Equal(t, 2560, film.ImagePolicy.MaxImageDimension)
	require.Len(t, film.PromptCards, 1)
	require.Equal(t, "影视图文示例", film.PromptCards[0].Examples[0].Title)

	for _, expected := range []struct {
		method string
		path   string
		query  string
	}{
		{http.MethodGet, "/internal/admin/private-acu/prompts", ""},
		{http.MethodGet, "/internal/admin/private-acu/memory", "newapiUserId=3"},
		{http.MethodGet, "/internal/admin/private-acu/film", ""},
	} {
		request := <-requests
		require.Equal(t, expected.method, request.method)
		require.Equal(t, expected.path, request.path)
		require.Equal(t, expected.query, request.query)
		require.Equal(t, "Bearer test-private-acu-token", request.auth)
	}
}

func TestPrivateACUAdminProxySavesPrompts(t *testing.T) {
	var body []byte
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		body, _ = io.ReadAll(request.Body)
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"prompts":{"observerPrompt":"updated","advisorPrompt":"updated","learningPrompt":"updated","promptVersion":3,"source":"database","updatedBy":"root"}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-private-acu-token")

	result, err := SavePrivateACUPrompts(context.Background(), dto.ACUPrivatePromptsRequest{
		ObserverPrompt: "updated",
		AdvisorPrompt:  "updated",
		LearningPrompt: "updated",
	}, "root")
	require.NoError(t, err)
	require.Equal(t, int64(3), result.PromptVersion)

	var payload map[string]interface{}
	require.NoError(t, common.Unmarshal(body, &payload))
	require.Equal(t, map[string]interface{}{
		"observerPrompt": "updated",
		"advisorPrompt":  "updated",
		"learningPrompt": "updated",
		"enabled":        true,
		"updatedBy":      "root",
	}, payload)
}

func TestPrivateACUExperienceDetailProxyForwardsUserAndExperience(t *testing.T) {
	requests := make(chan *http.Request, 1)
	router := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requests <- request.Clone(request.Context())
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"experience":{"experienceId":"req_1","ledger":[{"ledgerId":"ledger-1","logicalRequestId":"req_1","stage":"learning","inputTokens":10,"cachedInputTokens":0,"outputTokens":2,"totalTokens":12,"usageStatus":"reported","status":"success","nominalCostUsd":"0","actualCostCny":"0.01","userChargeCny":"0.0125","billingMarkupMultiplier":1.25,"billingStatus":"acknowledged","billingAttemptCount":1,"createdAt":"2026-08-26T00:00:00Z"}]}}`))
	}))
	defer router.Close()
	t.Setenv("ACU_ROUTER_INTERNAL_URL", router.URL)
	t.Setenv("ACU_ADMIN_TRACE_TOKEN", "test-private-acu-token")

	result, err := GetPrivateACUExperienceDetail(context.Background(), "42", "req/1")
	require.NoError(t, err)
	require.Equal(t, "req_1", result.ExperienceID)
	require.Len(t, result.Ledger, 1)

	forwarded := <-requests
	require.Equal(t, "/internal/admin/private-acu/experiences/req%2F1", forwarded.URL.EscapedPath())
	require.Equal(t, "42", forwarded.URL.Query().Get("newapiUserId"))
}
