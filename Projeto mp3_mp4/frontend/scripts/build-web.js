const fs = require('node:fs/promises');
const path = require('node:path');
async function build() {
  const value = process.env.BACKEND_ORIGIN;
  if (!value) throw new Error('Defina BACKEND_ORIGIN com a URL HTTPS da API antes de publicar na Vercel.');
  const origin = new URL(value);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('BACKEND_ORIGIN deve ser somente a origem HTTPS, sem /api/download.');
  const destination = path.resolve(__dirname, '../dist');
  await fs.mkdir(destination, { recursive: true });
  await fs.cp(path.resolve(__dirname, '../../backend/public'), destination, { recursive: true });
  await fs.writeFile(path.join(destination, 'config.js'), `'use strict';\nwindow.SUPER_BAIXADOR_API = ${JSON.stringify(origin.origin)};\n`);
  console.log('Site web preparado em frontend/dist. API: ' + origin.origin);
}
build().catch(error => { console.error(error.message); process.exitCode = 1; });
