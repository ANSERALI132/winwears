/* ==========================================================================
   Admin â€” shared document helpers

   Quotations and orders are the same document at two moments in its life: an
   offer, then a commitment. They format money the same way, label statuses
   the same way, and preview the same arithmetic while somebody types.

   Two copies of that would drift, and the day they drift is the day a
   customer is shown one total on the quotation and a different one on the
   order it became.
   ========================================================================== */
(function () {
  'use strict';

  var Admin = (window.Admin = window.Admin || {});

  /** CONFIRMED -> "Confirmed", READY_TO_SHIP -> "Ready to ship". */
  function label(value) {
    if (!value) return '—';
    return String(value).charAt(0) + String(value).slice(1).toLowerCase().replace(/_/g, ' ');
  }

  /** Formats money for display only. The server owns the arithmetic; this
   *  just puts a currency in front of a number the server calculated. */
  function money(amount, currency) {
    var n = Number(amount) || 0;
    try {
      return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD' }).format(n);
    } catch (err) {
      /* An unrecognised three-letter code should not blank the total. */
      return (currency || '') + ' ' + n.toFixed(2);
    }
  }

  /* Mirrors lib/quotation.ts so the person typing sees the total move. The
     server recomputes everything on save â€” this is a preview, never the
     figure that is stored. */
  function previewTotals(items, discountType, discountInput, shipping, taxRate) {
    var minor = function (v) { return Math.round((Number(v) || 0) * 100); };
    var major = function (m) { return Math.round(m) / 100; };

    var subtotal = items.reduce(function (sum, i) {
      return sum + Math.max(0, Math.trunc(Number(i.quantity) || 0)) * minor(i.unitPrice);
    }, 0);

    var discount = 0;
    if (discountType === 'PERCENT') {
      discount = Math.round((subtotal * Math.min(100, Math.max(0, Number(discountInput) || 0))) / 100);
    } else if (discountType === 'AMOUNT') {
      discount = Math.max(0, minor(discountInput));
    }
    discount = Math.min(discount, subtotal);

    var ship = Math.max(0, minor(shipping));
    var net = subtotal - discount;
    var tax = Math.round(((net + ship) * Math.min(100, Math.max(0, Number(taxRate) || 0))) / 100);

    return {
      subtotal: major(subtotal), discount: major(discount), shipping: major(ship),
      tax: major(tax), total: major(net + ship + tax),
    };
  }

  Admin.doc = { label: label, money: money, previewTotals: previewTotals };
})();
