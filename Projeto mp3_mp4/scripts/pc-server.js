const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const { spawn, execFile } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { getConfig } = require('../backend/lib/config');
const root = path.resolve(__dirname, '..');
const runtime = path.join(root, '.artifacts/pc-server');
const keyFile = path.join(runtime, 'control.key');
const stateFile = path.join(runtime, 'status.json');
const pipe = '\\\\.\\pipe\\superbaixador-' + createHash('sha256').update(root.toLowerCase()).digest('hex').slice(0, 20);
const cloudflared = path.join(root, '.tools/cloudflared.exe');
const website = 'https://baixador-mp3.vercel.app';

function log(label, value) {
  const file = path.join(runtime, 'server.log');
  if (fs.existsSync(file) && fs.statSync(file).size > 5 * 1048576) fs.renameSync(file, path.join(runtime, 'server.previous.log'));
  fs.appendFileSync(file, `${new Date().toISOString()} [${label}] ${String(value).trim()}\n`);
}
function request(command) {
  return new Promise((resolve, reject) => {
    let key;
    try { key = fs.readFileSync(keyFile, 'utf8'); } catch { reject(new Error('Servidor não iniciado.')); return; }
    const socket = net.createConnection(pipe), chunks = [];
    socket.setTimeout(5000, () => socket.destroy(new Error('Servidor não respondeu.')));
    socket.once('connect', () => socket.write(JSON.stringify({ command, key }) + '\n'));
    socket.on('data', chunk => chunks.push(chunk));
    socket.once('error', reject);
    socket.once('end', () => { try { const result = JSON.parse(Buffer.concat(chunks)); if (result.error) reject(new Error(result.error)); else resolve(result); } catch (error) { reject(error); } });
  });
}
function startupFile() {
  if (!process.env.APPDATA) throw new Error('APPDATA indisponível.');
  return path.join(process.env.APPDATA, 'Microsoft/Windows/Start Menu/Programs/Startup/SuperBaixadorPC.vbs');
}
function show(state) {
  console.log(`API no PC: ${state.localReady ? 'disponível' : 'iniciando ou offline'}`);
  console.log(`Túnel HTTPS: ${state.tunnelConnected ? 'conectado' : 'aguardando conexão'}`);
  if (state.publicUrl) console.log(`Endereço direto: ${state.publicUrl}`);
  if (state.connectUrl) console.log(`Site com o endereço atual: ${state.connectUrl}`);
  console.log(`Logs: ${path.join(runtime, 'server.log')}`);
}
async function openSite(state) {
  if (!state.publicUrl) throw new Error('O túnel ainda não gerou um endereço. Aguarde e tente novamente.');
  const url = new URL(state.publicUrl);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.trycloudflare.com')) throw new Error('Endereço do túnel inválido.');
  await new Promise((resolve, reject) => execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', 'Start-Process -FilePath $env:BAIXADOR_OPEN_URL'], {
    windowsHide: true, env: { ...process.env, BAIXADOR_OPEN_URL: state.connectUrl },
  }, error => error ? reject(error) : resolve()));
}
async function daemon() {
  const config = getConfig();
  if (!config.password.trim()) throw new Error('Defina PASSWORD em backend/.env.');
  if (!fs.existsSync(cloudflared)) throw new Error('Execute npm run setup:pc para instalar as ferramentas.');
  const key = randomBytes(32).toString('hex');
  const state = { pid: process.pid, apiPid: null, tunnelPid: null, localReady: false, tunnelConnected: false, publicUrl: null, connectUrl: null, startedAt: new Date().toISOString() };
  const children = new Map(), timers = new Set();
  let stopping = false, checking = false, watchdog;
  const persist = () => fs.writeFileSync(stateFile, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2));
  const later = fn => { const timer = setTimeout(() => { timers.delete(timer); if (!stopping) fn(); }, 5000); timers.add(timer); };
  async function terminate(child, graceful = false) {
    if (!child || child.exitCode !== null || child.signalCode !== null) return;
    if (graceful && child.connected) {
      child.send({ type: 'shutdown' }, () => {});
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), delay(12000)]);
      if (child.exitCode !== null || child.signalCode !== null) return;
    }
    await new Promise(resolve => execFile('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => resolve()));
  }
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    for (const timer of timers) clearTimeout(timer);
    clearInterval(watchdog);
    await Promise.all([terminate(children.get('tunnel')), terminate(children.get('api'), true)]);
    state.localReady = false; state.tunnelConnected = false; state.stoppedAt = new Date().toISOString(); persist();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1000).unref();
  }
  const server = net.createServer(socket => {
    let input = '';
    socket.setTimeout(5000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', chunk => {
      input += chunk;
      if (input.length > 1024) return socket.destroy();
      if (!input.includes('\n')) return;
      try {
        const message = JSON.parse(input.trim()), actual = Buffer.from(message.key || ''), expected = Buffer.from(key);
        if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Acesso de controle recusado.');
        if (!['status', 'stop', 'restart-api'].includes(message.command)) throw new Error('Comando inválido.');
        socket.end(JSON.stringify(state));
        if (message.command === 'stop') setImmediate(shutdown);
        if (message.command === 'restart-api') setImmediate(() => {
          state.localReady = false; persist();
          void terminate(children.get('api'), true).catch(error => log('api', error.message));
        });
      } catch (error) { socket.end(JSON.stringify({ error: error.message })); }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(pipe, resolve); });
  fs.writeFileSync(keyFile, key, { mode: 0o600 });
  persist();
  // As flags pertencem somente a este processo; o .env local continua privado.
  const apiEnv = { ...process.env, HOST: '127.0.0.1', PORT: String(config.port), TRUST_PROXY_HOPS: '1',
    ALLOWED_ORIGINS: [...new Set([...config.origins, website])].join(','), MAX_CONCURRENT_DOWNLOADS: '1', MAX_FILE_SIZE_MB: '100', DOWNLOAD_TIMEOUT_SECONDS: '600' };
  const tunnelEnv = Object.fromEntries(['PATH', 'SystemRoot', 'WINDIR', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP', 'HTTP_PROXY', 'HTTPS_PROXY', 'NO_PROXY'].filter(name => process.env[name]).map(name => [name, process.env[name]]));
  function startChild(name) {
    if (stopping || children.has(name)) return;
    const isApi = name === 'api';
    const child = spawn(isApi ? process.execPath : cloudflared, isApi ? [path.join(root, 'backend/server.js')] : ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${config.port}`, '--metrics', '127.0.0.1:0'], {
      cwd: root, env: isApi ? apiEnv : tunnelEnv, windowsHide: true, shell: false, stdio: isApi ? ['ignore', 'pipe', 'pipe', 'ipc'] : ['ignore', 'pipe', 'pipe'],
    });
    children.set(name, child);
    state[isApi ? 'apiPid' : 'tunnelPid'] = child.pid || null; persist();
    let buffer = '';
    const connections = new Set();
    const output = chunk => {
      const text = chunk.toString(); log(name, text);
      if (isApi) return;
      buffer += text;
      const lines = buffer.split(/\r?\n/); buffer = lines.pop().slice(-8192);
      for (const line of lines) {
        const match = [...line.matchAll(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/g)].find(item => new URL(item[0]).hostname !== 'api.trycloudflare.com');
        if (match && state.publicUrl !== match[0]) {
          state.publicUrl = match[0];
          state.connectUrl = `${website}/#servidor=${encodeURIComponent(match[0])}`;
        }
        const index = /connIndex=(\d+)/.exec(line)?.[1];
        if (/Registered tunnel connection/.test(line)) connections.add(index ?? '0');
        if (/Unregistered tunnel connection|Serve tunnel error/.test(line)) connections.delete(index ?? '0');
      }
      state.tunnelConnected = connections.size > 0; persist();
    };
    child.stdout.on('data', output); child.stderr.on('data', output);
    child.on('error', error => log(name, `Falha ao iniciar: ${error.code || error.message}`));
    child.once('close', code => {
      children.delete(name);
      if (isApi) { state.localReady = false; state.apiPid = null; }
      else { state.tunnelPid = null; state.tunnelConnected = false; state.publicUrl = null; state.connectUrl = null; buffer = ''; }
      persist();
      if (!stopping) { log(name, `Processo terminou (${code}). Nova tentativa em 5 segundos.`); later(() => startChild(name)); }
    });
  }
  async function check() {
    if (checking || stopping) return;
    checking = true;
    try {
      const response = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(3000) });
      const health = await response.json(); state.localReady = response.ok && health.ready === true;
      if (state.localReady) startChild('tunnel');
    } catch { state.localReady = false; }
    finally { checking = false; if (!stopping) persist(); }
  }
  // Evita assumir controle de um servidor que já ocupava a porta.
  const occupied = await new Promise(resolve => {
    const probe = net.createServer(); probe.once('error', () => resolve(true)); probe.listen(config.port, '127.0.0.1', () => probe.close(() => resolve(false)));
  });
  if (occupied) { server.close(); throw new Error(`A porta ${config.port} já está ocupada. Pare o servidor local anterior antes de iniciar.`); }
  startChild('api');
  watchdog = setInterval(check, 3000);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
  await check();
}
async function main() {
  if (process.platform !== 'win32') throw new Error('Os comandos do servidor pessoal são para Windows.');
  fs.mkdirSync(runtime, { recursive: true });
  const command = process.argv[2] || 'status';
  if (!['run', 'start', 'stop', 'restart', 'status', 'open', 'install-startup', 'uninstall-startup'].includes(command)) throw new Error('Comando inválido para o servidor pessoal.');
  if (command === 'run') { await daemon(); return; }
  if (command === 'install-startup') {
    const file = startupFile();
    if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(__filename)) throw new Error('Já existe outro script com esse nome na inicialização do Windows.');
    const target = `"${process.execPath}" "${__filename}" start`;
    fs.writeFileSync(file, `Set shell = CreateObject("WScript.Shell")\nshell.Run "${target.replaceAll('"', '""')}", 0, False\n`);
    console.log('Início automático instalado para o login deste usuário no Windows.'); return;
  }
  if (command === 'uninstall-startup') {
    const file = startupFile();
    if (fs.existsSync(file) && !fs.readFileSync(file, 'utf8').includes(__filename)) throw new Error('O script de inicialização não pertence a este projeto.');
    fs.rmSync(file, { force: true }); console.log('Início automático removido.'); return;
  }
  if (command === 'stop') {
    await request('stop');
    for (let count = 0; count < 40; count++) {
      await delay(500);
      if (!await request('status').catch(() => null)) { console.log('Servidor e túnel encerrados.'); return; }
    }
    throw new Error('O encerramento ainda está em andamento. Confira os logs.');
  }
  if (command === 'restart') {
    const before = await request('restart-api');
    for (let count = 0; count < 40; count++) {
      await delay(500);
      const after = await request('status');
      if (after.localReady && after.apiPid && after.apiPid !== before.apiPid) { show(after); console.log('API reiniciada.'); return; }
    }
    throw new Error('A API ainda está reiniciando. Confira os logs.');
  }
  let state = await request('status').catch(() => null), launched;
  if (command === 'start' && !state) {
    const output = fs.openSync(path.join(runtime, 'supervisor.log'), 'a');
    launched = spawn(process.execPath, [__filename, 'run'], { cwd: root, windowsHide: true, detached: true, stdio: ['ignore', output, output] });
    launched.unref(); fs.closeSync(output);
  }
  if (command === 'start') {
    for (let count = 0; count < 45 && (!state?.localReady || !state?.publicUrl || !state?.tunnelConnected); count++) {
      await delay(1000); state = await request('status').catch(() => null);
      if (state?.localReady && state?.publicUrl && state?.tunnelConnected) break;
      if (launched && launched.exitCode !== null) throw new Error('Falha ao iniciar o supervisor. Consulte .artifacts/pc-server/supervisor.log.');
    }
  }
  if (!state) throw new Error('Servidor não iniciado. Execute npm run pc:start; consulte .artifacts/pc-server/supervisor.log se falhar.');
  show(state);
  if (command === 'start' && (!state.localReady || !state.publicUrl || !state.tunnelConnected)) throw new Error('O servidor ainda não ficou disponível. Consulte os logs ou execute pc:status novamente.');
  if (command === 'open' || process.argv.includes('--open')) await openSite(state);
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
