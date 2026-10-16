const { createApp } = require('./app');
const { getConfig } = require('./lib/config');
const { checkDependencies } = require('./lib/downloader');
async function start() {
  const config = getConfig();
  if (!config.password.trim()) throw new Error('Defina PASSWORD em backend/.env antes de iniciar.');
  const dependencies = await checkDependencies(config);
  const app = createApp({ config, dependencies });
  const server = app.listen(config.port, config.host, () => {
    console.log(`Super Baixador: http://localhost:${config.port}`);
    if (Object.values(dependencies).some(item => !item.available)) console.warn('Ferramentas de midia ausentes. Execute npm run setup e reinicie.');
  });
  server.requestTimeout = config.timeoutMs + 30000;
  server.setTimeout(config.timeoutMs + 30000);
  let stopping = false;
  function shutdown() {
    if (stopping) return;
    stopping = true;
    const cleanup = app.locals.shutdown();
    Promise.all([cleanup, new Promise(resolve => server.close(resolve))]).then(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  }
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, shutdown);
  if (process.connected) {
    process.on('message', message => { if (message?.type === 'shutdown') shutdown(); });
    process.once('disconnect', shutdown);
  }
}
start().catch(error => { console.error(error.message); process.exitCode = 1; });
