package sub2api

import (
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/relay/channel"
	"github.com/QuantumNous/new-api/relay/channel/claude"
	"github.com/QuantumNous/new-api/relay/channel/gemini"
	"github.com/QuantumNous/new-api/relay/channel/openai"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	relayconstant "github.com/QuantumNous/new-api/relay/constant"
	"github.com/QuantumNous/new-api/relay/helper"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type Adaptor struct {
	openaiAdaptor openai.Adaptor
	claudeAdaptor claude.Adaptor
	geminiAdaptor gemini.Adaptor
}

func (a *Adaptor) Init(info *relaycommon.RelayInfo) {
	a.openaiAdaptor.Init(info)
	a.claudeAdaptor.Init(info)
	a.geminiAdaptor.Init(info)
}

func (a *Adaptor) GetRequestURL(info *relaycommon.RelayInfo) (string, error) {
	if info.RelayMode == relayconstant.RelayModeAlphaSearch {
		return relaycommon.GetFullRequestURL(info.ChannelBaseUrl, "/v1/alpha/search", info.ChannelType), nil
	}
	if isImageChatBridge(info) {
		return relaycommon.GetFullRequestURL(info.ChannelBaseUrl, "/v1/images/generations", info.ChannelType), nil
	}
	return relaycommon.GetFullRequestURL(info.ChannelBaseUrl, info.RequestURLPath, info.ChannelType), nil
}

func (a *Adaptor) SetupRequestHeader(c *gin.Context, req *http.Header, info *relaycommon.RelayInfo) error {
	channel.SetupApiRequestHeader(info, c, req)
	req.Set("Authorization", "Bearer "+info.ApiKey)
	if isImageChatBridge(info) {
		req.Set("Content-Type", "application/json")
		req.Set("Accept", "application/json")
	}

	switch info.RelayFormat {
	case types.RelayFormatClaude:
		req.Set("x-api-key", info.ApiKey)
		if req.Get("anthropic-version") == "" {
			anthropicVersion := c.Request.Header.Get("anthropic-version")
			if anthropicVersion == "" {
				anthropicVersion = "2023-06-01"
			}
			req.Set("anthropic-version", anthropicVersion)
		}
	case types.RelayFormatGemini:
		req.Set("x-goog-api-key", info.ApiKey)
	}
	return nil
}

func (a *Adaptor) ConvertOpenAIRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeneralOpenAIRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	if !isImageChatBridge(info) {
		return request, nil
	}

	prompt := imagePromptFromChat(request)
	if prompt == "" {
		return nil, errors.New("image generation prompt is empty")
	}

	imageRequest := &dto.ImageRequest{
		Model:  request.Model,
		Prompt: prompt,
		Size:   request.Size,
	}
	if request.N != nil {
		n := *request.N
		if n < 1 || n > dto.MaxImageN {
			return nil, fmt.Errorf("n must be an integer between 1 and %d", dto.MaxImageN)
		}
		imageN := uint(n)
		imageRequest.N = &imageN
	}
	info.FinalRequestRelayFormat = types.RelayFormatOpenAIImage
	return imageRequest, nil
}

func isImageChatBridge(info *relaycommon.RelayInfo) bool {
	return info != nil &&
		info.RelayMode == relayconstant.RelayModeChatCompletions &&
		common.IsImageGenerationModel(info.OriginModelName)
}

func imagePromptFromChat(request *dto.GeneralOpenAIRequest) string {
	for i := len(request.Messages) - 1; i >= 0; i-- {
		if request.Messages[i].Role != "user" {
			continue
		}
		if prompt := strings.TrimSpace(request.Messages[i].StringContent()); prompt != "" {
			return prompt
		}
	}
	for i := len(request.Messages) - 1; i >= 0; i-- {
		if prompt := strings.TrimSpace(request.Messages[i].StringContent()); prompt != "" {
			return prompt
		}
	}
	if prompt, ok := request.Prompt.(string); ok {
		return strings.TrimSpace(prompt)
	}
	return ""
}

type imageChatResponse struct {
	Created int64           `json:"created"`
	Data    []dto.ImageData `json:"data"`
	Error   any             `json:"error,omitempty"`
	Usage   dto.Usage       `json:"usage"`
}

func imageChatHandler(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (*dto.Usage, *types.NewAPIError) {
	defer service.CloseResponseBodyGracefully(resp)

	responseBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeReadResponseBodyFailed, http.StatusInternalServerError)
	}

	var imageResponse imageChatResponse
	if err := common.Unmarshal(responseBody, &imageResponse); err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponseBody, http.StatusInternalServerError)
	}
	if openAIError := dto.GetOpenAIError(imageResponse.Error); openAIError != nil && openAIError.Type != "" {
		return nil, types.WithOpenAIError(*openAIError, resp.StatusCode)
	}

	normalizeImageUsage(&imageResponse.Usage)
	contentParts := make([]string, 0, len(imageResponse.Data))
	for _, image := range imageResponse.Data {
		switch {
		case strings.TrimSpace(image.Url) != "":
			contentParts = append(contentParts, fmt.Sprintf("![image_%d](%s)", len(contentParts)+1, image.Url))
		case strings.TrimSpace(image.B64Json) != "":
			mimeType := imageBase64MimeType(image.B64Json)
			contentParts = append(contentParts, fmt.Sprintf(
				"![image_%d](data:%s;base64,%s)",
				len(contentParts)+1,
				mimeType,
				image.B64Json,
			))
		}
	}
	if len(contentParts) == 0 {
		return nil, types.NewOpenAIError(
			errors.New("upstream image response contained no image data"),
			types.ErrorCodeBadResponseBody,
			http.StatusBadGateway,
		)
	}

	imageCount := len(contentParts)
	info.ImageResponseCountObserved = true
	info.ImageResponseCount = imageCount
	if info.PriceData.UsePrice && imageCount <= dto.MaxImageN {
		info.PriceData.AddOtherRatio("n", float64(imageCount))
	}
	if !hasCompleteImageUsage(&imageResponse.Usage) || imageCount > dto.MaxImageN {
		info.PriceData.ModelPrice = common.ImageFallbackPriceUSD
		info.ImageBillingFallback = true
		if imageCount > dto.MaxImageN {
			info.ImageBillingFallbackReason = "upstream image payload count was invalid"
		} else {
			info.ImageBillingFallbackReason = "upstream image usage was incomplete"
		}
	}

	content := strings.Join(contentParts, "\n\n")
	created := imageResponse.Created
	if created == 0 {
		created = time.Now().Unix()
	}
	info.SetFirstResponseTime()

	if info.IsStream {
		if err := writeImageChatStream(c, info, created, content, imageResponse.Usage); err != nil {
			return nil, types.NewOpenAIError(err, types.ErrorCodeBadResponse, http.StatusInternalServerError)
		}
		return &imageResponse.Usage, nil
	}

	chatResponse := dto.OpenAITextResponse{
		Id:      helper.GetResponseID(c),
		Model:   info.OriginModelName,
		Object:  "chat.completion",
		Created: created,
		Choices: []dto.OpenAITextResponseChoice{
			{
				Index: 0,
				Message: dto.Message{
					Role:    "assistant",
					Content: content,
				},
				FinishReason: "stop",
			},
		},
		Usage: imageResponse.Usage,
	}
	chatBody, err := common.Marshal(chatResponse)
	if err != nil {
		return nil, types.NewOpenAIError(err, types.ErrorCodeJsonMarshalFailed, http.StatusInternalServerError)
	}
	resp.Header.Set("Content-Type", "application/json")
	service.IOCopyBytesGracefully(c, resp, chatBody)
	return &imageResponse.Usage, nil
}

func normalizeImageUsage(usage *dto.Usage) {
	if usage.InputTokens != 0 {
		usage.PromptTokens = usage.InputTokens
	}
	if usage.OutputTokens != 0 {
		usage.CompletionTokens = usage.OutputTokens
	}
	if usage.InputTokensDetails != nil {
		usage.PromptTokensDetails = *usage.InputTokensDetails
	}
	if usage.OutputTokensDetails != nil {
		usage.CompletionTokenDetails = *usage.OutputTokensDetails
	}
	if usage.TotalTokens == 0 {
		usage.TotalTokens = usage.PromptTokens + usage.CompletionTokens
	}
}

func hasCompleteImageUsage(usage *dto.Usage) bool {
	return usage != nil &&
		usage.PromptTokens > 0 &&
		usage.CompletionTokens > 0 &&
		usage.TotalTokens >= usage.PromptTokens+usage.CompletionTokens &&
		usage.CompletionTokenDetails.ImageTokens > 0
}

func imageBase64MimeType(encoded string) string {
	decoder := base64.NewDecoder(base64.StdEncoding, strings.NewReader(encoded))
	header := make([]byte, 12)
	n, err := io.ReadFull(decoder, header)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) {
		return "image/png"
	}
	header = header[:n]
	switch {
	case len(header) >= 8 && string(header[:8]) == "\x89PNG\r\n\x1a\n":
		return "image/png"
	case len(header) >= 3 && header[0] == 0xff && header[1] == 0xd8 && header[2] == 0xff:
		return "image/jpeg"
	case len(header) >= 12 && string(header[:4]) == "RIFF" && string(header[8:12]) == "WEBP":
		return "image/webp"
	default:
		return "image/png"
	}
}

func writeImageChatStream(c *gin.Context, info *relaycommon.RelayInfo, created int64, content string, usage dto.Usage) error {
	helper.SetEventStreamHeaders(c)
	responseID := helper.GetResponseID(c)
	if err := helper.ObjectData(c, helper.GenerateStartEmptyResponse(responseID, created, info.OriginModelName, nil)); err != nil {
		return err
	}
	contentChunk := dto.ChatCompletionsStreamResponse{
		Id:      responseID,
		Object:  "chat.completion.chunk",
		Created: created,
		Model:   info.OriginModelName,
		Choices: []dto.ChatCompletionsStreamResponseChoice{
			{
				Index: 0,
				Delta: dto.ChatCompletionsStreamResponseChoiceDelta{
					Content: common.GetPointer(content),
				},
			},
		},
	}
	if err := helper.ObjectData(c, contentChunk); err != nil {
		return err
	}
	if err := helper.ObjectData(c, helper.GenerateStopResponse(responseID, created, info.OriginModelName, "stop")); err != nil {
		return err
	}
	if info.ShouldIncludeUsage {
		if err := helper.ObjectData(c, helper.GenerateFinalUsageResponse(responseID, created, info.OriginModelName, usage)); err != nil {
			return err
		}
	}
	helper.Done(c)
	return nil
}

func (a *Adaptor) ConvertOpenAIResponsesRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.OpenAIResponsesRequest) (any, error) {
	return request, nil
}

func (a *Adaptor) ConvertEmbeddingRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.EmbeddingRequest) (any, error) {
	return request, nil
}

func (a *Adaptor) ConvertClaudeRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.ClaudeRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	return request, nil
}

func (a *Adaptor) ConvertGeminiRequest(c *gin.Context, info *relaycommon.RelayInfo, request *dto.GeminiChatRequest) (any, error) {
	if request == nil {
		return nil, errors.New("request is nil")
	}
	return request, nil
}

func (a *Adaptor) ConvertImageRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.ImageRequest) (any, error) {
	return a.openaiAdaptor.ConvertImageRequest(c, info, request)
}

func (a *Adaptor) ConvertRerankRequest(c *gin.Context, relayMode int, request dto.RerankRequest) (any, error) {
	return nil, errors.New("endpoint not supported")
}

func (a *Adaptor) ConvertAudioRequest(c *gin.Context, info *relaycommon.RelayInfo, request dto.AudioRequest) (io.Reader, error) {
	return nil, errors.New("endpoint not supported")
}

func (a *Adaptor) DoRequest(c *gin.Context, info *relaycommon.RelayInfo, requestBody io.Reader) (any, error) {
	return channel.DoApiRequest(a, c, info, requestBody)
}

func (a *Adaptor) DoResponse(c *gin.Context, resp *http.Response, info *relaycommon.RelayInfo) (usage any, err *types.NewAPIError) {
	if isImageChatBridge(info) {
		return imageChatHandler(c, resp, info)
	}
	switch info.RelayFormat {
	case types.RelayFormatClaude:
		return a.claudeAdaptor.DoResponse(c, resp, info)
	case types.RelayFormatGemini:
		return a.geminiAdaptor.DoResponse(c, resp, info)
	default:
		return a.openaiAdaptor.DoResponse(c, resp, info)
	}
}

func (a *Adaptor) GetModelList() []string {
	return ModelList
}

func (a *Adaptor) GetChannelName() string {
	return ChannelName
}
