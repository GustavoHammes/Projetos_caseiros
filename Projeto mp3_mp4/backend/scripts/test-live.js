// Teste real pela API: baixa um vídeo público curto e examina os arquivos com ffprobe.
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { getConfig } = require('../lib/config');
const { run, executable } = require('../lib/downloader');
async function main() {
  const config = getConfig();
  const base = process.env.TEST_API_URL || `http://127.0.0.1:${config.port}`;
  const url = process.env.TEST_MEDIA_URL || 'https://www.youtube.com/watch?v=jNQXAC9IVRw';
  const output = path.resolve(__dirname, '../../.artifacts');
  await fs.mkdir(output, { recursive: true });
  const results = [];
  for (const tipo of ['audio', 'video']) {
    const start = Date.now();
    const response = await fetch(`${base}/api/download`, { method: 'POST', headers: { Authorization: `Bearer ${config.password}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ url, tipo, qualidade: '720', thumbnail: tipo === 'audio' }), signal: AbortSignal.timeout(config.timeoutMs + 30000) });
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
  await fs.writeFile(path.join(output, 'live-test.json'), JSON.stringify({ testedAt: new Date().toISOString(), base, url, results }, null, 2));
  if (results.some(result => !result.ok)) process.exitCode = 1;
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
