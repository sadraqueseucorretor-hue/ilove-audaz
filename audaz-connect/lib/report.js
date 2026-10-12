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

  function describeEspelho(rec, link, jsonRecs, targetName) {
    const base = {
      url: shortUrl(rec.url),
      metodo: rec.method,
      status: rec.status,
      corpoRequisicao: redactBodyText(rec.reqBody),
      tamanhoBytes: rec.size,
      observadoEm: new Date(rec.at).toISOString(),
      vinculoComAlvo: link
    };
    if (rec.status >= 400 || rec.status === 0) return { info: Object.assign(base, { erro: 'portal respondeu com status ' + rec.status }), pacote: null };
    if (!rec.json) return { info: Object.assign(base, { erro: rec.parseError || 'resposta sem JSON' }), pacote: null };

    const grupos = D.findObjectArrays(rec.json);
    const principal = grupos[0] || null;
    const info = Object.assign(base, {
      listasEncontradas: grupos.slice(0, 8).map((g) => ({ caminho: g.padrao, listas: g.ocorrencias, itens: g.totalItens })),
      perfilDosCampos: principal ? S.profileArray(D.itemsOfGroup(rec.json, principal)) : []
    });

    const id = D.espelhoId(rec);
    let pacote = null;
    try {
      pacote = N.normalize(rec.json, {
        id,
        nome: targetName,
        empreendimentoRecord: id ? D.findEmpreendimentoRecord(jsonRecs, id) : null,
        capturadoEm: new Date(rec.at).toISOString()
      });
      info.normalizado = {
        capturadoEm: pacote.capturadoEm,
        empreendimento: pacote.empreendimento,
        resumo: pacote.resumo,
        validacao: pacote.validacao,
        amostra: pacote.unidades.slice(0, 5)
      };
      if (!pacote.validacao.ok) info.erro = 'validação falhou: ' + pacote.validacao.erros.join('; ');
    } catch (e) {
      info.erro = 'normalização falhou: ' + (e && e.message);
    }
    return { info, pacote };
  }

  function build(state) {
    const targetName = cfg.debugTarget.nome;
    const jsonRecs = state.records.filter((r) => r.json);
    const alvo = locateTarget(jsonRecs.filter((r) => !D.isEspelho(r)), targetName);

    const espelhos = state.records.filter(D.isEspelho).map((rec) => ({ rec, link: D.linkToTarget(rec, targetName, alvo.idsCandidatos) }));
    const confirmados = espelhos.filter((e) => e.link.confirmado);
    const escolhido = (confirmados.length ? confirmados : espelhos).slice(-1)[0] || null;
    const desc = escolhido ? describeEspelho(escolhido.rec, escolhido.link, jsonRecs, targetName) : null;
    const espelho = desc ? desc.info : null;
    state.lastPackage = desc && desc.pacote && !espelho.erro && escolhido.link.confirmado ? desc.pacote : null;

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
        .filter((r) => !D.isEspelho(r) && D.isPortalApi(r.url) && cfg.relevantUrlPattern.test(r.url))
        .slice(-20)
        .map((r) => ({ metodo: r.method, url: shortUrl(r.url), status: r.status, tamanhoBytes: r.size, chavesRaiz: r.json && !Array.isArray(r.json) ? Object.keys(r.json).slice(0, 25) : r.json ? '[array(' + r.json.length + ')]' : null })),
      requisicoesObservadas: {
        total: state.observed.length,
        ultimasDoPortal: state.observed.filter((m) => D.isPortalApi(m.url)).slice(-40).map((m) => ({ metodo: m.method, url: shortUrl(m.url), status: m.status, tamanhoBytes: m.size, json: m.isJson }))
      }
    };
  }

  function log(report, pacote) {
    const title = 'AUDAZ CONNECT · DEBUG · ' + report.alvo.nome + ' · ' + report.resultado.toUpperCase();
    console.groupCollapsed('%c' + title, 'background:#101c3f;color:#f0a83a;font-weight:700;padding:3px 8px;border-radius:4px');
    console.log('Motivo:', report.motivo);
    console.log('Sessão:', report.sessao);
    console.log('Alvo nas respostas do portal:', report.alvo.encontradoNasRespostas);
    if (report.espelho) {
      console.log('Espelho:', { url: report.espelho.url, status: report.espelho.status, vinculo: report.espelho.vinculoComAlvo });
      const n = report.espelho.normalizado;
      if (n) {
        console.log('Empreendimento:', n.empreendimento);
        console.log('Resumo:', n.resumo);
        console.log('Validação:', n.validacao);
      }
      if (pacote) {
        console.table(pacote.unidades.map((u) => ({
          bloco: u.bloco, unidade: u.unidade, andar: u.andar, tipologia: u.tipologia, area: u.areaPrivativaM2,
          vagas: u.vagas, valorFinalKit: u.valorFinalKit, avaliacao: u.avaliacaoBancaria, status: u.status.rotulo
        })));
      }
    }
    console.log('Relatório completo:', report);
    console.groupEnd();
  }

  ns.report = { build, log, shortUrl };
})(self.AudazConnect);
