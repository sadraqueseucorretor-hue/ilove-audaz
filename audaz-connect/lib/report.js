/*
 * Relatório de DEBUG: junta descoberta + estrutura + sugestões em um JSON
 * sanitizado, e imprime um console estruturado na página.
 */
(function (ns) {
  'use strict';
  const cfg = ns.config;
  const D = ns.discovery;
  const S = ns.schema;
  const { redactDeep, redactUrl, redactBodyText } = ns.redact;
  const N = ns.normalize;

  const shortUrl = (url) => {
    try { const u = new URL(redactUrl(url)); return u.host + u.pathname + u.search; } catch (_) { return String(url); }
  };

  function dedupIds(list) {
    const seen = new Set();
    return list.filter((i) => {
      const k = i.chave + '=' + i.valor;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }

  /** Localiza o alvo em todas as respostas JSON já observadas. */
  function locateTarget(jsonRecs, targetName) {
    const ocorrencias = [];
    for (const rec of jsonRecs) {
      if (ocorrencias.length >= 15) break;
      for (const hit of D.findText(rec.json, targetName, 5)) {
        ocorrencias.push({ resposta: shortUrl(rec.url), caminho: hit.caminho, valor: hit.valor, registro: redactDeep(hit.registro) });
      }
    }
    const ids = dedupIds(ocorrencias.flatMap((o) => D.idCandidates(o.registro)));
    return { ocorrencias, idsCandidatos: ids };
  }

  function describeEspelho(rec, link) {
    const base = {
      url: shortUrl(rec.url),
      metodo: rec.method,
      status: rec.status,
      corpoRequisicao: redactBodyText(rec.reqBody),
      tamanhoBytes: rec.size,
      observadoEm: new Date(rec.at).toISOString(),
      vinculoComAlvo: link
    };
    if (rec.status >= 400 || rec.status === 0) return Object.assign(base, { erro: 'portal respondeu com status ' + rec.status });
    if (!rec.json) return Object.assign(base, { erro: rec.parseError || 'resposta sem JSON' });

    const grupos = D.findObjectArrays(rec.json);
    const principal = grupos[0] || null;
    const out = Object.assign(base, {
      estrutura: S.describe(redactDeep(rec.json), 0, 4),
      listasEncontradas: grupos.slice(0, 8).map((g) => ({ caminho: g.padrao, listas: g.ocorrencias, itens: g.totalItens, chaves: g.chaves }))
    });
    if (principal) {
      const items = D.itemsOfGroup(rec.json, principal);
      const perfil = S.profileArray(items);
      out.unidadesCandidatas = {
        observacao: 'Maior lista de objetos da resposta. Confirmar se cada item é de fato uma unidade.',
        caminho: principal.padrao,
        total: items.length,
        perfilDosCampos: perfil,
        amostra: redactDeep(items.slice(0, 3))
      };
      out.sugestoesDeMapeamento = {
        observacao: 'SUGESTÕES por nome de campo — não confirmadas. Validar com a amostra acima.',
        campos: N.suggestMapping(perfil)
      };
      out.normalizacao = N.normalize(items);
    }
    return out;
  }

  function build(state) {
    const targetName = cfg.debugTarget.nome;
    const jsonRecs = state.records.filter((r) => r.json);
    const alvo = locateTarget(jsonRecs.filter((r) => !D.isEspelho(r)), targetName);

    const espelhos = state.records.filter(D.isEspelho).map((rec) => ({ rec, link: D.linkToTarget(rec, targetName, alvo.idsCandidatos) }));
    const confirmados = espelhos.filter((e) => e.link.confirmado);
    const escolhido = (confirmados.length ? confirmados : espelhos).slice(-1)[0] || null;
    const espelho = escolhido ? describeEspelho(escolhido.rec, escolhido.link) : null;

    let resultado, motivo;
    if (!escolhido) {
      resultado = 'aguardando';
      motivo = 'Nenhuma resposta de "obter-espelho-de-vendas" observada ainda. Abra o espelho do ' + targetName + ' no portal; a extensão está escutando.';
    } else if (espelho.erro) {
      resultado = 'erro';
      motivo = espelho.erro;
    } else if (!escolhido.link.confirmado) {
      resultado = 'parcial';
      motivo = 'Espelho observado, mas não foi possível confirmar que é do ' + targetName + '.';
    } else {
      resultado = 'capturado';
      motivo = escolhido.link.motivo;
    }

    const elementosNaTela = D.findInDom(targetName).length;

    return {
      ferramenta: 'AUDAZ CONNECT',
      versao: cfg.version,
      modo: 'DEBUG',
      geradoEm: new Date().toISOString(),
      pagina: {
        url: shortUrl(location.href),
        titulo: document.title,
        iframes: [...document.querySelectorAll('iframe')].map((f) => shortUrl(f.src || '(sem src)')).slice(0, 10)
      },
      sessao: state.session,
      alvo: { nome: targetName, elementosNaTela, encontradoNasRespostas: alvo },
      resultado,
      motivo,
      espelho,
      outrosEspelhosObservados: espelhos.filter((e) => e !== escolhido).map((e) => ({ url: shortUrl(e.rec.url), status: e.rec.status, vinculo: e.link })),
      respostasRelevantes: state.records
        .filter((r) => !D.isEspelho(r) && cfg.relevantUrlPattern.test(r.url))
        .slice(-20)
        .map((r) => ({ metodo: r.method, url: shortUrl(r.url), status: r.status, tamanhoBytes: r.size, chavesRaiz: r.json && !Array.isArray(r.json) ? Object.keys(r.json).slice(0, 25) : r.json ? '[array(' + r.json.length + ')]' : null })),
      requisicoesObservadas: {
        total: state.observed.length,
        ultimas: state.observed.slice(-60).map((m) => ({ metodo: m.method, url: shortUrl(m.url), status: m.status, tamanhoBytes: m.size, json: m.isJson }))
      }
    };
  }

  function log(report) {
    const title = 'AUDAZ CONNECT · DEBUG · ' + report.alvo.nome + ' · ' + report.resultado.toUpperCase();
    console.groupCollapsed('%c' + title, 'background:#101c3f;color:#f0a83a;font-weight:700;padding:3px 8px;border-radius:4px');
    console.log('Motivo:', report.motivo);
    console.log('Sessão:', report.sessao);
    console.log('Alvo nas respostas do portal:', report.alvo.encontradoNasRespostas);
    if (report.espelho) {
      console.log('Espelho:', { url: report.espelho.url, metodo: report.espelho.metodo, status: report.espelho.status, corpoRequisicao: report.espelho.corpoRequisicao, vinculo: report.espelho.vinculoComAlvo });
      if (report.espelho.listasEncontradas) console.table(report.espelho.listasEncontradas.map((l) => ({ caminho: l.caminho, listas: l.listas, itens: l.itens })));
      if (report.espelho.unidadesCandidatas) {
        console.log('Unidades candidatas: ' + report.espelho.unidadesCandidatas.total + ' em ' + report.espelho.unidadesCandidatas.caminho);
        console.table(report.espelho.unidadesCandidatas.perfilDosCampos.map((p) => ({ campo: p.campo, tipos: p.tipos, preenchido: p.preenchido, exemplos: p.exemplos.join(' | ') })));
        console.log('Amostra (3 itens, sanitizada):', report.espelho.unidadesCandidatas.amostra);
        console.log('Sugestões de mapeamento (não confirmadas):', report.espelho.sugestoesDeMapeamento.campos);
      }
    }
    console.log('Relatório completo:', report);
    console.groupEnd();
  }

  ns.report = { build, log, shortUrl };
})(self.AudazConnect);
