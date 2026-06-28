import { Signal, WritableSignal, signal } from '@angular/core';
import { PaginatedContent } from '../models/models';

export interface PageStats {
  fetchedCount: number;
  totalCount: number | null;
  hasMore: boolean;
}

const DEFAULT_STATS: PageStats = { fetchedCount: 0, totalCount: null, hasMore: false };

/** Unifies offset/pageSize/hasMore/fetchedCount/totalCount, shared across row and grouped views. */
export class Pagination {
  private readonly offsetSignal: WritableSignal<number>;
  private readonly pageSizeSignal: WritableSignal<number>;
  private readonly statsSignal: WritableSignal<PageStats>;

  readonly offset: Signal<number>;
  readonly pageSize: Signal<number>;
  readonly stats: Signal<PageStats>;

  constructor(pageSize: number = 20) {
    this.offsetSignal = signal<number>(0);
    this.pageSizeSignal = signal<number>(pageSize);
    this.statsSignal = signal<PageStats>(DEFAULT_STATS);

    this.offset = this.offsetSignal.asReadonly();
    this.pageSize = this.pageSizeSignal.asReadonly();
    this.stats = this.statsSignal.asReadonly();
  }

  /** Resets the page position and known stats, e.g. when the selected item or date range changes. Page size is kept. */
  reset(): void {
    this.offsetSignal.set(0);
    this.statsSignal.set(DEFAULT_STATS);
  }

  setPageSize(size: number): void {
    this.pageSizeSignal.set(size);
    this.offsetSignal.set(0);
  }

  prev(): void {
    this.offsetSignal.set(Math.max(0, this.offsetSignal() - this.pageSizeSignal()));
  }

  next(): void {
    this.offsetSignal.set(this.offsetSignal() + this.pageSizeSignal());
  }

  update(stats: PageStats): void {
    this.statsSignal.set(stats);
  }

  toContent<T>(items: T[]): PaginatedContent<T> {
    const { fetchedCount, totalCount, hasMore } = this.statsSignal();
    return { items, offset: this.offsetSignal(), pageSize: this.pageSizeSignal(), knownCount: fetchedCount, total: totalCount, hasMore };
  }
}
