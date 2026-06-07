# Reading a Cash Flow Statement Like an Analyst
### The truth serum, free cash flow, and what the numbers actually mean

Earnings are an opinion. **Cash is a fact.** That's the single sentence that explains why the cash flow statement matters more than the other two — and why I've been pointing you toward it the entire series. Net income is built on accruals and management estimates; it can be smoothed, stretched, or quietly manipulated for surprisingly long stretches. **Sustained** cash flow cannot. A company can fake profit for years; it cannot fake cash arriving in the bank.

The cash flow statement (CFS) does two things at once: it **reconciles** net income to the cash that actually moved, and it tells you how the business **generates, spends, and finances itself**. Read against the income statement, it reveals earnings quality. Read against the balance sheet, it explains every change in capital structure. It's the statement that ties the other two together.

> **The master question:** *"How much cash does this business actually generate, where does it go, and how much of it is genuinely available to me as an owner?"*

If a single ratio captured the spirit of the entire series, it would be **operating cash flow ÷ net income.** Over a cycle, that ratio should be ≥1. When it persistently isn't, something is wrong with the earnings.

---

## The Three Sections (and what each one reveals)

The CFS has three parts. They answer three different questions about the business.

### 1. Cash from Operating Activities (CFO) — *can the business fund itself?*

Almost every company presents this using the **indirect method**, walking from net income down to operating cash:

```
Net income
  + Non-cash charges          (D&A, stock-based comp, impairments, deferred taxes,
                               losses/gains on asset sales)
  ± Changes in working capital (Δ receivables, Δ inventory, Δ payables,
                               Δ deferred revenue, Δ accrued expenses)
= Cash from Operating Activities (CFO / OCF)
```

This walk is where most of the analytical value lives. Read it line by line:

- **Net income → OCF: the gap is the quality test.** If OCF persistently lags net income, the reported profits aren't converting to cash. Find out *where* in the reconciliation the divergence sits — that's almost always the location of the problem.
- **Depreciation & amortization.** A non-cash add-back. Compare D&A to capex (in the investing section): if **capex > D&A** persistently, the business is growing or replacing assets at higher prices; if **capex < D&A**, it's quietly under-investing — *harvesting* the business.
- **Stock-based compensation (SBC).** Added back as "non-cash" — but SBC is a **real economic cost**. The company hasn't paid cash, but it has handed away ownership, diluting you. Many tech companies report enormous operating cash flow that shrinks dramatically once you subtract SBC. **Build your own "cash earnings" that backs SBC out** — it is the single most distorted line item in modern reporting.
- **Working-capital changes — the swing factor.** A growing business *consumes* working capital (it has to fund inventory and receivables before customers pay). A shrinking business *releases* working capital, which can give a misleadingly strong cash flow in a deteriorating year. Watch specifically for:
  - **One-time WC releases** flattering OCF in a weak year (stretching payables, delaying inventory purchases).
  - **Receivables growing faster than revenue** — channel stuffing or collection problems, draining cash even as reported revenue rises.
  - **Inventory builds** — looming write-down risk and demand softness.
  - **Deferred revenue growth** — a *leading indicator* of future recognized revenue for subscription businesses; its decline is an early warning sign.

### 2. Cash from Investing Activities (CFI) — *what is it doing with the cash?*

This is mostly about **capital expenditures** plus M&A. The composition tells you the company's investment strategy.

- **Capex — but split it in your head into *maintenance* vs. *growth*.** This is the most important distinction in the entire statement.
  - **Maintenance capex** is what's required just to keep existing operations running at current capacity.
  - **Growth capex** is what's invested in *new* capacity, products, or markets.
  - Companies rarely break this out cleanly. The pragmatic proxy: **D&A approximates maintenance capex** (imperfectly — inflation and technology change make replacement cost differ from historical depreciation). MD&A sometimes provides more color.
  - The distinction matters because **the cash available to owners is OCF minus *maintenance* capex, not total capex.** A company spending heavily on growth capex can be a wonderful investment if those projects earn high returns; one spending heavily just to stand still is structurally less attractive.
- **Capex intensity (capex / revenue)** classifies the business model. High intensity (utilities, airlines, telecom) means thin FCF margins and a requirement for durable competitive advantage to earn above the cost of capital.
- **Acquisitions** — track cumulative M&A spending over multiple years and cross-reference the **goodwill** line on the balance sheet. A company "growing" revenue 10% per year while spending substantial cash on acquisitions isn't truly growing 10% organically — back out the M&A contribution.
- **Asset sales and divestitures** can signal strategic refocus, but a pattern of selling assets to generate cash for operations is a distress tell — the company is consuming itself.
- **Investments and securities transactions** — usually noise for non-financial companies; the real action is in capex and M&A.

### 3. Cash from Financing Activities (CFF) — *how is it funded, and what is it returning?*

The capital-allocation section. This is where you judge management's discipline.

- **Net debt activity.** Issuing debt to fund operations is a warning. Issuing debt at low rates to fund buybacks *might* be smart financial engineering — or might be borrowing to buy back stock at peak prices, which is value destruction. Track the cumulative pattern.
- **Buybacks and the dilution offset.** Headline buyback dollars are deceiving — a company that "buys back $5B" but issues $4B of stock-based comp has *net* returned $1B. Many companies in tech run on this treadmill, where buybacks merely mop up dilution from compensation. Always compute **net** repurchases (gross buybacks minus equity issuance), and check at what prices the buybacks happened — buying back at expensive multiples destroys value just as surely as a bad acquisition.
- **Dividends paid.** Compare to FCF. **Borrowing to pay dividends is a distress signal**, full stop.
- **Total shareholder returns** = dividends + *net* buybacks. Comparing this against FCF tells you the payout ratio on a true-cash basis.

### A sanity check that always works
The three sections should sum, period by period, to the **change in cash on the balance sheet.** If they don't reconcile, you've miscounted or there's an FX adjustment line you missed. This 30-second check catches arithmetic errors and confirms you're reading the statement correctly.

---

## Free Cash Flow — the central concept, and its variants

**Free cash flow** is the cash the business produces after funding the investment needed to keep operating. Almost every valuation approach is, underneath, a forecast of FCF. The definitions multiply for good reasons:

| Definition | Formula | When to use |
|---|---|---|
| **FCF (the basic version)** | OCF − Capex | The default; FCF available to all capital providers (debt + equity) |
| **FCF to the Firm (FCFF)** | OCF + After-tax interest − Capex | Unlevered FCF — the input for an enterprise-value DCF |
| **FCF to Equity (FCFE)** | FCF + Net borrowing | What's available specifically to equity holders |
| **"True" / SBC-adjusted FCF** | OCF − Capex − SBC | The honest cash figure for SBC-heavy businesses |
| **Owner earnings (Buffett)** | Net income + D&A + non-cash − *maintenance* capex − required ΔWC | The cleanest measure of cash that can be distributed without impairing the business |

> **Owner earnings is worth internalizing.** Reported FCF deducts *total* capex, which mixes maintenance and growth. Owner earnings deducts only maintenance capex, isolating the cash actually distributable today. It's a more honest valuation input than either net income or simple FCF — and it's the framework most thoughtful long-term investors use, even if they don't call it by Buffett's name.

---

## The Numbers and Ratios That Matter

### Cash quality of earnings
| Ratio | Formula | What it tells you |
|---|---|---|
| **OCF / Net income** | Operating cash flow ÷ Net income | **The master quality ratio** — should be ≥1 over a cycle |
| **Cash conversion** | FCF ÷ Net income | How much "profit" becomes cash you can actually use |
| **Accruals ratio** | (Net income − OCF) ÷ Average assets | High positive accruals predict weaker future earnings (Sloan anomaly) |

### Cash profitability and intensity
| Ratio | Formula | Read |
|---|---|---|
| FCF margin | FCF ÷ Revenue | Cash profitability — generally superior to net margin |
| Capex / Revenue | Capex ÷ Revenue | Capital intensity of the business |
| Capex / D&A | Capex ÷ D&A | >1 investing/replacing at higher prices; <1 harvesting |
| FCF / EBITDA | FCF ÷ EBITDA | How much EBITDA actually becomes cash (often *far* less than 100%) |
| CROIC | FCF ÷ Invested capital | Cash return on capital — a cleaner cousin of ROIC |

### Valuation and shareholder yield
| Ratio | Formula | Read |
|---|---|---|
| FCF yield | FCF ÷ Market cap | The cash-based valuation metric; inverse of P/FCF |
| Dividend payout (cash) | Dividends ÷ FCF | Sustainability of the dividend |
| Total shareholder yield | (Dividends + Net buybacks) ÷ Market cap | True cash returned to owners |

---

## Quality Checks and Red Flags Specific to the CFS

- **Persistently OCF < Net income** — the headline earnings-quality warning of the entire series. Find the line where the gap lives.
- **OCF flattered by one-time working-capital releases** — stretching payables, draining inventory, accelerating collections. Strip those out to see normalized OCF.
- **SBC inflating reported OCF.** Many companies hand you "operating cash flow" with SBC added back as if it's free. It isn't. Subtract it.
- **Capitalizing costs that belong in operating expense** (notably internally developed software). The accounting effect is dirty: those costs move from CFO into CFI (capex), *inflating* OCF while doing nothing real for the business. Watch for big capitalized-software lines.
- **"Geography" games** — restructuring charges, litigation settlements, or other operating costs classified as investing or financing to keep them out of OCF.
- **Deferred capex.** Skipping needed capex one period to "make" the FCF number; the cost just shows up next year (or as a quality problem down the road).
- **Persistent negative FCF in mature businesses.** For early-stage growth companies, negative FCF can be rational if the unit economics work. For mature companies, it's a problem dressed up as a growth story.
- **Companies' own "adjusted FCF"** — many disclose a custom FCF figure with creative add-backs. **Always rebuild FCF yourself from the statement** rather than trusting management's preferred number.
- **Acquisition-funded "growth."** Strong-looking operating performance that depends on a constant pipeline of acquisitions; back out M&A spending from CFI and see whether organic FCF justifies the valuation on its own.

---

## The Cross-Cutting Workflow

1. **Use 5+ years of cash flow data** and average them. A single year of FCF is too lumpy to be reliable — capex spikes, working-capital swings, and one-time items dominate. Five-year average FCF is the unit of intrinsic value.
2. **Compute OCF/Net income and FCF/Net income over those 5 years.** If either persistently sits below 1, scrutinize the gap before doing anything else.
3. **Reconcile the three sections to the change in cash on the balance sheet** — a 30-second sanity check.
4. **Estimate maintenance vs. growth capex** (use D&A as the baseline maintenance proxy) and build **owner earnings**. That figure, not net income or simple FCF, is the cleanest input to valuation.
5. **Strip out SBC** (subtract it from OCF) for any business where it's a material cost — practically all of tech.
6. **Audit the financing section as a capital-allocation report card.** Are buybacks *net* of dilution? At what prices? Is debt being used wisely? Is the dividend covered by FCF, or by borrowing?
7. **Read the CFS with the income statement and balance sheet open.** Every line on the CFS traces to a change in one or the other; the three statements only become powerful when you read them as a single system.

> **The bottom line:** the income statement tells you a story; the balance sheet shows you a snapshot of strength; the cash flow statement tells you whether the story is actually true. If you have time for only one statement, this is the one — because over a long enough horizon, **a company's value is the present value of the cash it will produce for its owners**, and *every* number on this statement either is that cash, or determines how much of it survives. Read it well and most of the games in the other two statements quietly stop working on you.

*Educational material only — not investment advice.*
