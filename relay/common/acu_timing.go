package common

import (
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const acuFirstModelEventMarkedKey = "acu_first_model_event_marked"

// MarkACUFirstModelEvent replaces the generic first-SSE timing with the first
// meaningful model event for ACU requests. The generic stream scanner may mark
// lifecycle events such as response.created/message_start earlier; those are
// deliberately excluded from this ACU-specific user-visible timing.
func MarkACUFirstModelEvent(c *gin.Context, info *RelayInfo) {
	if c == nil || info == nil || !info.IsACUChannel || info.StartTime.IsZero() {
		return
	}
	if marked, ok := c.Get(acuFirstModelEventMarkedKey); ok && marked == true {
		return
	}
	info.FirstResponseTime = time.Now()
	c.Set(acuFirstModelEventMarkedKey, true)
}

func IsACUResponsesModelEvent(eventType string) bool {
	switch eventType {
	case "response.output_item.added", "response.output_item.done",
		"response.content_part.added", "response.content_part.done",
		"response.output_text.delta", "response.reasoning.delta",
		"response.reasoning_text.delta", "response.reasoning_summary_text.delta",
		"response.function_call_arguments.delta", "response.custom_tool_call_input.delta":
		return true
	default:
		return false
	}
}

func IsACUClaudeModelEvent(eventType string) bool {
	eventType = strings.TrimSpace(eventType)
	return eventType == "content_block_start" || eventType == "content_block_delta"
}
