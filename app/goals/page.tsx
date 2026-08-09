import { redirect } from "next/navigation";

// The goals list became /plan, which answers the question the list only
// implied. Goal detail pages stay at /goals/[id], so this redirect is on the
// exact path only.
export default function GoalsIndex() {
  redirect("/plan");
}
