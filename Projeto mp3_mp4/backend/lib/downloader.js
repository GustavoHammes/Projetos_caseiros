const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs/promises');
class DownloadError extends Error {
  constructor(message, status = 502, code = 'DOWNLOAD_FAILED') { super(message); this.status = status; this.code = code; }
}
function executable(config, name) {
  return config.ffmpeg ? path.join(config.ffmpeg, name + (process.platform === 'win32' ? '.exe' : '')) : name;
}
function run(command, args, { signal, timeoutMs = 15000, maxOutput = 1048576 } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DownloadError('Download cancelado.', 499, 'CANCELLED'));
    const child = spawn(command, args, { shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '', stderr = '', timedOut = false, oversized = false, killed = false;
    const terminate = () => {
      if (killed || !child.pid) return;
      killed = true;
      // Encerra também o FFmpeg iniciado pelo yt-dlp.
      if (process.platform === 'win32') {
        const killer = spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        killer.once('error', () => child.kill());
      } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
    };
    const timer = setTimeout(() => { timedOut = true; terminate(); }, timeoutMs);
    signal?.addEventListener('abort', terminate, { once: true });
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > maxOutput) { oversized = true; terminate(); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-maxOutput); });
    child.once('error', error => { clearTimeout(timer); signal?.removeEventListener('abort', terminate); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', terminate);
      if (signal?.aborted) return reject(new DownloadError('Download cancelado.', 499, 'CANCELLED'));
      if (timedOut) return reject(new DownloadError('O download demorou demais. Tente um vídeo mais curto.', 504, 'TIMEOUT'));
      if (oversized) return reject(new DownloadError('Resposta da ferramenta excedeu o limite.'));
      if (code !== 0) return reject(Object.assign(new Error('Falha no processo de mídia.'), { stderr, exitCode: code }));
      resolve({ stdout, stderr });
    });
  });
}
async function checkDependencies(config) {
  const results = await Promise.allSettled([run(config.ytdlp, ['--version']), run(executable(config, 'ffmpeg'), ['-version']), run(executable(config, 'ffprobe'), ['-version'])]);
  return Object.fromEntries(['ytdlp', 'ffmpeg', 'ffprobe'].map((key, index) => [key, {
    available: results[index].status === 'fulfilled',
    version: results[index].status === 'fulfilled' ? results[index].value.stdout.split(/\r?\n/)[0].slice(0, 140) : null,
  }]));
}
function buildArgs(input, directory, config) {
  const args = ['--ignore-config', '--no-playlist', '--playlist-items', '1', '--no-progress', '--no-warnings', '--no-cache-dir',
    '--use-extractors', 'default,-generic', '--socket-timeout', '20', '--retries', '2', '--fragment-retries', '2',
    '--max-filesize', String(config.maxBytes), '--match-filters', `!is_live & duration <= ${config.maxDuration}`,
    '--js-runtimes', `node:${process.execPath}`, '--windows-filenames', '--trim-filenames', '160',
    '--paths', directory, '-o', '%(title).120B [%(id)s].%(ext)s', '--print', 'after_move:filepath', '--no-simulate'];
  if (config.ffmpeg) args.push('--ffmpeg-location', config.ffmpeg);
  if (config.cookies && ['instagram.com', 'www.instagram.com'].includes(new URL(input.url).hostname)) args.push('--cookies', config.cookies);
  if (input.tipo === 'video') args.push('-f', `bv[ext=mp4][vcodec^=avc1][height<=${input.qualidade}]+ba[ext=m4a]/b[ext=mp4][height<=${input.qualidade}]/bv[ext=mp4][height<=${input.qualidade}]+ba[ext=m4a]`, '--merge-output-format', 'mp4');
  else {
    args.push('-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', '0', '--embed-metadata');
    if (input.thumbnail) args.push('--embed-thumbnail', '--convert-thumbnails', 'jpg');
  }
  args.push('--', input.url);
  return args;
}
function publicError(error) {
  if (error instanceof DownloadError) return error;
  if (error.code === 'ENOENT') return new DownloadError('Ferramentas de mídia indisponíveis no servidor.', 503, 'DEPENDENCIES_MISSING');
  const details = error.stderr || '';
  if (/sign in|confirm you.re not a bot|login required|cookies|private video|authentication|age.restricted/i.test(details)) return new DownloadError('A plataforma exige autenticação ou bloqueou este servidor. Tente outro vídeo público.', 422, 'PLATFORM_AUTH_REQUIRED');
  if (/requested format.*not available/i.test(details)) return new DownloadError('Esta qualidade não está disponível. Tente uma resolução menor.', 422, 'FORMAT_UNAVAILABLE');
  if (/not available|unavailable|removed|does not exist|404|unsupported url/i.test(details)) return new DownloadError('Conteúdo indisponível, removido ou link incompatível.', 422, 'MEDIA_UNAVAILABLE');
  return new DownloadError('Não foi possível baixar este link. Verifique se o conteúdo é público e tente novamente.');
}
async function downloadMedia(input, { directory, config, signal }) {
  try {
    const { stdout } = await run(config.ytdlp, buildArgs(input, directory, config), { signal, timeoutMs: config.timeoutMs });
    const result = stdout.trim().split(/\r?\n/).at(-1);
    if (!result) throw new DownloadError('O vídeo excede os limites de tamanho ou duração, ou é uma transmissão ao vivo.', 422, 'MEDIA_LIMIT');
    const file = path.resolve(result);
    if (path.dirname(file) !== path.resolve(directory)) throw new DownloadError('Caminho de saída inválido.');
    const stat = await fs.stat(file);
    if (!stat.isFile() || !stat.size) throw new DownloadError('O arquivo gerado está vazio.');
    if (stat.size > config.maxBytes) throw new DownloadError('O arquivo excede o limite de tamanho.', 413, 'FILE_TOO_LARGE');
    if (path.extname(file).toLowerCase() !== (input.tipo === 'audio' ? '.mp3' : '.mp4')) throw new DownloadError('O formato solicitado não pôde ser gerado.');
    return file;
  } catch (error) { if (signal?.aborted) throw error; throw publicError(error); }
}
module.exports = { DownloadError, run, executable, checkDependencies, buildArgs, downloadMedia, publicError };
