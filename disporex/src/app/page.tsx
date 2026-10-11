import { redirect } from "next/navigation";
import { getCurrent } from "@/server/auth/current";
import { homeForRole } from "@/server/auth/permissions";

export default async function Home() {
  const current = await getCurrent();
  redirect(current ? homeForRole(current.ctx.role) : "/login");
}
