'use strict';
const $ = selector => document.querySelector(selector);
const form = $('#download-form');
const fields = $('#download-fields');
const urlInput = $('#media-url');
const password = $('#password');
const feedback = $('#feedback');
const historyKey = 'superbaixador.history.v1';
const apiBase = window.SUPER_BAIXADOR_API || '';
let controller;
let requestTimeout = 180000;
let maxBytes = 104857600;
let history = [];
try {
  const stored = JSON.parse(localStorage.getItem(historyKey) || '[]');
  if (Array.isArray(stored)) history = stored.filter(item => item && typeof item.name === 'string' && typeof item.date === 'string' && ['audio', 'video'].includes(item.tipo)).slice(0, 5);
} catch { /* armazenamento pode estar desativado */ }
const emptyHistory = $('#recent-list').firstElementChild.cloneNode(true);

function showFeedback(state, title, description = '') {
  feedback.hidden = false;
  feedback.dataset.state = state;
  $('#feedback-title').textContent = title;
  $('#feedback-description').textContent = description;
  $('#cancel-button').hidden = state !== 'loading';
}
function updateFormat() {
  const video = form.elements.tipo.value === 'video';
  $('#audio-options').hidden = video;
  $('#video-options').hidden = !video;
  $('#download-button span').textContent = `Baixar ${video ? 'vídeo' : 'áudio'}`;
}
form.querySelectorAll('[name="tipo"]').forEach(input => input.addEventListener('change', updateFormat));
urlInput.addEventListener('input', () => {
  urlInput.setCustomValidity('');
  let name = '';
  try {
    const host = new URL(urlInput.value.trim()).hostname;
    const platforms = { 'youtube.com': 'YouTube', 'youtu.be': 'YouTube', 'instagram.com': 'Instagram', 'tiktok.com': 'TikTok', 'vimeo.com': 'Vimeo', 'archive.org': 'Internet Archive', 'commons.wikimedia.org': 'Wikimedia' };
    name = Object.entries(platforms).find(([domain]) => host === domain || host.endsWith(`.${domain}`))?.[1] || '';
  } catch { /* enquanto o usuário digita */ }
  $('#platform-label').textContent = name;
});
$('#paste-button').addEventListener('click', async () => {
  try {
    urlInput.value = (await navigator.clipboard.readText()).trim();
    urlInput.dispatchEvent(new Event('input'));
    urlInput.focus();
  } catch { showFeedback('info', 'Cole seu link no campo acima.', 'Use Ctrl + V, ⌘ + V ou toque e segure no celular.'); urlInput.focus(); }
});
$('#toggle-password').addEventListener('click', event => {
  const visible = password.type === 'password';
  password.type = visible ? 'text' : 'password';
  event.currentTarget.textContent = visible ? 'Ocultar' : 'Mostrar';
  event.currentTarget.setAttribute('aria-label', visible ? 'Ocultar senha' : 'Mostrar senha');
  event.currentTarget.setAttribute('aria-pressed', String(visible));
});
$('#cancel-button').addEventListener('click', () => controller?.abort());
$('#clear-history').addEventListener('click', () => { history = []; saveHistory(); renderHistory(); });
function saveHistory() { try { localStorage.setItem(historyKey, JSON.stringify(history)); } catch { /* opcional */ } }
function renderHistory() {
  const list = $('#recent-list');
  list.replaceChildren();
  $('#clear-history').hidden = !history.length;
  if (!history.length) { list.append(emptyHistory.cloneNode(true)); return; }
  for (const item of history) {
    const row = document.createElement('div');
    row.className = 'history-item';
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', item.tipo === 'video' ? '#i-video' : '#i-audio');
    svg.append(use);
    const details = document.createElement('div'), name = document.createElement('strong'), date = document.createElement('p'), tag = document.createElement('span');
    name.textContent = item.name;
    const parsedDate = new Date(item.date);
    date.textContent = Number.isNaN(parsedDate.getTime()) ? 'Download recente' : `${parsedDate.toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} · Enviado ao navegador`;
    tag.textContent = item.tipo === 'audio' ? 'MP3' : 'MP4'; tag.className = 'history-tag';
    details.append(name, date); row.append(svg, details, tag); list.append(row);
  }
}
function filenameFromHeader(header, tipo) {
  const encoded = /filename\*=UTF-8''([^;]+)/i.exec(header || '');
  if (encoded) { try { return decodeURIComponent(encoded[1]); } catch { /* usa formato simples */ } }
  const match = /filename="((?:[^"\\]|\\.)*)"/i.exec(header || '');
  return match ? match[1].replace(/\\(.)/g, '$1') : tipo === 'audio' ? 'audio.mp3' : 'video.mp4';
}
async function checkHealth() {
  const button = $('#server-state');
  button.disabled = true;
  $('#server-label').textContent = 'Conectando…';
  try {
    const response = await fetch(`${apiBase}/api/health`, { signal: AbortSignal.timeout(70000), cache: 'no-store' });
    if (!response.ok) throw new Error();
    const health = await response.json();
    button.dataset.state = health.ready ? 'ok' : 'error';
    $('#server-label').textContent = health.ready ? 'API disponível' : 'API indisponível';
    if (!health.ready) showFeedback('error', 'As ferramentas de mídia estão indisponíveis.', 'O administrador precisa verificar a instalação no servidor.');
    if (health.limits) {
      requestTimeout = health.limits.timeoutSeconds * 1000;
      maxBytes = health.limits.maxFileSizeMB * 1048576;
      $('#limits-note').textContent = `Até ${Math.floor(health.limits.maxDurationSeconds / 60)} min por vídeo · Até ${health.limits.maxFileSizeMB} MB por arquivo`;
    }
  } catch {
    button.dataset.state = 'error';
    $('#server-label').textContent = 'Reconectar API';
    showFeedback('error', 'Não foi possível conectar ao servidor.', 'Ele pode estar iniciando. Toque em Reconectar API para tentar novamente.');
  } finally { button.disabled = false; }
}
$('#server-state').addEventListener('click', checkHealth);
async function jobRequest(path, options, signal) {
  const response = await fetch(`${apiBase}${path}`, { ...options, signal: AbortSignal.any([signal, AbortSignal.timeout(70000)]), cache: 'no-store' });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `O servidor retornou um erro (${response.status}). Tente novamente.`);
  if (!data) throw new Error('Resposta inválida do servidor. Tente novamente.');
  return data;
}
function waitForPoll(signal) {
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); reject(new DOMException('Cancelado', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, 2000);
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (controller || !form.reportValidity()) return;
  const input = { url: urlInput.value.trim(), tipo: form.elements.tipo.value, qualidade: $('#quality').value, thumbnail: $('#thumbnail').checked };
  controller = new AbortController();
  let jobId;
  const headers = { Authorization: `Bearer ${password.value}` };
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; controller?.abort(); }, requestTimeout + 80000);
  fields.disabled = true;
  form.setAttribute('aria-busy', 'true');
  showFeedback('loading', 'Preparando seu arquivo…', 'Buscando a mídia e convertendo para o formato escolhido. Isso pode levar alguns minutos.');
  try {
    const job = await jobRequest('/api/jobs', { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(input) }, controller.signal);
    if (typeof job.id !== 'string' || !/^[a-f0-9-]{36}$/.test(job.id)) throw new Error('Resposta inválida do servidor.');
    jobId = job.id;
    while (true) {
      const state = await jobRequest(`/api/jobs/${jobId}`, { headers }, controller.signal);
      if (state.status === 'ready') break;
      if (state.status === 'failed') throw new Error(state.error || 'Não foi possível preparar o arquivo.');
      await waitForPoll(controller.signal);
    }
    const response = await fetch(`${apiBase}/api/jobs/${jobId}/file`, { headers, signal: controller.signal, cache: 'no-store' });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error || `O servidor retornou um erro (${response.status}). Tente novamente.`);
    }
    const name = filenameFromHeader(response.headers.get('Content-Disposition'), input.tipo);
    const length = Number(response.headers.get('Content-Length'));
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
      if (received > maxBytes + 1048576) { await reader.cancel(); throw new Error('O arquivo excede o limite de tamanho.'); }
      chunks.push(value);
      showFeedback('loading', 'Recebendo seu arquivo…', `${(received / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB${length ? ` de ${(length / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : ''}`);
    }
    if (!received) throw new Error('O arquivo recebido está vazio. Tente outro link.');
    const blobUrl = URL.createObjectURL(new Blob(chunks, { type: input.tipo === 'audio' ? 'audio/mpeg' : 'video/mp4' }));
    const anchor = document.createElement('a');
    anchor.href = blobUrl; anchor.download = name;
    document.body.append(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    history.unshift({ name, tipo: input.tipo, date: new Date().toISOString() });
    history = history.slice(0, 5); saveHistory(); renderHistory();
    showFeedback('success', 'Pronto! Seu arquivo foi enviado ao navegador.', 'Confira os downloads do navegador para abrir ou salvar o arquivo.');
  } catch (error) {
    const aborted = controller.signal.aborted;
    showFeedback(aborted && !timedOut ? 'info' : 'error', aborted ? timedOut ? 'O tempo de espera acabou.' : 'Download cancelado.' : 'Não foi possível concluir.', aborted ? 'Você pode tentar novamente quando quiser.' : error.message === 'Failed to fetch' ? 'A conexão com o servidor caiu. Verifique sua internet e tente novamente.' : error.message);
  } finally {
    if (jobId) void fetch(`${apiBase}/api/jobs/${jobId}`, { method: 'DELETE', headers, signal: AbortSignal.timeout(10000), keepalive: true }).catch(() => {});
    clearTimeout(timeout); controller = null; fields.disabled = false; form.removeAttribute('aria-busy');
  }
});
renderHistory();
checkHealth();
