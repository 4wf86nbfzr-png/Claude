import { z } from 'zod';

/**
 * Gebrandete IDs. Verhindert, dass eine CallId versehentlich dort landet,
 * wo eine EventId erwartet wird - der Compiler faengt das ab.
 */
declare const brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [brand]: B };

export type EventId = Brand<string, 'EventId'>;
export type CallId = Brand<string, 'CallId'>;
export type CallJobId = Brand<string, 'CallJobId'>;
export type JobId = Brand<string, 'JobId'>;
export type DraftId = Brand<string, 'DraftId'>;
export type ApprovalId = Brand<string, 'ApprovalId'>;
export type TaskId = Brand<string, 'TaskId'>;
export type MemoryId = Brand<string, 'MemoryId'>;
export type ThreadId = Brand<string, 'ThreadId'>;

const idBase = z.string().min(1).max(200);

export const EventIdSchema = idBase.transform((v) => v as EventId);
export const CallIdSchema = idBase.transform((v) => v as CallId);
export const CallJobIdSchema = idBase.transform((v) => v as CallJobId);
export const JobIdSchema = idBase.transform((v) => v as JobId);
export const DraftIdSchema = idBase.transform((v) => v as DraftId);
export const ApprovalIdSchema = idBase.transform((v) => v as ApprovalId);
export const TaskIdSchema = idBase.transform((v) => v as TaskId);
export const MemoryIdSchema = idBase.transform((v) => v as MemoryId);
export const ThreadIdSchema = idBase.transform((v) => v as ThreadId);

export const asEventId = (v: string): EventId => v as EventId;
export const asCallId = (v: string): CallId => v as CallId;
export const asCallJobId = (v: string): CallJobId => v as CallJobId;
export const asJobId = (v: string): JobId => v as JobId;
export const asDraftId = (v: string): DraftId => v as DraftId;
export const asApprovalId = (v: string): ApprovalId => v as ApprovalId;
export const asTaskId = (v: string): TaskId => v as TaskId;
export const asMemoryId = (v: string): MemoryId => v as MemoryId;
export const asThreadId = (v: string): ThreadId => v as ThreadId;

/** E.164-Rufnummer, streng. Fuehrendes '+', Laendercode, 6-14 weitere Ziffern. */
export const E164Schema = z
  .string()
  .regex(/^\+[1-9]\d{6,14}$/, 'Rufnummer muss im E.164-Format vorliegen, z. B. +4915112345678');
export type E164 = z.infer<typeof E164Schema>;
