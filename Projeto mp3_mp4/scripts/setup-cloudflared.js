const fs = require('node:fs/promises');
const { createHash } = require('node:crypto');
const path = require('node:path');

async function main() {
  if (process.platform !== 'win32') throw new Error('Este instalador é para Windows.');
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
  const response = await fetch('https://api.github.com/repos/cloudflare/cloudflared/releases/latest', { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub: HTTP ${response.status}`);
  const release = await response.json();
  const asset = release.assets.find(item => item.name === `cloudflared-windows-${arch}.exe`);
  if (!asset || !/^sha256:[a-f0-9]{64}$/.test(asset.digest)) throw new Error('Release sem SHA256 verificável.');
  const tools = path.resolve(__dirname, '../.tools');
  await fs.mkdir(tools, { recursive: true });
  const file = path.join(tools, 'cloudflared.exe');
  const digest = bytes => createHash('sha256').update(bytes).digest('hex');
  const installed = await fs.readFile(file).catch(() => null);
  if (installed && digest(installed) === asset.digest.slice(7)) { console.log(`cloudflared ${release.tag_name}: já instalado.`); return; }
  const download = await fetch(asset.browser_download_url, { signal: AbortSignal.timeout(180000) });
  if (!download.ok) throw new Error(`Download: HTTP ${download.status}`);
  const bytes = Buffer.from(await download.arrayBuffer());
  if (digest(bytes) !== asset.digest.slice(7)) throw new Error('SHA256 inválido.');
  await fs.writeFile(file, bytes);
  console.log(`cloudflared ${release.tag_name}: instalado e SHA256 verificado.`);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
