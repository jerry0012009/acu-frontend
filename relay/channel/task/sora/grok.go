package sora

import (
	"encoding/base64"
	"fmt"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"strconv"
	"strings"
)

func grokVideoRequest(req relaycommon.TaskSubmitReq, model string) (map[string]any, error) {
	seconds := req.Duration
	if req.Seconds != "" {
		n, err := strconv.Atoi(req.Seconds)
		if err != nil {
			return nil, fmt.Errorf("invalid seconds")
		}
		seconds = n
	}
	if seconds == 0 {
		seconds = 5
	}
	if seconds < 1 || seconds > 15 {
		return nil, fmt.Errorf("Grok duration must be between 1 and 15 seconds")
	}
	aspect, resolution := "16:9", "480p"
	switch req.Size {
	case "", "848x480", "854x480":
	case "1280x720":
		resolution = "720p"
	case "1920x1080":
		resolution = "1080p"
	case "480x848", "480x854":
		aspect = "9:16"
	case "720x1280":
		aspect = "9:16"
		resolution = "720p"
	case "1080x1920":
		aspect = "9:16"
		resolution = "1080p"
	case "16:9", "9:16", "1:1":
		aspect = req.Size
	default:
		return nil, fmt.Errorf("unsupported Grok video size")
	}
	if resolution == "1080p" && !strings.HasSuffix(model, "1.5") {
		return nil, fmt.Errorf("1080p requires Grok video 1.5")
	}
	body := map[string]any{"model": model, "prompt": req.Prompt, "duration": seconds, "aspect_ratio": aspect, "resolution": resolution}
	if len(req.Images) > 1 {
		return nil, fmt.Errorf("Grok supports one starting image on this endpoint")
	}
	if len(req.Images) == 1 {
		header, data, ok := strings.Cut(req.Images[0], ",")
		if !ok || !strings.HasPrefix(header, "data:image/") || !strings.HasSuffix(header, ";base64") {
			return nil, fmt.Errorf("starting image must be an image data URL")
		}
		if _, err := base64.StdEncoding.DecodeString(data); err != nil {
			return nil, fmt.Errorf("invalid starting image")
		}
		body["image"] = map[string]string{"url": req.Images[0]}
	}
	if len(req.Metadata) > 0 {
		return nil, fmt.Errorf("use size and seconds fields for Grok video parameters")
	}
	return body, nil
}
