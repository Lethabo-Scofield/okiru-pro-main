import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMock = vi.hoisted(() => vi.fn());
const directoryFindMock = vi.hoisted(() => vi.fn());

vi.mock('../../../models.js', () => ({
  SupplierModel: { find: findMock },
  SupplierDirectoryModel: { find: directoryFindMock },
}));

describe('supplier intelligence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('detects and parses B-BBEE supplier requirements', async () => {
    const { isSupplierQuestion, parseSupplierCriteria } = await import('../supplierIntelligence.js');
    expect(isSupplierQuestion('Find Level 1 black-owned construction suppliers in Gauteng')).toBe(true);
    expect(parseSupplierCriteria('Find Level 1 black-owned construction suppliers in Gauteng')).toMatchObject({
      province: 'Gauteng',
      beeLevel: 1,
    });
  });

  it('returns only persisted records in the authorised client scope', async () => {
    findMock.mockReturnValue({
      sort: () => ({
        limit: () => ({
          lean: async () => [
            { id: 'supplier-a', clientId: 'client-1', name: 'Gauteng Electrical', province: 'Gauteng', beeLevel: 1, verificationStatus: 'verified', blackOwnership: 0.51 },
            { id: 'supplier-b', clientId: 'client-2', name: 'Other Company', province: 'Gauteng', beeLevel: 1 },
          ],
        }),
      }),
    });

    const { searchSuppliers } = await import('../supplierIntelligence.js');
    const results = await searchSuppliers({
      clientIds: ['client-1'],
      criteria: { query: 'Find Level 1 electrical suppliers in Gauteng', province: 'Gauteng', beeLevel: 1 },
    });

    expect(findMock).toHaveBeenCalledWith({ clientId: { $in: ['client-1'] } });
    expect(results.map((result) => result.id)).toEqual(['supplier-a']);
    expect(results[0]?.verificationStatus).toBe('verified');
  });

  it('does not search without an authorised client scope', async () => {
    const { searchSuppliers } = await import('../supplierIntelligence.js');
    await expect(searchSuppliers({ clientIds: [], criteria: { query: 'suppliers' } })).resolves.toEqual([]);
    expect(findMock).not.toHaveBeenCalled();
  });
});
