const express = require('express');
const cors = require('cors');
const { timingSafeEqual } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DownloadError, downloadMedia } = require('./lib/downloader');
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
  const app = express(), buckets = new Map(), controllers = new Set();
  let active = 0, stopping = false;
  app.disable('x-powered-by');
  if (config.behindProxy) app.set('trust proxy', config.trustProxy);
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'" });
    next();
  });
  app.use(cors({ origin: config.origins.length ? config.origins : false, exposedHeaders: ['Content-Disposition', 'Content-Length'], allowedHeaders: ['Content-Type', 'Authorization'], methods: ['GET', 'POST', 'OPTIONS'] }));
  app.use(express.json({ limit: '8kb' }));
  const ready = Object.values(dependencies).length === 3 && Object.values(dependencies).every(item => item.available);
  app.get('/api/health', (req, res) => res.status(stopping ? 503 : 200).set('Cache-Control', 'no-store').json({
    status: stopping ? 'stopping' : ready ? 'ok' : 'degraded', ready: ready && !stopping,
    dependencies: Object.fromEntries(Object.entries(dependencies).map(([name, value]) => [name, value.available])),
    limits: { maxFileSizeMB: config.maxBytes / 1048576, maxDurationSeconds: config.maxDuration, timeoutSeconds: config.timeoutMs / 1000 },
  }));
  app.use('/api/download', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const now = Date.now(), key = req.ip;
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset <= now) {
      if (buckets.size >= 10000) buckets.delete(buckets.keys().next().value);
      bucket = { count: 0, reset: now + config.rateWindowMs }; buckets.set(key, bucket);
    }
    if (++bucket.count > config.rateLimit) return res.set('Retry-After', String(Math.ceil((bucket.reset - now) / 1000))).status(429).json({ error: 'Muitas tentativas. Aguarde alguns minutos.', code: 'RATE_LIMITED' });
    const bearer = req.get('authorization') || '';
    // Compatibilidade com o aplicativo antigo; a interface nova usa Authorization.
    const supplied = bearer.startsWith('Bearer ') ? bearer.slice(7) : (req.method === 'GET' ? req.query.password : '');
    const expected = Buffer.from(config.password), actual = Buffer.from(typeof supplied === 'string' ? supplied : '');
    if (!expected.length || actual.length !== expected.length || !timingSafeEqual(actual, expected)) return res.status(401).json({ error: 'Senha de acesso incorreta.', code: 'UNAUTHORIZED' });
    next();
  });
  async function handleDownload(req, res, next) {
    let directory, monitor, counted = false, diskLimit = false;
    const controller = new AbortController();
    const abort = () => { if (!res.writableFinished) controller.abort(); };
    res.once('close', abort);
    try {
      const input = validateInput(req.method === 'GET' ? req.query : req.body);
      if (stopping || !ready) throw new DownloadError('Servidor indisponível. Verifique as ferramentas de mídia.', 503, 'NOT_READY');
      if (active >= config.maxConcurrent) { res.set('Retry-After', '10'); throw new DownloadError('O servidor está ocupado. Tente novamente em alguns segundos.', 429, 'SERVER_BUSY'); }
      active++; counted = true; controllers.add(controller);
      await fs.mkdir(config.downloadRoot, { recursive: true });
      directory = await fs.mkdtemp(path.join(config.downloadRoot, 'job-'));
      // Cobre arquivos parciais e conversões além do limite estimado pelo yt-dlp.
      monitor = setInterval(async () => {
        try {
          const files = await fs.readdir(directory);
          const sizes = await Promise.all(files.map(file => fs.stat(path.join(directory, file)).then(stat => stat.size).catch(() => 0)));
          if (sizes.reduce((sum, size) => sum + size, 0) > config.maxBytes * 2.5) { diskLimit = true; controller.abort(); }
        } catch { /* diretório pode ter sido limpo */ }
      }, 1000);
      monitor.unref();
      const file = await download(input, { directory, config, signal: controller.signal });
      if (controller.signal.aborted) throw new DownloadError('Download cancelado.', 499, 'CANCELLED');
      await new Promise((resolve, reject) => res.download(file, path.basename(file), error => error ? reject(error) : resolve()));
    } catch (error) {
      if (diskLimit) error = new DownloadError('O arquivo excede o limite de tamanho.', 413, 'FILE_TOO_LARGE');
      if (!res.destroyed && !res.headersSent) next(error);
    } finally {
      clearInterval(monitor); res.off('close', abort); controllers.delete(controller);
      if (counted) active--;
      if (directory) await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => console.error('Falha ao limpar diretório temporário.'));
    }
  }
  app.post('/api/download', handleDownload); app.get('/api/download', handleDownload);
  app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.', code: 'NOT_FOUND' }));
  app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
  app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error instanceof DownloadError ? error.status : error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : 500;
    res.status(status).json({ error: error instanceof DownloadError ? error.message : status === 400 ? 'JSON inválido.' : status === 413 ? 'Requisição muito grande.' : 'Erro interno ao processar o download.', code: error instanceof DownloadError ? error.code : 'REQUEST_ERROR' });
  });
  app.locals.shutdown = () => { stopping = true; for (const controller of controllers) controller.abort(); };
  return app;
}
module.exports = { createApp, validateInput };
