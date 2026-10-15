const fs = require('node:fs/promises');
const { createReadStream, createWriteStream } = require('node:fs');
const { createHash } = require('node:crypto');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const tools = path.join(root, '.tools');
async function hash(file) {
  const sha = createHash('sha256');
  for await (const chunk of createReadStream(file)) sha.update(chunk);
  return sha.digest('hex');
}
async function install(repo, matcher, destination) {
  const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub: HTTP ${response.status}`);
  const release = await response.json();
  const asset = release.assets.find(item => matcher.test(item.name));
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw new Error('Release sem SHA256 verificável.');
  const expected = asset.digest.slice(7);
  if (await hash(destination).catch(() => '') === expected) return;
  console.log(`Baixando ${asset.name} (${Math.round(asset.size / 1048576)} MB)...`);
  const download = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(180000) });
  if (!download.ok) throw new Error(`Download: HTTP ${download.status}`);
  await pipeline(Readable.fromWeb(download.body), createWriteStream(destination));
  if (await hash(destination) !== expected) throw new Error('Checksum SHA256 inválido.');
}
async function main() {
  if (process.platform !== 'win32') throw new Error('Este instalador é para Windows. Em Linux, use o Dockerfile.');
  await fs.mkdir(tools, { recursive: true });
  await install('yt-dlp/yt-dlp', /^yt-dlp\.exe$/, path.join(tools, 'yt-dlp.exe'));
  const target = path.join(tools, 'ffmpeg');
  if (!await fs.stat(path.join(target, 'bin/ffmpeg.exe')).catch(() => null)) {
    const zip = path.join(tools, 'ffmpeg.zip');
    await install('GyanD/codexffmpeg', /essentials_build\.zip$/, zip);
    const extracted = await fs.mkdtemp(path.join(tools, 'ffmpeg-extract-'));
    execFileSync('powershell.exe', ['-NoProfile', '-Command', 'Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::ExtractToDirectory($env:BAIXADOR_SETUP_ZIP, $env:BAIXADOR_SETUP_EXTRACT)'], { windowsHide: true, stdio: 'inherit', env: { ...process.env, BAIXADOR_SETUP_ZIP: zip, BAIXADOR_SETUP_EXTRACT: extracted } });
    const folders = await fs.readdir(extracted, { withFileTypes: true });
    const folder = folders.find(item => item.isDirectory());
    if (!folder) throw new Error('Pacote FFmpeg inválido.');
    const source = path.resolve(extracted, folder.name);
    if (!source.startsWith(extracted + path.sep) || !target.startsWith(tools + path.sep)) throw new Error('Caminho inválido.');
    await fs.access(path.join(source, 'bin/ffmpeg.exe'));
    await fs.rename(source, target);
    await fs.unlink(zip);
  }
  // npm.cmd usa o shell padrão do Windows; sem argumentos derivados de entrada externa.
  execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', 'npm ci'], { cwd: path.join(root, 'backend'), stdio: 'inherit', windowsHide: true });
  execFileSync(process.execPath, ['scripts/doctor.js'], { cwd: path.join(root, 'backend'), stdio: 'inherit', windowsHide: true });
  console.log('Pronto. Execute npm start na raiz.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
