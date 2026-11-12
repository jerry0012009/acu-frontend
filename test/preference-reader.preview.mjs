import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

import { preferenceFixture } from './preference-reader.fixture.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../web/dist')
const types = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon' }
createServer(async (request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  response.setHeader('Cache-Control', 'no-store')
  if (path.startsWith('/api/')) {
    response.setHeader('Content-Type', 'application/json')
    response.end(JSON.stringify({ success: true, data: preferenceFixture(path) }))
    return
  }
  const file = resolve(root, `.${decodeURIComponent(path)}`)
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return }
  try {
    const content = await readFile(extname(file) ? file : resolve(root, 'index.html'))
    response.setHeader('Content-Type', types[extname(file)] || 'text/html')
    response.end(content)
  } catch { response.writeHead(404).end() }
}).listen(Number(process.env.PORT || 5189), '127.0.0.1', () => console.log('Fixture-only preference preview: http://127.0.0.1:5189/private-acu/account'))
