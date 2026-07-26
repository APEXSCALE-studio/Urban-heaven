/**
 * Urban Haven Lodge — booking page logic (Supabase build)
 * Uses window.UHLData (assets/js/data-store.js), which now talks to a real
 * shared Supabase database — so availability and double-booking prevention
 * are accurate across every visitor, not just this browser.
 */
(function () {
  'use strict';

  var form = document.querySelector('#booking-form');
  if (!form) return;

  var checkIn = form.querySelector('#check-in');
  var checkOut = form.querySelector('#check-out');
  var roomSelect = form.querySelector('#room-type');
  var guestsInput = form.querySelector('#guests');
  var availabilityNote = document.querySelector('#availability-note');
  var summaryRoom = document.querySelector('#summary-room');
  var summaryNights = document.querySelector('#summary-nights');
  var summaryRate = document.querySelector('#summary-rate');
  var summaryTotal = document.querySelector('#summary-total');
  var summaryThumb = document.querySelector('#summary-thumb');
  var submitBtn = form.querySelector('button[type="submit"]');

  var roomsBySlug = {};

  var today = new Date().toISOString().split('T')[0];
  if (checkIn) checkIn.setAttribute('min', today);
  if (checkOut) checkOut.setAttribute('min', today);

  submitBtn.disabled = true;
  availabilityNote.textContent = 'Loading rooms…';

  window.UHLData.getRooms({ activeOnly: true }).then(function (rooms) {
    rooms.forEach(function (r) { roomsBySlug[r.slug] = r; });

    var params = new URLSearchParams(window.location.search);
    var preselect = params.get('room');
    if (preselect && roomsBySlug[preselect] && roomSelect) roomSelect.value = preselect;

    availabilityNote.textContent = 'Select dates and a room to check availability.';
    submitBtn.disabled = false;
    updateSummary();
  }).catch(function () {
    window.UHL.toast('error', 'Could not load rooms', 'Please refresh the page and try again.');
  });

  function updateSummary() {
    var room = roomsBySlug[roomSelect.value];
    var nights = checkIn.value && checkOut.value ? window.UHLData.nightsBetween(checkIn.value, checkOut.value) : 0;

    if (!room) {
      summaryRoom.textContent = 'Select a room';
      summaryNights.textContent = '—';
      summaryRate.textContent = '—';
      summaryTotal.textContent = 'K 0';
      return;
    }

    summaryRoom.textContent = room.name;
    if (room.images && room.images[0]) { summaryThumb.src = room.images[0]; summaryThumb.alt = room.name; }
    summaryNights.textContent = nights > 0 ? nights + (nights === 1 ? ' night' : ' nights') : '—';
    summaryRate.textContent = 'K ' + room.price.toLocaleString() + ' / night';
    summaryTotal.textContent = 'K ' + (room.price * (nights > 0 ? nights : 0)).toLocaleString();
  }

  function validateDates() {
    if (!checkIn.value || !checkOut.value) return true;
    var nights = window.UHLData.nightsBetween(checkIn.value, checkOut.value);
    var errBox = document.querySelector('#date-error');
    if (nights <= 0) {
      if (errBox) { errBox.textContent = 'Check-out must be after check-in.'; errBox.classList.add('show'); }
      checkOut.classList.add('error');
      return false;
    }
    if (errBox) errBox.classList.remove('show');
    checkOut.classList.remove('error');
    return true;
  }

  function checkAvailability() {
    if (!checkIn.value || !checkOut.value || !roomSelect.value) return;
    if (!validateDates()) return;

    availabilityNote.textContent = 'Checking availability…';
    availabilityNote.className = '';
    submitBtn.disabled = true;

    window.UHLData.checkAvailability(roomSelect.value, checkIn.value, checkOut.value).then(function (result) {
      if (result.available) {
        availabilityNote.textContent = result.message + ' (' + result.roomsFree + ' unit' + (result.roomsFree === 1 ? '' : 's') + ' free)';
        availabilityNote.className = 'status-tag status-confirmed';
        submitBtn.disabled = false;
      } else {
        availabilityNote.textContent = result.message;
        availabilityNote.className = 'status-tag status-cancelled';
        submitBtn.disabled = true;
      }
    }).catch(function () {
      availabilityNote.textContent = 'Could not check availability — please try again.';
      availabilityNote.className = 'status-tag status-cancelled';
    });
  }

  [checkIn, checkOut, roomSelect, guestsInput].forEach(function (el) {
    if (!el) return;
    el.addEventListener('change', function () { updateSummary(); checkAvailability(); });
  });

  if (guestsInput) {
    guestsInput.addEventListener('change', function () {
      var room = roomsBySlug[roomSelect.value];
      if (room && Number(guestsInput.value) > room.capacity) {
        window.UHL.toast('error', 'Too many guests', room.name + ' sleeps up to ' + room.capacity + ' guests.');
        guestsInput.value = room.capacity;
      }
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!window.UHL.validateRequired(form)) {
      window.UHL.toast('error', 'Missing information', 'Please complete all required fields.');
      return;
    }
    if (!validateDates()) {
      window.UHL.toast('error', 'Invalid dates', 'Please check your check-in and check-out dates.');
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Processing…';

    var payload = Object.fromEntries(new FormData(form).entries());

    window.UHLData.createBooking({
      checkIn: payload.check_in,
      checkOut: payload.check_out,
      roomType: payload.room_type,
      guests: Number(payload.guests),
      fullName: payload.full_name,
      email: payload.email,
      phone: payload.phone,
      idNumber: payload.id_number || '',
      specialRequests: payload.special_requests || '',
    }).then(function (result) {
      if (result.success) {
        window.location.href = 'booking-confirmation.html?ref=' + encodeURIComponent(result.bookingReference);
      } else {
        window.UHL.toast('error', 'Booking failed', result.message);
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm Booking';
        checkAvailability();
      }
    }).catch(function () {
      window.UHL.toast('error', 'Network error', 'Could not reach the database. Please try again.');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Confirm Booking';
    });
  });
})();
