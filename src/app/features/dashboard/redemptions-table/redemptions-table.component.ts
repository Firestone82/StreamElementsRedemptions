import { Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GroupedUser, RedemptionRow, SortKey, SortOrder } from '../../../core/models/models';
import { formatDateTime } from '../../../core/utils/date.util';

@Component({
  selector: 'app-redemptions-table',
  imports: [FormsModule],
  templateUrl: './redemptions-table.component.html',
})
export class RedemptionsTableComponent {
  readonly grouped = input(false);
  readonly busy = input(false);
  readonly loadingText = input('Loading…');
  readonly progressText = input('');
  readonly progressPct = input(35);

  readonly showPlaceholder = input(false);
  readonly rows = input<RedemptionRow[]>([]);
  readonly groups = input<GroupedUser[]>([]);

  readonly sortKey = input<SortKey>('date');
  readonly sortOrder = input<SortOrder>('desc');

  readonly showPager = input(false);
  readonly rangeLabel = input('');
  readonly pageSize = input(20);
  readonly prevDisabled = input(true);
  readonly nextDisabled = input(true);

  readonly sortChange = output<SortKey>();
  readonly prevPage = output<void>();
  readonly nextPage = output<void>();
  readonly pageSizeChange = output<number>();

  readonly isEmpty = computed(() => (this.grouped() ? this.groups().length === 0 : this.rows().length === 0));

  readonly formatDateTime = formatDateTime;

  sortArrow(key: SortKey): string {
    if (this.sortKey() !== key) return '↕';
    return this.sortOrder() === 'asc' ? '↑' : '↓';
  }

  sortHeadClass(key: SortKey): string {
    return this.sortKey() === key ? 'text-iris' : 'hover:text-soft';
  }
}
