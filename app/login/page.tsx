import LoginForm from "./LoginForm";

export default function LoginPage() {
  const demoEnabled = Boolean(process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD);
  return <LoginForm demoEnabled={demoEnabled} />;
}
