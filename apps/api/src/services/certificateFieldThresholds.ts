/**
 * The confidence a candidate must reach before it may be saved as a TRUSTED value.
 * Below this it is held as a review candidate for a person instead.
 *
 * Kept in its own dependency-free module so the field-state logic and the API
 * serializers can read it without loading the enrichment job (and its OCR /
 * storage dependencies).
 */
export const FIELD_MIN_SAVE_CONFIDENCE: Record<string, number> = {
  companyName: 0.7,
  tradingName: 0.82,
  registrationNumber: 0.9,
  taxNumber: 0.9,
  sectorCode: 0.86,
  sectorName: 0.86,
  vatNumber: 0.9,
  bbbeeLevel: 0.88,
  bbbeeLevelStatus: 0.88,
  certificateType: 0.86,
  procurementRecognition: 0.88,
  bbbeeScore: 0.88,
  companySize: 0.8,
  blackOwnership: 0.88,
  blackWomenOwnership: 0.88,
  blackDesignatedGroupOwnership: 0.88,
  empoweringSupplier: 0.86,
  valueAddingSupplier: 0.86,
  issueDate: 0.88,
  expiryDate: 0.88,
  measurementPeriod: 0.84,
  certificateNumber: 0.84,
  verificationAgency: 0.82,
  sanasAccreditationNumber: 0.9,
  commissionerDetails: 0.82,
  physicalAddress: 0.82,
  contactDetails: 0.82,
};
