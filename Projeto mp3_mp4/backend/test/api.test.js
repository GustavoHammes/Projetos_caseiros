const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { setTimeout: delay } = require('node:timers/promises');
const { createApp } = require('../app');
const { getConfig } = require('../lib/config');
const { DownloadError, buildArgs, run } = require('../lib/downloader');
const dependencies = { ytdlp: { available: true }, ffmpeg: { available: true }, ffprobe: { available: true } };
const payload = { url: 'https://www.youtube.com/watch?v=BaW_jenozKc', tipo: 'audio' };
async function fixture(t, { override = {}, download, deps = dependencies } = {}) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'baixador-test-'));
  const config = { ...getConfig(), password: 'test-&-senha', downloadRoot: directory, rateLimit: 100, ...override };
  const app = createApp({ config, dependencies: deps, download: download || (async (input, { directory: folder }) => {
    const file = path.join(folder, input.tipo === 'video' ? 'Teste de vídeo.mp4' : 'Teste de áudio.mp3');
    await fs.writeFile(file, Buffer.from('fixture-media-content')); return file;
  }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    app.locals.shutdown();
    await new Promise(resolve => server.close(resolve));
    await fs.rm(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body = payload, token = config.password) => fetch(`${base}/api/download`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
  return { base, post, directory, app };
}
test('site, assets e saúde respondem sem expor a senha', async t => {
  const f = await fixture(t);
  const response = await fetch(f.base);
  assert.equal(response.status, 200); assert.match(await response.text(), /Sua mídia/);
  assert.match(response.headers.get('Content-Security-Policy'), /script-src 'self'/);
  const health = await (await fetch(`${f.base}/api/health`)).json(); assert.equal(health.ready, true); assert.equal(JSON.stringify(health).includes('test-&-senha'), false);
  for (const asset of ['/styles.css', '/app.js', '/favicon.svg']) assert.equal((await fetch(f.base + asset)).status, 200);
});
test('autenticação obrigatória e senha com caracteres especiais', async t => {
  const f = await fixture(t);
  assert.equal((await f.post(payload, 'incorreta')).status, 401);
  assert.equal((await fetch(`${f.base}/api/download`)).status, 401);
  assert.equal((await f.post()).status, 200);
});
test('MP3 e MP4 retornam anexos com nomes e conteúdo corretos', async t => {
  const f = await fixture(t);
  for (const tipo of ['audio', 'video']) {
    const response = await f.post({ ...payload, tipo, qualidade: '720' });
    assert.equal(response.status, 200); assert.match(response.headers.get('Content-Disposition'), /attachment/);
    assert.match(response.headers.get('Content-Type'), tipo === 'audio' ? /audio\/mpeg/ : /video\/mp4/);
    assert.equal(await response.text(), 'fixture-media-content');
  }
});
test('rejeita URLs internas, protocolos, domínios falsos e parâmetros injetados', async t => {
  const f = await fixture(t);
  for (const url of ['file:///etc/passwd', 'http://localhost/a', 'https://127.0.0.1/a', 'https://169.254.169.254/', 'https://youtube.com.evil.test/a', 'https://user:pass@youtube.com/a', 'https://youtube.com:3000/a', 'https://www.youtube.com/playlist?list=test']) assert.equal((await f.post({ url })).status, 400, url);
  assert.equal((await f.post({ ...payload, qualidade: '1080; echo hacked' })).status, 400);
  assert.equal((await f.post({ ...payload, tipo: 'exe' })).status, 400);
  assert.equal((await f.post({ ...payload, thumbnail: 'anything' })).status, 400);
  assert.equal((await f.post({})).status, 400);
});
test('limite de tentativas inclui autenticações inválidas', async t => {
  const f = await fixture(t, { override: { rateLimit: 2 } });
  await f.post(payload, 'bad'); await f.post(payload, 'bad');
  const response = await f.post(); assert.equal(response.status, 429); assert.ok(response.headers.get('Retry-After'));
});
test('dependências ausentes deixam a API indisponível', async t => {
  const f = await fixture(t, { deps: {} });
  assert.equal((await (await fetch(`${f.base}/api/health`)).json()).ready, false);
  assert.equal((await f.post()).status, 503);
});
test('limpa temporários após sucesso e erro', async t => {
  for (const fail of [false, true]) {
    const f = await fixture(t, { download: async (input, { directory }) => {
      const file = path.join(directory, 'arquivo.mp3'); await fs.writeFile(file, 'fixture');
      if (fail) throw new DownloadError('Conteúdo indisponível.', 422, 'MEDIA_UNAVAILABLE'); return file;
    } });
    const response = await f.post(); await response.text();
    assert.equal(response.status, fail ? 422 : 200);
    for (let count = 0; count < 30 && (await fs.readdir(f.directory)).length; count++) await delay(20);
    assert.deepEqual(await fs.readdir(f.directory), []);
  }
});
test('limite de concorrência e cancelamento liberam a vaga', async t => {
  let release, started;
  const began = new Promise(resolve => { started = resolve; });
  const f = await fixture(t, { override: { maxConcurrent: 1 }, download: async (input, { signal }) => {
    started(); await new Promise(resolve => { release = resolve; signal.addEventListener('abort', resolve, { once: true }); });
    throw new DownloadError('Cancelado.', 499);
  } });
  const first = f.post(); await began;
  const response = await f.post(); assert.equal(response.status, 429); assert.ok(response.headers.get('Retry-After'));
  release(); await first;
});
test('CORS permite somente origem explicitamente configurada', async t => {
  const f = await fixture(t, { override: { origins: ['https://baixador-mp3.vercel.app'] } });
  const allowed = await fetch(`${f.base}/api/health`, { headers: { Origin: 'https://baixador-mp3.vercel.app' } });
  assert.equal(allowed.headers.get('Access-Control-Allow-Origin'), 'https://baixador-mp3.vercel.app');
  const blocked = await fetch(`${f.base}/api/health`, { headers: { Origin: 'https://evil.test' } }); assert.equal(blocked.headers.get('Access-Control-Allow-Origin'), null);
});
test('compatibilidade GET usa os mesmos controles', async t => {
  const f = await fixture(t);
  const query = new URLSearchParams({ ...payload, password: 'test-&-senha', thumbnail: 'false' });
  const response = await fetch(`${f.base}/api/download?${query}`); assert.equal(response.status, 200); await response.text();
});
test('capa é aplicada e o link é um argumento isolado, sem shell', () => {
  const args = buildArgs({ ...payload, thumbnail: true, qualidade: '720' }, path.resolve('test'), getConfig());
  assert.ok(args.includes('--embed-thumbnail')); assert.ok(args.includes('--embed-metadata')); assert.equal(args.at(-2), '--'); assert.equal(args.at(-1), payload.url);
});
test('timeout encerra processos e retorna erro identificável', async () => {
  await assert.rejects(run(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { timeoutMs: 150 }), error => error.code === 'TIMEOUT');
});
