/* ==========================================================================
   WIN WEARS — Contact form
   Posts to /api/contact. Messages land in the database and appear under
   Contact Messages in the admin dashboard.

   The checks here are for the person filling the form in. The server
   validates every field again — client-side validation is never the guard.
   ========================================================================== */
(function () {
  'use strict';

  var doc = document;
  function $(s, c) { return (c || doc).querySelector(s); }
  function $$(s, c) { return Array.prototype.slice.call((c || doc).querySelectorAll(s)); }

  var form = $('#contact-form');
  if (!form) return;

  /* Same status conventions as the RFQ form, so both read identically. */
  function status(kind, title, text) {
    var box = $('#cf-status');
    if (!box) return;
    box.setAttribute('data-kind', kind);
    box.setAttribute('data-show', 'true');
    box.textContent = '';

    var line = doc.createElement('div');
    var strong = doc.createElement('strong');
    strong.textContent = title;
    line.appendChild(strong);
    if (text) line.appendChild(doc.createTextNode(text));
    box.appendChild(line);

    box.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function setInvalid(id, invalid) {
    var input = $('#' + id);
    if (!input) return;
    var wrap = input.closest('.field');
    if (wrap) wrap.setAttribute('data-invalid', invalid ? 'true' : 'false');
    if (invalid) input.focus();
  }

  function clearInvalid() {
    $$('.field[data-invalid="true"]', form).forEach(function (el) { el.setAttribute('data-invalid', 'false'); });
  }

  /* Clear a field's error as soon as the visitor starts fixing it. */
  $$('.input, .textarea', form).forEach(function (el) {
    el.addEventListener('input', function () {
      var wrap = el.closest('.field');
      if (wrap && wrap.getAttribute('data-invalid') === 'true') wrap.setAttribute('data-invalid', 'false');
    });
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearInvalid();

    var honeypot = form.querySelector('[name="website"]');

    var body = {
      name: $('#cf-name').value.trim(),
      email: $('#cf-email').value.trim(),
      company: $('#cf-company').value.trim(),
      whatsapp: $('#cf-whatsapp').value.trim(),
      subject: $('#cf-subject').value.trim(),
      message: $('#cf-message').value.trim(),
      website: honeypot ? honeypot.value : '',
    };

    if (!body.name) {
      setInvalid('cf-name', true);
      return status('error', 'Check the form. ', 'Please tell us your name.');
    }
    if (!body.email || body.email.indexOf('@') < 1) {
      setInvalid('cf-email', true);
      return status('error', 'Check the form. ', 'Please enter a valid email address.');
    }
    if (!body.message) {
      setInvalid('cf-message', true);
      return status('error', 'Check the form. ', 'Please write your message.');
    }

    var button = $('button[type="submit"]', form);
    button.setAttribute('aria-disabled', 'true');
    button.disabled = true;
    status('info', 'Sending… ', '');

    WW.submitContact(body)
      .then(function (data) {
        status('ok', 'Message sent. ', (data && data.message) || 'We will be in touch shortly.');
        form.reset();
      })
      .catch(function (err) {
        /* Point at the offending field when the server names one. */
        var issue = err && err.issues && err.issues[0];
        if (issue && issue.field && $('#cf-' + issue.field)) {
          setInvalid('cf-' + issue.field, true);
          status('error', 'Check the form. ', issue.message);
          return;
        }
        status('error', 'That did not send. ',
          (err && err.message) || 'Please try again, or message us on WhatsApp.');
      })
      .then(function () {
        button.removeAttribute('aria-disabled');
        button.disabled = false;
      });
  });
})();
