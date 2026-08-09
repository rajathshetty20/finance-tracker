import { redirect } from "next/navigation";

export default function IncomesIndex() {
  redirect("/cashflow?ledger=incomes");
}
