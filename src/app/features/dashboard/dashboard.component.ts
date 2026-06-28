import { Component, OnDestroy, OnInit, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';
import { ExportService } from '../../core/services/export.service';
import { StreamElementsService } from '../../core/services/stream-elements.service';
import { isAuthError } from '../../core/services/se-error';
import { isoBounds, todayIso } from '../../core/utils/date.util';
import { Channel, ExportFormat, GroupedUser, PaginatedContent, RedemptionRow, SortKey, SortOrder, StoreItem } from '../../core/models/models';
import { AsyncSignal } from '../../core/state/async-signal';
import { HeaderComponent } from './header/header.component';
import { ItemsListComponent } from './items-list/items-list.component';
import { RedemptionsControlsComponent } from './redemptions-controls/redemptions-controls.component';
import { RedemptionsTableComponent } from './redemptions-table/redemptions-table.component';

interface RedemptionsBody {
  rows: RedemptionRow[];
  groups: GroupedUser[];
}

@Component({
  selector: 'app-dashboard',
  imports: [HeaderComponent, ItemsListComponent, RedemptionsControlsComponent, RedemptionsTableComponent],
  templateUrl: './dashboard.component.html',
})
export class DashboardComponent implements OnInit, OnDestroy {
  // =============================
  // === Dependencies ============
  // =============================
  private readonly authService = inject(AuthService);
  private readonly streamElementsService = inject(StreamElementsService);
  private readonly exportService = inject(ExportService);

  // =============================
  // === Async state ==============
  // =============================
  readonly channelAsync: AsyncSignal<Channel | null> = new AsyncSignal<Channel | null>(null);
  readonly itemsAsync: AsyncSignal<StoreItem[]> = new AsyncSignal<StoreItem[]>([]);
  readonly itemDetailAsync: AsyncSignal<StoreItem | null> = new AsyncSignal<StoreItem | null>(null);
  readonly redemptionsAsync: AsyncSignal<RedemptionsBody> = new AsyncSignal<RedemptionsBody>({ rows: [], groups: [] });

  // =============================
  // === State ====================
  // =============================
  readonly availableChannels: Signal<Channel[]> = this.streamElementsService.availableChannels;
  readonly channelId: WritableSignal<string> = signal<string>('');
  readonly banner: WritableSignal<string> = signal<string>('');

  readonly items: Signal<StoreItem[]> = this.itemsAsync.body;
  readonly selectedItem: WritableSignal<StoreItem | null> = signal<StoreItem | null>(null);
  readonly selectedItemDetail: Signal<StoreItem | null> = this.itemDetailAsync.body;

  readonly appliedFrom: WritableSignal<string> = signal<string>(todayIso());
  readonly appliedTo: WritableSignal<string> = signal<string>(todayIso());
  readonly sortKey: WritableSignal<SortKey> = signal<SortKey>('date');
  readonly sortOrder: WritableSignal<SortOrder> = signal<SortOrder>('desc');

  readonly offset: WritableSignal<number> = signal<number>(0);
  readonly pageSize: WritableSignal<number> = signal<number>(20);
  readonly hasMore: WritableSignal<boolean> = signal<boolean>(false);
  readonly fetchedCount: WritableSignal<number> = signal<number>(0);
  readonly exhausted: WritableSignal<boolean> = signal<boolean>(false);
  readonly totalCount: WritableSignal<number | null> = signal<number | null>(null);

  readonly grouped: WritableSignal<boolean> = signal<boolean>(false);
  readonly groupSearch: WritableSignal<string> = signal<string>('');
  readonly groupOffset: WritableSignal<number> = signal<number>(0);
  readonly groupPageSize: WritableSignal<number> = signal<number>(20);

  readonly loadingText: WritableSignal<string> = signal<string>('Loading...');
  readonly progressText: WritableSignal<string> = signal<string>('');
  readonly progressPct: WritableSignal<number> = signal<number>(35);

  // =============================
  // === Computed ==================
  // =============================
  readonly busy: Signal<boolean> = this.redemptionsAsync.busy;
  readonly rows: Signal<RedemptionRow[]> = computed<RedemptionRow[]>(() => this.redemptionsAsync.body().rows);
  readonly groupAll: Signal<GroupedUser[]> = computed<GroupedUser[]>(() => this.redemptionsAsync.body().groups);

  readonly channelName: Signal<string> = computed<string>(() => {
    if (this.channelAsync.status() === 'error') return 'error';
    const channel: Channel | null = this.channelAsync.body();
    return channel ? channel.name || channel.id || 'unknown' : '...';
  });

  readonly filteredGroups: Signal<GroupedUser[]> = computed<GroupedUser[]>(() => {
    const query: string = this.groupSearch().trim().toLowerCase();
    const all: GroupedUser[] = this.groupAll();
    return query ? all.filter((g) => g.username.toLowerCase().includes(query)) : all;
  });

  readonly groupTotalUsers: Signal<number> = computed<number>(() => this.filteredGroups().length);
  readonly groupTotalRedemptions: Signal<number> = computed<number>(() => this.filteredGroups().reduce((sum, g) => sum + g.count, 0));
  readonly clampedGroupOffset: Signal<number> = computed<number>(() => Math.min(this.groupOffset(), Math.max(0, this.groupTotalUsers() - 1)));
  readonly groupPageRows: Signal<GroupedUser[]> = computed<GroupedUser[]>(() =>
    this.filteredGroups().slice(this.clampedGroupOffset(), this.clampedGroupOffset() + this.groupPageSize()),
  );

  readonly detailStats: Signal<string> = computed<string>(() => {
    if (!this.selectedItem()) return '';
    if (this.grouped()) return `${this.groupTotalUsers()} users · ${this.groupTotalRedemptions()} redemptions`;
    return this.exhausted() ? `${this.totalCount()} redemptions` : `${this.fetchedCount()}+ loaded...`;
  });

  readonly rowsContent: Signal<PaginatedContent<RedemptionRow>> = computed<PaginatedContent<RedemptionRow>>(() => ({
    items: this.rows(),
    offset: this.offset(),
    pageSize: this.pageSize(),
    knownCount: this.fetchedCount(),
    total: this.exhausted() ? this.totalCount() : null,
    hasMore: this.hasMore(),
  }));

  readonly groupsContent: Signal<PaginatedContent<GroupedUser>> = computed<PaginatedContent<GroupedUser>>(() => {
    const offset: number = this.clampedGroupOffset();
    const pageRows: GroupedUser[] = this.groupPageRows();
    const total: number = this.groupTotalUsers();
    return {
      items: pageRows,
      offset,
      pageSize: this.groupPageSize(),
      knownCount: total,
      total,
      hasMore: offset + pageRows.length < total,
    };
  });

  readonly tableContent: Signal<PaginatedContent<RedemptionRow | GroupedUser> | null> = computed<PaginatedContent<RedemptionRow | GroupedUser> | null>(
    () => {
      if (!this.selectedItem()) return null;
      return this.grouped() ? this.groupsContent() : this.rowsContent();
    },
  );

  // =============================
  // === Lifecycle =================
  // =============================
  private loadTimer: ReturnType<typeof setInterval> | null = null;
  private liveProgress: boolean = false;

  private readonly onHashChange = (): void => {
    const id: string | null = this.itemIdFromHash();
    if (id) void this.selectItem(id, false);
  };

  async ngOnInit(): Promise<void> {
    window.addEventListener('hashchange', this.onHashChange);
    await this.streamElementsService.loadChannelOptions();
    await this.loadChannel();
    await this.loadItems();
  }

  ngOnDestroy(): void {
    window.removeEventListener('hashchange', this.onHashChange);
    this.stopProgressTimer();
  }

  // =============================
  // === Actions ===================
  // =============================
  async onChannelChange(channelId: string): Promise<void> {
    this.streamElementsService.switchChannel(channelId);
    this.selectedItem.set(null);
    this.itemDetailAsync.reset(null);
    this.grouped.set(false);
    this.redemptionsAsync.reset({ rows: [], groups: [] });
    this.banner.set('');
    await this.loadChannel();
    await this.loadItems();
  }

  onDisconnect(): void {
    this.authService.clear();
  }

  async selectItem(id: string, pushHash: boolean = true): Promise<void> {
    const item: StoreItem | undefined = this.items().find((i) => i.id === id);
    if (!item) return;

    this.selectedItem.set(item);
    this.itemDetailAsync.reset(null);
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
    const item: StoreItem | null = this.selectedItem();
    if (!item) return;

    this.grouped.set(false);
    this.startBusy('Fetching redemptions...');

    try {
      const [from, to]: [string | null, string | null] = isoBounds(this.appliedFrom(), this.appliedTo());
      const { channel, acc } = await this.streamElementsService.getAcc(item.id, item.name, from, to, this.sortKey(), this.sortOrder());
      await this.streamElementsService.extendUntil(channel, acc, item.id, item.name, from, to, this.sortKey(), this.sortOrder(), this.offset() + this.pageSize() + 1);

      const page: RedemptionRow[] = acc.rows.slice(this.offset(), this.offset() + this.pageSize());
      this.fetchedCount.set(acc.rows.length);
      this.exhausted.set(acc.exhausted);
      this.totalCount.set(acc.exhausted ? acc.rows.length : null);
      this.hasMore.set(!acc.exhausted || acc.rows.length > this.offset() + this.pageSize());
      this.redemptionsAsync.succeed({ rows: page, groups: this.groupAll() });
    } catch (err) {
      this.redemptionsAsync.failWith({ rows: [], groups: this.groupAll() }, this.toErrorMessage(err));
      this.handleError(err);
    } finally {
      this.stopProgressTimer();
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
      this.groupOffset.set(0);
      this.redemptionsAsync.succeed({ rows: this.rows(), groups });
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
    const item: StoreItem | null = this.selectedItem();
    if (!item) return;

    this.startBusy('Refreshing...');
    try {
      const [from, to]: [string | null, string | null] = isoBounds(this.appliedFrom(), this.appliedTo());
      await this.streamElementsService.getAcc(item.id, item.name, from, to, this.sortKey(), this.sortOrder(), true);
    } catch {
      // best-effort cache bust; the reload below surfaces any real error
    } finally {
      this.stopBusy();
    }

    this.offset.set(0);
    this.grouped() ? await this.showGrouped() : await this.loadPage();
  }

  async onExport(format: ExportFormat): Promise<void> {
    const item: StoreItem | null = this.selectedItem();
    if (!item || this.busy()) return;
    this.banner.set('');

    try {
      const { rows, groups } = await this.fetchFull('export');
      const label: string = item.name || item.id;
      let headers: string[];
      let records: (string | number)[][];

      if (this.grouped()) {
        headers = ['Item', 'Username', 'Count', 'First Redeemed', 'Last Redeemed'];
        records = groups.map((g) => [label, g.username, g.count, g.firstRedeemed ?? '', g.lastRedeemed ?? '']);
      } else {
        const sorted: RedemptionRow[] = [...rows].sort((a, b) => (b.redeemedAt ?? '').localeCompare(a.redeemedAt ?? ''));
        headers = ['Item', 'Username', 'Redeemed At', 'Input'];
        records = sorted.map((r) => [label, r.username, r.redeemedAt ?? '', r.input ?? '']);
      }

      const body: string = format === 'csv' ? this.exportService.toCsv(headers, records) : this.exportService.toTxt(label, this.grouped(), headers, records);
      const stamp: string = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const safeName: string = label.replace(/[^a-zA-Z0-9]/g, '_') || 'item';
      const suffix: string = this.grouped() ? '_grouped' : '';
      const filename: string = `redemptions_${safeName}${suffix}_${stamp}.${format}`;

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

  // =============================
  // === Internals =================
  // =============================
  private async loadChannel(): Promise<void> {
    this.channelAsync.start();
    try {
      const channel: Channel = await this.streamElementsService.getChannel();
      this.channelId.set(channel.id);
      this.channelAsync.succeed(channel);
    } catch (err) {
      this.channelAsync.fail(this.toErrorMessage(err));
      this.handleError(err);
    }
  }

  private async loadItems(): Promise<void> {
    this.itemsAsync.start();
    try {
      const items: StoreItem[] = await this.streamElementsService.getItems();
      this.itemsAsync.succeed(items);
      const hashId: string | null = this.itemIdFromHash();
      if (hashId) await this.selectItem(hashId, false);
    } catch (err) {
      this.itemsAsync.fail(this.toErrorMessage(err));
      this.handleError(err);
    }
  }

  private async loadItemDetailStats(id: string): Promise<void> {
    this.itemDetailAsync.start();
    try {
      const detail: StoreItem = await this.streamElementsService.getItemDetail(id);
      this.itemDetailAsync.succeed(detail);
    } catch {
      // best-effort; the basic item info from the list is still shown
      this.itemDetailAsync.fail('Could not load item detail.');
    }
  }

  private async fetchFull(purpose: 'group' | 'export'): Promise<RedemptionsBody> {
    const item: StoreItem | null = this.selectedItem();
    if (!item) return { rows: [], groups: [] };

    const [from, to]: [string | null, string | null] = isoBounds(this.appliedFrom(), this.appliedTo());
    const { channel, acc } = await this.streamElementsService.getAcc(item.id, item.name, from, to, this.sortKey(), this.sortOrder());

    this.startBusy(purpose === 'group' ? 'Fetching all entries to group...' : 'Fetching all entries to export...');
    const t0: number = Date.now();

    try {
      await this.streamElementsService.drain(channel, acc, item.id, item.name, from, to, this.sortKey(), this.sortOrder(), (a) => {
        const secs: string = ((Date.now() - t0) / 1000).toFixed(1);
        this.setLiveProgress(`${a.rows.length} rows · ${a.scanned} scanned · ${a.pages} pages · ${secs}s`);
      });
      this.setLiveProgress(`Done · ${acc.rows.length} rows`);
      this.progressPct.set(100);
      return { rows: acc.rows, groups: this.streamElementsService.groupRows(acc.rows) };
    } finally {
      this.stopBusy();
    }
  }

  private itemIdFromHash(): string | null {
    const match: RegExpMatchArray | null = window.location.hash.match(/^#\/items\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  private toErrorMessage(err: unknown): string {
    return err instanceof Error ? err.message : 'Something went wrong.';
  }

  private handleError(err: unknown): void {
    if (isAuthError(err)) {
      this.authService.flagAuthError(err.message);
      return;
    }
    this.banner.set(this.toErrorMessage(err));
  }

  private startBusy(text: string): void {
    this.loadingText.set(text);
    this.banner.set('');
    this.redemptionsAsync.start();
    this.startProgressTimer();
  }

  private stopBusy(): void {
    this.stopProgressTimer();
    this.redemptionsAsync.stop();
  }

  private startProgressTimer(): void {
    this.liveProgress = false;
    this.progressPct.set(35);
    this.progressText.set('');
    const start: number = Date.now();
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
