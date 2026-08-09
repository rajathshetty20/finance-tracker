import { APP_TIME_ZONE } from "@/lib/dates";

/**
 * "Today" for a date input's default value, in the ledger's timezone.
 *
 * Eleven forms each carried a private `todayISO()` built on `new Date()` and
 * the browser's offset. The app declares its days in Asia/Kolkata (lib/dates.ts)
 * precisely so that a day does not depend on where the code runs — and then
 * every form that creates a row opted out of it. Log an expense from a laptop
 * still set to UTC, or from a plane, and it silently lands on the wrong day.
 *
 * Client-side by necessity: the default is rendered into the input. Server
 * components that already know the day (the demo freezes it — see lib/demo.ts)
 * should pass it down as a prop instead of calling this.
 */
export function todayInAppZone(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: APP_TIME_ZONE }).format(new Date());
}
