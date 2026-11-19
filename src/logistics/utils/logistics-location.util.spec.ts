import { formatLogisticsLocation } from './logistics-location.util';

describe('formatLogisticsLocation', () => {
  it('includes the country with the loading location', () => {
    expect(formatLogisticsLocation('TIMIRYAZEVO', 'Kazakhstan')).toBe(
      'TIMIRYAZEVO, Kazakhstan',
    );
  });

  it('does not append a country that is already present', () => {
    expect(
      formatLogisticsLocation('TIMIRYAZEVO, Kazakhstan', 'Kazakhstan'),
    ).toBe('TIMIRYAZEVO, Kazakhstan');
  });
});
