/**
 * Site settings.
 *
 * Seeded with the real WIN WEARS details and then owned by /admin/settings —
 * the frontend reads them from the API, so a changed WhatsApp number or a new
 * social profile does not need a code change.
 */
import { prisma } from '../db';

export interface SettingDefinition {
  key: string;
  group: string;
  label: string;
  value: string;
}

export const SETTING_DEFAULTS: SettingDefinition[] = [
  { key: 'company.name', group: 'company', label: 'Company name', value: 'WIN WEARS' },
  { key: 'company.tagline', group: 'company', label: 'Tagline', value: 'Premium Football Manufacturing' },
  { key: 'contact.email', group: 'contact', label: 'Email', value: 'wwinwears@gmail.com' },
  { key: 'contact.phoneDisplay', group: 'contact', label: 'Phone (as displayed)', value: '+92 370 6495974' },
  { key: 'contact.whatsappNumber', group: 'contact', label: 'WhatsApp number (digits only)', value: '923706495974' },
  { key: 'contact.whatsappUrl', group: 'contact', label: 'WhatsApp link', value: 'https://wa.me/923706495974' },
  {
    key: 'social.facebook',
    group: 'social',
    label: 'Facebook',
    value: 'https://www.facebook.com/share/1c6SBnGCqU/',
  },
  {
    key: 'social.instagram',
    group: 'social',
    label: 'Instagram',
    value: 'https://www.instagram.com/winwe.ars?igsi=cm80MnpuNWJ0ZWdk',
  },
  {
    key: 'social.linkedin',
    group: 'social',
    label: 'LinkedIn',
    value:
      'https://www.linkedin.com/in/win-wears-085a31405?utm_source=share_via&utm_content=profile&utm_medium=member_android',
  },
  { key: 'footer.text', group: 'footer', label: 'Footer text', value: '© 2026 WIN WEARS. All Rights Reserved.' },
  { key: 'seo.defaultTitle', group: 'seo', label: 'Default page title', value: 'WIN WEARS — Football Manufacturing' },
  {
    key: 'seo.defaultDescription',
    group: 'seo',
    label: 'Default meta description',
    value: 'WIN WEARS manufactures hybrid, hand stitched, thermal bonded and TPU footballs for clubs, academies and distributors worldwide.',
  },
  { key: 'seo.siteUrl', group: 'seo', label: 'Canonical site URL', value: 'https://winwears.com' },
  { key: 'homepage.featuredLimit', group: 'homepage', label: 'Featured products on the homepage', value: '6' },

  /* --- the AI assistant -----------------------------------------------
     Shown on their own admin screen rather than in the general settings
     list, because a boolean and a select do not belong in a column of text
     boxes. The API key is deliberately absent: it is read from the
     environment and must never be editable, or readable, from a browser. */
  { key: 'ai.enabled', group: 'ai', label: 'Assistant enabled', value: 'true' },
  { key: 'ai.greeting', group: 'ai', label: 'Greeting headline', value: 'How can we help?' },
  {
    key: 'ai.subtitle',
    group: 'ai',
    label: 'Greeting subtitle',
    value: 'Ask about footballs, customization, bulk orders or request a quote.',
  },
  {
    key: 'ai.escalationMessage',
    group: 'ai',
    label: 'What the assistant says when handing over',
    value: "I'd be happy to connect you with the WIN WEARS team for an accurate answer.",
  },
  {
    key: 'ai.extraInstructions',
    group: 'ai',
    label: 'Additional instructions',
    value: '',
  },
  { key: 'ai.model', group: 'ai', label: 'Model', value: '' },
  { key: 'ai.maxTokens', group: 'ai', label: 'Longest reply (tokens)', value: '' },
];

/** Settings the general /admin/settings screen should not render, because
 *  they have a screen of their own with controls that suit them. */
export const SETTING_GROUPS_ELSEWHERE = new Set(['ai']);

export async function getAllSettings(): Promise<Record<string, string>> {
  const rows = await prisma.setting.findMany();
  const out: Record<string, string> = {};
  for (const d of SETTING_DEFAULTS) out[d.key] = d.value;
  for (const row of rows) out[row.key] = row.value;
  return out;
}

export async function getSetting(key: string): Promise<string | undefined> {
  const row = await prisma.setting.findUnique({ where: { key } });
  if (row) return row.value;
  return SETTING_DEFAULTS.find((d) => d.key === key)?.value;
}

/** Writes only keys the application actually defines, so an arbitrary POST
 *  cannot fill the table with junk. */
export async function writeSettings(values: Record<string, string>): Promise<string[]> {
  const known = new Map(SETTING_DEFAULTS.map((d) => [d.key, d]));
  const written: string[] = [];

  for (const [key, value] of Object.entries(values)) {
    const def = known.get(key);
    if (!def) continue;
    await prisma.setting.upsert({
      where: { key },
      create: { key, value, group: def.group, label: def.label },
      update: { value },
    });
    written.push(key);
  }
  return written;
}

/** The shape the public site consumes as `WW.CONTACT`. */
export function toPublicContact(s: Record<string, string>) {
  return {
    brand: s['company.name'],
    tagline: s['company.tagline'],
    phoneDisplay: s['contact.phoneDisplay'],
    whatsapp: s['contact.whatsappUrl'],
    whatsappNumber: s['contact.whatsappNumber'],
    email: s['contact.email'],
    footerText: s['footer.text'],
    social: {
      facebook: s['social.facebook'],
      instagram: s['social.instagram'],
      linkedin: s['social.linkedin'],
      whatsapp: s['contact.whatsappUrl'],
    },
  };
}
