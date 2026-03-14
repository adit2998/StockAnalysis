import pandas as pd
from sec_api_utils import getHistoricalData

headers = {"User-Agent": "adit29my@gmail.com"} 

def addColumns(df, ratioDictionary):
    for col_name, (required_cols, operation) in ratioDictionary.items():
        if all(col in df.columns for col in required_cols):
            df[col_name] = operation(df)
        else:
            print(f"Skipping '{col_name}': Missing required columns {required_cols}.")
    return df

def calculateRatios(dataDf):
    
    df = pd.DataFrame(dataDf).T
    # df.index = pd.to_datetime(df.index)

    if 'Revenue, Net (Deprecated 2018-01-31)' in df.columns:
        df['Effective Revenue'] = df['Revenue, Net (Deprecated 2018-01-31)'].fillna(df['Revenue from Contract with Customer, Excluding Assessed Tax'])
    else:
        df['Effective Revenue'] = df['Revenue from Contract with Customer, Excluding Assessed Tax']
    
    df['Operating Margin Ratio'] = df['Operating Income (Loss)'] / df['Effective Revenue']
    ratioDictionary = {
        'Gross Margin Ratio': (['Gross Profit', 'Effective Revenue'], lambda df: df['Gross Profit'] / df['Effective Revenue']),
        'Operating Margin Ratio': (['Operating Income (Loss)', 'Effective Revenue'], lambda df: df['Operating Income (Loss)'] / df['Effective Revenue']),
        'Net Profit Margin Ratio': (['Net Income (Loss) Attributable to Parent', 'Effective Revenue'], lambda df: df['Net Income (Loss) Attributable to Parent'] / df['Effective Revenue']),
        'Return on Assets Ratio': (['Net Income (Loss) Attributable to Parent', 'Assets'], lambda df: df['Net Income (Loss) Attributable to Parent'] / df['Assets']),
        'Return on Equity Ratio': (['Net Income (Loss) Attributable to Parent', 'Stockholders\' Equity Attributable to Parent'], lambda df: df['Net Income (Loss) Attributable to Parent'] / df['Stockholders\' Equity Attributable to Parent']),
        'Current Ratio': (['Assets, Current', 'Liabilities, Current'], lambda df: df['Assets, Current'] / df['Liabilities, Current']),
        'Quick Ratio': (['Assets, Current', 'Inventory, Net', 'Liabilities, Current'], lambda df: df['Assets, Current'] - df['Inventory, Net'] / df['Liabilities, Current']),
        'Cash Ratio': (['Cash and Cash Equivalents, at Carrying Value', 'Liabilities, Current'], lambda df: df['Cash and Cash Equivalents, at Carrying Value'] / df['Liabilities']),
        'Debt to Equity (D/E) Ratio': (['Liabilities', 'Stockholders\' Equity Attributable to Parent'], lambda df: df['Liabilities'] / df['Stockholders\' Equity Attributable to Parent']),
        'Debt to Assets Ratio': (['Liabilities', 'Assets'], lambda df: df['Liabilities'] / df['Assets']),
        'Interest Coverage Ratio': (['Operating Income (Loss)', 'Interest Expense'], lambda df: df['Operating Income (Loss)'] / df['Interest Expense']),
        'Equity Ratio': (['Stockholders\' Equity Attributable to Parent', 'Assets'], lambda df: df['Stockholders\' Equity Attributable to Parent'] / df['Assets']),
        'Asset Turnover Ratio': (['Effective Revenue', 'Assets'], lambda df: df['Effective Revenue'] / df['Assets']),
        'Inventory Turnover Ratio': (['Cost of Goods and Services Sold', 'Inventory, Net'], lambda df: df['Cost of Goods and Services Sold'] / df['Inventory, Net']),
        'Receivables Turnover Ratio': (['Effective Revenue', 'Accounts Receivable, after Allowance for Credit Loss, Current'], lambda df: df['Effective Revenue'] / df['Accounts Receivable, after Allowance for Credit Loss, Current']),
        'Days Sales outstanding': (['Receivables Turnover Ratio'], lambda df: 365 / df['Receivables Turnover Ratio']),
        'Days Inventory outstanding': (['Inventory Turnover Ratio'], lambda df: 365 / df['Inventory Turnover Ratio']),
        'Payables Turnover Ratio': (['Cost of Goods and Services Sold', 'Accounts Payable, Current'], lambda df: df['Cost of Goods and Services Sold'] / df['Accounts Payable, Current']),
        'Operating Cash Flow Ratio': (['Net Cash Provided by (Used in) Operating Activities, Continuing Operations', 'Liabilities'], lambda df: df['Net Cash Provided by (Used in) Operating Activities, Continuing Operations'] / df['Liabilities']),
        'Capital Expenditure Coverage Ratio': (['Net Cash Provided by (Used in) Operating Activities, Continuing Operations', 'Payments to Acquire Property, Plant, and Equipment'], lambda df: df['Net Cash Provided by (Used in) Operating Activities, Continuing Operations'] / df['Payments to Acquire Property, Plant, and Equipment']),        
    }

    df_with_ratios = addColumns(df, ratioDictionary)    
    
    return df_with_ratios.T


def makeCompanyDataframe(ticker):
    historical_data_df = getHistoricalData(ticker)
    enhanced_df = calculateRatios(historical_data_df)

    # Convert column names to strings
    enhanced_df.columns = enhanced_df.columns.astype(str)

    # Convert all timestamp cells to strings
    enhanced_df = enhanced_df.applymap(lambda x: str(x) if isinstance(x, pd.Timestamp) else x)
    
    enhanced_df = enhanced_df.reset_index()
    
    return enhanced_df

    