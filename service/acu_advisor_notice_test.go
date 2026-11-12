package service

import (
	"context"
	"fmt"
	"html"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
	"github.com/glebarez/sqlite"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

func TestAdvisorNoticeSeparatesAuditReferenceAndVerification(t *testing.T) {
	for _, tc := range []struct{ state, action string }{
		{"queued", "提醒已排队"}, {"injected", "提醒已加入后续请求"},
		{"failed", "带入失败"}, {"disabled", "自动带入关闭"}, {"", "带入状态未知"},
		{"future-state", "带入状态未知"},
	} {
		t.Run(tc.state, func(t *testing.T) {
			notice := buildAdvisorNotice(model.ACUAdvisorNotification{
				ProblemSummary: "统计与列表 type=0 筛选口径不一致", AdviceSummary: "测试通过，已修复", ReferenceStatus: tc.state,
			}, "zh", false)
			assert.Contains(t, notice.Title, "type=0")
			assert.Contains(t, notice.Action, tc.action)
			assert.Equal(t, "unknown", notice.VerificationStatus)
			assert.Equal(t, "效果待核实", notice.Verification)
			assert.NotContains(t, notice.Title, "已修复")
			assert.NotEmpty(t, notice.NextStep)
		})
	}
}

func TestAdvisorEventsKeepNewRisksAndNeverResendForStatusOrReplay(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	t.Cleanup(func() { model.DB = previousDB; _ = sqlDB.Close() })
	model.DB = db
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.ACUAdvisorNotification{}, &model.ACUAdvisorNotificationDelivery{}))
	disabled := false
	settings, err := common.Marshal(dto.UserSetting{Language: "en", AdvisorNotificationEmailEnabled: &disabled})
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.User{Id: 42, Username: "notice-test", Setting: string(settings)}).Error)
	event := dto.ACUAdvisorNotificationEvent{
		EventType: "private_acu_advisor_ready", AdvisorID: "notice-1", NewAPIUserID: "42",
		SessionID: "session-1", Problem: "statistics filter type=0", Advice: "check tests", Status: "risk", ReferenceStatus: "queued",
	}
	event.Notification = &dto.ACUAdvisorNotice{
		Title: "statistics filter type=0", Deviation: "statistics filter type=0", Preference: "Compare the complete command", Correction: "check tests",
		Evidence:   dto.ACUAdvisorNoticeEvidence{Problem: event.Problem, Preference: "Compare the complete command", PreferenceSourceID: "user:0", Correction: "check tests"},
		Provenance: &dto.ACUAdvisorNoticeProvenance{Version: 1, SourceID: "user:0", Kind: "user_message", Quote: "Compare the complete command"},
	}
	require.NoError(t, ReceivePrivateACUAdvisorEvent(context.Background(), event))
	var first model.ACUAdvisorNotification
	require.NoError(t, db.First(&first).Error)
	assert.NotEmpty(t, first.NoticeJSON)
	assert.Equal(t, "Compare the complete command", notificationDTO(first, "en").Preference)
	require.NoError(t, db.Create(&model.ACUAdvisorNotificationDelivery{NotificationID: first.ID, Channel: "email", Status: "sent", AttemptCount: 1}).Error)
	require.NoError(t, ReceivePrivateACUAdvisorEvent(context.Background(), event))
	event.EventType = "private_acu_advisor_status"
	event.ReferenceStatus = "injected"
	event.ConsumedByLogicalRequestID = "consumer-1"
	event.ConsumedAt = time.Now().UTC().Format(time.RFC3339Nano)
	require.NoError(t, ReceivePrivateACUAdvisorEvent(context.Background(), event))
	event.ReferenceStatus = "failed"
	require.NoError(t, ReceivePrivateACUAdvisorEvent(context.Background(), event))
	event.ReferenceStatus = "injected" // Late status cannot resurrect failed inclusion.
	require.NoError(t, ReceivePrivateACUAdvisorEvent(context.Background(), event))
	require.NoError(t, db.First(&first).Error)
	assert.Equal(t, "failed", first.ReferenceStatus)
	assert.Equal(t, "Compare the complete command", notificationDTO(first, "en").Preference)
	var delivery model.ACUAdvisorNotificationDelivery
	require.NoError(t, db.First(&delivery).Error)
	assert.Equal(t, "sent", delivery.Status)
	assert.Equal(t, 1, delivery.AttemptCount)
	for _, change := range []struct{ id, problem, advice, status, session string }{
		{"exact-repeat", event.Problem, event.Advice, "risk", "session-1"},
		{"new-risk-same-type", "statistics malformed amount", event.Advice, "risk", "session-1"},
		{"new-advice", event.Problem, "new evidence to review", "risk", "session-1"},
		{"escalation", event.Problem, event.Advice, "blocked", "session-1"},
		{"other-session", event.Problem, event.Advice, "risk", "session-2"},
	} {
		event.EventType, event.ReferenceStatus = "private_acu_advisor_ready", "queued"
		event.AdvisorID, event.Problem, event.Advice, event.Status, event.SessionID = change.id, change.problem, change.advice, change.status, change.session
		require.NoError(t, ReceivePrivateACUAdvisorEvent(context.Background(), event))
	}
	var count int64
	require.NoError(t, db.Model(&model.ACUAdvisorNotification{}).Count(&count).Error)
	assert.Equal(t, int64(6), count)
	event.AdvisorID, event.EventType = "unknown", "private_acu_advisor_status"
	assert.ErrorIs(t, ReceivePrivateACUAdvisorEvent(context.Background(), event), gorm.ErrRecordNotFound)
	event.AdvisorID, event.NewAPIUserID = "notice-1", "7"
	assert.ErrorContains(t, ReceivePrivateACUAdvisorEvent(context.Background(), event), "mismatch")
	event.EventType = "unsupported"
	assert.ErrorContains(t, ReceivePrivateACUAdvisorEvent(context.Background(), event), "unsupported")
}

func TestAdvisorNoticeMissingFieldsNeverInventPreference(t *testing.T) {
	for _, problem := range []string{"用户要求先给清单再推进", "Test baseline uses different arguments", ""} {
		n := buildAdvisorNotice(model.ACUAdvisorNotification{ProblemSummary: problem}, "en", false)
		assert.Contains(t, n.Preference, "No explicit preference evidence")
		assert.NotEmpty(t, n.Summary)
	}
	secret := strings.Repeat("私密路径 /root/secret api-key=hidden@example.com <script>x</script> ", 1000)
	n := buildAdvisorNotice(model.ACUAdvisorNotification{ProblemSummary: secret, AdviceSummary: secret, Status: "ok"}, "en", true)
	assert.Contains(t, n.Title, "Repeat")
	assert.NotContains(t, n.Title+n.Summary+n.Action+n.Verification+n.NextStep, "secret")
	assert.LessOrEqual(t, utf8.RuneCountInString(n.Title), 90)
	assert.Equal(t, "unknown", n.VerificationStatus)
}

func TestAdvisorEmailHasSafePreviewAndAuthenticatedAbsoluteLink(t *testing.T) {
	row := model.ACUAdvisorNotification{AdvisorID: `id/<script>`, ProblemSummary: "统计 type=0 secret@example.com", ReferenceStatus: "injected"}
	subject, body := renderAdvisorEmail(row, "zh", false, "https://acu.example/base")
	assert.Contains(t, subject, "type=0")
	assert.Contains(t, body, "效果待核实")
	assert.Contains(t, body, "纠偏提醒")
	assert.Contains(t, body, "https://acu.example/base/private-acu/advisor?advisor=id%2F%3Cscript%3E")
	assert.NotContains(t, body, "secret@example.com")
	assert.NotContains(t, body, "<script>")
	for _, base := range []string{"", "javascript:alert(1)", "https://user:password@acu.example", "//evil.example", "https://acu.example/?x=1"} {
		_, body = renderAdvisorEmail(row, "en", false, base)
		assert.NotContains(t, body, "href=")
		assert.Contains(t, body, "sign in")
	}
}

func TestAdvisorNoticeRealSamplePreviews(t *testing.T) {
	data, err := os.ReadFile("testdata/advisor-notices.json")
	require.NoError(t, err)
	var samples []struct {
		ID           string               `json:"id"`
		Language     string               `json:"language"`
		Problem      string               `json:"problem"`
		Advice       string               `json:"advice"`
		SourceID     string               `json:"sourceId"`
		SourceText   string               `json:"sourceText"`
		Notification dto.ACUAdvisorNotice `json:"notification"`
	}
	require.NoError(t, common.Unmarshal(data, &samples))
	for _, sample := range samples {
		t.Run(sample.ID, func(t *testing.T) {
			// These source excerpts were read from this event's persisted user-role input.
			require.Contains(t, sample.SourceText, sample.Notification.Evidence.Preference)
			sample.Notification.Provenance = &dto.ACUAdvisorNoticeProvenance{Version: 1, SourceID: sample.SourceID, Kind: "user_message", Quote: sample.Notification.Evidence.Preference}
			require.True(t, validAdvisorNotice(&sample.Notification, sample.Problem, sample.Advice))
			encoded, err := common.Marshal(sample.Notification)
			require.NoError(t, err)
			row := model.ACUAdvisorNotification{AdvisorID: sample.ID, ProblemSummary: sample.Problem, AdviceSummary: sample.Advice, NoticeJSON: string(encoded), ReferenceStatus: "queued"}
			n := buildAdvisorNotice(row, sample.Language, false)
			assert.Equal(t, "Private ACU | "+sample.Notification.Title, n.Title)
			assert.Equal(t, sample.Notification.Preference, n.Preference)
			assert.Equal(t, sample.Notification.Correction, n.Correction)
			if sample.ID == "statistics" {
				// Two risks of the same billing/statistics type in the same real audit.
				amount := sample.Notification
				amount.Title = "负数不能被当作零值静默处理"
				amount.Deviation = "JSON 解析失败、字段缺失、非法十进制或负数不能被当作零值静默处理"
				amount.Preference = "malformed/missing amount cannot silently zero old bills"
				amount.Correction = "SQLite 实际数据库测试是否覆盖 malformed/missing amount、合法零值、筛选隔离和不加载全部 JSON"
				amount.Evidence.Problem = amount.Deviation
				amount.Evidence.Preference = amount.Preference
				amount.Provenance = &dto.ACUAdvisorNoticeProvenance{Version: 1, SourceID: sample.SourceID, Kind: "user_message", Quote: amount.Preference}
				require.Contains(t, sample.SourceText, amount.Preference)
				require.True(t, validAdvisorNotice(&amount, sample.Problem, sample.Advice))
				encodedAmount, err := common.Marshal(amount)
				require.NoError(t, err)
				amountRow := row
				amountRow.AdvisorID, amountRow.NoticeJSON = "statistics-amount", string(encodedAmount)
				amountNotice := buildAdvisorNotice(amountRow, sample.Language, false)
				assert.NotEqual(t, n.Title, amountNotice.Title)
				assert.NotEqual(t, n.Summary, amountNotice.Summary)
				assert.Contains(t, n.Title, "列表范围")
				assert.Contains(t, amountNotice.Title, "负数")
				_, amountBody := renderAdvisorEmail(amountRow, sample.Language, false, "https://acu.example")
				if output := os.Getenv("ADVISOR_PREVIEW_DIR"); output != "" {
					require.NoError(t, os.MkdirAll(output, 0700))
					require.NoError(t, os.WriteFile(filepath.Join(output, "statistics-amount.html"), []byte(amountBody), 0600))
				}
			}
			_, body := renderAdvisorEmail(row, sample.Language, false, "https://acu.example")
			assert.Less(t, strings.Index(body, "纠偏提醒"), strings.Index(body, "效果待核实"))
			if output := os.Getenv("ADVISOR_PREVIEW_DIR"); output != "" {
				require.NoError(t, os.MkdirAll(output, 0700))
				require.NoError(t, os.WriteFile(filepath.Join(output, sample.ID+".html"), []byte(body), 0600))
				// Reconstruct the old template from the same source, not a historical MIME capture.
				before := fmt.Sprintf("<!doctype html><html lang=\"zh\"><head><meta charset=\"utf-8\"><title>Private ACU Advisor 发现一项需要关注的问题</title></head><body><p><strong>Private ACU Advisor</strong></p><p>问题：%s</p><p>参考建议：%s</p><p>状态：queued</p><p><a href=\"/private-acu/advisor?advisor=%s\">查看审计详情</a></p></body></html>", html.EscapeString(sample.Problem), html.EscapeString(sample.Advice), sample.ID)
				require.NoError(t, os.WriteFile(filepath.Join(output, sample.ID+"-before.html"), []byte(before), 0600))
			}
			row.ReferenceStatus = ""
			assert.Contains(t, buildAdvisorNotice(row, "zh", false).Action, "带入状态未知")
			sample.Notification.Evidence.Preference = "不存在的用户偏好"
			encoded, err = common.Marshal(sample.Notification)
			require.NoError(t, err)
			row.NoticeJSON = string(encoded)
			assert.Contains(t, buildAdvisorNotice(row, "en", false).Preference, "No explicit preference evidence")
		})
	}
}

func TestAdvisorNoticeEnglishAndInvalidSummary(t *testing.T) {
	n := dto.ACUAdvisorNotice{Title: "baseline omits two files", Deviation: "The baseline omits two files.", Preference: "Compare the complete command", Correction: "full baseline scope", Evidence: dto.ACUAdvisorNoticeEvidence{Problem: "The baseline omits two files.", Preference: "Compare the complete command", PreferenceSourceID: "user:0", Correction: "full baseline scope"}, Provenance: &dto.ACUAdvisorNoticeProvenance{Version: 1, SourceID: "user:0", Kind: "user_message", Quote: "Compare the complete command"}}
	row := model.ACUAdvisorNotification{ProblemSummary: "The baseline omits two files.", AdviceSummary: "User requires the complete command and full baseline scope. Fixed and verified."}
	require.True(t, validAdvisorNotice(&n, row.ProblemSummary, row.AdviceSummary))
	for _, change := range []string{"too-long", "control", "missing", "bad-quote", "unrelated-preference", "self-citation", "repair-claim"} {
		copy := n
		switch change {
		case "too-long":
			copy.Title = strings.Repeat("界", 49)
		case "control":
			copy.Title += "\r\nSubject: forged"
		case "missing":
			copy.Correction = ""
		case "bad-quote":
			copy.Evidence.Correction = "not in source"
		case "unrelated-preference":
			copy.Preference = "不访问生产数据库"
		case "self-citation":
			copy.Provenance = nil
		case "repair-claim":
			copy.Correction = "Fixed and verified"
			copy.Evidence.Correction = "Fixed and verified"
		}
		assert.False(t, validAdvisorNotice(&copy, row.ProblemSummary, row.AdviceSummary))
	}
	encoded, err := common.Marshal(n)
	require.NoError(t, err)
	row.NoticeJSON = string(encoded)
	assert.Equal(t, "Private ACU | baseline omits two files", buildAdvisorNotice(row, "en", false).Title)
	row.NoticeJSON = ""
	row.ProblemSummary = "已修复，测试通过"
	assert.NotContains(t, buildAdvisorNotice(row, "zh", false).Title, "已修复")
	// Natural Chinese is allowed only after Router source + fidelity checks.
	n.Preference = "对比完整的检查命令"
	n.Provenance = &dto.ACUAdvisorNoticeProvenance{Version: 1, SourceID: "user:0", Kind: "user_message", Quote: n.Evidence.Preference, Presentation: "paraphrase"}
	assert.False(t, validAdvisorNotice(&n, "The baseline omits two files.", "full baseline scope"))
	n.Provenance.FidelityChecked = true
	assert.True(t, validAdvisorNotice(&n, "The baseline omits two files.", "full baseline scope"))
}

func TestAdvisorFirstEmailKeepsReadySnapshotWhenStatusAdvancesBeforeSend(t *testing.T) {
	previousDB := model.DB
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	sqlDB.SetMaxOpenConns(1)
	model.DB = db
	t.Cleanup(func() { model.DB = previousDB; _ = sqlDB.Close() })
	require.NoError(t, db.AutoMigrate(&model.User{}, &model.ACUAdvisorNotification{}, &model.ACUAdvisorNotificationDelivery{}))
	enabled := true
	settings, err := common.Marshal(dto.UserSetting{Language: "zh", AdvisorNotificationEmailEnabled: &enabled})
	require.NoError(t, err)
	require.NoError(t, db.Create(&model.User{Id: 42, Username: "snapshot-test", Email: "offline@example.invalid", Setting: string(settings)}).Error)
	ready := dto.ACUAdvisorNotificationEvent{
		EventType: "private_acu_advisor_ready", AdvisorID: "snapshot-1", NewAPIUserID: "42", SessionID: "session-1",
		Problem: "统计仍可能与列表范围不一致", Advice: "type=0 的兼容行为", Status: "risk", ReferenceStatus: "queued",
	}
	status := ready
	status.EventType, status.ReferenceStatus = "private_acu_advisor_status", "injected"
	status.ConsumedByLogicalRequestID, status.ConsumedAt = "later-request", "2026-11-12T04:26:36Z"
	// A status arriving before ready is retried, not converted into a first email.
	require.ErrorIs(t, ReceivePrivateACUAdvisorEvent(context.Background(), status), gorm.ErrRecordNotFound)
	var emailBody string
	sendCount := 0
	sender := func(snapshot model.ACUAdvisorNotification, target, language string, repeated bool) error {
		sendCount++
		assert.Equal(t, "offline@example.invalid", target)
		assert.Equal(t, "queued", snapshot.ReferenceStatus)
		// Deterministically update the real DB before rendering/sending the captured value.
		require.NoError(t, ReceivePrivateACUAdvisorEvent(context.Background(), status))
		var current model.ACUAdvisorNotification
		require.NoError(t, db.First(&current).Error)
		assert.Equal(t, "injected", current.ReferenceStatus)
		assert.Contains(t, notificationDTO(current, "zh").Action, "提醒已加入")
		_, emailBody = renderAdvisorEmail(snapshot, language, repeated, "https://acu.example")
		assert.Contains(t, emailBody, "首次提醒快照：提醒已排队")
		assert.NotContains(t, emailBody, "提醒已加入")
		assert.NotContains(t, emailBody, "已修复")
		return nil // Replaces only external SMTP. No network connection is made.
	}
	require.NoError(t, receivePrivateACUAdvisorEvent(context.Background(), ready, sender))
	require.NoError(t, receivePrivateACUAdvisorEvent(context.Background(), ready, sender))
	require.NoError(t, receivePrivateACUAdvisorEvent(context.Background(), status, sender))
	assert.Equal(t, 1, sendCount)
	var delivery model.ACUAdvisorNotificationDelivery
	require.NoError(t, db.First(&delivery).Error)
	assert.Equal(t, "sent", delivery.Status)
	assert.Equal(t, 1, delivery.AttemptCount)
	require.NotNil(t, delivery.SentAt)
	assert.Contains(t, emailBody, "提醒已排队")
}

func TestAdvisorNoticeNullableExpansionPreservesOldRowsAndWriters(t *testing.T) {
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	type oldNotification struct {
		ID             uint `gorm:"primaryKey"`
		AdvisorID      string
		ProblemSummary string
	}
	require.NoError(t, db.Table("acu_advisor_notifications").AutoMigrate(&oldNotification{}))
	require.NoError(t, db.Table("acu_advisor_notifications").Create(&oldNotification{AdvisorID: "before", ProblemSummary: "type=0范围待核对"}).Error)
	require.NoError(t, db.Exec("ALTER TABLE acu_advisor_notifications ADD COLUMN notice_json TEXT NULL").Error)
	require.NoError(t, db.Table("acu_advisor_notifications").Create(&oldNotification{AdvisorID: "old-writer", ProblemSummary: "金额校验待核对"}).Error)
	var rows []model.ACUAdvisorNotification
	require.NoError(t, db.Table("acu_advisor_notifications").Find(&rows).Error)
	require.Len(t, rows, 2)
	for _, row := range rows {
		assert.Empty(t, row.NoticeJSON)
		assert.NotEmpty(t, buildAdvisorNotice(row, "zh", false).Title)
	}
	require.NoError(t, db.Table("acu_advisor_notifications").Where("advisor_id = ?", "before").Update("notice_json", "{}").Error)
	var old oldNotification
	require.NoError(t, db.Table("acu_advisor_notifications").Where("advisor_id = ?", "before").First(&old).Error)
	assert.Equal(t, "type=0范围待核对", old.ProblemSummary)
}

func TestAdvisorActualModelPreview(t *testing.T) {
	directory := os.Getenv("ADVISOR_LIVE_RESULT_DIR")
	if directory == "" {
		t.Skip("explicit actual-model result directory required")
	}
	for _, id := range []string{"scope", "amount", "english-source", "recovery"} {
		data, err := os.ReadFile(filepath.Join(directory, id+".json"))
		require.NoError(t, err)
		var actual struct {
			Problem      string               `json:"problem"`
			Advice       string               `json:"advice"`
			Notification dto.ACUAdvisorNotice `json:"notification"`
		}
		require.NoError(t, common.Unmarshal(data, &actual))
		require.True(t, validAdvisorNotice(&actual.Notification, actual.Problem, actual.Advice))
		encoded, err := common.Marshal(actual.Notification)
		require.NoError(t, err)
		_, body := renderAdvisorEmail(model.ACUAdvisorNotification{AdvisorID: id, ProblemSummary: actual.Problem, AdviceSummary: actual.Advice, NoticeJSON: string(encoded), ReferenceStatus: "queued"}, "zh", false, "https://console.acucompute.com")
		require.NoError(t, os.WriteFile(filepath.Join(directory, id+".html"), []byte(body), 0600))
	}
}

func TestAdvisorRecoveryFallbackUsesAccountLanguageAndHonestMissingSummaries(t *testing.T) {
	data, err := os.ReadFile("testdata/advisor-recovery-fallback.json")
	require.NoError(t, err)
	var fixture struct {
		AdvisorID  string `json:"advisorId"`
		Problem    string `json:"problem"`
		Advice     string `json:"advice"`
		SourceID   string `json:"sourceId"`
		SourceText string `json:"sourceText"`
	}
	require.NoError(t, common.Unmarshal(data, &fixture))
	row := model.ACUAdvisorNotification{AdvisorID: fixture.AdvisorID, ProblemSummary: fixture.Problem, AdviceSummary: fixture.Advice, ReferenceStatus: "queued"}
	for _, language := range []string{"zh", "zh-CN", "", "auto"} {
		subject, body := renderAdvisorEmail(row, language, false, "https://console.acucompute.com")
		assert.Contains(t, subject, "Private ACU | Router 发布")
		assert.LessOrEqual(t, utf8.RuneCountInString(subject), 50)
		assert.Contains(t, body, "发现的问题")
		assert.Contains(t, body, "依据的偏好")
		assert.Contains(t, body, "本次未找到明确的偏好依据")
		assert.Contains(t, body, "本次未提供可靠的纠偏摘要")
		assert.NotContains(t, body, "Deviation found")
		assert.NotContains(t, body, "\ufffd")
		assert.NotContains(t, subject, "manifest")
	}
	_, english := renderAdvisorEmail(row, "en", false, "https://console.acucompute.com")
	assert.Contains(t, english, "Issue found")
	assert.Contains(t, english, "No explicit preference evidence")
	assert.False(t, advisorNoticeChinese("en", "中文问题"))
	assert.True(t, advisorNoticeChinese("zh-CN", "English source"))
	assert.False(t, advisorNoticeChinese("auto", "English source"))
	assert.True(t, advisorNoticeChinese("auto", "中文问题"))
	assert.False(t, advisorNoticeChinese("auto", "The release failed before switching; inspect its safety and keep the existing protections. 中"))
	assert.True(t, advisorNoticeChinese("auto", "发布之前需要核对当前运行状态，保护条件保持不变，不重复操作。Router manifest"))
	if directory := os.Getenv("ADVISOR_PREVIEW_DIR"); directory != "" {
		_, body := renderAdvisorEmail(row, "auto", false, "https://console.acucompute.com")
		require.NoError(t, os.WriteFile(filepath.Join(directory, "recovery-fallback.html"), []byte(body), 0600))
	}
}
