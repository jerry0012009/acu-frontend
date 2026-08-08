package controller

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/service"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

type claudeCountTokensResponse struct {
	InputTokens int `json:"input_tokens"`
}

func CountClaudeTokens(c *gin.Context) {
	var request dto.ClaudeRequest
	if err := c.ShouldBindJSON(&request); err != nil {
		claudeCountTokensError(c, http.StatusBadRequest, fmt.Sprintf("Invalid request body: %v", err))
		return
	}
	if request.Model == "" {
		claudeCountTokensError(c, http.StatusBadRequest, "model is required")
		return
	}

	meta := request.GetTokenCountMeta()
	inputTokens := service.CountTextToken(meta.CombineText, "claude")
	inputTokens += meta.MessagesCount*3 + meta.ToolsCount*8 + meta.NameCount*3 + 3
	for _, file := range meta.Files {
		switch file.FileType {
		case types.FileTypeImage:
			inputTokens += 520
		case types.FileTypeAudio:
			inputTokens += 256
		case types.FileTypeVideo:
			inputTokens += 8192
		default:
			inputTokens += 4096
		}
	}

	c.JSON(http.StatusOK, claudeCountTokensResponse{InputTokens: inputTokens})
}

func claudeCountTokensError(c *gin.Context, status int, message string) {
	c.JSON(status, gin.H{
		"type": "error",
		"error": gin.H{
			"type":    "invalid_request_error",
			"message": message,
		},
	})
}
