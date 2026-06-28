import { Component, InputSignal, Signal, computed, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GroupedUser, PaginatedContent, RedemptionRow, SortKey } from '../../../core/models/models';
import { FormatDateTimePipe } from '../../../core/pipes/format-date-time.pipe';
import { PaginationPair } from '../../../core/state/pagination-pair';
import { SortablePair } from '../../../core/state/sortable-pair';

@Component({
  selector: 'app-redemptions-table',
  imports: [FormsModule, FormatDateTimePipe],
  templateUrl: './redemptions-table.component.html',
})
export class RedemptionsTableComponent {

  // ===================================
  // ===] Inputs / Outputs [============

  readonly pagination: InputSignal<PaginationPair<RedemptionRow | GroupedUser> | null> = input<PaginationPair<RedemptionRow | GroupedUser> | null>(null);
  readonly sortable: InputSignal<SortablePair | null> = input<SortablePair | null>(null);
  readonly grouped: InputSignal<boolean> = input<boolean>(false);
  readonly busy: InputSignal<boolean> = input<boolean>(false);
  readonly loadingText: InputSignal<string> = input<string>('Loading...');
  readonly progressText: InputSignal<string> = input<string>('');
  readonly progressPct: InputSignal<number> = input<number>(35);

  // ===================================
  // ===] Computed (pagination) [=======

  readonly content: Signal<PaginatedContent<RedemptionRow | GroupedUser> | null> = computed<PaginatedContent<RedemptionRow | GroupedUser> | null>(
    () => this.pagination()?.content() ?? null,
  );

  readonly showPlaceholder: Signal<boolean> = computed<boolean>(() => this.content() === null);
  readonly isEmpty: Signal<boolean> = computed<boolean>(() => (this.content()?.items.length ?? 0) === 0);

  readonly rangeLabel: Signal<string> = computed<string>(() => {
    const content: PaginatedContent<RedemptionRow | GroupedUser> | null = this.content();
    if (!content) return '';
    const start: number = content.items.length ? content.offset + 1 : 0;
    const end: number = content.offset + content.items.length;
    const totalTxt: string = content.total !== null ? `${content.total}` : `${content.knownCount}+`;
    return `${start}–${end} of ${totalTxt}`;
  });

  // ===================================
  // ===] Sorting helpers [=============

  sortArrow(key: SortKey): string {
    const sortable: SortablePair | null = this.sortable();
    if (!sortable || sortable.key() !== key) return '↕';
    return sortable.order() === 'asc' ? '↑' : '↓';
  }

  sortHeadClass(key: SortKey): string {
    return this.sortable()?.key() === key ? 'text-iris' : 'hover:text-soft';
  }

  // ===================================
  // ===] Row casting (union) [=========

  asRow(item: RedemptionRow | GroupedUser): RedemptionRow {
    return item as RedemptionRow;
  }

  asGroup(item: RedemptionRow | GroupedUser): GroupedUser {
    return item as GroupedUser;
  }
}
