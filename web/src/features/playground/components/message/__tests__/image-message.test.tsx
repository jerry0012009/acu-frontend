import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderToStaticMarkup } from 'react-dom/server'

import { appendUserMessagePair } from '../../../lib/message/conversation-message-utils'
import { applyImageGenerationResponse } from '../../../lib/message/message-streaming-utils'
import { PlaygroundMessageContent } from '../playground-message-content'

test('a completed image-only response shows its image and actions without a loading indicator', () => {
  const pending = appendUserMessagePair([], 'Draw a square').at(-1)
  assert.ok(pending)
  const message = applyImageGenerationResponse(pending, {
    created: 1,
    data: [{ b64_json: 'AQID' }],
  })
  assert.ok(message)
  const html = renderToStaticMarkup(
    <PlaygroundMessageContent
      actions={<button type='button'>Retry image</button>}
      alignment='left'
      message={message}
      versionContent=''
    />
  )
  assert.match(html, /src="data:image\/png;base64,AQID"/)
  assert.match(html, /alt="generated-image-1.png"/)
  assert.match(html, /Retry image/)
  assert.doesNotMatch(html, /Thinking|Generating/)
})
