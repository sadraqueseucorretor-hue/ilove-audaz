/*
 * Aviso discreto dentro da página (Shadow DOM, sem interferir no CSS do portal)
 * e destaque visual do empreendimento-alvo. Somente leitura do DOM do portal.
 */
(function (ns) {
  'use strict';
  let host = null;
  let timer = null;

  function ensureHost() {
    if (host && document.contains(host)) return host.shadowRoot;
    host = document.createElement('div');
    host.id = 'audaz-connect-host';
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        .t{font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#101c3f;color:#f4f0e4;
           border:1px solid #f0a83a;border-radius:10px;padding:10px 14px;max-width:320px;box-shadow:0 8px 24px rgba(0,0,0,.3)}
        .h{font-weight:800;letter-spacing:.08em;color:#f0a83a;font-size:11px;margin-bottom:2px}
        .ok{color:#8fd19e}.warn{color:#ffd88a}.err{color:#ff9aa5}
      </style>
      <div class="t" role="status" aria-live="polite"><div class="h">AUDAZ CONNECT</div><div class="m"></div></div>`;
    (document.body || document.documentElement).appendChild(host);
    return root;
  }

  function toast(message, kind, ms) {
    const root = ensureHost();
    const m = root.querySelector('.m');
    m.textContent = message;
    m.className = 'm ' + (kind || '');
    host.style.display = '';
    clearTimeout(timer);
    timer = setTimeout(() => { if (host) host.style.display = 'none'; }, ms || 6000);
  }

  function highlight(elements) {
    elements.forEach((el) => {
      el.style.outline = '3px solid #f0a83a';
      el.style.outlineOffset = '2px';
      setTimeout(() => { el.style.outline = ''; el.style.outlineOffset = ''; }, 5000);
    });
    if (elements[0]) elements[0].scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  ns.pageUi = { toast, highlight };
})(self.AudazConnect);
