import * as cssTree from 'css-tree'
// Adapted from https://github.com/iwyxdxl/gpttesticu (MIT, 2026).
import DOMPurify from 'dompurify'

const SANITIZE_CONFIG = {
  WHOLE_DOCUMENT: true,
  USE_PROFILES: { html: true, svg: true, svgFilters: true },
  ADD_TAGS: ['use', 'animate', 'animateTransform', 'animateMotion', 'mpath'],
  FORBID_TAGS: [
    'script',
    'iframe',
    'object',
    'embed',
    'foreignObject',
    'form',
    'input',
    'button',
    'textarea',
    'select',
    'link',
    'meta',
    'base',
    'audio',
    'video',
    'source',
  ],
  FORBID_ATTR: [
    'srcset',
    'ping',
    'target',
    'action',
    'formaction',
    'srcdoc',
    'is',
  ],
}

function safeAttribute(name: string, value: string): boolean {
  const lower = name.toLowerCase()
  if (lower.startsWith('on')) return false
  if (lower.startsWith('xmlns')) {
    return [
      'http://www.w3.org/2000/svg',
      'http://www.w3.org/1999/xlink',
      'http://www.w3.org/1999/xhtml',
    ].includes(value)
  }
  if (lower.includes(':') && lower !== 'xlink:href' && lower !== 'xml:space') {
    return false
  }
  if (['href', 'xlink:href', 'src', 'poster', 'background'].includes(lower)) {
    return /^#[\w:.-]+$/.test(value)
  }
  if (lower === 'attributename') {
    return /^(transform|d|opacity|fill|stroke|stroke-width|stroke-dashoffset|cx|cy|r|x|y|x1|x2|y1|y2|width|height)$/.test(
      value
    )
  }
  return true
}

function cleanCss(css: string, inline = false): string {
  try {
    const decoded = css.replaceAll(
      /\\([0-9a-f]{1,6})\s?|\\([^\r\n])/gi,
      (_match, hex: string, char: string) =>
        hex
          ? String.fromCodePoint(Math.min(Number.parseInt(hex, 16), 0x10ffff))
          : char
    )
    const ast = cssTree.parse(decoded, {
      context: inline ? 'declarationList' : 'stylesheet',
      parseCustomProperty: true,
    })
    let unsafe = false
    cssTree.walk(ast, (node) => {
      if (node.type === 'Url' && !/^#[\w:.-]+$/.test(node.value)) unsafe = true
      if (node.type === 'Raw') unsafe = true
      if (
        node.type === 'Atrule' &&
        !['keyframes', '-webkit-keyframes', 'media', 'supports'].includes(
          node.name.toLowerCase()
        )
      ) {
        unsafe = true
      }
      if (
        node.type === 'Function' &&
        /^(expression|image-set|-webkit-image-set|src)$/i.test(node.name)
      ) {
        unsafe = true
      }
    })
    return unsafe ? '' : cssTree.generate(ast)
  } catch {
    return ''
  }
}

DOMPurify.addHook('uponSanitizeAttribute', (_node, data) => {
  if (!safeAttribute(data.attrName, data.attrValue)) data.keepAttr = false
  if (data.attrName === 'style') data.attrValue = cleanCss(data.attrValue, true)
})
DOMPurify.addHook('uponSanitizeElement', (node, data) => {
  if (data.tagName === 'style') {
    node.textContent = cleanCss(node.textContent ?? '')
  }
})

export function sanitizeGpttesticuPreview(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_CONFIG)
}
