// Build Components - Document Processor Foundation Layer
// Matches TOOLKIT_TAB_MAP.md structure for Sheets 1-2

export { FoundationStep, type FoundationData } from './FoundationStep';
export { 
  ClientInformationForm, 
  type ClientInformationData, 
  EMPTY_CLIENT_INFO,
  determineCompanySize,
  hasQSEVariant,
} from './ClientInformationForm';
export { 
  FinancialsForm, 
  type FinancialsData, 
  EMPTY_FINANCIALS,
  calculateFinancials,
} from './FinancialsForm';
export { BuildPillarsStep, type BuildPillarsData } from './BuildPillarsStep';
