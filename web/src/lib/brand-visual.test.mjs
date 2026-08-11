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

  test('uses one serif text wordmark across product brand surfaces', () => {
    const component = read(
      'web/src/components/layout/components/brand-wordmark.tsx'
    )
    const files = [
      'web/src/components/layout/components/system-brand.tsx',
      'web/src/components/layout/components/footer.tsx',
      'web/src/components/layout/components/public-header.tsx',
      'web/src/features/auth/auth-layout.tsx',
      'web/src/features/setup/setup-wizard.tsx',
    ]

    assert.match(component, /font-serif/)
    assert.match(component, /font-semibold/)
    assert.match(component, /tracking-\[-0\.035em\]/)
    assert.match(component, />\s*ACUindex\s*<\/span>/)
    for (const file of files) {
      const source = read(file)
      assert.match(source, /BrandWordmark/, file)
      assert.doesNotMatch(source, /BRAND_WORDMARK_URL/, file)
    }
  })

  test('retains the historical PNG but uses responsive text treatments', () => {
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
    const appHeader = read(
      'web/src/components/layout/components/app-header.tsx'
    )
    const footer = read('web/src/components/layout/components/footer.tsx')

    assert.equal(wordmark.toString('ascii', 1, 4), 'PNG')
    assert.equal(wordmark.readUInt32BE(16), 1925)
    assert.equal(wordmark.readUInt32BE(20), 690)
    assert.equal(wordmark[25], 6, 'PNG must use RGBA color type')
    assert.match(publicHeader, /scrolled \? 'text-\[22px\]' : 'text-2xl'/)
    assert.match(systemBrand, /group-data-\[collapsible=icon\]:invisible/)
    assert.match(systemBrand, /text-\[26px\]/)
    assert.match(appHeader, /className='md:hidden'/)
    assert.match(authLayout, /text-\[30px\] sm:text-4xl/)
    assert.match(footer, /items-end text-right/)
    assert.match(footer, /BrandWordmark className='text-\[28px\]'/)
  })

  test('publishes the commercial placeholder and the requested navigation', () => {
    const staticIndex = read('web/public/acu-index-site/index.html')
    const webRouter = read('router/web-router.go')
    const nav = read('web/src/hooks/use-top-nav-links.ts')
    const fallbackNav = read(
      'web/src/components/layout/config/top-nav.config.ts'
    )

    assert.match(staticIndex, /<title>ACUindex · 清度<\/title>/)
    assert.match(webRouter, /\[\]string\{"\/index", "\/index\/"\}/)
    assert.match(webRouter, /router\.GET\(path, serveCommercialIndex\)/)
    assert.match(webRouter, /router\.HEAD\(path, serveCommercialIndex\)/)
    for (const source of [nav, fallbackNav]) {
      assert.match(
        source,
        /title: (?:t\()?['"]Home['"]\)?, href: PUBLIC_HOME_URL/
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

    assert.match(footer, /href=\{PUBLIC_HOME_URL\}/)
    assert.match(footer, /BRAND_NAME} · {BRAND_NAME_ZH}/)
    assert.match(footer, /AI capacity orchestration infrastructure/)
    assert.doesNotMatch(footer, /ProjectAttribution/)
    assert.doesNotMatch(footer, /QuantumNous\/new-api/)
  })

  test('routes every standalone homepage entry to the public marketing site', () => {
    const files = [
      'web/src/components/layout/components/public-header.tsx',
      'web/src/components/layout/components/public-navigation.tsx',
      'web/src/components/layout/components/top-nav.tsx',
      'web/src/components/layout/components/mobile-drawer.tsx',
      'web/src/components/layout/components/system-brand.tsx',
      'web/src/components/layout/components/footer.tsx',
      'web/src/features/auth/auth-layout.tsx',
    ]

    for (const file of files) {
      const source = read(file)
      assert.match(source, /PUBLIC_HOME_URL|resolvedHomeUrl/, file)
      assert.doesNotMatch(source, /href=['"]\/index['"]/, file)
      assert.doesNotMatch(source, /to=['"]\/index['"]/, file)
    }
  })
})
