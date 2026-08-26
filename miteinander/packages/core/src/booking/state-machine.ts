import type { Booking, Id, IsoDateTime } from '../domain/types';
import type { BookingStatus } from '../domain/enums';

/**
 * Zustandsautomat einer Buchung.
 *
 * Uebergaenge sind bewusst eng gefasst. Insbesondere entsteht "confirmed" nur,
 * wenn BEIDE Seiten aktiv bestaetigt haben -- eine Buchung darf nie durch
 * blosses Ausbleiben eines Widerspruchs zustande kommen.
 */
export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  proposed: ['confirmed', 'cancelled_by_seeker', 'cancelled_by_provider'],
  confirmed: ['in_progress', 'cancelled_by_seeker', 'cancelled_by_provider', 'no_show'],
  in_progress: ['completed', 'disputed'],
  completed: ['disputed'],
  cancelled_by_seeker: [],
  cancelled_by_provider: [],
  no_show: ['disputed'],
  disputed: ['completed'],
};

export class BookingTransitionError extends Error {
  constructor(
    public readonly from: BookingStatus,
    public readonly to: BookingStatus,
    message: string,
  ) {
    super(message);
    this.name = 'BookingTransitionError';
  }
}

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return (BOOKING_TRANSITIONS[from] ?? []).includes(to);
}

export interface TransitionContext {
  now: IsoDateTime;
  actorId: Id;
  reason?: string;
}

/** Reine Funktion: gibt eine neue Buchung zurueck, mutiert nichts. */
export function transition(
  booking: Booking,
  to: BookingStatus,
  ctx: TransitionContext,
): Booking {
  if (!canTransition(booking.status, to)) {
    throw new BookingTransitionError(
      booking.status,
      to,
      `Übergang von "${booking.status}" nach "${to}" ist nicht vorgesehen.`,
    );
  }

  if (to === 'confirmed') {
    if (!booking.confirmedBySeekerAt || !booking.confirmedByProviderAt) {
      throw new BookingTransitionError(
        booking.status,
        to,
        'Eine Buchung wird erst verbindlich, wenn beide Seiten ausdrücklich bestätigt haben.',
      );
    }
  }

  const next: Booking = { ...booking, status: to };

  switch (to) {
    case 'confirmed':
      // Erst jetzt darf der genaue Treffpunkt bzw. die Adresse freigegeben werden.
      next.preciseAddressReleased = true;
      break;
    case 'in_progress':
      next.startedAt = ctx.now;
      break;
    case 'completed':
      next.completedAt = ctx.now;
      break;
    case 'cancelled_by_seeker':
    case 'cancelled_by_provider':
      next.cancelledAt = ctx.now;
      next.cancellationReason = ctx.reason ?? null;
      // Freigegebene Adressdaten werden wieder eingezogen.
      next.preciseAddressReleased = false;
      break;
    case 'no_show':
      next.cancelledAt = ctx.now;
      next.cancellationReason = ctx.reason ?? 'Nicht erschienen';
      next.preciseAddressReleased = false;
      break;
    default:
      break;
  }

  return next;
}

/** Bestaetigung durch die suchende Person -- getrennt protokolliert. */
export function confirmBySeeker(booking: Booking, now: IsoDateTime): Booking {
  return { ...booking, confirmedBySeekerAt: now };
}

export function confirmByProvider(booking: Booking, now: IsoDateTime): Booking {
  return { ...booking, confirmedByProviderAt: now };
}

/**
 * Wie viele Stunden vor Beginn wird abgesagt? Grundlage fuer die
 * Ausfallregel -- die Regel selbst steht im Klartext am Profil.
 */
export function hoursUntilStart(booking: Booking, now: IsoDateTime): number {
  const diff = new Date(booking.startsAt).getTime() - new Date(now).getTime();
  return diff / 3_600_000;
}

export interface CancellationOutcome {
  allowed: true;
  feeCents: number;
  explanation: string;
  easyExplanation: string;
}

/**
 * Absagen sind immer erlaubt. Es geht nur darum, ehrlich zu sagen, was das
 * kostet -- keine versteckten Kosten, keine kuenstliche Dringlichkeit.
 */
export function describeCancellation(
  booking: Booking,
  now: IsoDateTime,
  freeCancellationHours = 24,
): CancellationOutcome {
  const hours = hoursUntilStart(booking, now);
  if (booking.volunteer || booking.priceCents === 0 || hours >= freeCancellationHours) {
    return {
      allowed: true,
      feeCents: 0,
      explanation:
        hours >= freeCancellationHours
          ? `Sie sagen mehr als ${freeCancellationHours} Stunden vorher ab. Das kostet nichts.`
          : 'Dieser Termin ist kostenlos. Die Absage kostet nichts.',
      easyExplanation: 'Sie können absagen. Es kostet nichts.',
    };
  }
  const feeCents = Math.round(booking.priceCents * 0.5);
  return {
    allowed: true,
    feeCents,
    explanation: `Sie sagen weniger als ${freeCancellationHours} Stunden vorher ab. Dafür werden ${formatEuro(feeCents)} berechnet. Grundlage ist die Absage-Regel: ${booking.cancellationPolicy}`,
    easyExplanation: `Sie sagen sehr kurzfristig ab. Das kostet ${formatEuro(feeCents)}.`,
  };
}

export function formatEuro(cents: number): string {
  return `${(cents / 100).toFixed(2).replace('.', ',')} Euro`;
}
