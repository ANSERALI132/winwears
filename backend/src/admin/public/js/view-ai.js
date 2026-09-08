/* ==========================================================================
   Admin â€” AI assistant
   Overview, the conversation viewer, and the knowledge base.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var LEAD_STATUSES = ['NEW', 'QUALIFIED', 'CONTACTED', 'IN_PROGRESS', 'CONVERTED', 'CLOSED'];
  var SCORES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  var KNOWLEDGE_STATUSES = ['DRAFT', 'PUBLISHED', 'ARCHIVED'];

  function label(value) {
    return String(value).charAt(0) + String(value).slice(1).toLowerCase().replace(/_/g, ' ');
  }

  /* ------------------------------------------------------------ overview -- */

  Admin.route('/ai', {
    title: 'AI Assistant',
    subtitle: 'How the assistant is doing, and what it cannot answer',
    render: function (mount) {
      mount.appendChild(ui.skeleton(3));

      return api.get('/api/admin/ai/stats').then(function (res) {
        var d = res.data;
        ui.clear(mount);

        var stats = h('div.grid.grid--stats');
        [
          ['Conversations', d.conversations.total],
          ['New leads', d.conversations.new],
          ['Qualified', d.conversations.qualified],
          ['Converted', d.conversations.converted],
          ['Quote requests', d.quotesFromAi],
          ['Escalations', d.escalations],
          ['WhatsApp handoffs', d.whatsappClicks],
          ['Conversion rate', d.conversionRate === null ? 'â€”' : d.conversionRate + '%']
        ].forEach(function (pair) {
          var card = h('div.card.stat');
          card.appendChild(h('div.stat__value', String(pair[1])));
          card.appendChild(h('div.stat__label', pair[0]));
          stats.appendChild(card);
        });
        mount.appendChild(stats);

        /* The most useful panel on the page: what the agent keeps handing
           over is a to-do list for the knowledge base. */
        var esc = h('section.card');
        esc.appendChild(h('h2.card__title', 'Why conversations were handed over'));
        esc.appendChild(h('p.card__hint',
          'The reasons that appear most are the questions the business has not written down yet. Each one is a knowledge entry waiting to be added.'));

        if (!d.escalationReasons.length) {
          esc.appendChild(ui.empty('Nothing handed over yet', 'Escalations from the last 30 days appear here.'));
        } else {
          var table = h('table.table');
          table.appendChild(h('thead', h('tr', h('th', 'Reason'), h('th', 'Times'))));
          var tb = h('tbody');
          d.escalationReasons.forEach(function (row) {
            tb.appendChild(h('tr', h('td', label(row.reason)), h('td', String(row.count))));
          });
          table.appendChild(tb);
          esc.appendChild(table);
        }
        mount.appendChild(esc);

        var kb = h('section.card');
        kb.appendChild(h('h2.card__title', 'Knowledge base'));
        kb.appendChild(h('p.card__hint',
          d.knowledge.published + ' of ' + d.knowledge.total + ' entries are published. Only published entries are ever quoted to a customer.'));
        kb.appendChild(h('a.btn.btn--accent', { href: '#/ai/knowledge' }, 'Manage knowledge'));
        mount.appendChild(kb);

        var recent = h('section.card');
        recent.appendChild(h('h2.card__title', 'Recent conversations'));
        if (!d.recent.length) {
          recent.appendChild(ui.empty('No conversations yet', 'They appear here once visitors start using the assistant.'));
        } else {
          var rt = h('table.table');
          rt.appendChild(h('thead', h('tr',
            h('th', 'Customer'), h('th', 'Country'), h('th', 'Qty'),
            h('th', 'Score'), h('th', 'Status'), h('th', 'Last message'))));
          var rb = h('tbody');
          d.recent.forEach(function (c) {
            var tr = h('tr');
            tr.appendChild(h('td', h('a', { href: '#/ai/conversations/' + c.id },
              c.customerName || c.company || 'Anonymous')));
            tr.appendChild(h('td', c.country || 'â€”'));
            tr.appendChild(h('td', c.quantity ? String(c.quantity) : 'â€”'));
            tr.appendChild(h('td', ui.statusPill(c.leadScore)));
            tr.appendChild(h('td', ui.statusPill(c.status)));
            tr.appendChild(h('td', c.lastMessageAt ? ui.dateTime(c.lastMessageAt) : 'â€”'));
            rb.appendChild(tr);
          });
          rt.appendChild(rb);
          recent.appendChild(rt);
        }
        mount.appendChild(recent);
      });
    },
  });

  /* ------------------------------------------------------- conversations -- */

  Admin.route('/ai/conversations', {
    title: 'AI Conversations',
    subtitle: 'Every chat, and the leads inside them',
    render: function (mount) {
      var state = { q: '', status: '', score: '', escalated: '', page: 1, perPage: 25 };
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search',
        placeholder: 'Name, company, email, countryâ€¦',
        'aria-label': 'Search conversations',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));

      function select(aria, values, key, allLabel) {
        return h('select', {
          'aria-label': aria,
          onchange: function (e) { state[key] = e.target.value; state.page = 1; load(); },
        }, h('option', { value: '' }, allLabel),
          values.map(function (v) { return h('option', { value: v }, label(v)); }));
      }

      toolbar.appendChild(select('Filter by status', LEAD_STATUSES, 'status', 'All statuses'));
      toolbar.appendChild(select('Filter by lead score', SCORES, 'score', 'All scores'));
      toolbar.appendChild(select('Filter by escalation', ['yes', 'no'], 'escalated', 'Escalated or not'));

      card.appendChild(toolbar);
      card.appendChild(slot);
      mount.appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(5));
        return api
          .get('/api/admin/ai/conversations' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No conversations match',
                'Try clearing the filters, or wait for visitors to use the assistant.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Customer'), h('th', 'Company'), h('th', 'Country'),
              h('th', 'Interest'), h('th', 'Qty'), h('th', 'Score'),
              h('th', 'Status'), h('th', 'Msgs'), h('th', 'Started'))));

            var body = h('tbody');
            res.data.forEach(function (c) {
              var tr = h('tr');
              tr.appendChild(h('td', h('a', { href: '#/ai/conversations/' + c.id },
                c.customerName || 'Anonymous')));
              tr.appendChild(h('td', c.company || 'â€”'));
              tr.appendChild(h('td', c.country || 'â€”'));
              tr.appendChild(h('td', (c.product && c.product.productName) || (c.category && c.category.name) || 'â€”'));
              tr.appendChild(h('td', c.quantity ? String(c.quantity) : 'â€”'));
              tr.appendChild(h('td', ui.statusPill(c.leadScore)));
              tr.appendChild(h('td', ui.statusPill(c.status)));
              tr.appendChild(h('td', String(c.messageCount)));
              tr.appendChild(h('td', ui.date(c.createdAt)));
              body.appendChild(tr);
            });
            table.appendChild(body);
            slot.appendChild(table);

            if (res.meta.totalPages > 1) {
              slot.appendChild(pager(res.meta, function (page) { state.page = page; load(); }));
            }
          })
          .catch(function (err) {
            ui.clear(slot).appendChild(ui.errorState(err, load));
          });
      }

      return load();
    },
  });

  function pager(meta, onGo) {
    var wrap = h('div.pager');
    wrap.appendChild(h('button.btn.btn--sm', {
      type: 'button',
      disabled: meta.page <= 1,
      onclick: function () { onGo(meta.page - 1); },
    }, 'Previous'));
    wrap.appendChild(h('span.pager__label', 'Page ' + meta.page + ' of ' + meta.totalPages + ' â€” ' + meta.total + ' total'));
    wrap.appendChild(h('button.btn.btn--sm', {
      type: 'button',
      disabled: meta.page >= meta.totalPages,
      onclick: function () { onGo(meta.page + 1); },
    }, 'Next'));
    return wrap;
  }

  /* ---------------------------------------------------------- transcript -- */

  Admin.route('/ai/conversations/:id', {
    title: 'Conversation',
    subtitle: 'Transcript and lead details',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return api.get('/api/admin/ai/conversations/' + encodeURIComponent(params.id)).then(function (res) {
        var c = res.data;
        ui.clear(mount);

        mount.appendChild(h('a.btn.btn--sm', { href: '#/ai/conversations' }, 'â† All conversations'));

        var layout = h('div.split');

        /* --- transcript --- */
        var left = h('section.card');
        left.appendChild(h('h2.card__title', 'Transcript'));

        if (!c.messages.length) {
          left.appendChild(ui.empty('Nothing said yet', 'This conversation has no messages.'));
        } else {
          var log = h('div.transcript');
          c.messages.forEach(function (m) {
            var row = h('div.transcript__row.transcript__row--' + m.role.toLowerCase());
            var who = m.role === 'USER' ? 'Customer' : m.role === 'ASSISTANT' ? 'Assistant' : 'Tool Â· ' + (m.toolName || '');
            row.appendChild(h('div.transcript__who', who + ' Â· ' + ui.dateTime(m.createdAt)));
            /* Tool results are JSON; shown in a pre so an admin can read what
               the answer was actually built from. */
            row.appendChild(m.role === 'TOOL'
              ? h('pre.transcript__tool', m.content)
              : h('div.transcript__text', m.content));
            log.appendChild(row);
          });
          left.appendChild(log);
        }
        layout.appendChild(left);

        /* --- lead panel --- */
        var right = h('section.card');
        right.appendChild(h('h2.card__title', 'Lead'));

        var dl = h('dl.detail');
        [
          ['Name', c.customerName],
          ['Company', c.company],
          ['Country', c.country],
          ['Email', c.email],
          ['WhatsApp', c.whatsapp],
          ['Product', c.product && c.product.productName],
          ['Category', c.category && c.category.name],
          ['Quantity', c.quantity],
          ['Size', c.size],
          ['Customization', c.customizationRequired === null ? null : (c.customizationRequired ? 'Yes' : 'No')],
          ['Lead score', c.leadScore],
          ['Escalated', c.escalatedAt ? ui.dateTime(c.escalatedAt) : 'No'],
          ['Messages', c.messageCount],
          ['Started', ui.dateTime(c.createdAt)]
        ].forEach(function (pair) {
          if (pair[1] === null || pair[1] === undefined || pair[1] === '') return;
          dl.appendChild(h('dt', pair[0]));
          dl.appendChild(h('dd', String(pair[1])));
        });
        right.appendChild(dl);

        if (c.requirements) {
          right.appendChild(h('h3.card__subtitle', 'Requirements'));
          right.appendChild(h('p.detail__note', c.requirements));
        }

        /* --- status --- */
        right.appendChild(h('h3.card__subtitle', 'Status'));
        var statusRow = h('div.chip-row');
        LEAD_STATUSES.forEach(function (s) {
          var btn = h('button.btn.btn--sm', {
            type: 'button',
            'aria-pressed': String(c.status === s),
            onclick: function () {
              api
                .patch('/api/admin/ai/conversations/' + c.id + '/status', { status: s })
                .then(function () {
                  ui.toast('Status set to ' + label(s), 'ok');
                  c.status = s;
                  statusRow.querySelectorAll('button').forEach(function (b) {
                    b.setAttribute('aria-pressed', String(b.textContent === label(s)));
                  });
                })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          }, label(s));
          statusRow.appendChild(btn);
        });
        right.appendChild(statusRow);

        /* --- quotes raised --- */
        if (c.quotes && c.quotes.length) {
          right.appendChild(h('h3.card__subtitle', 'Quote requests'));
          var ql = h('ul.plain-list');
          c.quotes.forEach(function (q) {
            ql.appendChild(h('li', (q.reference || q.id) + ' Â· ' + label(q.status) + ' Â· ' + ui.date(q.createdAt)));
          });
          right.appendChild(ql);
        }

        right.appendChild(h('h3.card__subtitle', 'Data'));
        right.appendChild(h('p.card__hint',
          'Deleting removes the transcript and everything the customer told the assistant. Any quote request already raised is kept.'));
        right.appendChild(h('button.btn.btn--sm.btn--danger', {
          type: 'button',
          onclick: function () {
            ui.confirmDelete(c.customerName || 'this conversation', 'This cannot be undone.').then(function (ok) {
              if (!ok) return;
              api
                .del('/api/admin/ai/conversations/' + c.id)
                .then(function () { ui.toast('Conversation deleted', 'ok'); location.hash = '#/ai/conversations'; })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            });
          },
        }, 'Delete conversation'));

        layout.appendChild(right);
        mount.appendChild(layout);
      });
    },
  });

  /* ------------------------------------------------------------ knowledge -- */

  Admin.route('/ai/knowledge', {
    title: 'AI Knowledge',
    subtitle: 'What the assistant may say about the business',
    render: function (mount) {
      var state = { q: '', status: '', category: '', page: 1, perPage: 25 };
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search',
        placeholder: 'Search titles and contentâ€¦',
        'aria-label': 'Search knowledge',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));

      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by status',
        onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All statuses'),
        KNOWLEDGE_STATUSES.map(function (s) { return h('option', { value: s }, label(s)); })));

      var categorySelect = h('select', {
        'aria-label': 'Filter by category',
        onchange: function (e) { state.category = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All categories'));
      toolbar.appendChild(categorySelect);

      toolbar.appendChild(h('button.btn.btn--accent', {
        type: 'button',
        onclick: function () { edit(null); },
      }, 'Add entry'));

      card.appendChild(toolbar);
      card.appendChild(h('p.card__hint',
        'Only published entries are ever quoted to a customer. Unpublish to take something back without deleting the record of what it said.'));
      card.appendChild(slot);
      mount.appendChild(card);

      api.get('/api/admin/ai/knowledge/categories').then(function (res) {
        res.data.forEach(function (c) { categorySelect.appendChild(h('option', { value: c }, c)); });
      }).catch(function () { /* the filter is a convenience, not the feature */ });

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api
          .get('/api/admin/ai/knowledge' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty(
                'No entries yet',
                'Add what the assistant should know about manufacturing, customization, shipping and payment. Without these it will say the answer is not confirmed and offer the team.',
                h('button.btn.btn--accent', { type: 'button', onclick: function () { edit(null); } }, 'Add entry')
              ));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Title'), h('th', 'Category'), h('th', 'Status'),
              h('th', 'Priority'), h('th', 'Updated'), h('th', 'Actions'))));

            var body = h('tbody');
            res.data.forEach(function (e) {
              var tr = h('tr');
              tr.appendChild(h('td', e.title));
              tr.appendChild(h('td', e.category));
              tr.appendChild(h('td', ui.statusPill(e.status)));
              tr.appendChild(h('td', String(e.priority)));
              tr.appendChild(h('td', ui.date(e.updatedAt)));
              tr.appendChild(h('td', h('div.cell-actions',
                h('button.btn.btn--sm', { type: 'button', onclick: function () { edit(e); } }, 'Edit'),
                h('button.btn.btn--sm', {
                  type: 'button',
                  onclick: function () {
                    var next = e.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
                    api
                      .put('/api/admin/ai/knowledge/' + e.id, { status: next })
                      .then(function () { ui.toast(next === 'PUBLISHED' ? 'Published' : 'Unpublished', 'ok'); return load(); })
                      .catch(function (err) { ui.toast(err.message, 'error'); });
                  },
                }, e.status === 'PUBLISHED' ? 'Unpublish' : 'Publish'),
                h('button.btn.btn--sm.btn--danger', {
                  type: 'button',
                  onclick: function () {
                    ui.confirmDelete(e.title, 'This cannot be undone. Unpublishing is reversible.').then(function (ok) {
                      if (!ok) return;
                      api
                        .del('/api/admin/ai/knowledge/' + e.id)
                        .then(function () { ui.toast('Entry deleted', 'ok'); return load(); })
                        .catch(function (err) { ui.toast(err.message, 'error'); });
                    });
                  },
                }, 'Delete'))));
              body.appendChild(tr);
            });
            table.appendChild(body);
            slot.appendChild(table);

            if (res.meta.totalPages > 1) {
              slot.appendChild(pager(res.meta, function (page) { state.page = page; load(); }));
            }
          })
          .catch(function (err) {
            ui.clear(slot).appendChild(ui.errorState(err, load));
          });
      }

      function edit(entry) {
        var isNew = !entry;
        var e = entry || {};

        var title = h('input', { type: 'text', name: 'title', value: e.title || '', required: true });
        var category = h('input', { type: 'text', name: 'category', value: e.category || 'general', placeholder: 'manufacturing, shipping, paymentâ€¦' });
        var content = h('textarea', { name: 'content', rows: 10, value: e.content || '' });
        var priority = h('input', { type: 'number', name: 'priority', min: 0, max: 100, value: String(e.priority || 0) });
        var status = h('select', { name: 'status' },
          KNOWLEDGE_STATUSES.map(function (s) {
            return h('option', { value: s, selected: (e.status || 'DRAFT') === s }, label(s));
          }));

        var form = h('form', { novalidate: true },
          h('div.field.field--req', h('label.field__label', { text: 'Title' }), title,
            h('p.field__hint', { text: 'What question this answers. Matched first when the assistant searches.' })),
          h('div.field.field--req', h('label.field__label', { text: 'Content' }), content,
            h('p.field__hint', { text: 'Write only what is true and confirmed. The assistant will quote this to customers as fact.' })),
          h('div.field', h('label.field__label', { text: 'Category' }), category),
          h('div.field', h('label.field__label', { text: 'Priority' }), priority,
            h('p.field__hint', { text: 'Higher wins when several entries match the same question.' })),
          h('div.field', h('label.field__label', { text: 'Status' }), status,
            h('p.field__hint', { text: 'Only published entries are quoted to customers.' })));

        ui.modal({
          title: isNew ? 'Add knowledge entry' : 'Edit knowledge entry',
          confirmLabel: isNew ? 'Create' : 'Save',
          body: form,
        }).then(function (ok) {
          if (!ok) return;

          var payload = {
            title: title.value.trim(),
            content: content.value.trim(),
            category: category.value.trim() || 'general',
            priority: Number(priority.value) || 0,
            status: status.value,
          };

          if (!payload.title || !payload.content) {
            ui.toast('A title and content are both required.', 'error');
            return;
          }

          var request = isNew
            ? api.post('/api/admin/ai/knowledge', payload)
            : api.put('/api/admin/ai/knowledge/' + e.id, payload);

          request
            .then(function () { ui.toast(isNew ? 'Entry created' : 'Entry saved', 'ok'); return load(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        });
      }

      return load();
    },
  });
})();
