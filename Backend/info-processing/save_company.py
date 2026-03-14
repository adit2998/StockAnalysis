from sec_api_utils import getCompanyInfo
from pymongo import MongoClient
import pandas as pd
import os

# Connect to MongoDB
mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(mongo_uri)

# Use for saving on docker
db = client['testDb']
companies_collection = db['companies']

def save_company_details(ticker):
    company_json = getCompanyInfo(ticker)    

    company_data = {
        "name": company_json.get("name"),
        "sic": company_json.get("sic"),
        "sicDescription": company_json.get("sicDescription"),
        "ticker": ticker
    }

    # Check for existing record with same ticker
    if companies_collection.find_one({"ticker": ticker}):
        print(f"Company with ticker '{ticker}' already exists. Skipping insert.")
        return

    # Insert the document
    result = companies_collection.insert_one(company_data)
    print(f"Inserted document with _id: {result.inserted_id}")

save_company_details('amzn')