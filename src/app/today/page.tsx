import { redirect } from "next/navigation";

function toDateString(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default function TodayRedirectPage() {
  redirect(`/session/${toDateString(new Date())}`);
}
