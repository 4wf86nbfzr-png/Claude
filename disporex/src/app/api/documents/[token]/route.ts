import { NextResponse, type NextRequest } from "next/server";
import { resolveDownloadToken } from "@/server/modules/documents/service";

export const dynamic = "force-dynamic";

/** Einmaliger, zeitlich begrenzter Download. Der Token ist nicht erratbar und wird nach Nutzung entwertet. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,}$/.test(token)) return new NextResponse("Ungültig", { status: 400 });
  const r = await resolveDownloadToken(token);
  if (!r) return new NextResponse("Link ungültig oder abgelaufen", { status: 404 });
  const name = encodeURIComponent(r.document.filename);
  return new NextResponse(new Uint8Array(r.data), {
    headers: {
      "content-type": r.document.mimeType,
      "content-length": String(r.data.length),
      "content-disposition": `attachment; filename*=UTF-8''${name}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
