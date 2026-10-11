import type { Instrumentation } from "next";

/** Unbehandelte Fehler aus Server Components, Actions und Route Handlern an die Fehlerüberwachung melden. */
export const onRequestError: Instrumentation.onRequestError = async (err, request, context) => {
  // Nur im Node-Runtime: pino/env sind keine Edge-Module. Der Vergleich wird beim Build aufgelöst.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { captureError } = await import("./server/core/monitoring");
  await captureError(err, { route: request.path, kind: context.routeType, requestId: request.headers["x-request-id"] as string | undefined });
};
