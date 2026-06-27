"use strict";

// ---------------------------------------------------------------------------
// StreamElements API access, entirely client-side.
//
// There is no server. The user pastes their personal StreamElements JWT
// (from https://streamelements.com/dashboard/account/channels -> "Show
// secrets") into the login screen once; it is kept only in this browser's
// localStorage and sent as a Bearer token straight to api.streamelements.com,
// which allows cross-origin requests with that header.
// ---------------------------------------------------------------------------

const API_BASE = "https://api.streamelements.com/kappa/v2";
const SE_PAGE_SIZE = 10000;     // rows pulled per StreamElements search request
const CACHE_TTL_MS = 120000;    // how long an item's accumulated rows stay cached

const auth = {
  get token() { return localStorage.getItem("se_jwt_token") || ""; },
  set token(v) { v ? localStorage.setItem("se_jwt_token", v) : localStorage.removeItem("se_jwt_token"); },
  get channelOverride() { return localStorage.getItem("se_channel_override") || ""; },
  set channelOverride(v) { v ? localStorage.setItem("se_channel_override", v) : localStorage.removeItem("se_channel_override"); },
  get loggedIn() { return !!this.token; },
  clear() {
    localStorage.removeItem("se_jwt_token");
    localStorage.removeItem("se_channel_override");
  },
};

class SEError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.status = status;
  }
}

let channelCache = { id: null, name: null };
let selfChannel = null;          // { id, name } for the token's own channel
let availableChannels = [];      // [{ id, name }] channels the token can browse
const accCache = new Map();      // key -> accumulator

function resetClientState() {
  channelCache = { id: null, name: null };
  selfChannel = null;
  availableChannels = [];
  accCache.clear();
}

// ---- StreamElements HTTP ---------------------------------------------------
async function seGet(path, params) {
  const url = new URL(API_BASE + path);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, v);
    }
  }

  let res;
  try {
    res = await fetch(url, {
      headers: { Accept: "application/json", Authorization: `Bearer ${auth.token}` },
    });
  } catch (e) {
    throw new SEError(`Could not reach StreamElements: ${e.message}`);
  }

  if (res.status === 401 || res.status === 403) {
    throw new SEError("StreamElements rejected the token (401/403). Please reconnect.", res.status);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new SEError(`StreamElements returned ${res.status}: ${text.slice(0, 300)}`, res.status);
  }

  try {
    return await res.json();
  } catch {
    throw new SEError("StreamElements returned a non-JSON response.");
  }
}

async function getChannel(force = false) {
  if (channelCache.id && !force) return channelCache;

  const overrideId = auth.channelOverride;
  if (overrideId) {
    const known = availableChannels.find((c) => c.id === overrideId);
    channelCache = { id: overrideId, name: known ? known.name : overrideId };
  } else if (selfChannel) {
    channelCache = { ...selfChannel };
  } else {
    const me = await seGet("/channels/me");
    channelCache = { id: me._id, name: me.displayName || me.username || me._id };
  }

  if (!channelCache.id) {
    throw new SEError("Could not determine channel id from /channels/me.");
  }

  return channelCache;
}

// Channels the token can browse: own channel plus anything /users/current lists
// (e.g. channels the account moderates), so there's no need to type a channel id.
async function fetchAvailableChannels() {
  let raw;
  try {
    raw = await seGet("/users/current");
  } catch {
    return [];
  }

  const arr = raw.channels || raw.channelsList || raw.ownedChannels || [];
  const list = [];

  for (const entry of arr) {
    const ch = (entry && entry.channel) ? entry.channel : entry;
    if (!ch) continue;

    const id = ch._id || ch.id || (typeof entry === "string" ? entry : null);
    if (!id) continue;

    list.push({ id, name: ch.displayName || ch.username || ch.name || id });
  }

  return list;
}

async function loadChannelOptions() {
  let list = [];

  try { 
    list = await fetchAvailableChannels(); 
  } catch (e) { 
    log("Channel list failed:", e.message); 
  }

  try {
    const me = await seGet("/channels/me");
    selfChannel = { id: me._id, name: me.displayName || me.username || me._id };

    if (selfChannel.id && !list.some((c) => c.id === selfChannel.id)) {
      list.unshift(selfChannel);
    }
  } catch (e) {
    log("Own channel lookup failed:", e.message);
  }

  availableChannels = list;
  renderChannelSwitcher();
}

function renderChannelSwitcher() {
  const sel = $("channelSelect");

  if (availableChannels.length > 1) {
    sel.innerHTML = availableChannels.map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join("");
    sel.value = auth.channelOverride || (selfChannel && selfChannel.id) || availableChannels[0].id;
    sel.classList.remove("hidden");
    $("channelName").classList.add("hidden");
  } else {
    sel.classList.add("hidden");
    $("channelName").classList.remove("hidden");
  }
}

function mapItem(it) {
  const quantity = it.quantity || {};
  const total = quantity.total;
  const current = quantity.current;
  const purchased = (total != null && current != null) ? total - current : null;

  return {
    id: it._id,
    name: it.name || "",
    description: it.description || "",
    enabled: !!it.enabled,
    cost: it.cost,
    type: it.type || "",
    quantityTotal: total,
    quantityCurrent: current,
    currentlyPurchased: purchased,
    remaining: current,
  };
}

async function getItems() {
  const channel = (await getChannel()).id;
  const raw = await seGet(`/store/${channel}/items`, { source: "all", limit: 1000 });

  const items = (raw || []).map(mapItem);
  items.sort((a, b) => (a.enabled === b.enabled ? a.name.localeCompare(b.name) : (a.enabled ? -1 : 1)));
  return items;
}

async function getItemDetail(itemId) {
  const channel = (await getChannel()).id;
  const raw = await seGet(`/store/${channel}/items/${itemId}`);
  return mapItem(raw);
}

function isoBounds(dateFrom, dateTo) {
  const frm = dateFrom ? `${dateFrom}T00:00:00.000Z` : null;
  const to = dateTo ? `${dateTo}T23:59:59.999Z` : null;
  return [frm, to];
}

function flattenInput(inp) {
  const parts = [];

  for (const entry of inp || []) {
    if (entry && typeof entry === "object") {
      let value = entry.value;
      if (value == null) value = entry.text ?? entry.answer;
      if (value != null) parts.push(String(value));
    } else if (entry != null) {
      parts.push(String(entry));
    }
  }

  return parts.join(" | ");
}

// ---- Lazy accumulator -------------------------------------------------------
function accKey(channel, itemId, frm, to, sortKey, order) {
  return JSON.stringify([channel, itemId, frm || "", to || "", sortKey, order]);
}

function newAcc(itemName) {
  const nameSearch = itemName && !itemName.includes(" ") ? itemName : null;
  return {
    rows: [],
    nextOffset: 0,
    scanned: 0,
    pages: 0,
    exhausted: false,
    nameSearch,
    filterLocked: false,
    ts: Date.now(),
  };
}

async function getAcc(itemId, itemName, frm, to, sortKey, order, refresh = false) {
  const channel = (await getChannel()).id;
  const key = accKey(channel, itemId, frm, to, sortKey, order);
  let acc = accCache.get(key);

  if (!acc || refresh || Date.now() - acc.ts > CACHE_TTL_MS) {
    acc = newAcc(itemName);
    accCache.set(key, acc);
  }

  return { channel, key, acc };
}

function matchesItem(doc, itemId, itemName) {
  const it = doc.item || {};
  if (it._id != null) return it._id === itemId;
  return it.name === itemName;
}

async function seSearchPage(channel, acc, frm, to, sortKey, order) {
  const base = { offset: acc.nextOffset, limit: SE_PAGE_SIZE, pending: "false" };
  if (frm) base.from = frm;
  if (to) base.to = to;
  const field = sortKey === "name" ? "redeemer.username" : "updatedAt";
  const direction = order === "asc" ? 1 : -1;

  const sorts = [JSON.stringify({ [field]: direction }), field];
  const attempts = [];
  for (const s of sorts) {
    if (acc.nameSearch) attempts.push([{ ...base, sort: s, searchBy: "item.name", search: acc.nameSearch }, true]);
    attempts.push([{ ...base, sort: s }, false]);
  }

  let lastErr = null;
  for (const [params, usedFilter] of attempts) {
    try {
      const data = await seGet(`/store/${channel}/redemptions/search`, params);
      if (!acc.filterLocked) {
        if (acc.nameSearch && !usedFilter) acc.nameSearch = null;
        acc.filterLocked = true;
      }

      return data;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new SEError("Could not fetch redemptions.");
}

async function fetchOnePage(channel, acc, itemId, itemName, frm, to, sortKey, order) {
  if (acc.exhausted) return { scanned: 0, matched: 0 };

  const data = await seSearchPage(channel, acc, frm, to, sortKey, order);
  const docs = data.docs || [];
  const total = data._total;
  let matched = 0;

  for (const d of docs) {
    if (!matchesItem(d, itemId, itemName)) continue;

    const redeemer = d.redeemer || {};
    acc.rows.push({
      id: d._id,
      username: redeemer.username || "",
      redeemedAt: d.createdAt,
      updatedAt: d.updatedAt,
      input: flattenInput(d.input) || d.message || "",
    });

    matched += 1;
  }

  acc.nextOffset += docs.length;
  acc.scanned += docs.length;
  acc.pages += 1;
  acc.ts = Date.now();

  if (docs.length < SE_PAGE_SIZE || (total != null && acc.nextOffset >= total)) {
    acc.exhausted = true;
  }

  return { scanned: docs.length, matched };
}

async function extendUntil(channel, acc, itemId, itemName, frm, to, sortKey, order, target) {
  while (!acc.exhausted && acc.rows.length < target) {
    await fetchOnePage(channel, acc, itemId, itemName, frm, to, sortKey, order);
  }
}

async function drain(channel, acc, itemId, itemName, frm, to, sortKey, order, onProgress) {
  while (!acc.exhausted) {
    await fetchOnePage(channel, acc, itemId, itemName, frm, to, sortKey, order);
    if (onProgress) onProgress(acc);
  }
}

function groupRows(rows) {
  const groups = new Map();

  for (const r of rows) {
    const name = r.username || "(unknown)";
    let g = groups.get(name);

    if (!g) {
      g = { username: name, count: 0, firstRedeemed: null, lastRedeemed: null };
      groups.set(name, g);
    }

    g.count += 1;
    const ts = r.redeemedAt;
    if (ts) {
      if (!g.firstRedeemed || ts < g.firstRedeemed) g.firstRedeemed = ts;
      if (!g.lastRedeemed || ts > g.lastRedeemed) g.lastRedeemed = ts;
    }
  }

  const result = [...groups.values()];
  result.sort((a, b) => (b.count - a.count) || a.username.localeCompare(b.username));
  return result;
}

// ---------------------------------------------------------------------------
// UI
// ---------------------------------------------------------------------------
const state = {
  items: [],
  selected: null,
  from: "",
  to: "",
  sort: "date",
  order: "desc",
  offset: 0,
  limit: 20,
  more: false,
  grouped: false,
  busy: false,
  groupAll: [],
  groupOffset: 0,
  groupLimit: 20,
};

const $ = (id) => document.getElementById(id);
const log = (...a) => console.log("%c[SE]", "color:#7c6cf0;font-weight:600", ...a);

function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

function showBanner(msg) { const b = $("banner"); b.textContent = msg; b.classList.remove("hidden"); }
function clearBanner() { $("banner").classList.add("hidden"); }

let loadTimer = null, loadStart = 0;
function setLoading(on, text) {
  state.busy = on;
  $("loading").classList.toggle("hidden", !on);
  if (text) $("loadingText").textContent = text;
  $("progressBar").style.width = "35%";
  $("loadingSub").textContent = "";
  delete $("loadingSub").dataset.live;
  clearInterval(loadTimer);
  if (on) {
    loadStart = Date.now();
    loadTimer = setInterval(() => {
      const s = ((Date.now() - loadStart) / 1000).toFixed(1);
      if (!$("loadingSub").dataset.live) $("loadingSub").textContent = `${s}s`;
    }, 100);
  }
}

function setProgress(sub, pct) {
  $("loadingSub").dataset.live = "1";
  $("loadingSub").textContent = sub;
  if (pct != null) $("progressBar").style.width = `${Math.max(5, Math.min(100, pct))}%`;
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return iso;
  return d.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function itemParams() {
  return {
    item_id: state.selected.id,
    item_name: state.selected.name,
    from: state.from,
    to: state.to,
    sort: state.sort,
    order: state.order,
  };
}

function handleAuthError(e) {
  if (e instanceof SEError && (e.status === 401 || e.status === 403)) {
    showLogin(e.message);
    return true;
  }
  return false;
}

// ---- channel + items -------------------------------------------------------
async function loadChannel() {
  try {
    const ch = await getChannel();
    $("channelName").textContent = ch.name || ch.id || "unknown";
    log("Channel:", ch.name, ch.id);
  } catch (e) {
    $("channelName").textContent = "error";
    if (!handleAuthError(e)) showBanner(e.message);
  }
}

async function loadItems() {
  try {
    state.items = await getItems();
    log(`Loaded ${state.items.length} items`);
    renderItems();
    const hashId = itemIdFromHash();
    if (hashId) selectItem(hashId, { pushHash: false });
  } catch (e) {
    if (!handleAuthError(e)) showBanner(e.message);
  }
}

function renderItems() {
  const q = $("itemSearch").value.trim().toLowerCase();
  const activeOnly = $("activeOnly").checked;
  const body = $("itemsBody");
  const filtered = state.items.filter((it) =>
    (!activeOnly || it.enabled) && (!q || it.name.toLowerCase().includes(q)));

  $("itemCount").textContent = `${filtered.length}/${state.items.length}`;
  $("itemsEmpty").classList.toggle("hidden", filtered.length > 0);

  body.innerHTML = filtered.map((it) => {
    const sel = state.selected && state.selected.id === it.id;
    const dot = it.enabled
      ? '<span class="inline-block h-2 w-2 rounded-full bg-mint" title="Active"></span>'
      : '<span class="inline-block h-2 w-2 rounded-full bg-line" title="Inactive"></span>';
    return `
      <tr data-id="${esc(it.id)}" tabindex="0" data-focusable
        class="cursor-pointer border-b border-line/60 transition hover:bg-raised ${sel ? "bg-raised" : ""}">
        <td class="py-2.5 pl-4 pr-2 align-middle">${dot}</td>
        <td class="py-2.5 pr-4 font-medium ${sel ? "text-iris" : ""}">${esc(it.name)}</td>
      </tr>`;
  }).join("");

  body.querySelectorAll("tr").forEach((tr) => {
    const select = () => selectItem(tr.dataset.id);
    tr.addEventListener("click", select);
    tr.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); select(); }
    });
  });
}

function selectItem(id, { pushHash = true } = {}) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  state.selected = it;
  state.offset = 0;
  state.grouped = false;
  log("Selected item:", it.name, `(id ${it.id})`);
  renderItems();

  if (pushHash && window.location.hash !== `#/items/${id}`) {
    window.location.hash = `#/items/${id}`;
  }

  $("detailTitle").textContent = it.name;
  $("detailSub").textContent = it.enabled ? "Active item" : "Inactive item";
  $("controls").classList.remove("hidden");
  $("controls").classList.add("flex");
  $("placeholder").classList.add("hidden");
  loadItemDetailStats(id);
  loadPage();
}

async function loadItemDetailStats(id) {
  const el = $("itemDetailStats");
  el.classList.add("hidden");
  try {
    const it = await getItemDetail(id);
    el.textContent = `Price: ${it.cost ?? "—"} · Purchased: ${it.currentlyPurchased ?? "—"} · Remaining: ${it.remaining ?? "—"}`;
    el.classList.remove("hidden");
  } catch (e) { log("Item stats failed:", e.message); }
}

function itemIdFromHash() {
  const m = window.location.hash.match(/^#\/items\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

// ---- ungrouped, lazy-paginated ---------------------------------------------
async function loadPage() {
  if (!state.selected) return;
  state.grouped = false;
  $("groupBtn").textContent = "Group by name";
  $("exportScope").textContent = "Export all entries";
  $("groupSearchWrap").classList.add("hidden");
  $("groupSearch").value = "";
  $("pageSize").value = String(state.limit);
  setLoading(true, "Fetching redemptions…");
  clearBanner();
  log(`Page request: offset=${state.offset} limit=${state.limit} sort=${state.sort} ${state.order}`);
  try {
    const { item_id, item_name, from, to, sort, order } = itemParams();
    const [frm, toB] = isoBounds(from, to);
    const { channel, acc } = await getAcc(item_id, item_name, frm, toB, sort, order);
    await extendUntil(channel, acc, item_id, item_name, frm, toB, sort, order, state.offset + state.limit + 1);

    const page = acc.rows.slice(state.offset, state.offset + state.limit);
    const more = !acc.exhausted || acc.rows.length > state.offset + state.limit;
    const data = {
      docs: page,
      fetched: acc.rows.length,
      exhausted: acc.exhausted,
      total: acc.exhausted ? acc.rows.length : null,
      more,
      pagesScanned: acc.pages,
    };
    state.more = data.more;
    log(`Got ${data.docs.length} rows; scanned ${data.pagesScanned} api page(s); fetched ${data.fetched}; exhausted=${data.exhausted}`);
    renderTable(data);
  } catch (e) {
    if (!handleAuthError(e)) { showBanner(e.message); renderTable({ docs: [] }); }
  } finally { setLoading(false); }
}

function sortableHead(label, key) {
  const active = state.sort === key;
  const arrow = active ? (state.order === "asc" ? "↑" : "↓") : "↕";
  return `<button data-sort="${key}" data-focusable
    class="inline-flex items-center gap-1 ${active ? "text-iris" : "hover:text-soft"} focus:outline-none">
    ${label} <span class="text-[10px]">${arrow}</span></button>`;
}

function renderTable(data) {
  const docs = data.docs || [];
  const head = $("tableHead"), body = $("tableBody");
  $("emptyState").classList.toggle("hidden", docs.length > 0 || state.offset > 0);

  head.classList.remove("hidden");
  head.innerHTML = `<tr>
    <th class="py-2.5 pl-4 pr-3 font-medium">${sortableHead("Username", "name")}</th>
    <th class="py-2.5 pr-3 font-medium">${sortableHead("Redeemed at", "date")}</th>
    <th class="py-2.5 pr-4 font-medium">Input</th></tr>`;
  head.querySelectorAll("[data-sort]").forEach((b) =>
    b.addEventListener("click", () => toggleSort(b.dataset.sort)));

  body.innerHTML = docs.map((r) => `
    <tr class="border-b border-line/50 hover:bg-raised/60">
      <td class="py-2.5 pl-4 pr-3 font-medium">${esc(r.username || "(unknown)")}</td>
      <td class="py-2.5 pr-3 font-mono tnum text-soft">${esc(fmtDate(r.redeemedAt))}</td>
      <td class="py-2.5 pr-4 text-mut">${esc(r.input || "—")}</td>
    </tr>`).join("");

  $("pager").classList.remove("hidden");
  $("pager").classList.add("flex");
  $("detailStats").classList.remove("hidden");
  const start = docs.length ? state.offset + 1 : 0;
  const end = state.offset + docs.length;
  const totalTxt = data.exhausted ? `${data.total}` : `${data.fetched}+`;
  $("rangeLabel").textContent = `${start}–${end} of ${totalTxt}`;
  $("detailStats").textContent = data.exhausted ? `${data.total} redemptions` : `${data.fetched}+ loaded…`;
  $("prevBtn").disabled = state.offset <= 0;
  $("nextBtn").disabled = !state.more;
}

function toggleSort(key) {
  if (state.sort === key) state.order = state.order === "asc" ? "desc" : "asc";
  else { state.sort = key; state.order = key === "name" ? "asc" : "desc"; }
  state.offset = 0;
  log("Sort ->", state.sort, state.order);
  loadPage();
}

// ---- full fetch (group / export) -------------------------------------------
async function fetchFull(purpose) {
  const { item_id, item_name, from, to, sort, order } = itemParams();
  const [frm, toB] = isoBounds(from, to);
  const { channel, acc } = await getAcc(item_id, item_name, frm, toB, sort, order);
  log(`Full fetch for ${purpose}`);
  setLoading(true, purpose === "group" ? "Fetching all entries to group…" : "Fetching all entries to export…");
  const t0 = Date.now();
  try {
    await drain(channel, acc, item_id, item_name, frm, toB, sort, order, (a) => {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      setProgress(`${a.rows.length} rows · ${a.scanned} scanned · ${a.pages} pages · ${secs}s`);
      log(`progress: pages=${a.pages} scanned=${a.scanned} matched=${a.rows.length}`);
    });
    const groups = groupRows(acc.rows);
    log(`done: ${acc.rows.length} redemptions across ${groups.length} users`);
    setProgress(`Done · ${acc.rows.length} rows`, 100);
    return { totalRedemptions: acc.rows.length, totalUsers: groups.length, groups, rows: acc.rows };
  } finally {
    setLoading(false);
  }
}

async function showGrouped() {
  if (!state.selected || state.busy) return;
  clearBanner();
  try {
    const d = await fetchFull("group");
    state.grouped = true;
    state.groupAll = d.groups;
    state.groupOffset = 0;
    $("groupBtn").textContent = "Show all entries";
    $("exportScope").textContent = "Export grouped view";
    $("groupSearchWrap").classList.remove("hidden");
    $("pageSize").value = String(state.groupLimit);
    renderGroupedPage();
  } catch (e) {
    if (!handleAuthError(e)) showBanner(e.message);
  }
}

function renderGroupedPage() {
  const q = $("groupSearch").value.trim().toLowerCase();
  const filtered = q ? state.groupAll.filter((g) => g.username.toLowerCase().includes(q)) : state.groupAll;
  const totalUsers = filtered.length;
  const totalRedemptions = filtered.reduce((sum, g) => sum + g.count, 0);
  const offset = Math.min(state.groupOffset, Math.max(0, totalUsers - 1));
  const page = filtered.slice(offset, offset + state.groupLimit);

  renderGrouped({ groups: page });

  $("detailStats").classList.remove("hidden");
  $("detailStats").textContent = `${totalUsers} users · ${totalRedemptions} redemptions`;

  $("pager").classList.remove("hidden");
  $("pager").classList.add("flex");
  const start = page.length ? offset + 1 : 0;
  const end = offset + page.length;
  $("rangeLabel").textContent = `${start}–${end} of ${totalUsers}`;
  $("prevBtn").disabled = offset <= 0;
  $("nextBtn").disabled = end >= totalUsers;
}

function renderGrouped(d) {
  const head = $("tableHead"), body = $("tableBody");
  $("emptyState").classList.toggle("hidden", d.groups.length > 0);

  head.classList.remove("hidden");
  head.innerHTML = `<tr>
    <th class="py-2.5 pl-4 pr-3 font-medium">Username</th>
    <th class="py-2.5 pr-3 font-medium">Count</th>
    <th class="py-2.5 pr-3 font-medium">First redeemed</th>
    <th class="py-2.5 pr-4 font-medium">Last redeemed</th></tr>`;

  body.innerHTML = d.groups.map((g) => `
    <tr class="border-b border-line/50 hover:bg-raised/60">
      <td class="py-2.5 pl-4 pr-3 font-medium">${esc(g.username)}</td>
      <td class="py-2.5 pr-3">
        <span class="inline-flex min-w-[2rem] justify-center rounded-md bg-iris/15 px-2 py-0.5 font-mono tnum text-iris">${g.count}</span></td>
      <td class="py-2.5 pr-3 font-mono tnum text-soft">${esc(fmtDate(g.firstRedeemed))}</td>
      <td class="py-2.5 pr-4 font-mono tnum text-soft">${esc(fmtDate(g.lastRedeemed))}</td>
    </tr>`).join("");
}

// ---- export (asks format after click, builds file client-side) ------------
function toggleExportMenu(open) {
  const m = $("exportMenu");
  if (open == null) open = m.classList.contains("hidden");
  m.classList.toggle("hidden", !open);
}

function renderCsv(headers, records) {
  const esc = (v) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(",")];
  for (const rec of records) lines.push(rec.map(esc).join(","));
  return lines.join("\r\n") + "\r\n";
}

function renderTxt(label, grouped, headers, records) {
  const lines = [`Item: ${label}`, `Mode: ${grouped ? "grouped per user" : "all redemptions"}`, ""];
  const strRecords = records.map((rec) => rec.map((c) => String(c)));
  const widths = headers.map((h) => h.length);
  for (const rec of strRecords) rec.forEach((cell, i) => { widths[i] = Math.max(widths[i], cell.length); });
  const fmtRow = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  lines.push(fmtRow(headers));
  lines.push(widths.map((w) => "-".repeat(w)).join("  "));
  for (const rec of strRecords) lines.push(fmtRow(rec));
  lines.push("", `Total rows: ${records.length}`);
  return lines.join("\n");
}

function downloadBlob(filename, mime, content) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function doExport(fmt) {
  toggleExportMenu(false);
  if (!state.selected || state.busy) return;
  clearBanner();
  try {
    const d = await fetchFull("export");
    const label = state.selected.name || state.selected.id;
    let headers, records;
    if (state.grouped) {
      headers = ["Item", "Username", "Count", "First Redeemed", "Last Redeemed"];
      records = d.groups.map((g) => [label, g.username, g.count, g.firstRedeemed || "", g.lastRedeemed || ""]);
    } else {
      const rows = [...d.rows].sort((a, b) => (b.redeemedAt || "").localeCompare(a.redeemedAt || ""));
      headers = ["Item", "Username", "Redeemed At", "Input"];
      records = rows.map((r) => [label, r.username, r.redeemedAt || "", r.input || ""]);
    }
    const body = fmt === "csv" ? renderCsv(headers, records) : renderTxt(label, state.grouped, headers, records);
    const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const safe = label.replace(/[^a-zA-Z0-9]/g, "_") || "item";
    const suffix = state.grouped ? "_grouped" : "";
    const filename = `redemptions_${safe}${suffix}_${stamp}.${fmt}`;
    log(`Export ${fmt} (${state.grouped ? "grouped" : "all"}, ${records.length} records) -> ${filename}`);
    downloadBlob(filename, fmt === "csv" ? "text/csv" : "text/plain", body);
  } catch (e) {
    if (!handleAuthError(e)) showBanner(e.message);
  }
}

// ---- auth / login screen ----------------------------------------------------
function showLogin(message) {
  resetClientState();
  $("loginScreen").classList.remove("hidden");
  $("app").classList.add("hidden");
  $("loginError").classList.toggle("hidden", !message);
  if (message) $("loginError").textContent = message;
}

function showApp() {
  $("loginScreen").classList.add("hidden");
  $("app").classList.remove("hidden");
}

async function connect(token) {
  auth.token = token.trim();
  resetClientState();
  try {
    await seGet("/channels/me");
  } catch (e) {
    auth.clear();
    throw e;
  }
}

function initAuth() {
  initTheme();

  if (auth.loggedIn) {
    showApp();
    startApp();
  } else {
    showLogin();
  }

  $("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const token = $("loginToken").value;
    if (!token.trim()) return;
    const btn = $("loginSubmit");
    btn.disabled = true;
    btn.textContent = "Connecting…";
    $("loginError").classList.add("hidden");
    try {
      await connect(token);
      showApp();
      startApp();
    } catch (e) {
      $("loginError").textContent = e.message || "Could not connect.";
      $("loginError").classList.remove("hidden");
    } finally {
      btn.disabled = false;
      btn.textContent = "Connect";
    }
  });

  $("disconnectBtn").addEventListener("click", () => {
    auth.clear();
    log("Disconnected");
    showLogin();
  });
}

let appStarted = false;
function startApp() {
  if (appStarted) { loadChannelOptions(); loadChannel(); loadItems(); return; }
  appStarted = true;
  init();
}

// ---- theme switch (system default, overridable) ----------------------------
const THEME_KEY = "se_theme"; // "light" | "dark" | absent = follow system

function getStoredTheme() { return localStorage.getItem(THEME_KEY); }
function systemPrefersDark() { return window.matchMedia("(prefers-color-scheme: dark)").matches; }

function applyTheme() {
  const stored = getStoredTheme();
  const dark = stored === "dark" || (stored !== "light" && systemPrefersDark());
  document.documentElement.classList.toggle("dark", dark);
  const icon = $("themeIcon");
  if (icon) icon.textContent = stored === "light" ? "☀ Light" : stored === "dark" ? "🌙 Dark" : "🖥️ System";
  const btn = $("themeToggle");
  if (btn) btn.title = `Theme: ${stored || "system"} (click to change)`;
}

function cycleTheme() {
  const stored = getStoredTheme();
  const next = stored === null ? "light" : stored === "light" ? "dark" : null;
  if (next === null) localStorage.removeItem(THEME_KEY); else localStorage.setItem(THEME_KEY, next);
  log("Theme ->", next || "system");
  applyTheme();
}

function initTheme() {
  applyTheme();
  $("themeToggle").addEventListener("click", cycleTheme);
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getStoredTheme() === null) applyTheme();
  });
}

// ---- wiring -----------------------------------------------------------------
function init() {
  $("fromDate").value = todayISO();
  $("toDate").value = todayISO();
  state.from = todayISO();
  state.to = todayISO();
  log("Date range defaulted to today:", state.from);

  loadChannelOptions();
  loadChannel();
  loadItems();

  $("channelSelect").addEventListener("change", async (e) => {
    auth.channelOverride = e.target.value;
    channelCache = { id: null, name: null };
    accCache.clear();
    state.selected = null;
    state.grouped = false;
    $("controls").classList.add("hidden");
    $("controls").classList.remove("flex");
    $("placeholder").classList.remove("hidden");
    $("emptyState").classList.add("hidden");
    $("pager").classList.add("hidden");
    $("pager").classList.remove("flex");
    $("tableHead").classList.add("hidden");
    $("tableBody").innerHTML = "";
    $("detailStats").classList.add("hidden");
    $("detailTitle").textContent = "Redemptions";
    $("detailSub").textContent = "Select an item to load its redemptions.";
    log("Switched channel ->", e.target.value);
    await loadChannel();
    await loadItems();
  });

  window.addEventListener("hashchange", () => {
    const id = itemIdFromHash();
    if (id) selectItem(id, { pushHash: false });
  });

  let searchTimer;
  $("itemSearch").addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(renderItems, 120); });
  $("activeOnly").addEventListener("change", renderItems);

  $("applyBtn").addEventListener("click", () => {
    state.from = $("fromDate").value;
    state.to = $("toDate").value;
    state.offset = 0;
    log("Apply range:", state.from, "->", state.to);
    state.grouped ? showGrouped() : loadPage();
  });
  $("refreshBtn").addEventListener("click", async () => {
    if (!state.selected) return;
    log("Refresh (bust cache)");
    const { item_id, item_name, from, to, sort, order } = itemParams();
    const [frm, toB] = isoBounds(from, to);
    setLoading(true, "Refreshing…");
    try { await getAcc(item_id, item_name, frm, toB, sort, order, true); } catch (_) {}
    state.offset = 0;
    state.grouped ? showGrouped() : loadPage();
  });

  $("groupBtn").addEventListener("click", () => state.grouped ? loadPage() : showGrouped());

  let groupSearchTimer;
  $("groupSearch").addEventListener("input", () => {
    clearTimeout(groupSearchTimer);
    groupSearchTimer = setTimeout(() => { state.groupOffset = 0; renderGroupedPage(); }, 120);
  });

  $("exportBtn").addEventListener("click", (e) => { e.stopPropagation(); toggleExportMenu(); });
  document.querySelectorAll(".export-opt").forEach((b) =>
    b.addEventListener("click", () => doExport(b.dataset.fmt)));
  document.addEventListener("click", (e) => {
    if (!$("exportMenu").contains(e.target) && e.target !== $("exportBtn")) toggleExportMenu(false);
  });

  $("pageSize").addEventListener("change", (e) => {
    const val = parseInt(e.target.value, 10);
    if (state.grouped) { state.groupLimit = val; state.groupOffset = 0; renderGroupedPage(); }
    else { state.limit = val; state.offset = 0; loadPage(); }
  });
  $("prevBtn").addEventListener("click", () => {
    if (state.grouped) { state.groupOffset = Math.max(0, state.groupOffset - state.groupLimit); renderGroupedPage(); }
    else { state.offset = Math.max(0, state.offset - state.limit); loadPage(); }
  });
  $("nextBtn").addEventListener("click", () => {
    if (state.grouped) { state.groupOffset += state.groupLimit; renderGroupedPage(); }
    else { state.offset += state.limit; loadPage(); }
  });
}

document.addEventListener("DOMContentLoaded", initAuth);
