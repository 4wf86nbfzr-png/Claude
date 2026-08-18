import { ToolRegistry } from './registry';
import { calendarTools } from './impl/calendar';
import { crmTools } from './impl/crm';
import { mailTools } from './impl/mail';
import { outreachTools } from './impl/outreach';
import { researchTools } from './impl/research';
import { systemTools } from './impl/system';

export * from './types';
export { ToolRegistry } from './registry';

/** Alle Werkzeuge der Version 1, gebündelt nach zuständigem Agenten. */
export function createToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.registerAll([...researchTools, ...crmTools, ...mailTools, ...outreachTools, ...systemTools, ...calendarTools]);
  return registry;
}

/**
 * Welcher Agent welche Werkzeuge benutzen darf.
 * JarvisCore reicht dem Sprachmodell nur die Werkzeuge des zuständigen
 * Agenten – das hält die Auswahl klein und die Zuständigkeit sauber.
 */
export const AGENT_WERKZEUGE: Record<string, string[]> = {
  JarvisCore: [
    'list_companies',
    'list_email_drafts',
    'list_outreach',
    'list_campaigns',
    'list_tasks',
    'create_task',
    'complete_task',
    'check_calendar',
    'read_audit_log',
    'recall',
    'remember',
    'open_url',
    'open_application',
    'open_file',
    'search_files',
    'read_file'
  ],
  CompanyResearchAgent: [
    'search_web',
    'open_website',
    'extract_company_information',
    'verify_email',
    'research_companies',
    'save_company',
    'list_companies',
    'get_company',
    'add_company_note'
  ],
  MailAgent: [
    'create_email_draft',
    'read_email_draft',
    'update_email_draft',
    'list_email_drafts',
    'add_attachment',
    'request_send_approval',
    'send_email',
    'check_send_readiness',
    'fetch_replies',
    'get_company',
    'check_previous_contact'
  ],
  OutreachAgent: [
    'create_campaign',
    'prepare_outreach',
    'compose_outreach_email',
    'list_outreach',
    'list_campaigns',
    'check_previous_contact',
    'add_to_do_not_contact',
    'list_do_not_contact',
    'get_company',
    'list_companies',
    'read_email_draft',
    'update_email_draft',
    'request_send_approval',
    'send_email'
  ],
  FileAgent: ['search_files', 'read_file', 'create_file', 'overwrite_file', 'delete_file', 'open_file', 'request_approval'],
  SystemAgent: ['open_application', 'open_url', 'clipboard_write', 'request_approval'],
  BrowserAgent: ['open_website', 'open_url', 'search_web'],
  CalendarAgent: ['check_calendar', 'create_task', 'list_tasks', 'complete_task']
};
