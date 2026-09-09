/**
 * Editable page copy.
 *
 * The site's pages are hand-written HTML and stay that way. What this adds is
 * a way to change the words in specific places without touching a file — the
 * headline on a page, the sentence under it, the line above a call to action.
 *
 * Two decisions hold the whole design together.
 *
 * The HTML is the default. A block that has never been edited is simply
 * absent, and the page shows the copy it was built with. Nothing is seeded and
 * nothing is duplicated here, so the registry cannot drift out of step with
 * words it does not hold. An empty CMS leaves the site pixel-identical.
 *
 * Blocks are text, never markup. They are written to the page with
 * textContent, so a heading cannot become a script tag no matter what is typed
 * into the admin. That rules out a rich-text editor, which is the right trade:
 * the design lives in the stylesheet, and letting somebody paste arbitrary
 * HTML into a hand-built page is how a premium front end stops being one.
 */

export interface ContentKey {
  key: string;
  label: string;
  /** Where on the page it appears, so somebody editing knows what they are
   *  changing without opening the site in another tab. */
  where: string;
  /** Roughly how long the original is, so a replacement that will wrap badly
   *  is obvious before it is saved rather than after. */
  long?: boolean;
}

export interface ContentPage {
  page: string;
  title: string;
  path: string;
  keys: ContentKey[];
}

/**
 * Every place the site will read a block from.
 *
 * This list and the `data-ww-content` attributes in the HTML are two halves of
 * one contract: a key here with no attribute in the markup does nothing, and
 * an attribute with no key here cannot be edited. Both halves change together.
 */
export const CONTENT_PAGES: ContentPage[] = [
  {
    page: 'home',
    title: 'Home',
    path: '/index.html',
    /* The home headline is deliberately absent. It is built as three animated
       lines, each in its own element, and replacing its text would collapse
       that into one flat string — an edit that silently breaks the front page
       is worse than no edit at all. Changing it means changing index.html. */
    keys: [
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'about',
    title: 'About',
    path: '/about.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'manufacturing',
    title: 'Manufacturing',
    path: '/manufacturing.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'technology',
    title: 'Technology',
    path: '/technology.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'customization',
    title: 'Customization',
    path: '/customization.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'products',
    title: 'Products',
    path: '/products.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'faq',
    title: 'FAQ',
    path: '/faq.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'contact',
    title: 'Contact',
    path: '/contact.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
      { key: 'cta.title', label: 'Closing call to action', where: 'The band near the foot of the page' },
    ],
  },
  {
    page: 'quote',
    title: 'Request a quote',
    path: '/request-quote.html',
    keys: [
      { key: 'hero.title', label: 'Headline', where: 'The first line on the page' },
      { key: 'hero.subtitle', label: 'Under the headline', where: 'The sentence beneath it', long: true },
    ],
  },
];

const INDEX = new Map<string, Set<string>>(
  CONTENT_PAGES.map((p) => [p.page, new Set(p.keys.map((k) => k.key))]),
);

export function pageExists(page: string): boolean {
  return INDEX.has(page);
}

/** Whether a page/key pair is one the site will actually read. Nothing else
 *  can be saved: a block nobody can see is a block nobody can correct. */
export function keyExists(page: string, key: string): boolean {
  return INDEX.get(page)?.has(key) ?? false;
}

export const CONTENT_PAGE_NAMES: string[] = CONTENT_PAGES.map((p) => p.page);
