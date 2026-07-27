/**
 * coach.js - data loading and rendering for coach.html
 * (Also used by admins, who see an extra "Admin Console" link.)
 */
(async function () {
  const user = BYD.guard(['coach', 'admin']);
  if (!user) return;
  BYD.initViewNav('home');
  if (user.role === 'admin') document.getElementById('adminConsoleLink').classList.remove('hidden');

  let groups = [], students = [], homework = [], schedule = [], rounds = [], pairings = [], seasons = [];
  let hwFilter = 'All', schFilter = 'All', roundFilter = 'All';

  async function loadAll() {
    try {
      [groups, students, homework, schedule, rounds, seasons] = await Promise.all([
        BYD.call('getGroups', {}), BYD.call('getStudents', {}), BYD.call('getHomework', {}),
        BYD.call('getSchedule', {}), BYD.call('getRounds', {}), BYD.call('getSeasons', {})
      ]);
      pairings = await BYD.call('getPairings', {});
      renderHome();
      renderHomework();
      renderSchedule();
      renderRounds();
      renderRoster();
      renderSeasons();
      initAttendanceControls();
      initCheckinPanel();
    } catch (err) {
      BYD.toast(BYD.errorMessage(err), 'error');
    }
  }

  function statusBadge(status) {
    const cls = status === 'Present' ? 'badge-present' : status === 'Absent' ? 'badge-absent' : status === 'Excused' ? 'badge-excused' : 'badge-unmarked';
    return '<span class="badge ' + cls + '">' + status + '</span>';
  }

  function nonUnassignedGroups() { return groups.filter(function (g) { return g.GroupName !== 'Unassigned'; }); }

  function renderChips(containerId, current, onSelect) {
    const el = document.getElementById(containerId);
    const opts = ['All'].concat(groups.map(function (g) { return g.GroupName; }));
    el.innerHTML = opts.map(function (g) {
      return '<button type="button" class="chip' + (g === current ? ' active' : '') + '" data-g="' + BYD.escapeHtml(g) + '">' + BYD.escapeHtml(g) + '</button>';
    }).join('');
    el.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () { onSelect(chip.dataset.g); });
    });
  }

  function confirmDelete(message, onConfirm) {
    BYD.openModal(
      '<div class="modal-head"><h2>Are you sure?</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
      '<p class="text-sm text-muted">' + message + '</p>' +
      '<div class="modal-actions"><button type="button" class="btn btn-ghost" id="confirmCancel">Cancel</button>' +
      '<button type="button" class="btn btn-danger" id="confirmOk">Delete</button></div>'
    );
    document.getElementById('confirmCancel').addEventListener('click', function () { BYD.closeModal(); });
    document.getElementById('confirmOk').addEventListener('click', async function () {
      try { await onConfirm(); BYD.closeModal(); } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
    });
  }

  // ------------------------------------------------------- generic modal
  function fieldHtml(f) {
    const val = f.value != null ? f.value : '';
    if (f.type === 'select') {
      const opts = f.options.map(function (o) {
        return '<option value="' + BYD.escapeHtml(o.value) + '"' + (o.value === val ? ' selected' : '') + '>' + BYD.escapeHtml(o.label) + '</option>';
      }).join('');
      return '<div class="field"><label for="' + f.id + '">' + f.label + '</label><select id="' + f.id + '"' + (f.required ? ' required' : '') + '>' + opts + '</select></div>';
    }
    if (f.type === 'textarea') {
      return '<div class="field"><label for="' + f.id + '">' + f.label + '</label><textarea id="' + f.id + '"' + (f.required ? ' required' : '') + '>' + BYD.escapeHtml(val) + '</textarea></div>';
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

  // ------------------------------------------------------------- home
  function renderHome() {
    document.getElementById('homeName').textContent = user.name.split(' ')[0];
    document.getElementById('statStudents').textContent = students.length;
    document.getElementById('statGroups').textContent = nonUnassignedGroups().length;

    const in7 = new Date(); in7.setDate(in7.getDate() + 7);
    const in7Iso = in7.toISOString().slice(0, 10);
    const upcoming = schedule.filter(function (s) { return s.Date >= BYD.todayIso() && s.Date <= in7Iso; });
    document.getElementById('statUpcoming').textContent = upcoming.length;

    const unassigned = students.filter(function (s) { return s.group === 'Unassigned'; });
    document.getElementById('unassignedList').innerHTML = unassigned.length
      ? unassigned.map(function (s) {
        return '<div class="flex justify-between items-center" style="padding:8px 0; border-bottom:1px solid var(--rule);">' +
          '<div>' + BYD.escapeHtml(s.name) + ' <span class="text-muted text-sm">' + BYD.escapeHtml(s.email) + '</span></div>' +
          '<button class="btn btn-ghost btn-sm" data-assign="' + BYD.escapeHtml(s.email) + '">Assign group</button></div>';
      }).join('')
      : '<p class="text-muted text-sm mb-0">Everyone has a group.</p>';
    document.getElementById('unassignedList').querySelectorAll('[data-assign]').forEach(function (btn) {
      btn.addEventListener('click', function () { promptAssignGroup(btn.dataset.assign); });
    });
  }

  function promptAssignGroup(email) {
    const student = students.find(function (s) { return s.email === email; });
    openFormModal({
      title: 'Assign group', submitLabel: 'Save',
      fields: [{ id: 'group', label: 'Group', type: 'select', required: true, value: student ? student.group : 'Unassigned',
        options: groups.map(function (g) { return { value: g.GroupName, label: g.GroupName }; }) }],
      onSubmit: async function (v) {
        await BYD.call('updateUserGroup', { email: email, group: v.group });
        BYD.toast('Group updated.', 'success');
        students = await BYD.call('getStudents', {});
        renderHome(); renderRoster();
      }
    });
  }

  // --------------------------------------------------------- homework
  function renderHomework() {
    renderChips('hwGroupFilter', hwFilter, function (g) { hwFilter = g; renderHomework(); });
    const rows = homework.filter(function (h) { return hwFilter === 'All' || h.Group === hwFilter; })
      .sort(function (a, b) { return String(a.DueDate).localeCompare(String(b.DueDate)); });
    document.getElementById('hwEmpty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('hwTableBody').innerHTML = rows.map(function (h) {
      return '<tr><td style="font-weight:600;">' + BYD.escapeHtml(h.Title) + '</td>' +
        '<td><span class="badge badge-role">' + BYD.escapeHtml(h.Group) + '</span></td>' +
        '<td class="text-sm">' + BYD.escapeHtml(h.Description) + '</td>' +
        '<td class="font-mono">' + BYD.fmtDate(h.DueDate) + '</td>' +
        '<td class="table-actions">' +
        '<button class="btn btn-ghost btn-sm" data-edit-hw="' + h.ID + '">Edit</button>' +
        '<button class="btn btn-danger btn-sm" data-del-hw="' + h.ID + '">Delete</button></td></tr>';
    }).join('');
    document.querySelectorAll('[data-edit-hw]').forEach(function (b) {
      b.addEventListener('click', function () { openHwModal(homework.find(function (h) { return h.ID === b.dataset.editHw; })); });
    });
    document.querySelectorAll('[data-del-hw]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDelete('Delete this homework?', async function () {
          await BYD.call('deleteHomework', { id: b.dataset.delHw });
          homework = await BYD.call('getHomework', {});
          renderHomework(); BYD.toast('Homework deleted.', 'success');
        });
      });
    });
  }

  function openHwModal(existing) {
    if (!nonUnassignedGroups().length) { BYD.toast('Create a group first (Roster & Groups).', 'error'); return; }
    openFormModal({
      title: existing ? 'Edit homework' : 'Add homework', submitLabel: existing ? 'Save changes' : 'Add homework',
      fields: [
        { id: 'group', label: 'Group', type: 'select', required: true, value: existing ? existing.Group : (hwFilter !== 'All' ? hwFilter : nonUnassignedGroups()[0].GroupName), options: nonUnassignedGroups().map(function (g) { return { value: g.GroupName, label: g.GroupName }; }) },
        { id: 'title', label: 'Title', required: true, value: existing ? existing.Title : '' },
        { id: 'description', label: 'Description', type: 'textarea', value: existing ? existing.Description : '' },
        { id: 'assignedDate', label: 'Assigned date', type: 'date', value: existing ? existing.AssignedDate : BYD.todayIso() },
        { id: 'dueDate', label: 'Due date', type: 'date', required: true, value: existing ? existing.DueDate : '' }
      ],
      onSubmit: async function (v) {
        if (existing) { await BYD.call('updateHomework', Object.assign({ id: existing.ID }, v)); BYD.toast('Homework updated.', 'success'); }
        else { await BYD.call('addHomework', v); BYD.toast('Homework added.', 'success'); }
        homework = await BYD.call('getHomework', {});
        renderHomework(); renderHome();
      }
    });
  }
  document.getElementById('addHwBtn').addEventListener('click', function () { openHwModal(null); });

  // --------------------------------------------------------- schedule
  function renderSchedule() {
    renderChips('schGroupFilter', schFilter, function (g) { schFilter = g; renderSchedule(); });
    const rows = schedule.filter(function (s) { return schFilter === 'All' || s.Group === schFilter; })
      .sort(function (a, b) { return (a.Date + a.StartTime).localeCompare(b.Date + b.StartTime); });
    document.getElementById('schEmpty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('schTableBody').innerHTML = rows.map(function (s) {
      return '<tr><td class="font-mono">' + BYD.fmtDate(s.Date) + '</td>' +
        '<td class="font-mono">' + BYD.fmtTime(s.StartTime) + (s.EndTime ? '\u2013' + BYD.fmtTime(s.EndTime) : '') + '</td>' +
        '<td><span class="badge badge-role">' + BYD.escapeHtml(s.Group) + '</span></td>' +
        '<td style="font-weight:600;">' + BYD.escapeHtml(s.Title) + '</td>' +
        '<td>' + BYD.escapeHtml(s.Location) + '</td>' +
        '<td class="table-actions">' +
        '<button class="btn btn-ghost btn-sm" data-edit-sch="' + s.ID + '">Edit</button>' +
        '<button class="btn btn-danger btn-sm" data-del-sch="' + s.ID + '">Delete</button></td></tr>';
    }).join('');
    document.querySelectorAll('[data-edit-sch]').forEach(function (b) {
      b.addEventListener('click', function () { openSchModal(schedule.find(function (s) { return s.ID === b.dataset.editSch; })); });
    });
    document.querySelectorAll('[data-del-sch]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDelete('Delete this session?', async function () {
          await BYD.call('deleteSchedule', { id: b.dataset.delSch });
          schedule = await BYD.call('getSchedule', {});
          renderSchedule(); BYD.toast('Session deleted.', 'success');
        });
      });
    });
  }

  function openSchModal(existing) {
    if (!nonUnassignedGroups().length) { BYD.toast('Create a group first (Roster & Groups).', 'error'); return; }
    openFormModal({
      title: existing ? 'Edit session' : 'Add session', submitLabel: existing ? 'Save changes' : 'Add session',
      fields: [
        { id: 'group', label: 'Group', type: 'select', required: true, value: existing ? existing.Group : (schFilter !== 'All' ? schFilter : nonUnassignedGroups()[0].GroupName), options: nonUnassignedGroups().map(function (g) { return { value: g.GroupName, label: g.GroupName }; }) },
        { id: 'date', label: 'Date', type: 'date', required: true, value: existing ? existing.Date : BYD.todayIso() },
        { id: 'startTime', label: 'Start time', type: 'time', value: existing ? existing.StartTime : '' },
        { id: 'endTime', label: 'End time', type: 'time', value: existing ? existing.EndTime : '' },
        { id: 'title', label: 'Title', required: true, value: existing ? existing.Title : '' },
        { id: 'location', label: 'Location', value: existing ? existing.Location : '' },
        { id: 'notes', label: 'Notes', type: 'textarea', value: existing ? existing.Notes : '' }
      ],
      onSubmit: async function (v) {
        if (existing) { await BYD.call('updateSchedule', Object.assign({ id: existing.ID }, v)); BYD.toast('Session updated.', 'success'); }
        else { await BYD.call('addSchedule', v); BYD.toast('Session added.', 'success'); }
        schedule = await BYD.call('getSchedule', {});
        renderSchedule(); renderHome();
      }
    });
  }
  document.getElementById('addSchBtn').addEventListener('click', function () { openSchModal(null); });

  // ----------------------------------------------------------- rounds
  function renderRounds() {
    renderChips('roundGroupFilter', roundFilter, function (g) { roundFilter = g; renderRounds(); });
    const rows = rounds.filter(function (r) { return roundFilter === 'All' || r.Group === roundFilter; })
      .sort(function (a, b) { return b.Date.localeCompare(a.Date); });
    document.getElementById('roundsEmpty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('roundsList').innerHTML = rows.map(function (r) {
      const rp = pairings.filter(function (p) { return p.RoundID === r.ID; });
      const pairingRows = rp.map(function (p) {
        return '<tr><td><span class="side-tag side-tag-1">' + BYD.escapeHtml(p.Side1Label || 'Aff') + '</span></td>' +
          '<td>' + BYD.escapeHtml(p.Side1) + '</td>' +
          '<td><span class="side-tag side-tag-2">' + BYD.escapeHtml(p.Side2Label || 'Neg') + '</span></td>' +
          '<td>' + BYD.escapeHtml(p.Side2) + '</td>' +
          '<td>' + BYD.escapeHtml(p.Room) + '</td>' +
          '<td>' + BYD.escapeHtml(p.Judge) + '</td>' +
          '<td class="table-actions">' +
          '<button class="btn btn-ghost btn-sm" data-edit-pairing="' + p.ID + '">Edit</button>' +
          '<button class="btn btn-danger btn-sm" data-del-pairing="' + p.ID + '">Delete</button></td></tr>';
      }).join('') || '<tr><td colspan="7" class="text-muted">No pairings yet.</td></tr>';

      return '<div class="card">' +
        '<div class="card-head"><div><h2>' + BYD.escapeHtml(r.Label) + '</h2>' +
        '<div class="card-sub">' + BYD.fmtDate(r.Date) + ' &middot; <span class="badge badge-role">' + BYD.escapeHtml(r.Group) + '</span>' + (r.Format ? ' &middot; ' + BYD.escapeHtml(r.Format) : '') + '</div></div>' +
        '<div class="flex gap-8">' +
        '<button class="btn btn-ghost btn-sm" data-add-pairing="' + r.ID + '">+ Pairing</button>' +
        '<button class="btn btn-ghost btn-sm" data-edit-round="' + r.ID + '">Edit round</button>' +
        '<button class="btn btn-danger btn-sm" data-del-round="' + r.ID + '">Delete round</button></div></div>' +
        (r.Notes ? '<p class="text-sm text-muted">' + BYD.escapeHtml(r.Notes) + '</p>' : '') +
        '<div class="table-wrap"><table><thead><tr><th></th><th>Side 1</th><th></th><th>Side 2</th><th>Room</th><th>Judge</th><th></th></tr></thead>' +
        '<tbody>' + pairingRows + '</tbody></table></div></div>';
    }).join('');

    document.querySelectorAll('[data-add-pairing]').forEach(function (b) {
      b.addEventListener('click', function () { openPairingModal(b.dataset.addPairing, null); });
    });
    document.querySelectorAll('[data-edit-pairing]').forEach(function (b) {
      b.addEventListener('click', function () {
        const p = pairings.find(function (x) { return x.ID === b.dataset.editPairing; });
        openPairingModal(p.RoundID, p);
      });
    });
    document.querySelectorAll('[data-del-pairing]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDelete('Delete this pairing?', async function () {
          await BYD.call('deletePairing', { id: b.dataset.delPairing });
          pairings = await BYD.call('getPairings', {});
          renderRounds(); BYD.toast('Pairing deleted.', 'success');
        });
      });
    });
    document.querySelectorAll('[data-edit-round]').forEach(function (b) {
      b.addEventListener('click', function () { openRoundModal(rounds.find(function (r) { return r.ID === b.dataset.editRound; })); });
    });
    document.querySelectorAll('[data-del-round]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDelete('Delete this round and all its pairings?', async function () {
          await BYD.call('deleteRound', { id: b.dataset.delRound });
          rounds = await BYD.call('getRounds', {});
          pairings = await BYD.call('getPairings', {});
          renderRounds(); BYD.toast('Round deleted.', 'success');
        });
      });
    });
  }

  function openRoundModal(existing) {
    if (!nonUnassignedGroups().length) { BYD.toast('Create a group first (Roster & Groups).', 'error'); return; }
    openFormModal({
      title: existing ? 'Edit round' : 'Add round', submitLabel: existing ? 'Save changes' : 'Add round',
      fields: [
        { id: 'group', label: 'Group', type: 'select', required: true, value: existing ? existing.Group : (roundFilter !== 'All' ? roundFilter : nonUnassignedGroups()[0].GroupName), options: nonUnassignedGroups().map(function (g) { return { value: g.GroupName, label: g.GroupName }; }) },
        { id: 'label', label: 'Round label', required: true, value: existing ? existing.Label : '' },
        { id: 'date', label: 'Date', type: 'date', required: true, value: existing ? existing.Date : BYD.todayIso() },
        { id: 'format', label: 'Format (optional)', value: existing ? existing.Format : '' },
        { id: 'notes', label: 'Notes', type: 'textarea', value: existing ? existing.Notes : '' }
      ],
      onSubmit: async function (v) {
        if (existing) { await BYD.call('updateRound', Object.assign({ id: existing.ID }, v)); BYD.toast('Round updated.', 'success'); }
        else { await BYD.call('addRound', v); BYD.toast('Round added.', 'success'); }
        rounds = await BYD.call('getRounds', {});
        renderRounds();
      }
    });
  }
  document.getElementById('addRoundBtn').addEventListener('click', function () { openRoundModal(null); });

  function openPairingModal(roundId, existing) {
    openFormModal({
      title: existing ? 'Edit pairing' : 'Add pairing', submitLabel: existing ? 'Save changes' : 'Add pairing',
      fields: [
        { id: 'side1Label', label: 'Side 1 label', value: existing ? existing.Side1Label : 'Aff' },
        { id: 'side1', label: 'Side 1 (names)', required: true, value: existing ? existing.Side1 : '' },
        { id: 'side2Label', label: 'Side 2 label', value: existing ? existing.Side2Label : 'Neg' },
        { id: 'side2', label: 'Side 2 (names)', required: true, value: existing ? existing.Side2 : '' },
        { id: 'room', label: 'Room', value: existing ? existing.Room : '' },
        { id: 'judge', label: 'Judge', value: existing ? existing.Judge : '' }
      ],
      onSubmit: async function (v) {
        if (existing) { await BYD.call('updatePairing', Object.assign({ id: existing.ID }, v)); BYD.toast('Pairing updated.', 'success'); }
        else { await BYD.call('addPairing', Object.assign({ roundId: roundId }, v)); BYD.toast('Pairing added.', 'success'); }
        pairings = await BYD.call('getPairings', {});
        renderRounds();
      }
    });
  }

  // ------------------------------------------------------- attendance
  function initAttendanceControls() {
    const groupSelect = document.getElementById('attGroupSelect');
    groupSelect.innerHTML = nonUnassignedGroups().map(function (g) {
      return '<option value="' + BYD.escapeHtml(g.GroupName) + '">' + BYD.escapeHtml(g.GroupName) + '</option>';
    }).join('');
    document.getElementById('attDateSelect').value = BYD.todayIso();
    groupSelect.onchange = loadAttendanceTable;
    document.getElementById('attDateSelect').onchange = loadAttendanceTable;
    loadAttendanceTable();
  }

  async function loadAttendanceTable() {
    const group = document.getElementById('attGroupSelect').value;
    const date = document.getElementById('attDateSelect').value;
    const body = document.getElementById('attTableBody');
    if (!group || !date) { body.innerHTML = '<tr><td colspan="3" class="text-muted">Pick a group and date.</td></tr>'; return; }
    body.innerHTML = '<tr><td colspan="3"><div class="skeleton" style="height:20px;"></div></td></tr>';
    const roster = students.filter(function (s) { return s.group === group; });
    const records = await BYD.call('getAttendance', { group: group, date: date });
    if (!roster.length) { body.innerHTML = '<tr><td colspan="3" class="text-muted">No students in this group yet.</td></tr>'; return; }
    body.innerHTML = roster.map(function (s) {
      const rec = records.find(function (r) { return r.StudentEmail === s.email; });
      const status = rec ? rec.Status : 'Unmarked';
      return '<tr><td>' + BYD.escapeHtml(s.name) + '<div class="text-sm text-muted">' + BYD.escapeHtml(s.email) + '</div></td>' +
        '<td>' + statusBadge(status) + '</td>' +
        '<td class="table-actions">' +
        ['Present', 'Absent', 'Excused'].map(function (st) {
          return '<button class="btn btn-ghost btn-sm" data-set-att="' + BYD.escapeHtml(s.email) + '" data-status="' + st + '">' + st + '</button>';
        }).join('') + '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-set-att]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        try {
          await BYD.call('setAttendance', { date: date, studentEmail: btn.dataset.setAtt, status: btn.dataset.status });
          BYD.toast('Attendance updated.', 'success');
          loadAttendanceTable();
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
      });
    });
  }

  // ---------------------------------------------------------- roster
  function renderRoster() {
    document.getElementById('groupsList').innerHTML = groups.map(function (g) {
      const count = students.filter(function (s) { return s.group === g.GroupName; }).length;
      const canDelete = g.GroupName !== 'Unassigned';
      return '<span class="chip" style="cursor:default;">' + BYD.escapeHtml(g.GroupName) + ' <span class="text-muted">(' + count + ')</span>' +
        (canDelete ? ' <button class="link-btn" style="margin-left:6px;" data-del-group="' + BYD.escapeHtml(g.GroupName) + '">\u00d7</button>' : '') + '</span>';
    }).join('');
    document.querySelectorAll('[data-del-group]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDelete('Delete group "' + b.dataset.delGroup + '"? Students must be moved out first.', async function () {
          await BYD.call('deleteGroup', { name: b.dataset.delGroup });
          groups = await BYD.call('getGroups', {});
          renderRoster(); renderHomework(); renderSchedule(); renderRounds(); initAttendanceControls();
          BYD.toast('Group deleted.', 'success');
        });
      });
    });

    document.getElementById('studentCount').textContent = students.length + ' student' + (students.length === 1 ? '' : 's');
    document.getElementById('studentsTableBody').innerHTML = students.slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (s) {
      return '<tr><td>' + BYD.escapeHtml(s.name) + '</td><td class="font-mono text-sm">' + BYD.escapeHtml(s.email) + '</td>' +
        '<td><select data-group-select="' + BYD.escapeHtml(s.email) + '">' +
        groups.map(function (g) { return '<option value="' + BYD.escapeHtml(g.GroupName) + '"' + (g.GroupName === s.group ? ' selected' : '') + '>' + BYD.escapeHtml(g.GroupName) + '</option>'; }).join('') +
        '</select></td>' +
        '<td>' + (s.active ? '<span class="badge badge-present">Active</span>' : '<span class="badge badge-absent">Inactive</span>') + '</td>' +
        '<td class="table-actions">' +
        '<button class="btn btn-ghost btn-sm" data-reset-pw="' + BYD.escapeHtml(s.email) + '">Reset password</button>' +
        '<button class="btn btn-ghost btn-sm" data-toggle-active="' + BYD.escapeHtml(s.email) + '" data-active="' + s.active + '">' + (s.active ? 'Deactivate' : 'Reactivate') + '</button>' +
        '</td></tr>';
    }).join('');

    document.querySelectorAll('[data-group-select]').forEach(function (sel) {
      sel.addEventListener('change', async function () {
        try {
          await BYD.call('updateUserGroup', { email: sel.dataset.groupSelect, group: sel.value });
          BYD.toast('Group updated.', 'success');
          students = await BYD.call('getStudents', {});
          renderHome();
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); loadAll(); }
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
      btn.addEventListener('click', async function () {
        const goingActive = btn.dataset.active !== 'true';
        try {
          await BYD.call('setUserActive', { email: btn.dataset.toggleActive, active: goingActive });
          BYD.toast(goingActive ? 'Account reactivated.' : 'Account deactivated.', 'success');
          students = await BYD.call('getStudents', {});
          renderRoster();
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
      });
    });
  }

  document.getElementById('addGroupForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    const input = document.getElementById('newGroupName');
    try {
      await BYD.call('createGroup', { name: input.value.trim() });
      input.value = '';
      groups = await BYD.call('getGroups', {});
      renderRoster(); renderHomework(); renderSchedule(); renderRounds(); initAttendanceControls();
      BYD.toast('Group added.', 'success');
    } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
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

  // ----------------------------------------------------- check-in survey
  function initCheckinPanel() {
    const groupSelect = document.getElementById('checkinGroupSelect');
    groupSelect.innerHTML = nonUnassignedGroups().map(function (g) {
      return '<option value="' + BYD.escapeHtml(g.GroupName) + '">' + BYD.escapeHtml(g.GroupName) + '</option>';
    }).join('');

    const statusEl = document.getElementById('checkinStatus');
    const startBtn = document.getElementById('startCheckinBtn');
    const closeBtn = document.getElementById('closeCheckinBtn');
    let currentSurveyId = null;
    let pollHandle = null;

    async function refreshStatus() {
      const group = groupSelect.value;
      if (!group) return;
      try {
        const survey = await BYD.call('getActiveSurvey', { group: group });
        if (!survey) {
          currentSurveyId = null;
          statusEl.textContent = 'No check-in running for this group.';
          startBtn.classList.remove('hidden');
          closeBtn.classList.add('hidden');
          return;
        }
        currentSurveyId = survey.id;
        const msLeft = Math.max(0, new Date(survey.expiresAt).getTime() - Date.now());
        const s = Math.floor(msLeft / 1000);
        statusEl.textContent = survey.responseCount + ' checked in \u2013 ' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + ' left';
        startBtn.classList.add('hidden');
        closeBtn.classList.remove('hidden');
        if (msLeft <= 0) {
          setTimeout(async function () {
            refreshStatus();
            rounds = await BYD.call('getRounds', {});
            pairings = await BYD.call('getPairings', {});
            renderRounds();
          }, 1500);
        }
      } catch (err) { /* quiet - background poll */ }
    }

    groupSelect.addEventListener('change', refreshStatus);

    startBtn.addEventListener('click', async function () {
      startBtn.disabled = true;
      try {
        await BYD.call('startSurvey', { group: groupSelect.value });
        BYD.toast('Check-in started for ' + groupSelect.value + '.', 'success');
        refreshStatus();
      } catch (err) {
        BYD.toast(BYD.errorMessage(err), 'error');
      } finally {
        startBtn.disabled = false;
      }
    });

    closeBtn.addEventListener('click', async function () {
      if (!currentSurveyId) return;
      closeBtn.disabled = true;
      try {
        await BYD.call('closeSurveyNow', { surveyId: currentSurveyId });
        BYD.toast('Check-in closed. Attendance and pairings are ready.', 'success');
        refreshStatus();
        rounds = await BYD.call('getRounds', {});
        pairings = await BYD.call('getPairings', {});
        renderRounds();
      } catch (err) {
        BYD.toast(BYD.errorMessage(err), 'error');
      } finally {
        closeBtn.disabled = false;
      }
    });

    clearInterval(pollHandle);
    pollHandle = setInterval(refreshStatus, 5000);
    refreshStatus();
  }

  // ------------------------------------------------------------- seasons
  function renderSeasons() {
    const body = document.getElementById('seasonsTableBody');
    if (!seasons.length) {
      body.innerHTML = '<tr><td colspan="5" class="text-muted">No seasons yet.</td></tr>';
      return;
    }
    body.innerHTML = seasons.slice().sort(function (a, b) { return b.StartDate.localeCompare(a.StartDate); }).map(function (s) {
      return '<tr><td style="font-weight:600;">' + BYD.escapeHtml(s.Name) + '</td>' +
        '<td><span class="badge badge-role">' + BYD.escapeHtml(s.Group) + '</span></td>' +
        '<td class="font-mono text-sm">' + BYD.fmtDate(s.StartDate) + ' \u2013 ' + BYD.fmtDate(s.EndDate) + '</td>' +
        '<td>' + s.MissBudget + ' pts</td>' +
        '<td class="table-actions">' +
        '<button class="btn btn-ghost btn-sm" data-view-season="' + s.ID + '">View</button>' +
        '<button class="btn btn-danger btn-sm" data-del-season="' + s.ID + '">Delete</button></td></tr>';
    }).join('');
    document.querySelectorAll('[data-view-season]').forEach(function (b) {
      b.addEventListener('click', function () { openSeasonStatsModal(b.dataset.viewSeason); });
    });
    document.querySelectorAll('[data-del-season]').forEach(function (b) {
      b.addEventListener('click', function () {
        confirmDelete('Delete this season? This also removes its enrollment and points history.', async function () {
          await BYD.call('deleteSeason', { id: b.dataset.delSeason });
          seasons = await BYD.call('getSeasons', {});
          renderSeasons(); BYD.toast('Season deleted.', 'success');
        });
      });
    });
  }

  document.getElementById('addSeasonBtn').addEventListener('click', function () {
    if (!nonUnassignedGroups().length) { BYD.toast('Create a group first (Roster & Groups).', 'error'); return; }
    openFormModal({
      title: 'Add season', submitLabel: 'Create season',
      fields: [
        { id: 'group', label: 'Group', type: 'select', required: true, value: nonUnassignedGroups()[0].GroupName, options: nonUnassignedGroups().map(function (g) { return { value: g.GroupName, label: g.GroupName }; }) },
        { id: 'name', label: 'Season name', required: true, value: '' },
        { id: 'startDate', label: 'Start date', type: 'date', required: true, value: BYD.todayIso() },
        { id: 'endDate', label: 'End date', type: 'date', required: true, value: '' },
        { id: 'missBudget', label: 'Miss-point budget', type: 'number', value: 3, required: true }
      ],
      onSubmit: async function (v) {
        await BYD.call('createSeason', v);
        BYD.toast('Season created \u2013 everyone currently in ' + v.group + ' was auto-enrolled.', 'success');
        seasons = await BYD.call('getSeasons', {});
        renderSeasons();
      }
    });
  });

  async function openSeasonStatsModal(seasonId) {
    BYD.openModal(
      '<div class="modal-head"><h2>Season</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
      '<div id="seasonModalBody"><div class="skeleton" style="height:80px;"></div></div>'
    );
    try {
      const data = await BYD.call('getSeasonStats', { seasonId: seasonId });
      renderSeasonModalBody(data);
    } catch (err) {
      document.getElementById('seasonModalBody').innerHTML = '<p class="text-muted">' + BYD.escapeHtml(BYD.errorMessage(err)) + '</p>';
    }

    function renderSeasonModalBody(data) {
      const season = data.season;
      const enrolledEmails = data.students.map(function (s) { return s.email; });
      const notEnrolled = students.filter(function (s) { return s.group === season.Group && enrolledEmails.indexOf(s.email) === -1; });

      const rows = data.students.slice().sort(function (a, b) { return b.points - a.points; }).map(function (s) {
        const cls = s.points >= s.budget ? 'badge-absent' : s.points >= s.budget - 1 ? 'badge-excused' : 'badge-present';
        return '<tr><td>' + BYD.escapeHtml(s.name) + (s.notified ? ' <span class="text-sm text-muted">(notified)</span>' : '') + '</td>' +
          '<td><span class="badge ' + cls + '">' + s.points + ' / ' + s.budget + '</span></td>' +
          '<td class="table-actions"><button class="btn btn-ghost btn-sm" data-remove-enr="' + BYD.escapeHtml(s.email) + '">Remove</button></td></tr>';
      }).join('') || '<tr><td colspan="3" class="text-muted">No students enrolled.</td></tr>';

      const addOptions = notEnrolled.map(function (s) { return '<option value="' + BYD.escapeHtml(s.email) + '">' + BYD.escapeHtml(s.name) + '</option>'; }).join('');

      document.getElementById('seasonModalBody').innerHTML =
        '<h3 class="mt-0">' + BYD.escapeHtml(season.Name) + '</h3>' +
        '<p class="text-sm text-muted">' + BYD.escapeHtml(season.Group) + ' &middot; ' + BYD.fmtDate(season.StartDate) + ' \u2013 ' + BYD.fmtDate(season.EndDate) + ' &middot; budget ' + season.MissBudget + ' pts</p>' +
        '<div class="table-wrap"><table><thead><tr><th>Student</th><th>Points</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' +
        (notEnrolled.length ? '<div class="flex gap-8 mt-16"><select id="addEnrSelect" style="flex:1;">' + addOptions + '</select><button class="btn btn-ghost btn-sm" id="addEnrBtn">+ Add student</button></div>' : '');

      document.querySelectorAll('[data-remove-enr]').forEach(function (b) {
        b.addEventListener('click', async function () {
          try {
            await BYD.call('removeStudentFromSeason', { seasonId: season.ID, email: b.dataset.removeEnr });
            const fresh = await BYD.call('getSeasonStats', { seasonId: season.ID });
            renderSeasonModalBody(fresh);
          } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
        });
      });
      const addBtn = document.getElementById('addEnrBtn');
      if (addBtn) {
        addBtn.addEventListener('click', async function () {
          try {
            await BYD.call('addStudentToSeason', { seasonId: season.ID, email: document.getElementById('addEnrSelect').value });
            const fresh = await BYD.call('getSeasonStats', { seasonId: season.ID });
            renderSeasonModalBody(fresh);
          } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
        });
      }
    }
  }
})();
