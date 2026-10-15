const { getConfig } = require('../lib/config');
const { checkDependencies } = require('../lib/downloader');
checkDependencies(getConfig()).then(dependencies => {
  for (const [name, value] of Object.entries(dependencies)) console.log(`${value.available ? 'OK' : 'AUSENTE'} ${name}: ${value.version || 'execute npm run setup na raiz'}`);
  if (Object.values(dependencies).some(item => !item.available)) process.exitCode = 1;
}).catch(error => { console.error(error.message); process.exitCode = 1; });
