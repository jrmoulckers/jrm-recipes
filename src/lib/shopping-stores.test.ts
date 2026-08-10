import { describe, expect, it } from 'vitest';
import { planStoreDisplay, type StoreSummary } from './shopping-stores';

const store = (name: string): StoreSummary => ({ id: name, name });

describe('planStoreDisplay', () => {
  it('shows nothing for a store-free list', () => {
    expect(planStoreDisplay([])).toEqual({ visible: [], overflowCount: 0 });
  });

  it('shows every store when they all fit', () => {
    const stores = [store('QFC'), store('Costco')];

    expect(planStoreDisplay(stores)).toEqual({
      visible: stores,
      overflowCount: 0,
    });
  });

  it('folds the stores that overflow the width budget', () => {
    const stores = [store('QFC'), store('Neighborhood market co-op')];

    expect(planStoreDisplay(stores, { budget: 10 })).toEqual({
      visible: [stores[0]],
      overflowCount: 1,
    });
  });

  it('caps the chip count even when the names are short', () => {
    const stores = [store('A'), store('B'), store('C'), store('D')];

    expect(planStoreDisplay(stores, { limit: 2 })).toEqual({
      visible: [stores[0], stores[1]],
      overflowCount: 2,
    });
  });

  it('always keeps the first store, however long its name is', () => {
    const stores = [store('A wildly over-long store name'), store('QFC')];

    expect(planStoreDisplay(stores, { budget: 4 })).toEqual({
      visible: [stores[0]],
      overflowCount: 1,
    });
  });
});
