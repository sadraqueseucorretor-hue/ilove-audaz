/*
 * Sanitização: remove valores de chaves sensíveis antes de qualquer
 * relatório, console ou download. Também remove parâmetros sensíveis de URLs.
 */
(function (ns) {
  'use strict';
  const cfg = ns.config;

  function redactDeep(value, depth) {
    depth = depth || 0;
    if (depth > 30 || value == null || typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => redactDeep(v, depth + 1));
    const out = {};
    for (const k of Object.keys(value)) {
      const v = value[k];
      if (cfg.sensitiveKeyPattern.test(k) && (v == null || typeof v !== 'object')) {
        out[k] = v == null || v === '' ? v : '[removido]';
      } else if (typeof v === 'string' && /^https?:\/\//i.test(v)) {
        out[k] = redactUrl(v);
      } else {
        out[k] = redactDeep(v, depth + 1);
      }
    }
    return out;
  }

  function redactUrl(url) {
    try {
      const u = new URL(url);
      for (const k of [...u.searchParams.keys()]) {
        if (cfg.sensitiveKeyPattern.test(k) || cfg.sensitiveUrlParamPattern.test(k)) u.searchParams.set(k, '[removido]');
      }
      return u.href;
    } catch (_) { return String(url); }
  }

  function redactBodyText(text) {
    if (!text) return text;
    try { return JSON.stringify(redactDeep(JSON.parse(text))); } catch (_) { /* não é JSON */ }
    try {
      const p = new URLSearchParams(text);
      let touched = false;
      for (const k of [...p.keys()]) if (cfg.sensitiveKeyPattern.test(k)) { p.set(k, '[removido]'); touched = true; }
      if (touched) return p.toString();
    } catch (_) { /* ignora */ }
    return text;
  }

  ns.redact = { redactDeep, redactUrl, redactBodyText };
})(self.AudazConnect);
