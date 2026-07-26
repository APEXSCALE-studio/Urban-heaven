/**
 * Urban Haven Lodge — shared front-end behaviour (client-side demo build)
 * Handles: page loader, mobile nav, dark mode, testimonials, FAQ accordion,
 * newsletter signup, contact form, room search — all backed by
 * assets/js/data-store.js (localStorage) instead of a PHP API.
 */
(function () {
  'use strict';

  window.addEventListener('load', function () {
    var loader = document.querySelector('.page-loader');
    if (loader) setTimeout(function () { loader.classList.add('hidden'); }, 200);
  });

  /* ---- Mobile navigation toggle ---- */
  var navToggle = document.querySelector('.nav-toggle');
  var navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', function () {
      var isOpen = navLinks.classList.toggle('open');
      navToggle.classList.toggle('open', isOpen);
      navToggle.setAttribute('aria-expanded', String(isOpen));
    });
    navLinks.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { navLinks.classList.remove('open'); navToggle.classList.remove('open'); });
    });
  }

  /* ---- Dark mode toggle ---- */
  var THEME_KEY = 'uhl_theme';
  var root = document.documentElement;
  if (localStorage.getItem(THEME_KEY) === 'dark') root.setAttribute('data-theme', 'dark');
  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    updateThemeIcon(btn);
    btn.addEventListener('click', function () {
      var isDark = root.getAttribute('data-theme') === 'dark';
      if (isDark) { root.removeAttribute('data-theme'); localStorage.setItem(THEME_KEY, 'light'); }
      else { root.setAttribute('data-theme', 'dark'); localStorage.setItem(THEME_KEY, 'dark'); }
      document.querySelectorAll('.theme-toggle').forEach(updateThemeIcon);
    });
  });
  function updateThemeIcon(btn) {
    var isDark = root.getAttribute('data-theme') === 'dark';
    btn.innerHTML = isDark
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  /* ---- Testimonial slider ---- */
  var slides = document.querySelectorAll('.testimonial-slide');
  var dotsWrap = document.querySelector('.slider-dots');
  if (slides.length) {
    var current = 0;
    if (dotsWrap) {
      slides.forEach(function (_, i) {
        var dot = document.createElement('button');
        dot.setAttribute('aria-label', 'Show testimonial ' + (i + 1));
        if (i === 0) dot.classList.add('active');
        dot.addEventListener('click', function () { showSlide(i); });
        dotsWrap.appendChild(dot);
      });
    }
    function showSlide(index) {
      slides[current].classList.remove('active');
      if (dotsWrap) dotsWrap.children[current].classList.remove('active');
      current = (index + slides.length) % slides.length;
      slides[current].classList.add('active');
      if (dotsWrap) dotsWrap.children[current].classList.add('active');
    }
    slides[0].classList.add('active');
    setInterval(function () { showSlide(current + 1); }, 6000);
  }

  /* ---- FAQ accordion ---- */
  document.querySelectorAll('.faq-item').forEach(function (item) {
    var q = item.querySelector('.faq-q');
    var a = item.querySelector('.faq-a');
    if (!q || !a) return;
    q.addEventListener('click', function () {
      var isOpen = item.classList.contains('open');
      document.querySelectorAll('.faq-item.open').forEach(function (open) {
        if (open !== item) { open.classList.remove('open'); open.querySelector('.faq-a').style.maxHeight = null; }
      });
      item.classList.toggle('open', !isOpen);
      a.style.maxHeight = !isOpen ? a.scrollHeight + 'px' : null;
    });
  });

  /* ---- Toasts ---- */
  var toastWrap = document.querySelector('.toast-wrap');
  if (!toastWrap) {
    toastWrap = document.createElement('div');
    toastWrap.className = 'toast-wrap';
    toastWrap.setAttribute('role', 'status');
    toastWrap.setAttribute('aria-live', 'polite');
    document.body.appendChild(toastWrap);
  }
  function toast(type, title, message, duration) {
    var el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.innerHTML = '<strong>' + escapeHtml(title || '') + '</strong>' + (message ? '<span>' + escapeHtml(message) + '</span>' : '');
    toastWrap.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity 300ms ease';
      el.style.opacity = '0';
      setTimeout(function () { el.remove(); }, 300);
    }, duration || 4200);
  }
  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* ---- Newsletter signup — saved via UHLData ---- */
  document.querySelectorAll('.newsletter-form').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var input = form.querySelector('input[type="email"]');
      if (!input || !input.value || !input.checkValidity()) {
        toast('error', 'Invalid email', 'Please enter a valid email address.');
        return;
      }
      var btn = form.querySelector('button');
      var originalText = btn ? btn.textContent : '';
      if (btn) { btn.disabled = true; btn.textContent = '...'; }

      window.UHLData.addNewsletterSignup(input.value).then(function () {
        toast('success', 'Subscribed!', 'You will now receive lodge updates and offers.');
        input.value = '';
      }).catch(function () {
        toast('error', 'Could not subscribe', 'Please try again later.');
      }).finally(function () {
        if (btn) { btn.disabled = false; btn.textContent = originalText; }
      });
    });
  });

  /* ---- Contact form — saved via UHLData ---- */
  var contactForm = document.querySelector('#contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validateRequired(contactForm)) {
        toast('error', 'Missing information', 'Please fill in all required fields.');
        return;
      }
      var payload = Object.fromEntries(new FormData(contactForm).entries());
      var submitBtn = contactForm.querySelector('button[type="submit"]');
      if (submitBtn) submitBtn.disabled = true;

      window.UHLData.addContactMessage({
        fullName: payload.full_name, email: payload.email, phone: payload.phone || '',
        subject: payload.subject, message: payload.message,
      }).then(function () {
        toast('success', 'Message sent', 'Thanks for reaching out — our team will reply shortly.');
        contactForm.reset();
      }).catch(function () {
        toast('error', 'Could not send message', 'Please try again.');
      }).finally(function () {
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  function validateRequired(form) {
    var ok = true;
    form.querySelectorAll('[required]').forEach(function (field) {
      var errorEl = field.closest('.form-group') ? field.closest('.form-group').querySelector('.field-error') : null;
      if (!field.value || (field.type === 'email' && !field.checkValidity())) {
        field.classList.add('error');
        if (errorEl) errorEl.classList.add('show');
        ok = false;
      } else {
        field.classList.remove('error');
        if (errorEl) errorEl.classList.remove('show');
      }
    });
    return ok;
  }

  /* ---- Room gallery thumbnail swap ---- */
  document.querySelectorAll('.gallery').forEach(function (gallery) {
    var mainImg = gallery.querySelector('.gallery-main img');
    if (!mainImg) return;
    gallery.querySelectorAll('.gallery-thumb').forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        mainImg.src = thumb.getAttribute('data-full') || thumb.src;
        mainImg.alt = thumb.getAttribute('alt') || '';
        gallery.querySelectorAll('.gallery-thumb').forEach(function (t) { t.classList.remove('active'); });
        thumb.classList.add('active');
      });
    });
  });

  /* ---- Room search / filter on the Rooms page ---- */
  var roomSearch = document.querySelector('#room-search');
  var roomCapacityFilter = document.querySelector('#room-capacity-filter');
  var roomCards = document.querySelectorAll('[data-room-card]');
  function filterRooms() {
    if (!roomCards.length) return;
    var term = (roomSearch && roomSearch.value || '').toLowerCase();
    var cap = roomCapacityFilter && roomCapacityFilter.value;
    roomCards.forEach(function (card) {
      var name = (card.getAttribute('data-name') || '').toLowerCase();
      var capacity = card.getAttribute('data-capacity');
      var matchesTerm = !term || name.indexOf(term) !== -1;
      var matchesCap = !cap || cap === 'any' || capacity === cap;
      card.style.display = matchesTerm && matchesCap ? '' : 'none';
    });
  }
  if (roomSearch) roomSearch.addEventListener('input', filterRooms);
  if (roomCapacityFilter) roomCapacityFilter.addEventListener('change', filterRooms);

  window.UHL = window.UHL || {};
  window.UHL.toast = toast;
  window.UHL.validateRequired = validateRequired;
  window.UHL.escapeHtml = escapeHtml;
})();
