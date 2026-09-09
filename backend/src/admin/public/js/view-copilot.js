/* ==========================================================================
   Admin — Copilot
   Ask questions about the business. Every answer says what it was built from.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  /* Openers, so the first use is not a blank box. They are questions the
     tools can genuinely answer — an example that returns "I don't have that"
     teaches the wrong thing about what this is for. */
  var STARTERS = [
    'What needs attention today?',
    'Which orders are past the date we promised?',
    'What is running late on the factory floor?',
    'What needs ordering?',
    'How much have we sold in the last 30 days?',
    'Which inspections failed and have not been decided?',
  ];

  /** Renders an answer as paragraphs and simple lists. The model is asked for
   *  plain sentences and small tables, so this stays deliberately small — and
   *  it builds text nodes, never markup, because the reply is model output. */
  function renderAnswer(text) {
    var wrap = h('div.answer');
    String(text || '').split(/\n{2,}/).forEach(function (block) {
      var lines = block.split(/\n/).filter(function (l) { return l.trim(); });
      var bullets = lines.filter(function (l) { return /^\s*[-*•]\s+/.test(l); });

      if (bullets.length && bullets.length === lines.length) {
        var list = h('ul');
        lines.forEach(function (line) {
          list.appendChild(h('li', { text: line.replace(/^\s*[-*•]\s+/, '') }));
        });
        wrap.appendChild(list);
        return;
      }
      wrap.appendChild(h('p', { text: lines.join(' ') }));
    });
    return wrap;
  }

  function toolChips(used) {
    if (!used || !used.length) return null;
    var row = h('div.chip-row.tool-row');
    row.appendChild(h('span.muted.tiny', { text: 'Looked up:' }));
    used.forEach(function (t) {
      row.appendChild(h('span.pill', {
        class: t.isError ? 'pill--archived' : 'pill--info',
        text: t.name.replace(/_/g, ' ') + ' (' + t.ms + 'ms)',
      }));
    });
    return row;
  }

  Admin.route('/copilot', {
    title: 'Copilot',
    subtitle: 'Ask about the business',
    render: function (mount) {
      var query = Admin.query();
      var state = { threadId: query.thread || null, busy: false };

      var log = h('div.chat-log');
      var card = h('section.card');
      card.appendChild(log);
      ui.clear(mount).appendChild(card);

      var question = h('textarea', {
        rows: 2,
        placeholder: 'Ask about orders, production, quality, stock or shipping…',
        'aria-label': 'Your question',
      });
      var ask = h('button.btn.btn--accent', { type: 'button' }, 'Ask');

      var composer = h('section.card',
        h('div.field', question),
        h('div.card__foot', ask,
          h('button.btn.btn--sm', {
            type: 'button',
            onclick: function () { location.hash = '#/copilot'; location.reload(); },
          }, 'New thread'),
          h('a.btn.btn--sm', { href: '#/copilot/threads' }, 'Past threads')));
      mount.appendChild(composer);

      question.addEventListener('keydown', function (e) {
        /* Enter sends, shift+enter is a new line — this is a chat box, and
           reaching for the mouse to ask a one-line question is friction. */
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
      });
      ask.addEventListener('click', send);

      function bubble(role, node, used) {
        var row = h('div.chat-row' + (role === 'user' ? '.chat-row--mine' : ''));
        var body = h('div.chat-bubble');
        body.appendChild(node);
        var chips = toolChips(used);
        if (chips) body.appendChild(chips);
        row.appendChild(body);
        log.appendChild(row);
        row.scrollIntoView({ block: 'nearest' });
        return row;
      }

      function send() {
        var text = question.value.trim();
        if (!text || state.busy) return;

        state.busy = true;
        ask.disabled = true;
        question.value = '';
        bubble('user', h('p', { text: text }));

        var thinking = bubble('assistant', h('p.muted', { text: 'Looking…' }));

        api.post('/api/admin/copilot/ask', { question: text, threadId: state.threadId || undefined })
          .then(function (res) {
            thinking.remove();
            state.threadId = res.data.threadId;
            bubble('assistant', renderAnswer(res.data.reply), res.data.usedTools);
          })
          .catch(function (err) {
            thinking.remove();
            bubble('assistant', h('p', { text: err.message }));
          })
          .then(function () {
            state.busy = false;
            ask.disabled = false;
            question.focus();
          });
      }

      /* Status first: if there is no API key, say so rather than letting
         somebody type a question and watch it fail. */
      api.get('/api/admin/copilot/status')
        .then(function (res) {
          if (!res.data.configured) {
            ui.clear(log).appendChild(ui.notice('warn',
              'The copilot is switched off because no AI key is configured. Set AI_API_KEY in the environment and restart the server. Everything else in the admin works without it.'));
            question.disabled = true;
            ask.disabled = true;
            return;
          }

          if (state.threadId) return loadThread();

          var intro = h('div');
          intro.appendChild(h('p.card__hint',
            'Ask about orders, customers, production, quality, stock or shipping. Every answer is built from your own records — it says underneath which lookups it used, and it will tell you when it does not have something rather than guessing.'));
          intro.appendChild(h('p.card__hint',
            'It can only read. It cannot create, change or cancel anything.'));

          var chips = h('div.chip-row');
          STARTERS.forEach(function (s) {
            chips.appendChild(h('button.btn.btn--sm', {
              type: 'button',
              onclick: function () { question.value = s; send(); },
            }, s));
          });
          intro.appendChild(chips);
          ui.clear(log).appendChild(intro);
          question.focus();
        })
        .catch(function (err) { ui.clear(log).appendChild(ui.errorState(err, function () { Admin.refresh(); })); });

      function loadThread() {
        return api.get('/api/admin/copilot/threads/' + encodeURIComponent(state.threadId))
          .then(function (res) {
            ui.clear(log);
            res.data.messages.forEach(function (m) {
              if (m.role === 'USER') bubble('user', h('p', { text: m.content }));
              else if (m.role === 'ASSISTANT') {
                var used = Array.isArray(m.toolCalls)
                  ? m.toolCalls.map(function (t) { return { name: t.name, ms: t.ms, isError: t.isError }; })
                  : null;
                bubble('assistant', renderAnswer(m.content), used);
              }
            });
            question.focus();
          })
          .catch(function () {
            /* A thread that is gone is not an error worth a red box — just
               start a fresh one. */
            state.threadId = null;
            ui.clear(log);
          });
      }
    },
  });

  /* ------------------------------------------------------------ threads -- */

  Admin.route('/copilot/threads', {
    title: 'Copilot threads',
    subtitle: 'Questions you have asked',
    render: function (mount) {
      var card = h('section.card');
      card.appendChild(h('h2.card__title', 'Your threads'));
      card.appendChild(h('p.card__hint', 'Only yours. Nobody else can see what you asked.'));
      var slot = h('div');
      card.appendChild(slot);
      card.appendChild(h('div.card__foot', h('a.btn.btn--accent', { href: '#/copilot' }, 'Ask something new')));
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(3));
        return api.get('/api/admin/copilot/threads?perPage=50')
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('Nothing asked yet',
                'Questions you ask the copilot are kept here so you can come back to them.',
                h('a.btn.btn--accent', { href: '#/copilot' }, 'Ask something')));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Question'), h('th', 'Messages'), h('th', 'Last used'), h('th'))));
            var body = h('tbody');
            res.data.forEach(function (t) {
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/copilot?thread=' + t.id }, t.title || 'Untitled')));
              tr.appendChild(h('td', String(t.messageCount)));
              tr.appendChild(h('td', t.lastMessageAt ? ui.dateTime(t.lastMessageAt) : '—'));
              tr.appendChild(h('td.cell-actions', h('button.btn.btn--sm.btn--danger', {
                type: 'button',
                onclick: function () {
                  ui.modal({
                    title: 'Delete this thread?',
                    danger: true,
                    confirmLabel: 'Delete',
                    message: 'It is only your own record of what you asked. Nothing in the business changes.',
                  }).then(function (ok) {
                    if (!ok) return;
                    api.del('/api/admin/copilot/threads/' + t.id)
                      .then(function () { ui.toast('Thread deleted', 'ok'); load(); })
                      .catch(function (err) { ui.toast(err.message, 'error'); });
                  });
                },
              }, 'Delete')));
              body.appendChild(tr);
            });
            table.appendChild(body);
            slot.appendChild(table);
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });
})();
