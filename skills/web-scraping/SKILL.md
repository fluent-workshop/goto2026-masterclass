---
name: web-scraping
description: "Extract structured data from any site: browser recon then HTTP batch. Use when asked to scrape, crawl, or download data from a URL."
license: MIT
---

# Website Scraping — Full Pipeline

Extract structured data from any website without stalling. This skill covers the
complete pipeline: browser exploration → data signal detection → HTTP extraction
strategy → canary testing → batch extraction → output + summary.

The core principle: **use the browser to understand the site, then switch to pure
HTTP as soon as you have a repeatable pattern.** Browser automation is expensive
and slow at scale. HTTP requests are fast and parallelizable. The skill is about
knowing when to make that switch — and how.

---

## Before You Start

Read the task description carefully and note:
- The **seed URL(s)** — where to start
- The **target data** — what you need to collect (e.g. all product listings + detail
  pages, all brand pages, all category index pages)
- The **output format** — where to save results and in what shape

**Ask the user for a working directory** before creating any files. Suggest a
reasonable default based on context (e.g. `./scrape-output` in the current project,
or a named folder in the workspace), but confirm it:

> "Where would you like me to save the scraped data, screenshots, and raw HTML cache?
> I'll default to `./scrape-output` unless you'd prefer somewhere else."

Once confirmed, create the full directory layout before Phase 1.

If any other inputs are unclear, ask before starting.

### Output directory layout

Set up this structure before Phase 1:

```
output/
  screenshots/     # Full-page browser screenshots, one per page type visited
  raw/             # Raw HTML saved from every page fetched (browser + HTTP)
    pages/         # One .html file per URL, named by slug or hash
    api/           # Raw JSON responses from any API endpoints discovered
  assets/          # Downloaded media files (images, logos, icons)
  data/            # Final structured output (JSON, CSV, etc.)
```

The `raw/` cache is the most important part. **First-pass extraction always misses
things.** Having the raw HTML on disk means you can re-extract — better selectors,
new fields, unstructured copy you didn't know you'd need — without hitting the site
again. This has real value: marketing copy, legal text, pricing tables, one-off
static links, and secondary content that isn't in the structured data all live in
the raw HTML.

---

## Phase 1 — Browser Exploration

**Goal:** Understand the site structure visually. Take screenshots. Do not scrape yet.

**Demonstration Note:** Since these scripts will run in a classroom/demo environment, **if you write a Playwright or Puppeteer script to capture screenshots, you MUST launch the browser in foreground mode (`headless: false`)**. The audience needs to see the browser window open and navigate.

1. Open the seed URL in the browser.
2. **Take a full-page screenshot.** Save to `output/screenshots/01-listing-page.png`
   (name descriptively — `listing-page`, `detail-page`, `brand-page`, `about-page`,
   `cart-page`, etc.).
3. **Save the raw HTML** of the current page via JS evaluate:
   ```javascript
   document.documentElement.outerHTML
   ```
   Write it to `output/raw/pages/<slug>.html`. Do this for every page you visit
   in the browser — even pages you don't think you need. You will want this later.
4. Navigate to at least one example of each major page type you'll need to scrape
   (e.g. category/listing page, individual item/detail page, brand or about page,
   "About Us", "Contact", "Become a Partner"). **Screenshot and save raw HTML for
   each one.**
5. For each page type, note:
   - What data is visible (names, prices, descriptions, images, metadata)
   - How items link to detail pages (URL structure, IDs, slugs)
   - Any pagination, infinite scroll, or "load more" patterns
   - **What images and media are present** — product photos, thumbnails, brand logos,
     category artwork, hero images. Note their URL patterns.
6. Also visit any secondary pages that look content-rich but aren't obviously
   structured — partnership/sponsor pages, FAQ, editorial content, landing pages.
   These often have copy and media assets that won't show up in the structured data
   extraction. Screenshot and save raw HTML.
7. If you notice anything unexpected — missing data, broken sections, region locks,
   login walls — **take a screenshot and note it.** You'll include this in the
   final summary.

> Screenshots serve two purposes: design reference for whoever builds the UI later,
> and evidence of what the site looked like at scrape time. Save them all. The raw
> HTML cache is your safety net — it lets you re-extract anything you missed without
> hitting the site again.

---

## Phase 2 — Probe for Structured Data

**Goal:** Find the fastest path to the data before committing to an extraction
strategy. The answer is almost always cheaper than you expect.

Do all of the following — don't skip steps because you assume you know the answer:

### 2a. Test server-render status

Run a plain HTTP request against the seed URL and at least one detail page URL:

```bash
curl -sL "https://example.com/products" | wc -c
curl -sL "https://example.com/products/123/widget" | wc -c
```

- **Large response (>10KB):** The page is likely server-rendered. Raw HTML is
  probably extractable with curl + a parser. Good news.
- **Tiny response (<1KB):** The page is a shell. Content loads via JavaScript.
  You'll need the browser for rendering — *but keep reading, there may still be
  a faster path.*

> Don't stop at "it's JS-rendered" and assume you're stuck with the browser.
> Most JS-rendered sites still have structured data available via one of the
> patterns below.

### 2b. Inspect the DOM for embedded structured data

While the page is loaded in the browser, check all of the following using the
browser's JS evaluate capability:

**`data-*` attributes with JSON payloads:**
```javascript
// Find all elements with large data attributes
Array.from(document.querySelectorAll('[data-*]'))
  .map(el => ({tag: el.tagName, attrs: Object.keys(el.dataset)}))
  .filter(x => x.attrs.length > 0)

// If you spot a promising attribute name, extract it:
document.getElementById('product-container')?.getAttribute('data-product-data')
```

**JSON-LD structured data:**
```javascript
Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
  .map(s => s.textContent.substring(0, 200))
```

**Embedded JSON in `<script>` tags:**
```javascript
Array.from(document.querySelectorAll('script:not([src])'))
  .map(s => s.textContent.trim().substring(0, 100))
  .filter(t => t.startsWith('{') || t.startsWith('[') || t.includes('window.__'))
```

If any of these return promising data, **check whether it's also present in the
raw HTML** (i.e. server-rendered, not JS-injected):

```bash
curl -sL "https://example.com/products" | grep -o 'data-product-data="[^"]*"' | head -c 500
```

If it shows up in the raw HTML → you can extract it with curl + a parser. This is
the fastest possible path.

### 2c. Monitor network requests

In the browser's network tab (or via `performance.getEntriesByType('resource')`),
look for:
- **XHR/fetch calls** to API endpoints (often `/api/...`, `/graphql`, `/v1/...`)
- **JSON responses** containing the data you need
- Predictable request patterns (same endpoint with different IDs or page params)

If you find a clean API endpoint, test it directly:
```bash
curl -sL "https://example.com/api/products?page=1" | python3 -m json.tool | head -50
```

### 2d. Check for auth requirements

Before assuming an HTTP request will work unauthenticated, check whether the
browser session has credentials the server expects. Signs that auth matters:
- You had to log in to see the content
- The site sets session cookies on load
- Requests in the network tab include `Authorization`, `X-CSRF-Token`, or
  `Cookie` headers

If auth is required, extract from the browser:

```javascript
// Session cookies
document.cookie

// CSRF token (common locations)
document.querySelector('meta[name="csrf-token"]')?.content
document.querySelector('meta[name="_token"]')?.content
document.querySelector('input[name="_token"]')?.value
```

Then pass to curl:
```bash
curl -sL "https://example.com/api/products" \
  -b "session=abc123; _csrf=xyz" \
  -H "X-CSRF-Token: xyz" \
  -H "User-Agent: Mozilla/5.0"
```

---

## Phase 3 — Choose Your Extraction Strategy

Based on Phase 2, pick the right tool for the job. Use the **cheapest approach
that works:**

| Signal | Strategy |
|---|---|
| Data is in a `data-*` attribute in server-rendered HTML | `curl` + parse attribute (Python HTMLParser or regex) |
| Data is in `<script type="application/ld+json">` | `curl` + extract JSON from script tag |
| Data is in a clean API endpoint | `curl` the API directly; may need auth headers |
| Page is server-rendered, data is in HTML structure | `curl` + HTML parser (Python, regex, or BeautifulSoup if available) |
| Page is JS-rendered, no embedded shortcuts found | Browser snapshot per page (slow — last resort) |

Also identify the **URL pattern** for detail pages. Common patterns:
- `/products/{id}` or `/products/{id}/{slug}`
- `/category/{slug}/item/{id}`
- IDs embedded in listing page HTML as `href` values or data attributes

If you can construct or enumerate the detail page URLs without loading each one
in the browser, you're ready to batch.

---

## Phase 4 — Canary Test (Always Do This)

**Before batching anything, test your approach on 2–3 representative URLs.**

Pick URLs that cover different cases — e.g. a product with a full description,
one with minimal data, and one from a different category. Run your extraction
script on just those URLs and verify:

- [ ] Response size is in the right range (not suspiciously small)
- [ ] The target fields are actually present in the output
- [ ] No auth walls, redirects to login, or empty bodies
- [ ] HTML entities and encoding are handled correctly
- [ ] The data looks like real content, not a cache miss or error page

If canary fails, go back to Phase 2. Do not proceed to batch extraction with a
broken approach.

---

## Phase 5 — Batch Extraction

Once the canary passes, extract across all target URLs.

**Write a script** (Python, Bun/TypeScript, or shell) rather than doing this
interactively. The script should:

1. Take the list of target URLs as input
2. For each URL:
   - Make the HTTP request (with auth headers if needed)
   - **Save the raw HTML response** to `output/raw/pages/<slug>.html` before parsing
   - Parse and extract the target fields
   - Append to the output
   - **Add a short delay** between requests (0.25–0.5 seconds is usually enough)
3. Handle errors gracefully:
   - **429 Too Many Requests:** back off and retry after the `Retry-After` header
     value (or 30 seconds if absent)
   - **404:** log the URL as missing, continue
   - **Other errors:** log and continue; don't abort the whole run

#### Option A — Bun/TypeScript (preferred): use `bottleneck`

`bottleneck` gives you `maxConcurrent`, `minTime` between requests, and built-in
exponential backoff without manual retry loops. Install it once:

```bash
bun add bottleneck
```

```typescript
import Bottleneck from 'bottleneck';
import { mkdir, writeFile } from 'fs/promises';

await mkdir('output/raw/pages', { recursive: true });

// In-process limiting only — no distributed backend needed for scraping
const limiter = new Bottleneck({
  maxConcurrent: 3,       // max parallel requests in flight
  minTime: 300,           // minimum ms between request starts
  retryDelay: (error, jobInfo) => {
    // Exponential backoff; return null to stop retrying
    if (jobInfo.retryCount >= 4) return null;
    const retryAfter = error?.response?.headers?.get('retry-after');
    return retryAfter ? parseInt(retryAfter) * 1000 : 1000 * 2 ** jobInfo.retryCount;
  },
});

const results = await Promise.all(
  urls.map(url =>
    limiter.schedule(async () => {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!res.ok) throw Object.assign(new Error(res.statusText), { response: res });
      const html = await res.text();

      // Cache raw HTML before extracting
      const slug = url.split('/').filter(Boolean).at(-1) ?? url.slice(-8);
      await writeFile(`output/raw/pages/${slug}.html`, html);

      // ... parse and extract target fields ...
      return extracted;
    })
  )
);
```

#### Option B — Python: manual sleep + retry

```python
import time, urllib.request, os, hashlib

os.makedirs('output/raw/pages', exist_ok=True)
os.makedirs('output/data', exist_ok=True)

for url in urls:
    try:
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=10) as resp:
            html = resp.read().decode('utf-8', errors='replace')

        slug = url.rstrip('/').split('/')[-1] or hashlib.md5(url.encode()).hexdigest()[:8]
        with open(f'output/raw/pages/{slug}.html', 'w') as f:
            f.write(html)

        # ... parse and extract target fields ...

        time.sleep(0.3)
    except urllib.error.HTTPError as e:
        if e.code == 429:
            retry_after = int(e.headers.get('Retry-After', 30))
            time.sleep(retry_after)
            # retry once
        else:
            print(f"Skip {url}: {e.code}")
```

If you discovered **API endpoints** in Phase 2, save raw JSON responses too:
```typescript
await writeFile(`output/raw/api/${endpointName}.json`, JSON.stringify(apiResponse, null, 2));
```

### 5b — Download Media Assets

After extracting structured data, download the media assets you identified in
Phase 1 — product images, thumbnails, brand logos, category artwork, hero images,
icons. Save them to `output/assets/` preserving a logical subfolder structure
(e.g. `assets/products/`, `assets/brands/`, `assets/logos/`).

Extract image URLs from the raw HTML cache rather than re-fetching pages:

```python
import re, urllib.request, os

os.makedirs('output/assets/products', exist_ok=True)

# Pull image URLs from cached HTML
for html_file in os.listdir('output/raw/pages'):
    with open(f'output/raw/pages/{html_file}') as f:
        html = f.read()
    img_urls = re.findall(r'<img[^>]+src=["\']([^"\']+)["\']', html)
    for url in img_urls:
        # Filter for product/content images (skip tracking pixels, icons under 100px etc.)
        filename = url.split('/')[-1].split('?')[0]
        if filename:
            urllib.request.urlretrieve(url, f'output/assets/products/{filename}')
            time.sleep(0.1)
```

> Even if you don't need the images right now, download them. A fully replicated
> site or app needs all media assets. Retroactively downloading them after the site
> changes or removes them is much harder. Storage is cheap; a second scraping run
> is not.

Save output as JSON (or whatever format the task requires) to `output/data/`.

---

## Phase 6 — Summary Report

When extraction is complete, report back with:

1. **What was collected:** total record counts by type (e.g. "47 product listings,
   47 detail pages with descriptions, 12 brand pages")
2. **Approach used:** which extraction method worked and why (e.g. "site is
   server-rendered; data was embedded in `data-catalog` attribute; extracted with
   curl + Python HTMLParser")
3. **Coverage gaps:** any records where key fields were missing or empty, and why
   if known
4. **Sample data:** share 2–3 example records from the extracted data so the user
   can spot-check quality. For example:
   - A product listing with title, price, and description
   - A detail page with full specs and images
   - A brand/category page with its copy
   Keep it concise — a few fields each, not the whole JSON blob.
5. **Screenshots:** attach 2–3 representative screenshots from Phase 1 directly
   in the reply — the homepage/listing view, a detail page, and anything
   unexpected or interesting you noticed while browsing. Include a brief
   observation about each (layout, content density, any issues spotted).
6. **Output location:** where all files were saved (full path)

If anything looked wrong during extraction (unexpected content, possible
region-blocking, stale data, auth issues), call it out explicitly here.

---

## Authenticated Service Integration

Phase 2d above covers extracting cookies and CSRF tokens from the browser for use in curl — adequate for most authenticated scraping tasks. For skills that need to **repeatedly automate a service** across sessions (login flows, OTP handling, Valkey auth caching, CSRF refresh before writes, endpoint discovery), see `references/browser-auth.md` for the full Playwright-based pattern.

---

## Anti-Patterns — What Not to Do

- **Don't write complex browser automation to click through UI state.** If you need screenshots of different tabs or views, see if you can trigger them via URL parameters (e.g., `?date=2026-06-22` or `?category=shoes`). If not, capture the default view and move on. Don't burn 10 minutes debugging Playwright click selectors just for a screenshot.
- **Don't assume JS-rendered means browser-only.** Always check for embedded
  JSON in `data-*` attrs and script tags before giving up on curl.
- **Don't skip the canary.** Running a broken approach at scale wastes time and
  can get you rate-limited or blocked.
- **Don't browser-automate a list of N pages when curl works.** Once you have a
  URL pattern and a working HTTP approach, switch. Browser automation is a last
  resort for repetitive extraction, not a default.
- **Don't ignore auth.** A request that returns 200 but suspiciously thin content
  is often an auth problem in disguise.
- **Don't stop at the first 403 or thin response.** Check whether the browser
  session has cookies or headers you need to carry over, extract them, and retry.
- **Don't skip screenshots.** They're cheap to take and the downstream team will
  thank you.
