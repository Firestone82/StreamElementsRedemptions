import { Signal } from '@angular/core';
import { PaginatedContent } from '../models/models';

/** Bundles a page of content with its paging callbacks into a single component Input. */
export class PaginationPair<T> {
  constructor(
    readonly content: Signal<PaginatedContent<T> | null>,
    readonly prev: () => void,
    readonly next: () => void,
    readonly setPageSize: (size: number) => void,
  ) {}
}
