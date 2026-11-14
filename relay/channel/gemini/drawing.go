package gemini

import (
	"encoding/base64"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

func geminiDrawingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	if request.Stream != nil && *request.Stream {
		return nil, fmt.Errorf("Gemini image streaming is not supported on the Images API")
	}
	if request.N != nil && *request.N != 1 {
		return nil, fmt.Errorf("Gemini Images API supports one image per request")
	}
	if len(request.Mask) > 0 {
		return nil, fmt.Errorf("Gemini image masks are not supported")
	}
	parts := []dto.GeminiPart{{Text: request.Prompt}}
	// Existing clients send local reference bytes as data URLs. Do not fetch arbitrary URLs here.
	var images []struct {
		ImageURL string `json:"image_url"`
	}
	if len(request.Images) > 0 {
		if err := common.Unmarshal(request.Images, &images); err != nil {
			return nil, err
		}
	}
	for _, image := range images {
		mime, data, ok := strings.Cut(image.ImageURL, ",")
		if !ok || !strings.HasPrefix(mime, "data:image/") || !strings.HasSuffix(mime, ";base64") {
			return nil, fmt.Errorf("Gemini references must be image data URLs")
		}
		if _, err := base64.StdEncoding.DecodeString(data); err != nil {
			return nil, fmt.Errorf("invalid image data")
		}
		parts = append(parts, dto.GeminiPart{InlineData: &dto.GeminiInlineData{MimeType: strings.TrimSuffix(strings.TrimPrefix(mime, "data:"), ";base64"), Data: data}})
	}
	if len(request.Image) > 0 && len(images) == 0 {
		var image string
		if err := common.Unmarshal(request.Image, &image); err != nil {
			return nil, fmt.Errorf("image must be a data URL")
		}
		header, data, ok := strings.Cut(image, ",")
		if !ok || !strings.HasPrefix(header, "data:image/") || !strings.HasSuffix(header, ";base64") {
			return nil, fmt.Errorf("image must be a data URL")
		}
		if _, err := base64.StdEncoding.DecodeString(data); err != nil {
			return nil, err
		}
		parts = append(parts, dto.GeminiPart{InlineData: &dto.GeminiInlineData{MimeType: strings.TrimSuffix(strings.TrimPrefix(header, "data:"), ";base64"), Data: data}})
	}
	if strings.HasPrefix(c.GetHeader("Content-Type"), "multipart/form-data") {
		form, err := common.ParseMultipartFormReusable(c)
		if err != nil {
			return nil, err
		}
		for name, files := range form.File {
			if name != "image" && name != "image[]" {
				continue
			}
			for _, file := range files {
				if file.Size > 20<<20 {
					return nil, fmt.Errorf("reference image too large")
				}
				f, err := file.Open()
				if err != nil {
					return nil, err
				}
				data, err := io.ReadAll(io.LimitReader(f, (20<<20)+1))
				f.Close()
				if err != nil {
					return nil, err
				}
				if len(data) > 20<<20 {
					return nil, fmt.Errorf("reference image too large")
				}
				mime := http.DetectContentType(data)
				if !strings.HasPrefix(mime, "image/") {
					return nil, fmt.Errorf("invalid reference image")
				}
				parts = append(parts, dto.GeminiPart{InlineData: &dto.GeminiInlineData{MimeType: mime, Data: base64.StdEncoding.EncodeToString(data)}})
			}
		}
	}
	imageConfig := map[string]string{}
	switch request.Size {
	case "", "auto":
	case "1024x1024", "512x512", "256x256", "1:1":
		imageConfig["aspectRatio"] = "1:1"
	case "1536x1024", "3:2":
		imageConfig["aspectRatio"] = "3:2"
	case "1024x1536", "2:3":
		imageConfig["aspectRatio"] = "2:3"
	case "1792x1024", "16:9":
		imageConfig["aspectRatio"] = "16:9"
	case "1024x1792", "9:16":
		imageConfig["aspectRatio"] = "9:16"
	default:
		return nil, fmt.Errorf("unsupported Gemini image size")
	}
	config, err := common.Marshal(imageConfig)
	if err != nil {
		return nil, err
	}
	return dto.GeminiChatRequest{Contents: []dto.GeminiChatContent{{Role: "user", Parts: parts}}, GenerationConfig: dto.GeminiChatGenerationConfig{ResponseModalities: []string{"TEXT", "IMAGE"}, ImageConfig: config}}, nil
}

func GeminiDrawingHandler(c *gin.Context, info *relaycommon.RelayInfo, resp *http.Response) (*dto.Usage, *types.NewAPIError) {
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, (64<<20)+1))
	if err != nil || len(data) > 64<<20 {
		return nil, types.NewError(fmt.Errorf("image response too large or unreadable"), types.ErrorCodeBadResponseBody)
	}
	var result dto.GeminiChatResponse
	if err = common.Unmarshal(data, &result); err != nil {
		return nil, types.NewError(err, types.ErrorCodeBadResponseBody)
	}
	images := []dto.ImageData{}
	for _, candidate := range result.Candidates {
		for _, part := range candidate.Content.Parts {
			if !part.Thought && part.InlineData != nil && strings.HasPrefix(part.InlineData.MimeType, "image/") && part.InlineData.Data != "" {
				images = append(images, dto.ImageData{B64Json: part.InlineData.Data})
			}
		}
	}
	if len(images) == 0 || len(images) > dto.MaxImageN {
		return nil, types.NewError(fmt.Errorf("no valid image output"), types.ErrorCodeBadResponseBody)
	}
	usage := buildUsageFromGeminiResponse(c, info, &result)
	info.ImageResponseCountObserved = true
	info.ImageResponseCount = len(images)
	c.JSON(http.StatusOK, dto.ImageResponse{Created: common.GetTimestamp(), Data: images})
	return &usage, nil
}
