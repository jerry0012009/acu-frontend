package relay

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/relay/channel"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// ACURawHelper keeps the authenticated ACU wire untouched. Router owns protocol
// adaptation and reports authoritative usage through Usage Finalize.
func ACURawHelper(c *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
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
	resp, err := channel.DoApiRequest(acuWireAdaptor{Adaptor: adaptor}, c, info, common.ReaderOnly(storage))
	if err != nil {
		return types.NewError(err, types.ErrorCodeDoRequestFailed, types.ErrOptionWithSkipRetry())
	}
	defer resp.Body.Close()
	for name, values := range resp.Header {
		switch strings.ToLower(name) {
		case "connection", "content-length", "content-encoding", "transfer-encoding", "keep-alive", "upgrade",
			"proxy-authenticate", "proxy-authorization", "set-cookie":
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
	return strings.TrimRight(info.ChannelBaseUrl, "/") + info.RequestURLPath, nil
}

type acuStreamWriter struct{ context *gin.Context }

func (w acuStreamWriter) Write(b []byte) (int, error) {
	n, err := w.context.Writer.Write(b)
	if err == nil {
		w.context.Writer.Flush()
	}
	return n, err
}
