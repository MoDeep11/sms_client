import assert from 'node:assert/strict'
import { test } from 'node:test'
import { SignRecordingSession } from '../src/services/signRecordingSession.ts'
import { DEFAULT_SIGN_POLICY } from '../src/types/signTranslation.ts'

// Minimal JPEG marker fixture for metadata validation; real JPEG decoding is checked in browser verification.
const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0, 8, 8, 1, 224, 2, 128, 0, 0xff, 0xd9]).toString('base64')
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const video = { readyState: 4, videoWidth: 1280, videoHeight: 720, srcObject: null }
globalThis.document = {
  visibilityState: 'visible',
  createElement: () => ({
    getContext: () => ({ fillRect() {}, drawImage() {} }),
    toDataURL: () => `data:image/jpeg;base64,${jpeg}`,
  }),
}
test('stop immediately flushes a short batch and emits one COMMIT, with fresh IDs per recording', async () => {
  const requests = []
  const session = new SignRecordingSession({ video, save: async (request) => { requests.push(request) }, onProgress() {} })
  await session.start()
  await Promise.all([session.stop(), session.stop()])
  assert.deepEqual(requests.map((request) => request.type), ['VIDEO_CHUNK', 'COMMIT'])
  assert.equal(requests[0].input.frames.length, 1)
  assert.equal(requests[0].input.frames[0].contentBase64, jpeg)
  assert.equal(requests[0].input.frames[0].frameIndex, 1)
  assert.equal(requests[1].input.lastSequence, 1)
  assert.equal(requests[0].requestId, requests[1].requestId)
  const other = new SignRecordingSession({ video, save: async () => {}, onProgress() {} })
  assert.notEqual(session.requestId, other.requestId)
  session.dispose()
  other.dispose()
})

test('full batches use global frame numbering and COMMIT waits for storage', async () => {
  const requests = []
  let progress
  const session = new SignRecordingSession({
    video,
    save: async (request) => { await sleep(5); requests.push(request) },
    onProgress: (next) => { progress = next },
  })
  await session.start()
  await sleep(235)
  await session.stop()
  const chunks = requests.filter((request) => request.type === 'VIDEO_CHUNK')
  assert.equal(chunks[0].input.frames.length, 3)
  const frames = chunks.flatMap((request) => request.input.frames)
  assert.deepEqual(frames.map((frame) => frame.frameIndex), frames.map((_, i) => i + 1))
  assert.deepEqual(chunks.map((request) => request.sequence), chunks.map((_, i) => i + 1))
  assert.equal(requests.at(-1).input.lastSequence, chunks.length)
  assert.equal(progress.phase, 'saved')
  const count = requests.length
  await sleep(100)
  assert.equal(requests.length, count)
  session.dispose()
})

test('READY must complete before capture and its batch policy is used', async () => {
  const requests = []
  let ready
  const transport = {
    connect: () => new Promise((resolve) => { ready = resolve }),
    send: async (request) => { requests.push(request) },
    close() {},
  }
  const session = new SignRecordingSession({ video, transport, onProgress() {} })
  const start = session.start()
  await sleep(10)
  assert.equal(requests.length, 0)
  ready({ ...DEFAULT_SIGN_POLICY, videoFramesPerChunk: 1, videoChunkIntervalMs: 1000 / 15 })
  await start
  await session.stop()
  assert.equal(requests[0].input.frames.length, 1)
  assert.equal(requests.at(-1).type, 'COMMIT')
  session.dispose()
})

test('storage failure is an error and never commits or reports saved', async () => {
  const states = []
  const requests = []
  const session = new SignRecordingSession({
    video, onProgress: (state) => states.push(state.phase),
    save: async (request) => { requests.push(request); throw new Error('disk full') },
  })
  await session.start()
  await session.stop()
  assert.equal(states.at(-1), 'error')
  assert.ok(!states.includes('saved'))
  assert.ok(!requests.some((request) => request.type === 'COMMIT'))
  session.dispose()
})

test('unmount during READY does not start capture or issue COMMIT', async () => {
  let ready
  const requests = []
  let closed = false
  const session = new SignRecordingSession({
    video, save: async (request) => { requests.push(request) }, onProgress() {},
    transport: { connect: () => new Promise((resolve) => { ready = resolve }), send: async () => {}, close: () => { closed = true } },
  })
  const starting = session.start()
  session.dispose()
  ready(DEFAULT_SIGN_POLICY)
  await starting
  assert.equal(requests.length, 0)
  assert.equal(closed, true)
})

test('result timeout closes the transport and ignores late FINAL', async () => {
  let closed = false
  const results = []
  const session = new SignRecordingSession({ video, onProgress() {},
    onResult: (result) => results.push(result), limits: { resultTimeoutMs: 10 },
    transport: { connect: async () => DEFAULT_SIGN_POLICY, send: async () => {}, close: () => { closed = true } },
  })
  await session.start()
  await session.stop()
  assert.equal(session.phase, 'waiting')
  await sleep(30)
  assert.equal(session.phase, 'error')
  assert.equal(closed, true)
  session.acceptResult({ type: 'FINAL', text: 'late' })
  assert.equal(results.length, 0)
  assert.equal(session.phase, 'error')
  session.dispose()
})

test('FINAL before COMMIT ACK completes once and duplicate results are ignored', async () => {
  const results = []
  let closed = false
  const session = new SignRecordingSession({ video, onProgress() {}, onResult: (result) => results.push(result),
    transport: { connect: async () => DEFAULT_SIGN_POLICY,
      send: async (message) => {
        if (message.type === 'COMMIT') {
          session.acceptResult({ type: 'FINAL', text: 'hello' })
          assert.equal(results.length, 0, 'do not speak before COMMIT ACK')
        }
      }, close: () => { closed = true } },
  })
  await session.start()
  await session.stop()
  assert.equal(session.phase, 'saved')
  assert.equal(closed, true)
  session.acceptResult({ type: 'FINAL', text: 'duplicate' })
  assert.equal(results.length, 1)
  session.dispose()
})

test('recording duration limit flushes and commits automatically', async () => {
  const requests = []
  const session = new SignRecordingSession({ video, onProgress() {}, limits: { maxDurationMs: 10 },
    save: async (request) => { requests.push(request) },
  })
  await session.start()
  await sleep(35)
  assert.equal(session.phase, 'saved')
  assert.equal(requests.at(-1).type, 'COMMIT')
  assert.equal(requests.filter((request) => request.type === 'COMMIT').length, 1)
  session.dispose()
})

test('asynchronous server failure during result wait becomes terminal', async () => {
  let closed = false
  const session = new SignRecordingSession({ video, onProgress() {},
    transport: { connect: async () => DEFAULT_SIGN_POLICY, send: async () => {}, close: () => { closed = true } },
  })
  await session.start()
  await session.stop()
  session.fail(new Error('AI unavailable'))
  assert.equal(session.phase, 'error')
  assert.equal(closed, true)
  session.acceptResult({ type: 'FINAL', text: 'ignored' })
  assert.equal(session.phase, 'error')
  session.dispose()
})


test('early FINAL is delivered once only after stop, PARTIAL never counts as final playback', async () => {
  const finals = []
  const session = new SignRecordingSession({ video, onProgress() {},
    onResult: (result) => { if (result.type === 'FINAL') finals.push({ text: result.text, phase: session.phase }) },
    transport: { connect: async () => DEFAULT_SIGN_POLICY, send: async () => {}, close() {} },
  })
  await session.start()
  session.acceptResult({ type: 'PARTIAL', text: '중간' })
  assert.equal(finals.length, 0)
  session.acceptResult({ type: 'FINAL', text: '최종' })
  assert.equal(finals.length, 0)
  await session.stop()
  assert.deepEqual(finals, [{ text: '최종', phase: 'saved' }])
  session.acceptResult({ type: 'FINAL', text: '중복' })
  session.acceptResult({ type: 'PARTIAL', text: '늦은 중간' })
  await session.stop()
  assert.equal(finals.length, 1)
  session.dispose()
})

test('a failed COMMIT does not deliver a buffered FINAL for autoplay', async () => {
  const results = []
  const session = new SignRecordingSession({ video, onProgress() {}, onResult: result => results.push(result),
    transport: { connect: async () => DEFAULT_SIGN_POLICY, send: async message => {
      if (message.type === 'COMMIT') {
        session.acceptResult({ type: 'FINAL', text: 'early' })
        throw new Error('commit failed')
      }
    }, close() {} },
  })
  await session.start()
  await session.stop()
  assert.equal(session.phase, 'error')
  assert.deepEqual(results, [])
  session.dispose()
})

test('each local mock recording autoplays once after its own COMMIT, even with identical text', async () => {
  const spoken = []
  for (let i = 0; i < 2; i++) {
    const requests = []
    const session = new SignRecordingSession({ video, onProgress() {},
      save: async message => { requests.push(message) },
      mockResult: { type: 'FINAL', text: '같은 번역문' },
      onResult: result => {
        assert.equal(requests.at(-1).type, 'COMMIT')
        assert.equal(session.phase, 'saved')
        spoken.push(result.text)
      },
    })
    await session.start()
    assert.equal(spoken.length, i)
    await session.stop()
    await session.stop()
    session.acceptResult({ type: 'FINAL', text: 'duplicate' })
    session.dispose()
  }
  assert.deepEqual(spoken, ['같은 번역문', '같은 번역문'])
})


test('capture reduces JPEG quality to fit the negotiated frame budget', async () => {
  const sent = []
  const qualities = []
  const session = new SignRecordingSession({ video, onProgress() {}, transport: {
    connect: async () => ({ ...DEFAULT_SIGN_POLICY, maxMessageBytes: 4096 }),
    send: async message => sent.push(message), close() {},
  } })
  session.canvas.toDataURL = (_, quality) => {
    qualities.push(quality)
    return 'data:image/jpeg;base64,' + (quality > 0.5 ? 'A'.repeat(5000) : jpeg)
  }
  await session.start()
  await session.stop()
  assert.deepEqual(qualities, [0.85, 0.7, 0.5])
  assert.equal(sent[0].input.width, 640)
  assert.equal(sent[0].input.frames[0].contentBase64, jpeg)
  assert.ok(Buffer.byteLength(JSON.stringify(sent[0])) + 1024 <= 4096)
  session.dispose()
})

test('capture rejects an image that cannot fit even at lowest quality', async () => {
  const sent = []
  const session = new SignRecordingSession({ video, onProgress() {}, transport: {
    connect: async () => ({ ...DEFAULT_SIGN_POLICY, maxMessageBytes: 4096 }),
    send: async message => sent.push(message), close() {},
  } })
  session.canvas.toDataURL = () => 'data:image/jpeg;base64,' + 'A'.repeat(5000)
  await session.start()
  assert.equal(session.phase, 'error')
  assert.equal(sent.length, 0)
  session.dispose()
})
