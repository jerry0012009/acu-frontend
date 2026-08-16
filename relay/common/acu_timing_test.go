package common

import (
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/stretchr/testify/assert"
)

func TestMarkACUFirstModelEventOverwritesLifecycleTimingOnlyOnce(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	start := time.Now().Add(-2 * time.Second)
	lifecycle := start.Add(100 * time.Millisecond)
	info := &RelayInfo{
		IsACUChannel:      true,
		StartTime:         start,
		FirstResponseTime: lifecycle,
	}

	MarkACUFirstModelEvent(c, info)
	meaningful := info.FirstResponseTime
	assert.True(t, meaningful.After(lifecycle))

	time.Sleep(time.Millisecond)
	MarkACUFirstModelEvent(c, info)
	assert.Equal(t, meaningful, info.FirstResponseTime)
}

func TestMarkACUFirstModelEventIgnoresNonACURequests(t *testing.T) {
	gin.SetMode(gin.TestMode)
	c, _ := gin.CreateTestContext(httptest.NewRecorder())
	original := time.Now().Add(-time.Second)
	info := &RelayInfo{StartTime: original, FirstResponseTime: original}

	MarkACUFirstModelEvent(c, info)
	assert.Equal(t, original, info.FirstResponseTime)
}

func TestACUMeaningfulEventClassification(t *testing.T) {
	assert.False(t, IsACUResponsesModelEvent("response.created"))
	assert.True(t, IsACUResponsesModelEvent("response.output_text.delta"))
	assert.True(t, IsACUResponsesModelEvent("response.function_call_arguments.delta"))
	assert.False(t, IsACUClaudeModelEvent("message_start"))
	assert.True(t, IsACUClaudeModelEvent("content_block_start"))
	assert.True(t, IsACUClaudeModelEvent("content_block_delta"))
}
