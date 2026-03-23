from pymongo import MongoClient
from sec_api_utils import getCompanyInfo
from create_dataframe import makeCompanyDataframe
from save_reports_info import get_all_form_urls
from config import mongo_uri, db_name
from process_reports import extract_content_with_sections, write_report_to_mongo
from sec_api_utils import FormType
import gridfs
from weasyprint import HTML
from io import BytesIO
import pandas as pd

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

    df = makeCompanyDataframe(ticker)

    # Ensure unique index for faster upserts
    collection.create_index([("ticker", 1), ("metric", 1)], unique=True)

    for _, row in df.iterrows():
        metric = row["fact"]

        for date_col in df.columns:
            if date_col == "fact":
                continue

            value = row[date_col]

            if value is None or (isinstance(value, float) and pd.isna(value)):
                continue

            # Upsert: update if date exists, else push new
            result = collection.update_one(
                {"ticker": ticker, "metric": metric, "values.date": str(date_col)},
                {"$set": {"values.$.value": float(value)}}
            )

            if result.matched_count == 0:
                collection.update_one(
                    {"ticker": ticker, "metric": metric},
                    {"$push": {"values": {"date": str(date_col), "value": float(value)}}},
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


def save_report_sections(ticker, form_types):

    collection_name = "report_sections"
    
    company_reports = get_reports_list(ticker, form_types)
    for company_report in company_reports:
        filename = company_report['File name']
        report_content = extract_content_with_sections(mongo_uri, db_name, ticker, filename)
        print(f"Saving  - {report_content['file_name']}")
        write_report_to_mongo(mongo_uri, db_name, collection_name, report_content)        



def process_company(ticker, form_types=[FormType.TEN_K]):

    # 1. Add to the list of processed companies
    add_to_companies_list(ticker)

    # 2. Company financials
    save_company_financials(ticker)

    # 3. Reports list
    save_company_reports_list(ticker, form_types)

    # 4. Actual reports pdfs
    save_report_pdfs(ticker, form_types)

    # 5. Report sections
    save_report_sections(ticker, form_types)


form_types = [FormType.TEN_K]
process_company('AMZN', form_types)
