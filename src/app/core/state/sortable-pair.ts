import { Signal } from '@angular/core';
import { SortKey, SortOrder } from '../models/models';

/** Bundles the active sort key/order with the toggle callback into a single component Input. */
export class SortablePair {
  constructor(
    readonly key: Signal<SortKey>,
    readonly order: Signal<SortOrder>,
    readonly toggle: (key: SortKey) => void,
  ) {}
}
