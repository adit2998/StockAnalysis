// remove_company_data.js
// Pass variables via --eval before the script file.
//
// Usage:
//   mongosh "mongodb://localhost:27017" \
//     --eval "var ticker='AAPL'; var dbName='stockanalysis';" \
//     remove_company_data.js
//
//   mongosh "mongodb://localhost:27017" \
//     --eval "var ticker='AAPL'; var dbName='stockanalysis'; var collections='reports_list,report_summaries,report_sections,gridfs';" \
//     remove_company_data.js
//
// Variables:
//   ticker      Required. The ticker symbol (case-insensitive, e.g. 'AAPL')
//   dbName      Optional. Database name to use (e.g. 'stockanalysis'). Defaults to db in connection string.
//   collections Optional. Comma-separated list of collections to clean.
//               If omitted, cleans ALL collections.
//               Valid values: companies_list, company_financials, financial_trends,
//                             reports_list, report_summaries, report_sections,
//                             generated_reports, income_statements, balance_sheets,
//                             cash_flow_statements, stock_quotes, gridfs, users
//
// Examples:
//   # Remove ALL data for a company (recommended form — explicit dbName avoids wrong-db issues)
//   mongosh "mongodb://localhost:27017" \
//     --eval "var ticker='GOOG'; var dbName='stockanalysis';" \
//     remove_company_data.js
//
//   # Remove only SEC filing data (reports + PDFs)
//   mongosh "mongodb://localhost:27017" \
//     --eval "var ticker='GOOG'; var dbName='stockanalysis'; var collections='reports_list,report_summaries,report_sections,gridfs';" \
//     remove_company_data.js
//
//   # Remove only financial statement data
//   mongosh "mongodb://localhost:27017" \
//     --eval "var ticker='GOOG'; var dbName='stockanalysis'; var collections='company_financials,financial_trends,income_statements,balance_sheets,cash_flow_statements';" \
//     remove_company_data.js
//
//   # Remove generated reports and clean user references
//   mongosh "mongodb://localhost:27017" \
//     --eval "var ticker='GOOG'; var dbName='stockanalysis'; var collections='generated_reports,users';" \
//     remove_company_data.js

// ---------------------------------------------------------------------------
// Argument parsing
// ---------------------------------------------------------------------------

const TICKER = (typeof ticker !== "undefined" && ticker) ? ticker : null;
if (!TICKER) {
  print("ERROR: ticker variable is required.");
  print('Usage: mongosh <conn-str> --eval "var ticker=\'AAPL\';" remove_company_data.js');
  quit(1);
}

// Switch database if dbName is provided, otherwise use whatever db is active
if (typeof dbName !== "undefined" && dbName) {
  db = db.getSiblingDB(dbName);
}

print(`Using database: ${db.getName()}`);

const TICKER_UPPER = TICKER.toUpperCase();

// Case-insensitive regex for collections that may store ticker in either case
const TICKER_REGEX = new RegExp(`^${TICKER}$`, "i");

const ALL_COLLECTIONS = [
  "companies_list",
  "company_financials",
  "financial_trends",
  "reports_list",
  "report_summaries",
  "report_sections",
  "generated_reports",
  "income_statements",
  "balance_sheets",
  "cash_flow_statements",
  "stock_quotes",
  "gridfs",
  "users",
];

let targetCollections;
const collectionsArg = (typeof collections !== "undefined" && collections) ? collections : null;
if (collectionsArg) {
  targetCollections = collectionsArg.split(",").map((c) => c.trim());
  const invalid = targetCollections.filter((c) => !ALL_COLLECTIONS.includes(c));
  if (invalid.length > 0) {
    print(`ERROR: Unknown collection(s): ${invalid.join(", ")}`);
    print(`Valid options: ${ALL_COLLECTIONS.join(", ")}`);
    quit(1);
  }
} else {
  targetCollections = ALL_COLLECTIONS;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function report(collection, result) {
  const deleted = result.deletedCount !== undefined ? result.deletedCount : result.modifiedCount;
  const verb = result.deletedCount !== undefined ? "deleted" : "modified";
  print(`  [${collection}] ${deleted} document(s) ${verb}`);
}

function skip(collection) {
  print(`  [${collection}] skipped`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

print(`\n=== Removing data for ticker: ${TICKER_UPPER} ===`);
print(`Collections targeted: ${targetCollections.join(", ")}\n`);

// --- companies_list ---
if (targetCollections.includes("companies_list")) {
  const res = db.companies_list.deleteMany({ ticker: TICKER_REGEX });
  report("companies_list", res);
} else { skip("companies_list"); }

// --- company_financials ---
if (targetCollections.includes("company_financials")) {
  const res = db.company_financials.deleteMany({ ticker: TICKER_REGEX });
  report("company_financials", res);
} else { skip("company_financials"); }

// --- financial_trends ---
if (targetCollections.includes("financial_trends")) {
  const res = db.financial_trends.deleteMany({ ticker: TICKER_REGEX });
  report("financial_trends", res);
} else { skip("financial_trends"); }

// --- reports_list ---
// Field is stored as "Ticker" (capital T) in some routes
if (targetCollections.includes("reports_list")) {
  const res = db.reports_list.deleteMany({
    $or: [
      { ticker: TICKER_REGEX },
      { Ticker: TICKER_REGEX },
    ],
  });
  report("reports_list", res);
} else { skip("reports_list"); }

// --- report_summaries ---
if (targetCollections.includes("report_summaries")) {
  const res = db.report_summaries.deleteMany({ ticker: TICKER_REGEX });
  report("report_summaries", res);
} else { skip("report_summaries"); }

// --- report_sections ---
if (targetCollections.includes("report_sections")) {
  const res = db.report_sections.deleteMany({ ticker: TICKER_REGEX });
  report("report_sections", res);
} else { skip("report_sections"); }

// --- generated_reports ---
// Also removes the report ObjectIds from users.generated_reports if users is also targeted
if (targetCollections.includes("generated_reports")) {
  const reportIds = db.generated_reports
    .find({ ticker: TICKER_REGEX }, { _id: 1 })
    .toArray()
    .map((d) => d._id);

  const res = db.generated_reports.deleteMany({ ticker: TICKER_REGEX });
  report("generated_reports", res);

  if (reportIds.length > 0 && targetCollections.includes("users")) {
    // Pull deleted report IDs from users' generated_reports arrays in the same pass
    const userRes = db.users.updateMany(
      { generated_reports: { $in: reportIds } },
      { $pull: { generated_reports: { $in: reportIds } } }
    );
    print(`  [users] removed report refs from ${userRes.modifiedCount} user(s)`);
  }
} else { skip("generated_reports"); }

// --- income_statements ---
if (targetCollections.includes("income_statements")) {
  const res = db.income_statements.deleteMany({ ticker: TICKER_REGEX });
  report("income_statements", res);
} else { skip("income_statements"); }

// --- balance_sheets ---
if (targetCollections.includes("balance_sheets")) {
  const res = db.balance_sheets.deleteMany({ ticker: TICKER_REGEX });
  report("balance_sheets", res);
} else { skip("balance_sheets"); }

// --- cash_flow_statements ---
if (targetCollections.includes("cash_flow_statements")) {
  const res = db.cash_flow_statements.deleteMany({ ticker: TICKER_REGEX });
  report("cash_flow_statements", res);
} else { skip("cash_flow_statements"); }

// --- stock_quotes ---
if (targetCollections.includes("stock_quotes")) {
  const res = db.stock_quotes.deleteMany({ ticker: TICKER_REGEX });
  report("stock_quotes", res);
} else { skip("stock_quotes"); }

// --- GridFS (fs.files + fs.chunks) ---
// PDF documents stored with ticker in metadata
if (targetCollections.includes("gridfs")) {
  const files = db["fs.files"]
    .find({ "metadata.ticker": TICKER_REGEX }, { _id: 1 })
    .toArray();

  if (files.length > 0) {
    const fileIds = files.map((f) => f._id);
    const chunksRes = db["fs.chunks"].deleteMany({ files_id: { $in: fileIds } });
    const filesRes = db["fs.files"].deleteMany({ _id: { $in: fileIds } });
    print(`  [gridfs] ${filesRes.deletedCount} file(s) deleted, ${chunksRes.deletedCount} chunk(s) deleted`);
  } else {
    print("  [gridfs] 0 files deleted");
  }
} else { skip("gridfs"); }

// --- users ---
// Remove the ticker from the companies watchlist array.
// generated_reports refs are handled above if both collections are targeted.
if (targetCollections.includes("users")) {
  const pullRes = db.users.updateMany(
    { companies: TICKER_REGEX },
    { $pull: { companies: TICKER_REGEX } }
  );
  print(`  [users] removed "${TICKER_UPPER}" from companies array in ${pullRes.modifiedCount} user(s)`);

  // If generated_reports was NOT in the target list, we still need to pull the refs
  if (!targetCollections.includes("generated_reports")) {
    const reportIds = db.generated_reports
      .find({ ticker: TICKER_REGEX }, { _id: 1 })
      .toArray()
      .map((d) => d._id);
    if (reportIds.length > 0) {
      const refRes = db.users.updateMany(
        { generated_reports: { $in: reportIds } },
        { $pull: { generated_reports: { $in: reportIds } } }
      );
      print(`  [users] removed ${reportIds.length} dangling report ref(s) from ${refRes.modifiedCount} user(s)`);
    }
  }
} else { skip("users"); }

print(`\n=== Done ===\n`);
