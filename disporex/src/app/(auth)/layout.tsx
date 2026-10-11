import { Logo } from "@/components/layout/logo";
import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-full grid lg:grid-cols-[1fr_1.1fr]">
      <aside className="hidden lg:flex flex-col justify-between bg-navy-900 text-white p-10">
        <Logo light size={26} />
        <div className="max-w-md">
          <h2 className="text-white text-[28px] leading-tight">Disposition, die den Überblick behält.</h2>
          <p className="text-navy-100/75 mt-3 text-[14px] leading-relaxed">
            Personal, Kunden, Veranstaltungen und Schichten an einem Ort. Rückmeldungen, Konflikte und Zeitnachweise werden nachvollziehbar – nicht nur
            übersichtlich.
          </p>
        </div>
        <p className="text-navy-100/45 text-[12px]">© {new Date().getFullYear()} DispoRex</p>
      </aside>
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-[400px]">
          <div className="lg:hidden mb-6">
            <Link href="/">
              <Logo />
            </Link>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
