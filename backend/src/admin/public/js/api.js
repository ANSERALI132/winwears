/* ==========================================================================
   Admin — API client
   One place that knows about cookies, the CSRF header and the error envelope
   the server sends back.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = (window.Admin = window.Admin || {});

  var csrfToken = null;

  /** Thrown for any non-2xx reply, carrying whatever the server explained. */
  function ApiError(message, status, code, issues) {
    this.name = 'ApiError';
    this.message = message;
    this.status = status;
    this.code = code;
    this.issues = issues || [];
  }
  ApiError.prototype = Object.create(Error.prototype);

  function request(method, path, options) {
    var opts = options || {};
    var init = {
      method: method,
      /* Session cookie travels with every call. */
      credentials: 'same-origin',
      headers: {},
    };

    if (csrfToken && method !== 'GET') init.headers['X-CSRF-Token'] = csrfToken;

    if (opts.body instanceof FormData) {
      /* Let the browser set the multipart boundary. */
      init.body = opts.body;
    } else if (opts.body !== undefined) {
      init.headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(opts.body);
    }

    return fetch(path, init).then(function (res) {
      if (res.status === 204) return null;

      var type = res.headers.get('content-type') || '';
      if (type.indexOf('application/json') === -1) {
        if (res.ok) return res;
        throw new ApiError('Something went wrong. Please try again.', res.status, 'NON_JSON');
      }

      return res.json().then(function (payload) {
        if (res.ok) return payload;

        var err = payload && payload.error ? payload.error : {};
        /* A dropped session should send the operator to the login screen
           rather than showing a bare "unauthorised" in the middle of a form.
           Only a session that existed can drop, though: boot() opens with
           /api/auth/me, and before sign-in its 401 is the ordinary "nobody is
           logged in" answer. Reading that as an expiry toasted and reloaded
           every 900ms, so the login form could never be filled in — and a
           mistyped password wiped the form instead of showing the reason. */
        if (res.status === 401 && Admin.state && Admin.state.user) {
          Admin.onSessionLost && Admin.onSessionLost();
        }
        throw new ApiError(
          err.message || 'Something went wrong. Please try again.',
          res.status,
          err.code || 'ERROR',
          err.issues || (payload.data && payload.data.errors) || [],
        );
      });
    });
  }

  Admin.api = {
    ApiError: ApiError,

    get: function (p) { return request('GET', p); },
    post: function (p, body) { return request('POST', p, { body: body }); },
    put: function (p, body) { return request('PUT', p, { body: body }); },
    patch: function (p, body) { return request('PATCH', p, { body: body }); },
    del: function (p) { return request('DELETE', p); },

    setCsrf: function (token) { csrfToken = token; },
    csrf: function () { return csrfToken; },

    /** Builds "?a=1&b=2", skipping empties so the URL stays readable. */
    qs: function (params) {
      var parts = [];
      Object.keys(params || {}).forEach(function (k) {
        var v = params[k];
        if (v === undefined || v === null || v === '') return;
        parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
      });
      return parts.length ? '?' + parts.join('&') : '';
    },
  };
})();
