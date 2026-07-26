/**
 * Urban Haven Lodge — Supabase-backed data layer
 * ---------------------------------------------------------------------------
 * Same public API shape as the earlier localStorage version, but every
 * function now talks to a real, shared Postgres database via Supabase, so
 * bookings made by one visitor are visible to every other visitor and to
 * the admin dashboard — from any device, immediately.
 *
 * Booking creation and admin login run through Postgres RPC functions
 * (create_booking, verify_admin_login, etc.) defined with SECURITY DEFINER,
 * which is what makes double-booking prevention atomic and keeps the
 * admin_users password hashes unreachable from client code — see
 * database/supabase-schema.sql for the full definitions.
 *
 * This file loads the Supabase JS client from a CDN — make sure this tag
 * appears BEFORE this file on every page:
 *   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js"></script>
 * ---------------------------------------------------------------------------
 */
(function (global) {
  'use strict';

  const SUPABASE_URL = 'https://fbcevetyfknkjtudgcyf.supabase.co';
  const SUPABASE_ANON_KEY = 'sb_publishable_kix3nBlHZ1EIX_QQReXYgg_nTkrslZf';

  const client = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  function nightsBetween(checkIn, checkOut) {
    const a = new Date(checkIn), b = new Date(checkOut);
    return Math.round((b - a) / (1000 * 60 * 60 * 24));
  }

  function mapRoom(r) {
    return {
      id: r.id, slug: r.slug, name: r.name, description: r.description,
      price: Number(r.price_per_night), capacity: r.capacity, size: r.size_sqm,
      bedConfig: r.bed_config, amenities: r.amenities || [], images: r.images || [],
      totalUnits: r.total_units, isActive: r.is_active, sortOrder: r.sort_order,
    };
  }

  function mapBooking(b, customer, room) {
    return {
      id: b.id, reference: b.booking_reference, customerId: b.customer_id,
      roomCategoryId: b.room_category_id, roomSlug: room ? room.slug : null,
      roomName: room ? room.name : '',
      checkIn: b.check_in, checkOut: b.check_out, guests: b.guests, nights: b.nights,
      ratePerNight: Number(b.rate_per_night), totalAmount: Number(b.total_amount),
      specialRequests: b.special_requests || '', status: b.status, source: b.source,
      createdAt: b.created_at,
      guestName: customer ? customer.full_name : '',
      email: customer ? customer.email : '',
      phone: customer ? customer.phone : '',
    };
  }

  async function unwrap(promise) {
    const { data, error } = await promise;
    if (error) throw error;
    return data;
  }

  // ---- Rooms --------------------------------------------------------------------
  async function getRooms({ activeOnly = false } = {}) {
    let q = client.from('room_categories').select('*').order('sort_order');
    if (activeOnly) q = q.eq('is_active', true);
    const data = await unwrap(q);
    return data.map(mapRoom);
  }

  async function getRoomBySlug(slug) {
    const data = await unwrap(client.from('room_categories').select('*').eq('slug', slug).maybeSingle());
    return data ? mapRoom(data) : null;
  }

  async function saveRoom(room) {
    const row = {
      slug: room.slug, name: room.name, description: room.description || null,
      price_per_night: room.price, capacity: room.capacity, size_sqm: room.size || null,
      bed_config: room.bedConfig || null, amenities: room.amenities || [], images: room.images || [],
      total_units: room.totalUnits, is_active: room.isActive,
    };
    const data = await unwrap(client.from('room_categories').upsert(row, { onConflict: 'slug' }).select().single());
    return mapRoom(data);
  }

  async function deleteRoom(slug) {
    const room = await getRoomBySlug(slug);
    if (!room) return { deleted: false, deactivated: false };
    const { count } = await client.from('bookings').select('id', { count: 'exact', head: true }).eq('room_category_id', room.id);
    if (count > 0) {
      await unwrap(client.from('room_categories').update({ is_active: false }).eq('slug', slug));
      return { deleted: false, deactivated: true };
    }
    await unwrap(client.from('room_categories').delete().eq('slug', slug));
    return { deleted: true, deactivated: false };
  }

  // ---- Availability & booking (via RPC — atomic, race-safe) ---------------------------
  async function checkAvailability(roomSlug, checkIn, checkOut) {
    const data = await unwrap(client.rpc('check_room_availability', {
      p_room_slug: roomSlug, p_check_in: checkIn, p_check_out: checkOut,
    }));
    return { available: data.available, roomsFree: data.rooms_free, message: data.message };
  }

  async function createBooking(input) {
    const data = await unwrap(client.rpc('create_booking', {
      p_check_in: input.checkIn, p_check_out: input.checkOut, p_room_slug: input.roomType,
      p_guests: input.guests, p_full_name: input.fullName, p_email: input.email,
      p_phone: input.phone, p_id_number: input.idNumber || '', p_special_requests: input.specialRequests || '',
    }));
    return data.success
      ? { success: true, bookingReference: data.booking_reference, totalAmount: Number(data.total_amount), nights: data.nights }
      : { success: false, message: data.message };
  }

  async function getBookingByReference(ref) {
    const data = await unwrap(client.rpc('get_booking_by_reference', { p_reference: ref }));
    if (data.error) return null;
    return {
      reference: data.reference, status: data.status, checkIn: data.check_in, checkOut: data.check_out,
      guests: data.guests, totalAmount: Number(data.total_amount), guestName: data.guest_name, roomName: data.room_name,
    };
  }

  async function getBookings({ search = '', status = '' } = {}) {
    let q = client
      .from('bookings')
      .select('*, customers(full_name,email,phone), room_categories(name,slug)')
      .order('created_at', { ascending: false });
    if (status) q = q.eq('status', status);
    const data = await unwrap(q);
    let mapped = data.map((b) => mapBooking(b, b.customers, b.room_categories));
    if (search) {
      const term = search.toLowerCase();
      mapped = mapped.filter((b) =>
        b.guestName.toLowerCase().includes(term) || b.email.toLowerCase().includes(term) || b.reference.toLowerCase().includes(term));
    }
    return mapped;
  }

  async function updateBookingStatus(bookingId, newStatus) {
    await unwrap(client.from('bookings').update({ status: newStatus, updated_at: new Date().toISOString() }).eq('id', bookingId));
    return { success: true };
  }

  async function updateBooking(bookingId, fields) {
    const current = await unwrap(client.from('bookings').select('rate_per_night').eq('id', bookingId).single());
    const nights = nightsBetween(fields.checkIn, fields.checkOut);
    const total = Math.round(Number(current.rate_per_night) * nights * 100) / 100;
    await unwrap(client.from('bookings').update({
      check_in: fields.checkIn, check_out: fields.checkOut, guests: Number(fields.guests),
      special_requests: fields.specialRequests || null, nights, total_amount: total,
      updated_at: new Date().toISOString(),
    }).eq('id', bookingId));
    return { success: true };
  }

  // ---- Customers ------------------------------------------------------------------
  async function getCustomers(search = '') {
    const customers = await unwrap(client.from('customers').select('*'));
    const bookings = await unwrap(client.from('bookings').select('customer_id,status,total_amount,created_at'));

    let result = customers.map((c) => {
      const own = bookings.filter((b) => b.customer_id === c.id);
      const lifetimeValue = own.filter((b) => ['confirmed', 'checked_in', 'checked_out'].includes(b.status)).reduce((s, b) => s + Number(b.total_amount), 0);
      const lastBookingAt = own.length ? own.map((b) => b.created_at).sort().slice(-1)[0] : null;
      return {
        id: c.id, fullName: c.full_name, email: c.email, phone: c.phone,
        idNumber: c.id_number, notes: c.notes, totalBookings: own.length, lifetimeValue, lastBookingAt,
      };
    });

    if (search) {
      const term = search.toLowerCase();
      result = result.filter((c) => c.fullName.toLowerCase().includes(term) || c.email.toLowerCase().includes(term) || c.phone.includes(search));
    }
    return result.sort((a, b) => (b.lastBookingAt || '').localeCompare(a.lastBookingAt || ''));
  }

  async function saveCustomerNotes(customerId, notes) {
    await unwrap(client.from('customers').update({ notes: notes || null, updated_at: new Date().toISOString() }).eq('id', customerId));
    return { success: true };
  }

  // ---- Contact / newsletter ---------------------------------------------------------
  async function addContactMessage(msg) {
    await unwrap(client.from('contact_messages').insert({
      full_name: msg.fullName, email: msg.email, phone: msg.phone || null, subject: msg.subject, message: msg.message,
    }));
    return { success: true };
  }

  async function addNewsletterSignup(email) {
    await unwrap(client.from('newsletter_subscribers').upsert({ email, is_active: true }, { onConflict: 'email' }));
    return { success: true };
  }

  // ---- Settings ---------------------------------------------------------------------
  function toCamel(snake) { return snake.replace(/_([a-z])/g, (_, c) => c.toUpperCase()); }
  function toSnake(camel) { return camel.replace(/[A-Z]/g, (c) => '_' + c.toLowerCase()); }

  async function getSettings() {
    const rows = await unwrap(client.from('settings').select('*'));
    const map = {};
    rows.forEach((r) => { map[toCamel(r.key)] = r.value; });
    return {
      lodgeName: map.lodgeName, lodgeAddress: map.lodgeAddress, lodgeEmail: map.lodgeEmail,
      lodgePhone: map.lodgePhone, checkinTime: map.checkinTime, checkoutTime: map.checkoutTime,
      currencySymbol: map.currencySymbol || 'K',
    };
  }

  async function saveSettings(fields) {
    const rows = Object.keys(fields).map((k) => ({ key: toSnake(k), value: String(fields[k]) }));
    await unwrap(client.from('settings').upsert(rows, { onConflict: 'key' }));
    return getSettings();
  }

  // ---- Reports ------------------------------------------------------------------------
  async function getReportData(from, to) {
    const rooms = await getRooms({});
    const bookingsInStayRange = await unwrap(client.from('bookings').select('*').gte('check_in', from).lte('check_in', to));
    const bookingsCreatedInRange = await unwrap(
      client.from('bookings').select('*').gte('created_at', from).lte('created_at', to + 'T23:59:59')
    );

    const revenueByRoom = rooms.map((room) => {
      const roomBookings = bookingsInStayRange.filter((b) => b.room_category_id === room.id && ['confirmed', 'checked_in', 'checked_out'].includes(b.status));
      return { name: room.name, bookings: roomBookings.length, revenue: roomBookings.reduce((s, b) => s + Number(b.total_amount), 0) };
    }).sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = revenueByRoom.reduce((s, r) => s + r.revenue, 0);

    const occupancy = rooms.map((room) => {
      const bookedUnits = bookingsInStayRange.filter((b) =>
        b.room_category_id === room.id && ['confirmed', 'checked_in', 'checked_out'].includes(b.status) &&
        b.check_in <= to && b.check_out >= from
      ).length;
      const capped = Math.min(bookedUnits, room.totalUnits);
      const rate = room.totalUnits > 0 ? Math.round((capped / room.totalUnits) * 100) : 0;
      return { name: room.name, totalUnits: room.totalUnits, bookedUnits: capped, rate };
    });

    const trendMap = {};
    bookingsCreatedInRange.forEach((b) => { const d = b.created_at.slice(0, 10); trendMap[d] = (trendMap[d] || 0) + 1; });
    const trend = Object.keys(trendMap).sort().map((d) => ({ date: d, count: trendMap[d] }));

    const statusCounts = {};
    bookingsCreatedInRange.forEach((b) => { statusCounts[b.status] = (statusCounts[b.status] || 0) + 1; });

    return { revenueByRoom, totalRevenue, occupancy, trend, statusCounts };
  }

  async function exportBookingsCSV(from, to) {
    const data = await unwrap(
      client.from('bookings').select('*, customers(full_name,email,phone), room_categories(name)')
        .gte('created_at', from).lte('created_at', to + 'T23:59:59').order('created_at', { ascending: false })
    );
    const rows = data.map((b) => [
      b.booking_reference, b.customers?.full_name, b.customers?.email, b.customers?.phone, b.room_categories?.name,
      b.check_in, b.check_out, b.nights, b.guests, Number(b.total_amount).toFixed(2), b.status, b.created_at,
    ]);
    const header = ['Reference', 'Guest', 'Email', 'Phone', 'Room', 'Check-in', 'Check-out', 'Nights', 'Guests', 'Total', 'Status', 'Created At'];
    const csv = [header, ...rows].map((r) => r.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    return '\uFEFF' + csv;
  }

  // ---- Admin auth (via RPC — password hash never reaches the client) ------------------------
  async function login(email, password) {
    const data = await unwrap(client.rpc('verify_admin_login', { p_email: email, p_password: password }));
    if (!data.success) return { success: false, message: data.message };
    const user = { id: data.id, name: data.name, email: data.email, role: data.role };
    sessionStorage.setItem('uhl_admin_session', JSON.stringify(user));
    return { success: true, user };
  }

  function logout() { sessionStorage.removeItem('uhl_admin_session'); }
  function currentUser() { try { return JSON.parse(sessionStorage.getItem('uhl_admin_session')); } catch (e) { return null; } }

  async function changePassword(userId, currentPassword, newPassword) {
    return unwrap(client.rpc('change_admin_password', {
      p_user_id: userId, p_current_password: currentPassword, p_new_password: newPassword,
    }));
  }

  global.UHLData = {
    getRooms, getRoomBySlug, saveRoom, deleteRoom,
    checkAvailability, createBooking, getBookingByReference, getBookings, updateBookingStatus, updateBooking,
    getCustomers, saveCustomerNotes,
    addContactMessage, addNewsletterSignup,
    getSettings, saveSettings,
    getReportData, exportBookingsCSV,
    login, logout, currentUser, changePassword,
    nightsBetween,
  };
})(window);
