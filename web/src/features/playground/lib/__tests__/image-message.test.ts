import assert from 'node:assert/strict'
import { test } from 'node:test'

import type { PlaygroundConfig, ParameterEnabled } from '../../types'
import { dataUrlByteLength } from '../input/image-attachments'
import { appendUserMessagePair } from '../message/conversation-message-utils'
import { applyImageGenerationResponse } from '../message/message-streaming-utils'
import {
  buildChatCompletionPayload,
  buildImageGenerationPayload,
} from '../streaming/payload-builder'

const config: PlaygroundConfig = {
  model: 'acu-auto',
  selectedTokenId: 1,
  temperature: 0.7,
  top_p: 1,
  max_tokens: 1024,
  frequency_penalty: 0,
  presence_penalty: 0,
  seed: null,
  stream: false,
}

const parameters: ParameterEnabled = {
  temperature: false,
  top_p: false,
  max_tokens: false,
  frequency_penalty: false,
  presence_penalty: false,
  seed: false,
}

test('sends a photo-only playground message as OpenAI image_url content', () => {
  const messages = appendUserMessagePair([], '', [
    {
      type: 'image_url',
      url: 'data:image/jpeg;base64,AQID',
      filename: 'reference.jpg',
      mediaType: 'image/jpeg',
    },
  ])

  const payload = buildChatCompletionPayload(messages, config, parameters)

  assert.deepEqual(payload.messages, [
    {
      role: 'user',
      content: [
        { type: 'text', text: '' },
        {
          type: 'image_url',
          image_url: { url: 'data:image/jpeg;base64,AQID' },
        },
      ],
    },
  ])
})

test('measures base64 image data without counting the data URL prefix', () => {
  assert.equal(dataUrlByteLength('data:image/jpeg;base64,AQID'), 3)
  assert.equal(dataUrlByteLength('data:image/jpeg;base64,AQ=='), 1)
  assert.equal(dataUrlByteLength('data:image/jpeg;base64,AQI='), 2)
  assert.equal(dataUrlByteLength('data:image/jpeg;base64,'), 0)
})

test('builds a minimal image generation payload from the latest user prompt', () => {
  const messages = appendUserMessagePair([], 'Draw a blue square')
  const payload = buildImageGenerationPayload(messages, {
    ...config,
    model: 'gpt-image-2.5-flare',
    stream: true,
  })

  assert.deepEqual(payload, {
    model: 'gpt-image-2.5-flare',
    prompt: 'Draw a blue square',
    n: 1,
    response_format: 'b64_json',
  })
})

test('turns a base64 image response into a completed assistant image', () => {
  const assistant = appendUserMessagePair([], 'Draw a blue square').at(-1)
  assert.ok(assistant)

  const updated = applyImageGenerationResponse(assistant, {
    created: 1,
    data: [{ b64_json: 'AQID' }],
  })

  assert.equal(updated?.status, 'complete')
  assert.deepEqual(updated?.attachments, [
    {
      type: 'image_url',
      url: 'data:image/png;base64,AQID',
      filename: 'generated-image-1.png',
      mediaType: 'image/png',
    },
  ])
})

test('rejects an image response with no usable data and preserves the original message', () => {
  const assistant = appendUserMessagePair([], 'Draw a square').at(-1)
  assert.ok(assistant)
  assert.equal(
    applyImageGenerationResponse(assistant, { created: 1, data: [{}] }),
    null
  )
  assert.equal(assistant.status, 'loading')
})
