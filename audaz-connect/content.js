/*
 * AUDAZ CONNECT — orquestrador no Bora Vender (mundo isolado).
 * CAPTURA (injected.js) → DESCOBERTA/ESTRUTURA (lib/) → RELATÓRIO → popup.
 */
(function (ns) {
  'use strict';
  if (window.top !== window) return; // Fase 1: só a janela principal (o relatório lista iframes, se houver)

  const cfg = ns.config;
  const D = ns.discovery;
  const R = ns.report;
  const TAG = 'AUDAZ_CONNECT_NET';

  const state = {
    observed: [],     // metadados de todas as respostas fetch/XHR
    records: [],      // respostas JSON mantidas em memória (inclui espelhos)
    session: { estado: 'indeterminado', detalhe: 'nenhuma resposta do portal observada ainda' },
    armed: false,     // captura DEBUG aguardando o espelho do alvo
    lastReport: null,
    lastPackage: null // pacote normalizado (audaz.disponibilidade/v1) da última captura válida
  };

  const isPortalHost = (url) => { try { return /(^|\.)boravender\.app\.br$/i.test(new URL(url).hostname); } catch (_) { return false; } };

  function updateSession(rec) {
    if (rec.status === 401 || rec.status === 403) {
      state.session = { estado: 'sem_autorizacao', detalhe: 'portal respondeu ' + rec.status + ' em ' + R.shortUrl(rec.url) };
    } else if (D.isEspelho(rec) && rec.status >= 200 && rec.status < 300 && rec.json) {
      state.session = { estado: 'ativa', detalhe: 'espelho de vendas respondido com sucesso' };
    } else if (state.session.estado !== 'ativa' && rec.status >= 200 && rec.status < 300 && rec.json && (isPortalHost(rec.url) || D.isEspelho(rec))) {
      state.session = { estado: 'provavel', detalhe: 'portal respondendo normalmente (login não confirmado por espelho)' };
    }
  }

  function keep(rec) {
    state.observed.push({ method: rec.method, url: rec.url, status: rec.status, size: rec.size, isJson: !!rec.json, at: rec.at });
    if (state.observed.length > cfg.maxObserved) state.observed.shift();
    if (!rec.json && !D.isEspelho(rec)) return;
    state.records.push(rec);
    // Descarta os mais antigos, mas nunca os espelhos mais recentes.
    while (state.records.length > cfg.maxJsonKept) {
      const i = state.records.findIndex((r) => !D.isEspelho(r));
      state.records.splice(i === -1 ? 0 : i, 1);
    }
  }

  function badge(text) {
    try { chrome.runtime.sendMessage({ type: 'AC_BADGE', text }); } catch (_) { /* popup/background ausente */ }
  }

  function runReport() {
    const report = R.build(state);
    state.lastReport = report;
    R.log(report, state.lastPackage);
    const save = { 'ac:lastReport': report, 'ac:lastReportAt': Date.now() };
    try {
      chrome.storage.local.set(save);
      // Armazenamento local de desenvolvimento (Fase 3: API): um registro por empreendimento,
      // substituído a cada nova captura do mesmo empreendimento.
      if (state.lastPackage) {
        const pkg = state.lastPackage;
        chrome.storage.local.get('ac:empreendimentos').then((r) => {
          const all = r['ac:empreendimentos'] || {};
          all[pkg.empreendimento.id || pkg.empreendimento.nome] = pkg;
          return chrome.storage.local.set({ 'ac:empreendimentos': all });
        }).catch(() => {});
      }
    } catch (_) { /* ignora */ }
    badge(report.resultado === 'capturado' ? '✓' : report.resultado === 'aguardando' ? '…' : '!');
    return report;
  }

  function onNetwork(rec) {
    keep(rec);
    updateSession(rec);
    if (D.isEspelho(rec)) {
      badge('E');
      if (state.armed) {
        const report = runReport();
        if (report.resultado === 'capturado') {
          state.armed = false;
          ns.pageUi.toast('Espelho do ' + cfg.debugTarget.nome + ' capturado. Abra a extensão para ver o JSON.', 'ok', 8000);
        } else if (report.resultado === 'erro') {
          ns.pageUi.toast('Espelho observado com erro: ' + report.motivo, 'err', 8000);
        } else {
          ns.pageUi.toast('Espelho observado, mas não vinculado ao ' + cfg.debugTarget.nome + '. Veja o relatório.', 'warn', 8000);
        }
      }
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.source !== window || !ev.data || ev.data.__audaz !== TAG || !ev.data.rec) return;
    onNetwork(ev.data.rec);
  });

  function status() {
    return {
      ok: true,
      versao: cfg.version,
      url: location.href,
      sessao: state.session,
      respostasObservadas: state.observed.length,
      espelhosObservados: state.records.filter(D.isEspelho).length,
      aguardandoEspelho: state.armed,
      alvo: cfg.debugTarget.nome,
      ultimoRelatorio: state.lastReport
        ? { resultado: state.lastReport.resultado, motivo: state.lastReport.motivo, geradoEm: state.lastReport.geradoEm,
            unidades: state.lastPackage ? state.lastPackage.resumo.totalUnidades : null,
            disponiveis: state.lastPackage ? state.lastPackage.resumo.porStatus.disponivel : null }
        : null
    };
  }

  function pullDebug() {
    const report = runReport();
    if (report.resultado === 'capturado') {
      state.armed = false;
      ns.pageUi.toast('Espelho do ' + cfg.debugTarget.nome + ' encontrado nas respostas do portal.', 'ok');
    } else {
      state.armed = true;
      const els = D.findInDom(cfg.debugTarget.nome);
      ns.pageUi.highlight(els.slice(0, 5));
      ns.pageUi.toast(
        els.length
          ? 'Escutando… Abra o espelho do ' + cfg.debugTarget.nome + ' (destacado na tela).'
          : 'Escutando… Navegue até o espelho do ' + cfg.debugTarget.nome + ' no portal.',
        'warn', 10000
      );
    }
    return report;
  }

  /** Resposta bruta do espelho escolhido, sanitizada, para análise do formato. */
  function rawEspelho() {
    const esp = state.records.filter((r) => D.isEspelho(r) && r.json);
    const rec = esp.slice(-1)[0];
    if (!rec) return null;
    return {
      url: R.shortUrl(rec.url), metodo: rec.method, status: rec.status,
      corpoRequisicao: ns.redact.redactBodyText(rec.reqBody),
      observadoEm: new Date(rec.at).toISOString(),
      resposta: ns.redact.redactDeep(rec.json)
    };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.type !== 'string') return;
    try {
      if (msg.type === 'AC_STATUS') sendResponse(status());
      else if (msg.type === 'AC_PULL_DEBUG') sendResponse({ ok: true, report: pullDebug(), status: status() });
      else if (msg.type === 'AC_CANCEL') { state.armed = false; sendResponse({ ok: true, status: status() }); }
      else if (msg.type === 'AC_RAW_ESPELHO') sendResponse({ ok: true, raw: rawEspelho() });
    } catch (e) {
      console.error('[AUDAZ CONNECT]', e);
      sendResponse({ ok: false, erro: String(e && e.message) });
    }
  });

  badge('');
})(self.AudazConnect);
