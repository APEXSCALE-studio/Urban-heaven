/**
 * Admin dashboard app logic. Everything reads/writes through window.UHLData
 * (assets/js/data-store.js → Supabase), so actions here are real database
 * operations, not local mock state.
 */
(function () {
  'use strict';

  var fmtMoney = function (n) { return 'K ' + Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
  var escapeHtml = function (str) { var d = document.createElement('div'); d.textContent = str == null ? '' : str; return d.innerHTML; };
  var titleCase = function (s) { return String(s).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); }); };
  var loadingRow = function (cols) { return '<tr class="loading-row"><td colspan="' + cols + '">Loading…</td></tr>'; };

  function flash(type, text) {
    var area = document.getElementById('flash-area');
    area.innerHTML = '<div class="alert alert-' + (type === 'success' ? 'success' : 'error') + '">' + escapeHtml(text) + '</div>';
    setTimeout(function () { area.innerHTML = ''; }, 4000);
  }

  /* ---------------------------------------------------------------- AUTH */
  var loginView = document.getElementById('login-view');
  var appView = document.getElementById('app-view');

  function showApp() {
    var user = UHLData.currentUser();
    if (!user) { loginView.classList.remove('hidden'); appView.classList.add('hidden'); return; }
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    document.getElementById('user-name').textContent = user.name;
    document.getElementById('user-role').textContent = titleCase(user.role);
    document.getElementById('user-avatar').textContent = user.name.charAt(0).toUpperCase();
    renderSection(currentSection);
  }

  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var email = document.getElementById('login-email').value;
    var password = document.getElementById('login-password').value;
    var errBox = document.getElementById('login-error');
    var btn = document.getElementById('login-btn');
    btn.disabled = true;
    btn.textContent = 'Logging in…';

    UHLData.login(email, password).then(function (result) {
      if (result.success) {
        errBox.classList.add('hidden');
        showApp();
      } else {
        errBox.textContent = result.message;
        errBox.classList.remove('hidden');
      }
    }).catch(function () {
      errBox.textContent = 'Could not reach the database. Please try again.';
      errBox.classList.remove('hidden');
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Log In';
    });
  });

  document.getElementById('logout-btn').addEventListener('click', function () {
    UHLData.logout();
    showApp();
  });

  /* ------------------------------------------------------------ NAVIGATION */
  var currentSection = 'dashboard';
  var sectionTitles = { dashboard: 'Dashboard', bookings: 'Bookings', rooms: 'Rooms', customers: 'Customers', reports: 'Reports', settings: 'Settings' };

  document.querySelectorAll('.admin-nav a[data-section]').forEach(function (link) {
    link.addEventListener('click', function (e) {
      e.preventDefault();
      currentSection = link.getAttribute('data-section');
      document.querySelectorAll('.admin-nav a').forEach(function (a) { a.classList.remove('active'); });
      link.classList.add('active');
      document.getElementById('page-title').textContent = sectionTitles[currentSection];
      document.querySelectorAll('.section-view').forEach(function (s) { s.classList.remove('active'); });
      document.getElementById('section-' + currentSection).classList.add('active');
      renderSection(currentSection);
      document.getElementById('admin-sidebar').classList.remove('open-mobile');
    });
  });

  document.getElementById('admin-sidebar-toggle').addEventListener('click', function () {
    document.getElementById('admin-sidebar').classList.toggle('open-mobile');
  });

  function renderSection(name) {
    if (name === 'dashboard') renderDashboard();
    else if (name === 'bookings') renderBookings();
    else if (name === 'rooms') renderRooms();
    else if (name === 'customers') renderCustomers();
    else if (name === 'reports') renderReports();
    else if (name === 'settings') renderSettings();
  }

  /* ------------------------------------------------------------ DASHBOARD */
  async function renderDashboard() {
    var el = document.getElementById('section-dashboard');
    el.innerHTML = '<p class="hint">Loading dashboard…</p>';
    try {
      var today = new Date().toISOString().slice(0, 10);
      var monthStart = today.slice(0, 8) + '01';
      var bookings = await UHLData.getBookings({});
      var rooms = await UHLData.getRooms({});

      var totalBookings = bookings.length;
      var todayCheckins = bookings.filter(function (b) { return b.checkIn === today && ['confirmed', 'checked_in'].includes(b.status); }).length;
      var todayCheckouts = bookings.filter(function (b) { return b.checkOut === today && ['checked_in', 'checked_out'].includes(b.status); }).length;
      var totalUnits = rooms.reduce(function (s, r) { return s + r.totalUnits; }, 0);
      var occupiedNow = bookings.filter(function (b) { return ['confirmed', 'checked_in'].includes(b.status) && b.checkIn <= today && b.checkOut > today; }).length;
      var occupancyRate = totalUnits > 0 ? Math.round((occupiedNow / totalUnits) * 100) : 0;
      var monthlyRevenue = bookings
        .filter(function (b) { return ['confirmed', 'checked_in', 'checked_out'].includes(b.status) && b.createdAt.slice(0, 10) >= monthStart; })
        .reduce(function (s, b) { return s + b.totalAmount; }, 0);
      var availableRoomsNow = Math.max(0, totalUnits - occupiedNow);
      var recent = bookings.slice(0, 8);

      var recentRowsHtml = recent.length ? recent.map(function (b) {
        return '<tr><td style="font-family:var(--font-mono);">' + escapeHtml(b.reference) + '</td><td>' + escapeHtml(b.guestName) + '</td><td>' + escapeHtml(b.roomName) + '</td><td>' + b.checkIn + '</td><td>' + b.checkOut + '</td><td>' + fmtMoney(b.totalAmount) + '</td><td><span class="status-tag status-' + b.status + '">' + titleCase(b.status) + '</span></td></tr>';
      }).join('') : '<tr><td colspan="7" style="text-align:center;color:var(--text-soft);">No bookings yet — try making one from the public site.</td></tr>';

      el.innerHTML =
        '<div class="kpi-grid">' +
          '<div class="kpi-card"><div class="label">Total Bookings</div><div class="value">' + totalBookings + '</div></div>' +
          '<div class="kpi-card"><div class="label">Today\'s Check-ins</div><div class="value">' + todayCheckins + '</div></div>' +
          '<div class="kpi-card"><div class="label">Today\'s Check-outs</div><div class="value">' + todayCheckouts + '</div></div>' +
          '<div class="kpi-card"><div class="label">Occupancy Rate</div><div class="value">' + occupancyRate + '%</div></div>' +
          '<div class="kpi-card"><div class="label">Monthly Revenue</div><div class="value">' + fmtMoney(monthlyRevenue) + '</div></div>' +
          '<div class="kpi-card"><div class="label">Available Rooms</div><div class="value">' + availableRoomsNow + '</div></div>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<div style="padding:var(--space-4); border-bottom:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;">' +
            '<h3 style="margin:0;">Recent bookings</h3>' +
            '<button class="btn btn-outline btn-sm" data-goto="bookings">View all</button>' +
          '</div>' +
          '<table class="data-table">' +
            '<thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Check-in</th><th>Check-out</th><th>Total</th><th>Status</th></tr></thead>' +
            '<tbody>' + recentRowsHtml + '</tbody>' +
          '</table>' +
        '</div>';

      var gotoBtn = document.querySelector('[data-goto="bookings"]');
      if (gotoBtn) gotoBtn.addEventListener('click', function () { document.querySelector('.admin-nav a[data-section="bookings"]').click(); });
    } catch (err) {
      el.innerHTML = '<div class="alert alert-error">Could not load dashboard data. Please refresh.</div>';
    }
  }

  /* ------------------------------------------------------------- BOOKINGS */
  var bookingFilters = { search: '', status: '' };

  async function renderBookings() {
    var el = document.getElementById('section-bookings');
    var statusOptions = ['pending', 'confirmed', 'cancelled', 'checked_in', 'checked_out'].map(function (s) {
      return '<option value="' + s + '" ' + (bookingFilters.status === s ? 'selected' : '') + '>' + titleCase(s) + '</option>';
    }).join('');

    el.innerHTML =
      '<div class="table-toolbar">' +
        '<div class="filters">' +
          '<input type="search" id="bk-search" placeholder="Search guest, email or reference…" value="' + escapeHtml(bookingFilters.search) + '" style="padding:0.6rem 0.9rem;border:1px solid var(--border);border-radius:6px;min-width:240px;">' +
          '<select id="bk-status" style="padding:0.6rem 0.9rem;border:1px solid var(--border);border-radius:6px;"><option value="">All statuses</option>' + statusOptions + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="table-wrap">' +
        '<table class="data-table">' +
          '<thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Check-in</th><th>Check-out</th><th>Guests</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead>' +
          '<tbody id="bookings-tbody">' + loadingRow(9) + '</tbody>' +
        '</table>' +
      '</div>';

    document.getElementById('bk-search').addEventListener('input', function (e) { bookingFilters.search = e.target.value; renderBookings(); });
    document.getElementById('bk-status').addEventListener('change', function (e) { bookingFilters.status = e.target.value; renderBookings(); });

    try {
      var bookings = await UHLData.getBookings(bookingFilters);
      var tbody = document.getElementById('bookings-tbody');
      tbody.innerHTML = bookings.length ? bookings.map(rowForBooking).join('') : '<tr><td colspan="9" style="text-align:center;color:var(--text-soft);padding:2rem;">No bookings match your filters.</td></tr>';

      tbody.querySelectorAll('[data-action]').forEach(function (btn) {
        btn.addEventListener('click', async function () {
          var id = btn.getAttribute('data-id');
          var action = btn.getAttribute('data-action');
          var transitions = { approve: 'confirmed', reject: 'cancelled', cancel: 'cancelled', check_in: 'checked_in', check_out: 'checked_out' };
          if ((action === 'reject' || action === 'cancel') && !confirm('Are you sure?')) return;
          if (transitions[action]) {
            btn.disabled = true;
            try {
              await UHLData.updateBookingStatus(id, transitions[action]);
              flash('success', 'Booking status updated to ' + titleCase(transitions[action]) + '.');
              renderBookings();
            } catch (err) { flash('error', 'Could not update booking.'); btn.disabled = false; }
          } else if (action === 'edit') {
            openBookingEditModal(id, bookings);
          } else if (action === 'print') {
            printBooking(bookings.find(function (b) { return b.id === id; }));
          }
        });
      });
    } catch (err) {
      document.getElementById('bookings-tbody').innerHTML = '<tr><td colspan="9" style="text-align:center;color:var(--color-danger);padding:2rem;">Could not load bookings.</td></tr>';
    }
  }

  function rowForBooking(b) {
    var actions = '';
    if (b.status === 'pending') {
      actions += '<button class="icon-btn" data-action="approve" data-id="' + b.id + '" title="Approve"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6 9 17l-5-5"/></svg></button>';
      actions += '<button class="icon-btn danger" data-action="reject" data-id="' + b.id + '" title="Reject"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg></button>';
    }
    if (b.status === 'confirmed') actions += '<button class="icon-btn" data-action="check_in" data-id="' + b.id + '" title="Check in">→</button>';
    if (b.status === 'checked_in') actions += '<button class="icon-btn" data-action="check_out" data-id="' + b.id + '" title="Check out">←</button>';
    if (!['cancelled', 'checked_out'].includes(b.status)) {
      actions += '<button class="icon-btn danger" data-action="cancel" data-id="' + b.id + '" title="Cancel"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>';
    }
    actions += '<button class="icon-btn" data-action="edit" data-id="' + b.id + '" title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>';
    actions += '<button class="icon-btn" data-action="print" data-id="' + b.id + '" title="Print"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg></button>';

    return '<tr>' +
      '<td style="font-family:var(--font-mono);">' + escapeHtml(b.reference) + '</td>' +
      '<td>' + escapeHtml(b.guestName) + '<br><span style="font-size:0.78rem;color:var(--text-soft);">' + escapeHtml(b.email) + '</span></td>' +
      '<td>' + escapeHtml(b.roomName) + '</td>' +
      '<td>' + b.checkIn + '</td><td>' + b.checkOut + '</td><td>' + b.guests + '</td>' +
      '<td>' + fmtMoney(b.totalAmount) + '</td>' +
      '<td><span class="status-tag status-' + b.status + '">' + titleCase(b.status) + '</span></td>' +
      '<td><div class="row-actions">' + actions + '</div></td>' +
    '</tr>';
  }

  function openBookingEditModal(id, bookingsList) {
    var b = bookingsList.find(function (x) { return x.id === id; });
    if (!b) return;
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop show';
    backdrop.innerHTML =
      '<div class="modal">' +
        '<div class="modal-header"><h3 style="margin:0;">Edit Booking ' + escapeHtml(b.reference) + '</h3><button type="button" class="icon-btn" data-close>✕</button></div>' +
        '<form id="edit-booking-form">' +
          '<div class="form-grid">' +
            '<div class="form-group"><label>Check-in</label><input type="date" name="checkIn" value="' + b.checkIn + '" required></div>' +
            '<div class="form-group"><label>Check-out</label><input type="date" name="checkOut" value="' + b.checkOut + '" required></div>' +
            '<div class="form-group"><label>Guests</label><input type="number" name="guests" min="1" max="12" value="' + b.guests + '" required></div>' +
            '<div class="form-group full"><label>Special requests</label><textarea name="specialRequests">' + escapeHtml(b.specialRequests) + '</textarea></div>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary" style="margin-top:var(--space-3);">Save Changes</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-close]').addEventListener('click', function () { backdrop.remove(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('#edit-booking-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var fd = Object.fromEntries(new FormData(e.target).entries());
      if (fd.checkOut <= fd.checkIn) { flash('error', 'Check-out must be after check-in.'); return; }
      try {
        await UHLData.updateBooking(id, fd);
        backdrop.remove();
        flash('success', 'Booking updated.');
        renderBookings();
      } catch (err) { flash('error', 'Could not update booking.'); }
    });
  }

  function printBooking(b) {
    if (!b) return;
    var w = window.open('', '_blank');
    var html = '<html><head><title>Booking ' + escapeHtml(b.reference) + '</title>' +
      '<style>body{font-family:Arial,sans-serif;color:#14201b;max-width:640px;margin:40px auto;padding:0 20px;}' +
      'h1{color:#0e3b2e;font-size:1.4rem;} table{width:100%;border-collapse:collapse;margin-top:20px;}' +
      'td{padding:8px 0;border-bottom:1px solid #dcdcd6;} td:first-child{color:#4a5750;width:40%;}' +
      '.ref{font-size:1.2rem;font-weight:bold;letter-spacing:0.05em;}</style></head><body>' +
      '<h1>Urban Haven Lodge — Booking Confirmation</h1>' +
      '<p class="ref">Reference: ' + escapeHtml(b.reference) + '</p>' +
      '<table>' +
        '<tr><td>Guest name</td><td>' + escapeHtml(b.guestName) + '</td></tr>' +
        '<tr><td>Email</td><td>' + escapeHtml(b.email) + '</td></tr>' +
        '<tr><td>Phone</td><td>' + escapeHtml(b.phone) + '</td></tr>' +
        '<tr><td>Room</td><td>' + escapeHtml(b.roomName) + '</td></tr>' +
        '<tr><td>Check-in</td><td>' + b.checkIn + '</td></tr>' +
        '<tr><td>Check-out</td><td>' + b.checkOut + '</td></tr>' +
        '<tr><td>Nights</td><td>' + b.nights + '</td></tr>' +
        '<tr><td>Guests</td><td>' + b.guests + '</td></tr>' +
        '<tr><td>Total</td><td><strong>' + fmtMoney(b.totalAmount) + '</strong></td></tr>' +
        '<tr><td>Status</td><td>' + titleCase(b.status) + '</td></tr>' +
      '</table>' +
      '<script>window.print()<' + '/script>' +
      '</body></html>';
    w.document.write(html);
    w.document.close();
  }

  /* ---------------------------------------------------------------- ROOMS */
  async function renderRooms() {
    var el = document.getElementById('section-rooms');
    el.innerHTML = '<div class="table-toolbar"><div></div><button class="btn btn-primary btn-sm" id="add-room-btn">+ Add Room Category</button></div><p class="hint">Loading rooms…</p>';
    document.getElementById('add-room-btn').addEventListener('click', function () { openRoomModal(null); });

    try {
      var rooms = await UHLData.getRooms({});
      var grid = document.createElement('div');
      grid.className = 'grid-3';
      grid.innerHTML = rooms.map(function (r) {
        var tags = (r.amenities || []).slice(0, 3).map(function (a) { return '<span>' + escapeHtml(a) + '</span>'; }).join('');
        return '<div class="room-card">' +
          '<div class="room-media">' +
            '<span class="badge ' + (r.isActive ? 'available' : 'full') + '">' + (r.isActive ? 'Active' : 'Hidden') + '</span>' +
            '<img src="' + escapeHtml((r.images && r.images[0]) || '') + '" alt="' + escapeHtml(r.name) + '" onerror="this.style.opacity=0.15">' +
          '</div>' +
          '<div class="room-body">' +
            '<h4>' + escapeHtml(r.name) + '</h4>' +
            '<div class="room-price">' + fmtMoney(r.price) + ' <span>/ night</span></div>' +
            '<div class="room-meta"><span>👤 ' + r.capacity + '</span><span>📐 ' + (r.size ? r.size + 'm²' : '—') + '</span><span>🔑 ' + r.totalUnits + ' units</span></div>' +
            '<div class="amenity-tags">' + tags + '</div>' +
            '<div class="room-actions">' +
              '<button class="btn btn-outline btn-sm" data-edit-room="' + r.slug + '">Edit</button>' +
              '<button class="btn btn-outline btn-sm" data-toggle-room="' + r.slug + '">' + (r.isActive ? 'Hide' : 'Show') + '</button>' +
              '<button class="btn btn-outline btn-sm" data-delete-room="' + r.slug + '" style="color:var(--color-danger);">Delete</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      }).join('');

      el.innerHTML = '<div class="table-toolbar"><div></div><button class="btn btn-primary btn-sm" id="add-room-btn">+ Add Room Category</button></div>';
      el.appendChild(grid);

      document.getElementById('add-room-btn').addEventListener('click', function () { openRoomModal(null); });
      el.querySelectorAll('[data-edit-room]').forEach(function (b) { b.addEventListener('click', function () { openRoomModal(rooms.find(function (r) { return r.slug === b.getAttribute('data-edit-room'); })); }); });
      el.querySelectorAll('[data-toggle-room]').forEach(function (b) {
        b.addEventListener('click', async function () {
          var room = rooms.find(function (r) { return r.slug === b.getAttribute('data-toggle-room'); });
          try {
            await UHLData.saveRoom(Object.assign({}, room, { isActive: !room.isActive }));
            flash('success', 'Availability updated.');
            renderRooms();
          } catch (err) { flash('error', 'Could not update room.'); }
        });
      });
      el.querySelectorAll('[data-delete-room]').forEach(function (b) {
        b.addEventListener('click', async function () {
          if (!confirm('Delete this room category?')) return;
          try {
            var result = await UHLData.deleteRoom(b.getAttribute('data-delete-room'));
            flash('success', result.deactivated ? 'Room has existing bookings, so it was hidden instead of deleted.' : 'Room category deleted.');
            renderRooms();
          } catch (err) { flash('error', 'Could not delete room.'); }
        });
      });
    } catch (err) {
      el.innerHTML = '<div class="alert alert-error">Could not load rooms.</div>';
    }
  }

  function openRoomModal(room) {
    room = room || { slug: '', name: '', description: '', price: '', capacity: 2, size: '', bedConfig: '', amenities: [], images: [], totalUnits: 4, isActive: true };
    var isEdit = !!room.slug;
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop show';
    backdrop.innerHTML =
      '<div class="modal">' +
        '<div class="modal-header"><h3 style="margin:0;">' + (isEdit ? 'Edit' : 'Add') + ' Room Category</h3><button type="button" class="icon-btn" data-close>✕</button></div>' +
        '<form id="room-form">' +
          '<div class="form-grid">' +
            '<div class="form-group"><label>Name</label><input type="text" name="name" value="' + escapeHtml(room.name) + '" required></div>' +
            '<div class="form-group"><label>Slug</label><input type="text" name="slug" value="' + escapeHtml(room.slug) + '" placeholder="auto-generated if blank" ' + (isEdit ? 'readonly' : '') + '></div>' +
            '<div class="form-group"><label>Price / night (K)</label><input type="number" step="0.01" name="price" value="' + room.price + '" required></div>' +
            '<div class="form-group"><label>Capacity (guests)</label><input type="number" name="capacity" value="' + room.capacity + '" required></div>' +
            '<div class="form-group"><label>Size (m²)</label><input type="number" name="size" value="' + (room.size || '') + '"></div>' +
            '<div class="form-group"><label>Total units in service</label><input type="number" name="totalUnits" value="' + room.totalUnits + '" required></div>' +
            '<div class="form-group full"><label>Bed configuration</label><input type="text" name="bedConfig" value="' + escapeHtml(room.bedConfig || '') + '"></div>' +
            '<div class="form-group full"><label>Description</label><textarea name="description">' + escapeHtml(room.description || '') + '</textarea></div>' +
            '<div class="form-group full"><label>Amenities (comma-separated)</label><input type="text" name="amenities" value="' + escapeHtml((room.amenities || []).join(', ')) + '"></div>' +
            '<div class="form-group full"><label>Image URL(s), comma-separated</label><input type="text" name="images" value="' + escapeHtml((room.images || []).join(', ')) + '" placeholder="https://..."></div>' +
            '<div class="form-group full"><label><input type="checkbox" name="isActive" ' + (room.isActive ? 'checked' : '') + '> Visible on public site</label></div>' +
          '</div>' +
          '<button type="submit" class="btn btn-primary" style="margin-top:var(--space-3);">Save Room</button>' +
        '</form>' +
      '</div>';
    document.body.appendChild(backdrop);
    backdrop.querySelector('[data-close]').addEventListener('click', function () { backdrop.remove(); });
    backdrop.addEventListener('click', function (e) { if (e.target === backdrop) backdrop.remove(); });
    backdrop.querySelector('#room-form').addEventListener('submit', async function (e) {
      e.preventDefault();
      var fd = Object.fromEntries(new FormData(e.target).entries());
      var newSlug = (fd.slug || fd.name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      if (!newSlug || !fd.name || Number(fd.price) <= 0 || Number(fd.capacity) < 1) { flash('error', 'Please fill in name, price and capacity correctly.'); return; }
      try {
        await UHLData.saveRoom({
          slug: newSlug, name: fd.name, description: fd.description,
          price: Number(fd.price), capacity: Number(fd.capacity), size: fd.size ? Number(fd.size) : null,
          bedConfig: fd.bedConfig, totalUnits: Number(fd.totalUnits) || 1,
          amenities: fd.amenities.split(',').map(function (a) { return a.trim(); }).filter(Boolean),
          images: fd.images.split(',').map(function (a) { return a.trim(); }).filter(Boolean),
          isActive: fd.isActive === 'on',
        });
        backdrop.remove();
        flash('success', 'Room saved.');
        renderRooms();
      } catch (err) { flash('error', 'Could not save room — slug may already be in use.'); }
    });
  }

  /* ------------------------------------------------------------ CUSTOMERS */
  var customerSearch = '';

  async function renderCustomers() {
    var el = document.getElementById('section-customers');
    el.innerHTML =
      '<div class="table-toolbar"><div class="filters"><input type="search" id="cust-search" placeholder="Search name, email or phone…" value="' + escapeHtml(customerSearch) + '" style="padding:0.6rem 0.9rem;border:1px solid var(--border);border-radius:6px;min-width:260px;"></div></div>' +
      '<div class="table-wrap"><table class="data-table"><thead><tr><th>Name</th><th>Contact</th><th>Bookings</th><th>Lifetime value</th><th>Last booking</th><th>Notes</th></tr></thead><tbody id="customers-tbody">' + loadingRow(6) + '</tbody></table></div>';

    document.getElementById('cust-search').addEventListener('input', function (e) { customerSearch = e.target.value; renderCustomers(); });

    try {
      var customers = await UHLData.getCustomers(customerSearch);
      var tbody = document.getElementById('customers-tbody');
      tbody.innerHTML = customers.length ? customers.map(function (c) {
        return '<tr>' +
          '<td>' + escapeHtml(c.fullName) + '</td>' +
          '<td>' + escapeHtml(c.email) + '<br><span style="font-size:0.78rem;color:var(--text-soft);">' + escapeHtml(c.phone) + '</span></td>' +
          '<td>' + c.totalBookings + '</td>' +
          '<td>' + fmtMoney(c.lifetimeValue) + '</td>' +
          '<td>' + (c.lastBookingAt ? new Date(c.lastBookingAt).toLocaleDateString() : '—') + '</td>' +
          '<td><button class="btn btn-outline btn-sm" data-notes="' + c.id + '">' + (c.notes ? 'View/Edit' : 'Add note') + '</button></td>' +
        '</tr>';
      }).join('') : '<tr><td colspan="6" style="text-align:center;color:var(--text-soft);padding:2rem;">No customers yet.</td></tr>';

      tbody.querySelectorAll('[data-notes]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var id = btn.getAttribute('data-notes');
          var customer = customers.find(function (c) { return c.id === id; });
          var backdrop = document.createElement('div');
          backdrop.className = 'modal-backdrop show';
          backdrop.innerHTML =
            '<div class="modal">' +
              '<div class="modal-header"><h3 style="margin:0;">Notes — ' + escapeHtml(customer.fullName) + '</h3><button type="button" class="icon-btn" data-close>✕</button></div>' +
              '<form id="notes-form">' +
                '<div class="form-group"><textarea rows="5" name="notes" placeholder="Internal notes — never visible to the guest">' + escapeHtml(customer.notes || '') + '</textarea></div>' +
                '<button type="submit" class="btn btn-primary btn-sm" style="margin-top:var(--space-2);">Save Notes</button>' +
              '</form></div>';
          document.body.appendChild(backdrop);
          backdrop.querySelector('[data-close]').addEventListener('click', function () { backdrop.remove(); });
          backdrop.querySelector('#notes-form').addEventListener('submit', async function (e) {
            e.preventDefault();
            try {
              await UHLData.saveCustomerNotes(id, new FormData(e.target).get('notes'));
              backdrop.remove();
              flash('success', 'Notes saved.');
              renderCustomers();
            } catch (err) { flash('error', 'Could not save notes.'); }
          });
        });
      });
    } catch (err) {
      document.getElementById('customers-tbody').innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--color-danger);padding:2rem;">Could not load customers.</td></tr>';
    }
  }

  /* -------------------------------------------------------------- REPORTS */
  function renderReports() {
    var to = new Date().toISOString().slice(0, 10);
    var from = to.slice(0, 8) + '01';
    renderReportsWithRange(from, to);
  }

  async function renderReportsWithRange(from, to) {
    var el = document.getElementById('section-reports');
    el.innerHTML = '<p class="hint">Loading reports…</p>';
    try {
      var data = await UHLData.getReportData(from, to);
      var maxRevenue = Math.max(1, ...data.revenueByRoom.map(function (r) { return r.revenue; }));
      var maxTrend = Math.max(1, ...data.trend.map(function (t) { return t.count; }));

      var revenueBarsHtml = data.revenueByRoom.map(function (r) {
        return '<div style="margin-bottom:var(--space-3);">' +
          '<div style="display:flex;justify-content:space-between;font-size:0.88rem;margin-bottom:4px;"><span>' + escapeHtml(r.name) + ' (' + r.bookings + ' bookings)</span><span style="font-weight:600;">' + fmtMoney(r.revenue) + '</span></div>' +
          '<div style="background:var(--surface-alt);border-radius:4px;height:10px;overflow:hidden;"><div style="background:var(--color-accent);height:100%;width:' + Math.round((r.revenue / maxRevenue) * 100) + '%;"></div></div>' +
        '</div>';
      }).join('');

      var occupancyRowsHtml = data.occupancy.map(function (o) {
        return '<tr><td>' + escapeHtml(o.name) + '</td><td>' + o.totalUnits + '</td><td>' + o.bookedUnits + '</td><td>' + o.rate + '%</td></tr>';
      }).join('');

      var trendBarsHtml = data.trend.length ? data.trend.map(function (t) {
        return '<div title="' + t.date + ': ' + t.count + '" style="flex:1;background:var(--color-primary);border-radius:3px 3px 0 0;height:' + Math.round((t.count / maxTrend) * 100) + '%;min-height:4px;"></div>';
      }).join('') : '<p class="hint">No bookings in this range.</p>';

      el.innerHTML =
        '<div class="table-toolbar">' +
          '<div class="filters">' +
            '<input type="date" id="rep-from" value="' + from + '" style="padding:0.6rem 0.9rem;border:1px solid var(--border);border-radius:6px;">' +
            '<input type="date" id="rep-to" value="' + to + '" style="padding:0.6rem 0.9rem;border:1px solid var(--border);border-radius:6px;">' +
            '<button class="btn btn-primary btn-sm" id="rep-update">Update</button>' +
          '</div>' +
          '<div class="filters">' +
            '<button class="btn btn-outline btn-sm" id="rep-export-csv">Export to Excel (CSV)</button>' +
            '<button class="btn btn-outline btn-sm" id="rep-export-pdf">Export to PDF</button>' +
          '</div>' +
        '</div>' +
        '<div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);">' +
          '<div class="kpi-card"><div class="label">Total Revenue</div><div class="value">' + fmtMoney(data.totalRevenue) + '</div></div>' +
          '<div class="kpi-card"><div class="label">Confirmed</div><div class="value">' + (data.statusCounts.confirmed || 0) + '</div></div>' +
          '<div class="kpi-card"><div class="label">Pending</div><div class="value">' + (data.statusCounts.pending || 0) + '</div></div>' +
          '<div class="kpi-card"><div class="label">Cancelled</div><div class="value">' + (data.statusCounts.cancelled || 0) + '</div></div>' +
        '</div>' +
        '<div class="table-wrap" style="margin-bottom:var(--space-5);">' +
          '<div style="padding:var(--space-4);border-bottom:1px solid var(--border);"><h3 style="margin:0;">Revenue by room type</h3></div>' +
          '<div style="padding:var(--space-4);">' + revenueBarsHtml + '</div>' +
        '</div>' +
        '<div class="table-wrap" style="margin-bottom:var(--space-5);">' +
          '<div style="padding:var(--space-4);border-bottom:1px solid var(--border);"><h3 style="margin:0;">Occupancy by room type</h3></div>' +
          '<table class="data-table"><thead><tr><th>Room type</th><th>Units</th><th>Booked (range)</th><th>Occupancy</th></tr></thead><tbody>' + occupancyRowsHtml + '</tbody></table>' +
        '</div>' +
        '<div class="table-wrap">' +
          '<div style="padding:var(--space-4);border-bottom:1px solid var(--border);"><h3 style="margin:0;">Booking trend (created per day)</h3></div>' +
          '<div style="padding:var(--space-4);display:flex;align-items:flex-end;gap:4px;height:140px;">' + trendBarsHtml + '</div>' +
        '</div>';

      document.getElementById('rep-update').addEventListener('click', function () {
        renderReportsWithRange(document.getElementById('rep-from').value, document.getElementById('rep-to').value);
      });
      document.getElementById('rep-export-csv').addEventListener('click', async function () {
        var csv = await UHLData.exportBookingsCSV(from, to);
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url; a.download = 'urban-haven-bookings-' + from + '-to-' + to + '.csv';
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
      });
      document.getElementById('rep-export-pdf').addEventListener('click', function () {
        var w = window.open('', '_blank');
        var rowsHtml = data.revenueByRoom.map(function (r) { return '<tr><td>' + escapeHtml(r.name) + '</td><td>' + r.bookings + '</td><td>' + fmtMoney(r.revenue) + '</td></tr>'; }).join('');
        var html = '<html><head><title>Report ' + from + ' to ' + to + '</title>' +
          '<style>body{font-family:Arial,sans-serif;color:#14201b;max-width:720px;margin:40px auto;padding:0 20px;}' +
          'h1{color:#0e3b2e;font-size:1.4rem;margin-bottom:4px;} .range{color:#4a5750;margin-bottom:24px;}' +
          'table{width:100%;border-collapse:collapse;margin-bottom:24px;} th,td{text-align:left;padding:8px;border-bottom:1px solid #dcdcd6;}' +
          'th{background:#f4f4f2;font-size:0.8rem;text-transform:uppercase;} .total{font-size:1.1rem;font-weight:bold;margin-top:12px;}</style>' +
          '</head><body>' +
          '<h1>Urban Haven Lodge — Revenue &amp; Booking Report</h1>' +
          '<p class="range">' + from + ' to ' + to + '</p>' +
          '<table><thead><tr><th>Room type</th><th>Bookings</th><th>Revenue</th></tr></thead><tbody>' + rowsHtml + '</tbody></table>' +
          '<p class="total">Total Revenue: ' + fmtMoney(data.totalRevenue) + '</p>' +
          '<script>window.print()<' + '/script></body></html>';
        w.document.write(html);
        w.document.close();
      });
    } catch (err) {
      el.innerHTML = '<div class="alert alert-error">Could not load reports.</div>';
    }
  }

  /* -------------------------------------------------------------- SETTINGS */
  async function renderSettings() {
    var el = document.getElementById('section-settings');
    el.innerHTML = '<p class="hint">Loading settings…</p>';
    try {
      var settings = await UHLData.getSettings();
      var user = UHLData.currentUser();
      el.innerHTML =
        '<div class="card-panel" style="margin-bottom:var(--space-5);">' +
          '<h3>Lodge details</h3>' +
          '<form id="settings-form">' +
            '<div class="form-grid">' +
              '<div class="form-group"><label>Lodge name</label><input type="text" name="lodgeName" value="' + escapeHtml(settings.lodgeName || '') + '"></div>' +
              '<div class="form-group"><label>Contact email</label><input type="email" name="lodgeEmail" value="' + escapeHtml(settings.lodgeEmail || '') + '"></div>' +
              '<div class="form-group"><label>Contact phone</label><input type="text" name="lodgePhone" value="' + escapeHtml(settings.lodgePhone || '') + '"></div>' +
              '<div class="form-group"><label>Currency symbol</label><input type="text" name="currencySymbol" value="' + escapeHtml(settings.currencySymbol || '') + '"></div>' +
              '<div class="form-group"><label>Check-in time</label><input type="time" name="checkinTime" value="' + escapeHtml(settings.checkinTime || '') + '"></div>' +
              '<div class="form-group"><label>Check-out time</label><input type="time" name="checkoutTime" value="' + escapeHtml(settings.checkoutTime || '') + '"></div>' +
              '<div class="form-group full"><label>Address</label><input type="text" name="lodgeAddress" value="' + escapeHtml(settings.lodgeAddress || '') + '"></div>' +
            '</div>' +
            '<button type="submit" class="btn btn-primary btn-sm" style="margin-top:var(--space-3);">Save Lodge Details</button>' +
          '</form>' +
        '</div>' +
        '<div class="card-panel" style="margin-bottom:var(--space-5);">' +
          '<h3>Change your password</h3>' +
          '<form id="password-form">' +
            '<div class="form-grid">' +
              '<div class="form-group"><label>Current password</label><input type="password" name="current" required></div>' +
              '<div class="form-group"></div>' +
              '<div class="form-group"><label>New password</label><input type="password" name="next" minlength="8" required></div>' +
              '<div class="form-group"><label>Confirm new password</label><input type="password" name="confirm" minlength="8" required></div>' +
            '</div>' +
            '<button type="submit" class="btn btn-primary btn-sm" style="margin-top:var(--space-3);">Update Password</button>' +
          '</form>' +
        '</div>' +
        '<div class="card-panel">' +
          '<h3>Account</h3>' +
          '<p>Signed in as <strong>' + escapeHtml(user.name) + '</strong> (' + escapeHtml(user.email) + ') — role: <span style="text-transform:capitalize;">' + escapeHtml(user.role.replace('_', ' ')) + '</span></p>' +
        '</div>';

      el.querySelector('#settings-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var fd = Object.fromEntries(new FormData(e.target).entries());
        try { await UHLData.saveSettings(fd); flash('success', 'Lodge settings saved.'); }
        catch (err) { flash('error', 'Could not save settings.'); }
      });
      el.querySelector('#password-form').addEventListener('submit', async function (e) {
        e.preventDefault();
        var fd = Object.fromEntries(new FormData(e.target).entries());
        if (fd.next !== fd.confirm) { flash('error', 'New password and confirmation do not match.'); return; }
        try {
          var result = await UHLData.changePassword(user.id, fd.current, fd.next);
          if (result.success) { flash('success', 'Password changed.'); e.target.reset(); }
          else { flash('error', result.message); }
        } catch (err) { flash('error', 'Could not change password.'); }
      });
    } catch (err) {
      el.innerHTML = '<div class="alert alert-error">Could not load settings.</div>';
    }
  }

  /* ------------------------------------------------------------------ INIT */
  showApp();
})();
