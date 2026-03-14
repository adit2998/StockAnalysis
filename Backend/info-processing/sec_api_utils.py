import pandas as pd
import requests

headers = {"User-Agent": "adit29my@gmail.com"} 

def getCIKNumber(ticker, headers=headers):
    ticker = ticker.upper().replace(".", "-")
    ticker_json = requests.get(
        "https://www.sec.gov/files/company_tickers.json", headers=headers
    ).json()

    for company in ticker_json.values():
        if company["ticker"] == ticker:
            cik = str(company["cik_str"]).zfill(10)
            return cik
    raise ValueError(f"Ticker {ticker} not found in SEC database")

def getCompanyInfo(ticker, headers=headers):
    cik = getCIKNumber(ticker)
    headers = headers
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    company_json = requests.get(url, headers=headers).json()

    return company_json

def getSubmissionData(ticker, headers=headers):
    cik = getCIKNumber(ticker)
    headers = headers
    url = f"https://data.sec.gov/submissions/CIK{cik}.json"
    company_json = requests.get(url, headers=headers).json()
    
    return pd.DataFrame(company_json["filings"]["recent"])

def getFilteredFilings(ticker, form, headers=headers):
    company_filings_df = getSubmissionData(
        ticker, headers=headers
    )
    if (form=='ten_k'):
        df = company_filings_df[company_filings_df["form"] == "10-K"]
    elif (form=='ten_q'):
        df = company_filings_df[company_filings_df["form"] == "10-Q"]
    
    df = df.set_index("reportDate")
    accession_df = df["accessionNumber"]
    return accession_df    

def getFacts(ticker, headers=headers):
    cik = getCIKNumber(ticker)
    url = f"https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
    company_facts = requests.get(url, headers=headers).json()
    return company_facts

def getFactsDF(ticker, headers=headers):
    facts = getFacts(ticker, headers)
    us_gaap_data = facts["facts"]["us-gaap"]
    df_data = []
    for fact, details in us_gaap_data.items():
        for unit in details["units"]:
            for item in details["units"][unit]:
                row = item.copy()
                row["fact"] = fact
                df_data.append(row)

    df = pd.DataFrame(df_data)
    df["end"] = pd.to_datetime(df["end"])
    df["start"] = pd.to_datetime(df["start"])
    df = df.drop_duplicates(subset=["fact", "end", "val"])
    df.set_index("end", inplace=True)
    labels_dict = {fact: details["label"] for fact, details in us_gaap_data.items()}
    return df, labels_dict

def getAnnualFacts(ticker, headers=headers):
    accession_nums = getFilteredFilings(ticker, form='ten_k')
    df, label_dict = getFactsDF(ticker, headers)
    ten_k = df[df["accn"].isin(accession_nums)]
    ten_k = ten_k[ten_k.index.isin(accession_nums.index)]
    pivot = ten_k.pivot_table(values="val", columns="fact", index="end")
    pivot.rename(columns=label_dict, inplace=True)
    return pivot.T

def getQuarterlyFacts(ticker, headers=headers):
    accession_nums = getFilteredFilings(ticker, form='ten_q')
    df, label_dict = getFactsDF(ticker, headers)
    ten_q = df[df["accn"].isin(accession_nums)]
    ten_q = ten_q[ten_q.index.isin(accession_nums.index)].reset_index(drop=False)
    ten_q = ten_q.drop_duplicates(subset=["fact", "end"], keep="last")
    pivot = ten_q.pivot_table(values="val", columns="fact", index="end")
    pivot.rename(columns=label_dict, inplace=True)
    return pivot.T

def getHistoricalData(ticker):
    quarterlyDF = getQuarterlyFacts(ticker)
    annualDF = getAnnualFacts(ticker)

    # Convert index column to 0th 'fact' column
    quarterlyDF = quarterlyDF.reset_index()
    annualDF = annualDF.reset_index()

    # Merge dataframes based on the new 'fact' column
    combined_df = pd.merge(quarterlyDF, annualDF, on='fact')    

    # Convert the 'fact' column to 'index' again
    combined_df = combined_df.set_index('fact')

    # Sort the columns by date
    combined_df = combined_df.reindex(sorted(combined_df.columns), axis=1)

    return combined_df