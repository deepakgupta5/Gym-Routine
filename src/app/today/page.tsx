import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

function toDdMmYyyy(d: Date) {
  const iso = d.toISOString().slice(0, 10);
  const [y, m, day] = iso.split("-");
  return `${day}-${m}-${y}`;
}

export default function TodayRedirectPage() {
  redirect(`/session/${toDdMmYyyy(new Date())}`);
}
