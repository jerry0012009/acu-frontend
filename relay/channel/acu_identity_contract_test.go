package channel

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/QuantumNous/new-api/common"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

type acuV4ContractRequest struct {
	Body    string      `json:"body"`
	Headers http.Header `json:"headers"`
}

func TestNewAPIV4HeadersVerifyWithClawRouter(t *testing.T) {
	routerRepo := os.Getenv("CLAWROUTER_REPO")
	if routerRepo == "" {
		routerRepo = filepath.Clean(filepath.Join("..", "..", "..", "claw-router-timeline"))
	}
	runner := filepath.Join(routerRepo, "test", "new-api-v4-contract-runner.ts")
	if _, err := os.Stat(runner); err != nil {
		t.Skipf("ClawRouter contract runner is unavailable: %v", err)
	}

	gin.SetMode(gin.TestMode)
	const secret = "new-api-router-v4-contract-secret"
	t.Setenv("ACU_TRUSTED_IDENTITY_SECRET", secret)
	build := func(requestID string, candidates []string, scores map[string]float64) acuV4ContractRequest {
		ctx, _ := gin.CreateTestContext(httptest.NewRecorder())
		ctx.Request = httptest.NewRequest(http.MethodPost, "/v1/responses", nil)
		ctx.Request.Header.Set("User-Agent", "codex_exec/0.145.0")
		ctx.Set("acu_allowed_candidate_ids", candidates)
		ctx.Set("acu_candidate_preference_scores", scores)
		body := `{"model":"acu-auto","input":"contract"}`
		req := httptest.NewRequest(http.MethodPost, "http://acu-router/v1/responses", nil)
		info := &relaycommon.RelayInfo{IsACUChannel: true, UserId: 17, TokenId: 29, RequestId: requestID}
		require.NoError(t, applyACUTrustedIdentity(req, ctx, info, []byte(body)))
		return acuV4ContractRequest{Body: body, Headers: req.Header}
	}

	payload, err := common.Marshal(map[string]interface{}{
		"secret": secret,
		"scoped": build(
			"req_v4_scoped",
			[]string{"gpt-5.6-luna", "gpt-5.6-luna@max"},
			map[string]float64{"gpt-5.6-luna@max": 150.5},
		),
		"emptyScope": build("req_v4_empty", nil, nil),
	})
	require.NoError(t, err)

	command := exec.Command("npx", "tsx", runner)
	command.Dir = routerRepo
	command.Stdin = bytes.NewReader(payload)
	output, err := command.CombinedOutput()
	require.NoError(t, err, string(output))
}
