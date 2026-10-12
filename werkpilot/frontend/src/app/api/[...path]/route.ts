import type { NextRequest } from "next/server";

/**
 * Laufzeit-Proxy: leitet /api/* an das Backend weiter (BACKEND_URL wird bei jeder Anfrage gelesen,
 * nicht beim Build – nötig für Docker/Compose). Cookies, Methode, Body und Statuscode werden durchgereicht.
 */
export const dynamic = "force-dynamic";

const HOP_BY_HOP = new Set(["connection", "keep-alive", "transfer-encoding", "te", "trailer", "upgrade", "proxy-authorization", "proxy-authenticate", "host", "content-length"]);

export async function forward(request: NextRequest, path: string): Promise<Response> {
  const backend = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/$/, "");
  const url = backend + path + request.nextUrl.search;
  const headers = new Headers();
  request.headers.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase())) headers.set(k, v); });
  const fwd = request.headers.get("x-forwarded-for");
  const ip = request.headers.get("x-real-ip") ?? fwd?.split(",")[0]?.trim();
  if (ip) headers.set("x-forwarded-for", ip);
  const hasBody = !["GET", "HEAD"].includes(request.method);
  let upstream: Response;
  try {
    upstream = await fetch(url, { method: request.method, headers, body: hasBody ? await request.arrayBuffer() : undefined, redirect: "manual", cache: "no-store" });
  } catch {
    return Response.json({ detail: "Backend nicht erreichbar." }, { status: 502 });
  }
  const out = new Headers();
  upstream.headers.forEach((v, k) => { if (!HOP_BY_HOP.has(k.toLowerCase()) && k.toLowerCase() !== "content-encoding") out.set(k, v); });
  // Mehrere Set-Cookie-Header erhalten (Headers.forEach fasst sie sonst zusammen)
  const cookies = upstream.headers.getSetCookie?.() ?? [];
  if (cookies.length) { out.delete("set-cookie"); for (const c of cookies) out.append("set-cookie", c); }
  return new Response(upstream.body, { status: upstream.status, headers: out });
}

const handler = (request: NextRequest, ctx: { params: Promise<{ path: string[] }> }) =>
  ctx.params.then(({ path }) => forward(request, "/api/" + path.map(encodeURIComponent).join("/")));

export { handler as GET, handler as POST, handler as PUT, handler as PATCH, handler as DELETE, handler as OPTIONS };
