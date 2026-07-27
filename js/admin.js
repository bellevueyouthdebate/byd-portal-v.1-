/**
 * admin.js - data loading and rendering for admin.html
 */
(async function () {
  const user = BYD.guard(['admin']);
  if (!user) return;
  BYD.initViewNav('home');

  let staff = [], students = [], groups = [];

  async function loadAll() {
    try {
      [staff, students, groups] = await Promise.all([
        BYD.call('getStaff', {}), BYD.call('getStudents', {}), BYD.call('getGroups', {})
      ]);
      renderHome();
      renderStaff();
      await loadSettings();
    } catch (err) {
      BYD.toast(BYD.errorMessage(err), 'error');
    }
  }

  function renderHome() {
    document.getElementById('statStaff').textContent = staff.length;
    document.getElementById('statStudents').textContent = students.length;
    document.getElementById('statGroups').textContent = groups.filter(function (g) { return g.GroupName !== 'Unassigned'; }).length;
  }

  // -------------------------------------------------------- generic modal
  function fieldHtml(f) {
    const val = f.value != null ? f.value : '';
    if (f.type === 'select') {
      const opts = f.options.map(function (o) {
        return '<option value="' + BYD.escapeHtml(o.value) + '"' + (o.value === val ? ' selected' : '') + '>' + BYD.escapeHtml(o.label) + '</option>';
      }).join('');
      return '<div class="field"><label for="' + f.id + '">' + f.label + '</label><select id="' + f.id + '"' + (f.required ? ' required' : '') + '>' + opts + '</select></div>';
    }
    return '<div class="field"><label for="' + f.id + '">' + f.label + '</label><input type="' + (f.type || 'text') + '" id="' + f.id + '" value="' + BYD.escapeHtml(val) + '"' + (f.required ? ' required' : '') + '></div>';
  }

  function openFormModal(opts) {
    const fieldsHtml = opts.fields.map(fieldHtml).join('');
    BYD.openModal(
      '<div class="modal-head"><h2>' + opts.title + '</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
      '<form id="modalForm">' + fieldsHtml +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="BYD.closeModal()">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (opts.submitLabel || 'Save') + '</button>' +
      '</div></form>'
    );
    document.getElementById('modalForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const values = {};
      opts.fields.forEach(function (f) { values[f.id] = document.getElementById(f.id).value; });
      const btn = e.target.querySelector('button[type=submit]');
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      try {
        await opts.onSubmit(values);
        BYD.closeModal();
      } catch (err) {
        BYD.toast(BYD.errorMessage(err), 'error');
        btn.disabled = false; btn.textContent = original;
      }
    });
  }

  function confirmAction(message, confirmLabel, onConfirm) {
    BYD.openModal(
      '<div class="modal-head"><h2>Are you sure?</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
      '<p class="text-sm text-muted">' + message + '</p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="confirmCancel">Cancel</button>' +
      '<button type="button" class="btn btn-danger" id="confirmOk">' + confirmLabel + '</button></div>'
    );
    document.getElementById('confirmCancel').addEventListener('click', function () { BYD.closeModal(); });
    document.getElementById('confirmOk').addEventListener('click', async function () {
      try { await onConfirm(); BYD.closeModal(); } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
    });
  }

  // --------------------------------------------------------------- staff
  function renderStaff() {
    document.getElementById('staffTableBody').innerHTML = staff.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (s) {
      const isSelf = s.email === user.email;
      return '<tr><td>' + BYD.escapeHtml(s.name) + (isSelf ? ' <span class="text-muted text-sm">(you)</span>' : '') + '</td>' +
        '<td class="font-mono text-sm">' + BYD.escapeHtml(s.email) + '</td>' +
        '<td>' + roleSelect(s, isSelf) + '</td>' +
        '<td>' + (s.active ? '<span class="badge badge-present">Active</span>' : '<span class="badge badge-absent">Inactive</span>') + '</td>' +
        '<td class="table-actions">' +
        '<button class="btn btn-ghost btn-sm" data-reset-pw="' + BYD.escapeHtml(s.email) + '">Reset password</button>' +
        (isSelf ? '' : '<button class="btn btn-ghost btn-sm" data-toggle-active="' + BYD.escapeHtml(s.email) + '" data-active="' + s.active + '">' + (s.active ? 'Deactivate' : 'Reactivate') + '</button>') +
        '</td></tr>';
    }).join('');

    function roleSelect(s, isSelf) {
      if (isSelf) return '<span class="badge badge-role">' + s.role + '</span>';
      return '<select data-role-select="' + BYD.escapeHtml(s.email) + '">' +
        ['coach', 'admin'].map(function (r) { return '<option value="' + r + '"' + (r === s.role ? ' selected' : '') + '>' + r + '</option>'; }).join('') +
        '</select>';
    }

    document.querySelectorAll('[data-role-select]').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        try {
          await BYD.call('updateUserRole', { email: sel.dataset.roleSelect, role: sel.value });
          BYD.toast('Role updated.', 'success');
          staff = await BYD.call('getStaff', {});
          renderStaff(); renderHome();
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); renderStaff(); }
      });
    });
    document.querySelectorAll('[data-reset-pw]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        try {
          const data = await BYD.call('resetUserPassword', { email: btn.dataset.resetPw });
          BYD.openModal(
            '<div class="modal-head"><h2>Password reset</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
            '<p class="text-sm">Give this temporary password to <b>' + BYD.escapeHtml(btn.dataset.resetPw) + '</b>. They should change it after logging in.</p>' +
            '<p class="font-mono" style="font-size:18px; background:var(--paper); padding:10px 14px; border-radius:6px;">' + BYD.escapeHtml(data.tempPassword) + '</p>' +
            '<div class="modal-actions"><button type="button" class="btn btn-primary" onclick="BYD.closeModal()">Done</button></div>'
          );
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
      });
    });
    document.querySelectorAll('[data-toggle-active]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const goingActive = btn.dataset.active !== 'true';
        const action = async function () {
          await BYD.call('setUserActive', { email: btn.dataset.toggleActive, active: goingActive });
          BYD.toast(goingActive ? 'Account reactivated.' : 'Account deactivated.', 'success');
          staff = await BYD.call('getStaff', {});
          renderStaff();
        };
        if (goingActive) { action(); }
        else confirmAction('Deactivate ' + btn.dataset.toggleActive + '? They will not be able to log in.', 'Deactivate', action);
      });
    });
  }

  document.getElementById('addStaffBtn').addEventListener('click', function () {
    openFormModal({
      title: 'Add staff account', submitLabel: 'Create account',
      fields: [
        { id: 'name', label: 'Full name', required: true },
        { id: 'email', label: 'Email', type: 'email', required: true },
        { id: 'role', label: 'Role', type: 'select', required: true, value: 'coach', options: [{ value: 'coach', label: 'Coach' }, { value: 'admin', label: 'Admin' }] }
      ],
      onSubmit: async function (v) {
        const data = await BYD.call('createStaff', v);
        staff = await BYD.call('getStaff', {});
        renderStaff(); renderHome();
        BYD.openModal(
          '<div class="modal-head"><h2>Account created</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
          '<p class="text-sm">Give this temporary password to <b>' + BYD.escapeHtml(data.email) + '</b>. They should change it after logging in.</p>' +
          '<p class="font-mono" style="font-size:18px; background:var(--paper); padding:10px 14px; border-radius:6px;">' + BYD.escapeHtml(data.tempPassword) + '</p>' +
          '<div class="modal-actions"><button type="button" class="btn btn-primary" onclick="BYD.closeModal()">Done</button></div>'
        );
      }
    });
  });

  // ------------------------------------------------------------ settings
  async function loadSettings() {
    const settings = await BYD.call('getSettings', {});
    const map = {};
    settings.forEach(function (s) { map[s.Key] = s.Value; });
    document.getElementById('signupCode').value = map.SignupCode || '';
    document.getElementById('appUrl').value = map.AppUrl || '';
  }

  document.getElementById('settingsForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Saving\u2026';
    try {
      await BYD.call('updateSettings', {
        settings: {
          SignupCode: document.getElementById('signupCode').value.trim(),
          AppUrl: document.getElementById('appUrl').value.trim()
        }
      });
      BYD.toast('Settings saved.', 'success');
    } catch (err) {
      BYD.toast(BYD.errorMessage(err), 'error');
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  // ---------------------------------------------------------- account
  document.getElementById('pwForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type=submit]');
    const original = btn.textContent;
    btn.disabled = true; btn.textContent = 'Updating\u2026';
    try {
      await BYD.call('changePassword', {
        currentPassword: document.getElementById('curPw').value,
        newPassword: document.getElementById('newPw').value
      });
      BYD.toast('Password updated.', 'success');
      e.target.reset();
    } catch (err) {
      BYD.toast(BYD.errorMessage(err), 'error');
    } finally {
      btn.disabled = false; btn.textContent = original;
    }
  });

  loadAll();
})();
