import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignTranslationClient } from '../src/services/signTranslationClient.ts'
import { TRANSPORT } from '../src/config/signRecording.ts'
import { parseServerResponse } from '../src/services/signServerResponse.ts'
import { DEFAULT_SIGN_POLICY } from '../src/types/signTranslation.ts'

function fakeServer(onSend) {
  const results = []
  const errors = []
  const published = []
  const adapter = new SignTranslationClient('ws://localhost/ws/v1/translations', (result) => results.push(result), (error) => errors.push(error))
  const client = adapter.client
  let receiver
  client.subscribe = (destination, callback) => {
    assert.equal(destination, '/user/queue/translations')
    receiver = callback
    return { id: 'responses', unsubscribe() {} }
  }
  const respond = (body) => queueMicrotask(() => receiver({ body: JSON.stringify(body) }))
  client.publish = ({ destination, body }) => {
    const message = JSON.parse(body)
    published.push({ destination, message })
    if (destination === '/app/translations/ready') {
      respond({ type: 'READY', success: true, data: { mode: 'SIGN_TO_SPEECH', mediaPolicy: DEFAULT_SIGN_POLICY } })
    } else onSend(message, respond)
  }
  Object.defineProperty(client, 'connected', { get: () => true })
  client.activate = () => client.onConnect({})
  client.deactivate = async () => {}
  return { adapter, results, errors, published, respond, client }
}

const request = {
  type: 'VIDEO_CHUNK', requestId: '550e8400-e29b-41d4-a716-446655440000',
  sequence: 1, timestamp: '2026-10-20T00:00:00.000Z',
  input: { encoding: 'JPEG', frames: [], width: 640, height: 480, fps: 15 },
}
const ack = (message) => ({
  type: 'ACK', success: true, requestId: message.requestId,
  data: { status: message.type === 'VIDEO_CHUNK' ? 'RECEIVING' : 'PROCESSING',
    acknowledgedSequence: message.sequence ?? message.input.lastSequence },
})

test('STOMP requests READY after subscribing, sends JSON and filters stale results', async () => {
  const server = fakeServer((message, respond) => respond(ack(message)))
  assert.deepEqual(await server.adapter.connect(), DEFAULT_SIGN_POLICY)
  await server.adapter.send(request)
  assert.equal(server.published[0].destination, '/app/translations/ready')
  assert.equal(server.published[1].destination, '/app/translations')
  const partial = (sequence, text) => ({ type: 'PARTIAL', success: true, requestId: request.requestId,
    data: { processedSequence: sequence, result: { partialText: text } } })
  server.respond(partial(2, 'new'))
  server.respond(partial(1, 'old'))
  server.respond({ ...partial(3, 'other'), requestId: 'other' })
  server.respond({ type: 'FINAL', success: true, requestId: request.requestId, data: { result: { text: 'final' } } })
  server.respond(partial(4, 'late'))
  await new Promise((resolve) => setImmediate(resolve))
  assert.deepEqual(server.results.map((result) => result.text), ['new', 'final'])
  server.adapter.close()
})

test('COMMIT gap resends the original missing chunk and then commits', async () => {
  let commits = 0
  const server = fakeServer((message, respond) => {
    if (message.type === 'COMMIT' && commits++ === 0) {
      respond({ type: 'ERROR', success: false, requestId: message.requestId,
        error: { code: 'SEQUENCE_GAP', message: 'missing', details: { missingSequences: [1] } } })
    } else respond(ack(message))
  })
  await server.adapter.connect()
  await server.adapter.send(request)
  await server.adapter.send({ type: 'COMMIT', requestId: request.requestId,
    timestamp: request.timestamp, input: { lastSequence: 1, reason: 'USER_FINISHED' } })
  assert.deepEqual(server.published.slice(1).map(({ message }) => message.type),
    ['VIDEO_CHUNK', 'COMMIT', 'VIDEO_CHUNK', 'COMMIT'])
  assert.deepEqual(server.published[1].message, server.published[3].message)
  server.adapter.close()
})

test('reconnect repeats READY and resends the unacknowledged chunk', async () => {
  let attempts = 0
  const server = fakeServer((message, respond) => { if (++attempts > 1) respond(ack(message)) })
  await server.adapter.connect()
  const sending = server.adapter.send(request)
  server.client.onWebSocketClose({})
  server.client.onConnect({})
  await sending
  assert.equal(server.published.filter(({ destination }) => destination.endsWith('/ready')).length, 2)
  assert.equal(attempts, 2)
  server.adapter.close()
})

test('application errors reject rather than treating the request as saved', async () => {
  const server = fakeServer((message, respond) => respond({ type: 'ERROR', success: false, requestId: message.requestId,
    error: { code: 'INVALID_MEDIA', message: 'bad media', retryable: true } }))
  await server.adapter.connect()
  await assert.rejects(server.adapter.send(request), /bad media/)
  assert.equal(server.published.length, 2)
  server.adapter.close()
})


test('ERROR after COMMIT ACK reaches the error callback and closes the connection', async () => {
  const server = fakeServer((message, respond) => respond(ack(message)))
  await server.adapter.connect()
  await server.adapter.send({ type: 'COMMIT', requestId: request.requestId,
    timestamp: request.timestamp, input: { lastSequence: 1, reason: 'USER_FINISHED' } })
  server.respond({ type: 'ERROR', success: false, requestId: request.requestId,
    error: { code: 'AI_TIMEOUT', message: 'AI timeout' } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(server.errors.length, 1)
  assert.equal(server.errors[0].message, 'AI timeout')
  assert.equal(server.adapter.disposed, true)
  server.respond({ type: 'FINAL', success: true, requestId: request.requestId, data: { result: { text: 'late' } } })
  await new Promise((resolve) => setImmediate(resolve))
  assert.equal(server.results.length, 0)
})

test('malformed ACK rejects the pending request instead of resolving it', async () => {
  const server = fakeServer((message, respond) => respond({ ...ack(message), data: { status: 'RECEIVING', acknowledgedSequence: '1' } }))
  await server.adapter.connect()
  await assert.rejects(server.adapter.send(request), /숫자/)
  server.adapter.close()
})

test('cached ACKed chunks have a capacity limit and are cleared on close', async () => {
  const server = fakeServer((message, respond) => respond(ack(message)))
  await server.adapter.connect()
  await server.adapter.send(request)
  assert.equal(server.adapter.chunks.size, 1)
  server.adapter.retainedBytes = TRANSPORT.maxRetainedBytes
  await assert.rejects(server.adapter.send({ ...request, sequence: 2 }), /용량 제한/)
  assert.equal(server.adapter.chunks.size, 1)
  server.adapter.close()
  assert.equal(server.adapter.retainedBytes, 0)
  assert.equal(server.adapter.chunks.size, 0)
})

test('response parser validates text, policies and gap arrays and normalizes policy key order', () => {
  assert.throws(() => parseServerResponse({ type: 'FINAL', success: true, requestId: 'x', data: { result: { text: {} } } }))
  assert.throws(() => parseServerResponse({ type: 'ERROR', success: false, error: { code: 'SEQUENCE_GAP', message: 'gap', details: { missingSequences: ['1'] } } }))
  const policy = Object.fromEntries(Object.entries(DEFAULT_SIGN_POLICY).reverse())
  assert.deepEqual(parseServerResponse({ type: 'READY', success: true, data: { mode: 'SIGN_TO_SPEECH', mediaPolicy: policy } }).data.mediaPolicy, DEFAULT_SIGN_POLICY)
})


test('WebSocket failure rejects READY immediately and close prevents retries', async () => {
  const adapter = new SignTranslationClient('ws://localhost/ws/v1/translations', () => {})
  let closed = false
  adapter.client.activate = () => queueMicrotask(() => adapter.client.onWebSocketError({}))
  adapter.client.deactivate = async () => { closed = true }
  await assert.rejects(adapter.connect(), /WebSocket/)
  adapter.close()
  assert.equal(closed, true)
})
