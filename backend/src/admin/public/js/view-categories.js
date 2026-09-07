/* ==========================================================================
   Admin — Categories
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  Admin.route('/categories', {
    title: 'Categories',
    subtitle: 'Groups the website organises products by',
    render: function (mount, _params, ctx) {
      ctx.actions.appendChild(
        h('button.btn.btn--accent', { type: 'button', onclick: function () { edit(null); } }, 'Add category'),
      );

      var slot = h('div');
      ui.clear(mount).appendChild(h('section.card', slot));
      return load();

      function load() {
        ui.clear(slot).appendChild(h('div', { style: 'padding:16px' }, ui.skeleton(4)));
        return api
          .get('/api/admin/categories')
          .then(function (res) { draw(res.data); })
          .catch(function (err) { ui.clear(slot).appendChild(ui.errorState(err, load)); });
      }

      function draw(rows) {
        ui.clear(slot);

        if (!rows.length) {
          slot.appendChild(
            ui.empty(
              'No categories yet',
              'Products need a category before they can be created.',
              h('button.btn.btn--accent', { type: 'button', onclick: function () { edit(null); } }, 'Add category'),
            ),
          );
          return;
        }

        slot.appendChild(
          h(
            'div.table-wrap',
            h(
              'table',
              h('thead', h('tr',
                h('th', 'Order'), h('th', 'Name'), h('th', 'Slug'), h('th', 'Products'),
                h('th', 'Active'), h('th.right', 'Actions'))),
              h('tbody', rows.map(function (c, i) { return row(c, i, rows); })),
            ),
          ),
        );

        slot.appendChild(
          h('div.card__foot', h('p.muted', {
            text: 'Use the arrows to change the order categories appear in on the website.',
          })),
        );
      }

      function row(c, index, all) {
        function moveTo(newIndex) {
          if (newIndex < 0 || newIndex >= all.length) return;
          var ids = all.map(function (x) { return x.id; });
          var moved = ids.splice(index, 1)[0];
          ids.splice(newIndex, 0, moved);
          api
            .post('/api/admin/categories/reorder', { ids: ids })
            .then(load)
            .catch(function (err) { ui.toast(err.message, 'error'); });
        }

        return h(
          'tr',
          h('td', h('div', { style: 'display:flex;gap:4px' },
            h('button.btn.btn--sm', { type: 'button', 'aria-label': 'Move up', disabled: index === 0,
              onclick: function () { moveTo(index - 1); } }, '↑'),
            h('button.btn.btn--sm', { type: 'button', 'aria-label': 'Move down', disabled: index === all.length - 1,
              onclick: function () { moveTo(index + 1); } }, '↓'))),
          h('td', h('strong', { text: c.name }),
            c.shortDescription ? h('div.muted.truncate', { text: c.shortDescription }) : null),
          h('td.mono', { text: c.slug }),
          h('td', h('a', { href: '#/products?category=' + encodeURIComponent(c.slug), text: String(c.productCount) })),
          h('td', h('input', {
            type: 'checkbox',
            checked: c.active,
            'aria-label': 'Active',
            onchange: function (e) {
              var next = e.target.checked;
              api
                .patch('/api/admin/categories/' + c.id + '/active', { active: next })
                .then(function () { ui.toast(next ? 'Category shown' : 'Category hidden', 'ok'); })
                .catch(function (err) { e.target.checked = !next; ui.toast(err.message, 'error'); });
            },
          })),
          h('td', h('div.cell-actions',
            h('button.btn.btn--sm', { type: 'button', onclick: function () { edit(c); } }, 'Edit'),
            h('button.btn.btn--sm.btn--danger', {
              type: 'button',
              onclick: function () {
                ui.confirmDelete(c.name, c.productCount > 0
                  ? 'This category still holds ' + c.productCount + ' product(s) and cannot be deleted yet.'
                  : 'This cannot be undone.').then(function (ok) {
                  if (!ok) return;
                  api
                    .del('/api/admin/categories/' + c.id)
                    .then(function () { ui.toast('Category deleted', 'ok'); return load(); })
                    .catch(function (err) { ui.toast(err.message, 'error'); });
                });
              },
            }, 'Delete'))),
        );
      }

      function edit(category) {
        var isNew = !category;
        var c = category || {};
        var errorSlot = h('div');

        var name = h('input', { type: 'text', name: 'name', value: c.name || '', required: true });
        var slug = h('input', { type: 'text', name: 'slug', value: c.slug || '', placeholder: 'generated from the name' });
        var shortDescription = h('input', { type: 'text', name: 'shortDescription', value: c.shortDescription || '' });
        var description = h('textarea', { name: 'description', rows: 4, value: c.description || '' });
        var image = h('input', { type: 'text', name: 'image', value: c.image || '', placeholder: '/assets/img/...' });
        var metaTitle = h('input', { type: 'text', name: 'metaTitle', value: c.metaTitle || '' });
        var metaDescription = h('textarea', { name: 'metaDescription', rows: 2, value: c.metaDescription || '' });
        var active = h('input', { type: 'checkbox', name: 'active', checked: c.active !== false });

        var form = h('form', { novalidate: true },
          errorSlot,
          h('div.field.field--req', h('label.field__label', { text: 'Name' }), name),
          h('div.field', h('label.field__label', { text: 'Slug' }), slug,
            h('p.field__hint', { text: 'Used in the category URL. Leave blank to generate one.' })),
          h('div.field', h('label.field__label', { text: 'Short description' }), shortDescription),
          h('div.field', h('label.field__label', { text: 'Description' }), description),
          h('div.field', h('label.field__label', { text: 'Hero image URL' }), image),
          h('div.field', h('label.field__label', { text: 'Meta title' }), metaTitle),
          h('div.field', h('label.field__label', { text: 'Meta description' }), metaDescription),
          h('label.check', active, h('span', { text: 'Active — shown on the website' })));

        ui.modal({
          title: isNew ? 'Add category' : 'Edit category',
          confirmLabel: isNew ? 'Create' : 'Save',
          body: form,
        }).then(function (ok) {
          if (!ok) return;

          var body = {
            name: name.value.trim(),
            slug: slug.value.trim(),
            shortDescription: shortDescription.value.trim(),
            description: description.value.trim(),
            image: image.value.trim(),
            metaTitle: metaTitle.value.trim(),
            metaDescription: metaDescription.value.trim(),
            active: active.checked,
          };
          if (!body.slug) delete body.slug;

          if (!body.name) {
            ui.toast('Category name is required.', 'error');
            return;
          }

          var request = isNew
            ? api.post('/api/admin/categories', body)
            : api.put('/api/admin/categories/' + c.id, body);

          request
            .then(function () { ui.toast(isNew ? 'Category created' : 'Category saved', 'ok'); return load(); })
            .catch(function (err) { ui.toast(err.message, 'error'); });
        });
      }
    },
  });
})();
