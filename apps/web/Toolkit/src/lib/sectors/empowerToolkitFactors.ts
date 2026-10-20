/**
 * The ESD benefit factors every Empower toolkit we hold uses where they differ
 * from the Codes' table — guarantees at 50% of the guarantee, not 3%
 * (EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES). A sector whose own toolkit is the
 * reference (RCOGP Generic and QSE, ICT Generic and QSE, AgriBEE Generic)
 * applies them through its CalculatorConfig; every other sector keeps the
 * Codes' table. FSC applies the same overrides inside its own scorer
 * (calculators/fscToolkit.ts).
 */
import type { CalculatorConfig } from '../../../../shared/schema';
import { EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES } from '../../../../../api/pipeline/rules/benefitFactors';

export function withEmpowerToolkitEsdFactors(
  benefitFactors: CalculatorConfig['benefitFactors'],
): CalculatorConfig['benefitFactors'] {
  return benefitFactors.map((bf) =>
    Object.prototype.hasOwnProperty.call(EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES, bf.type)
      ? { ...bf, factor: EMPOWER_TOOLKIT_ESD_FACTOR_OVERRIDES[bf.type] }
      : bf,
  );
}
