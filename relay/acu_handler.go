package relay

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// ACURawHelper keeps the authenticated ACU wire untouched. Router owns protocol
// adaptation and reports authoritative usage through Usage Finalize.
func ACURawHelper(c *gin.Context, info *relaycommon.RelayInfo) (result *types.NewAPIError) {
	defer func() {
		if result == nil {
			return
		}
		if errors.Is(c.Request.Context().Err(), context.Canceled) {
			result = types.NewErrorWithStatusCode(context.Canceled, types.ErrorCodeClientCancelled, 499, types.ErrOptionWithSkipRetry())
			return
		}
		if c.Writer.Written() {
			// A pre-header heartbeat has committed SSE. Fail in the stream,
			// never append bare JSON or a successful terminal marker.
			payload, err := common.Marshal(gin.H{"type": "error", "error": result.ToOpenAIError(), "status_code": result.StatusCode})
			if err == nil {
				_, _ = fmt.Fprintf(c.Writer, "\nevent: error\ndata: %s\n\n", payload)
				c.Writer.Flush()
			}
		}
	}()
	info.InitChannelMeta(c)
	adaptor := GetAdaptor(info.ApiType)
	if adaptor == nil {
		return types.NewError(fmt.Errorf("invalid ACU api type: %d", info.ApiType), types.ErrorCodeInvalidApiType, types.ErrOptionWithSkipRetry())
	}
	adaptor.Init(info)
	storage, err := common.GetBodyStorage(c)
	if err != nil {
		return types.NewErrorWithStatusCode(err, types.ErrorCodeReadRequestBodyFailed, http.StatusBadRequest, types.ErrOptionWithSkipRetry())
	}
	info.UpstreamRequestBodySize = storage.Size()
	info.DisablePing = true
	requestPath := info.RequestURLPath
	// RelayInfo normalizes legacy /pg paths by adding /v1. Gemini's native
	// endpoint is /v1beta and must not become /v1/v1beta on the ACU channel.
	if strings.HasPrefix(requestPath, "/v1/v1beta/") {
		requestPath = strings.TrimPrefix(requestPath, "/v1")
	}
	requestInfo := *info
	requestInfo.RequestURLPath = requestPath
	resp, err := channel.DoApiRequest(acuWireAdaptor{Adaptor: adaptor}, c, &requestInfo, common.ReaderOnly(storage))
	if err != nil {
		return types.NewError(err, types.ErrorCodeDoRequestFailed, types.ErrOptionWithSkipRetry())
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && c.Writer.Written() {
		return types.NewError(service.RelayErrorHandler(c, resp, false), types.ErrorCodeBadResponseStatusCode, types.ErrOptionWithSkipRetry())
	}
	if c.Writer.Written() && !strings.Contains(strings.ToLower(resp.Header.Get("Content-Type")), "text/event-stream") {
		return types.NewErrorWithStatusCode(errors.New("ACU returned a non-streaming response after stream keepalive"), types.ErrorCodeBadResponse, http.StatusBadGateway, types.ErrOptionWithSkipRetry())
	}
	for name, values := range resp.Header {
		switch strings.ToLower(name) {
		case "connection", "content-length", "content-encoding", "transfer-encoding", "keep-alive", "upgrade",
			"proxy-authenticate", "proxy-authorization", "set-cookie":
			continue
		}
		if c.Writer.Written() {
			continue
		}
		for _, value := range values {
			c.Header(name, value)
		}
	}
	c.Status(resp.StatusCode)
	writer := acuStreamWriter{context: c}
	if _, err := io.Copy(writer, resp.Body); err != nil {
		// The status may already be committed. Do not append an unrelated JSON
		// error to a partial stream or replay an inference request.
		return types.NewError(err, types.ErrorCodeDoRequestFailed, types.ErrOptionWithSkipRetry())
	}
	return nil
}

type acuWireAdaptor struct{ channel.Adaptor }

func (a acuWireAdaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	base := strings.TrimRight(info.ChannelBaseUrl, "/")
	path := info.RequestURLPath
	if strings.HasPrefix(path, "/v1beta/") && strings.HasSuffix(base, "/v1") {
		base = strings.TrimSuffix(base, "/v1")
	}
	return base + path, nil
}

type acuStreamWriter struct{ context *gin.Context }

func (w acuStreamWriter) Write(b []byte) (int, error) {
	helper.ExtendWriteDeadline(w.context)
	n, err := w.context.Writer.Write(b)
	if err == nil {
		w.context.Writer.Flush()
	}
	return n, err
}
