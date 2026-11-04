/// <reference types="jest" />

import { getAutoContractConfig } from './contract-number.util';

describe('getAutoContractConfig', () => {
  it.each([
    'AGRICOM IMPEX PRIVATE LIMITED',
    'Agricom Impex Pvt. Ltd.',
  ])('recognizes the Pvt Ltd seller name variant: %s', (sellerName) => {
    expect(getAutoContractConfig(sellerName)).toEqual({
      sellerCode: 'AGPL',
      initialSequence: 1501,
      includeBuyerInitial: false,
    });
  });
});
