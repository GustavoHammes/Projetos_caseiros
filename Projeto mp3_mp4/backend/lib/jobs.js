const { randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { DownloadError } = require('./downloader');

// Uma única instância mantém as tarefas em memória; os arquivos são temporários.
function createJobs({ config, download }) {
  const jobs = new Map();
  const retentionMs = config.jobRetentionMs ?? 300000;
  let active = 0, stopping = false;

  async function clean(job) {
    if (job.directory) await fs.rm(job.directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
      .catch(() => console.error('Falha ao limpar diretório temporário.'));
  }
  async function remove(job) {
    jobs.delete(job.id);
    job.controller.abort();
    await job.done;
    await clean(job);
  }
  function sweep() {
    for (const job of jobs.values()) {
      if (job.expiresAt && job.expiresAt <= Date.now() && job.status !== 'sending') void remove(job);
    }
  }
  const sweeper = setInterval(sweep, Math.min(retentionMs, 30000));
  sweeper.unref();

  async function execute(job, input) {
    let monitor, diskLimit = false;
    try {
      await fs.mkdir(config.downloadRoot, { recursive: true });
      job.directory = await fs.mkdtemp(path.join(config.downloadRoot, 'job-'));
      if (job.controller.signal.aborted) throw new DownloadError('Download cancelado.', 499, 'CANCELLED');
      monitor = setInterval(async () => {
        try {
          const files = await fs.readdir(job.directory);
          const sizes = await Promise.all(files.map(file => fs.stat(path.join(job.directory, file)).then(stat => stat.size).catch(() => 0)));
          if (sizes.reduce((sum, size) => sum + size, 0) > config.maxBytes * 2.5) { diskLimit = true; job.controller.abort(); }
        } catch { /* diretório já removido */ }
      }, 1000);
      monitor.unref();
      job.file = await download(input, { directory: job.directory, config, signal: job.controller.signal });
      if (job.controller.signal.aborted) throw new DownloadError('Download cancelado.', 499, 'CANCELLED');
      job.status = 'ready';
    } catch (error) {
      job.status = 'failed';
      job.error = diskLimit ? new DownloadError('O arquivo excede o limite de tamanho.', 413, 'FILE_TOO_LARGE')
        : error instanceof DownloadError ? error : new DownloadError('Erro interno ao processar o download.', 500, 'REQUEST_ERROR');
      await clean(job);
    } finally {
      clearInterval(monitor);
      active--;
      job.expiresAt = Date.now() + retentionMs;
    }
  }
  return {
    start(input) {
      sweep();
      if (stopping) throw new DownloadError('Servidor encerrando. Tente novamente.', 503, 'NOT_READY');
      // Inclui arquivos prontos aguardando retirada para limitar também o disco.
      if (active >= config.maxConcurrent || jobs.size >= config.maxConcurrent + 2) throw new DownloadError('O servidor está ocupado. Tente novamente em alguns segundos.', 429, 'SERVER_BUSY');
      const job = { id: randomUUID(), status: 'processing', controller: new AbortController() };
      active++;
      jobs.set(job.id, job);
      job.done = execute(job, input);
      return job;
    },
    get(id) {
      const job = jobs.get(id);
      if (!job || (job.expiresAt && job.expiresAt <= Date.now() && job.status !== 'sending')) {
        if (job) void remove(job);
        throw new DownloadError('Este download expirou ou o servidor reiniciou. Solicite novamente.', 404, 'JOB_NOT_FOUND');
      }
      return job;
    },
    remove,
    async close() {
      stopping = true;
      clearInterval(sweeper);
      await Promise.allSettled([...jobs.values()].map(remove));
    },
  };
}
module.exports = { createJobs };
