import Link from "next/link";
import { switchToDemo } from "../actions";
import { createClient } from "@/lib/supabase/server";
import { btnPrimary, btnQuiet } from "../../ui";

export default async function DemoConfirmPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="mx-auto max-w-md space-y-4 py-10">
      <h1 className="text-xl font-semibold">Open the demo?</h1>
      <p className="text-[0.9375rem] text-ink-2">
        You&apos;re signed in{user?.email ? <> as <span className="font-medium text-ink">{user.email}</span></> : null}.
        Opening the demo signs you out of your own account, and getting back in
        means waiting on another magic link.
      </p>
      <p className="text-[0.9375rem] text-ink-2">
        To look at the demo without losing your session, open the link in a
        private window instead.
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        <Link href="/" className={btnQuiet}>
          Stay in my account
        </Link>
        <form action={switchToDemo}>
          <button type="submit" className={btnPrimary}>
            Sign out and open the demo
          </button>
        </form>
      </div>
    </div>
  );
}
