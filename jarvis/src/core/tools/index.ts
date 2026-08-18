import { ToolRegistry, type ToolDefinition } from './Tool.js';
import {
  addSuppressionTool,
  extractCompanyInformationTool,
  listCompaniesTool,
  markDoNotContactTool,
  openWebsiteTool,
  researchCompaniesTool,
  searchWebTool,
  verifyEmailTool,
} from './researchTools.js';
import {
  checkRepliesTool,
  createEmailDraftTool,
  listApprovalsTool,
  listEmailDraftsTool,
  readEmailDraftTool,
  requestBulkSendApprovalTool,
  requestSendApprovalTool,
  sendEmailTool,
  updateEmailDraftTool,
} from './mailTools.js';
import {
  createCampaignTool,
  listCampaignsTool,
  prepareOutreachTool,
  runCampaignTool,
  sendDeskTool,
} from './outreachTools.js';
import {
  clipboardTool,
  createFileTool,
  deleteFileTool,
  openApplicationTool,
  openFileTool,
  readFileTool,
  requestFileDeleteTool,
  requestFileOverwriteTool,
  searchFilesTool,
} from './systemTools.js';
import {
  auditTool,
  checkCalendarTool,
  createTaskTool,
  recallTool,
  rememberTool,
  statusTool,
} from './assistantTools.js';

/** Every tool JARVIS can use. Registration order does not matter. */
export function buildToolRegistry(): ToolRegistry {
  return new ToolRegistry().register(
    ...([
      // Recherche
      searchWebTool,
      openWebsiteTool,
      researchCompaniesTool,
      extractCompanyInformationTool,
      verifyEmailTool,
      listCompaniesTool,
      markDoNotContactTool,
      addSuppressionTool,
      // E-Mail
      createEmailDraftTool,
      readEmailDraftTool,
      listEmailDraftsTool,
      updateEmailDraftTool,
      requestSendApprovalTool,
      requestBulkSendApprovalTool,
      sendEmailTool,
      checkRepliesTool,
      listApprovalsTool,
      // Akquise
      createCampaignTool,
      listCampaignsTool,
      prepareOutreachTool,
      runCampaignTool,
      sendDeskTool,
      // Rechner
      openApplicationTool,
      openFileTool,
      searchFilesTool,
      readFileTool,
      createFileTool,
      requestFileOverwriteTool,
      requestFileDeleteTool,
      deleteFileTool,
      clipboardTool,
      // Assistenz
      checkCalendarTool,
      createTaskTool,
      rememberTool,
      recallTool,
      auditTool,
      statusTool,
    ] as unknown as Array<ToolDefinition<never, unknown>>),
  );
}

export { ToolRegistry } from './Tool.js';
export type { ToolContext } from './context.js';
