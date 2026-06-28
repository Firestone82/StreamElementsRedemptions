import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, WritableSignal, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  Channel,
  GroupedUser,
  RedemptionAccumulator,
  RedemptionQuery,
  RedemptionRow,
  StoreItem,
} from '../models/models';
import {
  SeChannelLike,
  SeRedemptionDoc,
  SeRedemptionSearchResponse,
  SeStoreItem,
  SeUsersCurrentResponse,
} from '../models/se-api.models';
import { AuthService } from './auth.service';
import { SEError } from './se-error';

const API_BASE: string = 'https://api.streamelements.com/kappa/v2';
const SE_PAGE_SIZE: number = 10000;
const CACHE_TTL_MS: number = 120000;

function mapItem(raw: SeStoreItem): StoreItem {
  const total: number | null = raw.quantity?.total ?? null;
  const current: number | null = raw.quantity?.current ?? null;
  const purchased: number | null = total != null && current != null ? total - current : null;

  return {
    id: raw._id,
    name: raw.name ?? '',
    description: raw.description ?? '',
    enabled: !!raw.enabled,
    cost: raw.cost ?? null,
    type: raw.type ?? '',
    quantityTotal: total,
    quantityCurrent: current,
    currentlyPurchased: purchased,
    remaining: current,
  };
}

/**
 * Entirely client-side access to the StreamElements API. There is no backend:
 * requests go straight from the browser to api.streamelements.com with the
 * user's own Bearer token, which StreamElements allows cross-origin.
 */
@Injectable({ providedIn: 'root' })
export class StreamElementsService {
  private readonly httpClient = inject(HttpClient);
  private readonly authService = inject(AuthService);

  readonly availableChannels: WritableSignal<Channel[]> = signal<Channel[]>([]);

  private channelCache: Channel | null = null;
  private selfChannel: Channel | null = null;
  private readonly accCache = new Map<string, RedemptionAccumulator>();

  async connect(token: string): Promise<void> {
    this.authService.setToken(token);
    this.resetClientState();
    try {
      await this.seGet('/channels/me');
    } catch (err) {
      this.authService.clear();
      throw err;
    }
  }

  resetClientState(): void {
    this.channelCache = null;
    this.selfChannel = null;
    this.availableChannels.set([]);
    this.accCache.clear();
  }

  switchChannel(channelId: string): void {
    this.authService.setChannelOverride(channelId);
    this.channelCache = null;
    this.accCache.clear();
  }

  async getChannel(force: boolean = false): Promise<Channel> {
    if (this.channelCache && !force) return this.channelCache;

    const overrideId: string = this.authService.channelOverride;
    if (overrideId) {
      const known: Channel | undefined = this.availableChannels().find((c) => c.id === overrideId);
      this.channelCache = { id: overrideId, name: known?.name ?? overrideId };
    } else if (this.selfChannel) {
      this.channelCache = { ...this.selfChannel };
    } else {
      const me: SeChannelLike & { _id: string } = await this.seGet<SeChannelLike & { _id: string }>('/channels/me');
      this.channelCache = { id: me._id, name: me.displayName || me.username || me._id };
    }

    if (!this.channelCache.id) {
      throw new SEError('Could not determine channel id from /channels/me.');
    }

    return this.channelCache;
  }

  /** Channels the token can browse: own channel plus anything /users/current lists. */
  async loadChannelOptions(): Promise<void> {
    let list: Channel[] = [];
    try {
      list = await this.fetchAvailableChannels();
    } catch {
      list = [];
    }

    try {
      const me: SeChannelLike & { _id: string } = await this.seGet<SeChannelLike & { _id: string }>('/channels/me');
      this.selfChannel = { id: me._id, name: me.displayName || me.username || me._id };
      if (this.selfChannel.id && !list.some((c) => c.id === this.selfChannel!.id)) {
        list.unshift(this.selfChannel);
      }
    } catch {
      // own channel lookup failed; the selector falls back to the override or fetched list
    }

    this.availableChannels.set(list);
  }

  async getItems(): Promise<StoreItem[]> {
    const channel: string = (await this.getChannel()).id;
    const raw: SeStoreItem[] = await this.seGet<SeStoreItem[]>(`/store/${channel}/items`, { source: 'all', limit: 1000 });
    const items: StoreItem[] = (raw ?? []).map(mapItem);
    items.sort((a, b) => (a.enabled === b.enabled ? a.name.localeCompare(b.name) : a.enabled ? -1 : 1));
    return items;
  }

  async getItemDetail(itemId: string): Promise<StoreItem> {
    const channel: string = (await this.getChannel()).id;
    const raw: SeStoreItem = await this.seGet<SeStoreItem>(`/store/${channel}/items/${itemId}`);
    return mapItem(raw);
  }

  /** Returns (creating if needed) the cached accumulator for this query. */
  async getAcc(query: RedemptionQuery, refresh: boolean = false): Promise<{ channel: string; acc: RedemptionAccumulator }> {
    const channel: string = (await this.getChannel()).id;
    const key: string = this.accKey(channel, query);
    let acc: RedemptionAccumulator | undefined = this.accCache.get(key);

    if (!acc || refresh || Date.now() - acc.ts > CACHE_TTL_MS) {
      acc = this.newAcc(query.itemName);
      this.accCache.set(key, acc);
    }

    return { channel, acc };
  }

  /** Fetches pages until the accumulator holds at least `target` matching rows, or is exhausted. */
  async extendUntil(channel: string, acc: RedemptionAccumulator, query: RedemptionQuery, target: number): Promise<void> {
    while (!acc.exhausted && acc.rows.length < target) {
      await this.fetchOnePage(channel, acc, query);
    }
  }

  /** Fetches every remaining page, reporting progress after each one. */
  async drain(
    channel: string,
    acc: RedemptionAccumulator,
    query: RedemptionQuery,
    onProgress?: (acc: RedemptionAccumulator) => void,
  ): Promise<void> {
    while (!acc.exhausted) {
      await this.fetchOnePage(channel, acc, query);
      onProgress?.(acc);
    }
  }

  groupRows(rows: RedemptionRow[]): GroupedUser[] {
    const groups = new Map<string, GroupedUser>();

    for (const row of rows) {
      const name: string = row.username || '(unknown)';
      let group: GroupedUser | undefined = groups.get(name);
      if (!group) {
        group = { username: name, count: 0, firstRedeemed: null, lastRedeemed: null };
        groups.set(name, group);
      }

      group.count += 1;
      const ts: string | null = row.redeemedAt;
      if (ts) {
        if (!group.firstRedeemed || ts < group.firstRedeemed) group.firstRedeemed = ts;
        if (!group.lastRedeemed || ts > group.lastRedeemed) group.lastRedeemed = ts;
      }
    }

    return [...groups.values()].sort((a, b) => b.count - a.count || a.username.localeCompare(b.username));
  }

  // ---- internals -----------------------------------------------------------

  private async fetchAvailableChannels(): Promise<Channel[]> {
    let raw: SeUsersCurrentResponse;
    try {
      raw = await this.seGet<SeUsersCurrentResponse>('/users/current');
    } catch {
      return [];
    }

    const entries = raw.channels ?? raw.channelsList ?? raw.ownedChannels ?? [];
    const list: Channel[] = [];

    for (const entry of entries) {
      const ch: SeChannelLike | undefined = typeof entry === 'string' ? { _id: entry } : entry.channel ?? entry;
      const id: string | undefined = ch?._id ?? ch?.id;
      if (!id) continue;
      list.push({ id, name: ch.displayName || ch.username || ch.name || id });
    }

    return list;
  }

  private accKey(channel: string, query: RedemptionQuery): string {
    return JSON.stringify([channel, query.itemId, query.from ?? '', query.to ?? '', query.sortKey, query.order]);
  }

  private newAcc(itemName: string): RedemptionAccumulator {
    const nameSearch: string | null = itemName && !itemName.includes(' ') ? itemName : null;
    return { rows: [], nextOffset: 0, scanned: 0, pages: 0, exhausted: false, nameSearch, filterLocked: false, ts: Date.now() };
  }

  private matchesItem(doc: SeRedemptionDoc, query: RedemptionQuery): boolean {
    const item = doc.item ?? {};
    if (item._id != null) return item._id === query.itemId;
    return item.name === query.itemName;
  }

  private flattenInput(input?: SeRedemptionDoc['input']): string {
    const parts: string[] = [];
    for (const entry of input ?? []) {
      if (entry && typeof entry === 'object') {
        const value = entry.value ?? entry.text ?? entry.answer;
        if (value != null) parts.push(String(value));
      } else if (entry != null) {
        parts.push(String(entry));
      }
    }
    return parts.join(' | ');
  }

  private async fetchOnePage(channel: string, acc: RedemptionAccumulator, query: RedemptionQuery): Promise<void> {
    if (acc.exhausted) return;

    const data: SeRedemptionSearchResponse = await this.seSearchPage(channel, acc, query);
    const docs: SeRedemptionDoc[] = data.docs ?? [];
    const total: number | undefined = data._total;

    for (const doc of docs) {
      if (!this.matchesItem(doc, query)) continue;

      acc.rows.push({
        id: doc._id,
        username: doc.redeemer?.username ?? '',
        redeemedAt: doc.createdAt ?? null,
        updatedAt: doc.updatedAt ?? null,
        input: this.flattenInput(doc.input) || doc.message || '',
      });
    }

    acc.nextOffset += docs.length;
    acc.scanned += docs.length;
    acc.pages += 1;
    acc.ts = Date.now();

    if (docs.length < SE_PAGE_SIZE || (total != null && acc.nextOffset >= total)) {
      acc.exhausted = true;
    }
  }

  private async seSearchPage(channel: string, acc: RedemptionAccumulator, query: RedemptionQuery): Promise<SeRedemptionSearchResponse> {
    const base: Record<string, string | number> = { offset: acc.nextOffset, limit: SE_PAGE_SIZE, pending: 'false' };
    if (query.from) base['from'] = query.from;
    if (query.to) base['to'] = query.to;

    const field: string = query.sortKey === 'name' ? 'redeemer.username' : 'updatedAt';
    const direction: number = query.order === 'asc' ? 1 : -1;
    const sorts: string[] = [JSON.stringify({ [field]: direction }), field];

    const attempts: [Record<string, string | number>, boolean][] = [];
    for (const sort of sorts) {
      if (acc.nameSearch) attempts.push([{ ...base, sort, searchBy: 'item.name', search: acc.nameSearch }, true]);
      attempts.push([{ ...base, sort }, false]);
    }

    let lastErr: unknown = null;
    for (const [params, usedFilter] of attempts) {
      try {
        const data: SeRedemptionSearchResponse = await this.seGet<SeRedemptionSearchResponse>(`/store/${channel}/redemptions/search`, params);
        if (!acc.filterLocked) {
          if (acc.nameSearch && !usedFilter) acc.nameSearch = null;
          acc.filterLocked = true;
        }
        return data;
      } catch (err) {
        lastErr = err;
      }
    }

    throw lastErr instanceof SEError ? lastErr : new SEError('Could not fetch redemptions.');
  }

  private async seGet<T>(path: string, params?: Record<string, string | number | undefined | null>): Promise<T> {
    let httpParams: HttpParams = new HttpParams();
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') httpParams = httpParams.set(key, value);
      }
    }

    try {
      return await firstValueFrom(
        this.httpClient.get<T>(`${API_BASE}${path}`, {
          params: httpParams,
          headers: { Accept: 'application/json', Authorization: `Bearer ${this.authService.token}` },
        }),
      );
    } catch (err) {
      throw this.toSEError(err);
    }
  }

  private toSEError(err: unknown): SEError {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 401 || err.status === 403) {
        return new SEError('StreamElements rejected the token (401/403). Please reconnect.', err.status);
      }
      const detail: string = typeof err.error === 'string' ? err.error : JSON.stringify(err.error ?? err.message ?? '');
      return new SEError(`StreamElements returned ${err.status}: ${detail.slice(0, 300)}`, err.status || 502);
    }
    if (err instanceof SEError) return err;
    return new SEError(`Could not reach StreamElements: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}
