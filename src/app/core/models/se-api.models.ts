/** Raw shapes returned by the StreamElements API (only the fields this app reads). */

export interface SeChannelLike {
  _id?: string;
  id?: string;
  name?: string;
  displayName?: string;
  username?: string;
}

export interface SeChannelEntry extends SeChannelLike {
  channel?: SeChannelLike;
}

export interface SeUsersCurrentResponse {
  channels?: (SeChannelEntry | string)[];
  channelsList?: (SeChannelEntry | string)[];
  ownedChannels?: (SeChannelEntry | string)[];
}

export interface SeItemQuantity {
  total?: number | null;
  current?: number | null;
}

export interface SeStoreItem {
  _id: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  cost?: number;
  type?: string;
  quantity?: SeItemQuantity;
}

export interface SeRedemptionInputEntry {
  value?: unknown;
  text?: unknown;
  answer?: unknown;
}

export interface SeRedemptionDoc {
  _id: string;
  createdAt?: string;
  updatedAt?: string;
  message?: string;
  item?: { _id?: string; name?: string };
  redeemer?: { username?: string };
  input?: (SeRedemptionInputEntry | string)[];
}

export interface SeRedemptionSearchResponse {
  docs?: SeRedemptionDoc[];
  _total?: number;
}
