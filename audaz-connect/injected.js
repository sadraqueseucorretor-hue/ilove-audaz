/*
 * AUDAZ CONNECT — observador de rede (contexto MAIN da página).
 *
 * Apenas OBSERVA as respostas fetch/XHR que o próprio Bora Vender recebe
 * na sessão do usuário. Não altera requisições, não dispara requisições,
 * não lê cookies nem cabeçalhos de autenticação.
 * Os dados seguem para o content script (mundo isolado) via postMessage.
 */
(() => {
  'use strict';
  if (window.__audazConnectObserver) return;
  window.__audazConnectObserver = true;

  const TAG = 'AUDAZ_CONNECT_NET';
  const MAX_TEXT = 8 * 1024 * 1024;
  const MAX_REQ_BODY = 4000;

  const absUrl = (u) => {
    try { return new URL(String(u), location.href).href; } catch (_) { return String(u); }
  };

  const bodyToText = (body) => {
    if (body == null) return null;
    try {
      if (typeof body === 'string') return body.slice(0, MAX_REQ_BODY);
      if (body instanceof URLSearchParams) return body.toString().slice(0, MAX_REQ_BODY);
      if (body instanceof FormData) {
        const o = {};
        for (const [k, v] of body.entries()) o[k] = typeof v === 'string' ? v : '[arquivo]';
        return JSON.stringify(o).slice(0, MAX_REQ_BODY);
      }
    } catch (_) { /* ignora */ }
    return '[corpo não textual]';
  };

  const isTextual = (ct) => !ct || /json|text\/plain|text\/javascript/i.test(ct);

  const emit = (meta, text) => {
    const rec = Object.assign({}, meta, {
      at: Date.now(),
      size: text ? text.length : 0,
      json: null,
      parseError: null
    });
    if (text) {
      if (text.length > MAX_TEXT) {
        rec.parseError = 'resposta maior que o limite de observação';
      } else if (/^\s*[[{]/.test(text)) {
        try { rec.json = JSON.parse(text); } catch (e) { rec.parseError = String(e && e.message).slice(0, 200); }
      }
    }
    try { window.postMessage({ __audaz: TAG, rec }, location.origin); } catch (_) { /* ignora */ }
  };

  // ---- fetch ----
  const origFetch = window.fetch;
  if (typeof origFetch === 'function') {
    window.fetch = function (input, init) {
      let meta = null;
      let reqClone = null;
      try {
        const isReq = typeof Request !== 'undefined' && input instanceof Request;
        meta = {
          kind: 'fetch',
          url: absUrl(isReq ? input.url : input),
          method: String((init && init.method) || (isReq && input.method) || 'GET').toUpperCase(),
          reqBody: bodyToText(init && init.body)
        };
        if (isReq && !(init && init.body) && meta.method !== 'GET') reqClone = input.clone();
      } catch (_) { meta = null; }

      const p = origFetch.apply(this, arguments);
      if (!meta) return p;

      const reqBodyP = reqClone
        ? reqClone.text().then((t) => t.slice(0, MAX_REQ_BODY)).catch(() => null)
        : Promise.resolve(meta.reqBody);

      p.then((res) => {
        const ct = res.headers.get('content-type') || '';
        const base = Object.assign({}, meta, { url: res.url || meta.url, status: res.status, contentType: ct });
        const textP = isTextual(ct) ? res.clone().text() : Promise.resolve(null);
        Promise.all([reqBodyP, textP])
          .then(([rb, t]) => emit(Object.assign(base, { reqBody: rb }), t))
          .catch(() => {});
      }, (err) => {
        reqBodyP.then((rb) => emit(Object.assign({}, meta, { reqBody: rb, status: 0, error: String(err) }), null));
      });
      return p;
    };
  }

  // ---- XMLHttpRequest ----
  const XHR = window.XMLHttpRequest && window.XMLHttpRequest.prototype;
  if (XHR) {
    const origOpen = XHR.open;
    const origSend = XHR.send;
    XHR.open = function (method, url) {
      try { this.__audazMeta = { kind: 'xhr', method: String(method || 'GET').toUpperCase(), url: absUrl(url) }; } catch (_) { /* ignora */ }
      return origOpen.apply(this, arguments);
    };
    XHR.send = function (body) {
      const meta = this.__audazMeta;
      if (meta) {
        meta.reqBody = bodyToText(body);
        this.addEventListener('loadend', () => {
          try {
            const ct = this.getResponseHeader('content-type') || '';
            let text = null;
            if (isTextual(ct)) {
              if (this.responseType === '' || this.responseType === 'text') text = this.responseText;
              else if (this.responseType === 'json' && this.response != null) text = JSON.stringify(this.response);
            }
            emit(Object.assign({}, meta, { url: this.responseURL || meta.url, status: this.status, contentType: ct }), text);
          } catch (_) { /* ignora */ }
        });
      }
      return origSend.apply(this, arguments);
    };
  }
})();
