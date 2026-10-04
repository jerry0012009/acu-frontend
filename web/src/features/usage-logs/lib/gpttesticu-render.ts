// Adapted from https://github.com/iwyxdxl/gpttesticu (MIT, 2026).
import { sanitizeGpttesticuPreview } from './gpttesticu-sanitize'

const CSP_META =
  "<meta http-equiv=\"Content-Security-Policy\" content=\"default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src 'none'; base-uri 'none'; form-action 'none'\">"

export function extractGpttesticuHtml(text: string): string | null {
  if (!text) return null
  const fences = [
    ...text.matchAll(
      /```(?:html|htm|xml|svg)?[^\S\n]*\r?\n([\s\S]*?)(?:```|$)/gi
    ),
  ].map((match) => match[1])
  const good = fences.filter((value) => /<svg|<html|<!doctype/i.test(value))
  const pool = good.length
    ? good
    : fences.filter((value) => value.includes('<'))
  if (pool.length) return pool.at(-1)?.trim() ?? null

  const lower = text.toLowerCase()
  const doctype = lower.indexOf('<!doctype html')
  const html = lower.indexOf('<html')
  const start = html >= 0 && (doctype < 0 || html < doctype) ? html : doctype
  if (start >= 0) {
    const end = lower.lastIndexOf('</html>')
    return (end >= 0 ? text.slice(start, end + 7) : text.slice(start)).trim()
  }

  const trimmed = text.trim()
  if (trimmed.startsWith('<') && /<svg[\s>]/i.test(trimmed)) {
    const end = trimmed.toLowerCase().lastIndexOf('</svg>')
    return (end >= 0 ? trimmed.slice(0, end + 6) : trimmed).trim()
  }
  return null
}

export function buildGpttesticuPreview(html: string): string {
  const standalone = !/<html[\s>]/i.test(html)
  html = sanitizeGpttesticuPreview(html)
  const wrapperStyle =
    '<style>html,body{margin:0;padding:0;background:#f5f2e9}body{min-height:100vh;display:grid;place-items:center}svg{width:100%;height:auto;max-height:100vh;object-fit:contain}</style>'
  if (/<html[\s>]/i.test(html)) {
    let output = html
    if (/<head[^>]*>/i.test(output)) {
      output = output.replace(
        /<head[^>]*>/i,
        (match) => `${match}${CSP_META}${standalone ? wrapperStyle : ''}`
      )
    } else {
      output = output.replace(
        /<html[^>]*>/i,
        (match) => `${match}<head>${CSP_META}</head>`
      )
    }
    return output
  }
  return `<!DOCTYPE html><html><head>${CSP_META}${wrapperStyle}</head><body>${html}</body></html>`
}
