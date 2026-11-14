package sora

import (
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"testing"
)

func TestGrokVideoRequestBoundsAndConversion(t *testing.T) {
	p, err := grokVideoRequest(relaycommon.TaskSubmitReq{Prompt: "ball", Seconds: "5", Size: "1280x720"}, "grok-imagine-video")
	require.NoError(t, err)
	assert.Equal(t, 5, p["duration"])
	assert.Equal(t, "720p", p["resolution"])
	assert.Equal(t, "16:9", p["aspect_ratio"])
	for _, req := range []relaycommon.TaskSubmitReq{{Seconds: "-1"}, {Seconds: "99999999999999999"}, {Duration: 16}, {Size: "1920x1080"}, {Metadata: map[string]any{"duration": 999}}} {
		_, err = grokVideoRequest(req, "grok-imagine-video")
		require.Error(t, err)
	}
	_, err = grokVideoRequest(relaycommon.TaskSubmitReq{Size: "1920x1080"}, "grok-imagine-video-1.5")
	require.NoError(t, err)
}
func TestGrokVideoResultReusesOwnedPublicTask(t *testing.T) {
	a := &TaskAdaptor{}
	result, err := a.ParseTaskResult([]byte(`{"status":"done","progress":100,"video":{"url":"/v1/videos/provider-id/content"}}`))
	require.NoError(t, err)
	assert.Equal(t, model.TaskStatusSuccess, result.Status)
	data, err := a.ConvertToOpenAIVideo(&model.Task{TaskID: "task_public", Data: []byte(`{"request_id":"provider-id","status":"done","video":{"url":"private"}}`)})
	require.NoError(t, err)
	assert.Contains(t, string(data), `"id":"task_public"`)
	assert.Contains(t, string(data), `"status":"completed"`)
	assert.NotContains(t, string(data), "provider-id")
	assert.NotContains(t, string(data), "private")
}
