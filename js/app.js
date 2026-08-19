/**
 * app.js
 * Shared utilities for every page: talking to the Apps Script API, session
 * storage, toasts, a tiny modal helper, and formatting helpers.
 * Exposes a single global: BYD
 */
const BYD = (function () {
  const TOKEN_KEY = 'byd_token';
  const USER_KEY = 'byd_user';

  function getToken() { return localStorage.getItem(TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch (e) { return null; }
  }
  function setSession(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  function clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }

  /** Calls the Apps Script backend. Throws with a human-readable message on failure. */
  async function call(action, payload) {
    const apiUrl = window.BYD_CONFIG && window.BYD_CONFIG.API_URL;
    if (!apiUrl || apiUrl.indexOf('PASTE_YOUR') === 0) {
      throw new Error('The app is not connected to a backend yet - set API_URL in js/config.js.');
    }
    let res;
    try {
      res = await fetch(apiUrl, {
        method: 'POST',
        // text/plain deliberately avoids a CORS preflight request, which
        // Apps Script web apps do not handle.
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: action, token: getToken(), payload: payload || {} })
      });
    } catch (networkErr) {
      throw new Error('Could not reach the server. Check your connection and the API URL in js/config.js.');
    }
    let json;
    try { json = await res.json(); }
    catch (parseErr) { throw new Error('Unexpected response from the server (' + res.status + ').'); }

    if (!json.success) {
      if (/session has expired/i.test(json.error || '')) {
        clearSession();
        window.location.href = 'index.html?expired=1';
      }
      throw new Error(json.error || 'Something went wrong.');
    }
    return json.data;
  }

  function homeFor(role) {
    if (role === 'admin') return 'admin.html';
    if (role === 'coach') return 'coach.html';
    return 'student.html';
  }

  /** Put at the top of every protected page. Redirects if not logged in / wrong role. */
  function guard(allowedRoles) {
    const user = getUser();
    if (!getToken() || !user) { window.location.href = 'index.html'; return null; }
    if (allowedRoles && allowedRoles.indexOf(user.role) === -1) {
      window.location.href = homeFor(user.role);
      return null;
    }
    fillUserChrome(user);
    initMobileNav();
    initLogout();
    return user;
  }

  function fillUserChrome(user) {
    document.querySelectorAll('[data-user-name]').forEach(function (el) { el.textContent = user.name; });
    document.querySelectorAll('[data-user-email]').forEach(function (el) { el.textContent = user.email; });
    document.querySelectorAll('[data-user-group]').forEach(function (el) { el.textContent = user.group; });
    document.querySelectorAll('[data-user-role]').forEach(function (el) { el.textContent = user.role; });
  }

  function initMobileNav() {
    const btn = document.querySelector('.menu-toggle');
    const sidebar = document.querySelector('.sidebar');
    if (!btn || !sidebar) return;
    btn.addEventListener('click', function () { sidebar.classList.toggle('open'); });
    document.addEventListener('click', function (e) {
      if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && !btn.contains(e.target)) {
        sidebar.classList.remove('open');
      }
    });
  }

  function initLogout() {
    document.querySelectorAll('[data-logout]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        clearSession();
        window.location.href = 'index.html';
      });
    });
  }

  function toast(message, type) {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    stack.appendChild(el);
    const duration = Math.max(4200, Math.min(8000, message.length * 70));
    setTimeout(function () { el.remove(); }, duration);
  }

  function openModal(innerHtml) {
    closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'bydModalOverlay';
    overlay.innerHTML = '<div class="modal">' + innerHtml + '</div>';
    overlay.addEventListener('click', function (e) { if (e.target === overlay) closeModal(); });
    document.body.appendChild(overlay);
    document.addEventListener('keydown', escCloseHandler_);
    return overlay;
  }
  function closeModal() {
    const el = document.getElementById('bydModalOverlay');
    if (el) el.remove();
    document.removeEventListener('keydown', escCloseHandler_);
  }
  function escCloseHandler_(e) { if (e.key === 'Escape') closeModal(); }

  function fmtDate(iso) {
    if (!iso) return '\u2014';
    const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function fmtTime(t) {
    if (!t) return '';
    const parts = String(t).split(':');
    const h = Number(parts[0]), m = Number(parts[1]);
    if (isNaN(h)) return t;
    const period = h >= 12 ? 'PM' : 'AM';
    const hour = ((h + 11) % 12) + 1;
    return hour + ':' + String(m || 0).padStart(2, '0') + ' ' + period;
  }

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).map(function (p) { return p[0]; }).slice(0, 2).join('').toUpperCase();
  }

  const EYE_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z"/><circle cx="12" cy="12" r="3"/></svg>';
  const EYE_OFF_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a21.6 21.6 0 0 1 5.06-6.06M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a21.6 21.6 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

  /** Wraps every password field on the page with a show/hide eye button. Runs once, automatically. */
  function initPasswordToggles() {
    document.querySelectorAll('input[type="password"]').forEach(function (input) {
      if (input.dataset.toggled) return;
      input.dataset.toggled = '1';
      const wrap = document.createElement('div');
      wrap.className = 'password-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'password-toggle';
      btn.setAttribute('aria-label', 'Show password');
      btn.innerHTML = EYE_ICON;
      wrap.appendChild(btn);
      btn.addEventListener('click', function () {
        const showing = input.type === 'text';
        input.type = showing ? 'password' : 'text';
        btn.innerHTML = showing ? EYE_ICON : EYE_OFF_ICON;
        btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
      });
    });
  }
  initPasswordToggles();

  function errorMessage(err) {
    return (err && err.message) ? err.message : 'Something went wrong.';
  }

  /** Wires up sidebar [data-view] links to show/hide matching #view-* panels. */
  function initViewNav(defaultView) {
    const links = document.querySelectorAll('.nav-link[data-view]');
    function show(view) {
      links.forEach(function (l) { l.classList.toggle('active', l.dataset.view === view); });
      document.querySelectorAll('.view-panel').forEach(function (p) {
        p.classList.toggle('active', p.id === 'view-' + view);
      });
      document.querySelector('.sidebar').classList.remove('open');
      window.scrollTo(0, 0);
      document.dispatchEvent(new CustomEvent('byd:view', { detail: { view: view } }));
    }
    links.forEach(function (link) {
      link.addEventListener('click', function () { show(link.dataset.view); });
    });
    show((location.hash || '').replace('#', '') || defaultView);
  }

  return {
    getToken, getUser, setSession, clearSession, call, guard, homeFor, fillUserChrome,
    toast, openModal, closeModal, fmtDate, fmtTime, todayIso, escapeHtml, initials, errorMessage,
    initViewNav
  };
})();
