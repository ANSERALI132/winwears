/**
 * Context-aware WhatsApp handoff.
 *
 * When a conversation moves to WhatsApp the customer should not have to
 * repeat themselves, so the deep link carries what they already said. Only
 * what they actually said: an invented quantity in a prefilled message would
 * be a claim made in the customer's own voice, which is worse than a blank
 * message.
 *
 * Nothing internal travels here — no conversation id, no session id, no lead
 * score, no product database id. The message is what a person would
 * reasonably have typed themselves.
 */
import type { AIConversation } from '@prisma/client';

/** Everything the link needs about the ball, resolved by the caller so this
 *  stays free of database access. */
export interface WhatsappProduct {
  productName: string;
  sku: string;
}

const OPENING = 'Hello WIN WEARS, I was speaking with your website assistant and would like help with a football order.';

/**
 * Builds the message body.
 *
 * Lines appear only when there is something real to put on them, so a
 * customer who has said nothing gets a clean opening rather than a form with
 * empty fields.
 */
export function handoffMessage(
  conversation: Pick<AIConversation, 'quantity' | 'size' | 'customizationRequired' | 'country'> | null,
  product?: WhatsappProduct | null,
): string {
  const lines: string[] = [OPENING];

  if (product) lines.push(`Product: ${product.productName} (${product.sku})`);
  if (conversation?.quantity) lines.push(`Quantity: ${conversation.quantity}`);
  if (conversation?.size) lines.push(`Size: ${conversation.size}`);
  if (conversation?.customizationRequired !== null && conversation?.customizationRequired !== undefined) {
    lines.push(`Customization: ${conversation.customizationRequired ? 'Yes' : 'No'}`);
  }
  if (conversation?.country) lines.push(`Country: ${conversation.country}`);

  lines.push('Please assist me.');
  return lines.join('\n');
}

/**
 * Turns the configured WhatsApp URL into one carrying a prefilled message.
 *
 * Takes the admin-configured link rather than a constant, so changing the
 * number in /admin changes every handoff. Any existing query string is
 * discarded: wa.me takes exactly one `text` parameter, and appending a second
 * produces a link that silently drops the message.
 */
export function handoffLink(whatsappUrl: string | undefined, message: string): string | null {
  if (!whatsappUrl) return null;

  let url: URL;
  try {
    url = new URL(whatsappUrl);
  } catch {
    /* A setting that is not a URL at all cannot become a link. Returning it
       unchanged, as this used to, handed the browser whatever string an
       admin had typed. */
    return null;
  }

  /* Only real web addresses leave here. The setting is admin-editable, and
     javascript: is a valid URL as far as the parser is concerned — the
     browser would run it. The widget checks this again at the point it sets
     the href; this is the half that stops it being sent at all. */
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  /* encodeURIComponent, not the URLSearchParams default: wa.me wants %20
     for spaces and newlines encoded, and the "+" form arrives literally. */
  return `${url.origin}${url.pathname}?text=${encodeURIComponent(message)}`;
}
