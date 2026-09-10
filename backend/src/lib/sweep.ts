/**
 * The automation sweep.
 *
 * Most of what the rules watch for becomes true with time rather than at a
 * moment: an order goes past its date, stock falls below its level, an
 * enquiry goes unanswered. Nothing fires those — so something has to look.
 *
 * A timer in the web process rather than a cron daemon or a queue: this is a
 * single-process application and the work is a handful of indexed queries.
 * Adding a scheduler would be more infrastructure to run and to explain than
 * the problem needs, and if that changes, `runAllRules` is already the whole
 * of the job and can be called from anywhere.
 */
import { env } from '../env';
import { runAllRules } from './automation';
import { retryDueDeliveries } from './webhooks';

let timer: NodeJS.Timeout | null = null;
let running = false;

/** One pass. Never throws — a failed sweep must not take the process with it,
 *  and every rule already records its own failure. */
export async function sweepOnce(): Promise<void> {
  /* A slow sweep must not overlap the next tick and double the load. */
  if (running) return;
  running = true;
  try {
    const result = await runAllRules();
    if (result.acted > 0) {
      console.info(`Automation: ${result.acted} raised from ${result.matched} matches across ${result.rules} rules.`);
    }
  } catch (err) {
    console.error('Automation sweep failed:', err);
  }

  /* Webhook retries ride along on the same timer. A retry needs durable
     scheduling, and a second scheduler for it would be more infrastructure
     than the problem deserves. Kept apart from the rules above so a failing
     rule does not stop deliveries, and vice versa. */
  try {
    const sent = await retryDueDeliveries();
    if (sent > 0) console.info(`Webhooks: ${sent} delivery retries succeeded.`);
  } catch (err) {
    console.error('Webhook retries failed:', err);
  } finally {
    running = false;
  }
}

export function startSweep(): void {
  if (timer) return;

  const minutes = env.AUTOMATION_SWEEP_MINUTES;
  if (minutes <= 0) {
    console.info('Automation sweep is off (AUTOMATION_SWEEP_MINUTES=0). Rules run only when triggered by hand.');
    return;
  }

  /* unref so the timer never holds the process open during a shutdown. */
  timer = setInterval(() => { void sweepOnce(); }, minutes * 60 * 1000);
  timer.unref();

  console.info(`Automation sweep every ${minutes} minutes.`);
}

export function stopSweep(): void {
  if (timer) clearInterval(timer);
  timer = null;
}
