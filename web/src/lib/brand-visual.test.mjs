import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const read = (path) => readFileSync(`${repoRoot}/${path}`, 'utf8')

describe('ACUindex brand presentation', () => {
  test('keeps the square favicon while setting the fixed document title', () => {
    const html = read('web/index.html')

    assert.match(html, /href="\/logo\.png"/)
    assert.match(html, /<title>ACUindex · 清度<\/title>/)
    assert.match(html, /name="title" content="ACUindex · 清度"/)
  })

  test('uses the supplied horizontal logo without square-image styling', () => {
    const files = [
      'web/src/components/layout/components/public-header.tsx',
      'web/src/components/layout/components/system-brand.tsx',
      'web/src/components/layout/components/footer.tsx',
      'web/src/features/auth/auth-layout.tsx',
      'web/src/features/setup/setup-wizard.tsx',
    ]

    for (const file of files) {
      const source = read(file)
      assert.match(source, /object-contain/, file)
      assert.doesNotMatch(source, /aspect-square/, file)
      assert.doesNotMatch(source, /object-cover/, file)
    }
  })

  test('defines separate mobile, desktop, scrolled, and collapsed treatments', () => {
    const publicHeader = read(
      'web/src/components/layout/components/public-header.tsx'
    )
    const systemBrand = read(
      'web/src/components/layout/components/system-brand.tsx'
    )

    assert.match(publicHeader, /scrolled[\s\S]*h-7 w-\[4\.75rem\]/)
    assert.match(publicHeader, /sm:h-8 sm:w-\[5\.25rem\]/)
    assert.match(systemBrand, /group-data-\[collapsible=icon\]:invisible/)
  })
})
