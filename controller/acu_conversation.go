package controller

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/service"

	"github.com/gin-gonic/gin"
)

type acuConversationTokenResponse struct {
	ID                int    `json:"id"`
	Name              string `json:"name"`
	MaskedKey         string `json:"masked_key"`
	Group             string `json:"group"`
	RoutingPreference string `json:"routing_preference"`
}

type acuConversationModelResponse struct {
	Label string `json:"label"`
	Value string `json:"value"`
}

func GetACUConversationOptions(c *gin.Context) {
	userID := c.GetInt("id")
	tokens, err := model.GetAllUserTokens(userID, 0, 1000)
	if err != nil {
		common.ApiError(c, err)
		return
	}

	now := time.Now().Unix()
	eligible := make([]*model.Token, 0, len(tokens))
	for _, token := range tokens {
		if service.IsACUConversationTokenEligible(token, now) {
			eligible = append(eligible, token)
		}
	}

	selectedToken := eligibleTokenByID(eligible, c.Query("token_id"))
	if selectedToken == nil && len(eligible) > 0 {
		selectedToken = eligible[0]
	}

	responseTokens := make([]acuConversationTokenResponse, 0, len(eligible))
	for _, token := range eligible {
		preference := strings.TrimSpace(token.ACURoutingPreference)
		if preference == "" {
			preference = "balanced"
		}
		responseTokens = append(responseTokens, acuConversationTokenResponse{
			ID: token.Id, Name: token.Name, MaskedKey: token.GetMaskedKey(),
			Group: token.Group, RoutingPreference: preference,
		})
	}

	models := make([]acuConversationModelResponse, 0)
	selectedTokenID := 0
	if selectedToken != nil {
		selectedTokenID = selectedToken.Id
		modelNames, err := service.GetACUConversationModels(
			c.Request.Context(), selectedToken, c.GetString("user_group"),
		)
		if err != nil {
			common.ApiError(c, err)
			return
		}
		for _, modelName := range modelNames {
			models = append(models, acuConversationModelResponse{
				Label: modelName, Value: modelName,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "",
		"data": gin.H{
			"tokens":            responseTokens,
			"selected_token_id": selectedTokenID,
			"models":            models,
		},
	})
}

func eligibleTokenByID(tokens []*model.Token, requestedTokenID string) *model.Token {
	tokenID, err := strconv.Atoi(strings.TrimSpace(requestedTokenID))
	if err != nil || tokenID <= 0 {
		return nil
	}
	for _, token := range tokens {
		if token.Id == tokenID {
			return token
		}
	}
	return nil
}
