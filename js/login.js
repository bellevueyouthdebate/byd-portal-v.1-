/**
 * login.js - behavior for index.html (login + signup + forgot password)
 */
(function () {
  // Already logged in? Skip straight to the right dashboard.
  const existing = BYD.getUser();
  if (existing && BYD.getToken()) {
    window.location.href = BYD.homeFor(existing.role);
    return;
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get('expired')) BYD.toast('Your session expired. Please log in again.', 'error');

  // --- tabs ---
  document.querySelectorAll('#authTabs .tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('#authTabs .tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.tab-panel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    });
  });

  // --- log in ---
  document.getElementById('loginForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Logging in\u2026';
    try {
      const data = await BYD.call('login', {
        email: document.getElementById('loginEmail').value.trim(),
        password: document.getElementById('loginPassword').value
      });
      BYD.setSession(data.token, data.user);
      window.location.href = BYD.homeFor(data.user.role);
    } catch (err) {
      const msg = BYD.errorMessage(err);
      if (/incorrect password/i.test(msg)) {
        BYD.toast(msg + ' Forgot it? Use the link below to reset it.', 'error');
      } else {
        BYD.toast(msg, 'error');
      }
      btn.disabled = false; btn.textContent = original;
    }
  });

  // --- sign up ---
  document.getElementById('signupForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Creating account\u2026';
    try {
      const data = await BYD.call('signup', {
        name: document.getElementById('suName').value.trim(),
        email: document.getElementById('suEmail').value.trim(),
        password: document.getElementById('suPassword').value,
        signupCode: document.getElementById('suCode').value.trim()
      });
      BYD.setSession(data.token, data.user);
      window.location.href = BYD.homeFor(data.user.role);
    } catch (err) {
      BYD.toast(BYD.errorMessage(err), 'error');
      btn.disabled = false; btn.textContent = original;
    }
  });

  // --- forgot password ---
  document.getElementById('showForgot').addEventListener('click', function () {
    BYD.openModal(
      '<div class="modal-head"><h2>Reset your password</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
      '<p class="text-sm text-muted">Enter your account email. If it matches an account, we\'ll email you a reset link.</p>' +
      '<form id="forgotForm">' +
      '<div class="field"><label for="forgotEmail">Email</label><input type="email" id="forgotEmail" required></div>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" onclick="BYD.closeModal()">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">Send reset link</button></div>' +
      '</form>'
    );
    document.getElementById('forgotForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Sending\u2026';
      try {
        await BYD.call('forgotPassword', { email: document.getElementById('forgotEmail').value.trim() });
        BYD.closeModal();
        BYD.toast('If that email has an account, a reset link is on its way.', 'success');
      } catch (err) {
        BYD.toast(BYD.errorMessage(err), 'error');
        btn.disabled = false; btn.textContent = 'Send reset link';
      }
    });
  });
})();
