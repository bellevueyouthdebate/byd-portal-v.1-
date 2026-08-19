/**
 * coach.js - data loading and rendering for coach.html
 * (Also used by admins, who see an extra "Admin Console" link.)
 */
(async function () {
  const user = BYD.guard(['coach', 'admin']);
  if (!user) return;
  BYD.initViewNav('home');
  if (user.role === 'admin') document.getElementById('adminConsoleLink').classList.remove('hidden');

  let groups = [], students = [], homework = [], homeworkCompletions = [], schedule = [], rounds = [], pairings = [], seasons = [], rfds = [];
  let hwFilter = 'All', schPreviewFilter = '', roundFilter = 'All', rfdFilter = 'All';

  async function loadAll() {
    try {
      [groups, students, homework, homeworkCompletions, schedule, rounds, seasons, rfds] = await Promise.all([
        BYD.call('getGroups', {}), BYD.call('getStudents', {}), BYD.call('getHomework', {}),
        BYD.call('getHomeworkCompletions', {}), BYD.call('getSchedule', {}), BYD.call('getRounds', {}),
        BYD.call('getSeasons', {}), BYD.call('getRfds', { scope: 'all' })
      ]);
      pairings = await BYD.call('getPairings', {});
      renderHome();
      renderHomework();
      renderSchedulePreview();
      renderRounds();
      renderRoster();
      renderSeasons();
      renderRfdsPage();
      initScheduleSheetEmbed();
      initAttendanceControls();
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
  function completionCount(hwId) { return homeworkCompletions.filter(function (c) { return c.HomeworkID === hwId; }).length; }
  function groupSize(groupName) { return students.filter(function (s) { return s.group === groupName; }).length; }

  function renderHomework() {
    renderChips('hwGroupFilter', hwFilter, function (g) { hwFilter = g; renderHomework(); });
    const rows = homework.filter(function (h) { return hwFilter === 'All' || h.Group === hwFilter; })
      .sort(function (a, b) { return String(a.DueDate).localeCompare(String(b.DueDate)); });
    document.getElementById('hwEmpty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('hwTableBody').innerHTML = rows.map(function (h) {
      const done = completionCount(h.ID), total = groupSize(h.Group);
      return '<tr><td style="font-weight:600;">' + BYD.escapeHtml(h.Title) + '</td>' +
        '<td><span class="badge badge-role">' + BYD.escapeHtml(h.Group) + '</span></td>' +
        '<td class="text-sm">' + BYD.escapeHtml(h.Description) + '</td>' +
        '<td>' + (h.SubmissionLink ? '<a href="' + BYD.escapeHtml(h.SubmissionLink) + '" target="_blank" rel="noopener" class="text-sm">Link &#8599;</a>' : '<span class="text-muted text-sm">\u2014</span>') + '</td>' +
        '<td class="font-mono">' + BYD.fmtDate(h.DueDate) + '</td>' +
        '<td class="text-sm">' + done + ' / ' + total + '</td>' +
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
        { id: 'submissionLink', label: 'Submission link (Drive folder/form URL, optional)', value: existing ? existing.SubmissionLink : '' },
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
  // The Schedule tab is edited directly in the Google Sheet now - this view
  // is a live-embedded link to it, plus a preview of exactly what a
  // student in a given group sees on their own Schedule tab.
  async function initScheduleSheetEmbed() {
    try {
      const info = await BYD.call('getScheduleSheetInfo', {});
      document.getElementById('openSheetBtn').href = info.editUrl;
      const frame = document.getElementById('scheduleSheetFrame');
      frame.src = info.publishedEmbedUrl || info.editUrl;
    } catch (err) { /* non-fatal - the preview below still works */ }
  }
  document.getElementById('refreshSchBtn').addEventListener('click', async function () {
    schedule = await BYD.call('getSchedule', {});
    renderSchedulePreview(); renderHome();
    BYD.toast('Schedule refreshed from the sheet.', 'success');
  });

  // Mirrors student.js's own schedule rendering exactly (same columns, same
  // "today" highlight) so what a coach sees here really is what a student
  // in that group would see - not just an approximation of it.
  function renderSchedulePreview() {
    const groupNames = nonUnassignedGroups().map(function (g) { return g.GroupName; });
    if (!groupNames.length) {
      document.getElementById('schPreviewGroupFilter').innerHTML = '';
      document.getElementById('schPreviewTableBody').innerHTML = '';
      document.getElementById('schPreviewEmpty').classList.remove('hidden');
      return;
    }
    if (!schPreviewFilter || groupNames.indexOf(schPreviewFilter) === -1) schPreviewFilter = groupNames[0];

    const chipsEl = document.getElementById('schPreviewGroupFilter');
    chipsEl.innerHTML = groupNames.map(function (g) {
      return '<button type="button" class="chip' + (g === schPreviewFilter ? ' active' : '') + '" data-g="' + BYD.escapeHtml(g) + '">' + BYD.escapeHtml(g) + '</button>';
    }).join('');
    chipsEl.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () { schPreviewFilter = chip.dataset.g; renderSchedulePreview(); });
    });

    const rows = schedule.filter(function (s) { return s.Group === schPreviewFilter; })
      .sort(function (a, b) { return (a.Date + a.StartTime).localeCompare(b.Date + b.StartTime); });
    document.getElementById('schPreviewEmpty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('schPreviewTableBody').innerHTML = rows.map(function (s) {
      const isToday = s.Date === BYD.todayIso();
      return '<tr' + (isToday ? ' style="background:var(--ink-tint);"' : '') + '><td class="font-mono">' + BYD.fmtDate(s.Date) + '</td>' +
        '<td class="font-mono">' + BYD.fmtTime(s.StartTime) + (s.EndTime ? '\u2013' + BYD.fmtTime(s.EndTime) : '') + '</td>' +
        '<td style="font-weight:600;">' + BYD.escapeHtml(s.Title) + '</td>' +
        '<td>' + BYD.escapeHtml(s.Location) + '</td>' +
        '<td class="text-muted">' + BYD.escapeHtml(s.Notes) + '</td></tr>';
    }).join('');
  }

  // ----------------------------------------------------------- rounds
  function rfdForPairing(pairingId) { return rfds.find(function (r) { return r.PairingID === pairingId; }); }

  function renderRounds() {
    renderChips('roundGroupFilter', roundFilter, function (g) { roundFilter = g; renderRounds(); });
    const rows = rounds.filter(function (r) { return roundFilter === 'All' || r.Group === roundFilter; })
      .sort(function (a, b) { return b.Date.localeCompare(a.Date); });
    document.getElementById('roundsEmpty').classList.toggle('hidden', rows.length > 0);
    document.getElementById('roundsList').innerHTML = rows.map(function (r) {
      const rp = pairings.filter(function (p) { return p.RoundID === r.ID; });
      const byeStudent = r.ByeStudentEmail ? students.find(function (s) { return s.email === r.ByeStudentEmail; }) : null;
      const byeBanner = byeStudent
        ? '<div class="bye-banner"><span><b>' + BYD.escapeHtml(byeStudent.name) + '</b> didn\u2019t get a pairing this round (odd number present). Use "+ Add to pairing" below to place them.</span></div>'
        : '';

      const pairingRows = rp.map(function (p) {
        const rfd = rfdForPairing(p.ID);
        const isJudge = p.JudgeEmail === user.email;
        const canSubmitRfd = !p.JudgeEmail || isJudge || user.role === 'admin';
        let judgeCell;
        if (p.Judge) {
          judgeCell = BYD.escapeHtml(p.Judge) + (isJudge ? ' <span class="text-muted text-sm">(you)</span>' : '');
        } else {
          judgeCell = '<button class="btn btn-ghost btn-sm" data-claim-judge="' + p.ID + '">Judge this round</button>';
        }
        let rfdCell = '<button class="btn btn-ghost btn-sm" data-rfd="' + p.ID + '"' + (canSubmitRfd ? '' : ' disabled title="Only the assigned judge can submit"') + '>' + (rfd ? 'Edit RFD' : 'RFD') + '</button>';

        const byeControls = byeStudent ? (
          '<button class="btn btn-ghost btn-sm" data-add-bye="' + r.ID + '" data-bye-pairing="' + p.ID + '" data-bye-side="1">+ Add to Side 1</button>' +
          '<button class="btn btn-ghost btn-sm" data-add-bye="' + r.ID + '" data-bye-pairing="' + p.ID + '" data-bye-side="2">+ Add to Side 2</button>'
        ) : '';

        const rfdRow = rfd
          ? '<tr><td colspan="8"><div class="rfd-box"><div class="rfd-winner">Winner: ' + BYD.escapeHtml(rfd.Winner === 'Side1' ? p.Side1 : p.Side2) + '</div>' +
            (rfd.Feedback ? '<div class="rfd-feedback">' + BYD.escapeHtml(rfd.Feedback) + '</div>' : '') +
            '<div class="text-sm text-muted mt-8">Judged by ' + BYD.escapeHtml(rfd.JudgeName) + '</div></div></td></tr>'
          : '';

        return '<tr><td><span class="side-tag side-tag-1">' + BYD.escapeHtml(p.Side1Label || 'Aff') + '</span></td>' +
          '<td>' + BYD.escapeHtml(p.Side1) + '</td>' +
          '<td><span class="side-tag side-tag-2">' + BYD.escapeHtml(p.Side2Label || 'Neg') + '</span></td>' +
          '<td>' + BYD.escapeHtml(p.Side2) + '</td>' +
          '<td>' + BYD.escapeHtml(p.Room) + '</td>' +
          '<td>' + judgeCell + '</td>' +
          '<td class="table-actions">' + rfdCell + byeControls + '</td>' +
          '<td class="table-actions">' +
          '<button class="btn btn-ghost btn-sm" data-edit-pairing="' + p.ID + '">Edit</button>' +
          '<button class="btn btn-danger btn-sm" data-del-pairing="' + p.ID + '">Delete</button></td></tr>' + rfdRow;
      }).join('') || '<tr><td colspan="8" class="text-muted">No pairings yet.</td></tr>';

      return '<div class="card">' +
        '<div class="card-head"><div><h2>' + BYD.escapeHtml(r.Label) + '</h2>' +
        '<div class="card-sub">' + BYD.fmtDate(r.Date) + ' &middot; <span class="badge badge-role">' + BYD.escapeHtml(r.Group) + '</span>' + (r.Format ? ' &middot; ' + BYD.escapeHtml(r.Format) : '') + '</div></div>' +
        '<div class="flex gap-8">' +
        '<button class="btn btn-ghost btn-sm" data-add-pairing="' + r.ID + '">+ Pairing</button>' +
        '<button class="btn btn-ghost btn-sm" data-edit-round="' + r.ID + '">Edit round</button>' +
        '<button class="btn btn-danger btn-sm" data-del-round="' + r.ID + '">Delete round</button></div></div>' +
        byeBanner +
        (r.Notes ? '<p class="text-sm text-muted">' + BYD.escapeHtml(r.Notes) + '</p>' : '') +
        '<div class="table-wrap"><table><thead><tr><th></th><th>Side 1</th><th></th><th>Side 2</th><th>Room</th><th>Judge</th><th>RFD</th><th></th></tr></thead>' +
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
          [pairings, rfds] = await Promise.all([BYD.call('getPairings', {}), BYD.call('getRfds', { scope: 'all' })]);
          renderRounds(); renderRfdsPage(); BYD.toast('Pairing deleted.', 'success');
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
          [rounds, pairings, rfds] = await Promise.all([BYD.call('getRounds', {}), BYD.call('getPairings', {}), BYD.call('getRfds', { scope: 'all' })]);
          renderRounds(); renderRfdsPage(); BYD.toast('Round deleted.', 'success');
        });
      });
    });
    document.querySelectorAll('[data-claim-judge]').forEach(function (b) {
      b.addEventListener('click', async function () {
        try {
          await BYD.call('claimJudge', { pairingId: b.dataset.claimJudge });
          pairings = await BYD.call('getPairings', {});
          renderRounds();
          BYD.toast("You're the judge for this round.", 'success');
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
      });
    });
    document.querySelectorAll('[data-add-bye]').forEach(function (b) {
      b.addEventListener('click', async function () {
        try {
          await BYD.call('assignBye', { roundId: b.dataset.addBye, pairingId: b.dataset.byePairing, side: b.dataset.byeSide });
          [rounds, pairings] = await Promise.all([BYD.call('getRounds', {}), BYD.call('getPairings', {})]);
          renderRounds();
          BYD.toast('Added to the pairing.', 'success');
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
      });
    });
    document.querySelectorAll('[data-rfd]').forEach(function (b) {
      b.addEventListener('click', function () { openRfdModal(pairings.find(function (p) { return p.ID === b.dataset.rfd; })); });
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

  // Bespoke (not the generic openFormModal) pairing form: roster multi-
  // selects auto-fill the side text + emails, Room auto-fills from the
  // Schedule entry for the round's date/group, and staff can claim the
  // Judge field with their own name.
  function openPairingModal(roundId, existing) {
    const round = rounds.find(function (r) { return r.ID === roundId; });
    const roster = round ? students.filter(function (s) { return s.group === round.Group; }) : [];
    const sched = round ? schedule.find(function (s) { return s.Group === round.Group && s.Date === round.Date; }) : null;
    const defaultRoom = existing ? existing.Room : (sched ? sched.Location : '');
    const side1Emails = existing ? (existing.Side1Emails || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    const side2Emails = existing ? (existing.Side2Emails || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];

    function studentOptions(selected) {
      return roster.map(function (s) {
        return '<option value="' + BYD.escapeHtml(s.email) + '" data-name="' + BYD.escapeHtml(s.name) + '"' + (selected.indexOf(s.email) > -1 ? ' selected' : '') + '>' + BYD.escapeHtml(s.name) + '</option>';
      }).join('');
    }

    BYD.openModal(
      '<div class="modal-head"><h2>' + (existing ? 'Edit pairing' : 'Add pairing') + '</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
      '<form id="pairingForm">' +
      '<div class="field"><label>Side 1 students (pick from roster, optional)</label><select id="pSide1Students" multiple size="' + Math.min(5, Math.max(2, roster.length)) + '">' + studentOptions(side1Emails) + '</select></div>' +
      '<div class="field"><label for="pSide1Label">Side 1 label</label><input type="text" id="pSide1Label" value="' + BYD.escapeHtml(existing ? existing.Side1Label : 'Aff') + '"></div>' +
      '<div class="field"><label for="pSide1">Side 1 (names shown)</label><input type="text" id="pSide1" required value="' + BYD.escapeHtml(existing ? existing.Side1 : '') + '"></div>' +
      '<hr class="divider">' +
      '<div class="field"><label>Side 2 students (pick from roster, optional)</label><select id="pSide2Students" multiple size="' + Math.min(5, Math.max(2, roster.length)) + '">' + studentOptions(side2Emails) + '</select></div>' +
      '<div class="field"><label for="pSide2Label">Side 2 label</label><input type="text" id="pSide2Label" value="' + BYD.escapeHtml(existing ? existing.Side2Label : 'Neg') + '"></div>' +
      '<div class="field"><label for="pSide2">Side 2 (names shown)</label><input type="text" id="pSide2" required value="' + BYD.escapeHtml(existing ? existing.Side2 : '') + '"></div>' +
      '<hr class="divider">' +
      '<div class="field"><label for="pRoom">Room</label><input type="text" id="pRoom" placeholder="Auto-filled from today\u2019s schedule if left blank" value="' + BYD.escapeHtml(defaultRoom) + '"></div>' +
      '<div class="field mb-0"><label for="pJudge">Judge</label><div class="flex gap-8"><input type="text" id="pJudge" style="flex:1;" value="' + BYD.escapeHtml(existing ? existing.Judge : '') + '"><button type="button" class="btn btn-ghost btn-sm" id="pClaimJudgeBtn">Use my name</button></div></div>' +
      '<input type="hidden" id="pJudgeEmail" value="' + BYD.escapeHtml(existing ? (existing.JudgeEmail || '') : '') + '">' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="BYD.closeModal()">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (existing ? 'Save changes' : 'Add pairing') + '</button>' +
      '</div></form>'
    );

    function wireAutofill(selectId, labelInputId, nameInputId) {
      document.getElementById(selectId).addEventListener('change', function (e) {
        const chosen = Array.from(e.target.selectedOptions).map(function (o) { return o.dataset.name; });
        if (chosen.length) document.getElementById(nameInputId).value = chosen.join(' & ');
      });
    }
    wireAutofill('pSide1Students', 'pSide1Label', 'pSide1');
    wireAutofill('pSide2Students', 'pSide2Label', 'pSide2');

    document.getElementById('pClaimJudgeBtn').addEventListener('click', function () {
      document.getElementById('pJudge').value = user.name;
      document.getElementById('pJudgeEmail').value = user.email;
    });

    document.getElementById('pairingForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      const original = btn.textContent;
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      const side1Sel = Array.from(document.getElementById('pSide1Students').selectedOptions).map(function (o) { return o.value; });
      const side2Sel = Array.from(document.getElementById('pSide2Students').selectedOptions).map(function (o) { return o.value; });
      const values = {
        side1Label: document.getElementById('pSide1Label').value,
        side1: document.getElementById('pSide1').value,
        side1Emails: side1Sel.join(','),
        side2Label: document.getElementById('pSide2Label').value,
        side2: document.getElementById('pSide2').value,
        side2Emails: side2Sel.join(','),
        room: document.getElementById('pRoom').value,
        judge: document.getElementById('pJudge').value,
        judgeEmail: document.getElementById('pJudgeEmail').value
      };
      try {
        if (existing) { await BYD.call('updatePairing', Object.assign({ id: existing.ID }, values)); BYD.toast('Pairing updated.', 'success'); }
        else { await BYD.call('addPairing', Object.assign({ roundId: roundId }, values)); BYD.toast('Pairing added.', 'success'); }
        pairings = await BYD.call('getPairings', {});
        renderRounds();
        BYD.closeModal();
      } catch (err) {
        BYD.toast(BYD.errorMessage(err), 'error');
        btn.disabled = false; btn.textContent = original;
      }
    });
  }

  // ------------------------------------------------------------- RFDs
  function openRfdModal(pairing) {
    const existing = rfdForPairing(pairing.ID);
    BYD.openModal(
      '<div class="modal-head"><h2>RFD</h2><button class="modal-close" onclick="BYD.closeModal()">\u00d7</button></div>' +
      '<p class="text-sm text-muted">' + BYD.escapeHtml(pairing.Side1) + ' (' + BYD.escapeHtml(pairing.Side1Label || 'Aff') + ') vs. ' + BYD.escapeHtml(pairing.Side2) + ' (' + BYD.escapeHtml(pairing.Side2Label || 'Neg') + ')</p>' +
      '<form id="rfdForm">' +
      '<div class="field"><label for="rfdWinner">Winner</label><select id="rfdWinner" required>' +
      '<option value="">Select winner\u2026</option>' +
      '<option value="Side1"' + (existing && existing.Winner === 'Side1' ? ' selected' : '') + '>' + BYD.escapeHtml(pairing.Side1) + '</option>' +
      '<option value="Side2"' + (existing && existing.Winner === 'Side2' ? ' selected' : '') + '>' + BYD.escapeHtml(pairing.Side2) + '</option>' +
      '</select></div>' +
      '<div class="field mb-0"><label for="rfdFeedback">Written feedback / RFD</label><textarea id="rfdFeedback" rows="5">' + BYD.escapeHtml(existing ? existing.Feedback : '') + '</textarea></div>' +
      '<div class="modal-actions">' +
      '<button type="button" class="btn btn-ghost" onclick="BYD.closeModal()">Cancel</button>' +
      '<button type="submit" class="btn btn-primary">' + (existing ? 'Save RFD' : 'Submit RFD') + '</button>' +
      '</div></form>'
    );
    document.getElementById('rfdForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]');
      btn.disabled = true; btn.textContent = 'Saving\u2026';
      try {
        await BYD.call('submitRfd', { pairingId: pairing.ID, winner: document.getElementById('rfdWinner').value, feedback: document.getElementById('rfdFeedback').value });
        [pairings, rfds] = await Promise.all([BYD.call('getPairings', {}), BYD.call('getRfds', { scope: 'all' })]);
        renderRounds(); renderRfdsPage();
        BYD.toast('RFD saved.', 'success');
        BYD.closeModal();
      } catch (err) {
        BYD.toast(BYD.errorMessage(err), 'error');
        btn.disabled = false; btn.textContent = 'Submit RFD';
      }
    });
  }

  function rfdCardHtml(r) {
    const pairing = pairings.find(function (p) { return p.ID === r.PairingID; });
    const round = rounds.find(function (rd) { return rd.ID === r.RoundID; });
    if (!pairing || !round) return '';
    const winnerName = r.Winner === 'Side1' ? pairing.Side1 : pairing.Side2;
    return '<div class="flex justify-between items-start" style="padding:10px 0; border-bottom:1px solid var(--rule); gap:16px; flex-wrap:wrap;">' +
      '<div>' +
      '<div style="font-weight:600;">' + BYD.escapeHtml(pairing.Side1) + ' vs. ' + BYD.escapeHtml(pairing.Side2) +
      ' <span class="badge badge-role">' + BYD.escapeHtml(round.Group) + '</span></div>' +
      '<div class="text-sm text-muted">' + BYD.fmtDate(round.Date) + ' &middot; Judge: ' + BYD.escapeHtml(r.JudgeName) + '</div>' +
      '<div class="rfd-box" style="margin-top:8px;"><div class="rfd-winner">Winner: ' + BYD.escapeHtml(winnerName) + '</div>' +
      (r.Feedback ? '<div class="rfd-feedback">' + BYD.escapeHtml(r.Feedback) + '</div>' : '') + '</div>' +
      '</div></div>';
  }

  function renderRfdsPage() {
    const mine = rfds.filter(function (r) { return r.JudgeEmail === user.email; });
    document.getElementById('myRfdsEmpty').classList.toggle('hidden', mine.length > 0);
    document.getElementById('myRfdsList').innerHTML = mine.map(rfdCardHtml).join('');

    renderChips('rfdGroupFilter', rfdFilter, function (g) { rfdFilter = g; renderRfdsPage(); });
    const all = rfds.filter(function (r) { return rfdFilter === 'All' || r.Group === rfdFilter; });
    document.getElementById('allRfdsEmpty').classList.toggle('hidden', all.length > 0);
    document.getElementById('allRfdsList').innerHTML = all.map(rfdCardHtml).join('');
  }

  // ------------------------------------------------------- attendance
  // WHERE THIS SAVES: the Attendance tab of the Sheet, one row per
  // (date, student) - see upsertAttendance_ in Data.gs. Clicking a status
  // here always updates that one row in place, so re-clicking never
  // creates a duplicate. The row of buttons is disabled entirely (see
  // attNoPractice below) unless the selected date has a real Schedule
  // entry for the selected group.
  function initAttendanceControls() {
    const groupSelect = document.getElementById('attGroupSelect');
    groupSelect.innerHTML = nonUnassignedGroups().map(function (g) {
      return '<option value="' + BYD.escapeHtml(g.GroupName) + '">' + BYD.escapeHtml(g.GroupName) + '</option>';
    }).join('');
    document.getElementById('attDateSelect').value = BYD.todayIso();
    groupSelect.onchange = function () { loadAttendanceTable(); renderAttendanceMatrix(); };
    document.getElementById('attDateSelect').onchange = loadAttendanceTable;
    loadAttendanceTable();
    renderAttendanceMatrix();
  }

  async function loadAttendanceTable() {
    const group = document.getElementById('attGroupSelect').value;
    const date = document.getElementById('attDateSelect').value;
    const body = document.getElementById('attTableBody');
    const noPractice = document.getElementById('attNoPractice');
    const table = document.getElementById('attTable');
    if (!group || !date) { body.innerHTML = '<tr><td colspan="3" class="text-muted">Pick a group and date.</td></tr>'; return; }

    const isRealPractice = schedule.some(function (s) { return s.Group === group && s.Date === date; });
    noPractice.classList.toggle('hidden', isRealPractice);
    table.classList.toggle('hidden', !isRealPractice);
    document.getElementById('autoPairBtn').disabled = !isRealPractice;
    if (!isRealPractice) { body.innerHTML = ''; return; }

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
          const active = st === status;
          return '<button class="btn ' + (active ? 'btn-primary' : 'btn-ghost') + ' btn-sm" data-set-att="' + BYD.escapeHtml(s.email) + '" data-status="' + st + '"' + (active ? ' disabled title="Already ' + st + '"' : '') + '>' + st + '</button>';
        }).join('') +
        (status !== 'Unmarked' ? '<button class="btn btn-ghost btn-sm" data-set-att="' + BYD.escapeHtml(s.email) + '" data-status="Unmarked">Clear</button>' : '') +
        '</td></tr>';
    }).join('');
    body.querySelectorAll('[data-set-att]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        try {
          await BYD.call('setAttendance', { date: date, studentEmail: btn.dataset.setAtt, status: btn.dataset.status });
          BYD.toast('Attendance updated.', 'success');
          loadAttendanceTable();
          renderAttendanceMatrix();
        } catch (err) { BYD.toast(BYD.errorMessage(err), 'error'); }
      });
    });
  }

  document.getElementById('autoPairBtn').addEventListener('click', async function () {
    const group = document.getElementById('attGroupSelect').value;
    const date = document.getElementById('attDateSelect').value;
    const btn = this;
    btn.disabled = true;
    try {
      await BYD.call('generateRoundFromAttendance', { group: group, date: date });
      [rounds, pairings] = await Promise.all([BYD.call('getRounds', {}), BYD.call('getPairings', {})]);
      renderRounds();
      BYD.toast('Pairings generated from today\u2019s Present students.', 'success');
    } catch (err) {
      BYD.toast(BYD.errorMessage(err), 'error');
    } finally {
      btn.disabled = false;
    }
  });

  // Color-coded (not worded) attendance-history grid: students down the
  // side, every practice date for the group across, one colored cell each.
  async function renderAttendanceMatrix() {
    const group = document.getElementById('attGroupSelect').value;
    const wrap = document.getElementById('attMatrixWrap');
    if (!group) { wrap.innerHTML = '<p class="text-muted text-sm mb-0">Pick a group above to see its history.</p>'; return; }
    wrap.innerHTML = '<div class="skeleton" style="height:80px;"></div>';

    const roster = students.filter(function (s) { return s.group === group; }).sort(function (a, b) { return a.name.localeCompare(b.name); });
    const dates = schedule.filter(function (s) { return s.Group === group && s.Date <= BYD.todayIso(); })
      .map(function (s) { return s.Date; })
      .filter(function (d, i, arr) { return arr.indexOf(d) === i; })
      .sort();

    if (!roster.length || !dates.length) {
      wrap.innerHTML = '<p class="text-muted text-sm mb-0">Need at least one student and one past practice date to show history.</p>';
      return;
    }

    const records = await BYD.call('getAttendance', { group: group });
    const cellClass = { Present: 'att-cell-present', Absent: 'att-cell-absent', Excused: 'att-cell-excused' };

    const header = '<th class="att-name-cell">Student</th>' + dates.map(function (d) {
      return '<th>' + BYD.fmtDate(d).replace(/^\w+, /, '') + '</th>';
    }).join('');

    const rowsHtml = roster.map(function (s) {
      const cells = dates.map(function (d) {
        const rec = records.find(function (r) { return r.StudentEmail === s.email && r.Date === d; });
        const status = rec ? rec.Status : 'Unmarked';
        const cls = cellClass[status] || 'att-cell-unmarked';
        return '<td><span class="att-cell ' + cls + '" title="' + BYD.escapeHtml(s.name) + ' \u2014 ' + BYD.fmtDate(d) + ': ' + status + '" aria-label="' + status + '"></span></td>';
      }).join('');
      return '<tr><td class="att-name-cell">' + BYD.escapeHtml(s.name) + '</td>' + cells + '</tr>';
    }).join('');

    wrap.innerHTML = '<div class="att-matrix-scroll"><table class="att-matrix"><thead><tr>' + header + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
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
          renderRoster(); renderHomework(); renderSchedulePreview(); renderRounds(); initAttendanceControls();
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
      renderRoster(); renderHomework(); renderSchedulePreview(); renderRounds(); initAttendanceControls();
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

  loadAll();
})();
