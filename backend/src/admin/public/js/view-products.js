/* ==========================================================================
   Admin — Products table
   Search, filter, sort, paginate; row actions for edit, duplicate, publish
   and delete.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  Admin.route('/products', {
    title: 'Products',
    subtitle: 'Everything in the catalogue',
    render: function (mount, _params, ctx) {
      var state = {
        q: '',
        category: '',
        status: '',
        sort: 'updated',
        page: 1,
        perPage: 25,
        includeDeleted: 'no',
      };

      ctx.actions.appendChild(h('a.btn.btn--accent', { href: '#/products/new' }, 'Add product'));
      ctx.actions.appendChild(
        h('button.btn', { type: 'button', onclick: openImportExport }, 'Import / Export'),
      );

      var tableSlot = h('div');
      var card = h('section.card');
      var toolbar = h('div.toolbar');

      ui.clear(mount).appendChild(card);
      card.appendChild(toolbar);
      card.appendChild(tableSlot);

      return api.get('/api/admin/categories').then(function (catRes) {
        buildToolbar(catRes.data);
        return load();
      });

      /* ---------------------------------------------------------------- */

      function buildToolbar(categories) {
        var search = h('input', {
          type: 'search',
          placeholder: 'Search name, SKU, material…',
          'aria-label': 'Search products',
          oninput: ui.debounce(function (e) {
            state.q = e.target.value.trim();
            state.page = 1;
            load();
          }, 300),
        });

        var catSelect = h(
          'select',
          {
            'aria-label': 'Filter by category',
            onchange: function (e) { state.category = e.target.value; state.page = 1; load(); },
          },
          h('option', { value: '' }, 'All categories'),
          categories.map(function (c) {
            return h('option', { value: c.slug }, c.name + ' (' + c.productCount + ')');
          }),
        );

        var statusSelect = h(
          'select',
          {
            'aria-label': 'Filter by status',
            onchange: function (e) { state.status = e.target.value; state.page = 1; load(); },
          },
          h('option', { value: '' }, 'All statuses'),
          h('option', { value: 'PUBLISHED' }, 'Published'),
          h('option', { value: 'DRAFT' }, 'Draft'),
          h('option', { value: 'ARCHIVED' }, 'Archived'),
        );

        var sortSelect = h(
          'select',
          {
            'aria-label': 'Sort',
            onchange: function (e) { state.sort = e.target.value; load(); },
          },
          h('option', { value: 'updated' }, 'Recently updated'),
          h('option', { value: 'newest' }, 'Newest first'),
          h('option', { value: 'name' }, 'Name A–Z'),
          h('option', { value: 'name-desc' }, 'Name Z–A'),
          h('option', { value: 'order' }, 'Display order'),
        );
        sortSelect.value = state.sort;

        toolbar.appendChild(search);
        toolbar.appendChild(catSelect);
        toolbar.appendChild(statusSelect);
        toolbar.appendChild(sortSelect);
        toolbar.appendChild(h('div.toolbar__spacer'));
        toolbar.appendChild(
          h(
            'label.check',
            { style: 'margin:0' },
            h('input', {
              type: 'checkbox',
              onchange: function (e) { state.includeDeleted = e.target.checked ? 'yes' : 'no'; state.page = 1; load(); },
            }),
            h('span', { text: 'Show deleted' }),
          ),
        );
      }

      function load() {
        ui.clear(tableSlot).appendChild(h('div', { style: 'padding:16px' }, ui.skeleton(6)));

        return api
          .get('/api/admin/products' + api.qs(state))
          .then(function (res) { renderTable(res.data, res.meta); })
          .catch(function (err) {
            ui.clear(tableSlot).appendChild(ui.errorState(err, load));
          });
      }

      function renderTable(rows, meta) {
        ui.clear(tableSlot);

        if (!rows.length) {
          tableSlot.appendChild(
            ui.empty(
              state.q || state.category || state.status ? 'No products match those filters' : 'No products yet',
              state.q || state.category || state.status
                ? 'Try clearing a filter.'
                : 'Add your first football to get started.',
              h('a.btn.btn--accent', { href: '#/products/new' }, 'Add product'),
            ),
          );
          return;
        }

        var body = h('tbody', rows.map(row));

        tableSlot.appendChild(
          h(
            'div.table-wrap',
            h(
              'table',
              h(
                'thead',
                h(
                  'tr',
                  h('th', { style: 'width:60px' }, 'Image'),
                  h('th', 'Product'),
                  h('th', 'SKU'),
                  h('th', 'Category'),
                  h('th', 'Status'),
                  h('th', 'Featured'),
                  h('th', 'Updated'),
                  h('th.right', 'Actions'),
                ),
              ),
              body,
            ),
          ),
        );

        tableSlot.appendChild(pager(meta));
      }

      function row(p) {
        var thumb = p.primaryImage
          ? h('img.thumb', { src: p.primaryImage, alt: '', loading: 'lazy' })
          : h('div.thumb.thumb--empty', { text: 'No image' });

        var featureToggle = h('input', {
          type: 'checkbox',
          checked: p.featured,
          'aria-label': 'Featured on the homepage',
          onchange: function (e) {
            var next = e.target.checked;
            api
              .patch('/api/admin/products/' + p.id + '/featured', { featured: next })
              .then(function () { ui.toast(next ? 'Added to featured' : 'Removed from featured', 'ok'); })
              .catch(function (err) {
                e.target.checked = !next;
                ui.toast(err.message, 'error');
              });
          },
        });

        var publishBtn = h(
          'button.btn.btn--sm',
          {
            type: 'button',
            onclick: function () {
              var next = p.status === 'PUBLISHED' ? 'DRAFT' : 'PUBLISHED';
              api
                .patch('/api/admin/products/' + p.id + '/status', { status: next })
                .then(function () {
                  ui.toast(next === 'PUBLISHED' ? 'Published' : 'Unpublished', 'ok');
                  load();
                })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          },
          p.status === 'PUBLISHED' ? 'Unpublish' : 'Publish',
        );

        var duplicateBtn = h(
          'button.btn.btn--sm',
          {
            type: 'button',
            onclick: function () {
              api
                .post('/api/admin/products/' + p.id + '/duplicate', {})
                .then(function (res) {
                  ui.toast('Duplicated as a draft', 'ok');
                  Admin.go('/products/' + res.data.id + '/edit');
                })
                .catch(function (err) { ui.toast(err.message, 'error'); });
            },
          },
          'Duplicate',
        );

        var deleted = Boolean(p.deletedAt);

        var deleteBtn = deleted
          ? h(
              'button.btn.btn--sm',
              {
                type: 'button',
                onclick: function () {
                  api
                    .post('/api/admin/products/' + p.id + '/restore', {})
                    .then(function () { ui.toast('Restored as a draft', 'ok'); load(); })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                },
              },
              'Restore',
            )
          : h(
              'button.btn.btn--sm.btn--danger',
              {
                type: 'button',
                onclick: function () {
                  ui.confirmDelete(
                    p.productName + ' (' + p.sku + ')',
                    'It will be archived and removed from the website. You can restore it later.',
                  ).then(function (ok) {
                    if (!ok) return;
                    api
                      .del('/api/admin/products/' + p.id)
                      .then(function () { ui.toast('Product archived', 'ok'); load(); })
                      .catch(function (err) { ui.toast(err.message, 'error'); });
                  });
                },
              },
              'Delete',
            );

        return h(
          'tr',
          { style: deleted ? 'opacity:.55' : '' },
          h('td', thumb),
          h(
            'td',
            h('a', { href: '#/products/' + p.id + '/edit', style: 'font-weight:600;text-decoration:none' }, p.productName),
            p.shortDescription ? h('div.muted.truncate', { text: p.shortDescription }) : null,
          ),
          h('td.mono', { text: p.sku }),
          h('td', { text: (p.category && p.category.name) || '—' }),
          h('td', ui.statusPill(deleted ? 'ARCHIVED' : p.status)),
          h('td', featureToggle),
          h('td.muted', { style: 'white-space:nowrap', text: ui.date(p.updatedAt) }),
          h(
            'td',
            h(
              'div.cell-actions',
              h('a.btn.btn--sm', { href: '#/products/' + p.id + '/edit' }, 'Edit'),
              duplicateBtn,
              deleted ? null : publishBtn,
              deleteBtn,
            ),
          ),
        );
      }

      function pager(meta) {
        var from = (meta.page - 1) * meta.perPage + 1;
        var to = Math.min(meta.total, meta.page * meta.perPage);

        return h(
          'div.pager',
          h('span.pager__info', { text: 'Showing ' + from + '–' + to + ' of ' + meta.total }),
          h(
            'button.btn.btn--sm',
            {
              type: 'button',
              disabled: meta.page <= 1,
              onclick: function () { state.page -= 1; load(); },
            },
            'Previous',
          ),
          h('span.muted', { text: 'Page ' + meta.page + ' of ' + meta.totalPages }),
          h(
            'button.btn.btn--sm',
            {
              type: 'button',
              disabled: meta.page >= meta.totalPages,
              onclick: function () { state.page += 1; load(); },
            },
            'Next',
          ),
        );
      }

      /* ------------------------------------------------- import/export -- */

      function openImportExport() {
        var resultSlot = h('div');
        var fileInput = h('input', { type: 'file', accept: '.csv,text/csv' });

        function send(dryRun) {
          if (!fileInput.files || !fileInput.files[0]) {
            ui.clear(resultSlot).appendChild(ui.notice('error', 'Choose a CSV file first.'));
            return;
          }
          var form = new FormData();
          form.append('file', fileInput.files[0]);

          ui.clear(resultSlot).appendChild(ui.notice('info', dryRun ? 'Checking…' : 'Importing…'));

          fetch('/api/admin/portability/import?dryRun=' + (dryRun ? 'true' : 'false'), {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': api.csrf() },
            body: form,
          })
            .then(function (res) { return res.json().then(function (b) { return { ok: res.ok, body: b }; }); })
            .then(function (out) {
              ui.clear(resultSlot);
              var d = out.body.data || {};

              if (!out.ok) {
                var lines = (d.errors || []).map(function (e) {
                  return 'Row ' + e.row + ' (' + e.sku + '): ' + e.errors.join(' ');
                });
                resultSlot.appendChild(
                  ui.notice('error', (out.body.error && out.body.error.message) || 'Import failed.', lines),
                );
                return;
              }

              if (dryRun) {
                resultSlot.appendChild(
                  ui.notice('ok', d.valid + ' of ' + d.total + ' rows are valid. Nothing has been imported yet.'),
                );
              } else {
                resultSlot.appendChild(ui.notice('ok', d.created + ' products imported.'));
                load();
              }
            })
            .catch(function () {
              ui.clear(resultSlot).appendChild(ui.notice('error', 'Something went wrong. Please try again.'));
            });
        }

        ui.modal({
          title: 'Import / Export products',
          confirmLabel: 'Close',
          cancelLabel: 'Cancel',
          body: h(
            'div',
            h('h3', { text: 'Export' }),
            h('p.muted', { text: 'Download every product as a CSV file, including features and specifications.' }),
            h(
              'p',
              h('a.btn.btn--sm', { href: '/api/admin/portability/export' }, 'Download CSV'),
              ' ',
              h('a.btn.btn--sm', { href: '/api/admin/portability/template' }, 'Download blank template'),
            ),
            h('hr', { style: 'border:0;border-top:1px solid var(--line);margin:16px 0' }),
            h('h3', { text: 'Import' }),
            h('p.muted', {
              text: 'Rows are checked before anything is written. If any row fails, nothing is imported. Existing SKUs are never overwritten.',
            }),
            fileInput,
            h(
              'p',
              { style: 'margin-top:10px;display:flex;gap:8px' },
              h('button.btn.btn--sm', { type: 'button', onclick: function () { send(true); } }, 'Check file'),
              h('button.btn.btn--sm.btn--primary', { type: 'button', onclick: function () { send(false); } }, 'Import'),
            ),
            resultSlot,
          ),
        });
      }
    },
  });
})();
