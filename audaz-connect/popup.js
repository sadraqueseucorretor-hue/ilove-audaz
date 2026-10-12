/* AUDAZ CONNECT — popup (só interface; a lógica fica no content script). */
'use strict';

const PORTAL = /^https:\/\/([a-z0-9-]+\.)*boravender\.app\.br\//i;
const $ = (id) => document.getElementById(id);

let tabId = null;
let lastReport = null;
let pollTimer = null;

const fmtDate = (iso) => {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
};

function setDot(id, cls) { $(id).className = 'dot ' + (cls || ''); }

function send(type) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type }, (res) => {
      if (chrome.runtime.lastError) resolve(null);
      else resolve(res);
    });
  });
}

const SESSAO = {
  ativa: ['ok', 'Usuário conectado (espelho respondido)'],
  provavel: ['warn', 'Portal respondendo · login ainda não confirmado'],
  sem_autorizacao: ['err', 'Sem autorização · faça login no Bora Vender'],
  indeterminado: ['', 'Sessão: aguardando atividade do portal']
};

const RESULT = {
  capturado: ['ok', '✓ capturado'],
  parcial: ['warn', '⚠ não confirmado'],
  erro: ['err', '✕ erro'],
  aguardando: ['warn', '… escutando']
};

function renderStatus(st) {
  const [cls, txt] = SESSAO[st.sessao.estado] || SESSAO.indeterminado;
  setDot('dotSessao', cls);
  $('txtSessao').textContent = txt;
  $('txtSessao').title = st.sessao.detalhe || '';
  $('stObs').textContent = st.respostasObservadas;
  $('stEsp').textContent = st.espelhosObservados;
  $('alvo').textContent = st.alvo;
  $('pName').textContent = st.alvo;
  if (st.ultimoRelatorio) {
    $('stLast').textContent = fmtDate(st.ultimoRelatorio.geradoEm);
    $('stUni').textContent = st.ultimoRelatorio.unidades == null ? '—' : st.ultimoRelatorio.unidades + ' · ' + st.ultimoRelatorio.disponiveis;
  }
  $('btnCancel').hidden = !st.aguardandoEspelho;
}

function renderReport(report) {
  if (!report) return;
  lastReport = report;
  $('progress').hidden = false;
  const [cls, txt] = RESULT[report.resultado] || ['', report.resultado];
  $('pState').className = 'pst ' + cls;
  $('pState').textContent = txt;
  $('pMsg').textContent = report.motivo;
  $('out').hidden = false;
  $('json').textContent = JSON.stringify(report, null, 2);
  $('btnRaw').disabled = !report.espelho || !!report.espelho.erro;
}

async function refresh() {
  const st = await send('AC_STATUS');
  if (!st) return false;
  renderStatus(st);
  if (st.ultimoRelatorio && (!lastReport || st.ultimoRelatorio.geradoEm !== lastReport.geradoEm)) {
    const { 'ac:lastReport': r } = await chrome.storage.local.get('ac:lastReport');
    renderReport(r);
  }
  return true;
}

function download(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

async function init() {
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  renderExport();
  chrome.storage.onChanged.addListener((ch) => { if (ch['ac:empreendimentos']) renderExport(); });
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !PORTAL.test(tab.url || '')) {
    setDot('dotPortal', 'err');
    $('txtPortal').textContent = 'Bora Vender não detectado nesta aba';
    $('txtSessao').textContent = 'Abra https://boravender.app.br e faça login';
    return;
  }
  tabId = tab.id;
  setDot('dotPortal', 'ok');
  $('txtPortal').textContent = 'Bora Vender detectado';

  if (!(await refresh())) {
    setDot('dotPortal', 'warn');
    $('txtPortal').textContent = 'Bora Vender aberto antes da extensão';
    $('txtSessao').textContent = 'Recarregue a página (F5) para ativar a observação';
    return;
  }
  $('btnPull').disabled = false;
  const { 'ac:lastReport': r } = await chrome.storage.local.get('ac:lastReport');
  if (r && r.pagina) renderReport(r);
  pollTimer = setInterval(refresh, 1500);
}

$('btnPull').addEventListener('click', async () => {
  $('btnPull').disabled = true;
  const res = await send('AC_PULL_DEBUG');
  $('btnPull').disabled = false;
  if (!res || !res.ok) {
    $('progress').hidden = false;
    $('pState').className = 'pst err';
    $('pState').textContent = '✕ erro';
    $('pMsg').textContent = (res && res.erro) || 'Sem resposta da página. Recarregue o Bora Vender (F5).';
    return;
  }
  renderReport(res.report);
  renderStatus(res.status);
});

$('btnCancel').addEventListener('click', async () => {
  const res = await send('AC_CANCEL');
  if (res) renderStatus(res.status);
});

$('btnCopy').addEventListener('click', async () => {
  if (!lastReport) return;
  await navigator.clipboard.writeText(JSON.stringify(lastReport, null, 2));
  $('btnCopy').textContent = 'Copiado ✓';
  setTimeout(() => { $('btnCopy').textContent = 'Copiar relatório'; }, 1500);
});

$('btnDl').addEventListener('click', () => {
  if (lastReport) download('audaz-connect-debug-' + stamp() + '.json', lastReport);
});

const ddmmyyyy = () => { const d = new Date(); const p = (n) => String(n).padStart(2, '0'); return p(d.getDate()) + '-' + p(d.getMonth() + 1) + '-' + d.getFullYear(); };
const slug = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function savedEntries() {
  const { 'ac:empreendimentos': all } = await chrome.storage.local.get('ac:empreendimentos');
  return Object.values(all || {});
}

async function renderExport() {
  const entries = await savedEntries();
  $('export').hidden = !entries.length;
  if (!entries.length) return;
  const unidades = entries.reduce((n, e) => n + e.unidades.length, 0);
  $('expInfo').textContent = entries.length + ' empreendimento(s) · ' + unidades + ' unidades · ' +
    entries.map((e) => e.empreendimento.nome + ' (' + fmtDate(e.capturadoEm) + ')').join(', ');
}

$('btnPkg').addEventListener('click', async () => {
  const entries = await savedEntries();
  if (!entries.length) return;
  const arquivo = self.AudazConnect.normalize.buildExport(entries, chrome.runtime.getManifest().version);
  const nome = entries.length === 1 ? slug(entries[0].empreendimento.nome) : 'audaz';
  download('disponibilidade-' + nome + '-' + ddmmyyyy() + '.json', arquivo);
});

$('btnRaw').addEventListener('click', async () => {
  const res = await send('AC_RAW_ESPELHO');
  if (res && res.raw) download('audaz-connect-espelho-bruto-' + stamp() + '.json', res.raw);
  else $('pMsg').textContent = 'Nenhum espelho com JSON em memória nesta aba (a página foi recarregada?).';
});

window.addEventListener('unload', () => clearInterval(pollTimer));
init();
