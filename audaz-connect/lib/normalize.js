/*
 * Normalização do espelho de vendas para o formato interno do Audaz.
 *
 * Mapeamento CONFIRMADO com a resposta real do Bora Vender
 * (Conquista Maraponga, 12/10/2026, 280 unidades):
 *
 *   GET be.direcional.com.br/bora-vender/v1/unidade/obter-espelho-de-vendas?IdEmpreendimentoSales=<id>
 *   → { blocos: [ { nome, andar: [ { valor, unidades: [ <unidade> ] } ] } ] }
 *
 * Campos ausentes viram null — nada é inventado. O único campo derivado é
 * `unidade` (sufixo do `identificador`, ex.: "BL01-0102" → "0102"), marcado
 * como tal em `fonte.derivados`.
 */
(function (ns) {
  'use strict';
  const cfg = ns.config;

  const SCHEMA = 'audaz.disponibilidade/v1';

  // Campos do portal que a normalização exige em cada unidade.
  const REQUIRED_KEYS = ['identificador', 'blocoEtapa', 'andar', 'statusUnidade', 'valorFinalKit'];

  const num = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
    return null;
  };

  // Texto limpo: sem caracteres de controle, espaços colapsados, tamanho limitado.
  // (O escape de HTML é feito na hora de exibir, no Audaz.)
  const txt = (v, max) => {
    if (v == null) return null;
    const s = String(v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
    return s ? s.slice(0, max || 300) : null;
  };

  function statusOf(raw) {
    const texto = txt(raw, 60);
    const rule = texto && cfg.statusMap.find((r) => r.re.test(texto));
    return { categoria: rule ? rule.categoria : 'outro', texto };
  }

  function unidadeFromIdentificador(id) {
    const m = /-(\w+)$/.exec(id || '');
    return m ? m[1] : null;
  }

  /** Junta as unidades de todos os blocos/andares do espelho. */
  function extractUnits(espelhoJson) {
    if (!espelhoJson || !Array.isArray(espelhoJson.blocos)) {
      throw new Error('formato inesperado: a resposta do espelho não tem a lista "blocos"');
    }
    const out = [];
    for (const bloco of espelhoJson.blocos) {
      for (const andar of (bloco && Array.isArray(bloco.andar) ? bloco.andar : [])) {
        for (const u of (andar && Array.isArray(andar.unidades) ? andar.unidades : [])) out.push(u);
      }
    }
    return out;
  }

  function normalizeUnit(u) {
    const identificador = txt(u.identificador, 40);
    return {
      idSales: txt(u.idUnidadeSales, 40),
      identificador,
      bloco: txt(u.blocoEtapa, 40),
      unidade: unidadeFromIdentificador(identificador),
      andar: num(u.andar),
      tipologia: txt(u.tipoPlanta, 80),
      tipoUnidade: txt(u.tipoUnidade, 40),
      quartos: num(u.numQuartos),
      suites: num(u.numSuites),
      banheiros: num(u.numBanhos),
      areaPrivativa: num(u.areaPrivativaPrincipal),
      areaTotal: num(u.areaRealTotal),
      vagas: num(u.qtdeVagas),
      descricaoVaga: txt(u.descVagas, 40),
      valorFinalKit: num(u.valorFinalKit),
      valorFinalCampanhaKit: num(u.valorFinalCampanhaKit),
      valorDescontoCampanha: num(u.valorDescontoCampanha),
      avaliacaoBancaria: num(u.valorAvalBancaria),
      valorMinimoSinal: num(u.valorMinimoSinal),
      bonusAdimplencia: num(u.bonusAdimplencia),
      status: statusOf(u.statusUnidade),
      motivoBloqueio: txt(u.motivoBloqueioUnidade, 120),
      descricao: txt(u.descricao, 400),
      observacoes: txt(u.outrasDescricoes, 300),
      dataEntrega: txt(u.dataEntregaObra || u.dataEntrega, 40),
      alteradoNoPortalEm: txt(u.dataAlteracao, 40)
    };
  }

  /** Registro do empreendimento (vindo de empreendimento/obter ou obter-por-nome). */
  function normalizeEmpreendimento(rec, id, nomeFallback) {
    return {
      id,
      nome: txt(rec && rec.nomeEmpreendimento, 120) || nomeFallback,
      dataEntrega: txt(rec && rec.dataTerminoObra, 20),
      statusObra: txt(rec && rec.statusObra, 40),
      cidade: txt(rec && rec.cidadeObra, 60),
      bairro: txt(rec && rec.bairroObra, 60),
      totalUnidadesInformado: num(rec && rec.numeroDeUnidades),
      totalBlocosInformado: num(rec && rec.numeroDeBlocos)
    };
  }

  function validate(rawUnits, unidades, empreendimento, blocos) {
    const avisos = [];
    const erros = [];
    if (!unidades.length) erros.push('nenhuma unidade no espelho');

    const missing = {};
    for (const u of rawUnits) for (const k of REQUIRED_KEYS) if (!(k in u)) missing[k] = (missing[k] || 0) + 1;
    for (const k of Object.keys(missing)) erros.push('campo "' + k + '" ausente em ' + missing[k] + ' unidade(s) — o formato do portal pode ter mudado');

    const seen = new Set();
    const dup = new Set();
    for (const u of unidades) { if (seen.has(u.identificador)) dup.add(u.identificador); seen.add(u.identificador); }
    if (dup.size) erros.push('identificadores repetidos: ' + [...dup].slice(0, 10).join(', '));

    if (empreendimento.totalUnidadesInformado != null && empreendimento.totalUnidadesInformado !== unidades.length) {
      avisos.push('portal informa ' + empreendimento.totalUnidadesInformado + ' unidades, espelho trouxe ' + unidades.length);
    }
    if (empreendimento.totalBlocosInformado != null && empreendimento.totalBlocosInformado !== blocos) {
      avisos.push('portal informa ' + empreendimento.totalBlocosInformado + ' blocos, espelho trouxe ' + blocos);
    }
    const semValor = unidades.filter((u) => u.valorFinalKit == null).length;
    if (semValor) avisos.push(semValor + ' unidade(s) sem valorFinalKit');
    const outros = [...new Set(unidades.filter((u) => u.status.categoria === 'outro').map((u) => u.status.texto))];
    if (outros.length) avisos.push('status sem categoria definida (exibidos como texto original): ' + outros.join(', '));

    return { ok: erros.length === 0, erros, avisos };
  }

  /**
   * Gera o pacote normalizado de um empreendimento.
   * @param {object} espelhoJson   resposta do obter-espelho-de-vendas
   * @param {object} ctx           { id, nome, empreendimentoRecord, capturadoEm }
   */
  function normalize(espelhoJson, ctx) {
    const raw = extractUnits(espelhoJson);
    const unidades = raw.map(normalizeUnit);
    const empreendimento = normalizeEmpreendimento(ctx.empreendimentoRecord, ctx.id, ctx.nome);
    if (!empreendimento.dataEntrega) empreendimento.dataEntrega = (unidades.find((u) => u.dataEntrega) || {}).dataEntrega || null;

    const porStatus = {};
    const porStatusOriginal = {};
    for (const u of unidades) {
      porStatus[u.status.categoria] = (porStatus[u.status.categoria] || 0) + 1;
      porStatusOriginal[u.status.texto] = (porStatusOriginal[u.status.texto] || 0) + 1;
    }

    return {
      schema: SCHEMA,
      fonte: { portal: 'Bora Vender', operacao: 'unidade/obter-espelho-de-vendas', derivados: ['unidade (sufixo do identificador)'] },
      capturadoEm: ctx.capturadoEm,
      empreendimento,
      resumo: { total: unidades.length, blocos: espelhoJson.blocos.length, porStatus, porStatusOriginal },
      validacao: validate(raw, unidades, empreendimento, espelhoJson.blocos.length),
      unidades
    };
  }

  ns.normalize = { SCHEMA, normalize, extractUnits };
})(self.AudazConnect);
