import { ForgotForm } from "./forgot-form";
export const metadata = { title: "Passwort vergessen", robots: { index: false } };
export default function Page() { return <div className="mx-auto max-w-md px-4 py-14"><h1 className="text-3xl font-semibold">Passwort zurücksetzen</h1><ForgotForm /></div>; }
