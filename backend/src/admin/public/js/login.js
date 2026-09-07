/* ==========================================================================
   Admin — sign in
   ========================================================================== */
(function () {
  'use strict';

  var Admin = (window.Admin = window.Admin || {});
  var h = Admin.ui.h;
  var ui = Admin.ui;

  Admin.loginView = function () {
    var errorSlot = h('div');

    var emailInput = h('input', {
      type: 'email',
      name: 'email',
      id: 'login-email',
      autocomplete: 'username',
      required: true,
      placeholder: 'you@example.com',
    });

    var passwordInput = h('input', {
      type: 'password',
      name: 'password',
      id: 'login-password',
      autocomplete: 'current-password',
      required: true,
    });

    var reveal = h(
      'button',
      {
        type: 'button',
        'aria-label': 'Show password',
        onclick: function () {
          var showing = passwordInput.type === 'text';
          passwordInput.type = showing ? 'password' : 'text';
          reveal.textContent = showing ? 'Show' : 'Hide';
          reveal.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
          passwordInput.focus();
        },
      },
      'Show',
    );

    var submit = h('button.btn.btn--accent', { type: 'submit', style: 'width:100%' }, 'Sign in');

    function setBusy(busy) {
      submit.disabled = busy;
      emailInput.disabled = busy;
      passwordInput.disabled = busy;
      ui.clear(submit);
      if (busy) {
        submit.appendChild(h('span.spin'));
        submit.appendChild(document.createTextNode(' Signing in…'));
      } else {
        submit.textContent = 'Sign in';
      }
    }

    var form = h(
      'form',
      {
        novalidate: true,
        onsubmit: function (e) {
          e.preventDefault();
          ui.clear(errorSlot);

          var email = emailInput.value.trim();
          var password = passwordInput.value;

          if (!email || !password) {
            errorSlot.appendChild(ui.notice('error', 'Enter your email and password.'));
            return;
          }

          setBusy(true);
          Admin.api
            .post('/api/auth/login', { email: email, password: password })
            .then(function (res) {
              Admin.state.user = res.data.user;
              Admin.api.setCsrf(res.data.csrfToken);
              /* Reload rather than hand-build the shell: one code path for
                 "signed in", whether it came from a login or a fresh visit. */
              location.hash = '#/';
              location.reload();
            })
            .catch(function (err) {
              setBusy(false);
              var unmatched = ui.applyFieldErrors(form, err.issues);
              errorSlot.appendChild(ui.notice('error', err.message, unmatched));
              passwordInput.value = '';
              passwordInput.focus();
            });
        },
      },
      errorSlot,
      h(
        'label.field.field--req',
        h('span.field__label', { text: 'Email', for: 'login-email' }),
        emailInput,
      ),
      h(
        'div.field.field--req',
        h('label.field__label', { text: 'Password', for: 'login-password' }),
        h('div.pw', passwordInput, reveal),
      ),
      submit,
    );

    return h(
      'div.login-page',
      h(
        'div.login',
        h(
          'div.login__brand',
          h('div.login__mark', { text: 'WW' }),
          h('div', h('h1', { text: 'WIN WEARS' }), h('p.login__sub', { text: 'Administration' })),
        ),
        form,
      ),
    );
  };
})();
