import requests
from enum import Enum
from sec_api_utils import getCIKNumber
from weasyprint import HTML
import os
import pymongo
import gridfs
from io import BytesIO
from pymongo import MongoClient


headers = {"User-Agent": "adit29my@gmail.com"} 

class FormType(str, Enum):
    TEN_K = "10-K"
    TEN_Q = "10-Q"
    DEF_14A = "DEF 14A"

def get_latest_form_url(cik: str, requestedForm: FormType):
    """
    Fetch the URL for the latest 10-K/10-Q/Proxy statement filing of a company using the SEC EDGAR API.

    Parameters:
    cik (str): The Central Index Key (CIK) of the company.
    requestedForm (FormType): The type of form that can be analysed.

    Returns:
    str: URL of the latest filing of the requested form or a message if no filing is found.
    """    

    # SEC EDGAR API endpoint for company submissions
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"

    try:
        # Fetch data from SEC API
        response = requests.get(url, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        # Get filings from 'filings' key
        filings = data.get("filings", {}).get("recent", {})
        form_types = filings.get("form", [])
        accession_numbers = filings.get("accessionNumber", [])
        primary_documents = filings.get("primaryDocument", [])
        
        # Find the latest 10-Q filing
        for form, acc_num, primary_doc in zip(form_types, accession_numbers, primary_documents):
            if form == requestedForm:
                # Construct filing PDF URL
                pdf_url = f"https://www.sec.gov/Archives/edgar/data/{cik}/{acc_num.replace('-', '')}/{primary_doc}"
                # return f"Latest {requestedForm} Filing PDF URL: {pdf_url}"
                return pdf_url
        
        return f"Request report not found."
    
    except requests.exceptions.RequestException as e:
        return f"An error occurred: {e}"


def save_form(ticker: str, formType: FormType, url: str):

    # Define folder and file name
    folder_path = "Reports"
    output_file_name = f"{ticker}_{formType}_report.pdf"

    # Ensure the folder exists
    os.makedirs(folder_path, exist_ok=True)

    # Full file path
    output_pdf_path = os.path.join(folder_path, output_file_name)    

    # Check if the file already exists
    if os.path.exists(output_pdf_path):
        print(f"The file '{output_file_name}' already exists. Skipping save.")
        return

    try:
        # Convert the HTML from the URL to a PDF
        HTML(url).write_pdf(output_pdf_path)
        print(f"PDF successfully saved as {output_file_name}")
    except Exception as e:
        print(f"An error occurred: {e}")


# Connect to MongoDB (change URI if necessary)
mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(mongo_uri)
db = client["financial_reports"]  # Use your DB name
fs = gridfs.GridFS(db)

def save_pdf_to_mongo(ticker: str, formType: str, url: str):
    # Convert HTML to PDF
    pdf_bytes = BytesIO()
    HTML(url).write_pdf(pdf_bytes)
    pdf_bytes.seek(0)  # Move pointer to the beginning

    # Generate a unique filename for the PDF
    output_file_name = f"{ticker}_{formType}_report.pdf"

    # Check if the file already exists in MongoDB by querying the filename
    if fs.find_one({"filename": output_file_name}):
        print(f"The file '{output_file_name}' already exists in the database. Skipping save.")
        return

    try:
        # Store the PDF in MongoDB using GridFS
        fs.put(pdf_bytes, filename=output_file_name)
        print(f"PDF successfully saved to MongoDB as {output_file_name}")
    except Exception as e:
        print(f"An error occurred while saving the PDF: {e}")


def retrieve_pdf_from_mongo(filename: str, local_path: str):
    # Connect to MongoDB (change URI if necessary)
    mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
    client = MongoClient(mongo_uri)
    db = client["financial_reports"]  # Use your DB name
    fs = gridfs.GridFS(db)  # Access GridFS

    # Retrieve the file from GridFS by filename
    file = fs.find_one({"filename": filename})
    
    if file:
        # Read the binary data of the file
        pdf_data = file.read()

        # Save the PDF data locally
        with open(local_path, 'wb') as f:
            f.write(pdf_data)
        
        print(f"File '{filename}' saved locally as '{local_path}'")
    else:
        print(f"File '{filename}' not found in MongoDB.")


ticker = 'amzn'
formType = FormType.TEN_Q
cik = getCIKNumber(ticker)
url = get_latest_form_url(cik, formType)

# print(url)
# save_form(ticker, formType, url)

save_pdf_to_mongo(ticker, formType, url)

# retrieve_pdf_from_mongo(f"{ticker}_{formType}_report.pdf", f"{ticker}_{formType}_report.pdf")
# retrieve_pdf_from_mongo("ai_10-Q_report.pdf", "ai_10-Q_report.pdf")