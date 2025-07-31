import pandas as pd
import sys

def examine_excel_file(filename):
    try:
        excel_file = pd.ExcelFile(filename)
        print(f"File: {filename}")
        print(f"Number of sheets: {len(excel_file.sheet_names)}")
        print(f"Sheet names: {excel_file.sheet_names}")
        print()
        
        for sheet_name in excel_file.sheet_names:
            print(f"=== Sheet: {sheet_name} ===")
            df = pd.read_excel(filename, sheet_name=sheet_name)
            print(f"Rows: {len(df)}")
            print(f"Columns: {len(df.columns)}")
            print(f"Column names: {list(df.columns)}")
            print(f"First few rows:")
            print(df.head(3))
            print()
            
    except Exception as e:
        print(f"Error examining file: {e}")

if __name__ == "__main__":
    examine_excel_file("PHGY.xlsx")
