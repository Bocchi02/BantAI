/* Read only provider-owned, visible sender/header panels; never email HTML. */
(() => {
  "use strict";
  if (globalThis.BantAISenderAuthentication) return;
  const bodySelector = '.a3s,[data-testid="message-body"],[data-test-id="message-view-body"],[aria-label="Message body"],.allowTextSelection';
  const domain = value => {
    const text = String(value || '').trim().toLowerCase().replace(/\.$/, '');
    return text.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(text) ? text : null;
  };
  function parseDetails(text, sender, subject) {
    const from = text.match(/(?:^|\n)\s*from\s*:\s*([^\n]+)/i)?.[1] || '';
    const addresses = from.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
    if (addresses.length !== 1 || addresses[0].toLowerCase() !== sender.toLowerCase()) return {};
    if (text.match(/(?:^|\n)\s*subject\s*:\s*([^\n]+)/i)?.[1]?.trim() !== subject.trim()) return {};
    const result = {source: 'SENDER_DETAILS'};
    for (const [label, key] of [['mailed-by', 'mailed_by'], ['signed-by', 'signed_by']]) {
      const value = domain(text.match(new RegExp('(?:^|\\n)\\s*' + label + '\\s*:\\s*([^\\s]+)', 'i'))?.[1]);
      if (value) result[key] = value;
    }
    return Object.keys(result).length > 1 ? result : {};
  }
  function parseHeaders(text, sender, subject, provider) {
    if (!['outlook', 'yahoo'].includes(provider)) return {};
    // Never read body lines as headers, including forged Authentication-Results.
    const header = text.slice(0, 65536).split(/\r?\n\r?\n/, 1)[0].replace(/\r?\n[ \t]+/g, ' ');
    const from = header.match(/^From:\s*(.+)$/im)?.[1] || '';
    const addresses = from.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
    const headerSubject = header.match(/^Subject:\s*(.*)$/im)?.[1]?.trim();
    if (addresses.length !== 1 || addresses[0].toLowerCase() !== sender.toLowerCase() || headerSubject !== subject.trim()) return {};
    const results = [...header.matchAll(/^Authentication-Results:\s*(.+)$/gim)];
    // Only receiver-reported results; ignore ARC and sender-authored lower entries.
    const receiver = provider === 'outlook' ? /^(?:(?:[\w.-]+\.)?(?:outlook\.com|protection\.outlook\.com|office365\.com)\s*;|spf=)/i : /^(?:[\w.-]+\.)?yahoo\.com\s*;/i;
    const report = results[0] && receiver.test(results[0][1]) ? results[0][1] : null;
    if (!report) return {};
    const output = {source: 'MESSAGE_HEADERS'};
    for (const method of ['spf', 'dkim', 'dmarc']) {
      const clause = report.split(';').find(value => new RegExp('\\b' + method + '=').test(value));
      const status = clause?.match(new RegExp('\\b' + method + '=(pass|fail|softfail|neutral|none|temperror|permerror)\\b', 'i'))?.[1];
      if (!status) continue;
      output[method] = status.toLowerCase();
      const property = method === 'spf' ? 'smtp.mailfrom' : method === 'dkim' ? 'header.d' : 'header.from';
      const identity = clause.match(new RegExp(property.replace('.', '\\.') + '=([^\\s;()]+)', 'i'))?.[1];
      const value = domain(identity?.split('@').pop());
      if (value) output[method + '_domain'] = value;
    }
    return Object.keys(output).length > 1 ? output : {};
  }
  const observations = new Map();
  async function observationKey(url, provider, sender, subject, body) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([url, provider, sender, subject, body])));
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }
  async function collect(provider, sender, subject, body = '') {
    if (!sender || !['gmail', 'outlook', 'yahoo'].includes(provider)) return {};
    // This key is kept only in the content-script lifetime, never storage/logs.
    const originalUrl = location.href;
    const key = await observationKey(originalUrl, provider, sender, subject, body);
    if (location.href !== originalUrl) return {};
    const selectors = provider === 'gmail' ? '.ajA,[role="dialog"]' : '[role="dialog"],textarea[aria-label*="header" i],textarea[aria-label*="message details" i]';
    let found = {};
    for (const panel of document.querySelectorAll(selectors)) {
      if (panel.closest(bodySelector) || panel.querySelector(bodySelector) || !panel.getClientRects().length) continue;
      let text;
      if (provider === 'gmail') {
        text = [...panel.querySelectorAll('tr')].map(row => [...row.querySelectorAll('td,th')].map(cell => cell.innerText.trim()).join(' ')).join('\n') || panel.innerText;
        found = parseDetails(text || '', sender, subject);
      } else {
        const label = `${panel.getAttribute('aria-label') || ''} ${panel.querySelector('[role="heading"],h1,h2,h3')?.textContent || ''}`;
        if (!/message details|internet headers|raw message|full headers/i.test(label)) continue;
        const raw = panel.matches('textarea') ? panel : panel.querySelector('textarea,pre,[role="textbox"]');
        text = raw?.value || raw?.innerText || '';
        found = parseHeaders(text, sender, subject, provider);
      }
      if (Object.keys(found).length) break;
    }
    const now = Date.now();
    for (const [id, entry] of observations) if (now - entry.time > 300000) observations.delete(id);
    if (Object.keys(found).length) {
      observations.set(key, {value: found, time: now});
      if (observations.size > 20) observations.delete(observations.keys().next().value);
    }
    return found.source ? found : observations.get(key)?.value || {};
  }
  async function attach(result) {
    const payload = result.nlp_payload;
    if (payload) payload.sender_authentication = await collect(payload.provider, result.sender_email || payload.sender || '', payload.subject || '', payload.body || '');
    return JSON.stringify(payload?.sender_authentication || {});
  }
  globalThis.BantAISenderAuthentication = {collect, attach, parseDetails, parseHeaders};
  // Yahoo may open View Raw Message in a separate provider-owned tab. The
  // worker correlates it with the still-open email in its opener before use.
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
    chrome.runtime.onMessage.addListener((message, _sender, respond) => {
      if (message?.type === 'BANTAI_GET_SENDER_AUTHENTICATION') {
        const payload = message.payload || {};
        void collect(payload.provider, payload.sender || '', payload.subject || '', payload.body || '').then(respond).catch(() => respond({}));
        return true;
      }
      if (message?.type !== 'BANTAI_REMEMBER_SENDER_AUTHENTICATION') return false;
      const payload = message.payload || {};
      const url = location.href;
      if (url !== message.url) { respond(false); return false; }
      void observationKey(url, payload.provider, payload.sender, payload.subject, payload.body).then(key => {
        if (location.href !== url) { respond(false); return; }
        observations.set(key, {value: payload.sender_authentication || {}, time: Date.now()});
        if (observations.size > 20) observations.delete(observations.keys().next().value);
        respond(true);
      });
      return true;
    });
    const raw = document.body?.children.length === 1 && document.body.firstElementChild?.tagName === 'PRE'
      ? document.body.firstElementChild : null;
    if (location.hostname === 'mail.yahoo.com' && raw) {
      const text = raw.innerText.slice(0, 65536).split(/\r?\n\r?\n/, 1)[0];
      const unfolded = text.replace(/\r?\n[ \t]+/g, ' ');
      const from = unfolded.match(/^From:\s*(.+)$/im)?.[1] || '';
      const addresses = from.match(/[\w.+%-]+@[\w.-]+\.[a-z]{2,}/gi) || [];
      const subject = unfolded.match(/^Subject:\s*(.*)$/im)?.[1]?.trim();
      if (addresses.length === 1 && subject) {
        const authentication = parseHeaders(text, addresses[0], subject, 'yahoo');
        if (authentication.source) void chrome.runtime.sendMessage({
          type: 'BANTAI_RAW_SENDER_AUTHENTICATION',
          sender_address: addresses[0], subject, authentication
        }).catch(() => {});
      }
    }
  }
})();
