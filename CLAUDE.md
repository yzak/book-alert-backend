# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A serverless backend that crawls the Amazon Creators API weekly (via GitHub Actions) to find newly released Japanese tech books, then publishes them as JSON to GitHub Pages. There is no server, no database, and no local `.env` file — all secrets live in GitHub Actions secrets.

## Commands

```bash
# Install dependencies
npm install

# Run tests (Node.js built-in test runner, no external framework)
npm test

# Generate books.json (requires env vars below)
npm run build

# Run tests + generate a sample (validation before deployment)
npm run check
```

**Required env vars for `npm run build`:**
- `CREATORS_API_CLIENT_ID`
- `CREATORS_API_CLIENT_SECRET`
- `ASSOCIATE_TAG`

Optional: `CREATORS_API_TOKEN_URL`, `CREATORS_API_SEARCH_ITEMS_URL`, `CREATORS_API_SCOPE`, `CREATORS_API_MARKETPLACE`, `CREATORS_API_CREDENTIAL_VERSION`

**Run a single test** (Node.js v18+ `--test-name-pattern` flag):
```bash
node --test --test-name-pattern="normalizeBook" test/fetchBooks.test.js
```

## Architecture

```
GitHub Actions (weekly Sun 00:00 UTC or manual dispatch)
  → creatorsApiClient.js   OAuth2 client_credentials auth + SearchItems call
  → fetchBooks.js          Search, filter, deduplicate, tag
  → generateBooksJson.js   Write outputs, commit & push via Actions
  → GitHub Pages           Serves docs/books.json and docs/books-flat.json
```

**Output files committed to the repo:**
- `data/books.json` — internal copy
- `docs/books.json` — public (with `updatedAt`, `availableTags` metadata)
- `docs/books-flat.json` — legacy flat array format for older frontend

## Key Source Files

| File | Responsibility |
|------|---------------|
| `crawler/creatorsApiClient.js` | OAuth2 token fetch + SearchItems HTTP client |
| `crawler/fetchBooks.js` | All book processing logic (search, filter, normalize, dedup, tag) |
| `scripts/generateBooksJson.js` | Entry point; writes the three output files; accepts `--sample` flag |
| `config/searchConfig.js` | Loads `config/search-config.json` with safe defaults |
| `config/search-config.json` | All tunable parameters (keywords, tag rules, release window) |
| `test/fetchBooks.test.js` | Full unit + integration tests using Node.js `test` + `assert/strict` |

## Critical Implementation Details

### API Field Name Duality
The Creators API returns `camelCase` fields; the legacy PA-API 5.0 used `PascalCase`. Code handles both everywhere using `??`:
```js
item?.asin ?? item?.ASIN
item?.itemInfo?.title?.displayValue ?? item?.ItemInfo?.Title?.DisplayValue
```

### Deduplication Key
Books are deduplicated by:
```
canonicalizedTitle :: publisherLowercase :: releaseDate
```
Canonicalization strips full-width and ASCII parentheses, brackets, dashes, slashes, colons, and extra whitespace. When merging duplicates, tags are unioned and physical editions (non-`B0*` ASINs) are preferred over Kindle.

### Throttle Retry
HTTP 429 or `"ThrottleException"` in the response body triggers exponential backoff with delays `[2000, 5000, 10000]` ms. If some keywords succeed and others fail, the run continues (partial failure is tolerated). Only a total failure (all keywords fail) throws.

### Filtering Pipeline
1. Fetch books by each search keyword in `search-config.json`
2. Keep only items whose browse node names match `computerItCategoryKeywords`
3. Keep only items whose title/category contain at least one `filterKeywords` entry
4. Keep only items released within `releaseWindowDays` (default 30) of today
5. Sort by release date descending, cap at 200 books

### Tag Assignment
Tags are defined in `config/search-config.json` under `tagRules`. Each rule has `keywords` (matched against title + tags lowercased) and a `sortOrder`. A book can match multiple tags. The `general` tag (sortOrder 999) is the fallback.

### Date Normalization
Handles three formats from the API:
- ISO 8601: `2026-05-01`
- Japanese: `2026年5月1日`
- Slash-separated: `2026/05/01`

All normalized to `YYYY-MM-DD`.

## Configuration Tuning

To add a new search keyword: edit `searchKeywords` in `config/search-config.json`.
To add a new tag: add an entry to `tagRules` with `id`, `label`, `sortOrder`, and `keywords`.
To change the release window: edit `releaseWindowDays`.

## CI/CD

`.github/workflows/crawl.yml` runs on a weekly schedule. After `npm run build` it auto-commits and pushes any changes to `data/` and `docs/`. GitHub Pages is served from the `docs/` directory of the default branch.
