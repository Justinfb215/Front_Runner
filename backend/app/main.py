from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import pandas as pd
import yfinance as yf
from typing import List, Dict, Any, Optional
import io
import json
from datetime import datetime, timedelta
import aiofiles
import os

app = FastAPI(title="ICE ETF Analyzer", description="Automated ICE data analysis for ETF front-running opportunities")

# Disable CORS. Do not remove this for full-stack development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

processed_data_store = {}
historical_data_store = {}
pff_data_store = {}

@app.get("/healthz")
async def healthz():
    return {"status": "ok"}

@app.post("/upload/ice-data")
async def upload_ice_data(file: UploadFile = File(...)):
    """Upload and process ICE data file (CSV/Excel with multiple sheets)"""
    try:
        content = await file.read()
        
        if file.filename.endswith('.csv'):
            df = pd.read_csv(io.StringIO(content.decode('utf-8')))
            sheets_data = {"main": df.to_dict('records')}
            sheet_info = {"main": {"rows": len(df), "columns": list(df.columns)}}
        elif file.filename.endswith(('.xlsx', '.xls')):
            excel_file = pd.ExcelFile(io.BytesIO(content))
            sheets_data = {}
            sheet_info = {}
            
            for sheet_name in excel_file.sheet_names:
                df = pd.read_excel(io.BytesIO(content), sheet_name=sheet_name)
                sheets_data[sheet_name] = df.to_dict('records')
                sheet_info[sheet_name] = {"rows": len(df), "columns": list(df.columns)}
        else:
            raise HTTPException(status_code=400, detail="Unsupported file format. Please upload CSV or Excel files.")
        
        timestamp = datetime.now().isoformat()
        processed_data_store[timestamp] = {
            "filename": file.filename,
            "raw_data": sheets_data,
            "sheet_info": sheet_info,
            "processed_data": None,
            "analysis": None
        }
        
        return {
            "message": "File uploaded successfully",
            "timestamp": timestamp,
            "sheets": sheet_info,
            "total_sheets": len(sheets_data)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/process/ice-data/{timestamp}")
async def process_ice_data(timestamp: str, sheet_name: Optional[str] = None):
    """Clean, organize and process ICE data from specified sheet"""
    try:
        if timestamp not in processed_data_store:
            raise HTTPException(status_code=404, detail="Data not found")
        
        raw_data = processed_data_store[timestamp]["raw_data"]
        
        if isinstance(raw_data, dict) and sheet_name:
            if sheet_name not in raw_data:
                raise HTTPException(status_code=404, detail=f"Sheet '{sheet_name}' not found")
            df = pd.DataFrame(raw_data[sheet_name])
        elif isinstance(raw_data, dict):
            first_sheet = list(raw_data.keys())[0]
            df = pd.DataFrame(raw_data[first_sheet])
        else:
            df = pd.DataFrame(raw_data)
        
        cleaned_df = clean_ice_data(df)
        processed_df = organize_ice_data(cleaned_df)
        
        processed_records = []
        for record in processed_df.to_dict('records'):
            clean_record = {}
            for key, value in record.items():
                if pd.isna(value):
                    clean_record[key] = None
                elif hasattr(value, 'dtype') and 'int' in str(value.dtype):
                    clean_record[key] = int(value)
                elif hasattr(value, 'dtype') and 'float' in str(value.dtype):
                    clean_record[key] = float(value)
                elif str(type(value)).startswith('<class \'numpy.'):
                    try:
                        if '.' in str(value):
                            clean_record[key] = float(str(value))
                        else:
                            clean_record[key] = int(str(value))
                    except (ValueError, TypeError):
                        clean_record[key] = str(value)
                else:
                    clean_record[key] = value
            processed_records.append(clean_record)
        
        if not processed_data_store[timestamp]["processed_data"]:
            processed_data_store[timestamp]["processed_data"] = {}
        
        sheet_key = sheet_name if sheet_name else "main"
        processed_data_store[timestamp]["processed_data"][sheet_key] = processed_records
        
        return {
            "message": "Data processed successfully",
            "sheet": sheet_key,
            "processed_rows": int(len(processed_df)),
            "columns": list(processed_df.columns)
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing data: {str(e)}")

@app.get("/fetch/pff-data")
async def fetch_pff_data():
    """Fetch current PFF ETF data for comparison"""
    try:
        pff = yf.Ticker("PFF")
        
        info = pff.info
        
        hist = pff.history(period="1mo")
        
        timestamp = datetime.now().isoformat()
        pff_data_store[timestamp] = {
            "info": info,
            "price_history": hist.to_dict('index'),
            "current_price": float(hist['Close'].iloc[-1]) if not hist.empty else None
        }
        
        return {
            "message": "PFF data fetched successfully",
            "timestamp": timestamp,
            "current_price": pff_data_store[timestamp]["current_price"],
            "market_cap": info.get("marketCap"),
            "nav": info.get("navPrice")
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching PFF data: {str(e)}")

@app.post("/analyze/comparison/{ice_timestamp}")
async def analyze_comparison(ice_timestamp: str, pff_timestamp: Optional[str] = None, sheet_name: Optional[str] = None):
    """Compare ICE data with PFF ETF data to identify opportunities"""
    try:
        if ice_timestamp not in processed_data_store:
            raise HTTPException(status_code=404, detail="ICE data not found")
        
        if not pff_timestamp:
            pff_timestamp = max(pff_data_store.keys()) if pff_data_store else None
            
        if not pff_timestamp or pff_timestamp not in pff_data_store:
            raise HTTPException(status_code=404, detail="PFF data not found. Please fetch PFF data first.")
        
        processed_data = processed_data_store[ice_timestamp]["processed_data"]
        if processed_data is None:
            raise HTTPException(status_code=404, detail="ICE data not processed yet")
        
        if isinstance(processed_data, dict):
            if sheet_name and sheet_name in processed_data:
                ice_data = processed_data[sheet_name]
            else:
                ice_data = processed_data[list(processed_data.keys())[0]]
        else:
            ice_data = processed_data
            
        pff_data = pff_data_store[pff_timestamp]
        
        analysis = perform_comparison_analysis(ice_data, pff_data)
        
        processed_data_store[ice_timestamp]["analysis"] = analysis
        
        return {
            "message": "Analysis completed successfully",
            "analysis": analysis
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error performing analysis: {str(e)}")

@app.get("/data/processed")
async def get_processed_data():
    """Get all processed data entries"""
    return {
        "ice_data_entries": int(len(processed_data_store)),
        "pff_data_entries": int(len(pff_data_store)),
        "entries": [
            {
                "timestamp": ts,
                "filename": data["filename"],
                "sheets": data.get("sheet_info", {}),
                "has_processed_data": data["processed_data"] is not None,
                "has_analysis": data["analysis"] is not None
            }
            for ts, data in processed_data_store.items()
        ]
    }

@app.get("/data/sheets/{timestamp}")
async def get_sheet_info(timestamp: str):
    """Get information about sheets in uploaded file"""
    if timestamp not in processed_data_store:
        raise HTTPException(status_code=404, detail="Data not found")
    
    return {
        "timestamp": timestamp,
        "filename": processed_data_store[timestamp]["filename"],
        "sheets": processed_data_store[timestamp].get("sheet_info", {})
    }

def clean_ice_data(df: pd.DataFrame) -> pd.DataFrame:
    """Clean and standardize ICE data"""
    df = df.dropna(how='all').dropna(axis=1, how='all')
    
    df.columns = df.columns.str.strip().str.lower().str.replace(' ', '_')
    
    df = df.drop_duplicates()
    
    return df

def organize_ice_data(df: pd.DataFrame) -> pd.DataFrame:
    """Organize and sort ICE data"""
    sort_columns = []
    for col in ['symbol', 'ticker', 'security_name', 'market_value', 'weight']:
        if col in df.columns:
            sort_columns.append(col)
    
    if sort_columns:
        df = df.sort_values(sort_columns)
    
    return df

def match_securities_by_description(ice_data: List[Dict], pff_holdings: List[Dict]) -> List[Dict]:
    """Match ICE securities with PFF holdings using description similarity"""
    from difflib import SequenceMatcher
    
    matches = []
    
    for ice_security in ice_data:
        ice_name = ice_security.get('security_name', '').lower()
        ice_symbol = ice_security.get('symbol', '').lower()
        
        best_match = None
        best_score = 0
        
        for pff_holding in pff_holdings:
            pff_description = pff_holding.get('description', '').lower()
            
            name_score = SequenceMatcher(None, ice_name, pff_description).ratio()
            symbol_score = SequenceMatcher(None, ice_symbol, pff_description).ratio()
            
            score = max(name_score, symbol_score)
            
            if score > best_score and score > 0.6:  # 60% similarity threshold
                best_score = score
                best_match = pff_holding
        
        if best_match:
            matches.append({
                "ice_security": ice_security,
                "pff_holding": best_match,
                "match_score": float(best_score),
                "weight_difference": abs(
                    ice_security.get('weight', 0) - best_match.get('weight', 0)
                ) if 'weight' in ice_security and 'weight' in best_match else None
            })
    
    return matches

def perform_comparison_analysis(ice_data: List[Dict], pff_data: Dict) -> Dict[str, Any]:
    """Perform detailed comparison analysis between ICE data and PFF ETF data"""
    
    analysis = {
        "timestamp": datetime.now().isoformat(),
        "ice_securities_count": len(ice_data),
        "pff_current_price": pff_data.get("current_price"),
        "opportunities": [],
        "risks": [],
        "delta_analysis": {},
        "liquidity_assessment": {},
        "flow_analysis": {},
        "recommendations": []
    }
    
    df = pd.DataFrame(ice_data)
    
    if not df.empty:
        if 'market_value' in df.columns:
            market_value_sum = df['market_value'].sum() if pd.api.types.is_numeric_dtype(df['market_value']) else None
            analysis["total_market_value"] = float(market_value_sum) if market_value_sum is not None else None
        
        if 'weight' in df.columns:
            if pd.api.types.is_numeric_dtype(df['weight']):
                weight_stats = df['weight'].describe()
                analysis["weight_distribution"] = {
                    "count": float(weight_stats['count']),
                    "mean": float(weight_stats['mean']),
                    "std": float(weight_stats['std']),
                    "min": float(weight_stats['min']),
                    "25%": float(weight_stats['25%']),
                    "50%": float(weight_stats['50%']),
                    "75%": float(weight_stats['75%']),
                    "max": float(weight_stats['max'])
                }
            else:
                analysis["weight_distribution"] = None
        
        opportunities = []
        
        if 'weight' in df.columns and pd.api.types.is_numeric_dtype(df['weight']):
            high_weight_threshold = df['weight'].quantile(0.75)
            high_weight_securities = df[df['weight'] > high_weight_threshold]
            if not high_weight_securities.empty:
                opportunities.append({
                    "type": "high_weight_rebalancing",
                    "description": f"Found {len(high_weight_securities)} high-weight securities above 75th percentile",
                    "count": int(len(high_weight_securities)),
                    "threshold": float(high_weight_threshold),
                    "securities": high_weight_securities[['symbol', 'weight']].to_dict('records') if 'symbol' in df.columns else []
                })
        
        if 'dividend_yield' in df.columns and pd.api.types.is_numeric_dtype(df['dividend_yield']):
            high_yield_threshold = df['dividend_yield'].quantile(0.8)
            high_yield_securities = df[df['dividend_yield'] > high_yield_threshold]
            if not high_yield_securities.empty:
                opportunities.append({
                    "type": "high_dividend_yield",
                    "description": f"Found {len(high_yield_securities)} securities with high dividend yields",
                    "count": int(len(high_yield_securities)),
                    "avg_yield": float(high_yield_securities['dividend_yield'].mean()),
                    "securities": high_yield_securities[['symbol', 'dividend_yield']].to_dict('records') if 'symbol' in df.columns else []
                })
        
        # Sector concentration analysis
        if 'sector' in df.columns:
            sector_counts = df['sector'].value_counts()
            concentration_threshold = int(len(df) * 0.3)  # Sectors with >30% concentration
            dominant_sectors = sector_counts[sector_counts > concentration_threshold]
            if not dominant_sectors.empty:
                opportunities.append({
                    "type": "sector_concentration",
                    "description": f"High concentration in {len(dominant_sectors)} sectors",
                    "sectors": {sector: int(count) for sector, count in dominant_sectors.items()}
                })
        
        analysis["opportunities"] = opportunities if opportunities else [
            {
                "type": "rebalancing_opportunity",
                "description": "Potential securities for PFF rebalancing detected",
                "count": int(len(df))
            }
        ]
        
        risks = []
        
        if 'credit_rating' in df.columns:
            rating_counts = df['credit_rating'].value_counts()
            low_grade_ratings = ['BB+', 'BB', 'BB-', 'B+', 'B', 'B-', 'CCC+', 'CCC', 'CCC-']
            low_grade_count = sum(rating_counts.get(rating, 0) for rating in low_grade_ratings)
            if low_grade_count > 0:
                risks.append({
                    "type": "credit_risk",
                    "description": f"Found {low_grade_count} securities with below investment grade ratings",
                    "count": int(low_grade_count),
                    "percentage": float(low_grade_count / len(df) * 100)
                })
        
        if 'maturity_date' in df.columns:
            try:
                df['maturity_date'] = pd.to_datetime(df['maturity_date'])
                near_term_maturity = df[df['maturity_date'] <= datetime.now() + timedelta(days=365)]
                if not near_term_maturity.empty:
                    risks.append({
                        "type": "maturity_risk",
                        "description": f"Found {len(near_term_maturity)} securities maturing within 1 year",
                        "count": int(len(near_term_maturity))
                    })
            except:
                pass
        
        analysis["risks"] = risks
        
        pff_price = pff_data.get("current_price", 0)
        if pff_price and 'market_value' in df.columns:
            total_market_value = analysis.get("total_market_value", 0)
            analysis["delta_analysis"] = {
                "pff_price_impact": float(pff_price),
                "total_exposure": float(total_market_value) if total_market_value else 0,
                "price_sensitivity": float(total_market_value / pff_price) if pff_price and total_market_value else 0
            }
        
        recommendations = []
        
        if opportunities:
            if any(opp["type"] == "high_weight_rebalancing" for opp in opportunities):
                recommendations.append({
                    "action": "monitor_rebalancing",
                    "description": "Monitor high-weight securities for potential PFF rebalancing activity",
                    "priority": "high"
                })
            
            if any(opp["type"] == "high_dividend_yield" for opp in opportunities):
                recommendations.append({
                    "action": "yield_opportunity",
                    "description": "Consider positioning for high-yield securities before rebalancing",
                    "priority": "medium"
                })
        
        if risks:
            if any(risk["type"] == "credit_risk" for risk in risks):
                recommendations.append({
                    "action": "credit_review",
                    "description": "Review credit quality of holdings for potential downgrades",
                    "priority": "high"
                })
        
        if not recommendations:
            recommendations.append({
                "action": "monitor",
                "description": "Continue monitoring for rebalancing signals",
                "priority": "medium"
            })
        
        analysis["recommendations"] = recommendations
    
    return analysis
