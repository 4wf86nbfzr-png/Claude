/**
 * Alle Werkzeuge an einer Stelle registrieren.
 */
import { calendarTools } from './calendar-tools'
import { crmTools } from './crm-tools'
import { mailTools } from './mail-tools'
import { memoryTools } from './memory-tools'
import { clearTools, registerTools } from './registry'
import { researchTools } from './research-tools'
import { systemTools } from './system-tools'

export function registerAllTools(): void {
  clearTools()
  registerTools([...researchTools, ...crmTools, ...mailTools, ...calendarTools, ...memoryTools, ...systemTools])
}

export * from './registry'
export * from './types'
