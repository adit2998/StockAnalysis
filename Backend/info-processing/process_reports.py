import fitz
import re
import pymongo
import gridfs

import re
import json

def prettify_text(text):
    # Convert the entire text to lowercase
    text = text.lower()
    
    # Capitalize the first letter of each sentence
    sentences = re.split(r'(?<=[.!?])\s+', text)  # Split at sentence boundaries
    formatted_text = ' '.join(sentence.capitalize() for sentence in sentences)
    
    return formatted_text

def open_document(mongo_uri, db_name, filename):
     # Connect to MongoDB
    client = pymongo.MongoClient(mongo_uri)
    db = client[db_name]
    
    # Access GridFS collection
    fs = gridfs.GridFS(db)
    
    # Retrieve the file from GridFS by filename
    pdf_file = fs.find_one({"filename": filename})
    
    if pdf_file is None:
        raise FileNotFoundError(f"File with filename '{filename}' not found in the database.")
    
    # Read the binary data of the PDF
    pdf_data = pdf_file.read()
    
    # Open the PDF document using fitz
    document = fitz.open(stream=pdf_data, filetype="pdf")

    return document

def extract_headers(document):
    # Extract headers
    text = ""

    # Extract text from the first few pages (TOC is usually at the beginning)
    for page_num in range(min(10, len(document))):  # Check first 10 pages
        text += document[page_num].get_text()

    # Identify potential TOC entries using regex
    toc_pattern = re.compile(r"(Item\s\d+[A-Z]*\.\s+.+?)\s+\d{1,4}", re.MULTILINE)
    matches = toc_pattern.findall(text)

    # Clean up and store results
    toc = [match.strip() for match in matches]
    headers = [re.sub(r'^Item \d+[A-Z]?\.\s*', '', item) for item in toc]

    return headers

def detect_toc_end(document, max_toc_pages=10):
    """
    Detects the last page of the Table of Contents dynamically.

    :param document: The parsed PDF document (list of pages).
    :param max_toc_pages: Maximum pages to scan for TOC (default: 10).
    :return: Page number where TOC ends (first actual section start).
    """
    toc_start = None
    toc_end_page = 0  # Default to first page if TOC is not found

    for page_num in range(min(max_toc_pages, len(document))):  # Scan first few pages
        text = document[page_num].get_text()
        
        # Detect "Table of Contents" to mark TOC start
        if not toc_start and re.search(r"Table of Contents", text, re.IGNORECASE):
            toc_start = page_num  # First occurrence of TOC
        
        # If TOC was found, find the first "Item X."
        if toc_start is not None and re.search(r"Item\s*\d+[A-Z]*\.", text):
            toc_end_page = page_num  # First actual section start
            break  # Stop as soon as we find the first real "Item X."

    return toc_end_page + 1  # Start extracting from the next page after TOC

def extract_section(document, section_heading):
    """
    Extracts text from a specific section of a PDF while dynamically skipping the Table of Contents.

    :param document: The parsed PDF document (list of pages).
    :param section_heading: The heading of the section to extract.
    :return: Extracted text from the specified section.
    """
    try:
        # Detect TOC end dynamically
        toc_end_page = detect_toc_end(document)        

        full_text = ""

        # Extract text starting after the TOC
        for page_num in range(toc_end_page, len(document)):  
            full_text += document[page_num].get_text() + "\n"  

        # Normalize text for better matching
        full_text = re.sub(r'\s+', ' ', full_text).upper()  
        normalized_heading = re.sub(r'\s+', ' ', section_heading.strip()).upper()  

        # Search for the actual section start
        match = re.search(rf"(ITEM\s*\d+[A-Z]*\.\s*{re.escape(normalized_heading)})", full_text, re.IGNORECASE)
        if not match:
            # print(f"Section heading '{normalized_heading}' not found.")
            return "Section not found."

        start_idx = match.start()
        # print(f"Found section '{normalized_heading}' at position: {start_idx}")

        # Search for the next "Item X." to determine section end
        next_section_match = re.search(r"(ITEM\s*\d+[A-Z]*\.)", full_text[start_idx+1:], re.IGNORECASE)
        end_idx = next_section_match.start() + start_idx if next_section_match else len(full_text)

        # print(f"Next section found at position: {end_idx}")

        # Extract section text
        extracted_section = full_text[start_idx:end_idx].strip()
        # return extracted_section
        return prettify_text(extracted_section) if extracted_section else "Section not found."

    except Exception as e:
        return f"Error: {str(e)}"
    

def extract_content(mongo_uri, db_name, filename):
    
    document = open_document(mongo_uri, db_name, filename)
    headers = extract_headers(document)

    info_dict = {
        'file_name': filename
    }
    
    for header in headers:
        info_dict[header] = extract_section(document, header)        

    document.close()

    return info_dict

def extract_content_with_sections(mongo_uri, db_name, ticker, filename):
    
    document = open_document(mongo_uri, db_name, filename)
    headers = extract_headers(document)    
    
    sections_dict = {}

    for header in headers:
        sections_dict[header] = extract_section(document, header)        

    info_dict = {
        'ticker': ticker,
        'file_name': filename,
        'sections': sections_dict
    }

    document.close()

    return info_dict


# Example usage
mongo_uri = "mongodb://localhost:27017"
db_name = "financial_reports"
ticker = 'ai'
filename = "ai_10-Q_report.pdf"

report_content = extract_content_with_sections(mongo_uri, db_name, ticker, filename)


def write_dict_to_mongo(mongo_uri, db_name, collection_name, data_dict):
    """
    Writes a dictionary as a single document into a MongoDB collection.
    
    Parameters:
        mongo_uri (str): The MongoDB connection URI.
        db_name (str): The name of the database.
        collection_name (str): The name of the collection.
        data_dict (dict): The dictionary to write as a document.
    
    Returns:
        str: The ID of the inserted document.
    """
    if not isinstance(data_dict, dict):
        raise ValueError("The data must be a dictionary.")
    
    # Connect to MongoDB
    client = pymongo.MongoClient(mongo_uri)
    db = client[db_name]
    collection = db[collection_name]
    
    # Insert the dictionary into the collection
    result = collection.insert_one(data_dict)
    
    # Return the ID of the inserted document
    return str(result.inserted_id)

def process_and_save_report(mongo_uri, db_name_read, db_name_write, collection_name, ticker, filename):
    report_content = extract_content_with_sections(mongo_uri, db_name_read, ticker, filename)
    result = write_dict_to_mongo(mongo_uri, db_name_write, collection_name, report_content)
    return result

mongo_uri = "mongodb://localhost:27017"
db_name_read = "financial_reports"
db_name_write = "testDb"
collection_name = "company_reports"
ticker = 'amzn'
filename = "amzn_10-Q_report.pdf"

# print('New entry created: ', write_dict_to_mongo(mongo_uri, db_name, collection_name, report_content))
print(process_and_save_report(mongo_uri, db_name_read, db_name_write, collection_name, ticker, filename))