package controller

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/middleware"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"

	"github.com/gin-gonic/gin"
)

func Playground(c *gin.Context) {
	var newAPIError *types.NewAPIError

	defer func() {
		if newAPIError != nil {
			c.JSON(newAPIError.StatusCode, gin.H{
				"error": newAPIError.ToOpenAIError(),
			})
		}
	}()

	useAccessToken := c.GetBool("use_access_token")
	if useAccessToken {
		newAPIError = types.NewError(errors.New("暂不支持使用 access token"), types.ErrorCodeAccessDenied, types.ErrOptionWithSkipRetry())
		return
	}

	relayInfo, err := relaycommon.GenRelayInfo(c, types.RelayFormatOpenAI, nil, nil)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
		return
	}

	userId := c.GetInt("id")

	// Write user context to ensure acceptUnsetRatio is available
	userCache, err := model.GetUserCache(userId)
	if err != nil {
		newAPIError = types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
		return
	}
	userCache.WriteContext(c)

	playgroundToken := &model.Token{
		UserId: userId,
		Name:   fmt.Sprintf("playground-%s", relayInfo.UsingGroup),
		Group:  relayInfo.UsingGroup,
	}
	if relayInfo.OriginModelName == "acu-auto" || relayInfo.OriginModelName == "acu-high" {
		playgroundToken, err = getPlaygroundACUToken(userId, time.Now().Unix())
		if err != nil {
			newAPIError = types.NewErrorWithStatusCode(
				err,
				types.ErrorCodeAccessDenied,
				http.StatusForbidden,
				types.ErrOptionWithSkipRetry(),
			)
			return
		}
	}
	_ = middleware.SetupContextForToken(c, playgroundToken)

	Relay(c, types.RelayFormatOpenAI)
}

func getPlaygroundACUToken(userId int, now int64) (*model.Token, error) {
	tokens, err := model.GetAllUserTokens(userId, 0, 1000)
	if err != nil {
		return nil, err
	}
	return selectPlaygroundACUToken(tokens, now)
}

func selectPlaygroundACUToken(tokens []*model.Token, now int64) (*model.Token, error) {
	for _, token := range tokens {
		if token == nil || token.Status != common.TokenStatusEnabled {
			continue
		}
		if token.ExpiredTime != -1 && token.ExpiredTime <= now {
			continue
		}
		if !token.UnlimitedQuota && token.RemainQuota < max(1, common.PreConsumedQuota) {
			continue
		}
		if token.ACUProfileLimitsEnabled {
			hasResponsesProfile := false
			for _, profileId := range token.ACUProfileLimits {
				if strings.HasSuffix(strings.ToLower(strings.TrimSpace(profileId)), ":responses") {
					hasResponsesProfile = true
					break
				}
			}
			if !hasResponsesProfile {
				continue
			}
		}
		return token, nil
	}
	return nil, errors.New("ACU Conversation requires an enabled API key with available quota")
}
