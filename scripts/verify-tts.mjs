import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const require = createRequire(import.meta.url)
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright')
const baseUrl = process.argv[2] || 'http://127.0.0.1:5175'
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge',
  args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] })
try {
  const context = await browser.newContext({ permissions: ['camera', 'microphone'], viewport: { width: 1440, height: 1100 } })
  // Verify utterances and lifecycle deterministically without requiring a speaker.
  await context.addInitScript(() => {
    const test = { calls: [], cancels: 0, active: null }
    window.__speechTest = test
    window.SpeechSynthesisUtterance = class { constructor(text) { this.text = text } }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [{ lang: 'en-US', name: 'English' }, { lang: 'ko-KR', name: 'Korean' }],
      resume() {},
      cancel() { test.cancels++; test.active = null },
      speak(utterance) {
        test.calls.push({ text: utterance.text, lang: utterance.lang, voice: utterance.voice?.name })
        test.active = utterance
        queueMicrotask(() => utterance.onstart?.())
      },
    } })
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(baseUrl)
  assert.equal(await page.getByText('카메라·마이크 준비 완료', { exact: true }).count(), 0)
  await page.getByRole('link', { name: /수어로 말하기/ }).click()
  await page.waitForURL('**/Translate?mode=sign')
  await page.getByText(/테스트 모드: 예시 번역을 사용합니다/).waitFor({ timeout: 5000 }) // Run only with VITE_TRANSLATION_USE_MOCK=true.
  const record = async () => {
    await page.getByRole('button', { name: '수어 녹화', exact: true }).click()
    await page.getByRole('button', { name: '녹화 중지', exact: true }).click()
    await page.getByText('테스트용 번역 완료', { exact: true }).waitFor()
  }
  assert.equal(await page.getByRole('button', { name: '재생', exact: true }).count(), 0)
  await record()
  await page.getByText('번역문을 읽고 있습니다.', { exact: true }).waitFor()
  const calls = await page.evaluate(() => window.__speechTest.calls)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].lang, 'ko-KR')
  assert.equal(calls[0].voice, 'Korean')
  assert.match(calls[0].text, /병원 접수/)
  await page.getByRole('button', { name: '재생 중지', exact: true }).click()
  await page.getByRole('button', { name: '재생', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__speechTest.calls.length), 2)
  await page.evaluate(() => window.__speechTest.active.onend())
  await page.getByText('음성 재생이 완료되었습니다.', { exact: true }).waitFor()
  assert.equal(await page.evaluate(() => window.__speechTest.calls.length), 2, 'completion must not replay automatically')
  await page.getByRole('button', { name: '재생', exact: true }).click()
  await page.evaluate(() => window.__speechTest.active.onerror({ error: 'not-allowed' }))
  await page.getByText(/자동 음성 재생이 차단되었습니다/).waitFor()
  await page.getByRole('button', { name: '재생', exact: true }).click()
  const beforeSwitch = await page.evaluate(() => window.__speechTest.cancels)
  await page.getByRole('button', { name: '음성으로 말하기', exact: true }).click()
  await page.waitForURL('**mode=voice')
  assert.ok(await page.evaluate(() => window.__speechTest.cancels) > beforeSwitch)
  assert.equal(await page.getByRole('button', { name: '음성 녹음 (준비 중)' }).isDisabled(), true)
  await page.goBack()
  await record()
  await page.getByRole('button', { name: '수어 녹화', exact: true }).click()
  assert.equal(await page.evaluate(() => window.__speechTest.active), null)
  await page.getByRole('button', { name: '녹화 중지', exact: true }).click()
  await page.getByText('테스트용 번역 완료', { exact: true }).waitFor()
  await record()
  const screenshot = join(tmpdir(), 'sms-tts-verified.png')
  await page.screenshot({ path: screenshot, fullPage: true })
  assert.deepEqual(errors, [])
  await context.close()

  const unsupported = await browser.newContext({ permissions: ['camera'] })
  await unsupported.addInitScript(() => {
    delete window.SpeechSynthesisUtterance
  })
  const unsupportedPage = await unsupported.newPage()
  await unsupportedPage.goto(`${baseUrl}/Translate?mode=sign`)
  await unsupportedPage.getByRole('button', { name: '수어 녹화', exact: true }).click()
  await unsupportedPage.getByRole('button', { name: '녹화 중지', exact: true }).click()
  await unsupportedPage.getByText('테스트용 번역 완료', { exact: true }).waitFor()
  await unsupportedPage.getByText('이 브라우저는 음성 읽기를 지원하지 않습니다.', { exact: true }).waitFor()
  assert.equal(await unsupportedPage.getByRole('button', { name: '재생', exact: true }).isDisabled(), true)
  console.log(JSON.stringify({ result: 'passed', checks: ['home mode link', 'Korean mock utterance', 'stop and replay', 'completion', 'autoplay error', 'mode cleanup', 'recording cleanup', 'unsupported browser'], screenshot }))
  await unsupported.close()
} finally {
  await browser.close()
}
