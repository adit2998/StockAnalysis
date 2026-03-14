from create_dataframe import makeCompanyDataframe
from pymongo import MongoClient
import pandas as pd
import os

# Connect to MongoDB
mongo_uri = os.getenv("MONGO_URI", "mongodb://localhost:27017/")
client = MongoClient(mongo_uri)
db = client['testDb']
collection = db['financial_trends']


def save_dataframe_to_csv(ticker):
    historical_financials_df = makeCompanyDataframe(ticker)
    historical_financials_df.to_csv('processed_dataframe.csv', index=True)

def save_financial_trends(ticker, collection):
    df = makeCompanyDataframe(ticker) 
    # Initialize the financials dictionary
    financials = {}
    for _, row in df.iterrows():
        fact_name = row['fact']

        # Skip if the fact_name is NaN or None
        if pd.isna(fact_name):
            continue

        series = []
        for date, value in row.drop('fact').items():
            if pd.notna(date) and pd.notna(value):
                # Convert date to string just in case it's not
                series.append({
                    'date': str(date),
                    'value': float(value)
                })

        # Only add the series if there's at least one valid entry
        if series:
            financials[str(fact_name)] = series
    
    # Prepare final document
    company_doc = {
        'ticker': ticker.lower(),        
        'financials': financials
    }

    collection.update_one(
        {'ticker': ticker.lower()},
        {'$set': company_doc},
        upsert=True
    )

    print(f"Saved financials for {ticker} to MongoDB.")


def save_dataframe_to_db(ticker, collection):
    historical_financials_df = makeCompanyDataframe(ticker)   
    financials_data = historical_financials_df.to_dict(orient='records')
    
    # Create the document structure
    document = {
        "ticker": ticker,
        "financials": financials_data
    }

    # Insert the document into the collection
    collection.insert_one(document)
    print(f"Data for ticker '{ticker}' has been saved to MongoDB.")


def load_collection_to_dataframe(ticker, collection):
    # Find the document for the given ticker
    document = collection.find_one({"ticker": ticker})
    
    if not document:
        raise ValueError(f"No data found for ticker: {ticker}")
    
    # Extract the 'financials' field and convert to DataFrame
    financials_data = document.get("financials", [])
    dataframe = pd.DataFrame(financials_data)
    
    dataframe.to_csv('extracted_dataframe.csv', index=True)



# save_financial_trends('goog', collection)

# save_dataframe_to_csv('goog')

save_dataframe_to_db('aapl', collection)

# load_collection_to_dataframe('aapl', collection)
