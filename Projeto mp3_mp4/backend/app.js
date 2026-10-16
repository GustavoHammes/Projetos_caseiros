const express = require('express');
const cors = require('cors');
const { timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const { DownloadError, downloadMedia } = require('./lib/downloader');
const { createJobs } = require('./lib/jobs');
const platforms = ['youtube.com', 'youtu.be', 'instagram.com', 'tiktok.com', 'vimeo.com', 'archive.org', 'commons.wikimedia.org'];
function validateInput(body) {
  if (!body || typeof body.url !== 'string' || body.url.length > 2048) throw new DownloadError('Informe um link válido.', 400, 'INVALID_URL');
  let url;
  try { url = new URL(body.url.trim()); } catch { throw new DownloadError('Cole o link completo, começando com https://.', 400, 'INVALID_URL'); }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !platforms.some(domain => host === domain || host.endsWith(`.${domain}`))) throw new DownloadError('Use um link HTTPS do YouTube, Instagram, TikTok, Vimeo, Internet Archive ou Wikimedia Commons.', 400, 'UNSUPPORTED_URL');
  if ((host === 'youtube.com' || host.endsWith('.youtube.com')) && url.pathname === '/playlist') throw new DownloadError('Cole o link de um vídeo individual.', 400, 'PLAYLIST_NOT_SUPPORTED');
  const tipo = body.tipo ?? 'audio', qualidade = String(body.qualidade ?? '1080');
  if (!['audio', 'video'].includes(tipo)) throw new DownloadError('Escolha áudio ou vídeo.', 400, 'INVALID_FORMAT');
  if (!['360', '480', '720', '1080'].includes(qualidade)) throw new DownloadError('Qualidade inválida.', 400, 'INVALID_QUALITY');
  if (body.thumbnail !== undefined && ![true, false, 'true', 'false'].includes(body.thumbnail)) throw new DownloadError('Opção de capa inválida.', 400, 'INVALID_THUMBNAIL');
  return { url: url.href, tipo, qualidade, thumbnail: body.thumbnail === true || body.thumbnail === 'true' };
}
function createApp({ config, dependencies = {}, download = downloadMedia }) {
  const app = express(), buckets = new Map();
  const jobs = createJobs({ config, download });
  let stopping = false;
  app.disable('x-powered-by');
  if (config.behindProxy) app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    next();
  });
  app.use(cors({ origin: config.origins.length ? config.origins : false, exposedHeaders: ['Content-Disposition', 'Content-Length'], allowedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'DELETE', 'OPTIONS'] }));
  app.use(express.json({ limit: '8kb' }));
  const ready = Object.values(dependencies).length === 3 && Object.values(dependencies).every(item => item.available);
  app.get('/api/health', (req, res) => res.status(stopping ? 503 : 200).set('Cache-Control', 'no-store').json({
    status: stopping ? 'stopping' : ready ? 'ok' : 'degraded', ready: ready && !stopping,
    dependencies: Object.fromEntries(Object.entries(dependencies).map(([name, value]) => [name, value.available])),
    limits: { maxFileSizeMB: config.maxBytes / 1048576, maxDurationSeconds: config.maxDuration, timeoutSeconds: config.timeoutMs / 1000 },
  }));
  app.use(['/api/download', '/api/jobs'], (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const bearer = req.get('authorization') || '';
    // Compatibilidade com o aplicativo antigo; a interface nova usa Authorization.
    const supplied = bearer.startsWith('Bearer ') ? bearer.slice(7) : (req.baseUrl === '/api/download' && req.method === 'GET' ? req.query.password : '');
    const expected = Buffer.from(config.password), actual = Buffer.from(typeof supplied === 'string' ? supplied : '');
    const authenticated = expected.length && actual.length === expected.length && timingSafeEqual(actual, expected);
    // Consultas autenticadas não gastam a franquia de novas solicitações.
    if (!authenticated || req.baseUrl === '/api/download' || req.method === 'POST') {
      const now = Date.now(), key = req.ip;
      let bucket = buckets.get(key);
      if (!bucket || bucket.reset <= now) {
        if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value);
        bucket = { count: 0, reset: now + config.rateWindowMs }; buckets.set(key, bucket);
      }
      if (++bucket.count > config.rateLimit) return res.set('Retry-After', String(Math.ceil((bucket.reset - now) / 1000))).status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.', code: 'RATE_LIMITED' });
    }
    if (!authenticated) return res.status(401).json({ error: 'Senha de acesso incorreta.', code: 'UNAUTHORIZED' });
    next();
  });
  function startJob(input, res) {
    if (stopping || !ready) throw new DownloadError('Servidor indisponível. Verifique as ferramentas de mídia.', 503, 'NOT_READY');
    try { return jobs.start(input); }
    catch (error) { if (error.status === 429) res.set('Retry-After', '10'); throw error; }
  }
  async function handleDownload(req, res, next) {
    let job;
    const abort = () => { if (job && !res.writableFinished) void jobs.remove(job); };
    res.once('close', abort);
    try {
      const input = validateInput(req.method === 'GET' ? req.query : req.body);
      job = startJob(input, res);
      await job.done;
      if (job.error) throw job.error;
      if (job.controller.signal.aborted) throw new DownloadError('Download cancelado.', 499, 'CANCELLED');
      job.status = 'sending';
      await new Promise((resolve, reject) => res.download(job.file, path.basename(job.file), error => error ? reject(error) : resolve()));
    } catch (error) {
      if (!res.destroyed && !res.headersSent) next(error);
    } finally {
      res.off('close', abort);
      if (job) await jobs.remove(job);
    }
  }
  app.post('/api/download', handleDownload); app.get('/api/download', handleDownload);
  app.post('/api/jobs', (req, res) => {
    const job = startJob(validateInput(req.body), res);
    res.once('close', () => { if (!res.writableFinished) void jobs.remove(job); });
    res.status(202).json({ id: job.id, status: job.status });
  });
  app.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    res.json({ id: job.id, status: job.status, expiresAt: job.expiresAt,
      ...(job.error ? { error: job.error.message, code: job.error.code, httpStatus: job.error.status } : {}) });
  });
  app.get('/api/jobs/:id/file', async (req, res, next) => {
    const job = jobs.get(req.params.id);
    if (job.status !== 'ready') throw new DownloadError('O arquivo ainda não está disponível.', 409, 'JOB_NOT_READY');
    job.status = 'sending';
    try {
      await new Promise((resolve, reject) => res.download(job.file, path.basename(job.file), error => error ? reject(error) : resolve()));
    } catch (error) { if (!res.destroyed && !res.headersSent) next(error); }
    finally { await jobs.remove(job); }
  });
  app.delete('/api/jobs/:id', async (req, res) => {
    const job = jobs.get(req.params.id);
    if (job.status === 'sending') throw new DownloadError('O arquivo já está sendo enviado.', 409, 'JOB_SENDING');
    await jobs.remove(job);
    res.status(204).end();
  });
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.', code: 'NOT_FOUND' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof DownloadError ? error.status : error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: error instanceof DownloadError ? error.message : status === 400 ? 'JSON inválido.' : status === 413 ? 'Requisição muito grande.' : 'Erro interno ao processar o download.', code: error instanceof DownloadError ? error.code : 'REQUEST_ERROR' });
  });
  app.locals.shutdown = () => { stopping = true; return jobs.close(); };
  return app;
}
module.exports = { createApp, validateInput };
