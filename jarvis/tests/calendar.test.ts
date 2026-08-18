/**
 * Kalender: ICS lesen und Serientermine im gefragten Zeitraum auflösen.
 */
import { describe, expect, it } from 'vitest'
import { expandEvents, parseIcs, parseIcsDate, parseRrule, unfold } from '../src/main/calendar/ics'

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
UID:1@test
SUMMARY:Baustellenbegehung Hafencity
DTSTART:20260818T090000Z
DTEND:20260818T103000Z
LOCATION:Hafencity\\, Hamburg
DESCRIPTION:Mit dem Bauleiter
END:VEVENT
BEGIN:VEVENT
UID:2@test
SUMMARY:Wöchentliche Dispo
DTSTART:20260817T070000Z
DTEND:20260817T073000Z
RRULE:FREQ=WEEKLY;INTERVAL=1;COUNT=6
END:VEVENT
BEGIN:VEVENT
UID:3@test
SUMMARY:Feiertag
DTSTART;VALUE=DATE:20261003
END:VEVENT
BEGIN:VEVENT
UID:4@test
SUMMARY:Langer
 Titel über zwei Zeilen
DTSTART:20260819T120000Z
END:VEVENT
END:VCALENDAR`

describe('ICS lesen', () => {
  it('führt umgebrochene Zeilen wieder zusammen', () => {
    // Nach RFC 5545 ist das erste Leerzeichen der Folgezeile das Faltzeichen
    // und gehört nicht zum Inhalt.
    expect(unfold('SUMMARY:Langer\n Titel')).toContain('SUMMARY:LangerTitel')
    expect(unfold('SUMMARY:Langer\n  Titel')).toContain('SUMMARY:Langer Titel')
  })

  it('liest Zeitstempel in UTC und reine Datumsangaben', () => {
    const utc = parseIcsDate('20260818T090000Z', {})
    expect(utc?.allDay).toBe(false)
    expect(utc?.date.toISOString()).toBe('2026-08-18T09:00:00.000Z')

    const dateOnly = parseIcsDate('20261003', {})
    expect(dateOnly?.allDay).toBe(true)
  })

  it('findet alle Termine der Datei', () => {
    expect(parseIcs(ICS, 'Test')).toHaveLength(4)
  })

  it('entschlüsselt maskierte Zeichen im Text', () => {
    const events = parseIcs(ICS, 'Test')
    const begehung = events.find((event) => event.summary.startsWith('Baustellenbegehung'))
    expect(begehung?.location).toBe('Hafencity, Hamburg')
  })
})

describe('Serientermine', () => {
  it('liest einfache Regeln', () => {
    const rule = parseRrule('FREQ=WEEKLY;INTERVAL=2;COUNT=4')
    expect(rule?.freq).toBe('WEEKLY')
    expect(rule?.interval).toBe(2)
    expect(rule?.count).toBe(4)
    expect(rule?.simple).toBe(true)
  })

  it('markiert Regeln als nicht aufgelöst, wenn sie zu komplex sind', () => {
    const rule = parseRrule('FREQ=MONTHLY;BYDAY=2MO')
    expect(rule?.simple).toBe(false)
  })

  it('löst eine wöchentliche Serie im Zeitraum auf', () => {
    const events = expandEvents(parseIcs(ICS, 'Test'), {
      from: new Date('2026-08-17T00:00:00Z'),
      to: new Date('2026-09-14T23:59:59Z')
    }, 'Test')

    const dispo = events.filter((event) => event.summary === 'Wöchentliche Dispo')
    expect(dispo.length).toBe(5)
    expect(dispo[0].start).toBe('2026-08-17T07:00:00.000Z')
  })

  it('gibt außerhalb des Zeitraums nichts zurück', () => {
    const events = expandEvents(parseIcs(ICS, 'Test'), {
      from: new Date('2027-01-01T00:00:00Z'),
      to: new Date('2027-01-31T00:00:00Z')
    }, 'Test')
    expect(events).toHaveLength(0)
  })

  it('sortiert die Termine nach Beginn', () => {
    const events = expandEvents(parseIcs(ICS, 'Test'), {
      from: new Date('2026-08-01T00:00:00Z'),
      to: new Date('2026-08-31T00:00:00Z')
    }, 'Test')

    const starts = events.map((event) => event.start)
    expect([...starts].sort()).toEqual(starts)
  })
})
