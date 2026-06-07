export interface CalculatorPayload {
  [calculatorKey: string]: unknown;
}

export interface CalculatorRequirement {
  key: string;
  expected_type: string;
  destination?: string;
  workbook_field?: string;
  manual_flow_mapping?: string;
}
