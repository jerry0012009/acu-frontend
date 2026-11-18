package middleware

import (
	"bytes"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/iotest"

	"github.com/QuantumNous/new-api/common"
	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/require"
)

func TestResponsesBodyReadAccessLog(t *testing.T) {
	const body = `{"model":"test-only","input":"do not log this"}`
	for _, tc := range []struct {
		name, path string
		failRead   bool
		wantTiming bool
	}{
		{name: "responses", path: "/v1/responses", wantTiming: true},
		{name: "another route", path: "/v1/chat/completions"},
		{name: "failed read", path: "/v1/responses", failRead: true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			var accessLog bytes.Buffer
			writer := gin.DefaultWriter
			gin.DefaultWriter = &accessLog
			defer func() { gin.DefaultWriter = writer }()
			router := gin.New()
			SetUpLogger(router)
			router.POST(tc.path, func(c *gin.Context) {
				defer common.CleanupBodyStorage(c)
				_, err := common.GetBodyStorage(c)
				if err != nil {
					require.True(t, tc.failRead)
					c.Status(http.StatusBadRequest)
					return
				}
				storage, err := common.GetBodyStorage(c)
				require.NoError(t, err)
				got, err := io.ReadAll(storage)
				require.NoError(t, err)
				require.Equal(t, body, string(got))
				c.Status(http.StatusNoContent)
			})

			req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(body))
			wantStatus := http.StatusNoContent
			if tc.failRead {
				req.Body = io.NopCloser(iotest.ErrReader(errors.New("fixture read failure")))
				wantStatus = http.StatusBadRequest
			}
			res := httptest.NewRecorder()
			router.ServeHTTP(res, req)
			require.Equal(t, wantStatus, res.Code)
			line := accessLog.String()
			require.Equal(t, 1, strings.Count(line, "\n"))
			require.NotContains(t, line, "do not log this")
			if tc.wantTiming {
				require.Regexp(t, `POST /v1/responses \| body_read_ms=\d+\n$`, line)
			} else {
				require.NotContains(t, line, "body_read_ms")
			}
		})
	}
}
