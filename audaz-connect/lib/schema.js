/*
 * Inferência de estrutura: descreve o JSON real recebido (tipos, chaves,
 * tamanhos de listas, exemplos) para decidirmos o mapeamento com base em fatos.
 */
(function (ns) {
  'use strict';
  const { redactDeep } = ns.redact;

  const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

  const short = (v) => {
    if (typeof v === 'string') return v.length > 80 ? v.slice(0, 77) + '...' : v;
    return v;
  };

  /** Descrição compacta e recursiva da forma de um valor. */
  function describe(value, depth, maxDepth) {
    depth = depth || 0;
    maxDepth = maxDepth == null ? 5 : maxDepth;
    const t = typeOf(value);
    if (t === 'array') {
      const d = { tipo: 'array', tamanho: value.length };
      if (value.length && depth < maxDepth) d.item = describe(value[0], depth + 1, maxDepth);
      return d;
    }
    if (t === 'object') {
      if (depth >= maxDepth) return { tipo: 'object', chaves: Object.keys(value).length };
      const campos = {};
      for (const k of Object.keys(value)) campos[k] = describe(value[k], depth + 1, maxDepth);
      return { tipo: 'object', campos };
    }
    return { tipo: t, exemplo: short(value) };
  }

  /** Achata um objeto em caminhos pontuados (até `maxDepth` níveis). */
  function flatten(obj, prefix, depth, maxDepth, out) {
    out = out || {};
    if (obj == null || typeof obj !== 'object' || Array.isArray(obj) || depth >= maxDepth) {
      out[prefix] = obj;
      return out;
    }
    for (const k of Object.keys(obj)) {
      const key = prefix ? prefix + '.' + k : k;
      const v = obj[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, depth + 1, maxDepth, out);
      else out[key] = Array.isArray(v) ? '[array(' + v.length + ')]' : v;
    }
    return out;
  }

  /**
   * Perfil dos campos de uma lista de objetos: para cada campo, quais tipos
   * aparecem, em quantos itens está preenchido e alguns valores distintos.
   */
  function profileArray(items) {
    const prof = {};
    const total = items.length;
    for (const raw of items) {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
      const flat = flatten(redactDeep(raw), '', 0, 3);
      for (const k of Object.keys(flat)) {
        const v = flat[k];
        const p = prof[k] || (prof[k] = { tipos: new Set(), preenchido: 0, exemplos: new Set() });
        p.tipos.add(typeOf(v));
        if (v !== null && v !== '' && v !== undefined) p.preenchido++;
        if (p.exemplos.size < 6 && v !== null && v !== '' && typeof v !== 'object') p.exemplos.add(short(v));
      }
    }
    return Object.keys(prof).map((campo) => ({
      campo,
      tipos: [...prof[campo].tipos].join('|'),
      preenchido: prof[campo].preenchido + '/' + total,
      exemplos: [...prof[campo].exemplos]
    }));
  }

  ns.schema = { typeOf, describe, flatten, profileArray };
})(self.AudazConnect);
