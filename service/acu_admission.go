package service

import (
	"fmt"
	"net/http"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/constant"
	"github.com/QuantumNous/new-api/model"
	relaycommon "github.com/QuantumNous/new-api/relay/common"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// CheckACUAdmission performs the P0 wallet/token balance gate without reserving
// or settling quota. The authoritative charge arrives later through ACU Usage
// Finalize. This intentionally supports wallet-funded invited Alpha users only.
func CheckACUAdmission(_ *gin.Context, info *relaycommon.RelayInfo) *types.NewAPIError {
	if info == nil || !info.IsACUChannel {
		return types.NewError(fmt.Errorf("invalid ACU relay context"), types.ErrorCodeInvalidRequest, types.ErrOptionWithSkipRetry())
	}
	user, err := model.GetUserById(info.UserId, false)
	if err != nil {
		return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
	}
	requiredQuota := max(1, common.PreConsumedQuota)
	if user.Status != common.UserStatusEnabled || user.Quota < requiredQuota {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("ACU wallet balance is insufficient"),
			types.ErrorCodeInsufficientUserQuota,
			http.StatusForbidden,
			types.ErrOptionWithSkipRetry(),
			types.ErrOptionWithNoRecordErrorLog(),
		)
	}
	token, err := model.GetTokenByIds(info.TokenId, info.UserId)
	if err != nil {
		return types.NewError(err, types.ErrorCodeQueryDataError, types.ErrOptionWithSkipRetry())
	}
	if token.Status != common.TokenStatusEnabled || (!token.UnlimitedQuota && token.RemainQuota < requiredQuota) {
		return types.NewErrorWithStatusCode(
			fmt.Errorf("ACU token quota is insufficient"),
			types.ErrorCodePreConsumeTokenQuotaFailed,
			http.StatusForbidden,
			types.ErrOptionWithSkipRetry(),
			types.ErrOptionWithNoRecordErrorLog(),
		)
	}
	info.UserQuota = user.Quota
	return nil
}

// RecordACUPendingUsage creates the request-correlated zero-cost log before
// the upstream call, so an early asynchronous Finalize can always update the
// correct New API channel row.
func RecordACUPendingUsage(c *gin.Context, info *relaycommon.RelayInfo) {
	model.RecordACUPendingConsumeLog(c, info.UserId, model.RecordConsumeLogParams{
		ChannelId:      common.GetContextKeyInt(c, constant.ContextKeyChannelId),
		ModelName:      info.OriginModelName,
		TokenName:      c.GetString("token_name"),
		TokenId:        info.TokenId,
		UseTimeSeconds: 0,
		IsStream:       info.IsStream,
		Group:          info.UsingGroup,
		Other: map[string]interface{}{
			"acu_pending_finalize":   true,
			"acu_logical_request_id": "",
		},
	})
}
