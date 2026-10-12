/*
 * Descoberta: localiza, nas respostas que o portal entregou ao navegador,
 * onde aparece o empreendimento-alvo, qual é o seu ID e qual resposta
 * corresponde ao espelho de vendas. Nada de formato fixo: só busca.
 */
(function (ns) {
  'use strict';
  const cfg = ns.config;
  const { typeOf } = ns.schema;

  const norm = (s) => String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

  const pathStr = (parts) => parts.reduce((acc, p) => (typeof p === 'number' ? acc + '[' + p + ']' : acc ? acc + '.' + p : p), '');

  function walk(value, visit, parts, parent, depth) {
    parts = parts || [];
    depth = depth || 0;
    if (depth > 40) return;
    if (visit(value, parts, parent) === false) return;
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) walk(value[i], visit, parts.concat(i), value, depth + 1);
    } else if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) walk(value[k], visit, parts.concat(k), value, depth + 1);
    }
  }

  /** Primitivos do objeto (sem filhos), para mostrar o "registro" onde o texto apareceu. */
  function primitivesOf(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return null;
    const out = {};
    for (const k of Object.keys(obj)) {
      const v = obj[k];
      if (v === null || typeof v !== 'object') out[k] = v;
    }
    return out;
  }

  /** Procura strings que contenham o texto-alvo (sem acento/caixa). */
  function findText(json, needle, max) {
    const n = norm(needle);
    const hits = [];
    walk(json, (v, parts, parent) => {
      if (hits.length >= (max || 20)) return false;
      if (typeof v === 'string' && norm(v).includes(n)) {
        hits.push({ caminho: pathStr(parts), valor: v, registro: primitivesOf(parent) });
      }
    });
    return hits;
  }

  /** Chaves do registro que parecem ser o ID do empreendimento. */
  function idCandidates(record) {
    if (!record) return [];
    const out = [];
    for (const k of Object.keys(record)) {
      const v = record[k];
      if (v === null || v === '' || typeof v === 'object') continue;
      const strong = cfg.idKeyHints.some((re) => re.test(k));
      if (strong || /^id/i.test(k) || /id$/i.test(k)) out.push({ chave: k, valor: v, pista: strong ? 'forte' : 'fraca' });
    }
    return out.sort((a, b) => (a.pista === b.pista ? 0 : a.pista === 'forte' ? -1 : 1));
  }

  /**
   * Listas de objetos dentro do JSON, agrupadas por padrão de caminho
   * (ex.: blocos[*].unidades), somando os itens. Assim uma estrutura
   * aninhada bloco → unidades é contada por inteiro. Maiores primeiro.
   */
  function findObjectArrays(json) {
    const groups = new Map();
    walk(json, (v, parts) => {
      if (Array.isArray(v) && v.length && typeOf(v[0]) === 'object') {
        const pattern = pathStr(parts.map((p) => (typeof p === 'number' ? '*' : p))).replace(/\.\*/g, '[*]').replace(/^\*/, '[*]') || '(raiz)';
        const g = groups.get(pattern) || { padrao: pattern, ocorrencias: 0, totalItens: 0, chaves: new Set(), partsList: [] };
        g.ocorrencias++;
        g.totalItens += v.length;
        g.partsList.push(parts);
        for (const it of v.slice(0, 20)) if (it && typeof it === 'object') Object.keys(it).forEach((k) => g.chaves.add(k));
        groups.set(pattern, g);
      }
    });
    return [...groups.values()]
      .map((g) => Object.assign(g, { chaves: [...g.chaves] }))
      .sort((a, b) => b.totalItens - a.totalItens);
  }

  /** Junta os itens de todas as listas de um grupo. */
  function itemsOfGroup(json, group) {
    return group.partsList.flatMap((parts) => getAt(json, parts) || []);
  }

  function getAt(json, parts) {
    return parts.reduce((acc, p) => (acc == null ? acc : acc[p]), json);
  }

  const isEspelho = (rec) => cfg.espelhoUrlPatterns.some((re) => re.test(rec.url || ''));

  /**
   * Verifica se uma resposta de espelho pertence ao alvo:
   * 1) algum ID candidato do alvo aparece na URL ou no corpo da requisição; ou
   * 2) o nome do alvo aparece dentro da própria resposta.
   */
  function linkToTarget(rec, targetName, ids) {
    const hay = (rec.url || '') + ' ' + (rec.reqBody || '');
    for (const id of ids || []) {
      const v = String(id.valor);
      if (v.length >= 2 && new RegExp('(^|[^0-9A-Za-z])' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^0-9A-Za-z]|$)').test(hay)) {
        return { confirmado: true, motivo: 'ID ' + id.chave + '=' + v + ' presente na requisição' };
      }
    }
    if (rec.json && findText(rec.json, targetName, 1).length) {
      return { confirmado: true, motivo: 'nome "' + targetName + '" presente na resposta' };
    }
    return { confirmado: false, motivo: 'não foi possível vincular esta resposta ao alvo' };
  }

  /** Elementos visíveis na página cujo texto contém o alvo (só leitura). */
  function findInDom(needle) {
    const n = norm(needle);
    const out = [];
    if (!document.body) return out;
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = tw.nextNode()) && out.length < 30) {
      if (norm(node.nodeValue).includes(n) && node.parentElement && !node.parentElement.closest('#audaz-connect-host')) {
        out.push(node.parentElement);
      }
    }
    return out;
  }

  ns.discovery = { norm, walk, findText, idCandidates, findObjectArrays, itemsOfGroup, getAt, isEspelho, linkToTarget, findInDom };
})(self.AudazConnect);
