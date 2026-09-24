import 'server-only';
import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { ValidationError, toPublicError } from './errors';

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json(data, init);
}

export function fail(error: unknown): NextResponse {
  const { status, body } = toPublicError(error);
  return NextResponse.json(body, { status });
}

/** Umschliesst eine Route, damit jeder Fehler als saubere Meldung ankommt (Spec 53). */
export function route<A extends unknown[]>(
  handler: (...args: A) => Promise<NextResponse>,
): (...args: A) => Promise<NextResponse> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      return fail(error);
    }
  };
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw new ValidationError('Die Anfrage enthielt keine gueltigen Daten.');
  }
  return parseWith(schema, json);
}

export function parseWith<T>(schema: ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  throw new ValidationError('Bitte pruefen Sie Ihre Eingaben.', fieldErrors(result.error));
}

export function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || 'allgemein';
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

export interface PageParams { page: number; perPage: number; skip: number }

/** Einheitliche Pagination fuer alle Listen (Spec 47/78). */
export function pagination(searchParams: URLSearchParams | Record<string, string | undefined>, defaultPerPage = 25): PageParams {
  const get = (key: string) =>
    searchParams instanceof URLSearchParams ? searchParams.get(key) : searchParams[key];
  const page = Math.max(1, Number(get('seite') ?? get('page') ?? 1) || 1);
  const perPage = Math.min(200, Math.max(5, Number(get('proSeite') ?? get('perPage') ?? defaultPerPage) || defaultPerPage));
  return { page, perPage, skip: (page - 1) * perPage };
}
