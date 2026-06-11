import { describe, it, expect } from 'vitest';
import { EmployeeModel, TrainingProgramModel, SupplierModel } from '../../api/models';

/**
 * Feedback #5: the new entry fields must survive a backend round-trip. The
 * Mongoose schemas in apps/api are the persistence boundary — if a path is
 * missing, the field is silently dropped on save. apps/api has no vitest of its
 * own, so we assert against the real schemas from the web suite (models.ts only
 * depends on mongoose + uuid, both resolvable here).
 */
describe('new persistence fields exist on the apps/api Mongoose schemas (feedback #5)', () => {
  it('Employee schema persists annualSalary and votingRightsPercent as Numbers', () => {
    expect(EmployeeModel.schema.path('annualSalary')).toBeTruthy();
    expect(EmployeeModel.schema.path('annualSalary').instance).toBe('Number');
    expect(EmployeeModel.schema.path('votingRightsPercent')).toBeTruthy();
    expect(EmployeeModel.schema.path('votingRightsPercent').instance).toBe('Number');
  });

  it('TrainingProgram schema persists municipality as a String', () => {
    expect(TrainingProgramModel.schema.path('municipality')).toBeTruthy();
    expect(TrainingProgramModel.schema.path('municipality').instance).toBe('String');
  });

  it('Supplier schema persists registrationNumber as a String', () => {
    expect(SupplierModel.schema.path('registrationNumber')).toBeTruthy();
    expect(SupplierModel.schema.path('registrationNumber').instance).toBe('String');
  });
});
