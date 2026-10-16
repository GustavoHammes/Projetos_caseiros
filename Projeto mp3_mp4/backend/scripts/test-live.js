// Teste real pela API: baixa um vídeo público curto e examina os arquivos com ffprobe.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { setTimeout: delay } = require('node:timers/promises');
const { getConfig } = require('../lib/config');
const { run, executable } = require('../lib/downloader');
async function requestMedia(base, input, config) {
  const headers = { Authorization: `Bearer ${config.password}`, 'Content-Type': 'application/json' };
  const signal = AbortSignal.timeout(660000);
  if (process.env.TEST_DOWNLOAD_MODE === 'direct') return fetch(`${base}/api/download`, { method: 'POST', headers, body: JSON.stringify(input), signal });
  const created = await fetch(`${base}/api/jobs`, { method: 'POST', headers, body: JSON.stringify(input), signal });
  if (!created.ok) return created;
  const { id } = await created.json();
  assert.match(id, /^[a-f0-9-]{36}$/);
  try {
    while (true) {
      const response = await fetch(`${base}/api/jobs/${id}`, { headers, signal });
      if (!response.ok) return response;
      const state = await response.json();
      if (state.status === 'failed') {
        await fetch(`${base}/api/jobs/${id}`, { method: 'DELETE', headers, signal }).catch(() => {});
        return new Response(JSON.stringify({ error: state.error, code: state.code }), { status: state.httpStatus });
      }
      if (state.status === 'ready') return await fetch(`${base}/api/jobs/${id}/file`, { headers, signal });
      await delay(1000, undefined, { signal });
    }
  } catch (error) {
    await fetch(`${base}/api/jobs/${id}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(10000) }).catch(() => {});
    throw error;
  }
}
async function main() {
  const config = getConfig();
  const base = process.env.TEST_API_URL || `http://127.0.0.1:${config.port}`;
  const url = process.env.TEST_MEDIA_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const output = path.resolve(__dirname, '../../.artifacts');
  await fs.mkdir(output, { recursive: true });
  const results = [];
  for (const tipo of ['audio', 'video']) {
    const start = Date.now();
    const response = await requestMedia(base, { url, tipo, qualidade: '720', thumbnail: tipo === 'audio' }, config);
    if (!response.ok) { const error = await response.text(); results.push({ tipo, ok: false, status: response.status, error }); console.log(`${tipo}: HTTP ${response.status} ${error}`); continue; }
    const file = path.join(output, tipo === 'audio' ? 'teste-audio.mp3' : 'teste-video.mp4');
    const bytes = Buffer.from(await response.arrayBuffer()); await fs.writeFile(file, bytes);
    const { stdout } = await run(executable(config, 'ffprobe'), ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', file]);
    const probe = JSON.parse(stdout), audio = probe.streams.find(stream => stream.codec_type === 'audio'), video = probe.streams.find(stream => stream.codec_type === 'video' && !stream.disposition?.attached_pic);
    assert.ok(audio, 'Arquivo precisa conter áudio');
    assert.ok(Number(probe.format.duration) > 0, 'Duração positiva');
    if (tipo === 'audio') assert.equal(audio.codec_name, 'mp3');
    else { assert.ok(video, 'MP4 precisa conter vídeo e áudio'); assert.ok(video.height <= 720, 'Limite de qualidade'); assert.match(probe.format.format_name, /mp4/); }
    const result = { tipo, ok: true, bytes: bytes.length, duration: Number(probe.format.duration), audioCodec: audio.codec_name, videoCodec: video?.codec_name, height: video?.height, cover: probe.streams.some(stream => stream.disposition?.attached_pic === 1), seconds: Math.round((Date.now() - start) / 1000) };
    results.push(result); console.log(JSON.stringify(result));
  }
  await fs.writeFile(path.join(output, 'live-test.json'), JSON.stringify({ testedAt: new Date().toISOString(), base, url, mode: process.env.TEST_DOWNLOAD_MODE === 'direct' ? 'direct' : 'jobs', results }, null, 2));
  if (results.some(result => !result.ok)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
