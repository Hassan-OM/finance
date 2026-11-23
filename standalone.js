/* Hassan Finance — standalone runtime: Supabase storage, login, SMS inbox.
   Provides window.claude.use(...) with the same db API the app already uses. */
(function () {
  'use strict';
  window.HF_STANDALONE = true;
  const LS = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { } },
  };
  const cfgFile = window.HF_CONFIG || {};
  let cfg = { url: cfgFile.url || LS.get('hf-sb-url') || '', key: cfgFile.anonKey || LS.get('hf-sb-key') || '' };
  const ar = () => (LS.get('hf-lang') || 'en') === 'ar';
  const T = (en, a) => (ar() ? a : en);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------- gate UI (setup + login) ---------- */
  function gate(html) {
    let g = document.getElementById('gate');
    if (!g) { g = document.createElement('div'); g.id = 'gate'; document.body.appendChild(g); }
    g.innerHTML = `<div class="gate-card"><div class="brand" style="padding:0 0 14px"><div class="brand-mark" aria-hidden="true">ح</div><div><b>${T('Hassan Finance', 'مالية حسن')}</b><small>${T('Budget & subscriptions', 'الميزانية والاشتراكات')}</small></div></div>${html}</div>`;
    g.hidden = false; return g;
  }
  function closeGate() { const g = document.getElementById('gate'); if (g) g.hidden = true; }

  function askConfig() {
    return new Promise(res => {
      const g = gate(`<h2 style="margin-bottom:6px">${T('Connect your database', 'اربط قاعدة بياناتك')}</h2>
        <p class="gate-p">${T('Paste the two values from Supabase → Project Settings → API Keys. You only do this once on each device.', 'الصق القيمتين من Supabase ← Project Settings ← API Keys. مرة واحدة فقط لكل جهاز.')}</p>
        <form id="cfgForm" class="form" style="grid-template-columns:1fr">
          <label class="f">${T('Project URL', 'رابط المشروع')}<input class="inp" id="cfg-url" required placeholder="https://xxxx.supabase.co" value="${esc(cfg.url)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          <label class="f">${T('Publishable key (sb_publishable_…)', 'المفتاح العام (sb_publishable_…)')}<input class="inp" id="cfg-key" required value="${esc(cfg.key)}" autocapitalize="off" autocomplete="off" spellcheck="false"></label>
          <button class="btn primary" type="submit">${T('Continue', 'متابعة')}</button></form>`);
      g.querySelector('#cfgForm').addEventListener('submit', e => {
        e.preventDefault();
        cfg = { url: g.querySelector('#cfg-url').value.trim().replace(/\/+$/, ''), key: g.querySelector('#cfg-key').value.trim() };
        LS.set('hf-sb-url', cfg.url); LS.set('hf-sb-key', cfg.key); res();
      });
    });
  }

  function askLogin(sb, msg) {
    return new Promise(res => {
      let mode = 'in';
      const draw = (note) => {
        const g = gate(`<h2 style="margin-bottom:6px">${mode === 'in' ? T('Sign in', 'تسجيل الدخول') : T('Create your account', 'أنشئ حسابك')}</h2>
          ${note ? `<div class="banner ${note.bad ? 'bad' : 'info'}" style="margin:8px 0">${esc(note.text)}</div>` : ''}
          <form id="loginForm" class="form" style="grid-template-columns:1fr">
            <label class="f">${T('Email', 'البريد الإلكتروني')}<input class="inp" id="lg-email" type="email" required autocomplete="email" autocapitalize="off"></label>
            <label class="f">${T('Password', 'كلمة المرور')}<input class="inp" id="lg-pass" type="password" required minlength="8" autocomplete="${mode === 'in' ? 'current-password' : 'new-password'}"></label>
            <button class="btn primary" type="submit">${mode === 'in' ? T('Sign in', 'دخول') : T('Create account', 'إنشاء الحساب')}</button></form>
          <div class="btns" style="margin-top:12px;justify-content:space-between">
            <button class="btn ghost sm" id="lg-switch">${mode === 'in' ? T('First time? Create account', 'أول مرة؟ أنشئ حسابًا') : T('Have an account? Sign in', 'لديك حساب؟ سجّل الدخول')}</button>
            <button class="btn ghost sm" id="lg-cfg">${T('Change database', 'تغيير قاعدة البيانات')}</button></div>`);
        g.querySelector('#lg-switch').onclick = () => { mode = mode === 'in' ? 'up' : 'in'; draw(); };
        g.querySelector('#lg-cfg').onclick = () => { LS.del('hf-sb-url'); LS.del('hf-sb-key'); location.reload(); };
        g.querySelector('#loginForm').addEventListener('submit', async e => {
          e.preventDefault();
          const email = g.querySelector('#lg-email').value.trim(), password = g.querySelector('#lg-pass').value;
          const btn = g.querySelector('button[type=submit]'); btn.disabled = true;
          try {
            const r = mode === 'in' ? await sb.auth.signInWithPassword({ email, password }) : await sb.auth.signUp({ email, password });
            if (r.error) throw r.error;
            if (r.data && r.data.session) return res(r.data.session);
            mode = 'in'; draw({ text: T('Account created. If Supabase sent you a confirmation email, open it first, then sign in.', 'تم إنشاء الحساب. إن وصلك بريد تأكيد من Supabase افتحه أولًا ثم سجّل الدخول.') });
          } catch (err) { btn.disabled = false; draw({ bad: true, text: (err && err.message) || T('Sign-in failed.', 'تعذّر الدخول.') }); }
        });
      };
      draw(msg);
    });
  }

  /* ---------- database adapter ---------- */
  let sb = null, uid = null, fresh = false;
  const cache = {}; const listeners = {};
  const cacheKey = () => 'hf-cache-' + uid;
  const colMap = c => (cache[c] || (cache[c] = new Map()));
  function snap(c) {
    const docs = [...colMap(c).entries()].map(([id, d]) => ({ id, exists: true, data: () => d, metadata: { fromCache: !fresh, hasPendingWrites: false } }));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache: !fresh, hasPendingWrites: false } };
  }
  function notify(c) { (listeners[c] || []).forEach(fn => { try { fn(snap(c)); } catch (e) { console.error(e); } }); }
  function notifyAll() { Object.keys(listeners).forEach(notify); }
  function persistCache() {
    const o = {}; for (const [c, m] of Object.entries(cache)) o[c] = Object.fromEntries(m);
    try { LS.set(cacheKey(), JSON.stringify(o)); } catch (e) { }
  }
  function loadCache() {
    try { const o = JSON.parse(LS.get(cacheKey()) || '{}'); for (const [c, docs] of Object.entries(o)) cache[c] = new Map(Object.entries(docs)); } catch (e) { }
  }
  async function loadAll() {
    const rows = []; let from = 0;
    while (true) {
      const { data, error } = await sb.from('docs').select('col,id,data').order('col').order('id').range(from, from + 999);
      if (error) throw error;
      rows.push(...data); if (data.length < 1000) break; from += 1000;
    }
    for (const k of Object.keys(cache)) cache[k] = new Map();
    for (const r of rows) colMap(r.col).set(r.id, r.data);
    fresh = true; persistCache(); notifyAll();
  }
  const wrapErr = e => ({ code: 'unavailable', message: (e && e.message) || 'Network error' });
  const db = {
    collection(c) {
      return {
        path: c,
        onSnapshot(next, err) { (listeners[c] = listeners[c] || []).push(next); if (cache[c] || fresh) setTimeout(() => next(snap(c)), 0); return () => { listeners[c] = (listeners[c] || []).filter(f => f !== next); }; },
        async get() { return snap(c); },
        doc(id) {
          id = id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
          return {
            id, path: c + '/' + id,
            async get() { const d = colMap(c).get(id); return { id, exists: !!d, data: () => d, metadata: { fromCache: !fresh } }; },
            async set(data) {
              const prev = colMap(c).get(id); colMap(c).set(id, data); notify(c);
              const { error } = await sb.from('docs').upsert({ user_id: uid, col: c, id, data, updated_at: new Date().toISOString() });
              if (error) { if (prev === undefined) colMap(c).delete(id); else colMap(c).set(id, prev); notify(c); throw wrapErr(error); }
              persistCache();
            },
            async update(data) { const cur = colMap(c).get(id) || {}; return this.set({ ...cur, ...data }); },
            async delete() {
              const prev = colMap(c).get(id); colMap(c).delete(id); notify(c);
              const { error } = await sb.from('docs').delete().match({ user_id: uid, col: c, id });
              if (error) { if (prev !== undefined) colMap(c).set(id, prev); notify(c); throw wrapErr(error); }
              persistCache();
            },
          };
        },
      };
    },
    doc(path) { const [c, id] = path.split('/'); return db.collection(c).doc(id); },
  };

  /* ---------- SMS inbox (filled by the iPhone Shortcut) ---------- */
  let inboxBusy = false;
  async function processInbox() {
    if (inboxBusy || !window.HF_importSms) return; inboxBusy = true;
    try {
      const { data, error } = await sb.from('sms_inbox').select('id,body,received_at').order('id').limit(200);
      if (error || !data || !data.length) return;
      await window.HF_importSms(data.map(r => ({ body: r.body, at: r.received_at })));
      await sb.from('sms_inbox').delete().in('id', data.map(r => r.id));
    } catch (e) { console.warn('inbox', e); } finally { inboxBusy = false; }
  }

  /* ---------- public helpers used by the app ---------- */
  function randomKey() { const a = new Uint8Array(24); crypto.getRandomValues(a); return Array.from(a, b => b.toString(16).padStart(2, '0')).join(''); }
  window.HF = {
    config: () => ({ url: cfg.url, key: cfg.key }),
    async smsKey(regenerate) {
      if (!regenerate) { const { data } = await sb.from('sms_keys').select('key').maybeSingle(); if (data && data.key) return data.key; }
      const key = randomKey(); const { error } = await sb.from('sms_keys').upsert({ user_id: uid, key }); if (error) throw error; return key;
    },
    async exportAll() {
      await loadAll(); const out = { app: 'hassan-finance', version: 1, exportedAt: new Date().toISOString(), collections: {} };
      for (const [c, m] of Object.entries(cache)) out.collections[c] = Object.fromEntries(m);
      return out;
    },
    async importAll(json) {
      const cols = (json && json.collections) || {}; const rows = [];
      for (const [c, docs] of Object.entries(cols)) for (const [id, data] of Object.entries(docs || {})) if (data && typeof data === 'object') rows.push({ user_id: uid, col: c, id, data, updated_at: new Date().toISOString() });
      for (let i = 0; i < rows.length; i += 400) { const { error } = await sb.from('docs').upsert(rows.slice(i, i + 400)); if (error) throw error; }
      await loadAll(); return rows.length;
    },
    async signOut() { await sb.auth.signOut(); LS.del(cacheKey()); location.reload(); },
    refresh: () => loadAll().then(processInbox).catch(() => { }),
    email: () => (window.HF._email || ''),
  };

  /* ---------- boot ---------- */
  let dbReady; const dbPromise = new Promise(r => (dbReady = r));
  window.claude = {
    use(name) {
      if (name === 'db') return dbPromise;
      if (name === 'user') return Promise.resolve({ isOwner: () => true, canEdit: () => true, can: () => true, id: async () => uid });
      return Promise.resolve(null);
    },
  };

  async function start() {
    if (!window.supabase || !window.supabase.createClient) { gate(`<p>${T('Could not load the app files. Check your connection and reopen.', 'تعذّر تحميل ملفات التطبيق. تحقق من الاتصال وأعد الفتح.')}</p>`); return; }
    if (!cfg.url || !cfg.key) await askConfig();
    try { sb = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'hf-auth' } }); }
    catch (e) { LS.del('hf-sb-url'); LS.del('hf-sb-key'); cfg = { url: '', key: '' }; await askConfig(); return start(); }
    let session = null;
    try { const { data } = await sb.auth.getSession(); session = data.session; } catch (e) { }
    if (!session) session = await askLogin(sb);
    uid = session.user.id; window.HF._email = session.user.email || '';
    closeGate();
    loadCache();
    dbReady(db);
    try { await loadAll(); } catch (e) { console.warn('load', e); }
    processInbox();
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') window.HF.refresh(); });
    setInterval(() => { if (document.visibilityState === 'visible') window.HF.refresh(); }, 60000);
    sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.reload(); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();

  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => { });
})();
