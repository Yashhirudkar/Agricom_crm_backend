import { validateProductionSchema } from './production-schema-readiness';

describe('validateProductionSchema', () => {
  it('accepts a fully migrated production schema', async () => {
    const connection = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: ['19', '53', '55', '57', '58', '76', '77', '78'].map(
            (phase) => ({ phase }),
          ),
        })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }),
    };

    await expect(validateProductionSchema(connection)).resolves.toBeUndefined();
    expect(connection.query).toHaveBeenCalledTimes(4);
  });

  it('fails with migration guidance when required schema is missing', async () => {
    const connection = {
      query: jest.fn().mockResolvedValueOnce({ rows: [] }),
    };

    await expect(validateProductionSchema(connection)).rejects.toThrow(
      'Production database schema validation failed (migration phases',
    );
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('fails when a required database column is absent', async () => {
    const connection = {
      query: jest
        .fn()
        .mockResolvedValueOnce({
          rows: ['19', '53', '55', '57', '58', '76', '77', '78'].map(
            (phase) => ({ phase }),
          ),
        })
        .mockResolvedValueOnce({
          rows: [{ required_column: 'sales_contracts.contract_type' }],
        }),
    };

    await expect(validateProductionSchema(connection)).rejects.toThrow(
      'missing columns sales_contracts.contract_type',
    );
  });
});
