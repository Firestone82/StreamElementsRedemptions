import { Component, InputSignal, OutputEmitterRef, Signal, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GroupedUser, PaginatedContent, RedemptionRow, SortKey, SortOrder } from '../../../core/models/models';
import { FormatDateTimePipe } from '../../../core/pipes/format-date-time.pipe';

@Component({
  selector: 'app-redemptions-table',
  imports: [FormsModule, FormatDateTimePipe],
  templateUrl: './redemptions-table.component.html',
})
export class RedemptionsTableComponent {
  // =============================
  // === Inputs / Outputs ========
  // =============================
  readonly content: InputSignal<PaginatedContent<RedemptionRow | GroupedUser> | null> = input<PaginatedContent<RedemptionRow | GroupedUser> | null>(null);
  readonly grouped: InputSignal<boolean> = input<boolean>(false);
  readonly busy: InputSignal<boolean> = input<boolean>(false);
  readonly loadingText: InputSignal<string> = input<string>('Loading...');
  readonly progressText: InputSignal<string> = input<string>('');
  readonly progressPct: InputSignal<number> = input<number>(35);

  readonly sortKey: InputSignal<SortKey> = input<SortKey>('date');
  readonly sortOrder: InputSignal<SortOrder> = input<SortOrder>('desc');

  readonly sortChange: OutputEmitterRef<SortKey> = output<SortKey>();
  readonly prevPage: OutputEmitterRef<void> = output<void>();
  readonly nextPage: OutputEmitterRef<void> = output<void>();
  readonly pageSizeChange: OutputEmitterRef<number> = output<number>();

  // =============================
  // === Computed (pagination) ===
  // =============================
  readonly showPlaceholder: Signal<boolean> = computed<boolean>(() => this.content() === null);
  readonly isEmpty: Signal<boolean> = computed<boolean>(() => (this.content()?.items.length ?? 0) === 0);
  readonly showPager: Signal<boolean> = computed<boolean>(() => this.content() !== null);
  readonly pageSize: Signal<number> = computed<number>(() => this.content()?.pageSize ?? 20);

  readonly prevDisabled: Signal<boolean> = computed<boolean>(() => (this.content()?.offset ?? 0) <= 0);
  readonly nextDisabled: Signal<boolean> = computed<boolean>(() => !(this.content()?.hasMore ?? false));

  readonly rangeLabel: Signal<string> = computed<string>(() => {
    const content: PaginatedContent<RedemptionRow | GroupedUser> | null = this.content();
    if (!content) return '';
    const start: number = content.items.length ? content.offset + 1 : 0;
    const end: number = content.offset + content.items.length;
    const totalTxt: string = content.total !== null ? `${content.total}` : `${content.knownCount}+`;
    return `${start}–${end} of ${totalTxt}`;
  });

  // =============================
  // === Sorting helpers ==========
  // =============================
  sortArrow(key: SortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.sortOrder() === 'asc' ? '↑' : '↓';
  }

  sortHeadClass(key: SortKey): string {
    return this.sortKey() === key ? 'text-iris' : 'hover:text-soft';
  }

  // =============================
  // === Row casting (union) ======
  // =============================
  asRow(item: RedemptionRow | GroupedUser): RedemptionRow {
    return item as RedemptionRow;
  }

  asGroup(item: RedemptionRow | GroupedUser): GroupedUser {
    return item as GroupedUser;
  }
}
