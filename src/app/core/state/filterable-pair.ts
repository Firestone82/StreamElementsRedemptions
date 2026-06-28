import { Signal } from '@angular/core';

/** Bundles a filter query signal with its change callback into a single component Input. */
export class FilterablePair {
  constructor(
    readonly query: Signal<string>,
    readonly setQuery: (value: string) => void,
  ) {}
}
