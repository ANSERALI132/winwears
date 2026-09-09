/* ==========================================================================
   Admin — Documents
   A card that attaches files to any record, and a library of everything.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  function size(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (Math.round((n / (1024 * 1024)) * 10) / 10) + ' MB';
  }

  function kindOf(contentType) {
    if (contentType === 'application/pdf') return 'PDF';
    if (String(contentType).indexOf('image/') === 0) return 'Image';
    return contentType;
  }

  /**
   * The attachments card.
   *
   * One component used on every record screen, so a document behaves the same
   * whether it is hanging off an order or an inspection. Call it with what it
   * is attached to; it does the rest.
   */
  Admin.documentsCard = function (entity, entityId, options) {
    var opts = options || {};
    var card = h('section.card');
    card.appendChild(h('h2.card__title', opts.title || 'Documents'));
    card.appendChild(h('p.card__hint',
      opts.hint || 'Artwork, purchase orders, certificates. Held privately — a link only works for somebody signed in here.'));

    var slot = h('div');
    card.appendChild(slot);

    var file = h('input', { type: 'file', accept: '.pdf,.png,.jpg,.jpeg,.webp' });
    var title = h('input', { type: 'text', placeholder: 'What is it? (optional)' });
    var add = h('button.btn.btn--accent', { type: 'button' }, 'Attach');

    add.addEventListener('click', function () {
      if (!file.files || !file.files[0]) { ui.toast('Choose a file first.', 'error'); return; }

      var form = new FormData();
      form.append('file', file.files[0]);
      form.append('entity', entity);
      form.append('entityId', entityId);
      if (title.value.trim()) form.append('title', title.value.trim());

      add.disabled = true;
      /* api.post already leaves a FormData body alone so the browser can set
         the multipart boundary itself. */
      api.post('/api/admin/attachments', form)
        .then(function () {
          ui.toast('Attached', 'ok');
          file.value = '';
          title.value = '';
          add.disabled = false;
          load();
        })
        .catch(function (err) { ui.toast(err.message, 'error'); add.disabled = false; });
    });

    card.appendChild(h('div.grid.grid--2',
      h('div.field', h('label.field__label', { text: 'File' }), file,
        h('p.field__hint', { text: 'PDF or an image, up to the site’s upload limit.' })),
      h('div.field', h('label.field__label', { text: 'Label' }), title)));
    card.appendChild(h('div.card__foot', add));

    function load() {
      ui.clear(slot).appendChild(ui.skeleton(2));
      return api.get('/api/admin/attachments?entity=' + encodeURIComponent(entity)
        + '&entityId=' + encodeURIComponent(entityId) + '&perPage=50')
        .then(function (res) {
          ui.clear(slot);
          if (!res.data.length) {
            slot.appendChild(h('p.muted', { text: 'Nothing attached yet.' }));
            return;
          }

          var table = h('table.table');
          table.appendChild(h('thead', h('tr',
            h('th', 'File'), h('th', 'Kind'), h('th', 'Size'), h('th', 'Added'), h('th', 'By'), h('th'))));
          var body = h('tbody');
          res.data.forEach(function (d) { body.appendChild(rowFor(d, load)); });
          table.appendChild(body);
          slot.appendChild(table);
        })
        .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
    }

    load();
    return card;
  };

  function rowFor(d, reload) {
    var tr = h('tr');

    /* A real link so the browser's own download handling applies — and it is
       an API path rather than a file path, because the file is not served
       from anywhere public. */
    var link = h('a', { href: d.href, download: d.filename }, d.title || d.filename);
    var nameCell = h('td', link);
    if (d.title) nameCell.appendChild(h('div.muted.tiny', { text: d.filename }));
    tr.appendChild(nameCell);

    tr.appendChild(h('td', kindOf(d.contentType)));
    tr.appendChild(h('td', size(d.bytes)));
    tr.appendChild(h('td', ui.date(d.createdAt)));
    tr.appendChild(h('td', d.uploadedBy ? d.uploadedBy.name : '—'));

    tr.appendChild(h('td.cell-actions', h('button.btn.btn--sm.btn--danger', {
      type: 'button',
      onclick: function () {
        ui.modal({
          title: 'Delete ' + (d.title || d.filename) + '?',
          danger: true,
          confirmLabel: 'Delete',
          message: 'The file is removed from storage as well. This cannot be undone.',
        }).then(function (ok) {
          if (!ok) return;
          api.del('/api/admin/attachments/' + d.id)
            .then(function () { ui.toast('Deleted', 'ok'); if (reload) reload(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        });
      },
    }, 'Delete')));

    return tr;
  }

  /* ---------------------------------------------------------- the library -- */

  Admin.route('/documents', {
    title: 'Documents',
    subtitle: 'Everything attached to anything',
    render: function (mount) {
      var state = { entity: '', page: 1, perPage: 50 };
      var card = h('section.card');
      var toolbar = h('div.toolbar');
      var slot = h('div');

      var entitySelect = h('select', {
        'aria-label': 'Filter by what it is attached to',
        onchange: function (e) { state.entity = e.target.value; state.page = 1; load(); },
      }, h('option', { value: '' }, 'Attached to anything'));
      toolbar.appendChild(entitySelect);

      card.appendChild(toolbar);
      card.appendChild(h('p.card__hint',
        'Files live outside the public site and are only readable by somebody signed in here. Attach one from the record it belongs to.'));
      card.appendChild(slot);
      ui.clear(mount).appendChild(card);

      api.get('/api/admin/attachments/kinds').then(function (res) {
        res.data.entities.forEach(function (e) {
          entitySelect.appendChild(h('option', { value: e }, e.charAt(0).toUpperCase() + e.slice(1)));
        });
      }).catch(function () { /* the list still works unfiltered */ });

      function load() {
        ui.clear(slot).appendChild(ui.skeleton(4));
        return api.get('/api/admin/attachments' + api.qs(state))
          .then(function (res) {
            ui.clear(slot);
            if (!res.data.length) {
              slot.appendChild(ui.empty('No documents yet',
                'Artwork, purchase orders and certificates appear here once they are attached to an order, a quotation or a customer.'));
              return;
            }

            var table = h('table.table');
            table.appendChild(h('thead', h('tr',
              h('th', 'File'), h('th', 'Attached to'), h('th', 'Kind'),
              h('th', 'Size'), h('th', 'Added'), h('th', 'By'), h('th'))));
            var body = h('tbody');
            res.data.forEach(function (d) {
              var tr = rowFor(d, load);
              /* Same row, plus what it belongs to — which the card on a record
                 screen already knows and does not need to repeat. */
              tr.insertBefore(h('td', d.entity), tr.children[1]);
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
