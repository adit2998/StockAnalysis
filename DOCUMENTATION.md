# DeepVal — Full Technical Documentation

This document provides exhaustive documentation of every component in the DeepVal stock analysis platform: architecture, data flows, every function in every file, Docker configuration, Kubernetes configuration, and debugging guidance.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Database Schema](#2-database-schema)
3. [Backend — Node.js API](#3-backend--nodejs-api)
   - [server.js](#31-serverjs)
   - [middleware/auth.js](#32-middlewareauthjs)
   - [utils/logger.js](#33-utilsloggerjs)
   - [routes/companies.js](#34-routescompaniesjs)
   - [routes/companyReports.js](#35-routescompanyreportsjs)
   - [routes/reportDetails.js](#36-routesreportdetailsjs)
   - [routes/financials.js](#37-routesfinancialsjs)
   - [routes/stockHistory.js](#38-routesstockhistoryjs)
   - [routes/news.js](#39-routesnewsjs)
   - [routes/auth.js](#310-routesauthjs)
   - [routes/users.js](#311-routesusersjs)
   - [routes/processing.js](#312-routesprocessingjs)
   - [routes/tierTemplates.js](#313-routestiertemplatesjs)
   - [routes/analyses.js](#314-routesanalysesjs)
   - [services/analysisService.js](#315-servicesanalysisservicejs)
   - [seed.js](#316-seedjs)
4. [Backend — Python Data Pipeline](#4-backend--python-data-pipeline)
   - [config.py](#41-configpy)
   - [sec_api_utils.py](#42-sec_api_utilspy)
   - [save_reports_info.py](#43-save_reports_infopy)
   - [create_dataframe.py](#44-create_dataframepy)
   - [extractors.py](#45-extractorspy)
   - [process_reports.py](#46-process_reportspy)
   - [company_processing_pipeline.py](#47-company_processing_pipelinepy)
   - [process_cli.py](#48-process_clipy)
5. [Frontend — React Application](#5-frontend--react-application)
   - [Application Entry and Routing](#51-application-entry-and-routing)
   - [AuthContext](#52-authcontext)
   - [Page Components (including AnalysisText.js)](#53-page-components)
   - [Company Page Tabs](#54-company-page-tabs)
   - [RequestModal and AdminProcessModal](#55-requestmodal-and-adminprocessmodal)
6. [Docker Configuration](#6-docker-configuration)
   - [Node Backend Dockerfile](#61-node-backend-dockerfile)
   - [Frontend Dockerfile](#62-frontend-dockerfile)
   - [docker-compose.yml](#63-docker-composeyml)
7. [Kubernetes Configuration](#7-kubernetes-configuration)
   - [MongoDB](#71-mongodb)
   - [Node API Server](#72-node-api-server)
   - [React Frontend](#73-react-frontend)
   - [Mongo Express](#74-mongo-express)
8. [Key Flows End-to-End](#8-key-flows-end-to-end)
   - [Authentication Flow](#81-authentication-flow)
   - [Company Data Ingestion Flow](#82-company-data-ingestion-flow)
   - [AI Analysis Creation Flow](#83-ai-analysis-creation-flow)
   - [Company Processing Request Flow](#84-company-processing-request-flow)
9. [Debugging and Troubleshooting](#9-debugging-and-troubleshooting)

---

## 1. Architecture Overview

DeepVal is a three-tier application:

```
┌─────────────────────────────────────────────────────────────┐
│                       USER BROWSER                          │
│               React SPA (port 3000)                         │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP (JWT in Authorization header)
┌────────────────────────▼────────────────────────────────────┐
│                  Node.js / Express API                       │
│                      (port 5001)                             │
│  Routes: companies, financials, analyses, auth, users,       │
│          stock, news, reports, tier-templates, processing    │
│  Services: analysisService (AI orchestration)               │
└──────┬────────────────────────────┬───────────────────────┬─┘
       │                            │                       │
       │ MongoDB driver          Anthropic SDK         Yahoo Finance
       │                         (Claude AI)           / Finnhub API
┌──────▼──────────┐
│   MongoDB 7     │
│  (port 27017)   │
│  GridFS for     │
│  PDF storage    │
└─────────────────┘
       ▲
       │ PyMongo
┌──────┴──────────────────────────────────────────────────────┐
│             Python Data Pipeline (offline)                   │
│  SEC EDGAR API → PDF download → text extraction → Claude AI  │
│  yfinance → financial statements                             │
└─────────────────────────────────────────────────────────────┘
```

The Python pipeline can be triggered in two ways: manually from the command line, or automatically via the Node API when a user or admin submits a processing request. In the latter case, the Node server spawns `process_cli.py` as a detached background subprocess. The Node API and React frontend are the live, user-facing services.

**Authentication**: Google OAuth 2.0 handles identity verification. After OAuth completes, the backend issues a JWT (valid 7 days) which the frontend stores and sends in every API request header.

**AI Analysis**: Analysis requests are accepted synchronously (the API responds immediately with `pending` status) and processed asynchronously in the background. The frontend polls for completion.

---

## 2. Database Schema

All data lives in a single MongoDB database (`stocks_data` by default). Here are all collections:

### `companies_list`
Basic company info. One document per company.
```json
{
  "_id": ObjectId,
  "name": "Apple Inc.",
  "ticker": "AAPL",
  "sic": "3571",
  "sicDescription": "Electronic Computers"
}
```

### `company_financials`
One document per XBRL metric per company. The `values` array holds all historical data points.
```json
{
  "_id": ObjectId,
  "id": "RevenueFromContractWithCustomerExcludingAssessedTax_AAPL",
  "ticker": "AAPL",
  "metric": "Revenue from Contract with Customer, Excluding Assessed Tax",
  "description": "Amount, excluding tax collected from customer...",
  "statement": "Income Statement",
  "values": [
    { "date": "2021-09-25", "value": 365817000000 },
    { "date": "2022-09-24", "value": 394328000000 }
  ]
}
```
The `id` field is `{xbrl_key}_{ticker}` for SEC metrics. For derived ratios (e.g., Gross Margin Ratio), the slug of the label is used.

### `reports_list`
Metadata about each filing (10-K, 10-Q, DEF 14A). One document per filing.
```json
{
  "_id": ObjectId,
  "id": "0000320193_0001193125-23-277131_aapl20230930_10k.htm",
  "Ticker": "AAPL",
  "Primary document": "aapl20230930_10k.htm",
  "Form Type": "10-K",
  "Filing date": "2023-11-03",
  "Report date": "2023-09-30",
  "File name": "AAPL_10-K_report_2023-11-03.pdf",
  "url": "https://www.sec.gov/Archives/edgar/data/..."
}
```

### `report_sections` (GridFS metadata in the fs.files collection handles PDFs)
Extracted raw text sections from a filing PDF. Keyed by `file_name`.
```json
{
  "_id": "AAPL_10-K_report_2023-11-03.pdf",
  "file_name": "AAPL_10-K_report_2023-11-03.pdf",
  "ticker": "AAPL",
  "sections": {
    "Business": "Apple Inc. designs, manufactures, and markets...",
    "Risk Factors": "The following risk factors...",
    "Management's Discussion and Analysis": "..."
  }
}
```

### `report_summaries`
Same structure as `report_sections` but each section text is a 3-paragraph Claude-generated summary.

### `generated_reports`
One document per AI analysis run. Status progresses: `pending` → `running` → `completed` | `failed`.
```json
{
  "_id": ObjectId,
  "userId": ObjectId,
  "ticker": "AAPL",
  "companyName": "Apple Inc.",
  "tierLevel": "3",
  "tierName": "Standard",
  "questions": ["What is the revenue trend?", "..."],
  "basePrompt": "You are a professional financial analyst...",
  "sources": {
    "filings": [{ "fileName": "AAPL_10-K_report_2023-11-03.pdf", "sections": null }],
    "reportPeriods": ["income_annual"]
  },
  "reportOptions": {
    "autoSuggestData": true,
    "showKeyFindings": true,
    "includeSourceCitations": true
  },
  "questionEmbeddedData": [
    [{ "id": "revenue_trend", "label": "Revenue trend", "icon": "trend" }],
    [{ "id": "gross_margin",  "label": "Gross margin trend", "icon": "trend" }]
  ],
  "status": "completed",
  "report": [
    {
      "q": "What is the revenue trend?",
      "key_findings": ["Revenue re-accelerated +6.4% in FY2025", "Growth is organic, not acquisition-driven"],
      "analysis": "## Revenue Trajectory\n\nTotal revenue...",
      "sources": ["Income Statement (Annual)", "MD&A section"]
    }
  ],
  "estimatedCostGBP": 0.0023,
  "actualCostGBP": 0.0019,
  "tokenUsage": { "inputTokens": 12400, "outputTokens": 850 },
  "error": null,
  "createdAt": "2026-06-01T10:00:00Z",
  "completedAt": "2026-06-01T10:00:45Z"
}
```

**`report` array shape — two formats:**
| Field | Present when | Description |
|---|---|---|
| `q` | always | The original question text |
| `key_findings` | `showKeyFindings: true` | 2–4 bullet-point highlights extracted by the model via tool use |
| `analysis` | `showKeyFindings: true` | Full markdown analysis text |
| `sources` | `showKeyFindings: true` | Filing sections / statements cited by the model |
| `a` | `showKeyFindings: false` | Legacy plain-text answer (no structure) |

`AnalysisReportPage` detects the format by checking for `item.key_findings` and renders accordingly. Both formats are supported simultaneously (old reports remain readable).

**`reportOptions` fields:**
| Field | Default | Effect |
|---|---|---|
| `autoSuggestData` | `true` | Frontend keyword-matches question text to chart chips |
| `showKeyFindings` | `true` | Backend uses Anthropic tool use; report has structured `key_findings`/`analysis`/`sources` |
| `includeSourceCitations` | `true` | Model is prompted to populate the `sources` array |

**`questionEmbeddedData`** is a parallel array to `questions` — each entry is a list of chart chip objects `{ id, label, icon }` that were attached to that question on the creation page. Stored so the report page can display them as read-only data tags next to each answer.

### `users`
One document per registered user.
```json
{
  "_id": ObjectId,
  "googleId": "118232...",
  "email": "user@gmail.com",
  "name": "Jane Smith",
  "isAdmin": false,
  "companies": ["AAPL", "MSFT"],
  "generated_reports": [ObjectId, ObjectId],
  "total_spend_gbp": 0.0423,
  "monthly_spend": [
    { "year": 2026, "month": 5, "amount": 0.0211 },
    { "year": 2026, "month": 6, "amount": 0.0212 }
  ]
}
```

`isAdmin` is set automatically during Google OAuth login by checking the user's email against the `ADMIN_EMAILS` environment variable (comma-separated list). It is updated on every login so adding or removing an admin takes effect on their next sign-in.

### `processing_requests`
One document per user-submitted company processing request. Used for deduplication (prevents the same company from being queued twice simultaneously).
```json
{
  "_id": ObjectId,
  "ticker": "CRWD",
  "name": "CrowdStrike Holdings, Inc.",
  "requestedBy": "userId_string",
  "requestType": "user",
  "status": "processing",
  "createdAt": "2026-06-09T10:00:00Z"
}
```

`requestType` is `"user"` for requests from the regular user flow. Admin-initiated "Queue for users" and "Process now" actions do not create a request document — they fire the pipeline directly.

### `income_statements`, `balance_sheets`, `cash_flow_statements`
One document per ticker per period type (annual or quarterly). Populated by yfinance via the Python pipeline. Each row carries both the raw dollar values and pre-computed common-sized percentages.
```json
{
  "_id": ObjectId,
  "ticker": "AAPL",
  "period_type": "annual",
  "fetched_at": "2026-06-01T10:00:00Z",
  "periods": ["2023-09-30", "2022-09-24", "2021-09-25", "2020-09-26"],
  "rows": [
    {
      "label": "Total Revenue",
      "values": {
        "2023-09-30": 383285000000,
        "2022-09-24": 394328000000
      },
      "common_sized_values": {
        "2023-09-30": 100.0,
        "2022-09-24": 100.0
      }
    },
    {
      "label": "Net Income",
      "values": {
        "2023-09-30": 96995000000,
        "2022-09-24": 99803000000
      },
      "common_sized_values": {
        "2023-09-30": 25.3,
        "2022-09-24": 25.3
      }
    }
  ]
}
```

**Common-sizing denominators by collection:**
| Collection | Denominator row | Display label |
|---|---|---|
| `income_statements` | `Total Revenue` (within same df) | Revenue |
| `balance_sheets` | `Total Assets` (within same df) | Total Assets |
| `cash_flow_statements` | `Total Revenue` (from income statement df) | Revenue |

`common_sized_values` is `null` for a period if the denominator is zero, missing, or NaN for that period. Rows with no non-null common-sized values are omitted from the `%` view in the UI.

### `stock_quotes`
Daily-cached stock quote. One document per ticker.
```json
{
  "ticker": "AAPL",
  "price": 213.45,
  "change": 1.23,
  "changePercent": 0.58,
  "marketCap": 3290000000000,
  "exchange": "NASDAQ",
  "updatedAt": "2026-06-06T14:30:00Z"
}
```

### GridFS (`fs.files` + `fs.chunks`)
MongoDB GridFS stores raw filing PDFs. Each file has metadata:
```json
{
  "filename": "AAPL_10-K_report_2023-11-03.pdf",
  "metadata": {
    "ticker": "AAPL",
    "primary_document": "aapl20230930_10k.htm",
    "form_type": "10-K",
    "filing_date": "2023-11-03",
    "reporting_date": "2023-09-30",
    "source_url": "https://www.sec.gov/Archives/edgar/data/..."
  }
}
```

---

## 3. Backend — Node.js API

### 3.1 `server.js`

Entry point. Connects to MongoDB then sets up Express middleware and routes.

**`startServer()`**
The single async function that bootstraps everything:
1. Connects to MongoDB using the `MONGO_URI` env var via the official `mongodb` driver.
2. Registers the Google OAuth Passport strategy.
3. Registers all route handlers, each receiving the `db` instance.
4. Starts listening on `PORT` (default 5001).

**Google OAuth Strategy setup (inside `startServer`)**
On every OAuth login:
- Searches `users` collection for `{ googleId: profile.id }`.
- If found: updates `email`, `name`, and `isAdmin` (recalculated on every login from `ADMIN_EMAILS`).
- If not found: creates a new user document with empty `companies`, `generated_reports`, zero spend.
- Uses MongoDB `upsert: true` + `returnDocument: 'after'` to do this atomically.

**Admin detection:**
The `ADMIN_EMAILS` environment variable holds a comma-separated list of email addresses with admin privileges (e.g. `ADMIN_EMAILS=adit.kotwal29@gmail.com`). During the OAuth strategy, the logged-in user's email is compared (case-insensitively) against this list. The result is stored as `isAdmin: true/false` in the user document and is subsequently baked into the JWT and returned by `/api/users/me`.

**Session handling note**
Express sessions are configured (`express-session`) but are only used during the OAuth redirect handshake (the 2-step browser redirect to Google and back). After that, all authentication is stateless via JWT. The session is not used for anything else.

**`passport.serializeUser` / `passport.deserializeUser`**
These are required by Passport for the session-based OAuth handshake:
- `serializeUser`: stores only the `_id` string in the session (keeps it small).
- `deserializeUser`: reconstructs a minimal user object `{ _id: ObjectId }` for use by the auth callback route.

---

### 3.2 `middleware/auth.js`

JWT authentication middleware. Applied to all protected routes.

**How it works:**
1. Reads the `Authorization` header.
2. Expects the format `Bearer <token>`.
3. Verifies the token with `jwt.verify` using `JWT_SECRET`.
4. On success: attaches `req.user` (containing `userId` and `email`) and calls `next()`.
5. On failure: returns `401 Unauthorized`.

This middleware is imported and applied per-router in routes that need authentication (`analyses.js`, `users.js`). Routes that don't require auth (companies, financials, stock data) do not apply it.

---

### 3.3 `utils/logger.js`

Winston logger with daily log rotation.

**Transports:**
- **Console**: colorized, human-readable format with timestamps.
- **`combined-YYYY-MM-DD.log`**: all log levels in JSON format, rotates daily, keeps 14 days, max 20MB per file.
- **`error-YYYY-MM-DD.log`**: error-level only, keeps 30 days.

**Log level** is controlled by the `LOG_LEVEL` env var (default: `info`).

**Usage in routes/services:**
```javascript
const logger = require('./utils/logger');
logger.info('Message', { key: 'value' });    // structured JSON metadata
logger.error('Failed', { error: err.message, stack: err.stack });
logger.warn('Skipping item', { id: 'xyz' });
```

**Log location:** `Backend/node-backend/logs/`

---

### 3.4 `routes/companies.js`

Company search and data endpoints. Does not require authentication.

**`GET /api/companies/search/external?q=<query>`**
Searches Yahoo Finance for companies not yet in the corpus. Used alongside the internal search to surface tickers the user can *request* processing for.
- Uses the `yahoo-finance2` v3 package (instantiated as `new YahooFinance()`).
- Calls `yahooFinance.search(q, { quotesCount: 8, newsCount: 0 }, { validateResult: false })`.
  - `validateResult: false` bypasses the library's schema validation, which can fail when Yahoo Finance changes field casing (e.g. `'Equity'` vs `'equity'`).
- Filters to US-listed equities only using the `US_EXCHANGES` set: `NMS`, `NYQ`, `NGM`, `NCM`, `ASE`, `PCX`, `OTC`, `BATS`. This prevents the same company appearing multiple times for foreign exchange listings (e.g. CRWD on NASDAQ plus MTE.F on Frankfurt).
- Returns `[{ ticker, name, industry }]`. The `industry` field is shown in the search dropdown below the company name.

> Registered as `/search/external` **before** `/:ticker` to prevent "search" or "external" being treated as ticker symbols.

**`GET /api/companies/search?q=<query>`**
- Input: `q` query string (ticker or company name).
- Escapes special regex characters from the input to prevent regex injection.
- Runs a case-insensitive regex search against both `ticker` and `name` fields in `companies_list` (i.e. only companies already in the corpus).
- Returns up to 10 matching documents.
- Returns `[]` if `q` is empty.

> The `/search` route is registered **before** `/:ticker` to prevent the literal string "search" being misinterpreted as a ticker symbol.

**`GET /api/companies`**
Returns all documents from `companies_list`. Used for the company browser.

**`GET /api/companies/:ticker`**
Looks up a single company by ticker (case-insensitive via `.toUpperCase()`). Returns 404 if not found.

**`GET /api/companies/:ticker/description`**
Fetches the "Business" section text to use as the company description on the Overview tab.
- First tries `report_summaries` (AI-summarized version), falling back to raw `report_sections`.
- Filters for 10-K filings only (most recent first).
- Returns `{ description: null }` if no data exists rather than 404, so the frontend can handle the empty state gracefully.

---

### 3.5 `routes/companyReports.js`

Filing list endpoints. Does not require authentication.

**`GET /api/company-reports`**
Returns all documents from `reports_list`. Not paginated — intended for admin use.

**`GET /api/company-reports/:ticker`**
Returns all filings for a specific company. Case-insensitive ticker matching. Returns 404 if none found.

**`GET /api/company-reports/:ticker/:formType`**
Returns filings filtered by form type for a company (e.g., `10-K`, `10-Q`, `DEF%2014A`).
- `formType` in the URL is URL-encoded; `decodeURIComponent` handles spaces in "DEF 14A".
- Results are sorted newest-first by `Filing date`.

---

### 3.6 `routes/reportDetails.js`

Returns the sections of a specific filing by its filename.

**`GET /api/report-details/:fileName`**
- The `fileName` path param is URL-decoded (filenames contain dashes, underscores, and spaces).
- First checks `report_summaries` (AI-summarized). Falls back to `report_sections` (raw extracted text).
- Returns 404 if neither collection has the document.
- The `_id` in both collections is the filename string itself, so it's a direct lookup by `_id`.

---

### 3.7 `routes/financials.js`

Financial metrics and statements. Does not require authentication.

**`sortValues(values)`** (helper)
Sorts an array of `{ date, value }` objects chronologically by date. Used to normalize data from MongoDB, which doesn't guarantee insertion order.

**`GET /api/financials/:ticker/trends`**
Returns the top 9 most data-rich metrics for each of the three statement types.
- Uses a MongoDB aggregation: `$addFields` computes `valueCount = size of values array`, then `$sort` by that count descending, `$limit 9`.
- Returns an object keyed by statement name: `{ 'Income Statement': [...], 'Balance Sheet': [...], 'Cash Flow': [...] }`.
- Used by the Trends tab to show the most complete metrics first.

**`GET /api/financials/:ticker/trends/:xbrlKey`**
Returns a single metric by its full compound ID (`{xbrlKey}_{ticker}`).
- Looks up `company_financials` collection by the `id` field.
- Returns 404 if not found.
- Used when the user drills into a specific metric from the Trends tab.

**`GET /api/financials/:ticker/statements?statement=income&period=annual`**
Returns a full financial statement (income, balance sheet, or cash flow) for a given period.
- `statement` parameter maps to a collection name: `income` → `income_statements`, etc.
- `period` is `annual` or `quarterly`.
- Returns the full document as fetched from yfinance via the Python pipeline.

**`GET /api/financials/:ticker`**
Returns the first 5 metrics for a ticker. Legacy endpoint used by older parts of the UI. Not the primary data source.

---

### 3.8 `routes/stockHistory.js`

Real-time and historical stock price data via Yahoo Finance.

**`isCachedToday(updatedAt)`** (helper)
Returns `true` if `updatedAt` is from today (compares year, month, day). Used to avoid redundant API calls for the same-day quote.

**`GET /api/stock/:ticker/quote`**
Returns real-time stock quote data.
- First checks `stock_quotes` collection for a same-day cached entry.
- On cache hit: returns the cached document.
- On cache miss: calls `yahooFinance.quote(ticker)`, extracts price/change/marketCap, upserts into `stock_quotes`, and returns the fresh data.
- Returns 502 if Yahoo Finance call fails.

**`GET /api/stock/:ticker/history?period=1y`**
Returns historical OHLCV data for the given period.
- `period` is one of: `1m`, `3m`, `6m`, `1y`, `2y`, `5y` (default `1y`).
- `PERIOD_MONTHS` maps each period code to a month count.
- Calls `yahooFinance.historical()` with a computed date range and `interval: '1d'`.
- Returns an array of `{ date, open, high, low, close, volume }` objects.
- Date is formatted as `YYYY-MM-DD` by splitting the ISO string at `T`.
- Returns 502 if the Yahoo Finance call fails.

---

### 3.9 `routes/news.js`

Company news via Finnhub API.

**`GET /api/news/:ticker/news?limit=20`**
- Constructs a 30-day date range from today.
- Calls the Finnhub company-news API: `https://finnhub.io/api/v1/company-news?symbol=...&from=...&to=...&token=...`
- Returns 500 if `FINNHUB_API_KEY` is missing from env vars.
- Returns 502 if the Finnhub request fails.
- Maps Finnhub's response fields to a cleaner shape: `{ id, title, url, publisher, publishedAt, thumbnail, summary }`.
- Truncates to the `limit` parameter (default 20, max dictated by the caller).

---

### 3.10 `routes/auth.js`

Google OAuth 2.0 authentication flow.

**`GET /api/auth/google`**
Step 1: Redirects the browser to Google's OAuth consent page. Passport requests `profile` and `email` scopes, which gives access to the user's name and email address.

**`GET /api/auth/google/callback`**
Step 2: Google redirects back here after the user consents.
- Passport's `authenticate` middleware intercepts the code, exchanges it with Google for a user profile, and runs the Google Strategy function defined in `server.js` (which upserts the user in MongoDB).
- On failure: redirects to `FRONTEND_URL/login?error=auth_failed`.
- On success: generates a JWT signed with `JWT_SECRET`, valid for 7 days. The payload is `{ userId, email, isAdmin }`.
- Redirects the browser to `FRONTEND_URL/auth/callback?token=<jwt>`. The React frontend reads the token from the URL, stores it, and proceeds.

`isAdmin` is baked into the JWT at login time from the user's MongoDB document (which was just upserted by the OAuth strategy). This means the auth middleware can check admin status on every request without a DB lookup.

---

### 3.11 `routes/users.js`

User profile and company watchlist management. All routes require authentication.

**`GET /api/users/me`**
Returns the current user's profile including their saved companies.
- Fetches the user document (projected to `_id`, `email`, `name`, `companies`, `total_spend_gbp`, `isAdmin`).
- Resolves the list of tickers in `companies` to full company objects from `companies_list`.
- Returns both in a combined response, including the `isAdmin` flag which the frontend uses to show/hide admin-only UI.

**`GET /api/users/stats`**
Returns aggregated stats for the profile page dashboard.
- Runs two queries in parallel (`Promise.all`): the user doc (for spend data) and all their analyses (for count and timing).
- Computes `analysesThisMonth` by filtering `allAnalyses` for the current month.
- Builds a `last6` array of 6 months of spending by walking backwards from the current month and looking up entries in the stored `monthly_spend` array.
- Returns `totalAnalyses`, `analysesThisMonth`, `totalSpendGBP`, `currentMonthSpendGBP`, `monthlyBudgetGBP` (hardcoded 20), and the `monthlySpend` breakdown.

**`POST /api/users/companies/:ticker`**
Adds a company ticker to the user's `companies` array.
- Verifies the company exists in `companies_list` first (returns 404 if not).
- Uses `$addToSet` to prevent duplicate entries in the array.

**`DELETE /api/users/companies/:ticker`**
Removes a ticker from the user's `companies` array using `$pull`.

---

### 3.12 `routes/processing.js`

Company processing pipeline trigger endpoints. All routes require authentication.

The Node.js backend does not run Python directly — it spawns `process_cli.py` as a **detached background subprocess** using Node's `child_process.spawn`. The subprocess runs independently; the HTTP response is returned immediately without waiting for processing to complete.

**`spawnPipeline(params)`** (internal helper)
- Creates a timestamped log file at `logs/processing/<TICKER>-<timestamp>.log` (directory controlled by `PROCESSING_LOG_DIR` env var, defaulting to `Backend/node-backend/logs/processing/`).
- Spawns `python3 process_cli.py '<json_params>'` with `cwd` set to the `info-processing/` directory (configurable via `PYTHON_PIPELINE_DIR` env var).
- Both stdout and stderr are redirected to the log file (`stdio: ['ignore', out, out]`).
- Calls `proc.unref()` so the Node process can exit independently of the child.
- Returns `{ proc, logFile }`. The `logFile` path is included in API responses so it can be used for `tail -f` monitoring.

**`POST /api/processing/request`** — any authenticated user
Queues a company for basic processing (no AI summarisation).
- Reads `{ ticker, name, include10K, include10Q, includeProxy }` from request body. Form type flags default to `include10K: true`, `include10Q: false`, `includeProxy: false`.
- Deduplication: rejects (409) if the ticker is already in `companies_list`, returns `{ alreadyQueued: true }` if there's already a `pending`/`processing` request for that ticker.
- Inserts a document into `processing_requests` with `status: 'processing'` and `requestType: 'user'`.
- Calls `spawnPipeline` with all `summarize*` flags `false` (fetch and chunk only, no Claude calls).
- Returns `{ success: true, logFile }`.

**`POST /api/processing/process`** — admin only (`req.user.isAdmin` must be true)
Processes a company immediately with full summarisation control.
- Reads `{ ticker, name, include10K, include10Q, includeProxy, summarize10K, num10KSummaries, summarize10Q, num10QSummaries, summarizeProxy, numProxySummaries }`.
- Calls `spawnPipeline` passing all settings through. Per-type summarisation counts are forwarded to `process_cli.py`.
- Returns `{ success: true, logFile }`.

**`POST /api/processing/queue`** — admin only
Ingests a company without summarisation and without logging a `processing_requests` record. Intended for batch-adding companies to the corpus ahead of user demand.
- Reads `{ ticker, name, include10K, include10Q, includeProxy }`.
- Calls `spawnPipeline` with all `summarize*` flags `false`.
- Returns `{ success: true, logFile }`.

**Environment variables:**
| Variable | Default | Purpose |
|---|---|---|
| `PYTHON_PIPELINE_DIR` | `../../info-processing` (relative to routes/) | Directory containing `process_cli.py` |
| `PYTHON_CMD` | `python3` | Python executable name |
| `PROCESSING_LOG_DIR` | `../logs/processing` (relative to routes/) | Where per-run log files are written |

---

### 3.13 `routes/tierTemplates.js`

Returns the analysis tier configuration from `data/tierTemplates.json`. This is a simple read of a static JSON file — no database involved.

**`GET /api/tier-templates`**
Returns all 5 tier definitions. Each tier has `id`, `name`, `description`, `basePrompt`, and `questions`.

The 5 tiers from least to most comprehensive:
1. **Quick Scan** — Health check: profitability, balance sheet, cash, red flags, capital allocation
2. **Overview** — Business model, 2-3 year trends, earnings quality, risks
3. **Standard** — Full 3-5 year financials, segment breakdown, ROIC, working capital, valuation
4. **Deep Dive** — Forensic earnings quality, balance sheet red flags, moat, management incentives
5. **Full Research** — Institutional-grade with DCF, bull/base/bear cases, synthesis

---

### 3.14 `routes/analyses.js`

AI analysis management. All routes require authentication.

**Constants:**
- `MAX_SELECTIONS = 5`: Maximum number of filing sections + financial statement periods a user can select.
- `MAX_COST_GBP = 0.50`: Hard cap on estimated cost per analysis call.

**`countSelections(sources)`** (helper)
Counts the total number of source selections in a request payload.
- A whole filing (where `sections === null`) counts as 1.
- Each individual selected section counts as 1.
- Each financial statement period (e.g., `income_annual`) counts as 1.
- Total = sum of filing selections + count of reportPeriods.

**`POST /api/analyses/estimate`**
Returns a cost estimate without creating an analysis. Useful for the "preview cost" step in the UI.
- Requires `ticker` and `sources` in the request body.
- Calls `estimateCost()` from `analysisService.js`.
- Returns `{ estimatedCostGBP, inputTokensEstimate, outputTokensEstimate, sourceChars }`.

**`GET /api/analyses/user?ticker=`**
Returns all analyses for the authenticated user, newest first.
- Excludes the full `report` field to keep responses lightweight.
- Optionally filters by `ticker` query param.
- The `userId` comes from `req.user.userId` (set by the auth middleware from the JWT).

**`GET /api/analyses/:id`**
Returns a single analysis including the full `report` (Q&A array).
- Enforces ownership: the query includes both `_id` and `userId`, so users cannot access each other's analyses.
- Returns 400 for an invalid ObjectId format, 404 if not found.

**`POST /api/analyses`**
Creates a new analysis and kicks off async processing.

**Request body fields:**
| Field | Required | Description |
|---|---|---|
| `ticker` | Yes | Stock ticker symbol |
| `questions` | Yes | Array of question strings |
| `sources` | Yes | `{ filings, reportPeriods }` object |
| `companyName` | No | Display name (falls back to ticker) |
| `tierLevel` | No | Tier number or `'custom'` |
| `tierName` | No | Display name for the tier |
| `basePrompt` | No | Tier's system prompt prefix |
| `reportOptions` | No | `{ autoSuggestData, showKeyFindings, includeSourceCitations }` (defaults to `{}`) |
| `questionEmbeddedData` | No | Parallel array of chip arrays per question (defaults to `[]`) |

**Processing steps:**
1. Validates required fields (`ticker`, `questions`, `sources`).
2. Validates `countSelections` ≤ `MAX_SELECTIONS`.
3. Calls `estimateCost()` and rejects if estimated cost exceeds `MAX_COST_GBP`.
4. Inserts a new document into `generated_reports` with `status: 'pending'`, storing `reportOptions` and `questionEmbeddedData` alongside the other fields.
5. Links the analysis ID to the user's `generated_reports` array (`$addToSet`).
6. Uses `setImmediate()` to fire off `runAnalysis()` in the background **after** the HTTP response is sent. Passes `reportOptions` as the final argument.
7. Responds immediately with `{ analysisId, status: 'pending', estimatedCostGBP }`.

The `setImmediate` pattern means the response goes back to the client in milliseconds, regardless of how long the analysis takes (typically 30-60 seconds). The frontend then polls `GET /api/analyses/:id` for status changes.

---

### 3.15 `services/analysisService.js`

The core AI analysis orchestration layer. Contains the business logic for cost estimation and running analyses.

**Constants:**
- `INPUT_COST_PER_M_USD = 3.00` — claude-sonnet-4-6 input token price per million tokens.
- `OUTPUT_COST_PER_M_USD = 15.00` — output token price per million tokens.
- `USD_TO_GBP` — conversion rate, read from `USD_TO_GBP_RATE` env var (default 0.79).
- `STATEMENT_MAP` — maps short keys (`income`, `balance`, `cashflow`) to their MongoDB collection names and display labels.

**`ANSWER_ALL_QUESTIONS_TOOL`**
An Anthropic tool definition used in the structured ("tool use") mode. The tool is named `answer_all_questions` and has a single `answers` array property. Each element of the array must have:
- `key_findings` — array of 2–4 concise bullet strings
- `analysis` — full markdown analysis text (uses `**bold**`, `## headings`, `| table |` syntax)
- `sources` — array of filing section / statement names

The model is instructed to call this tool **exactly once** with all N answers in order. This avoids the bug where `tool_choice: 'any'` only guarantees at least one call — with a single tool that takes an array, the model fills all answers in one call.

**`charsToTokens(charCount)`**
Converts a character count to an approximate token count using the standard ratio of 1 token ≈ 4 characters.

**`calcCostGBP(inputTokens, outputTokens)`**
Calculates cost in GBP from token counts.
Formula: `((inputTokens / 1_000_000) * INPUT_COST + (outputTokens / 1_000_000) * OUTPUT_COST) * USD_TO_GBP`
Returns a float rounded to 6 decimal places.

**`fetchSourceContent(db, ticker, sources)`**
Fetches the actual text content for an analysis.
- For each filing in `sources.filings`:
  - Tries `report_summaries` first (AI-summarized, shorter). Falls back to `report_sections` (raw, longer).
  - If `sections === null`: includes all sections from the document.
  - If `sections` is an array: includes only the listed section names.
  - Each section is formatted as `=== Section Name ===\n<content>`.
- For each period in `sources.reportPeriods` (e.g., `income_annual`):
  - Splits the key into statement type and period type.
  - Looks up the matching collection using `STATEMENT_MAP`.
  - Formats the statement as `=== Income Statement (Annual) ===\n<JSON>`.
- Returns all parts joined with double newlines.
- Logs warnings for any filings where no content is found (rather than throwing).

**`getSourceCharCounts(db, ticker, sources)`**
A lightweight version of `fetchSourceContent` that counts characters without loading full content. Used for pre-flight cost estimation.
- Loads documents but only sums `content.length` values.
- Financial statements use a flat estimate of 15,000 characters each (avoids loading full JSON for estimation).

**`estimateCost(db, ticker, sources, questions)`**
Calculates an estimated cost before committing to running an analysis.
- Gets source character counts via `getSourceCharCounts`.
- Adds 2,000 tokens for prompt overhead (system prompt, boilerplate).
- Estimates output tokens as `questions.length * 500` (500 tokens per answer).
- Returns `{ estimatedCostGBP, inputTokensEstimate, outputTokensEstimate, sourceChars }`.

**`runAnalysis(db, analysisId, userId, ticker, companyName, tierName, questions, basePrompt, sources, reportOptions)`**
The main async analysis runner. Called fire-and-forget from the API route. Extracts `showKeyFindings` from `reportOptions` (defaults `false`) and branches into two modes.

**Tool use mode (`showKeyFindings: true`):**
1. Updates status to `running`.
2. Fetches source content via `fetchSourceContent`.
3. Builds a system prompt from `basePrompt` plus injected instructions: "call `answer_all_questions` exactly once with all N answers in the answers array".
4. Builds the user message: company identifier, source data block, numbered questions.
5. Calls `anthropic.messages.create()` with `tools: [ANSWER_ALL_QUESTIONS_TOOL]` and `tool_choice: { type: 'any' }`.
6. Finds the `tool_use` block named `answer_all_questions` in the response content.
7. Throws if the block is missing (model failed to call the tool).
8. Maps `toolBlock.input.answers` back to questions — each report item is `{ q, key_findings, analysis, sources }`.
9. Saves the structured report to MongoDB.

**Legacy mode (`showKeyFindings: false`):**
1. Same steps 1–4, but the system prompt instructs the model to return a plain JSON array.
2. Calls `anthropic.messages.create()` without tools.
3. Strips any markdown code fences from the response text.
4. Parses the cleaned text as a JSON array; each item is `{ q, a }`.
5. Saves the legacy report to MongoDB.

**Shared post-call steps (both modes):**
- Calculates `actualCostGBP` from `response.usage`.
- Updates `generated_reports` with `status: 'completed'`, the `report` array, actual cost, token usage, and `completedAt`.
- Increments `total_spend_gbp` on the user document.
- Updates or inserts the current month's entry in `monthly_spend` (checks year+month, either increments existing or pushes a new entry).
- On any error: sets `status: 'failed'` and stores `error` message in the document.

---

### 3.16 `seed.js`

One-shot script for populating the `tier_templates` collection in MongoDB. Run manually whenever the tier definitions in `data/tierTemplates.json` change and need to be pushed to the database.

**Usage:**

From outside the cluster (requires an active `kubectl port-forward svc/mongo 27017:27017`):
```bash
cd Backend/node-backend
MONGO_URI=mongodb://admin:secret@localhost:27017/stocks_data?authSource=admin node seed.js
```

Inside Docker Compose (where the `mongo` hostname resolves):
```bash
docker exec -it stockanalysis-server node seed.js
```

**What it does:**
1. Loads env vars via `dotenv-flow` (`.env`, then `.env.local` as override). The `MONGO_URI` inline override shown above takes precedence over both.
2. Reads all tier template objects from `data/tierTemplates.json`.
3. Connects to MongoDB and targets the `tier_templates` collection.
4. For each template, calls `updateOne` with `upsert: true`, matching on the `tier` field. This makes the script idempotent — running it multiple times is safe.
5. Closes the connection and exits.

**When to run:**
- On first cluster setup, before the app is used (the `GET /api/tier-templates` route falls back to the JSON file if the collection is empty, but seeding is needed for the DB to be the authoritative source).
- After any edits to `data/tierTemplates.json`.

**Note:** The `MONGO_URI` in `.env.local` (`mongodb://localhost:27017`) has no credentials and will fail against the authenticated cluster instance. Always pass the full URI with credentials as an inline env var when running against Minikube or Docker.

---

## 4. Backend — Python Data Pipeline

### 4.1 `config.py`

Minimal configuration loader.

**Logic:**
- If the `ENV` environment variable equals `'local'`, loads from `.env.local`.
- Otherwise loads from `.env`.
- Exports `mongo_uri` and `db_name` for use by other modules.

This allows running the pipeline locally against a local MongoDB (`ENV=local`) while the same code connects to Kubernetes/Docker MongoDB in production (no `ENV` variable set).

---

### 4.2 `sec_api_utils.py`

All interactions with the SEC EDGAR API. The `User-Agent` header is required by SEC to identify the caller.

**`FormType` (Enum)**
String enum with three values:
- `TEN_K = "10-K"` — Annual report
- `TEN_Q = "10-Q"` — Quarterly report
- `DEF_14A = "DEF 14A"` — Proxy statement

**`getCIKNumber(ticker, headers)`**
Converts a ticker symbol to a SEC CIK (Central Index Key) number.
- Fetches `https://www.sec.gov/files/company_tickers.json` — a mapping of all tickers to CIKs.
- Normalizes the ticker by uppercasing and replacing `.` with `-` (for tickers like `BRK.B`).
- Zero-pads the CIK to 10 digits (SEC requires this format).
- Raises `ValueError` if the ticker is not found.

**`getCompanyInfo(ticker, headers)`**
Returns the full company JSON from SEC's submissions API (`/submissions/CIK{cik}.json`). Contains name, SIC code, SIC description, filings history, and more.

**`getSubmissionData(ticker, headers)`**
Returns recent filings as a Pandas DataFrame. This is the raw list of all filings (all form types) for a company.

**`getFilteredFilings(ticker, form, headers)`**
Filters the submission DataFrame for a specific form type (`ten_k` or `ten_q`). Returns a Series indexed by `reportDate` containing accession numbers. Used by `getAnnualFacts` and `getQuarterlyFacts`.

**`getFacts(ticker, headers)`**
Returns the full XBRL facts JSON for a company from `https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json`. This is a large JSON containing every financial metric ever reported, with all historical values.

**`getFactsDF(ticker, headers)`**
Converts the XBRL facts JSON into a flat Pandas DataFrame.
- Iterates over every fact in `us-gaap`, creates a row for each value entry.
- Converts `end` and `start` dates to datetime.
- Drops duplicates by `(fact, end, val)`.
- Sets `end` as the index.
- Also returns a `labels_dict` mapping XBRL key names to human-readable labels.

**`getAnnualFacts(ticker, headers)`**
Filters the facts DataFrame to annual 10-K data only.
- Cross-references with accession numbers from 10-K filings.
- Pivots into a wide format: rows = facts, columns = reporting dates.
- Renames columns using the labels dictionary.
- Returns the transposed DataFrame.

**`getQuarterlyFacts(ticker, headers)`**
Same as `getAnnualFacts` but for 10-Q data.
- Deduplicates per `(fact, end)` keeping the last entry (handles amendment filings).

**`getHistoricalData(ticker)`**
Combines quarterly and annual DataFrames into a single merged DataFrame sorted by date column. Used as input to the ratio calculation in `create_dataframe.py`.

---

### 4.3 `save_reports_info.py`

Functions for fetching filing URLs and storing PDFs.

**`get_latest_form_url(cik, requestedForm)`**
Returns the URL for the most recent filing of the given form type. Iterates through SEC's recent filings list and stops at the first match. The URL is constructed as:
`https://www.sec.gov/Archives/edgar/data/{cik}/{accession_number_no_dashes}/{primary_document}`

**`get_all_form_urls(ticker, requestedForm)`**
Returns a list of all filings of the given form type for the ticker. Each entry is a dict with:
- `id`: unique key `{cik}_{accessionNumber}_{primaryDocument}`
- `Ticker`, `Primary document`, `Form Type`, `Filing date`, `Report date`
- `File name`: standard name `{ticker}_{formType}_report_{filingDate}.pdf`
- `url`: direct link to the primary document HTML on SEC.gov

**`save_form(ticker, formType, url)`** (legacy)
Saves a PDF to a local `Reports/` folder. Superseded by `save_pdf_to_mongo` for the current pipeline.

**`save_pdf_to_mongo(ticker, formType, url)`** (legacy)
Earlier version of PDF storage, now superseded by `save_report_pdfs` in the pipeline.

**`retrieve_pdf_from_mongo(filename, local_path)`**
Retrieves a stored PDF from GridFS and writes it to a local file path. Useful for debugging or manual extraction.

---

### 4.4 `create_dataframe.py`

Calculates derived financial ratios from raw XBRL data.

**`addColumns(df, ratioDictionary)`**
Generic helper that adds calculated columns to a DataFrame.
- `ratioDictionary`: keys are column names, values are tuples of `(required_columns, lambda)`.
- Skips any ratio where the required columns are not present in the DataFrame (logs a warning).
- Applies each lambda to compute the new column.

**`calculateRatios(dataDf)`**
Computes 20 standard financial ratios from the raw XBRL DataFrame.
- Handles revenue column name changes over SEC XBRL history: creates an `Effective Revenue` column that bridges the old `Revenue, Net (Deprecated 2018-01-31)` and the current `Revenue from Contract with Customer, Excluding Assessed Tax` names.

Ratios calculated:
| Ratio | Formula |
|---|---|
| Gross Margin | Gross Profit / Revenue |
| Operating Margin | Operating Income / Revenue |
| Net Profit Margin | Net Income / Revenue |
| Return on Assets | Net Income / Total Assets |
| Return on Equity | Net Income / Stockholders' Equity |
| Current Ratio | Current Assets / Current Liabilities |
| Quick Ratio | (Current Assets - Inventory) / Current Liabilities |
| Cash Ratio | Cash / Current Liabilities |
| Debt to Equity | Total Liabilities / Equity |
| Debt to Assets | Total Liabilities / Total Assets |
| Interest Coverage | Operating Income / Interest Expense |
| Equity Ratio | Equity / Total Assets |
| Asset Turnover | Revenue / Total Assets |
| Inventory Turnover | COGS / Inventory |
| Receivables Turnover | Revenue / Accounts Receivable |
| Days Sales Outstanding | 365 / Receivables Turnover |
| Days Inventory Outstanding | 365 / Inventory Turnover |
| Payables Turnover | COGS / Accounts Payable |
| Operating Cash Flow Ratio | Operating Cash Flow / Total Liabilities |
| CapEx Coverage | Operating Cash Flow / CapEx Payments |

**`makeCompanyDataframe(ticker)`**
Orchestrates the full data retrieval and ratio calculation:
1. Calls `getHistoricalData(ticker)` to get all XBRL facts.
2. Passes to `calculateRatios` to add derived ratios.
3. Converts column names (dates) to strings.
4. Converts any Timestamp cells to strings.
5. Resets the index to make the fact names a regular column.
Returns a DataFrame ready for MongoDB insertion.

---

### 4.5 `extractors.py`

PDF text extraction for all three filing types. The most complex module in the codebase.

#### Shared Helpers

**`_open_document_from_mongo(mongo_uri, db_name, filename)`**
Retrieves a PDF from MongoDB GridFS and opens it with PyMuPDF (`fitz`). Used by both the 10-K/10-Q and DEF 14A extractors.

**`_stripped_lines(text)`**
Splits text into lines and strips whitespace from each. Simple utility used across TOC parsing functions.

#### 10-K / 10-Q Extraction

The strategy for 10-K/10-Q PDFs:
1. Find the Table of Contents (TOC) page.
2. Parse TOC entries to get section labels, titles, and page references.
3. Resolve page references by scanning for actual section headings in the PDF.
4. Extract text page-by-page for each section, cleaning artifacts.

**`_detect_recurring_headers(document, scan_pages, threshold)`**
Scans the first N pages (default 30) to detect company-specific headers (like "Alphabet Inc." or "Annual Report 2023") that repeat on every page. Any line appearing on ≥40% of scanned pages is considered a recurring header and will be stripped during extraction.

**`_clean_10k_page_text(text, extra_strip)`**
Strips boilerplate lines from extracted page text:
- Lines matching `_10K_ARTIFACT_LINE`: "Table of Contents", form headers, date stamps.
- Lines in `extra_strip` (recurring company headers detected above).
- Bare page numbers (digits-only lines), **except** when preceded by "ITEM" (Strategy C: some filings put the item number alone on a line then the page number).

**`_trim_to_heading(page_text, label_bare)`**
Given a page's full text and a section label (e.g., "ITEM 1A"), finds where the actual section heading starts on that page and trims everything before it. Handles three layout variants:
- **Inline**: "ITEM 1A. Risk Factors" — item and title on one line.
- **Alone**: "ITEM 1A." on its own line, title follows.
- **Split**: "ITEM" on one line, "1A" on the next (some filings use this unusual layout).

**`_find_toc_page_10k(document, max_scan)`**
Scans the first `max_scan` pages (default 15) looking for a TOC page by counting regex matches:
- If `_TOC_ITEM_STANDALONE` matches ≥3 times: standalone-format TOC found.
- If `_TOC_ITEM_INLINE` matches ≥3 times: inline-format TOC found.
Returns the page number or `None`.

**`_parse_toc_10k(document, toc_page)`**
Parses TOC entries from the identified TOC page. Handles two layouts:
- **Layout A (standalone)**: "ITEM 1." alone on a line, followed by title, then page number.
- **Layout B (inline)**: "ITEM 1. Business   4" all on one line.

For each entry, records `label` (e.g., `ITEM_1`), `title`, `part` (e.g., `PART_I`), and `page_ref` (the page number shown in the TOC). Handles multi-page TOCs by checking if the next page also has TOC entries. Returns entries sorted by `page_ref`.

**`_find_section_page(document, entry, scan_from, total)`**
Locates the actual page in the PDF where a section's heading appears (as opposed to the TOC reference). Three strategies:
- **Strategy A**: Heading and title on one line: `ITEM 1A. Risk Factors...`
- **Strategy B**: Heading alone then title nearby: `ITEM 1A.` / (title follows)
- **Strategy C**: Item word split: `ITEM` / `1A` / title

Once the item label line is found, it "checks ahead" to verify the title content matches (prevents false positives on repeated references). Always scans forward from `scan_from` (previous section's page) to avoid jumping backward.

**`_resolve_pages_10k(document, toc_entries, toc_page)`**
For each TOC entry, calls `_find_section_page` to get the actual start page. If the heading is not found, uses the previous scan position as a fallback (scan_from does not advance). Also computes `end_page` for each section as the start of the next section.

**`_extract_10k_text(document, start_page, end_page, label_bare, heading_found, extra_strip)`**
Extracts and cleans text for a section across its page range:
- On the first page: calls `_trim_to_heading` to skip any content before the section heading.
- All pages: calls `_clean_10k_page_text` to remove artifacts.
- Returns the joined text stripped of leading/trailing whitespace.

**`extract_from_10K_10Q(mongo_uri, db_name, ticker, filename)`**
Public entry point for 10-K and 10-Q extraction. Orchestrates the full pipeline and returns:
```python
{ 'ticker': ticker, 'file_name': filename, 'sections': { 'Business': '...', 'Risk Factors': '...', ... } }
```

#### DEF 14A (Proxy Statement) Extraction

Proxy statements have different layouts than annual/quarterly reports. They often use hyperlink-based navigation and sidebar menus.

**`_normalize(text)`**
Normalizes text for heading comparison: standardizes dashes, removes excess whitespace, lowercases.

**`_strip_proxy_sidebar_nav(lines)`**
Many proxy PDFs have a sidebar navigation column (single digits or short labels for jump navigation). This function detects and removes those leading nav blocks by checking for sequences of 1-3 digit lines.

**`_clean_proxy_page_text(text)`**
Removes proxy-specific artifacts: URLs, "Page X of Y" markers, date stamps, "Table of Contents", "Back to top/contents" links, proxy title banners, DEF 14A labels, and "(continued)" markers.

**`_make_heading_re(title)`**
Creates a regex that matches the first 4 words of a normalized title. Used to scan pages for where a section actually starts.

**`_is_banner_fragment(text)`**
Returns True if text looks like a decorative banner (1-2 all-caps words) rather than a real section title. Used to skip false TOC entries.

**`_proxy_scan_for_heading(document, heading_re, start, end)`**
Scans pages `start` to `end` looking for a line matching the heading regex. Returns the page number on first match.

**`_find_toc_page_proxy(document, max_scan)`**
Finds the TOC page in a proxy statement. More complex than 10-K because proxies use varied TOC formats:
- Must first see "table of contents" in the page text.
- Then checks for either page-number patterns, inline TOC patterns, or hyperlinks (PDF internal links where `kind == 4`).
- Looks ahead up to 4 pages if TOC entries spill onto subsequent pages.

**`_parse_proxy_toc_from_links(document, toc_page)`**
Parses TOC entries from internal PDF hyperlinks (the most reliable method). For each link in the TOC page(s):
- Filters for internal document links (kind=4) pointing to pages beyond the TOC.
- Associates each link with its visible text by matching the link's bounding box against text blocks on the same Y coordinates.
- Records `indent` level based on the link's X position (indented sections are subsections).
- Handles multi-page TOCs by checking for pages that continue with novel link targets.

**`_parse_toc_proxy(document, toc_page)`**
Dispatches to link-based or text-based parsing:
- Prefers link-based if the TOC page has ≥5 internal links.
- Falls back to inline text pattern (`Title...........45`) or standalone pattern (title on preceding line, page number on its own line).
- Handles multi-line titles by looking back up to 4 lines before each page number.

**`_resolve_pages_proxy(document, toc_entries, toc_page, last_toc_page)`**
Resolves approximate page references to actual page numbers.
- For link-based entries (already resolved): uses the link target directly.
- For text-based entries: computes a `page_offset` (difference between PDF page index and TOC page number) and uses `_proxy_scan_for_heading` to find the actual heading.
- Computes `end_page` respecting section nesting: a subsection ends at the next sibling or parent section, not just the next entry.

**`extract_from_DEF_14A(mongo_uri, db_name, ticker, filename, max_indent)`**
Public entry point for proxy statement extraction. Filters entries by indent level (default `max_indent=1` keeps only top-level and first-level subsections, skipping deeper nesting).

---

### 4.6 `process_reports.py`

Functions for writing extracted data to MongoDB and running Claude summarization.

**`prettify_text(text)`** (legacy)
Converts text to lowercase then capitalizes sentence starts. Used by the older `extract_section` function. Not used in the current pipeline.

**`open_document(mongo_uri, db_name, filename)`** (legacy)
Opens a PDF from GridFS using PyMuPDF. Duplicates `_open_document_from_mongo` in `extractors.py`. This was the original implementation.

**`extract_headers(document)`** (legacy)
Extracts TOC header titles using a simple regex. Superseded by the more robust logic in `extractors.py`.

**`detect_toc_end(document, max_toc_pages)`** (legacy)
Detects where the TOC ends. Superseded by `_find_toc_page_10k`.

**`extract_section(document, section_heading)`** (legacy)
Extracts a section by heading using a simple text-search approach. Superseded by the robust extractor.

**`extract_content(mongo_uri, db_name, filename)`** (legacy)
Older orchestration function. Superseded by `extract_content_with_sections`.

**`extract_content_with_sections(mongo_uri, db_name, ticker, filename, form_type)`**
Current entry point for extraction. Dispatches based on form type:
- `DEF_14A` → `extract_from_DEF_14A()`
- Everything else → `extract_from_10K_10Q()`

**`write_dict_to_mongo(mongo_uri, db_name, collection_name, data_dict)`** (legacy)
Simple `insert_one` function. Superseded by `write_report_to_mongo` which uses upsert.

**`write_report_to_mongo(mongo_uri, db_name, collection_name, data_dict)`**
Upserts a report document into MongoDB using `file_name` as the `_id`. This ensures idempotency: running the pipeline twice for the same filing won't create duplicate documents.

**`summarize_report(report_content)`**
Sends each section of a filing to Claude for summarization.
- Skips sections with no content or error markers.
- Truncates section content to 12,000 characters before sending (avoids excessive token costs for very long sections).
- Each section gets a focused prompt asking Claude to write exactly 3 paragraphs with no heading, preserving all numbers, in plain language.
- Uses `claude-sonnet-4-6` with `max_tokens: 1024`.
- Returns the same `{ ticker, file_name, sections }` structure with summarized text.

**`write_summary_to_mongo(mongo_uri, db_name, collection_name, summary_dict)`**
Upserts a summarized report into MongoDB. Uses `file_name` as both `_id` and an explicit `id` field (the `id` field is queried by some routes that don't query by `_id` directly).

**`process_and_save_report(mongo_uri, db_name_read, db_name_write, collection_name, ticker, filename)`** (legacy)
Old utility for reading from one DB and writing to another. Not used in the current pipeline.

---

### 4.7 `company_processing_pipeline.py`

Main orchestration script. Coordinates all the other modules to process a company end-to-end.

**`_CF_KEYWORDS` and `_IS_KEYWORDS`**
String lists used by `_classify_facts` to determine whether an XBRL fact belongs to the cash flow statement or income statement based on its description text.

**`_classify_facts(facts_json)`**
Classifies every XBRL fact in a company's facts JSON into one of four statement types:
- **Balance Sheet**: uses `is_instant` heuristic — if the first 5 data points have no `start` date (point-in-time values rather than period values), it's a balance sheet item.
- **Cash Flow**: description contains cash flow keywords but not income statement keywords.
- **Income Statement**: description contains income statement keywords but not cash flow keywords.
- **Ambiguous / Unclassified**: neither or both.

Returns a dict: `{ xbrl_key: { label, description, statement } }`.

**`get_database()`**
Creates and returns a MongoDB database connection. Called at the start of each processing function to get a fresh connection.

**`add_to_companies_list(ticker)`**
Saves basic company info to `companies_list`. Skips silently if the ticker already exists (checks before inserting).

**`save_company_financials(ticker)`**
Saves all financial metrics for a company:
1. Fetches XBRL facts JSON and classifies every metric.
2. Calls `makeCompanyDataframe(ticker)` to get the full historical data + ratios.
3. Creates a unique index on `id` to prevent duplicate documents.
4. For each metric row and each date column, builds an `id` string (`{xbrl_key}_{ticker}` or `{slug}_{ticker}` for derived ratios).
5. Upserts each data point: first tries to update an existing date entry via `$set` on the nested `values` array. If that misses (new date or new doc), uses `$push` with `upsert=true`.

**`get_reports_list(ticker, form_types)`**
Calls `get_all_form_urls` for each form type and returns a combined flat list of all filing metadata dicts.

**`save_company_reports_list(ticker, form_types)`**
Upserts all filing metadata into `reports_list`, using the filing `id` as the unique key.

**`save_report_pdfs(ticker, form_types)`**
Downloads each filing's HTML from SEC.gov, converts it to PDF using WeasyPrint, and stores it in MongoDB GridFS.
- Skips files already in GridFS (checks by filename).
- WeasyPrint renders the HTML at the SEC URL directly (like a headless browser).
- Stores the PDF bytes with `ticker`, `form_type`, `filing_date`, etc. as GridFS metadata.

**`save_report_sections(ticker, form_types, max_summaries)`**
Extracts sections from each filing PDF and optionally summarizes them.
- Calls `extract_content_with_sections` (which dispatches to the correct extractor).
- Always writes raw sections to `report_sections`.
- If `max_summaries` is not reached and no summary exists: calls `summarize_report` and writes to `report_summaries`.
- Writes a local JSON file (`test_summary_{filename}.json`) as a diagnostic artifact after each summarization.
- `max_summaries=0` skips all summarization. `max_summaries=None` summarizes everything.

**`_compute_common_sized(df, denom_series)`**
Pure helper that takes a DataFrame and a denominator `pd.Series` (indexed by the same period columns) and returns a dict of `label → { date_str: float | None }` where each value is expressed as a percentage of the denominator. Returns `None` for any cell where the value or denominator is NaN/zero, or where the date is absent from the denominator series (handles misaligned dates between cash flow and income statement).

**`save_financial_statements(ticker)`**
Fetches income statement, balance sheet, and cash flow statement (both annual and quarterly) via yfinance, computes common-sized values, and upserts everything to the respective MongoDB collections.
- Pre-fetches the annual and quarterly income statement DataFrames once so their `Total Revenue` row can be reused as the cash flow denominator.
- Resolves the denominator series per statement type:
  - Income statement → `Total Revenue` row within the same DataFrame.
  - Balance sheet → `Total Assets` row within the same DataFrame.
  - Cash flow → `Total Revenue` row from the income statement DataFrame (different DataFrame).
- Calls `_compute_common_sized` to produce percentage values for every row.
- Normalizes: converts column dates to `YYYY-MM-DD` strings, converts NaN values to `None`, converts floats to integers.
- Stores data as `{ ticker, period_type, fetched_at, periods, rows }` where each row has both `values` (raw integers) and `common_sized_values` (rounded floats, omitted if no denominator was found).

**`process_company(ticker, form_types, max_summaries)`**
Top-level function that runs all 6 steps in sequence for a given ticker:
1. `add_to_companies_list`
2. `save_company_financials`
3. `save_company_reports_list`
4. `save_report_pdfs`
5. `save_report_sections`
6. `save_financial_statements`

The bottom of the file contains a run configuration for direct script execution, guarded by `if __name__ == '__main__':` so it does **not** execute when the module is imported by `process_cli.py`:
```python
if __name__ == '__main__':
    form_types = [FormType.TEN_K]
    process_company('AAPL', form_types, max_summaries=0)
```

---

### 4.8 `process_cli.py`

CLI entry point used by the Node.js backend to trigger company processing as a subprocess. This script exists specifically so `routes/processing.js` can spawn the pipeline without executing the module-level test code in `company_processing_pipeline.py`.

**Usage:**
```bash
python process_cli.py '<json_params>'
```

**Params JSON shape:**
```json
{
  "ticker": "CRWD",
  "include10K": true,
  "include10Q": false,
  "includeProxy": false,
  "summarize10K": false,
  "num10KSummaries": 1,
  "summarize10Q": false,
  "num10QSummaries": 1,
  "summarizeProxy": false,
  "numProxySummaries": 1
}
```

All `include*` flags default to `true` if absent (safe fallback); all `summarize*` flags default to `false`.

**What it does:**
1. Builds `form_types` list from the include flags.
2. Calls `add_to_companies_list`, `save_company_financials`, `save_company_reports_list`, `save_report_pdfs` for all selected form types.
3. Calls `save_report_sections` **separately per form type** with the appropriate `max_summaries` for each:
   - `max_summaries = num*Summaries` if the corresponding `summarize*` flag is `true`, else `0`.
   - `max_summaries=0` means sections are extracted but Claude is never called.
4. Calls `save_financial_statements`.

**Why per-type `save_report_sections` calls?**
The pipeline's `save_report_sections(ticker, form_types, max_summaries)` applies a single `max_summaries` limit across all form types passed in one call. To allow different summarisation counts per type (e.g. 4 10-Ks but only 1 proxy), `process_cli.py` calls it once per form type with the matching limit.

---

## 5. Frontend — React Application

### 5.1 Application Entry and Routing

**`index.js`**
Standard React 18 entry point. Wraps the app in `AuthProvider` for global auth state.

**`App.js`**
Defines all client-side routes using React Router 7.

| Route | Component | Auth Required |
|---|---|---|
| `/` | `LandingPage` | No |
| `/login` | `Login` | No |
| `/auth/callback` | `AuthCallback` | No |
| `/companies` | `CompaniesList` | Yes |
| `/companies/:ticker` | `CompanyPage` | Yes |
| `/companies/:ticker/reports` | `CompanyReports` | Yes |
| `/companies/:ticker/new-analysis` | `NewAnalysisPage` | Yes |
| `/companies/:ticker/analyses/:analysisId` | `AnalysisReportPage` | Yes |
| `/report-details/:fileName` | `ReportDetails` | Yes |
| `/financials/:ticker` | `CompanyFinancials` | Yes |
| `/profile` | `ProfilePage` | Yes |

Protected routes use `<ProtectedRoute>` which redirects to `/login` if no JWT is present.

---

### 5.2 `AuthContext`

`context/AuthContext.js` provides global authentication state via React Context.

**State:**
- `token`: JWT string or `null`
- `user`: decoded JWT payload or `null`
- `loading`: boolean (true while checking localStorage on mount)

**`login(token)`**: Stores the token in localStorage, decodes the JWT payload with `jwt-decode`, updates state.

**`logout()`**: Clears the token from localStorage and state.

**`authFetch(url, options)`**: Wrapper around `fetch` that automatically adds the `Authorization: Bearer <token>` header to every request.

**Initialization**: On mount, checks localStorage for an existing token. If found and not expired (checks the `exp` field in the JWT payload), restores the session. Otherwise clears localStorage.

The `user` object decoded from the JWT includes `{ userId, email, isAdmin }`. Components read `user?.isAdmin` to conditionally render admin-only UI (e.g., Admin badge in the navbar, "Process" button in the company search dropdown). Because `isAdmin` is baked into the JWT at login time, a user whose admin status changes must sign out and sign back in for the change to take effect.

---

### 5.3 Page Components

**`LandingPage.js`**
Marketing landing page. Shows product pitch and a login/get-started CTA.

**`Login.js`**
Simple login page with a "Sign in with Google" button that redirects to `GET /api/auth/google`.

**`AuthCallback.js`**
Handles the OAuth redirect. Reads the `?token=` query parameter from the URL, calls `login(token)` from `AuthContext`, then navigates to `/companies`. Shows an error state if the token is missing.

**`Navbar.js`**
Top navigation bar. Shows brand name, navigation links, and user avatar/name. Has a logout button that calls `logout()` from context. When `user?.isAdmin` is true, displays an amber **Admin** badge between the navigation links and the bell icon. The badge is purely visual — it signals to admins that they have elevated privileges without affecting navigation behaviour. Also renders a context/breadcrumb bar below the main navbar when on a company or filings page, showing a back chevron and the company's SIC description.

**`ProtectedRoute.js`**
HOC that wraps a component and redirects to `/login` if there's no JWT in context. Shows a loading spinner while auth state is being restored from localStorage.

**`CompaniesList.js`**
Company search and management page.
- Shows the user's saved companies with real-time quotes.
- Has a search bar that triggers a **dual search** on each keystroke: `GET /api/companies/search?q=` (corpus) and `GET /api/companies/search/external?q=` (Yahoo Finance). Both fetches run in parallel via `Promise.all`.
- Internal corpus results display with a `+ Add` button (adds the company to the user's watchlist).
- External results (not yet in corpus) render below corpus results with `isExternal: true` styling: a slightly muted background, and a subtitle line showing `{industry} · Not yet in corpus` (amber text). Two action buttons are shown:
  - **Request** (Clock icon, visible to all users) — opens `RequestModal`.
  - **Process** (Settings icon, amber border, visible to admins only — `user?.isAdmin`) — opens `AdminProcessModal`.
- Clicking either button closes the search dropdown and opens the corresponding modal.
- Allows adding/removing companies from the watchlist via `POST/DELETE /api/users/companies/:ticker`.
- Clicking a saved company navigates to `/companies/:ticker`.

**`CompanyPage.js`**
Main company dashboard with 6 tabs: Overview, Trends, Financials, Filings, News, Analysis. Tab content is loaded lazily — data is only fetched when a tab is first activated.

**`StockChart.js`**
Recharts-based price chart. Fetches historical data from `GET /api/stock/:ticker/history`. Allows period selection (1m, 3m, 6m, 1y, 2y, 5y). Renders a line chart with a tooltip showing OHLCV data on hover.

**`CompanyReports.js`**
Lists all filings for a company grouped by form type. Links to the Report Details page.

**`ReportDetails.js`**
Shows section-by-section content for a specific filing. Fetches from `GET /api/report-details/:fileName`.

**`CompanyFinancials.js`**
Full financial statements page. Displays income statement, balance sheet, and cash flow statement in tabular format. Allows toggling between annual and quarterly. Data comes from `GET /api/financials/:ticker/statements`.

**`NewAnalysisPage.js`**
AI analysis creation form. Handles tier selection, source picking, per-question embedded data chips, report options, and cost estimation.

**State:**
- `selectedTier` — selected tier template object (or `null` for custom).
- `questions` — array of question strings.
- `questionEmbeddedData` — parallel array; each entry is an array of chip objects `{ id, label, icon }` attached to that question.
- `reportOptions` — object `{ autoSuggestData: bool, showKeyFindings: bool, includeSourceCitations: bool }`.
- `attachMenuOpenIdx` — index of the question whose "Attach data" dropdown is open, or `null`.
- Various source selection state: `selectedFilings`, `selectedSections`, `selectedPeriods`, etc.

**Ref:**
- `userRemovedChartsRef` — `useRef({})`. Tracks chart IDs the user has explicitly removed per question index (keyed as `"qIdx:chartId"`). Prevents auto-suggest from re-adding a chip the user dismissed. Stored in a ref (not state) so reads/writes don't cause re-renders.

**`CHART_SUGGESTIONS`**
Array of 8 chart chip definitions. Each entry has `{ id, label, icon, keywords[] }`. The `keywords` array contains lowercase phrases matched against the question text. Chart types include: revenue trend, segment breakdown, gross margin trend, operating leverage, cash flow vs. capex, balance sheet leverage, EPS/earnings trend, and free cash flow yield.

**`getAutoSuggestions(questionText)`**
Scans a question string for keyword matches across `CHART_SUGGESTIONS` and returns matching chip objects (deduped). Returns an empty array if no keywords match.

**Auto-suggest effect**
Runs when `[questions, reportOptions.autoSuggestData, selectedTier]` change. Only active when `autoSuggestData` is `true` and the selected tier is not custom (custom templates have no standard question set, so auto-suggest would be irrelevant). For each question, computes suggestions, filters out chips the user already has or explicitly removed (`userRemovedChartsRef.current`), and **adds** any new suggestions. Never removes existing chips.

**Click-outside effect**
On mount, attaches a `mousedown` listener to `document`. Closes the attach dropdown (`setAttachMenuOpenIdx(null)`) when the user clicks outside the menu. Cleans up on unmount.

**Per-question UI**
Each question is rendered as a card with:
- An `<input>` for the question text (editable for custom tiers).
- A row below showing the current embedded data chips with a remove `×` button each.
- An "Attach data +" button that opens a dropdown listing all `CHART_SUGGESTIONS` not yet attached; clicking one adds it.
- An `attachMenuRef` div used by the click-outside effect to identify the menu boundary.

**Report Options section**
Three toggle switches rendered via a custom `Toggle` component:
- **Auto-suggest data** — whether to keyword-match chips to questions.
- **Show key findings** — whether to use Anthropic tool use mode and show the `KEY FINDINGS` callout in the report.
- **Include source citations** — whether the model populates the `sources` array.

**`handleRunAnalysis()`**
On submit:
1. Validates at least one source is selected.
2. POSTs to `POST /api/analyses` with all fields including `reportOptions` and `questionEmbeddedData`.
3. On success: navigates to `/companies/:ticker/analyses/:analysisId`.

**`AnalysisReportPage.js`**
Displays a completed analysis or polls for completion.

**Polling:**
- Fetches `GET /api/analyses/:id` immediately on mount.
- Stores the interval ID in `pollRef` (a `useRef`) so the interval can be cleared when the analysis reaches a terminal state.
- Polls every `STATUS_POLL_INTERVAL_MS` (3 seconds) until `status === 'completed'` or `status === 'failed'`.

**Header card:** Shows tier badge (color-coded by `TIER_COLORS[tierLevel]`), company + tier name, `StatusBadge`, creation/completion timestamps, and three `CostPill` components (estimated cost, actual cost, token count).

**`StatusBadge`** — inline component rendering a colored pill for `pending`, `running`, `completed`, or `failed` states.

**`CostPill`** — inline component rendering a labeled value pill. The `highlight` variant uses blue background/text (used for the actual cost pill).

**`EmbeddedDataChip`** — renders a small blue chip for each chart attached to a question, showing a `TrendingUp` or `BarChart2` icon (from lucide-react) and the chart label.

**`KeyFindingsCallout`** — renders the `KEY FINDINGS` callout box with a blue left border. Maps each finding through a warning-keyword regex (`/risk|concern|caution|pressure|decline|weak|headwind|but|however|note|caveat/i`). Warnings get an amber `⚠` prefix; positive findings get a green `✓`.

**Collapsible question sections:**
- `collapsedQuestions` state is a `Set` of question indices.
- Each question card has a header button with a `Q#` badge, question text, a `ChevronDown`/`ChevronRight` icon, and a "Click to expand" sub-label when collapsed.
- The body renders: `KeyFindingsCallout`, embedded data chips row (if any), `<AnalysisText>` for the markdown body, and a sources tag row.

**Backward compatibility:** Reads `const bodyText = item.analysis ?? item.a ?? ''` to support both the new structured format (`analysis` field) and legacy format (`a` field). Key findings and sources default to empty arrays if absent, so old reports render without errors.

**`ProfilePage.js`**
User profile dashboard.
- Shows name, email, and spending statistics.
- Displays a bar chart of monthly spending over the last 6 months.
- Lists all past analyses with their status and cost.
- Data from `GET /api/users/me` and `GET /api/users/stats`.

**`AnalysisText.js`**
Markdown-aware renderer for analysis body text. Receives a raw markdown string and produces structured React elements including interactive charts, styled tables, headings, and inline formatting.

**`parseCell(raw)`**
Parses a single table cell string into a numeric value. Handles:
- Dollar signs and commas.
- Parenthetical negatives: `(1,234)` → `-1234`.
- Suffix multipliers: `B` (billions), `M` (millions), `K` (thousands), `T` (trillions). Values are normalized to billions for the chart axes.
- Percent suffix: returns `{ isPercent: true }`.
- Returns `null` for non-numeric cells.

**`buildChartData(table)`**
Converts a parsed markdown table into Recharts-compatible data. Identifies numeric columns (skipping the first column which is the X label), splits them into `absCols` (absolute dollar values) and `pctCols` (percentage values), and returns `{ chartData, absCols, pctCols, numericCols }`. Returns `null` if no numeric columns are found.

**`isTimeSeries(headers)`**
Returns `true` if the first column header matches a time/period pattern: `period`, `year`, `fy` + digit, `q[1-4]` + digit, `quarter`, `date`, `fiscal`. Time-series tables are rendered as line charts; all other tables are rendered as styled HTML tables.

**`DataChart`**
Renders a Recharts `LineChart` with dual Y-axes for tables identified as time series.
- Left Y-axis (`yAxisId="abs"`): absolute dollar values, formatted by `fmtAbsAxis` (`$B`/`$M` suffixes).
- Right Y-axis (`yAxisId="pct"`): percentage values, formatted by `fmtPctAxis` (`%` suffix), lines rendered dashed.
- Tooltip uses `fmtTooltipValue` which auto-detects whether a series should be shown in `$T`/`$B`/`$M` or `%` format.
- If there is only one numeric series, the legend is hidden.
- Title (if present) comes from the markdown heading immediately preceding the table, which is promoted to a chart title and removed from the heading list.

**`StyledTable`**
Renders any non-time-series markdown table as a styled HTML `<table>`. First column is left-aligned; all other columns are right-aligned with tabular-nums font variant. Header row has a light grey background. Rows have a thin bottom border.

**`InlineText`**
Parses a single line of text for inline markdown: `**bold**` → `<strong>` and `` `code` `` → `<code>` with monospace styling. Uses a greedy index comparison to handle interleaved bold and code spans correctly.

**`parseBlocks(text)`**
Splits raw markdown text into typed block objects:
- `{ type: 'heading', level, text }` — lines starting with `#` to `####`.
- `{ type: 'table', table: { headers, rows }, title }` — consecutive `|`-delimited lines. A heading immediately before the first table line is captured as `title` and removed from the heading stream.
- `{ type: 'text', text }` — all other non-empty lines.
- `{ type: 'break' }` — empty lines (paragraph separators).

**`AnalysisText` (main export)**
Iterates over blocks from `parseBlocks`:
- Adjacent `text` blocks are buffered into a `paraBuffer` and flushed as a single `<p>` on `break` or non-text blocks.
- `heading` blocks produce a `<div>` with bold text, font-size scaled by level.
- `table` blocks: dispatched to `DataChart` (if `isTimeSeries`) or `StyledTable` (otherwise).
- Returns a `<div>` wrapping all produced elements.

---

### 5.4 Company Page Tabs

**`OverviewTab.js`**
Shows company description (from 10-K Business section), current stock quote, market cap, exchange, and SIC code.

**`TrendsTab.js`**
Shows the top 9 financial metrics per statement type as trend cards. Each card shows a mini sparkline chart. Clicking a metric opens `TrendDetailView`.

**`TrendDetailView.js`**
Detailed view of a single metric over time. Shows a full line chart with all historical data points, the metric description, and the statement it belongs to.

**`FinancialsTab.js`**
Renders the full financial statements within the company page context. Uses the same data as `CompanyFinancials.js` but embedded in the tab layout.

Controls are laid out in a single row:
- **Statement selector** (`Income Statement | Balance Sheet | Cash Flow`) — left-aligned.
- **View toggle** (`$ | %`) and **period toggle** (`Annual | Quarterly`) — right-aligned (`ms-auto`).

**`$` view (default):** Displays raw values in USD millions. Subtitle reads "Annual · USD (millions)".

**`%` view (common-sized):** Reads `common_sized_values` from each row instead of `values`. Values are formatted to 1 decimal place with a `%` suffix. Each period cell also shows a YoY change arrow:
- Green ↑ if the current period's % is higher than the prior year (next column, since periods are newest-first).
- Red ↓ if lower. No arrow on the oldest period (no prior year to compare).

Subtitle in `%` mode has two parts:
- Left: "Annual · % of Revenue" (or "% of Total Assets" for balance sheet).
- Right: "Each value as a % of Revenue ($408B FY2025 est.)" — the denominator row's most-recent raw value formatted in billions, shown only when the denominator row exists in the current data.

`DENOM_INFO` maps each statement key to `{ rowLabel, displayName }`:
- `income` → `Total Revenue` / "Revenue"
- `balance` → `Total Assets` / "Total Assets"
- `cashflow` → `Total Revenue` / "Revenue"

Row filtering: in `%` mode, rows are hidden if `common_sized_values` is absent or all-null. `NON_DOLLAR_LABELS` rows (EPS, share counts, tax rates) are hidden in both modes.

**`FilingsTab.js`**
Lists all filings (10-K, 10-Q, DEF 14A) with filing dates and links to the Report Details page.

**`NewsTab.js`**
Renders news articles from Finnhub. Shows thumbnail, title (as a link), publisher, and summary. Fetches from `GET /api/news/:ticker/news`.

**`AnalysisTab.js`**
Lists the current user's analyses for this company. Shows tier, status, cost, and a link to the full analysis report.

---

### 5.5 `RequestModal` and `AdminProcessModal`

Two modal dialogs that appear when a user or admin acts on an external (not-yet-in-corpus) company in the search dropdown.

#### `RequestModal.js` — regular users

Opened when any authenticated user clicks the **Request** button next to an external search result.

**State:**
- `include10K`, `include10Q`, `includeProxy` — which filing types to include. Defaults: `include10K: true`, others `false`.
- `loading`, `done` — submission lifecycle.

**`noneSelected`** — boolean computed from the three include flags. The Submit button is disabled and shows a validation message when `true`.

**Layout:**
- Header: company name + ticker.
- "Filings to fetch" section with three checkboxes.
- Two info callouts (using a shared `Callout` component):
  - Info icon (blue): describes what will be processed (financial statements, trends). No AI summaries.
  - Clock icon (grey): notes that processing runs in the background and typically takes a few minutes.
- Footer: Cancel + **Submit request** button.

**Submit flow:**
1. POSTs to `POST /api/processing/request` with `{ ticker, name, include10K, include10Q, includeProxy }`.
2. On success: calls `onRequested(company.ticker)` (parent can update UI), sets `done: true`, button turns green ("Requested!"), modal auto-closes after 1.2 seconds.

#### `AdminProcessModal.js` — admin users

Opened when an admin clicks the **Process** button next to an external search result. Provides full control over per-type summarisation.

**State:**
- `include10K`, `include10Q`, `includeProxy` — which filing types to fetch (same defaults as `RequestModal`).
- `summarize10K`, `summarize10Q`, `summarizeProxy` — whether to run Claude summarization for each type. Defaults: `summarize10K: true`, `summarize10Q: false`, `summarizeProxy: true`.
- `num10K`, `num10Q`, `numProxy` — how many filings to summarize per type (all default to `1`).
- `loading`, `done`.

**Sub-components:**
- **`Counter`** — a +/− spinner for a number value. Props: `value`, `onChange`, `min` (default 1), `max` (default 20). The − button is disabled when `value === min`; + is disabled when `value === max`.
- **`Checkbox`** — styled checkbox with optional `disabled` prop (greys out and ignores `onChange` when the corresponding include flag is off).
- **`SubPanel`** — indented panel with a left border, wrapping the "Number to summarise" control. Only shown when both the include and summarize flags are true for a given type.

**`noneSelected`** — disables both action buttons and shows a validation message.

**`estimatedCalls`** — count of Claude API calls the action will trigger. Only counts types that are both included **and** to be summarized. Displayed in the amber cost-estimate callout at the bottom of the body.

**`buildBody(forceSummarizeOff)`** — helper that constructs the POST body. When `forceSummarizeOff` is `true`, all `summarize*` flags are set to `false` (used for the Queue action). Otherwise, passes the actual checkbox states.

**Two action buttons:**
- **Queue for users** (Users icon, white/bordered) — calls `submit('queue')`, which POSTs to `POST /api/processing/queue` with `buildBody(true)`. Fetches and chunks all selected filing types; no Claude calls.
- **Process now** (Zap icon, black/filled) — calls `submit('process')`, which POSTs to `POST /api/processing/process` with `buildBody(false)`. Runs with full per-type summarisation settings.

Both buttons share the same success path: `done: true`, the "Process now" button turns green ("Triggered!"), modal auto-closes after 1.2 seconds.

---

## 6. Docker Configuration

### 6.1 Node Backend Dockerfile

`Backend/node-backend/Dockerfile`:

```dockerfile
FROM node:20-alpine        # Lightweight Alpine Linux with Node 20
WORKDIR /app
COPY package*.json ./      # Copy only manifests first (layer caching)
RUN npm install            # Install dependencies (cached unless package.json changes)
COPY . .                   # Copy application code
EXPOSE 5001
CMD ["node", "server.js"]
```

**Design decisions:**
- `node:20-alpine` is significantly smaller than the full `node:20` image.
- Copying `package.json` before the application code means `npm install` is cached on Docker layer cache — rebuilds from code changes don't reinstall dependencies.
- No `NODE_ENV=production` here; environment is controlled via env vars at runtime.

### 6.2 Frontend Dockerfile

`fundamental-analysis/Dockerfile`:

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

**Note:** This runs `npm start` (the Create React App dev server), not a production build. In production, you would want `npm run build` followed by an nginx container to serve the static files. For current development use, the dev server is sufficient.

### 6.3 `docker-compose.yml`

Defines three services:

**`frontend`**
```yaml
image: stockanalysis-frontend:local
build: ./fundamental-analysis
ports:
  - "3000:3000"
volumes:
  - ./fundamental-analysis:/app
  - /app/node_modules        # Keep container's node_modules separate from host
environment:
  CHOKIDAR_USEPOLLING: true  # Required for hot-reload inside Docker on Mac
```

The volume mount (`./fundamental-analysis:/app`) enables hot-reload: file changes on your Mac are immediately reflected inside the container. The second volume (`/app/node_modules`) is an anonymous volume that prevents the host's `node_modules` from overwriting the container's.

`CHOKIDAR_USEPOLLING=true` is necessary because Docker on Mac uses a VM; filesystem events don't propagate the same way as on Linux. Polling ensures file watcher detects changes.

**`server`**
```yaml
image: stockanalysis-server:local
build: ./Backend/node-backend
container_name: stockanalysis-server
env_file:
  - ./Backend/node-backend/.env    # Loads all env vars from file
ports:
  - "5001:5001"
environment:
  MONGO_URI: mongodb://admin:secret@mongo:27017/stockanalysis?authSource=admin
depends_on:
  - mongo
restart: unless-stopped
```

`MONGO_URI` in the `environment` block **overrides** the value in `.env`. This is intentional: the `.env` file may have `localhost:27017` for local dev, but inside Docker the MongoDB hostname is `mongo` (the service name). The inline override ensures the container always uses the correct hostname.

`depends_on: mongo` means Docker Compose starts the `mongo` container first. However, this only guarantees container startup order, not that MongoDB has finished initializing. If the Node server crashes on startup because MongoDB isn't ready yet, the `restart: unless-stopped` policy will retry.

**`mongo`**
```yaml
image: mongo:7
container_name: stockanalysis-mongo
ports:
  - "27017:27017"
volumes:
  - mongo_data:/data/db      # Named volume for data persistence across restarts
environment:
  MONGO_INITDB_ROOT_USERNAME: admin
  MONGO_INITDB_ROOT_PASSWORD: secret
  MONGO_INITDB_DATABASE: stocks_data
restart: unless-stopped
```

The named volume `mongo_data` persists MongoDB data across `docker-compose down` and restarts. Data is only lost if you run `docker-compose down -v` (which deletes volumes).

The `MONGO_INITDB_*` variables are processed by the official MongoDB image on first startup to create the root user. They have no effect once the database is initialized.

---

## 7. Kubernetes Configuration

All manifests are in the `k8s/` directory. Sensitive values are in `*.local.yaml` files which are gitignored.

### 7.1 MongoDB

**`mongo-pv.yaml` — PersistentVolume**
Defines a 500Mi storage resource backed by the host filesystem at `/data/mongo` inside Minikube. The `hostPath` storage class is only suitable for single-node development clusters (like Minikube).

**`mongo-pvc.yaml` — PersistentVolumeClaim**
Claims the PersistentVolume. The `storageClassName: ""` explicitly opts out of dynamic provisioning (would create a new volume), forcing it to bind to the existing manually-created PV.

**Relationship:** `mongo-deployment.yaml` → references `mongo-pvc` → bound to `mongo-pv` → maps to `/data/mongo` inside Minikube.

**`mongo-secret.yaml` / `mongo-secret.local.yaml`**
The `.yaml` template file has placeholder values. The `.local.yaml` file (gitignored) contains real base64-encoded credentials. Values:
- `MONGO_INITDB_ROOT_USERNAME`
- `MONGO_INITDB_ROOT_PASSWORD`
- `MONGO_EXPRESS_URL` (used by Mongo Express)

**`mongo-deployment.yaml`**
Runs a single MongoDB replica. Key settings:
- `strategy: type: Recreate` — stops the old Pod completely before starting a new one. Required because MongoDB's data volume can only be mounted by one Pod at a time (ReadWriteOnce).
- Reads credentials from `mongo-secret` via `secretKeyRef`.
- Mounts the `mongo-pvc` PersistentVolumeClaim at `/data/db` (MongoDB's data directory).

**`mongo-service.yaml`**
ClusterIP service (the default type) that makes MongoDB accessible at `mongo:27017` within the cluster. Only Pods inside the cluster can reach this — it's not exposed externally.

### 7.2 Node API Server

**`server-secret.yaml` / `server-secret.local.yaml`**
Contains all environment variables for the Node backend as Kubernetes secret. The `envFrom.secretRef` in the deployment loads all keys as environment variables. Variables match those described in the [Environment Variables](#environment-variables) section of the README.

**`server-deployment.yaml`**
```yaml
image: stockanalysis-server:local
imagePullPolicy: Never    # Use the locally built image, never pull from registry
```
`imagePullPolicy: Never` is critical for Minikube development. Without it, Kubernetes would try to pull from Docker Hub and fail (or pull an outdated image). All env vars come from `server-secret` via `envFrom.secretRef`.

**`server-service.yaml`**
ClusterIP service exposing the Node API at `server:5001` within the cluster. Port-forwarding tunnels `localhost:5001` → Pod:5001 for development access.

### 7.3 React Frontend

**`frontend-secret.yaml`**
Contains `REACT_APP_API_URL`. This is committed to git because it typically contains a non-sensitive URL. When running in Kubernetes, the React app's API calls go through port-forwarding, so `http://localhost:5001` works.

**`frontend-deployment.yaml`**
Same `imagePullPolicy: Never` pattern as the server. Uses `stockanalysis-frontend:local` image.

**`frontend-service.yaml`**
ClusterIP service at `frontend:3000`. Port-forwarding exposes it at `localhost:3000`.

**Why the frontend also needs port-forwarding:**
The frontend Pod serves the React JS files to the browser. But once the browser has the JS, all API calls are made from the browser itself (running on your Mac), not from inside the cluster. So both the frontend (to get the app) and the backend (for API calls) need port-forwarding.

### 7.4 Mongo Express

An optional web-based MongoDB admin UI for development use.

**`mongo-express-deployment.yaml`**
Runs `mongo-express:latest`. Reads `ME_CONFIG_MONGODB_URL` from `mongo-secret`. Sets `ME_CONFIG_BASICAUTH: "false"` to disable the login prompt (development convenience — don't do this in production).

**`mongo-express-service.yaml`**
ClusterIP service at `mongo-express:8081`. Port-forward to access at `localhost:8081`.

---

## 8. Key Flows End-to-End

### 8.1 Authentication Flow

```
Browser                    Frontend                  Backend                  Google
   │                          │                          │                       │
   │  Click "Sign in"         │                          │                       │
   │─────────────────────────>│                          │                       │
   │                          │  GET /api/auth/google    │                       │
   │                          │─────────────────────────>│                       │
   │                          │                          │  302 → accounts.google.com
   │<─────────────────────────────────────────────────────────────────────────────│
   │  Browser follows redirect│                          │                       │
   │──────────────────────────────────────────────────────────────────────────────>
   │  User approves           │                          │                       │
   │<────────────────────────────────────────────────────────────────────────────│
   │  302 → /api/auth/google/callback?code=xxx           │                       │
   │─────────────────────────────────────────────────────>                       │
   │                          │  Passport exchanges code for profile              │
   │                          │          Upsert user in MongoDB                  │
   │                          │          Sign JWT (7 days)                       │
   │                          │  302 → /auth/callback?token=<jwt>                │
   │<─────────────────────────────────────────────────────                       │
   │  AuthCallback reads token│                          │                       │
   │─────────────────────────>│                          │                       │
   │                          │  login(token) → localStorage                     │
   │                          │  Navigate to /companies  │                       │
   │<─────────────────────────│                          │                       │
   │                          │                          │                       │
   │  All subsequent API calls:                          │                       │
   │  Authorization: Bearer <jwt>                        │                       │
```

### 8.2 Company Data Ingestion Flow

```
python company_processing_pipeline.py
       │
       ├── 1. SEC EDGAR: CIK lookup + company info → companies_list
       │
       ├── 2. SEC EDGAR: XBRL facts → classify by statement type
       │         ↓
       │   yfinance: annual + quarterly XBRL data
       │         ↓
       │   calculate 20 financial ratios
       │         ↓
       │   upsert metrics → company_financials
       │
       ├── 3. SEC EDGAR: all filing URLs → reports_list
       │
       ├── 4. For each filing:
       │     WeasyPrint: fetch HTML from SEC.gov, render to PDF bytes
       │     MongoDB GridFS: store PDF with metadata
       │
       ├── 5. For each filing:
       │     PyMuPDF: open PDF from GridFS
       │     TOC detection → section boundary resolution → text extraction
       │     → report_sections
       │     (if max_summaries not reached):
       │       Claude API: summarize each section to 3 paragraphs
       │       → report_summaries
       │
       └── 6. yfinance: income_stmt, balance_sheet, cashflow (annual + quarterly)
              → income_statements, balance_sheets, cash_flow_statements
```

### 8.3 AI Analysis Creation Flow

```
User (Browser)         React Frontend          Node API            Background Process
      │                      │                     │                      │
      │ Select tier,          │                     │                      │
      │ sources, questions,   │                     │                      │
      │ attach data chips,    │                     │                      │
      │ set report options    │                     │                      │
      │──────────────────────>│                     │                      │
      │                       │ POST /analyses/estimate                    │
      │                       │────────────────────>│                      │
      │                       │   estimateCost()    │                      │
      │                       │<─ { estimatedCostGBP }                     │
      │<── Show cost preview  │                     │                      │
      │                       │                     │                      │
      │ Click "Run Analysis"  │                     │                      │
      │──────────────────────>│                     │                      │
      │                       │ POST /analyses      │                      │
      │                       │ { questions,        │                      │
      │                       │   reportOptions,    │                      │
      │                       │   questionEmbeddedData, ... }              │
      │                       │────────────────────>│                      │
      │                       │  Validate inputs    │                      │
      │                       │  Check cost cap     │                      │
      │                       │  Insert doc (pending, stores reportOptions │
      │                       │    + questionEmbeddedData)                 │
      │                       │  Link to user       │                      │
      │                       │  setImmediate() ──────────────────────────>│
      │                       │<─ { analysisId, status: 'pending' }        │
      │                       │                     │  fetchSourceContent() │
      │                       │                     │                      │
      │                       │                     │  if showKeyFindings: │
      │                       │                     │    Tool use mode:    │
      │                       │                     │    system: basePrompt│
      │                       │                     │      + tool instrs  │
      │                       │                     │    tools: [answer_all│
      │                       │                     │      _questions]     │
      │                       │                     │    Claude API call   │
      │                       │                     │    Extract tool_use  │
      │                       │                     │      block answers   │
      │                       │                     │    report: [{q,      │
      │                       │                     │      key_findings,   │
      │                       │                     │      analysis,       │
      │                       │                     │      sources}]       │
      │                       │                     │  else:               │
      │                       │                     │    Legacy mode:      │
      │                       │                     │    system: basePrompt│
      │                       │                     │      + JSON instrs   │
      │                       │                     │    Claude API call   │
      │                       │                     │    Parse JSON array  │
      │                       │                     │    report: [{q, a}]  │
      │                       │                     │                      │
      │                       │                     │  Update DB (completed│
      │                       │                     │    + actualCostGBP)  │
      │                       │                     │  Update user spend   │
      │                       │                     │                      │
      │                Navigate to AnalysisReportPage                      │
      │──────────────────────>│                     │                      │
      │                       │ GET /analyses/:id   │                      │
      │                       │────────────────────>│                      │
      │                       │<─ { status: 'running' }                    │
      │<── Show spinner       │                     │                      │
      │                       │ (poll every 3s)     │                      │
      │                       │ GET /analyses/:id   │                      │
      │                       │────────────────────>│                      │
      │                       │<─ { status: 'completed', report: [...] }   │
      │<── Render collapsible │                     │                      │
      │    Q&A with KEY       │                     │                      │
      │    FINDINGS callout,  │                     │                      │
      │    markdown charts,   │                     │                      │
      │    and source tags    │                     │                      │
```

### 8.4 Company Processing Request Flow

```
User / Admin (Browser)    React Frontend            Node API              Python (subprocess)
         │                      │                      │                         │
         │  Search for company  │                      │                         │
         │─────────────────────>│                      │                         │
         │                      │ GET /companies/search (internal)                │
         │                      │ GET /companies/search/external (Yahoo Finance)  │
         │                      │──────────────────────> (both in parallel)       │
         │                      │<─ corpus results + external results             │
         │<── Dropdown: internal │                      │                         │
         │    results + external │                      │                         │
         │    "Not yet in corpus"│                      │                         │
         │                      │                      │                         │
         │  [User] Click Request │                      │                         │
         │─────────────────────>│                      │                         │
         │                      │ RequestModal opens   │                         │
         │  Select filing types  │                      │                         │
         │  Click Submit request │                      │                         │
         │─────────────────────>│                      │                         │
         │                      │ POST /processing/request                        │
         │                      │ { ticker, include10K, include10Q, includeProxy }│
         │                      │──────────────────────>                          │
         │                      │        Check companies_list (409 if exists)     │
         │                      │        Check processing_requests (skip if dupe) │
         │                      │        Insert { status:'processing', requestType:'user' }
         │                      │        spawnPipeline({ summarize*: false })      │
         │                      │          → python process_cli.py '<json>'       │──────────>│
         │                      │<─ { success: true, logFile }                    │           │
         │<── Modal: "Requested!"│                      │                         │ fetch+chunk│
         │                      │                      │                         │ (no Claude)│
         │                      │                      │                         │           │
         │  [Admin] Click Process│                      │                         │           │
         │─────────────────────>│                      │                         │           │
         │                      │ AdminProcessModal opens                         │           │
         │  Configure filing     │                      │                         │           │
         │  types + summarisation│                      │                         │           │
         │  Click "Process now"  │                      │                         │           │
         │─────────────────────>│                      │                         │           │
         │                      │ POST /processing/process                        │           │
         │                      │ { ticker, include*, summarize*, num*Summaries } │           │
         │                      │──────────────────────>                          │           │
         │                      │        isAdmin check (403 if not admin)         │           │
         │                      │        spawnPipeline(full params)               │           │
         │                      │          → python process_cli.py '<json>'       │──────────>│
         │                      │<─ { success: true, logFile }                    │           │
         │<── Modal: "Triggered!"│                      │                         │ fetch+chunk│
         │                      │                      │                         │ + Claude   │
         │                      │                      │                         │   summaries│
         │                      │                      │                         │           │
         │  [Admin] Click Queue  │                      │                         │           │
         │─────────────────────>│  (same modal, "Queue │                         │           │
         │                      │   for users" button) │                         │           │
         │                      │ POST /processing/queue                          │           │
         │                      │ { ticker, include*, summarize*: all false }     │           │
         │                      │──────────────────────>                          │           │
         │                      │        isAdmin check                            │           │
         │                      │        spawnPipeline({ summarize*: false })     │──────────>│
         │                      │<─ { success: true, logFile }                    │ fetch+chunk│
         │<── Modal: "Triggered!"│                      │                         │ (no Claude)│
```

**Key differences between the three actions:**

| Action | Who | summarize | DB record | Use case |
|---|---|---|---|---|
| Request | Any user | Never | `processing_requests` doc created | User wants a new company added |
| Queue for users | Admin only | Never | No record | Pre-populate corpus in batch |
| Process now | Admin only | Per-type settings | No record | Full ingest with summaries for AI analysis |

**Monitoring a running pipeline:**
```bash
# The logFile path is returned in the API response — or find the latest log:
ls -t Backend/node-backend/logs/processing/ | head -5

# Stream output in real time
tail -f Backend/node-backend/logs/processing/TICKER-YYYY-MM-DDTHH-MM-SS-sssZ.log

# Check if the process is still running
ps aux | grep process_cli.py
```

---

## 9. Debugging and Troubleshooting

### Cannot connect to MongoDB

**Symptom:** Node server logs "Failed to connect to MongoDB" or Python pipeline fails with connection error.

**Check 1:** Is MongoDB running?
```bash
# Local
brew services list | grep mongodb

# Docker Compose
docker ps | grep mongo

# Kubernetes
kubectl get pods | grep mongo
```

**Check 2:** Is the `MONGO_URI` correct?
- Local: should be `mongodb://admin:secret@localhost:27017/...`
- Docker: should use `mongo` as the hostname, not `localhost`
- Kubernetes: requires port-forwarding to be running

**Check 3 (Kubernetes):** Is port-forwarding active?
```bash
kubectl port-forward <mongo-pod> 27017:27017
# This terminal tab must stay open
```

**Check 4:** Authentication credentials. Connect manually to verify:
```bash
mongosh "mongodb://admin:secret@localhost:27017/stockanalysis?authSource=admin"
```

---

### Node server won't start

**Symptom:** Server exits immediately or crashes on startup.

**Check logs:**
```bash
# Local
NODE_ENV=local node server.js 2>&1 | head -50

# Docker
docker logs stockanalysis-server

# Kubernetes
kubectl logs <server-pod-name>
```

**Common causes:**
- Missing env vars: `JWT_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`
- MongoDB not reachable (see above)
- Port 5001 already in use: `lsof -i :5001`

---

### React frontend can't reach the API

**Symptom:** API calls fail, network errors in browser console, CORS errors.

**Check 1:** Is the backend running and accessible at port 5001?
```bash
curl http://localhost:5001/api/companies
```

**Check 2:** Is `REACT_APP_API_URL` set correctly? The frontend reads this at build/start time.
```bash
# For local dev
echo "REACT_APP_API_URL=http://localhost:5001" > fundamental-analysis/.env
```

**Check 3:** CORS errors? The Node server only allows requests from `FRONTEND_URL`. If the frontend is running on a different port, update `FRONTEND_URL` in the backend env.

---

### Google OAuth fails

**Symptom:** Login redirects to `/login?error=auth_failed` or Google shows an error.

**Check 1:** Verify Google OAuth credentials are correct in env vars.

**Check 2:** The `callbackURL` in `server.js` is hardcoded as `/api/auth/google/callback`. Make sure your Google Cloud OAuth app has this as an authorized redirect URI. The full URL would be `http://localhost:5001/api/auth/google/callback`.

**Check 3:** The `FRONTEND_URL` env var must match the origin of the running React app. Mismatches cause the post-auth redirect to fail.

---

### Analysis gets stuck in `pending` or `running` state

**Symptom:** Analysis never completes, stays `pending` or `running` indefinitely.

**Check 1:** View the Node server logs for errors during analysis processing:
```bash
# Local logs
cat Backend/node-backend/logs/error-$(date +%Y-%m-%d).log

# Or watch live
NODE_ENV=local node server.js  # Analysis errors appear in terminal
```

**Check 2:** The analysis document in MongoDB may have an `error` field if it failed. Query directly:
```bash
mongosh "mongodb://admin:secret@localhost:27017/stockanalysis?authSource=admin"
use stocks_data
db.generated_reports.find({ status: "failed" }).limit(5).pretty()
```

**Common causes:**
- `ANTHROPIC_API_KEY` missing or invalid
- No source content found (filing not yet processed — run the Python pipeline first)
- Claude returned malformed JSON in legacy mode (very rare; the parser strips markdown fences)
- In tool use mode (`showKeyFindings: true`): Claude failed to call the `answer_all_questions` tool — check the error field in the DB document for "Model did not call the answer_all_questions tool"

---

### Analysis has partial answers (some questions empty)

**Symptom:** The completed report has some questions with empty `key_findings`, `analysis`, or `sources` arrays.

**Root cause:** This was a bug in the previous per-question tool design where `tool_choice: 'any'` only guaranteed one tool call. The fix was replacing the per-question tool with `ANSWER_ALL_QUESTIONS_TOOL` which accepts an `answers` array — the model must fill all N answers in a single call.

**If this still occurs:** Check that the analysis used `showKeyFindings: true` and look at the token usage. If `outputTokens` is very high and close to `max_tokens: 8192`, the model may have been cut off before answering all questions. Reduce the number of questions or the volume of source content.

---

### Python pipeline fails on PDF download

**Symptom:** `save_report_pdfs` fails with a WeasyPrint error.

**Common causes:**
- WeasyPrint requires system libraries: `libcairo`, `libpango`, `libgdk-pixbuf`. Install via Homebrew:
  ```bash
  brew install cairo pango gdk-pixbuf libffi
  ```
- SEC.gov rate limiting: the pipeline doesn't throttle requests. If you get HTTP 429, add `time.sleep(1)` between requests.
- Some SEC filings use JavaScript-rendered content that WeasyPrint can't handle. Check the URL manually in a browser.

---

### Kubernetes Pods crash-loop or fail to start

**Symptom:** `kubectl get pods` shows `CrashLoopBackOff` or `Error`.

**Step 1:** Get the reason:
```bash
kubectl describe pod <pod-name>
# Look at the Events section at the bottom
```

**Step 2:** Check container logs:
```bash
kubectl logs <pod-name>
kubectl logs <pod-name> --previous   # If the pod already restarted
```

**Common causes:**
- Secret not applied: `kubectl get secrets` should show `mongo-secret`, `server-secret`, `frontend-secret`.
- Image not found: confirm `imagePullPolicy: Never` is set and you ran `eval $(minikube docker-env)` before building.
- Wrong image tag: the deployment uses `stockanalysis-server:local` and `stockanalysis-frontend:local`. Verify with `docker images` (inside Minikube's docker env).
- MongoDB PVC not bound: `kubectl get pvc` should show `mongo-pvc` as `Bound`. If it's `Pending`, the PV may not match the PVC request.

---

### Code changes not reflected in Kubernetes

**Symptom:** You changed code but the running Pod still shows old behavior.

**You need to rebuild the image and restart the deployment:**
```bash
# Make sure you're in Minikube's Docker context
eval $(minikube docker-env)

# Rebuild the image (use --no-cache to force a clean build)
docker compose build server

# Restart the deployment (this creates new Pods with the new image)
kubectl rollout restart deployment/server

# Watch the new Pod come up
kubectl get pods --watch
```

**Verify the Pod is using the new image:**
```bash
kubectl describe pod <new-pod-name> | grep "Image ID"
docker images | grep stockanalysis-server
# The Image IDs should match
```

Note: `kubectl apply -f k8s/server-deployment.yaml` does **not** trigger a new image pull if the tag hasn't changed. Always use `kubectl rollout restart` after rebuilding.

---

### MongoDB data inspection

**Check what's in the database:**
```bash
# Connect to local MongoDB
mongosh "mongodb://admin:secret@localhost:27017/stockanalysis?authSource=admin"

# List all collections
use stocks_data
show collections

# Count documents in key collections
db.companies_list.countDocuments()
db.company_financials.countDocuments()
db.reports_list.countDocuments()
db.report_sections.countDocuments()
db.report_summaries.countDocuments()
db.generated_reports.countDocuments()

# Check GridFS files (stored PDFs)
db.fs.files.find({}, { filename: 1 }).pretty()

# Find a specific company's financials
db.company_financials.find({ ticker: "AAPL" }).limit(3).pretty()

# Check latest analysis status
db.generated_reports.find({}).sort({ createdAt: -1 }).limit(5).pretty()
```

**Using Mongo Express (the browser UI):**
With port-forwarding to the mongo-express Pod on port 8081, navigate to http://localhost:8081 to browse and query collections visually.

---

### Log files

The Node backend writes structured JSON logs to `Backend/node-backend/logs/`:
- `combined-YYYY-MM-DD.log`: all log entries
- `error-YYYY-MM-DD.log`: errors only

**Useful patterns:**
```bash
# Watch live log entries
tail -f Backend/node-backend/logs/combined-$(date +%Y-%m-%d).log | python3 -m json.tool

# Find all errors today
cat Backend/node-backend/logs/error-$(date +%Y-%m-%d).log | python3 -m json.tool

# Find all analysis-related log entries
grep '"analysisId"' Backend/node-backend/logs/combined-$(date +%Y-%m-%d).log
```

---

### Processing pipeline doesn't seem to run

**Symptom:** You triggered a "Request" or "Process now" action but nothing appears to be happening. The company doesn't show up in the corpus after waiting.

**Step 1:** Find the log file. The API response includes a `logFile` path — check the browser network tab (response body of the `POST /api/processing/*` call) or list the directory:
```bash
ls -t Backend/node-backend/logs/processing/
```

**Step 2:** Stream the log in real time:
```bash
tail -f Backend/node-backend/logs/processing/<TICKER>-<timestamp>.log
```
All stdout and stderr from the Python subprocess is captured here. Look for Python tracebacks, import errors, or "No financial data found" messages.

**Step 3:** Check if the subprocess is still running:
```bash
ps aux | grep process_cli.py
```
If you see a Python process, it's still running. If not, the process finished (or never started — check the log for an immediate error).

**Step 4:** Check that the Node backend was restarted after any code changes to `routes/processing.js`. The Node process must be restarted for new code (including logging setup) to take effect.

**Step 5:** Verify `PYTHON_PIPELINE_DIR` and `PYTHON_CMD` env vars are correct. The default is `python3` and the path relative to `routes/` is `../../info-processing`. If your Python virtual environment is not activated or `process_cli.py` is in a different location, the spawn will fail silently (check the log file for the error).

**Step 6:** If the log file is empty or doesn't exist, the process likely failed before any output was written. Check Node server logs for spawn errors:
```bash
cat Backend/node-backend/logs/error-$(date +%Y-%m-%d).log
```

---

### Admin badge or "Process" button not showing

**Symptom:** A user whose email is in `ADMIN_EMAILS` doesn't see the Admin badge or the Process button.

**Cause:** `isAdmin` is baked into the JWT at login time. The JWT is valid for 7 days — if the user was already logged in when the `ADMIN_EMAILS` env var was added, their existing JWT has `isAdmin: false`.

**Fix:** The user must sign out and sign back in. A fresh JWT will be issued with `isAdmin: true`.

**Verify `ADMIN_EMAILS` is set correctly:**
```bash
grep ADMIN_EMAILS Backend/node-backend/.env
# Should output: ADMIN_EMAILS=adit.kotwal29@gmail.com
```
The comparison is case-insensitive, so capitalization in the env var doesn't matter.

---

### Performance tips

- **First analysis is slow**: The analysis fetches source content from MongoDB, builds a large prompt, and waits for Claude. Expect 30-90 seconds depending on how many sources are selected.
- **PDF download is slow**: WeasyPrint fetches and renders HTML from SEC.gov. A full 10-K can take 30-120 seconds. This is a one-time cost; subsequent runs skip already-stored PDFs.
- **XBRL facts API**: The `getFactsDF` call for a large company (like Apple) downloads several MB of JSON. This is expected.
- **Summarization**: Each section takes one Claude API call. A 10-K with 15 sections = 15 API calls sequentially. Use `max_summaries=0` to skip this step during testing.
