from pymongo import MongoClient
from pymongo.errors import OperationFailure
from sec_api_utils import getCompanyInfo, getFacts
from create_dataframe import makeCompanyDataframe
from save_reports_info import get_all_form_urls
from config import mongo_uri, db_name
from process_reports import extract_content_with_sections, write_report_to_mongo, summarize_report, write_summary_to_mongo
from sec_api_utils import FormType
import gridfs
from weasyprint import HTML
from io import BytesIO
import pandas as pd
import json

_CF_KEYWORDS = [
    'cash inflow', 'cash outflow', 'cash flow', 'operating activities',
    'investing activities', 'financing activities', 'proceeds from',
    'repurchase', 'repayment', 'purchase of',
]
_IS_KEYWORDS = [
    'for the period', 'net result', 'revenue', 'expense', 'income', 'loss',
    'earnings per share', 'per share', 'charged against earnings', 'recognized in',
]

def _classify_facts(facts_json):
    """Returns dict: xbrl_key -> {'label': str, 'description': str, 'statement': str}"""
    us_gaap = facts_json['facts']['us-gaap']
    result = {}
    for key, entry in us_gaap.items():
        label = entry.get('label', '')
        description = entry.get('description') or ''
        desc_lower = description.lower()
        is_instant = all(
            not item.get('start')
            for unit_items in entry['units'].values()
            for item in unit_items[:5]
        )
        if is_instant:
            statement = 'Balance Sheet'
        else:
            cf_hit = any(p in desc_lower for p in _CF_KEYWORDS)
            is_hit = any(p in desc_lower for p in _IS_KEYWORDS)
            if cf_hit and not is_hit:
                statement = 'Cash Flow'
            elif is_hit and not cf_hit:
                statement = 'Income Statement'
            elif cf_hit and is_hit:
                statement = 'Ambiguous'
            else:
                statement = 'Unclassified'
        result[key] = {'label': label, 'description': description, 'statement': statement}
    return result

def get_database():
    """
    Establish connection to MongoDB and return the database object
    """
    client = MongoClient(mongo_uri)
    db = client[db_name]
    return db


def add_to_companies_list(ticker):
    """
    Saves basic company info to a collection of a list of companies

    Args:
        ticker (str): Company ticker symbol, e.g., "AAPL"        
    """
    db = get_database()
    companies_list_collection = db["companies_list"]

    company_json = getCompanyInfo(ticker)    

    company_data = {
        "name": company_json.get("name"),
        "sic": company_json.get("sic"),
        "sicDescription": company_json.get("sicDescription"),
        "ticker": ticker
    }

    # Check for existing record with same ticker
    if companies_list_collection.find_one({"ticker": ticker}):
        print(f"Company with ticker '{ticker}' already exists. Skipping insert.")
        return

    # Insert the document
    result = companies_list_collection.insert_one(company_data)
    print(f"Inserted document with _id: {result.inserted_id}")


def save_company_financials(ticker):
    """
    Saves all metrics from a financial dataframe for a company.

    Args:
        ticker (str): Company ticker symbol, e.g., "AAPL"
    """
    db = get_database()
    collection = db["company_financials"]

    # Classify all XBRL facts so we can tag each metric with its statement
    facts_json = getFacts(ticker)
    classification = _classify_facts(facts_json)
    # label → (xbrl_key, statement); labels can collide across XBRL keys so
    # later entries win — acceptable since the statement tag is the same for
    # same-label concepts
    label_to_meta = {v['label']: (k, v['statement'], v['description']) for k, v in classification.items()}

    df = makeCompanyDataframe(ticker)

    try:
        collection.drop_index([("ticker", 1), ("metric", 1)])
    except OperationFailure:
        pass  # index already gone
    collection.create_index("id", unique=True, sparse=True)

    for _, row in df.iterrows():
        label = row["fact"]

        xbrl_key, statement, description = label_to_meta.get(label, (None, 'Unclassified', ''))
        if xbrl_key:
            doc_id = f"{xbrl_key}_{ticker}"
        else:
            # Derived ratio labels won't have an XBRL key
            slug = label.replace(' ', '_').replace('/', '_').replace(',', '').replace('(', '').replace(')', '').replace('-', '_')
            doc_id = f"{slug}_{ticker}"

        for date_col in df.columns:
            if date_col == "fact":
                continue

            value = row[date_col]
            if value is None or (isinstance(value, float) and pd.isna(value)):
                continue

            date_str = str(date_col)
            val_float = float(value)

            base_fields = {"ticker": ticker, "metric": label, "description": description, "statement": statement}

            # Try to update the value for an existing date entry
            result = collection.update_one(
                {"id": doc_id, "values.date": date_str},
                {"$set": {**base_fields, "values.$.value": val_float}}
            )

            if result.matched_count == 0:
                # Doc doesn't exist yet, or this date isn't in values — push the new entry
                collection.update_one(
                    {"id": doc_id},
                    {
                        "$set": base_fields,
                        "$push": {"values": {"date": date_str, "value": val_float}}
                    },
                    upsert=True
                )

    print(f"Inserted metrics for {ticker}")



def get_reports_list(ticker, form_types):
    company_form_infos = []

    for form_type in form_types:        
        form_infos = get_all_form_urls(ticker, form_type)
        
        for form_info in form_infos:
            company_form_infos.append(form_info)

    return company_form_infos


def save_company_reports_list(ticker, form_types):        

    db = get_database()
    collection = db["reports_list"]

    company_reports = get_reports_list(ticker, form_types)
    collection.create_index("id", unique=True)

    # Insert all reports; if a report already exists, skip it
    for report in company_reports:
        collection.update_one(
            {"id": report["id"]},  # search by unique report id
            {"$set": report},      # insert or update the document
            upsert=True
        )

    print(f"Inserted report links for {ticker}")


def save_report_pdfs(ticker, form_types):

    db = get_database()
    fs = gridfs.GridFS(db)
    
    company_reports = get_reports_list(ticker, form_types)

    for company_report in company_reports:                
        primary_document = company_report['Primary document']
        form_type = company_report['Form Type']
        filing_date = company_report['Filing date']  
        reporting_date = company_report['Report date']              
        url = company_report['url']
        output_file_name = company_report['File name']

        # Convert HTML to PDF
        pdf_bytes = BytesIO()
        HTML(url).write_pdf(pdf_bytes)
        pdf_bytes.seek(0)  # Move pointer to the beginning

        # Generate a unique filename for the PDF        

        # Check if the file already exists in MongoDB by querying the filename
        if fs.find_one({"filename": output_file_name}):
            print(f"The file '{output_file_name}' already exists in the database. Skipping save.")
            continue

        try:
            # Store the PDF in MongoDB using GridFS
            fs.put(
                pdf_bytes, 
                filename=output_file_name,
                metadata={
                    "ticker": ticker,
                    "primary_document": primary_document,
                    "form_type": form_type,
                    "filing_date": filing_date,
                    "reporting_date": reporting_date,
                    "source_url": url
                }
            )
            
            print(f"PDF successfully saved to MongoDB as {output_file_name}")
        except Exception as e:
            print(f"An error occurred while saving the PDF: {e}")


def save_report_sections(ticker, form_types, max_summaries=None):

    company_reports = get_reports_list(ticker, form_types)
    summaries_done = 0

    for company_report in company_reports:
        filename = company_report['File name']
        form_type = company_report['Form Type']
        report_content = extract_content_with_sections(mongo_uri, db_name, ticker, filename, form_type=form_type)

        print(f"Saving sections - {report_content['file_name']}")
        write_report_to_mongo(mongo_uri, db_name, "report_sections", report_content)

        if max_summaries is not None and summaries_done >= max_summaries:
            print(f"Reached max_summaries limit ({max_summaries}), skipping summarization for {filename}.")
            continue

        db = get_database()
        already_summarized = db["report_summaries"].find_one({"id": filename, "sections": {"$exists": True, "$ne": {}}})
        if already_summarized:
            print(f"Summary already exists for {filename}, skipping.")
            continue

        print(f"Summarizing - {report_content['file_name']}")
        summarized_report_content = summarize_report(report_content)
        summaries_done += 1

        test_filename = f"test_summary_{filename.replace('.pdf', '')}.json"
        with open(test_filename, "w") as f:
            json.dump(summarized_report_content, f, indent=4)
        print(f"Test summary written to {test_filename}")

        print(f"Saving summaries - {summarized_report_content['file_name']}")
        write_summary_to_mongo(mongo_uri, db_name, "report_summaries", summarized_report_content)

def save_financial_statements(ticker):
    import yfinance as yf
    from datetime import datetime

    db = get_database()
    yf_ticker = yf.Ticker(ticker)

    statements = [
        ('income_statements',    'annual',    lambda: yf_ticker.income_stmt),
        ('income_statements',    'quarterly', lambda: yf_ticker.quarterly_income_stmt),
        ('balance_sheets',       'annual',    lambda: yf_ticker.balance_sheet),
        ('balance_sheets',       'quarterly', lambda: yf_ticker.quarterly_balance_sheet),
        ('cash_flow_statements', 'annual',    lambda: yf_ticker.cashflow),
        ('cash_flow_statements', 'quarterly', lambda: yf_ticker.quarterly_cashflow),
    ]

    for collection_name, period_type, fetch_fn in statements:
        try:
            df = fetch_fn()
            if df is None or df.empty:
                print(f"No data for {ticker} {collection_name} {period_type}, skipping.")
                continue

            periods = [col.strftime('%Y-%m-%d') for col in df.columns]
            rows = []
            for label, values in df.iterrows():
                rows.append({
                    'label': label,
                    'values': {
                        col.strftime('%Y-%m-%d'): (None if pd.isna(v) else int(v))
                        for col, v in values.items()
                    }
                })

            doc = {
                'ticker':      ticker.upper(),
                'period_type': period_type,
                'fetched_at':  datetime.utcnow().isoformat(),
                'periods':     periods,
                'rows':        rows,
            }

            db[collection_name].update_one(
                {'ticker': ticker.upper(), 'period_type': period_type},
                {'$set': doc},
                upsert=True
            )
            print(f"Saved {period_type} {collection_name} for {ticker} ({len(periods)} periods, {len(rows)} rows)")

        except Exception as e:
            print(f"Failed to save {period_type} {collection_name} for {ticker}: {e}")

def process_company(ticker, form_types=[FormType.TEN_K], max_summaries=None):

    # 1. Add to the list of processed companies
    add_to_companies_list(ticker)

    # 2. Company financials
    save_company_financials(ticker)

    # 3. Reports list
    save_company_reports_list(ticker, form_types)

    # 4. Actual reports pdfs
    save_report_pdfs(ticker, form_types)

    # 5. Report sections
    save_report_sections(ticker, form_types, max_summaries=max_summaries)

    # 6. Financial statements
    save_financial_statements(ticker)


form_types = [FormType.TEN_Q]
process_company('GOOG', form_types, max_summaries=0)
