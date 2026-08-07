import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url))
const read = (path) => readFileSync(`${repoRoot}/${path}`, 'utf8')
const readBinary = (path) => readFileSync(`${repoRoot}/${path}`)

describe('ACUindex brand presentation', () => {
  test('keeps the square favicon while setting the fixed document title', () => {
    const html = read('web/index.html')

    assert.match(html, /href="\/logo\.png"/)
    assert.match(html, /<title>ACUindex · 清度<\/title>/)
    assert.match(html, /name="title" content="ACUindex · 清度"/)
  })

  test('uses the supplied horizontal logo without square-image styling', () => {
    const files = [
      'web/src/components/layout/components/header-logo.tsx',
      'web/src/components/layout/components/system-brand.tsx',
      'web/src/components/layout/components/footer.tsx',
      'web/src/features/auth/auth-layout.tsx',
      'web/src/features/setup/setup-wizard.tsx',
    ]

    for (const file of files) {
      const source = read(file)
      assert.match(source, /object-contain/, file)
      assert.match(source, /invert/, file)
      assert.doesNotMatch(source, /aspect-square/, file)
      assert.doesNotMatch(source, /object-cover/, file)
    }
  })

  test('uses a cropped RGBA wordmark and height-led responsive treatments', () => {
    const wordmark = readBinary(
      'web/public/acu-index-site/assets/acuindex-wordmark.png'
    )
    const publicHeader = read(
      'web/src/components/layout/components/public-header.tsx'
    )
    const systemBrand = read(
      'web/src/components/layout/components/system-brand.tsx'
    )
    const authLayout = read('web/src/features/auth/auth-layout.tsx')

    assert.equal(wordmark.toString('ascii', 1, 4), 'PNG')
    assert.equal(wordmark.readUInt32BE(16), 1925)
    assert.equal(wordmark.readUInt32BE(20), 690)
    assert.equal(wordmark[25], 6, 'PNG must use RGBA color type')
    assert.match(publicHeader, /scrolled \? 'h-7' : 'h-7 sm:h-8'/)
    assert.doesNotMatch(publicHeader, /w-\[4\.75rem\][^']*object-contain/)
    assert.match(systemBrand, /group-data-\[collapsible=icon\]:invisible/)
    assert.match(authLayout, /h-9 sm:h-11/)
    assert.doesNotMatch(authLayout, /relative h-9[^']*w-/)
  })

  test('publishes the commercial placeholder and the requested navigation', () => {
    const staticIndex = read('web/public/acu-index-site/index.html')
    const webRouter = read('router/web-router.go')
    const nav = read('web/src/hooks/use-top-nav-links.ts')
    const fallbackNav = read(
      'web/src/components/layout/config/top-nav.config.ts'
    )

    assert.match(staticIndex, /<title>ACUindex · 清度<\/title>/)
    assert.match(webRouter, /router\.GET\("\/index"/)
    for (const source of [nav, fallbackNav]) {
      assert.match(
        source,
        /title: (?:t\()?['"]Home['"]\)?, href: ['"]\/index['"]/
      )
      assert.match(
        source,
        /title: (?:t\()?['"]Usage Guide['"]\)?, href: ['"]\/['"]/
      )
      assert.match(
        source,
        /title: (?:t\()?['"]Console['"]\)?, href: ['"]\/dashboard['"]/
      )
      assert.match(
        source,
        /title: (?:t\()?['"]Model Pricing['"]\)?, href: ['"]\/pricing['"]/
      )
      assert.doesNotMatch(source, /href: ['"]\/rankings['"]/)
    }
  })

  test('uses only the ACUindex copyright in the visible footer', () => {
    const footer = read('web/src/components/layout/components/footer.tsx')

    assert.match(footer, /to='\/index'/)
    assert.match(footer, /BRAND_NAME} · {BRAND_NAME_ZH}/)
    assert.match(footer, /AI capacity orchestration infrastructure/)
    assert.doesNotMatch(footer, /ProjectAttribution/)
    assert.doesNotMatch(footer, /QuantumNous\/new-api/)
  })
})
