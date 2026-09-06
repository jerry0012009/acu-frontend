package service

import (
	"context"
	"errors"
	"fmt"
	"html"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"gorm.io/gorm"
)

func advisorNotificationPreferences(setting dto.UserSetting, accountEmail string) dto.ACUAdvisorNotificationPreferences {
	inApp := setting.AdvisorNotificationInAppEnabled == nil || *setting.AdvisorNotificationInAppEnabled
	browser := setting.AdvisorNotificationBrowserEnabled != nil && *setting.AdvisorNotificationBrowserEnabled
	email := setting.AdvisorNotificationEmailEnabled == nil || *setting.AdvisorNotificationEmailEnabled
	target := strings.TrimSpace(setting.AdvisorNotificationEmail)
	if target == "" {
		target = strings.TrimSpace(accountEmail)
	}
	return dto.ACUAdvisorNotificationPreferences{
		InAppEnabled: inApp, BrowserEnabled: browser, EmailEnabled: email,
		Email: strings.TrimSpace(setting.AdvisorNotificationEmail), EmailTarget: target,
	}
}

func GetPrivateACUAdvisorNotificationPreferences(
	ctx context.Context,
	userID int,
) (dto.ACUAdvisorNotificationPreferences, error) {
	_ = ctx
	user, err := model.GetUserById(userID, true)
	if err != nil {
		return dto.ACUAdvisorNotificationPreferences{}, err
	}
	return advisorNotificationPreferences(user.GetSetting(), user.Email), nil
}

func UpdatePrivateACUAdvisorNotificationPreferences(
	ctx context.Context,
	userID int,
	input dto.ACUAdvisorNotificationPreferences,
) (dto.ACUAdvisorNotificationPreferences, error) {
	_ = ctx
	if input.Email != "" {
		if _, err := mail.ParseAddress(input.Email); err != nil {
			return dto.ACUAdvisorNotificationPreferences{}, fmt.Errorf("invalid Advisor notification email")
		}
	}
	user, err := model.GetUserById(userID, true)
	if err != nil {
		return dto.ACUAdvisorNotificationPreferences{}, err
	}
	setting := user.GetSetting()
	setting.AdvisorNotificationInAppEnabled = &input.InAppEnabled
	setting.AdvisorNotificationBrowserEnabled = &input.BrowserEnabled
	setting.AdvisorNotificationEmailEnabled = &input.EmailEnabled
	setting.AdvisorNotificationEmail = strings.TrimSpace(input.Email)
	if err := model.UpdateUserSetting(userID, setting); err != nil {
		return dto.ACUAdvisorNotificationPreferences{}, err
	}
	return advisorNotificationPreferences(setting, user.Email), nil
}

func ListPrivateACUAdvisorNotifications(
	ctx context.Context,
	userID int,
	limit int,
) (dto.ACUAdvisorNotificationList, error) {
	_ = ctx
	if limit <= 0 {
		limit = 20
	}
	if limit > 100 {
		limit = 100
	}
	var rows []model.ACUAdvisorNotification
	if err := model.DB.Where("user_id = ?", userID).
		Order("created_at DESC, id DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return dto.ACUAdvisorNotificationList{}, err
	}
	var unread int64
	if err := model.DB.Model(&model.ACUAdvisorNotification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Count(&unread).Error; err != nil {
		return dto.ACUAdvisorNotificationList{}, err
	}
	user, err := model.GetUserById(userID, true)
	if err != nil {
		return dto.ACUAdvisorNotificationList{}, err
	}
	if !advisorNotificationPreferences(user.GetSetting(), user.Email).InAppEnabled {
		unread = 0
	}
	result := dto.ACUAdvisorNotificationList{UnreadCount: unread}
	for _, row := range rows {
		result.Notifications = append(result.Notifications, notificationDTO(row))
	}
	return result, nil
}

func MarkPrivateACUAdvisorNotificationRead(
	ctx context.Context,
	userID int,
	advisorID string,
) error {
	_ = ctx
	now := time.Now()
	result := model.DB.Model(&model.ACUAdvisorNotification{}).
		Where("user_id = ? AND advisor_id = ?", userID, advisorID).
		Where("read_at IS NULL").
		Update("read_at", now)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		var exists int64
		if err := model.DB.Model(&model.ACUAdvisorNotification{}).
			Where("user_id = ? AND advisor_id = ?", userID, advisorID).
			Count(&exists).Error; err != nil {
			return err
		}
		if exists == 0 {
			return gorm.ErrRecordNotFound
		}
	}
	return nil
}

func MarkAllPrivateACUAdvisorNotificationsRead(ctx context.Context, userID int) error {
	_ = ctx
	return model.DB.Model(&model.ACUAdvisorNotification{}).
		Where("user_id = ? AND read_at IS NULL", userID).
		Update("read_at", time.Now()).Error
}

func ReceivePrivateACUAdvisorEvent(
	ctx context.Context,
	input dto.ACUAdvisorNotificationEvent,
) error {
	_ = ctx
	userID, err := strconv.Atoi(strings.TrimSpace(input.NewAPIUserID))
	if err != nil || userID <= 0 {
		return errors.New("invalid Advisor user id")
	}
	advisorID := strings.TrimSpace(input.AdvisorID)
	if advisorID == "" {
		return errors.New("Advisor id is required")
	}
	var notification model.ACUAdvisorNotification
	var shouldEmail bool
	var emailTarget string
	eventType := strings.TrimSpace(input.EventType)
	if eventType == "" {
		eventType = "private_acu_advisor_ready"
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		var existing model.ACUAdvisorNotification
		if err := tx.Where("advisor_id = ?", advisorID).First(&existing).Error; err == nil {
			notification = existing
			incomingReferenceStatus := strings.TrimSpace(input.ReferenceStatus)
			statusCanAdvance := (incomingReferenceStatus == "injected" &&
				existing.ReferenceStatus != "injected" &&
				existing.ReferenceStatus != "failed") ||
				(incomingReferenceStatus == "failed" &&
					existing.ReferenceStatus == "queued")
			if eventType == "private_acu_advisor_status" && statusCanAdvance {
				updates := map[string]interface{}{
					"reference_status":               incomingReferenceStatus,
					"consumed_by_logical_request_id": strings.TrimSpace(input.ConsumedByLogicalRequestID),
				}
				if consumedAt := parseAdvisorConsumedAt(input.ConsumedAt); consumedAt != nil {
					updates["consumed_at"] = consumedAt
				}
				if err := tx.Model(&existing).Updates(updates).Error; err != nil {
					return err
				}
				notification.ReferenceStatus = incomingReferenceStatus
				notification.ConsumedByLogicalRequestID = strings.TrimSpace(input.ConsumedByLogicalRequestID)
				notification.ConsumedAt = parseAdvisorConsumedAt(input.ConsumedAt)
			}
			return nil
		} else if !errors.Is(err, gorm.ErrRecordNotFound) {
			return err
		} else if eventType == "private_acu_advisor_status" {
			// The ready event is durable and may still be in flight.
			// Retrying the status event preserves eventual consistency.
			return gorm.ErrRecordNotFound
		}
		user, err := model.GetUserById(userID, true)
		if err != nil {
			return err
		}
		prefs := advisorNotificationPreferences(user.GetSetting(), user.Email)
		now := time.Now()
		notification = model.ACUAdvisorNotification{
			AdvisorID: advisorID, UserID: userID,
			SessionID:                  strings.TrimSpace(input.SessionID),
			LogicalRequestID:           strings.TrimSpace(input.LogicalRequestID),
			Status:                     strings.TrimSpace(input.Status),
			ProblemSummary:             strings.TrimSpace(input.Problem),
			AdviceSummary:              strings.TrimSpace(input.Advice),
			ReferenceStatus:            strings.TrimSpace(input.ReferenceStatus),
			ConsumedByLogicalRequestID: strings.TrimSpace(input.ConsumedByLogicalRequestID),
			TargetPath:                 "/private-acu/advisor?advisor=" + advisorID,
			SourceCreatedAt:            now,
		}
		if notification.Status == "" {
			notification.Status = "risk"
		}
		if notification.ReferenceStatus == "" {
			notification.ReferenceStatus = "queued"
		}
		notification.ConsumedAt = parseAdvisorConsumedAt(input.ConsumedAt)
		if err := tx.Create(&notification).Error; err != nil {
			if errors.Is(err, gorm.ErrDuplicatedKey) {
				return tx.Where("advisor_id = ?", advisorID).First(&notification).Error
			}
			return err
		}
		shouldEmail = eventType == "private_acu_advisor_ready" &&
			prefs.EmailEnabled && prefs.EmailTarget != ""
		emailTarget = prefs.EmailTarget
		if shouldEmail {
			delivery := model.ACUAdvisorNotificationDelivery{
				NotificationID: notification.ID,
				Channel:        "email",
				Status:         "pending",
			}
			if err := tx.Where("notification_id = ? AND channel = ?", notification.ID, "email").
				FirstOrCreate(&delivery).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return err
	}
	if shouldEmail {
		if err := sendPrivateACUAdvisorEmail(notification, emailTarget); err != nil {
			_ = model.DB.Model(&model.ACUAdvisorNotificationDelivery{}).
				Where("notification_id = ? AND channel = ?", notification.ID, "email").
				Updates(map[string]interface{}{
					"status": "failed", "attempt_count": gorm.Expr("attempt_count + 1"),
					"last_error": err.Error(),
				}).Error
		} else {
			now := time.Now()
			_ = model.DB.Model(&model.ACUAdvisorNotificationDelivery{}).
				Where("notification_id = ? AND channel = ?", notification.ID, "email").
				Updates(map[string]interface{}{
					"status": "sent", "attempt_count": gorm.Expr("attempt_count + 1"), "sent_at": now,
				}).Error
		}
	}
	return nil
}

func parseAdvisorConsumedAt(value string) *time.Time {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	parsed, err := time.Parse(time.RFC3339Nano, strings.TrimSpace(value))
	if err != nil {
		return nil
	}
	return &parsed
}

func notificationDTO(row model.ACUAdvisorNotification) dto.ACUAdvisorNotification {
	result := dto.ACUAdvisorNotification{
		ID: row.ID, AdvisorID: row.AdvisorID, Status: row.Status,
		ProblemSummary: row.ProblemSummary, AdviceSummary: row.AdviceSummary,
		ReferenceStatus: row.ReferenceStatus, TargetPath: row.TargetPath,
		SourceCreatedAt: row.SourceCreatedAt.Format(time.RFC3339),
		CreatedAt:       row.CreatedAt.Format(time.RFC3339),
	}
	if row.ConsumedByLogicalRequestID != "" {
		result.ConsumedByLogicalRequestID = row.ConsumedByLogicalRequestID
	}
	if row.ConsumedAt != nil {
		result.ConsumedAt = row.ConsumedAt.Format(time.RFC3339Nano)
	}
	if row.ReadAt != nil {
		result.ReadAt = row.ReadAt.Format(time.RFC3339)
	}
	return result
}

func sendPrivateACUAdvisorEmail(
	notification model.ACUAdvisorNotification,
	target string,
) error {
	subject := "Private ACU Advisor 发现一项需要关注的问题"
	content := fmt.Sprintf(
		"<p><strong>Private ACU Advisor</strong></p><p>问题：%s</p><p>参考建议：%s</p><p>状态：%s</p><p><a href=\"%s\">查看审计详情</a></p>",
		html.EscapeString(notification.ProblemSummary),
		html.EscapeString(notification.AdviceSummary),
		html.EscapeString(notification.ReferenceStatus),
		html.EscapeString(notification.TargetPath),
	)
	return common.SendEmail(subject, target, content)
}
