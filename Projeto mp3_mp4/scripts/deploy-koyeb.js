const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const profile = require('../deploy/koyeb-free.json');
const { getConfig } = require('../backend/lib/config');
const localCli = path.join(root, '.tools/koyeb/koyeb.exe');
const cli = fs.existsSync(localCli) ? localCli : 'koyeb';
const password = getConfig().password;
const scope = [];
if (process.env.KOYEB_ORGANIZATION) scope.push('--organization', process.env.KOYEB_ORGANIZATION);
if (process.env.KOYEB_WORKSPACE) scope.push('--workspace', process.env.KOYEB_WORKSPACE);

function run(args, input) {
  try {
    return execFileSync(cli, [...scope, ...args, '--output', 'json'], {
      cwd: root, encoding: 'utf8', windowsHide: true, shell: false, input, timeout: 90000,
      stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 8 * 1048576,
    });
  } catch (error) {
    let details = String(error.stderr || error.code || 'Comando recusado.');
    if (password) details = details.replaceAll(password, '[senha omitida]');
    throw new Error(`Koyeb ${args.slice(0, 2).join(' ')}: ${details.trim()}`);
  }
}
function list(args, field) {
  const result = JSON.parse(run(args));
  if (!Array.isArray(result[field])) throw new Error(`Resposta inesperada ao listar ${field}.`);
  return result[field];
}
function main() {
  if (profile.instanceType !== 'free' || !['was', 'fra'].includes(profile.region)) throw new Error('Este instalador aceita somente instância Free nas regiões gratuitas.');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  const args = ['services', 'create', profile.service, '--app', profile.app,
    '--type', 'web', '--instance-type', 'free', '--regions', profile.region,
    '--git', profile.repository, '--git-branch', profile.branch, '--git-sha', sha,
    '--git-workdir', profile.workdir, '--git-builder', 'docker', '--git-docker-dockerfile', profile.dockerfile,
    '--git-no-deploy-on-push', '--ports', '3000:http', '--routes', '/:3000',
    '--checks', '3000:http:/api/health', '--checks-grace-period', '3000=60',
    '--env', `PASSWORD={{secret.${profile.passwordSecret}}}`];
  for (const [key, value] of Object.entries(profile.env)) args.push('--env', `${key}=${value}`);
  console.log(JSON.stringify({ app: profile.app, service: profile.service, instanceType: 'free', region: profile.region, sha, env: { ...profile.env, PASSWORD: '(Koyeb Secret)' }, command: [cli, ...scope, ...args] }, null, 2));
  if (!process.argv.includes('--publish')) {
    console.log('Plano de publicação; nenhum recurso foi criado. --publish executa na organização e workspace informados.');
    return;
  }
  if (!process.env.KOYEB_ORGANIZATION || !process.env.KOYEB_WORKSPACE) throw new Error('Informe KOYEB_ORGANIZATION e KOYEB_WORKSPACE com o destino conferido no painel.');
  if (!password.trim()) throw new Error('Defina PASSWORD no backend/.env.');
  const changes = execFileSync('git', ['status', '--porcelain', '--', '.'], { cwd: root, encoding: 'utf8', windowsHide: true }).trim();
  if (changes) throw new Error('Faça commit e push das alterações do projeto antes da publicação por Git.');
  run(['whoami']);
  const apps = list(['apps', 'list'], 'apps');
  const app = apps.find(item => item.name === profile.app);
  if (app && list(['services', 'list', '--app', app.id], 'services').length) throw new Error('O aplicativo já contém serviços. Confira o destino antes de atualizar uma publicação existente.');
  const secrets = list(['secrets', 'list'], 'secrets');
  if (!secrets.some(item => item.name === profile.passwordSecret)) {
    // A senha não aparece em argumentos do processo, arquivos temporários ou logs.
    run(['secrets', 'create', profile.passwordSecret, '--value-from-stdin'], password);
  }
  if (!app) run(['apps', 'create', profile.app]);
  const created = JSON.parse(run(args));
  console.log(JSON.stringify({ created: true, serviceId: created.service?.id, app: profile.app }));
  console.log('Publicação iniciada. Aguarde Healthy e valide /api/health e os downloads reais.');
}
try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }
