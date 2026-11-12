package service

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/dto"
	"github.com/QuantumNous/new-api/model"
)

type advisorNotice struct {
	Title, Summary, Preference, Correction, Action, Verification, NextStep string
	VerificationStatus                                                     string
}

func advisorNoticeText(zh bool, chinese, english string) string {
	if zh {
		return chinese
	}
	return english
}

var advisorPrivateText = regexp.MustCompile(`(?i)(?:https?://[^\s，。；]+|[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|(?:/root/|/home/|[a-z]:\\)[^\s，。；]+|(?:api[_-]?key|password|token|secret)\s*[:=]\s*[^\s，。；]+|sk-[a-z0-9_-]{8,})`)
var advisorOutcomeClaim = regexp.MustCompile(`(?i)(已修复|已解决|已采纳|测试通过|验证成功|避免损失|节省|\b(fixed|resolved|adopted|verified|passed|saved)\b)`)

func advisorExcerpt(value string, limit int) string {
	value = advisorPrivateText.ReplaceAllString(value, "[redacted]")
	value = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || unicode.In(r, unicode.Cf) {
			return ' '
		}
		return r
	}, value)
	value = strings.Join(strings.Fields(value), " ")
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit-1]) + "…"
}

// Source membership was checked by the authenticated Router before provenance
// was attached. Console checks that the short text still matches those quotes.
func validAdvisorNotice(n *dto.ACUAdvisorNotice, problem, advice string) bool {
	if n == nil {
		return false
	}
	p := n.Provenance
	if p == nil || p.Version != 1 || p.SourceID == "" || p.SourceID != n.Evidence.PreferenceSourceID || p.Quote != n.Evidence.Preference || (p.Kind != "user_message" && p.Kind != "selected_preference") {
		return false
	}
	for _, field := range []struct {
		text  string
		limit int
	}{{n.Title, 48}, {n.Deviation, 64}, {n.Preference, 72}, {n.Correction, 80}} {
		if strings.TrimSpace(field.text) == "" || utf8.RuneCountInString(field.text) > field.limit {
			return false
		}
		if advisorOutcomeClaim.MatchString(field.text) {
			return false
		}
		for _, r := range field.text {
			if unicode.IsControl(r) || unicode.In(r, unicode.Cf) {
				return false
			}
		}
	}
	for _, field := range []struct{ quote, source string }{{n.Evidence.Problem, problem}, {n.Evidence.Preference, p.Quote}, {n.Evidence.Correction, advice}} {
		limit := 600
		if p.Presentation == "paraphrase" {
			limit = 6000
		}
		if strings.TrimSpace(field.quote) == "" || utf8.RuneCountInString(field.quote) > limit || !strings.Contains(field.source, field.quote) {
			return false
		}
	}
	if p.Presentation == "paraphrase" {
		return p.FidelityChecked
	}
	for _, field := range []struct{ text, quote string }{{n.Title, n.Evidence.Problem}, {n.Deviation, n.Evidence.Problem}, {n.Preference, n.Evidence.Preference}, {n.Correction, n.Evidence.Correction}} {
		if !strings.Contains(field.quote, field.text) {
			return false
		}
	}
	return true
}

func buildAdvisorNotice(row model.ACUAdvisorNotification, language string, repeated bool) advisorNotice {
	zh := strings.HasPrefix(strings.ToLower(language), "zh")
	issue := strings.TrimSpace(row.ProblemSummary)
	if issue == "" {
		issue = advisorNoticeText(zh, "有一项审计发现，问题摘要缺失", "Audit finding; issue summary unavailable")
	}
	title := advisorExcerpt(issue, 54)
	if advisorOutcomeClaim.MatchString(issue) {
		title = advisorNoticeText(zh, "审计原文含结果表述，查看具体偏差", "Review the audit finding")
		issue = advisorNoticeText(zh, "请在详情中核对审计原文与依据", "Review the original audit and evidence in details")
	}
	preference := advisorNoticeText(zh, "未提供可追溯的偏好摘要，见完整记录", "No traceable preference summary; see full record")
	correction := advisorNoticeText(zh, "已生成参考建议，具体内容见完整记录", "Reference advice generated; see full record")
	var structured dto.ACUAdvisorNotice
	if common.UnmarshalJsonStr(row.NoticeJSON, &structured) == nil && validAdvisorNotice(&structured, row.ProblemSummary, row.AdviceSummary) {
		title, issue, preference, correction = structured.Title, structured.Deviation, structured.Preference, structured.Correction
	}
	state := advisorNoticeText(zh, "已生成提醒 · 带入状态未知", "Reminder generated · inclusion unknown")
	switch row.ReferenceStatus {
	case "queued":
		state = advisorNoticeText(zh, "提醒已排队，待同会话后续请求带入", "Reminder queued for a later request in this session")
	case "injected":
		state = advisorNoticeText(zh, "提醒已加入后续请求上下文", "Reminder added to later request context")
	case "disabled":
		state = advisorNoticeText(zh, "已生成提醒，自动带入关闭", "Reminder generated; automatic inclusion disabled")
	case "failed":
		state = advisorNoticeText(zh, "已生成提醒，但带入失败", "Reminder generated; inclusion failed")
	}
	prefix := "Private ACU | "
	if repeated {
		prefix = advisorNoticeText(zh, "Private ACU 再次提醒 | ", "Private ACU Repeat | ")
	}
	return advisorNotice{
		Title: prefix + advisorExcerpt(title, 54), Summary: advisorExcerpt(issue, 130),
		Preference: advisorExcerpt(preference, 160), Correction: advisorExcerpt(correction, 180),
		Action: state, VerificationStatus: "unknown",
		Verification: advisorNoticeText(zh, "效果待核实", "Outcome not verified"),
		NextStep:     advisorNoticeText(zh, "查看依据与完整建议", "Review evidence and full advice"),
	}
}

func renderAdvisorEmail(row model.ACUAdvisorNotification, language string, repeated bool, serverAddress string) (string, string) {
	n := buildAdvisorNotice(row, language, repeated)
	zh := strings.HasPrefix(strings.ToLower(language), "zh")
	link := advisorNoticeText(zh, "登录 Console → Private ACU / Advisor 查看完整原文。", "Please sign in to Console → Private ACU / Advisor for full source details.")
	base, err := url.Parse(strings.TrimSpace(serverAddress))
	if err == nil && (base.Scheme == "https" || base.Scheme == "http") && base.Host != "" && base.User == nil && base.RawQuery == "" && base.Fragment == "" {
		base.Path = strings.TrimRight(base.Path, "/") + "/private-acu/advisor"
		base.RawQuery = url.Values{"advisor": {row.AdvisorID}}.Encode()
		link = fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(base.String()), n.NextStep)
	}
	preview := n.Summary + " → " + n.Preference + " → " + n.Correction
	snapshot := advisorNoticeText(zh, "首次提醒快照：", "Initial reminder snapshot: ") + n.Action
	body := fmt.Sprintf(`<!doctype html><html lang="%s"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;font-family:Arial,sans-serif;color:#222;background:#fff"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">%s</div><main style="max-width:560px;margin:auto;padding:20px;overflow-wrap:anywhere"><h1 style="font-size:20px;line-height:1.4">%s</h1><p><strong>%s</strong><br>%s</p><p><strong>%s</strong><br>%s</p><p><strong>%s</strong><br>%s</p><p style="font-size:12px;color:#555">%s · %s</p><p>%s</p></main></body></html>`,
		advisorNoticeText(zh, "zh", "en"), html.EscapeString(advisorExcerpt(preview, 240)), html.EscapeString(n.Title),
		advisorNoticeText(zh, "发现偏差", "Deviation found"), html.EscapeString(n.Summary),
		advisorNoticeText(zh, "偏好 / 约束摘要", "Preference / constraint summary"), html.EscapeString(n.Preference),
		advisorNoticeText(zh, "纠偏提醒内容", "Corrective reference"), html.EscapeString(n.Correction),
		html.EscapeString(snapshot), html.EscapeString(n.Verification), link)
	return n.Title, body
}
