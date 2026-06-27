# StreamElements Store Redemptions

A small, fully static (pure HTML/JS, no backend) site to browse your
StreamElements store items and inspect the redemptions for any single item —
paginated, filterable by date, sortable, groupable per user, and exportable to
CSV or TXT.

There is no server. The page calls `api.streamelements.com` directly from
your browser using your personal StreamElements token, which you paste once
into a login screen. The token is stored only in this browser's
`localStorage` and is never sent anywhere except StreamElements.

## Features

- **Items table** (status dot + name) with a search box and an "Active items
  only" toggle.
- **Per-item redemptions**, matched by item **id**, loaded only for the item you
  select — not the whole store. The date range **defaults to today**.
  - **From / To** date filtering
  - **Sorting** by redeemed date or username (click the column headers)
  - **Lazy pagination** — the table pulls only as many API pages as it needs to
    fill the page you're viewing.
- **Group by name** — fully fetches every remaining redemption for the item,
  then aggregates per user (count, first and last redemption).
- **Export** — one button; it asks for **CSV** or **TXT** after you click, and
  exports the current view (grouped or all entries) over the full dataset,
  built and downloaded entirely in the browser.

## Login

1. Open the page.
2. Get your token from
   <https://streamelements.com/dashboard/account/channels> (click **Copy
   secret**) and paste it into the login screen. Treat it like a password.
3. Click **Connect**. Use **Disconnect** in the header to clear the token from
   this browser at any time.

## Running locally

No build step or install needed — it's plain HTML/JS. Serve the `public/`
folder with any static file server, e.g.:

```bash
cd public
python3 -m http.server 8000   # or: npx serve
```

Then open <http://127.0.0.1:8000>.

## Security

Your token lives only in this browser's `localStorage` — it is never sent to
any server other than StreamElements. If it's ever been pasted somewhere
else, shared, or committed to a repo, regenerate it from the channels
dashboard immediately.
