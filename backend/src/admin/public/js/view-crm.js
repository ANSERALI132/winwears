/* ==========================================================================
   Admin — CRM
   Companies, the people at them, the account timeline, and the pipeline.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  var STAGES = ['NEW', 'QUALIFIED', 'CONTACTED', 'DISCOVERY', 'RFQ', 'QUOTATION', 'NEGOTIATION', 'SAMPLE', 'WON', 'LOST'];
  var SEGMENTS = ['DISTRIBUTOR', 'CLUB', 'ACADEMY', 'SPORTS_BRAND', 'WHOLESALER', 'TOURNAMENT_ORGANIZER', 'RETAILER', 'OTHER'];
  var SOURCES = ['WEBSITE_FORM', 'AI_ASSISTANT', 'WHATSAPP', 'EMAIL', 'REFERRAL', 'TRADE_SHOW', 'MANUAL', 'OTHER'];
  var SCORES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

  function label(v) {
    if (!v) return '—';
    return String(v).charAt(0) + String(v).slice(1).toLowerCase().replace(/_/g, ' ');
  }

  /** The score a human actually sees: an override wins over the computed one,
   *  because a person who disagreed with the machine is the better answer. */
  function effectiveScore(lead) {
    return lead.scoreOverride || lead.score;
  }

  function pager(meta, onGo) {
    var wrap = h('div.pager');
    wrap.appendChild(h('button.btn.btn--sm', {
      type: 'button', disabled: meta.page <= 1, onclick: function () { onGo(meta.page - 1); },
    }, 'Previous'));
    wrap.appendChild(h('span.pager__label', 'Page ' + meta.page + ' of ' + meta.totalPages + ' — ' + meta.total + ' total'));
    wrap.appendChild(h('button.btn.btn--sm', {
      type: 'button', disabled: meta.page >= meta.totalPages, onclick: function () { onGo(meta.page + 1); },
    }, 'Next'));
    return wrap;
  }

  /* ------------------------------------------------------------ companies -- */

  Admin.route('/crm', {
    title: 'Customers',
    subtitle: 'Every company that has been in touch',
    render: function (mount) {
      var state = { q: '', segment: '', country: '', page: 1, perPage: 25 };
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      toolbar.appendChild(h('input', {
        type: 'search', placeholder: 'Company, person, email, country…', 'aria-label': 'Search customers',
        oninput: ui.debounce(function (e) { state.q = e.target.value.trim(); state.page = 1; load(); }, 300),
      }));

      toolbar.appendChild(h('select', {
        'aria-label': 'Filter by type',
        onchange: function (e) { state.segment = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'All types'),
        SEGMENTS.map(function (s) { return h('option', { value: s }, label(s)); })));

      toolbar.appendChild(h('button.btn.btn--accent', {
        type: 'button', onclick: function () { editCompany(null); },
      }, 'Add company'));

      card.appendChild(toolbar);
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(5));
        return api.get('/api/admin/crm/companies' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty(
                state.q || state.segment ? 'No customers match' : 'No customers yet',
                state.q || state.segment
                  ? 'Try clearing the filters.'
                  : 'Accounts are created automatically the first time somebody sends a quote request or a message. You can also add one by hand.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'Company'), h('th', 'Type'), h('th', 'Country'),
              h('th', 'People'), h('th', 'Leads'), h('th', 'Enquiries'), h('th', 'Last contact'))));

            var body = h('tbody');
            res.data.forEach(function (c) {
              var enquiries = c._count.quotes + c._count.messages + c._count.conversations;
              var tr = h('tr');
              var nameCell = h('td');
              nameCell.appendChild(h('a', { href: '#/crm/companies/' + c.id }, c.name));
              if (c.tags && c.tags.length) {
                var tagRow = h('div.tag-row');
                c.tags.forEach(function (t) { tagRow.appendChild(h('span.tag', label(t))); });
                nameCell.appendChild(tagRow);
              }
              tr.appendChild(nameCell);
              tr.appendChild(h('td', label(c.segment)));
              tr.appendChild(h('td', c.country || '—'));
              tr.appendChild(h('td', String(c._count.contacts)));
              tr.appendChild(h('td', String(c._count.leads)));
              tr.appendChild(h('td', String(enquiries)));
              tr.appendChild(h('td', c.lastContactAt ? ui.date(c.lastContactAt) : '—'));
              body.appendChild(tr);
            });
            table.appendChild(body);
            slot.appendChild(table);

            if (res.meta.totalPages > 1) slot.appendChild(pager(res.meta, function (p) { state.page = p; load(); }));
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      function editCompany(company) {
        var isNew = !company;
        var c = company || {};
        var name = h('input', { type: 'text', value: c.name || '', required: true });
        var country = h('input', { type: 'text', value: c.country || '' });
        var website = h('input', { type: 'url', value: c.website || '', placeholder: 'https://' });
        var tags = h('input', { type: 'text', value: (c.tags || []).join(', '), placeholder: 'HOT_LEAD, ACADEMY' });
        var notes = h('textarea', { rows: 4, value: c.notes || '' });
        var segment = h('select', {}, SEGMENTS.map(function (s) {
          return h('option', { value: s, selected: (c.segment || 'OTHER') === s }, label(s));
        }));
        var source = h('select', {}, SOURCES.map(function (s) {
          return h('option', { value: s, selected: (c.source || 'MANUAL') === s }, label(s));
        }));

        var form = h('form', { novalidate: true },
          h('div.field.field--req', h('label.field__label', { text: 'Company name' }), name),
          h('div.field', h('label.field__label', { text: 'Type' }), segment),
          h('div.field', h('label.field__label', { text: 'Country' }), country),
          h('div.field', h('label.field__label', { text: 'Website' }), website),
          h('div.field', h('label.field__label', { text: 'How they found us' }), source),
          h('div.field', h('label.field__label', { text: 'Tags' }), tags,
            h('p.field__hint', { text: 'Comma separated. Used for filtering — they are uppercased so the same tag typed two ways stays one tag.' })),
          h('div.field', h('label.field__label', { text: 'Notes' }), notes));

        ui.modal({
          title: isNew ? 'Add company' : 'Edit company',
          confirmLabel: isNew ? 'Create' : 'Save',
          body: form,
        }).then(function (ok) {
          if (!ok) return;
          var payload = {
            name: name.value.trim(),
            country: country.value.trim(),
            website: website.value.trim(),
            segment: segment.value,
            source: source.value,
            notes: notes.value.trim(),
            tags: tags.value.split(',').map(function (t) { return t.trim(); }).filter(Boolean),
          };
          if (!payload.name) { ui.toast('A company name is required.', 'error'); return; }

          (isNew ? api.post('/api/admin/crm/companies', payload)
                 : api.put('/api/admin/crm/companies/' + c.id, payload))
            .then(function () { ui.toast(isNew ? 'Company created' : 'Company saved', 'ok'); return load(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        });
      }

      Admin.crmEditCompany = editCompany;
      return load();
    },
  });

  /* --------------------------------------------------------- one company -- */

  Admin.route('/crm/companies/:id', {
    title: 'Customer',
    subtitle: 'Account, people and everything that has happened',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return api.get('/api/admin/crm/companies/' + encodeURIComponent(params.id)).then(function (res) {
        var c = res.data;
        ui.clear(mount);
        mount.appendChild(h('a.btn.btn--sm', { href: '#/crm' }, '← All customers'));

        var layout = h('div.split');

        /* --- left: timeline --- */
        var left = h('section.card');
        left.appendChild(h('h2.card__title', 'Timeline'));
        left.appendChild(h('p.card__hint',
          'Every quote request, message, assistant conversation and pipeline move for this account, newest first.'));

        if (!c.timeline.length) {
          left.appendChild(ui.empty('Nothing yet', 'Activity appears here as it happens.'));
        } else {
          var list = h('div.timeline');
          c.timeline.forEach(function (e) {
            var row = h('div.timeline__row.timeline__row--' + e.kind);
            row.appendChild(h('div.timeline__when', ui.dateTime(e.at)));
            var bodyEl = h('div.timeline__body');
            if (e.href) {
              var link = h('a.timeline__title', e.title);
              link.href = e.href;
              bodyEl.appendChild(link);
            } else {
              bodyEl.appendChild(h('div.timeline__title', e.title));
            }
            if (e.detail) bodyEl.appendChild(h('div.timeline__detail', e.detail));
            row.appendChild(bodyEl);
            list.appendChild(row);
          });
          left.appendChild(list);
        }
        layout.appendChild(left);

        /* --- right: the account --- */
        var right = h('section.card');
        right.appendChild(h('h2.card__title', c.name));

        var dl = h('dl.detail');
        [['Type', label(c.segment)], ['Country', c.country], ['Website', c.website],
         ['Source', label(c.source)], ['First seen', ui.date(c.createdAt)],
         ['Last contact', c.lastContactAt ? ui.dateTime(c.lastContactAt) : 'Never']]
          .forEach(function (p) {
            if (!p[1]) return;
            dl.appendChild(h('dt', p[0]));
            dl.appendChild(h('dd', String(p[1])));
          });
        right.appendChild(dl);

        if (c.tags && c.tags.length) {
          var tagRow = h('div.tag-row');
          c.tags.forEach(function (t) { tagRow.appendChild(h('span.tag', label(t))); });
          right.appendChild(tagRow);
        }
        if (c.notes) {
          right.appendChild(h('h3.card__subtitle', 'Notes'));
          right.appendChild(h('p.detail__note', c.notes));
        }

        /* --- people --- */
        right.appendChild(h('h3.card__subtitle', 'People'));
        if (!c.contacts.length) {
          right.appendChild(h('p.card__hint', 'Nobody recorded yet.'));
        } else {
          var people = h('div.people');
          c.contacts.forEach(function (p) {
            var row = h('div.people__row');
            var top = h('div.people__name', p.name + (p.isPrimary ? ' · primary' : ''));
            row.appendChild(top);
            var bits = [p.jobTitle, p.email, p.whatsapp || p.phone].filter(Boolean).join(' · ');
            if (bits) row.appendChild(h('div.people__meta', bits));
            row.appendChild(h('button.btn.btn--sm', {
              type: 'button', onclick: function () { editContact(c.id, p); },
            }, 'Edit'));
            people.appendChild(row);
          });
          right.appendChild(people);
        }
        right.appendChild(h('button.btn.btn--sm', {
          type: 'button', onclick: function () { editContact(c.id, null); },
        }, 'Add person'));

        /* --- leads --- */
        right.appendChild(h('h3.card__subtitle', 'Opportunities'));
        if (!c.leads.length) {
          right.appendChild(h('p.card__hint', 'No leads on this account yet.'));
        } else {
          var ll = h('div.people');
          c.leads.forEach(function (l) {
            var row = h('div.people__row');
            var a = h('a.people__name', l.title);
            a.href = '#/crm/leads/' + l.id;
            row.appendChild(a);
            row.appendChild(h('div.people__meta',
              [label(l.stage), l.quantity ? l.quantity + ' balls' : null, l.owner ? 'Owner: ' + l.owner.name : 'Unassigned']
                .filter(Boolean).join(' · ')));
            ll.appendChild(row);
          });
          right.appendChild(ll);
        }

        layout.appendChild(right);
        mount.appendChild(layout);

        function editContact(companyId, contact) {
          var isNew = !contact;
          var p = contact || {};
          var name = h('input', { type: 'text', value: p.name || '', required: true });
          var jobTitle = h('input', { type: 'text', value: p.jobTitle || '' });
          var emailIn = h('input', { type: 'email', value: p.email || '' });
          var whatsapp = h('input', { type: 'text', value: p.whatsapp || '' });
          var phone = h('input', { type: 'text', value: p.phone || '' });
          var isPrimary = h('input', { type: 'checkbox', checked: Boolean(p.isPrimary) });

          var form = h('form', { novalidate: true },
            h('div.field.field--req', h('label.field__label', { text: 'Name' }), name),
            h('div.field', h('label.field__label', { text: 'Job title' }), jobTitle),
            h('div.field', h('label.field__label', { text: 'Email' }), emailIn),
            h('div.field', h('label.field__label', { text: 'WhatsApp' }), whatsapp),
            h('div.field', h('label.field__label', { text: 'Phone' }), phone),
            h('label.check', isPrimary, h('span', { text: 'Main contact for this company' })));

          ui.modal({
            title: isNew ? 'Add person' : 'Edit person',
            confirmLabel: isNew ? 'Add' : 'Save',
            body: form,
          }).then(function (ok) {
            if (!ok) return;
            var payload = {
              name: name.value.trim(), jobTitle: jobTitle.value.trim(),
              email: emailIn.value.trim(), whatsapp: whatsapp.value.trim(),
              phone: phone.value.trim(), isPrimary: isPrimary.checked,
            };
            if (!payload.name) { ui.toast('A name is required.', 'error'); return; }

            (isNew ? api.post('/api/admin/crm/companies/' + companyId + '/contacts', payload)
                   : api.put('/api/admin/crm/contacts/' + p.id, payload))
              .then(function () { ui.toast(isNew ? 'Person added' : 'Person saved', 'ok'); location.reload(); })
              .catch(function (err) { ui.toast(err.message, 'error'); });
          });
        }
      });
    },
  });

  /* --------------------------------------------------------------- board -- */

  Admin.route('/crm/leads', {
    title: 'Pipeline',
    subtitle: 'Every open opportunity, by stage',
    render: function (mount) {
      var slot = h('div');
      ui.clear(mount).appendChild(slot);

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(3));
        return api.get('/api/admin/crm/leads/board')
          .then(function (res) {
            ui.clear(slot);
            var leads = res.data.open;

            if (!leads.length) {
              slot.appendChild(ui.empty('No open leads',
                'Leads are opportunities you are working. Create one from a customer, or add it here.',
                h('button.btn.btn--accent', { type: 'button', onclick: function () { newLead(); } }, 'Add lead')));
              return;
            }

            var bar = h('div.toolbar');
            bar.appendChild(h('span.muted', leads.length + ' open'));
            bar.appendChild(h('button.btn.btn--accent', { type: 'button', onclick: function () { newLead(); } }, 'Add lead'));
            slot.appendChild(bar);

            var board = h('div.board');
            STAGES.forEach(function (stage) {
              var inStage = leads.filter(function (l) { return l.stage === stage; });
              var col = h('div.board__col');
              col.dataset.stage = stage;

              col.appendChild(h('div.board__head',
                h('span.board__title', label(stage)),
                h('span.board__count', String(inStage.length))));

              var body = h('div.board__body');
              body.dataset.stage = stage;

              /* Drop target. The card carries its own id, so a drop only
                 needs to know which column it landed in. */
              body.addEventListener('dragover', function (e) { e.preventDefault(); body.classList.add('board__body--over'); });
              body.addEventListener('dragleave', function () { body.classList.remove('board__body--over'); });
              body.addEventListener('drop', function (e) {
                e.preventDefault();
                body.classList.remove('board__body--over');
                var id = e.dataTransfer.getData('text/plain');
                if (id) move(id, stage);
              });

              inStage.forEach(function (l) { body.appendChild(cardFor(l)); });
              col.appendChild(body);
              board.appendChild(col);
            });
            slot.appendChild(board);
          })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      function cardFor(lead) {
        var card = h('article.lead');
        card.draggable = true;
        card.dataset.id = lead.id;

        card.addEventListener('dragstart', function (e) {
          e.dataTransfer.setData('text/plain', lead.id);
          e.dataTransfer.effectAllowed = 'move';
          card.classList.add('lead--dragging');
        });
        card.addEventListener('dragend', function () { card.classList.remove('lead--dragging'); });

        var title = h('a.lead__title', lead.title);
        title.href = '#/crm/leads/' + lead.id;
        card.appendChild(title);

        if (lead.company) card.appendChild(h('div.lead__company', lead.company.name));

        var meta = [lead.quantity ? lead.quantity + ' balls' : null, lead.company && lead.company.country]
          .filter(Boolean).join(' · ');
        if (meta) card.appendChild(h('div.lead__meta', meta));

        var foot = h('div.lead__foot');
        foot.appendChild(h('span.score.score--' + effectiveScore(lead).toLowerCase(), label(effectiveScore(lead))));

        /* The keyboard path. Dragging is a mouse gesture and cannot be the
           only way to move a lead — this select does the same thing and is
           reachable by tab. */
        var mover = h('select.lead__move', {
          'aria-label': 'Move ' + lead.title + ' to another stage',
          onchange: function (e) { if (e.target.value) move(lead.id, e.target.value); },
        }, h('option', { value: '' }, 'Move to…'),
          STAGES.filter(function (s) { return s !== lead.stage; })
            .map(function (s) { return h('option', { value: s }, label(s)); }));
        foot.appendChild(mover);

        card.appendChild(foot);
        return card;
      }

      function move(id, stage) {
        api.patch('/api/admin/crm/leads/' + id + '/stage', { stage: stage })
          .then(function () { ui.toast('Moved to ' + label(stage), 'ok'); return load(); })
          .catch(function (err) { ui.toast(err.message, 'error'); load(); });
      }

      function newLead() {
        var title = h('input', { type: 'text', required: true, placeholder: 'e.g. 500 thermal bonded, own branding' });
        var quantity = h('input', { type: 'number', min: 1 });
        var stage = h('select', {}, STAGES.map(function (s) { return h('option', { value: s, selected: s === 'NEW' }, label(s)); }));
        var source = h('select', {}, SOURCES.map(function (s) { return h('option', { value: s, selected: s === 'MANUAL' }, label(s)); }));
        var companySelect = h('select', {}, h('option', { value: '' }, 'No company yet'));

        api.get('/api/admin/crm/companies?perPage=200').then(function (res) {
          res.data.forEach(function (c) { companySelect.appendChild(h('option', { value: c.id }, c.name)); });
        }).catch(function () { /* the picker is a convenience */ });

        var form = h('form', { novalidate: true },
          h('div.field.field--req', h('label.field__label', { text: 'What is the opportunity?' }), title),
          h('div.field', h('label.field__label', { text: 'Customer' }), companySelect),
          h('div.field', h('label.field__label', { text: 'Quantity' }), quantity),
          h('div.field', h('label.field__label', { text: 'Stage' }), stage),
          h('div.field', h('label.field__label', { text: 'Source' }), source));

        ui.modal({ title: 'Add lead', confirmLabel: 'Create', body: form }).then(function (ok) {
          if (!ok) return;
          if (!title.value.trim()) { ui.toast('Describe the opportunity in a few words.', 'error'); return; }
          api.post('/api/admin/crm/leads', {
            title: title.value.trim(),
            companyId: companySelect.value || undefined,
            quantity: quantity.value ? Number(quantity.value) : undefined,
            stage: stage.value,
            source: source.value,
          })
            .then(function () { ui.toast('Lead created', 'ok'); return load(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        });
      }

      return load();
    },
  });

  /* ------------------------------------------------------------ one lead -- */

  Admin.route('/crm/leads/:id', {
    title: 'Lead',
    subtitle: 'One opportunity and how it got here',
    render: function (mount, params) {
      mount.appendChild(ui.skeleton(4));

      return api.get('/api/admin/crm/leads/' + encodeURIComponent(params.id)).then(function (res) {
        var l = res.data;
        ui.clear(mount);
        mount.appendChild(h('a.btn.btn--sm', { href: '#/crm/leads' }, '← Pipeline'));

        var layout = h('div.split');

        var left = h('section.card');
        left.appendChild(h('h2.card__title', l.title));
        if (l.reference) left.appendChild(h('p.card__hint', l.reference));

        left.appendChild(h('h3.card__subtitle', 'Stage'));
        var row = h('div.chip-row');
        STAGES.forEach(function (s) {
          row.appendChild(h('button.btn.btn--sm', {
            type: 'button',
            'aria-pressed': String(l.stage === s),
            onclick: function () {
              api.patch('/api/admin/crm/leads/' + l.id + '/stage', { stage: s })
                .then(function () { ui.toast('Moved to ' + label(s), 'ok'); location.reload(); })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          }, label(s)));
        });
        left.appendChild(row);

        left.appendChild(h('h3.card__subtitle', 'History'));
        var hist = h('div.timeline');
        l.stageEvents.forEach(function (e) {
          var r = h('div.timeline__row.timeline__row--stage');
          r.appendChild(h('div.timeline__when', ui.dateTime(e.createdAt)));
          var b = h('div.timeline__body');
          b.appendChild(h('div.timeline__title',
            e.fromStage ? label(e.fromStage) + ' → ' + label(e.toStage) : 'Opened at ' + label(e.toStage)));
          var by = [e.by && e.by.name, e.note].filter(Boolean).join(' · ');
          if (by) b.appendChild(h('div.timeline__detail', by));
          r.appendChild(b);
          hist.appendChild(r);
        });
        left.appendChild(hist);
        layout.appendChild(left);

        var right = h('section.card');
        right.appendChild(h('h2.card__title', 'Details'));
        var dl = h('dl.detail');
        [['Customer', l.company && l.company.name], ['Contact', l.contact && l.contact.name],
         ['Email', l.contact && l.contact.email], ['Country', l.company && l.company.country],
         ['Product', l.product && l.product.productName], ['Category', l.category && l.category.name],
         ['Quantity', l.quantity], ['Size', l.size],
         ['Customization', l.customizationRequired === null ? null : (l.customizationRequired ? 'Yes' : 'No')],
         ['Score', label(effectiveScore(l)) + (l.scoreOverride ? ' (set by hand)' : '')],
         ['Owner', l.owner && l.owner.name], ['Source', label(l.source)],
         ['Opened', ui.date(l.createdAt)],
         ['Closed', l.closedAt ? ui.date(l.closedAt) : null]]
          .forEach(function (p) {
            if (p[1] === null || p[1] === undefined || p[1] === '') return;
            dl.appendChild(h('dt', p[0]));
            dl.appendChild(h('dd', String(p[1])));
          });
        right.appendChild(dl);

        if (l.company) {
          right.appendChild(h('a.btn.btn--sm', { href: '#/crm/companies/' + l.company.id }, 'Open customer'));
        }

        if (l.requirements) {
          right.appendChild(h('h3.card__subtitle', 'Requirements'));
          right.appendChild(h('p.detail__note', l.requirements));
        }

        if (l.quotes && l.quotes.length) {
          right.appendChild(h('h3.card__subtitle', 'Quote requests'));
          var ql = h('ul.plain-list');
          l.quotes.forEach(function (q) {
            ql.appendChild(h('li', [q.reference || q.id, label(q.status), ui.date(q.createdAt)].join(' · ')));
          });
          right.appendChild(ql);
        }

        layout.appendChild(right);
        mount.appendChild(layout);
      });
    },
  });
})();
