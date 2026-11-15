package sora

import (
	"fmt"
	"strconv"
	"strings"

	relaycommon "github.com/QuantumNous/new-api/relay/common"
)

func isSeedance(model string) bool { return strings.HasPrefix(model, "doubao-seedance-") }

func seedanceGeometry(resolution, ratio string) (int, int) {
	height := map[string]int{"480p": 480, "720p": 720, "1080p": 1080, "4k": 2160}[resolution]
	parts := strings.Split(ratio, ":")
	w, _ := strconv.Atoi(parts[0])
	h, _ := strconv.Atoi(parts[1])
	return (height*w/h + 15) / 16 * 16, height
}

func seedanceVideoRequest(req relaycommon.TaskSubmitReq, model string) (map[string]any, error) {
	seconds := req.Duration
	if req.Seconds != "" {
		n, err := strconv.Atoi(req.Seconds)
		if err != nil {
			return nil, fmt.Errorf("invalid seconds")
		}
		seconds = n
	}
	if seconds == 0 {
		seconds = 4
	}
	max := 15
	if model == "doubao-seedance-2.5" {
		max = 30
	}
	if seconds < 4 || seconds > max {
		return nil, fmt.Errorf("Seedance duration must be between 4 and %d seconds", max)
	}
	resolution, ratio := "720p", "16:9"
	if strings.Contains(req.Size, "x") {
		parts := strings.Split(req.Size, "x")
		if len(parts) != 2 {
			return nil, fmt.Errorf("invalid Seedance size")
		}
		w, _ := strconv.Atoi(parts[0])
		h, _ := strconv.Atoi(parts[1])
		if w <= 0 || h <= 0 {
			return nil, fmt.Errorf("invalid Seedance size")
		}
		small := h
		if w < h {
			small = w
			ratio = "9:16"
		}
		switch small {
		case 480:
			resolution = "480p"
		case 720:
			resolution = "720p"
		case 1080:
			resolution = "1080p"
		case 2160:
			resolution = "4k"
		default:
			return nil, fmt.Errorf("unsupported Seedance size")
		}
		if w == h {
			ratio = "1:1"
		}
	} else if req.Size != "" {
		ratio = req.Size
	}
	if v, ok := req.Metadata["resolution"].(string); ok {
		resolution = v
	}
	if v, ok := req.Metadata["ratio"].(string); ok {
		ratio = v
	}
	if !strings.Contains("|16:9|9:16|1:1|4:3|3:4|21:9|", "|"+ratio+"|") {
		return nil, fmt.Errorf("unsupported Seedance ratio")
	}
	if resolution != "480p" && resolution != "720p" && resolution != "1080p" && resolution != "4k" {
		return nil, fmt.Errorf("unsupported Seedance resolution")
	}
	if model == "doubao-seedance-2.5" && (resolution == "480p" || resolution == "4k") {
		return nil, fmt.Errorf("Seedance 2.5 supports 720p or 1080p")
	}
	if (strings.HasSuffix(model, "-mini") || strings.HasSuffix(model, "-fast")) && (resolution == "1080p" || resolution == "4k") {
		return nil, fmt.Errorf("Seedance fast/mini supports 480p or 720p")
	}
	body := map[string]any{"model": model, "prompt": req.Prompt, "duration": seconds, "resolution": resolution, "ratio": ratio, "generate_audio": false}
	for k, v := range req.Metadata {
		switch k {
		case "generate_audio", "output_format", "seed", "watermark", "camera_fixed":
			body[k] = v
		case "resolution", "ratio":
		default:
			return nil, fmt.Errorf("unsupported Seedance metadata field: %s", k)
		}
	}
	if len(req.Images) > 9 {
		return nil, fmt.Errorf("Seedance accepts at most 9 reference images on this endpoint")
	}
	if len(req.Images) > 0 {
		images := make([]map[string]string, 0, len(req.Images))
		for _, image := range req.Images {
			if !strings.HasPrefix(image, "https://") {
				return nil, fmt.Errorf("Seedance reference images require public HTTPS URLs")
			}
			images = append(images, map[string]string{"url": image, "role": "reference_image"})
		}
		body["images"] = images
	}
	return body, nil
}
