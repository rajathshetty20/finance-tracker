import LoginForm from "./LoginForm";

// Reasons /demo can bounce someone here. Anyone following a shared demo link
// deserves to know why they landed on a sign-in form instead.
const NOTICES: Record<string, string> = {
  "demo-unconfigured": "The demo isn't set up on this deployment yet.",
  "demo-failed": "The demo couldn't be opened just now — please try again.",
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
