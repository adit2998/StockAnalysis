#!/usr/bin/env python3
"""
CLI entry point for company processing triggered from the Node.js backend.
Usage: python process_cli.py '<json_params>'

Params shape:
{
  "ticker": "CRWD",
  "include10K": true,       // default true
  "include10Q": true,       // default true
  "includeProxy": true,     // default true
  "summarize10K": false,    // default false
  "num10KSummaries": 4,     // used when summarize10K=true
  "summarize10Q": false,
  "num10QSummaries": 2,
  "summarizeProxy": false,
  "numProxySummaries": 1
}
"""
import sys
import json

from company_processing_pipeline import (
    add_to_companies_list,
    save_company_financials,
    save_company_reports_list,
    save_report_pdfs,
    save_report_sections,
    save_financial_statements,
)
from sec_api_utils import FormType


def run(params):
    ticker = params['ticker'].upper()

    form_types = []
    if params.get('include10K', True):
        form_types.append(FormType.TEN_K)
    if params.get('include10Q', True):
        form_types.append(FormType.TEN_Q)
    if params.get('includeProxy', True):
        form_types.append(FormType.DEF_14A)
    if not form_types:
        form_types = [FormType.TEN_K, FormType.TEN_Q, FormType.DEF_14A]

    print(f"[process_cli] Starting pipeline for {ticker}, form_types={[f.value for f in form_types]}")

    add_to_companies_list(ticker)
    save_company_financials(ticker)
    save_company_reports_list(ticker, form_types)
    save_report_pdfs(ticker, form_types)

    max_10k   = params.get('num10KSummaries', 0)   if params.get('summarize10K')   else 0
    max_10q   = params.get('num10QSummaries', 0)   if params.get('summarize10Q')   else 0
    max_proxy = params.get('numProxySummaries', 1) if params.get('summarizeProxy') else 0

    if FormType.TEN_K in form_types:
        save_report_sections(ticker, [FormType.TEN_K], max_summaries=max_10k)
    if FormType.TEN_Q in form_types:
        save_report_sections(ticker, [FormType.TEN_Q], max_summaries=max_10q)
    if FormType.DEF_14A in form_types:
        save_report_sections(ticker, [FormType.DEF_14A], max_summaries=max_proxy)

    save_financial_statements(ticker)
    print(f"[process_cli] Processing complete for {ticker}")


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: python process_cli.py '<json_params>'")
        sys.exit(1)
    run(json.loads(sys.argv[1]))
