const path = require('node:path');
const fs = require('node:fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });
const tools = path.resolve(__dirname, '../../.tools');
const localYtdlp = path.join(tools, 'yt-dlp.exe');
const localFfmpeg = path.join(tools, 'ffmpeg/bin');
function integer(value, fallback, max) {
  const number = Number(value ?? fallback);
  if (!Number.isSafeInteger(number) || number < 1 || number > max) throw new Error('Limite de configuracao invalido.');
  return number;
}
function getConfig() {
  return {
    password: process.env.PASSWORD || '', port: integer(process.env.PORT, 3000, 65535), host: process.env.HOST || '127.0.0.1',
    origins: (process.env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean),
    trustProxy: integer(process.env.TRUST_PROXY_HOPS, 1, 5), behindProxy: process.env.TRUST_PROXY_HOPS !== undefined,
    ytdlp: process.env.YTDLP_PATH || (fs.existsSync(localYtdlp) ? localYtdlp : 'yt-dlp'),
    ffmpeg: process.env.FFMPEG_LOCATION || (fs.existsSync(localFfmpeg) ? localFfmpeg : ''), cookies: process.env.YTDLP_COOKIES_FILE || '',
    downloadRoot: path.resolve(__dirname, '../downloads'), timeoutMs: integer(process.env.DOWNLOAD_TIMEOUT_SECONDS, 180, 600) * 1000,
    jobRetentionMs: integer(process.env.JOB_RETENTION_SECONDS, 300, 1800) * 1000,
    maxBytes: integer(process.env.MAX_FILE_SIZE_MB, 100, 500) * 1024 * 1024, maxDuration: integer(process.env.MAX_DURATION_SECONDS, 1200, 7200),
    maxConcurrent: integer(process.env.MAX_CONCURRENT_DOWNLOADS, 2, 5), rateLimit: integer(process.env.RATE_LIMIT_REQUESTS, 30, 1000), rateWindowMs: 900000,
  };
}
module.exports = { getConfig };
