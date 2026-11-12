# Advisor Mail MIME And Language Follow-Up

The 14:24 screenshot was produced by an old Router and the first new Console:
no validated structured notice was present. It is not proof that new Router
generation was serving production. Do not resend this historical notification.

Read-only reproduction used the real rendering template and screenshot text,
not a received EML. A 1680-byte UTF-8 HTML line placed the third `而在` with `在`
starting at byte 997; a 998-byte hard fold splits the codepoint and reproduces
`而���切流前失败`. This is a plausible forwarding mechanism, not established
causation in the 163-to-QQ chain. The old single Subject encoded-word was 172
bytes, exceeding the 75-character RFC2047 limit.

`SendEmail` now uses standard MIME B-encoded Subject words, folds between encoded
words, formats From with `mail.Address`, declares MIME-Version 1.0, and writes
the HTML body through `quotedprintable.Writer` including Close. Text newlines
are normalized to CRLF; SMTP/TLS/authentication settings are unchanged.
Captured fake SMTP DATA is parsed by `net/mail`; the decoded subject, sender
display name and QP body must equal the source. Tests cover long Chinese,
emoji, links/HTML attributes, ASCII mail and preservation of replacement
characters that were already in source. Body transport lines are at most 76
bytes, all lines at most 998, and each encoded Subject word at most 75.

Explicit account language wins. Empty or `auto` follows the predominant audit content
(Han characters weighted at two Latin letters, not a single-Han presence check);
Chinese content gets Chinese headings and fallback strings. Labels are
`发现的问题`, `依据的偏好`, `纠偏提醒`. The preference is a summary, not presented
as a verbatim quotation. Missing validated summary says `本次未找到明确的偏好依据`
and `本次未提供可靠的纠偏摘要，完整建议见详情`; it does not claim adoption or action.
Legacy issue titles retain a bounded source clause, with no per-incident
Router/0041 regular expression. Concise natural titles come from the generic
Advisor generation contract and source/fidelity checks, not template guessing.

`service/testdata/advisor-recovery-fallback.json` retains the redacted 14:24
problem/advice and actual `user:1154` excerpt. The Router live acceptance replays
that historical context and three other cases. Actual-model results and rendered
previews are private local artifacts under `/tmp/acu-advisor-live-final`.
For the replay, a generated example was:

- Title: `0041检查可能跳过Profile保护`
- Issue: `拟在 0041 分支提前退出，可能跳过原有 tiered Profile 检查。`
- Preference: `先确认同一 manifest 安全状态，不打断原子切流。`
- Reference: `建议核对 0041 检查与当前 schema 的适用性及同一 manifest 安全状态。`

This is the model's audit of the historical snapshot, not an assertion that the
reviewed static-schema guard is now incorrect. The actual failure was safely
closed before this follow-up; source references and the original failed release
remain available for audit.

Validation: all `./common` tests including fake SMTP/TLS/auth regression, focused
Advisor tests including real-output rendering, Router 36 focused tests/typecheck,
and four billed actual-model generation/fidelity cases. No real test mail,
historical backfill, SMTP setting change or duplicate notification was sent.

Final bounded four-case generation output is saved under
`/tmp/acu-advisor-live-acceptance/report.json`. The other subjects were
`统计与列表的type=0口径不一致`, `非法金额可能被按零汇总`, and
`不限类型时统计仍限于消费记录`. Check summaries are concrete suggestions, not
execution claims. The same source/fidelity path remains mandatory. Extra MIME
tests cover CRLF and mixed LF/CR/CRLF without duplicate CR, and literal ASCII
encoded-word Subject text surviving a single decoder pass.
