import Link from "next/link";

export default function Forbidden() {
  return (
    <main className="min-h-full flex items-center justify-center p-6">
      <div className="panel p-6 max-w-md">
        <h1 className="text-[18px]">Keine Berechtigung</h1>
        <p className="text-ink-3 text-[13px] mt-2">Ihre Rolle erlaubt diese Ansicht nicht. Wenn Sie sie benötigen, wenden Sie sich an Ihren Administrator.</p>
        <p className="mt-4 text-[13px]">
          <Link href="/dashboard">Zum Dashboard</Link>
        </p>
      </div>
    </main>
  );
}
