import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ExportService } from '../../core/services/export.service';
import { StreamElementsService } from '../../core/services/stream-elements.service';
import { isAuthError } from '../../core/services/se-error';
import { isoBounds, todayIso } from '../../core/utils/date.util';
import { ExportFormat, GroupedUser, RedemptionRow, SortKey, SortOrder, StoreItem } from '../../core/models/models';
import { HeaderComponent } from './header/header.component';
import { ItemsListComponent } from './items-list/items-list.component';
import { RedemptionsControlsComponent } from './redemptions-controls/redemptions-controls.component';
import { RedemptionsTableComponent } from './redemptions-table/redemptions-table.component';

@Component({
  selector: 'app-dashboard',
  imports: [HeaderComponent, ItemsListComponent, RedemptionsControlsComponent, RedemptionsTableComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly streamElements = inject(StreamElementsService);
  private readonly exportService = inject(ExportService);

  readonly availableChannels = this.streamElements.availableChannels;
  readonly channelId = signal('');
  readonly channelName = signal('…');
  readonly banner = signal('');

  readonly items = signal<StoreItem[]>([]);
  readonly selectedItem = signal<StoreItem | null>(null);
  readonly selectedItemDetail = signal<StoreItem | null>(null);

  readonly appliedFrom = signal(todayIso());
  readonly appliedTo = signal(todayIso());
  readonly sortKey = signal<SortKey>('date');
  readonly sortOrder = signal<SortOrder>('desc');

  readonly offset = signal(0);
  readonly pageSize = signal(20);
  readonly hasMore = signal(false);
  readonly rows = signal<RedemptionRow[]>([]);
  readonly fetchedCount = signal(0);
  readonly exhausted = signal(false);
  readonly totalCount = signal<number | null>(null);

  readonly grouped = signal(false);
  readonly groupAll = signal<GroupedUser[]>([]);
  readonly groupSearch = signal('');
  readonly groupOffset = signal(0);
  readonly groupPageSize = signal(20);

  readonly busy = signal(false);
  readonly loadingText = signal('Loading…');
  readonly progressText = signal('');
  readonly progressPct = signal(35);

  readonly filteredGroups = computed(() => {
    const query = this.groupSearch().trim().toLowerCase();
    const all = this.groupAll();
    return query ? all.filter((g) => g.username.toLowerCase().includes(query)) : all;
  });

  readonly groupTotalUsers = computed(() => this.filteredGroups().length);
  readonly groupTotalRedemptions = computed(() => this.filteredGroups().reduce((sum, g) => sum + g.count, 0));
  readonly clampedGroupOffset = computed(() => Math.min(this.groupOffset(), Math.max(0, this.groupTotalUsers() - 1)));
  readonly groupPageRows = computed(() => this.filteredGroups().slice(this.clampedGroupOffset(), this.clampedGroupOffset() + this.groupPageSize()));

  readonly showPlaceholder = computed(() => !this.selectedItem());
  readonly showPager = computed(() => !!this.selectedItem());
  readonly currentPageSize = computed(() => (this.grouped() ? this.groupPageSize() : this.pageSize()));

  readonly rangeLabel = computed(() => {
    if (this.grouped()) {
      const total = this.groupTotalUsers();
      const offset = this.clampedGroupOffset();
      const pageLength = this.groupPageRows().length;
      const start = pageLength ? offset + 1 : 0;
      return `${start}–${offset + pageLength} of ${total}`;
    }

    const pageLength = this.rows().length;
    const start = pageLength ? this.offset() + 1 : 0;
    const totalTxt = this.exhausted() ? `${this.totalCount()}` : `${this.fetchedCount()}+`;
    return `${start}–${this.offset() + pageLength} of ${totalTxt}`;
  });

  readonly detailStats = computed(() => {
    if (!this.selectedItem()) return '';
    if (this.grouped()) return `${this.groupTotalUsers()} users · ${this.groupTotalRedemptions()} redemptions`;
    return this.exhausted() ? `${this.totalCount()} redemptions` : `${this.fetchedCount()}+ loaded…`;
  });

  readonly prevDisabled = computed(() => (this.grouped() ? this.clampedGroupOffset() <= 0 : this.offset() <= 0));
  readonly nextDisabled = computed(() => {
    if (this.grouped()) return this.clampedGroupOffset() + this.groupPageRows().length >= this.groupTotalUsers();
    return !this.hasMore();
  });

  private loadTimer: ReturnType<typeof setInterval> | null = null;
  private liveProgress = false;

  private readonly onHashChange = (): void => {
    const id = this.itemIdFromHash();
    if (id) void this.selectItem(id, false);
  };

  async ngOnInit(): Promise<void> {
    window.addEventListener('hashchange', this.onHashChange);
    await this.streamElements.loadChannelOptions();
    await this.loadChannel();
    await this.loadItems();
  }

  ngOnDestroy(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    this.stopProgressTimer();
  }

  async onChannelChange(channelId: string): Promise<void> {
    this.streamElements.switchChannel(channelId);
    this.selectedItem.set(null);
    this.selectedItemDetail.set(null);
    this.grouped.set(false);
    this.rows.set([]);
    this.banner.set('');
    await this.loadChannel();
    await this.loadItems();
  }

  onDisconnect(): void {
    this.auth.clear();
  }

  async selectItem(id: string, pushHash = true): Promise<void> {
    const item = this.items().find((i) => i.id === id);
    if (!item) return;

    this.selectedItem.set(item);
    this.selectedItemDetail.set(null);
    this.offset.set(0);
    this.grouped.set(false);
    this.groupSearch.set('');

    if (pushHash && window.location.hash !== `#/items/${id}`) {
      window.location.hash = `#/items/${id}`;
    }

    void this.loadItemDetailStats(id);
    await this.loadPage();
  }

  async loadPage(): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;

    this.grouped.set(false);
    this.startBusy('Fetching redemptions…');

    try {
      const [from, to] = isoBounds(this.appliedFrom(), this.appliedTo());
      const { channel, acc } = await this.streamElements.getAcc(item.id, item.name, from, to, this.sortKey(), this.sortOrder());
      await this.streamElements.extendUntil(channel, acc, item.id, item.name, from, to, this.sortKey(), this.sortOrder(), this.offset() + this.pageSize() + 1);

      const page = acc.rows.slice(this.offset(), this.offset() + this.pageSize());
      this.rows.set(page);
      this.fetchedCount.set(acc.rows.length);
      this.exhausted.set(acc.exhausted);
      this.totalCount.set(acc.exhausted ? acc.rows.length : null);
      this.hasMore.set(!acc.exhausted || acc.rows.length > this.offset() + this.pageSize());
    } catch (err) {
      this.rows.set([]);
      this.handleError(err);
    } finally {
      this.stopBusy();
    }
  }

  toggleSort(key: SortKey): void {
    if (this.sortKey() === key) {
      this.sortOrder.set(this.sortOrder() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortKey.set(key);
      this.sortOrder.set(key === 'name' ? 'asc' : 'desc');
    }
    this.offset.set(0);
    void this.loadPage();
  }

  async onToggleGroup(): Promise<void> {
    this.grouped() ? await this.loadPage() : await this.showGrouped();
  }

  async showGrouped(): Promise<void> {
    if (!this.selectedItem() || this.busy()) return;
    this.banner.set('');

    try {
      const { groups } = await this.fetchFull('group');
      this.grouped.set(true);
      this.groupAll.set(groups);
      this.groupOffset.set(0);
    } catch (err) {
      this.handleError(err);
    }
  }

  async onApplyRange(range: { from: string; to: string }): Promise<void> {
    this.appliedFrom.set(range.from);
    this.appliedTo.set(range.to);
    this.offset.set(0);
    this.grouped() ? await this.showGrouped() : await this.loadPage();
  }

  async onRefresh(): Promise<void> {
    const item = this.selectedItem();
    if (!item) return;

    this.busy.set(true);
    this.loadingText.set('Refreshing…');
    try {
      const [from, to] = isoBounds(this.appliedFrom(), this.appliedTo());
      await this.streamElements.getAcc(item.id, item.name, from, to, this.sortKey(), this.sortOrder(), true);
    } catch {
      // best-effort cache bust; the reload below surfaces any real error
    } finally {
      this.busy.set(false);
    }

    this.offset.set(0);
    this.grouped() ? await this.showGrouped() : await this.loadPage();
  }

  async onExport(format: ExportFormat): Promise<void> {
    const item = this.selectedItem();
    if (!item || this.busy()) return;
    this.banner.set('');

    try {
      const { rows, groups } = await this.fetchFull('export');
      const label = item.name || item.id;
      let headers: string[];
      let records: (string | number)[][];

      if (this.grouped()) {
        headers = ['Item', 'Username', 'Count', 'First Redeemed', 'Last Redeemed'];
        records = groups.map((g) => [label, g.username, g.count, g.firstRedeemed ?? '', g.lastRedeemed ?? '']);
      } else {
        const sorted = [...rows].sort((a, b) => (b.redeemedAt ?? '').localeCompare(a.redeemedAt ?? ''));
        headers = ['Item', 'Username', 'Redeemed At', 'Input'];
        records = sorted.map((r) => [label, r.username, r.redeemedAt ?? '', r.input ?? '']);
      }

      const body = format === 'csv' ? this.exportService.toCsv(headers, records) : this.exportService.toTxt(label, this.grouped(), headers, records);
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeName = label.replace(/[^a-zA-Z0-9]/g, '_') || 'item';
      const suffix = this.grouped() ? '_grouped' : '';
      const filename = `redemptions_${safeName}${suffix}_${stamp}.${format}`;

      this.exportService.download(filename, format === 'csv' ? 'text/csv' : 'text/plain', body);
    } catch (err) {
      this.handleError(err);
    }
  }

  onGroupSearchChange(value: string): void {
    this.groupSearch.set(value);
    this.groupOffset.set(0);
  }

  onPrev(): void {
    if (this.grouped()) {
      this.groupOffset.set(Math.max(0, this.groupOffset() - this.groupPageSize()));
    } else {
      this.offset.set(Math.max(0, this.offset() - this.pageSize()));
      void this.loadPage();
    }
  }

  onNext(): void {
    if (this.grouped()) {
      this.groupOffset.set(this.groupOffset() + this.groupPageSize());
    } else {
      this.offset.set(this.offset() + this.pageSize());
      void this.loadPage();
    }
  }

  onPageSizeChange(value: number): void {
    if (this.grouped()) {
      this.groupPageSize.set(value);
      this.groupOffset.set(0);
    } else {
      this.pageSize.set(value);
      this.offset.set(0);
      void this.loadPage();
    }
  }

  // ---- internals -----------------------------------------------------------

  private async loadChannel(): Promise<void> {
    try {
      const channel = await this.streamElements.getChannel();
      this.channelId.set(channel.id);
      this.channelName.set(channel.name || channel.id || 'unknown');
    } catch (err) {
      this.channelName.set('error');
      this.handleError(err);
    }
  }

  private async loadItems(): Promise<void> {
    try {
      const items = await this.streamElements.getItems();
      this.items.set(items);
      const hashId = this.itemIdFromHash();
      if (hashId) await this.selectItem(hashId, false);
    } catch (err) {
      this.handleError(err);
    }
  }

  private async loadItemDetailStats(id: string): Promise<void> {
    try {
      this.selectedItemDetail.set(await this.streamElements.getItemDetail(id));
    } catch {
      // best-effort; the basic item info from the list is still shown
    }
  }

  private async fetchFull(purpose: 'group' | 'export'): Promise<{ rows: RedemptionRow[]; groups: GroupedUser[] }> {
    const item = this.selectedItem();
    if (!item) return { rows: [], groups: [] };

    const [from, to] = isoBounds(this.appliedFrom(), this.appliedTo());
    const { channel, acc } = await this.streamElements.getAcc(item.id, item.name, from, to, this.sortKey(), this.sortOrder());

    this.startBusy(purpose === 'group' ? 'Fetching all entries to group…' : 'Fetching all entries to export…');
    const t0 = Date.now();

    try {
      await this.streamElements.drain(channel, acc, item.id, item.name, from, to, this.sortKey(), this.sortOrder(), (a) => {
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        this.setLiveProgress(`${a.rows.length} rows · ${a.scanned} scanned · ${a.pages} pages · ${secs}s`);
      });
      this.setLiveProgress(`Done · ${acc.rows.length} rows`);
      this.progressPct.set(100);
      return { rows: acc.rows, groups: this.streamElements.groupRows(acc.rows) };
    } finally {
      this.stopBusy();
    }
  }

  private itemIdFromHash(): string | null {
    const match = window.location.hash.match(/^#\/items\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private handleError(err: unknown): void {
    if (isAuthError(err)) {
      this.auth.flagAuthError(err.message);
      return;
    }
    this.banner.set(err instanceof Error ? err.message : 'Something went wrong.');
  }

  private startBusy(text: string): void {
    this.busy.set(true);
    this.loadingText.set(text);
    this.banner.set('');
    this.startProgressTimer();
  }

  private stopBusy(): void {
    this.stopProgressTimer();
    this.busy.set(false);
  }

  private startProgressTimer(): void {
    this.liveProgress = false;
    this.progressPct.set(35);
    this.progressText.set('');
    const start = Date.now();
    this.loadTimer = setInterval(() => {
      if (!this.liveProgress) this.progressText.set(`${((Date.now() - start) / 1000).toFixed(1)}s`);
    }, 100);
  }

  private stopProgressTimer(): void {
    if (this.loadTimer) clearInterval(this.loadTimer);
    this.loadTimer = null;
  }

  private setLiveProgress(text: string): void {
    this.liveProgress = true;
    this.progressText.set(text);
  }
}
