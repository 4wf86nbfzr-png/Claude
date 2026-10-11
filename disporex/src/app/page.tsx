import { redirect } from "next/navigation";
import { getCurrent } from "@/server/auth/current";

export default async function Home() {
  const current = await getCurrent();
  redirect(current ? "/dashboard" : "/login");
}
