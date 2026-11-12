package service

import (
	"context"
	"errors"
	"fmt"
	"net/mail"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/QuantumNous/new-api/setting/system_setting"
	"gorm.io/gorm"
)

var (
	privateACUPreferenceKeys = strings.NewReplacer(
		"relevantSkillIds", "relevantPreferenceIds",
		"skillCatalog", "preferenceCatalog",
		"skillChangeCount", "preferenceChangeCount",
		"skillChanges", "preferenceChanges",
		"skillsBefore", "preferencesBefore",
		"skillsAfter", "preferencesAfter",
		"skillId", "preferenceId",
	)
	privateACUSkillLearnerPattern = regexp.MustCompile(`(?i)skill([ _-])learner`)
	privateACUSkillWordPattern    = regexp.MustCompile(`(?i)(^|[^a-z0-9])(skills?)([^a-z0-9]|$)`)
)

func privateACUPreferenceDisplayText(value string) string {
	value = privateACUPreferenceKeys.Replace(value)
	value = privateACUSkillLearnerPattern.ReplaceAllStringFunc(value, func(match string) string {
		separator := match[5:6]
		if separator == " " {
			return "Preference Writer"
		}
		return "preference" + separator + "writer"
	})
	return privateACUSkillWordPattern.ReplaceAllStringFunc(value, func(match string) string {
		parts := privateACUSkillWordPattern.FindStringSubmatch(match)
		word := parts[2]
		replacement := "preference"
		if strings.EqualFold(word, "skills") {
			replacement = "preferences"
		}
		if word == strings.ToUpper(word) {
			replacement = strings.ToUpper(replacement)
		} else if word != strings.ToLower(word) {
			replacement = strings.ToUpper(replacement[:1]) + replacement[1:]
		}
		return parts[1] + replacement + parts[3]
	})
}

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
		result.Notifications = append(result.Notifications, notificationDTO(row, user.GetSetting().Language))
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
	return receivePrivateACUAdvisorEvent(ctx, input, sendPrivateACUAdvisorEmail)
}

func receivePrivateACUAdvisorEvent(
	ctx context.Context,
	input dto.ACUAdvisorNotificationEvent,
	sendEmail func(model.ACUAdvisorNotification, string, string, bool) error,
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
	var language string
	var repeated bool
	eventType := strings.TrimSpace(input.EventType)
	if eventType == "" {
		eventType = "private_acu_advisor_ready"
	}
	if eventType != "private_acu_advisor_ready" && eventType != "private_acu_advisor_status" {
		return errors.New("unsupported Advisor event type")
	}
	err = model.DB.Transaction(func(tx *gorm.DB) error {
		var existing model.ACUAdvisorNotification
		if err := tx.Where("advisor_id = ?", advisorID).First(&existing).Error; err == nil {
			if existing.UserID != userID {
				return errors.New("Advisor user mismatch")
			}
			notification = existing
			incomingReferenceStatus := strings.TrimSpace(input.ReferenceStatus)
			statusCanAdvance := (incomingReferenceStatus == "injected" &&
				existing.ReferenceStatus != "injected" &&
				existing.ReferenceStatus != "failed") ||
				(incomingReferenceStatus == "failed" &&
					(existing.ReferenceStatus == "queued" || existing.ReferenceStatus == "injected"))
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
		var user model.User
		if err := tx.First(&user, "id = ?", userID).Error; err != nil {
			return err
		}
		prefs := advisorNotificationPreferences(user.GetSetting(), user.Email)
		language = user.GetSetting().Language
		now := time.Now()
		// Label only exact repeated findings in this session. Never suppress a new ID.
		if strings.TrimSpace(input.SessionID) != "" && strings.TrimSpace(input.Problem) != "" {
			var count int64
			if err := tx.Model(&model.ACUAdvisorNotification{}).
				Where("user_id = ? AND session_id = ? AND problem_summary = ? AND advice_summary = ? AND status = ? AND created_at >= ?",
					userID, strings.TrimSpace(input.SessionID), strings.TrimSpace(input.Problem), strings.TrimSpace(input.Advice), strings.TrimSpace(input.Status), now.Add(-24*time.Hour)).Count(&count).Error; err != nil {
				return err
			}
			repeated = count > 0
		}
		notification = model.ACUAdvisorNotification{
			AdvisorID: advisorID, UserID: userID,
			SessionID:                  strings.TrimSpace(input.SessionID),
			LogicalRequestID:           strings.TrimSpace(input.LogicalRequestID),
			Status:                     strings.TrimSpace(input.Status),
			ProblemSummary:             strings.TrimSpace(input.Problem),
			AdviceSummary:              strings.TrimSpace(input.Advice),
			ReferenceStatus:            strings.TrimSpace(input.ReferenceStatus),
			ConsumedByLogicalRequestID: strings.TrimSpace(input.ConsumedByLogicalRequestID),
			TargetPath:                 "/private-acu/advisor?advisor=" + url.QueryEscape(advisorID),
			SourceCreatedAt:            now,
		}
		if notification.Status == "" {
			notification.Status = "risk"
		}
		if validAdvisorNotice(input.Notification, notification.ProblemSummary, notification.AdviceSummary) {
			encoded, err := common.Marshal(input.Notification)
			if err != nil {
				return err
			}
			notification.NoticeJSON = string(encoded)
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
		// Pass the ready-event value snapshot, never reload a newer reference state.
		if err := sendEmail(notification, emailTarget, language, repeated); err != nil {
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

func notificationDTO(row model.ACUAdvisorNotification, language string) dto.ACUAdvisorNotification {
	notice := buildAdvisorNotice(row, language, false)
	kind := "audit"
	var structured dto.ACUAdvisorNotice
	if common.UnmarshalJsonStr(row.NoticeJSON, &structured) == nil && validAdvisorNotice(&structured, row.ProblemSummary, row.AdviceSummary) {
		kind = "structured"
	}
	result := dto.ACUAdvisorNotification{
		ContentKind: kind,
		Title:       notice.Title, Summary: notice.Summary, Action: notice.Action,
		Preference: notice.Preference, Correction: notice.Correction,
		Verification: notice.Verification, VerificationStatus: notice.VerificationStatus, NextStep: notice.NextStep,
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
	language string,
	repeated bool,
) error {
	subject, content := renderAdvisorEmail(notification, language, repeated, system_setting.ServerAddress)
	return common.SendEmail(subject, target, content)
}
