/**
 * Human-quotable reference for a quote request: WW-RFQ-2026-0001.
 *
 * A cuid is the primary key and always will be; this exists because a buyer
 * reads their reference over the phone, and "cm3x9f2k0000..." is not a thing
 * anyone can read out.
 *
 * The sequence restarts each year, which keeps it short and tells the sales
 * team when a request came in without opening it.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../db';

const PREFIX = 'WW-RFQ';

/**
 * Allocates the next reference for this year.
 *
 * Counting rows and adding one is not safe on its own — two requests landing
 * together would compute the same number — so the caller writes under the
 * unique index and retries on collision. That is why this takes an attempt
 * offset rather than promising a free number.
 */
async function candidate(year: number, offset: number): Promise<string> {
  const used = await prisma.quoteRequest.count({
    where: { reference: { startsWith: `${PREFIX}-${year}-` } },
  });
  return `${PREFIX}-${year}-${String(used + 1 + offset).padStart(4, '0')}`;
}

/**
 * Creates a quote request with a unique reference.
 *
 * Retries only on a reference collision (P2002 naming that column); any other
 * failure is the caller's problem and is rethrown untouched.
 */
export async function createQuoteWithReference(
  data: Omit<Prisma.QuoteRequestUncheckedCreateInput, 'reference'>,
): Promise<{ id: string; reference: string }> {
  const year = new Date().getFullYear();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const reference = await candidate(year, attempt);
    try {
      const row = await prisma.quoteRequest.create({
        data: { ...data, reference },
        select: { id: true, reference: true },
      });
      return { id: row.id, reference: row.reference as string };
    } catch (err) {
      const collided =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        String((err.meta as { target?: string[] } | undefined)?.target ?? '').includes('reference');
      if (!collided) throw err;
    }
  }

  /* Five collisions in a row means something is wrong with the counter, not
     that the site is busy. Fall back to a reference that cannot collide
     rather than losing the customer's enquiry. */
  const row = await prisma.quoteRequest.create({
    data: { ...data, reference: `${PREFIX}-${year}-${Date.now().toString(36).toUpperCase()}` },
    select: { id: true, reference: true },
  });
  return { id: row.id, reference: row.reference as string };
}
