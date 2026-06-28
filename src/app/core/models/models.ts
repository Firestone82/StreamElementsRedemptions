export interface Channel {
  id: string;
  name: string;
}

export interface StoreItem {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  cost: number | null;
  type: string;
  quantityTotal: number | null;
  quantityCurrent: number | null;
  currentlyPurchased: number | null;
  remaining: number | null;
}

export interface RedemptionRow {
  id: string;
  username: string;
  redeemedAt: string | null;
  updatedAt: string | null;
  input: string;
}

export interface GroupedUser {
  username: string;
  count: number;
  firstRedeemed: string | null;
  lastRedeemed: string | null;
}

export type SortKey = 'date' | 'name';
export type SortOrder = 'asc' | 'desc';
export type ExportFormat = 'csv' | 'txt';

export interface RedemptionAccumulator {
  rows: RedemptionRow[];
  nextOffset: number;
  scanned: number;
  pages: number;
  exhausted: boolean;
  nameSearch: string | null;
  filterLocked: boolean;
  ts: number;
}
