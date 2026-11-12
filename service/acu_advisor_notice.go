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

func advisorNoticeChinese(language, content string) bool {
	language = strings.ToLower(strings.TrimSpace(language))
	if language != "" && language != "auto" {
		return strings.HasPrefix(language, "zh")
	}
	han, latin := 0, 0
	for _, r := range content {
		if unicode.Is(unicode.Han, r) {
			han++
		}
		if unicode.Is(unicode.Latin, r) {
			latin++
		}
	}
	// One incidental Han character must not override a primarily English audit.
	return han > 0 && han*2 >= latin
}

// Validated summaries follow the user's conversation, not account/UI locale.
func advisorNoticeDisplayChinese(row model.ACUAdvisorNotification, language string) bool {
	var summary dto.ACUAdvisorNotice
	if common.UnmarshalJsonStr(row.NoticeJSON, &summary) == nil && validAdvisorNotice(&summary, row.ProblemSummary, row.AdviceSummary) {
		return advisorNoticeChinese("auto", summary.Title+" "+summary.Deviation+" "+summary.Preference+" "+summary.Correction)
	}
	content := strings.TrimSpace(row.ProblemSummary + " " + row.AdviceSummary)
	if content != "" {
		return advisorNoticeChinese("auto", content)
	}
	return advisorNoticeChinese(language, "")
}

var advisorPrivateText = regexp.MustCompile(`(?i)(?:https?://[^\s，。；]+|[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|(?:/root/|/home/|[a-z]:\\)[^\s，。；]+|(?:api[_-]?key|password|token|secret)\s*[:=]\s*[^\s，。；]+|sk-[a-z0-9_-]{8,})`)
var advisorOutcomeClaim = regexp.MustCompile(`(?i)(已修复|已解决|已采纳|已调整|已执行|测试通过|验证成功|避免损失|节省|\b(fixed|resolved|adopted|executed|implemented|verified|passed|saved)\b)`)

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
	zh := advisorNoticeDisplayChinese(row, language)
	// Historical audits still carry useful facts; never replace them with missing-copy notices.
	issue := advisorExcerpt(row.ProblemSummary, 160)
	title := ""
	clauses := strings.FieldsFunc(row.ProblemSummary, func(r rune) bool { return r == '。' || r == ';' || r == '；' || r == '\n' })
	if len(clauses) > 0 {
		title = advisorExcerpt(clauses[0], 42)
	}
	preference := ""
	correction := advisorExcerpt(row.AdviceSummary, 200)
	if issue == "" {
		issue = correction
		title = advisorExcerpt(correction, 42)
	}
	if title == "" {
		title = advisorNoticeText(zh, "审计记录", "Audit record")
	}
	if advisorOutcomeClaim.MatchString(title) {
		title = advisorNoticeText(zh, "审计原文：", "Audit text: ") + title
	}
	var structured dto.ACUAdvisorNotice
	if common.UnmarshalJsonStr(row.NoticeJSON, &structured) == nil && validAdvisorNotice(&structured, row.ProblemSummary, row.AdviceSummary) {
		title, issue, preference, correction = structured.Title, structured.Deviation, structured.Preference, structured.Correction
	}
	state := advisorNoticeText(zh, "已生成建议，尚无提供给后续处理者的记录", "Advice prepared; delivery to the next task request is unknown")
	switch row.ReferenceStatus {
	case "queued":
		state = advisorNoticeText(zh, "建议已备好，等待提供给后续处理者", "Advice prepared for the next task request")
	case "injected":
		state = advisorNoticeText(zh, "建议已加入后续请求，是否采纳尚未确认", "Advice included in a later request; adoption is not confirmed")
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
		Verification: advisorNoticeText(zh, "处理结果待确认", "Result not yet confirmed"),
		NextStep:     advisorNoticeText(zh, "查看依据与完整建议", "Review evidence and full advice"),
	}
}

func renderAdvisorEmail(row model.ACUAdvisorNotification, language string, repeated bool, serverAddress string) (string, string) {
	n := buildAdvisorNotice(row, language, repeated)
	zh := advisorNoticeDisplayChinese(row, language)
	link := advisorNoticeText(zh, "登录 Console → Private ACU / Advisor 查看完整原文。", "Please sign in to Console → Private ACU / Advisor for full source details.")
	base, err := url.Parse(strings.TrimSpace(serverAddress))
	if err == nil && (base.Scheme == "https" || base.Scheme == "http") && base.Host != "" && base.User == nil && base.RawQuery == "" && base.Fragment == "" {
		base.Path = strings.TrimRight(base.Path, "/") + "/private-acu/advisor"
		base.RawQuery = url.Values{"advisor": {row.AdvisorID}}.Encode()
		link = fmt.Sprintf(`<a href="%s">%s</a>`, html.EscapeString(base.String()), n.NextStep)
	}
	preview := n.Summary + " → " + n.Preference + " → " + n.Correction
	snapshot := n.Action
	preferenceBlock := ""
	if n.Preference != "" {
		preferenceBlock = fmt.Sprintf("<p><strong>%s</strong><br>%s</p>", advisorNoticeText(zh, "依据的偏好", "Preference basis (summary)"), html.EscapeString(n.Preference))
	}
	correctionBlock := ""
	if n.Correction != "" {
		correctionBlock = fmt.Sprintf("<p><strong>%s</strong><br>%s</p>", advisorNoticeText(zh, "纠偏提醒", "Corrective reference"), html.EscapeString(n.Correction))
	}
	body := fmt.Sprintf(`<!doctype html><html lang="%s"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0;font-family:Arial,sans-serif;color:#222;background:#fff"><div style="display:none;max-height:0;overflow:hidden;mso-hide:all">%s</div><main style="max-width:560px;margin:auto;padding:20px;overflow-wrap:anywhere"><h1 style="font-size:20px;line-height:1.4">%s</h1><p><strong>%s</strong><br>%s</p>%s%s<p style="font-size:12px;color:#555">%s · %s</p><p>%s</p></main></body></html>`,
		advisorNoticeText(zh, "zh", "en"), html.EscapeString(advisorExcerpt(preview, 240)), html.EscapeString(n.Title),
		advisorNoticeText(zh, "发现的问题", "Issue found"), html.EscapeString(n.Summary),
		preferenceBlock, correctionBlock,
		html.EscapeString(snapshot), html.EscapeString(n.Verification), link)
	return n.Title, body
}
