/* ==========================================================================
   Admin — Page copy
   The words on the public pages, where they can be changed without touching
   a file.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = window.Admin;
  var h = Admin.ui.h;
  var ui = Admin.ui;
  var api = Admin.api;

  Admin.route('/content', {
    title: 'Page copy',
    subtitle: 'The words on the public site',
    render: function (mount) {
      var host = h('div');
      ui.clear(mount).appendChild(host);

      function load() {
        ui.clear(host).appendChild(ui.skeleton(5));
        return api.get('/api/admin/content')
          .then(function (res) {
            ui.clear(host);

            var intro = h('section.card');
            intro.appendChild(h('h2.card__title', 'How this works'));
            intro.appendChild(h('p.card__hint',
              'Each box below is one piece of text on the public site. Leave a box empty and the page keeps the words it was built with — nothing here is filled in for you, and clearing a box puts the original back.'));
            intro.appendChild(h('p.card__hint',
              'Text only. What you type appears exactly as typed, so HTML will not be interpreted — the design lives in the stylesheet, not in these boxes.'));
            host.appendChild(intro);

            res.data.forEach(function (page) {
              host.appendChild(pageCard(page, load));
            });
          })
          .catch(function (err) { ui.clear(host).appendChild(ui.errorState(err, load)); });
      }

      return load();
    },
  });

  function pageCard(page, reload) {
    var card = h('section.card');
    card.appendChild(h('h2.card__title', page.title));
    card.appendChild(h('p.card__hint', { text: page.path }));

    page.keys.forEach(function (block) {
      var input = block.long
        ? h('textarea', { rows: 3, value: block.text })
        : h('input', { type: 'text', value: block.text });

      var status = h('p.field__hint');
      function refreshStatus(edited, by, at) {
        if (!edited) {
          status.textContent = 'Not changed — the page shows its original wording.';
          return;
        }
        status.textContent = 'Changed'
          + (by ? ' by ' + by.name : '')
          + (at ? ' on ' + ui.date(at) : '')
          + '.';
      }
      refreshStatus(block.edited, block.updatedBy, block.updatedAt);

      var save = h('button.btn.btn--sm.btn--accent', { type: 'button' }, 'Save');
      save.addEventListener('click', function () {
        save.disabled = true;
        api.put('/api/admin/content', {
          page: page.page,
          key: block.key,
          text: input.value,
        })
          .then(function (res) {
            ui.toast(res.data.edited ? 'Saved' : 'Original wording restored', 'ok');
            refreshStatus(res.data.edited, res.data.updatedBy, res.data.updatedAt);
            block.edited = res.data.edited;
            save.disabled = false;
          })
          .catch(function (err) { ui.toast(err.message, 'error'); save.disabled = false; });
      });

      var restore = h('button.btn.btn--sm', { type: 'button' }, 'Restore the original');
      restore.addEventListener('click', function () {
        if (!block.edited) { ui.toast('This has not been changed.', 'error'); return; }
        api.del('/api/admin/content/' + encodeURIComponent(page.page) + '/' + encodeURIComponent(block.key))
          .then(function () { ui.toast('Original wording restored', 'ok'); reload(); })
          .catch(function (err) { ui.toast(err.message, 'error'); });
      });

      var field = h('div.field',
        h('label.field__label', { text: block.label }),
        h('p.field__hint', { text: block.where + '.' }),
        input,
        status,
        h('div.chip-row', save, restore));
      card.appendChild(field);
    });

    if (!page.keys.length) {
      card.appendChild(h('p.muted', { text: 'Nothing on this page is editable yet.' }));
    }

    return card;
  }
})();
