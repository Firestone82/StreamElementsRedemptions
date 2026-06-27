# StreamElements Store Redemptions

A small, fully static (pure HTML/JS, no backend) site to browse your
StreamElements store items and inspect the redemptions for any single item —
paginated, filterable by date, sortable, groupable per user, and exportable to
CSV or TXT.

There is no server. The page calls `api.streamelements.com` directly from
your browser using your personal StreamElements token, which you paste once
into a login screen. The token is stored only in this browser's
`localStorage` and is never sent anywhere except StreamElements.

> StreamElements' OAuth2 app flow requires a `client_secret` to exchange the
> authorization code for a token, on every login *and* every refresh. A
> secret like that can't be kept safe in client-side JS served from GitHub
> Pages, so this app uses StreamElements' supported alternative for
> single-account use: the personal JWT from your account dashboard. See
> [StreamElements' docs on personal access tokens](https://dev.streamelements.com/docs/api-docs/ae133ffaf8c1a-personal-access-using-jwt-secert-token-to-access-the-api).

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
   <https://streamelements.com/dashboard/account/channels> (click **Show
   secrets**) and paste it into the login screen. Treat it like a password.
3. Optionally set a **Channel ID** if you want to browse a channel other than
   your own (your token must be allowed to access it). Leave it blank to use
   your own channel, resolved automatically via `/channels/me`.
4. Click **Connect**. Use **Disconnect** in the header to clear the token from
   this browser at any time.

## Seeing progress

Open the browser console — every action and API request is logged (look for
`[SE]`). Group/export show live progress (rows matched, pages scanned,
elapsed seconds) in the loading overlay.

## Running locally

No build step or install needed — it's plain HTML/JS. Serve the `public/`
folder with any static file server, e.g.:

```bash
cd public
python3 -m http.server 8000   # or: npx serve
```

Then open <http://127.0.0.1:8000>.

## Deployment

Pushing to `master` deploys `public/` to GitHub Pages via
`.github/workflows/deploy-pages.yml` (`actions/upload-pages-artifact` +
`actions/deploy-pages`). Enable Pages for the repo with source **GitHub
Actions** under Settings → Pages.

## Notes

- Item list comes from `GET /store/{channel}/items`; redemptions from
  `GET /store/{channel}/redemptions/search`. Both are called directly from
  the browser — StreamElements' API allows cross-origin requests with the
  `Authorization` header.
- The search endpoint has no server-side "filter by item id", so the app pages
  through results and keeps the ones whose `item._id` matches your selection
  (falling back to the item name only if the API doesn't return an id). When the
  item name has no spaces, a name filter is also pushed to the API to cut
  traffic.
- An item's fetched rows are cached in memory for ~2 minutes (cleared on page
  reload), so paging, grouping and exporting reuse the same fetch. Use
  **Refresh** to pull fresh data.
- Styling uses the Tailwind Play CDN, so the UI needs an internet connection to
  look right (the StreamElements API calls need internet regardless).

## Security

Your token lives only in this browser's `localStorage` — it is never sent to
any server other than StreamElements. If it's ever been pasted somewhere
else, shared, or committed to a repo, regenerate it from the channels
dashboard immediately.
