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

  const FORMATO = 'audaz.disponibilidade';
  const VERSAO = 1;

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

  const STATUS_ROTULO = { disponivel: 'Disponível', reservado: 'Reservado', vendido: 'Vendido', indisponivel: 'Indisponível' };

  /** { codigo: categoria fixa do Audaz, rotulo: texto para exibir, original: texto do portal } */
  function statusOf(raw) {
    const original = txt(raw, 60);
    const rule = original && cfg.statusMap.find((r) => r.re.test(original));
    const codigo = rule ? rule.categoria : 'outro';
    return { codigo, rotulo: STATUS_ROTULO[codigo] || original, original };
  }

  /** Data no padrão AAAA-MM-DD. Aceita "2027-01-31T03:00:00Z" e "31/01/2027". */
  function isoDate(v) {
    const s = txt(v, 40);
    if (!s) return null;
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
    if (m) return m[3] + '-' + m[2] + '-' + m[1];
    return null;
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
      identificador,
      bloco: txt(u.blocoEtapa, 40),
      unidade: unidadeFromIdentificador(identificador),
      andar: num(u.andar),
      tipologia: txt(u.tipoPlanta, 80),
      tipo: txt(u.tipoUnidade, 40),
      quartos: num(u.numQuartos),
      suites: num(u.numSuites),
      banheiros: num(u.numBanhos),
      areaPrivativaM2: num(u.areaPrivativaPrincipal),
      areaTotalM2: num(u.areaRealTotal),
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
      dataEntrega: isoDate(u.dataEntregaObra || u.dataEntrega),
      atualizadoNoPortalEm: txt(u.dataAlteracao, 40),
      idPortal: txt(u.idUnidadeSales, 40)
    };
  }

  /** Registro do empreendimento (vindo de empreendimento/obter ou obter-por-nome). */
  function normalizeEmpreendimento(rec, id, nomeFallback) {
    return {
      id,
      nome: txt(rec && rec.nomeEmpreendimento, 120) || nomeFallback,
      dataEntrega: isoDate(rec && rec.dataTerminoObra),
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
    const outros = [...new Set(unidades.filter((u) => u.status.codigo === 'outro').map((u) => u.status.original))];
    if (outros.length) avisos.push('status sem categoria definida (exibidos como texto original): ' + outros.join(', '));

    return { ok: erros.length === 0, erros, avisos };
  }

  /**
   * Normaliza o espelho de UM empreendimento.
   * @param {object} espelhoJson   resposta do obter-espelho-de-vendas
   * @param {object} ctx           { id, nome, empreendimentoRecord, capturadoEm }
   */
  function normalize(espelhoJson, ctx) {
    const raw = extractUnits(espelhoJson);
    const unidades = raw.map(normalizeUnit);
    const empreendimento = normalizeEmpreendimento(ctx.empreendimentoRecord, ctx.id, ctx.nome);
    if (!empreendimento.dataEntrega) empreendimento.dataEntrega = (unidades.find((u) => u.dataEntrega) || {}).dataEntrega || null;

    const porStatus = { disponivel: 0, reservado: 0, vendido: 0, indisponivel: 0, outro: 0 };
    for (const u of unidades) porStatus[u.status.codigo]++;

    return {
      empreendimento,
      capturadoEm: ctx.capturadoEm,
      resumo: { totalUnidades: unidades.length, totalBlocos: espelhoJson.blocos.length, porStatus },
      validacao: validate(raw, unidades, empreendimento, espelhoJson.blocos.length),
      unidades
    };
  }

  /**
   * Arquivo final para importar no Audaz: sempre o mesmo envelope, com 1 ou
   * vários empreendimentos. Formato documentado em schema/.
   */
  function buildExport(entries, versaoExtensao) {
    const empreendimentos = entries.slice().sort((a, b) => String(a.empreendimento.nome).localeCompare(String(b.empreendimento.nome), 'pt-BR'));
    return {
      formato: FORMATO,
      versao: VERSAO,
      geradoEm: new Date().toISOString(),
      origem: { sistema: 'Bora Vender', ferramenta: 'AUDAZ CONNECT', versaoFerramenta: versaoExtensao || cfg.version },
      totalEmpreendimentos: empreendimentos.length,
      totalUnidades: empreendimentos.reduce((n, e) => n + e.unidades.length, 0),
      empreendimentos
    };
  }

  ns.normalize = { FORMATO, VERSAO, normalize, buildExport, extractUnits };
})(self.AudazConnect);
