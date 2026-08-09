import LoginForm from "./LoginForm";

// Reasons /demo can bounce someone here. Anyone following a shared demo link
// deserves to know why they landed on a sign-in form instead.
const NOTICES: Record<string, string> = {
  "demo-unconfigured": "The demo isn't set up on this deployment yet.",
  "demo-failed": "The demo couldn't be opened just now — please try again.",
  // A link can only be redeemed in the browser that requested it, and mail
  // apps open their own. Point at the code, which has neither limitation.
  "link-failed":
    "That sign-in link didn't work. Links only open in the browser that asked for them, and can be spent by mail scanners before you click. Request a new email and use the code instead.",
  "link-missing":
    "That sign-in link was incomplete. Request a new email and use the code instead.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const demoEnabled = Boolean(process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD);
  return (
    <LoginForm demoEnabled={demoEnabled} notice={error ? (NOTICES[error] ?? null) : null} />
  );
}
