from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
import pandas as pd
import yfinance as yf
from typing import List, Dict, Any, Optional
import io
import json
from datetime import datetime, timedelta
import aiofiles
import os
import tempfile
from difflib import SequenceMatcher
import numpy as np

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
analysis_results = {}

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
        processed_data_store[ice_timestamp]["has_analysis"] = True
        
        filename = processed_data_store[ice_timestamp]["filename"]
        analysis_results[filename] = analysis
        
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
                "has_analysis": data.get("has_analysis", False)
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

@app.get("/export/analysis/{filename}")
async def export_analysis(filename: str):
    """Export analysis results to Excel file"""
    timestamp_entry = None
    for timestamp, data in processed_data_store.items():
        if data.get("filename") == filename and data.get("has_analysis"):
            timestamp_entry = data
            break
    
    if not timestamp_entry:
        raise HTTPException(status_code=404, detail="Analysis not found for this file")
    
    analysis = timestamp_entry["analysis"]
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
        temp_path = tmp_file.name
    
    try:
        with pd.ExcelWriter(temp_path, engine='openpyxl') as writer:
            summary_data = {
                'Metric': ['Securities Count', 'PFF Current Price', 'Trading Signals', 'Analysis Timestamp'],
                'Value': [
                    analysis.get('ice_securities_count', 0),
                    f"${analysis.get('pff_current_price', 0)}",
                    len(analysis.get('trading_signals', [])),
                    analysis.get('timestamp', '')
                ]
            }
            summary_df = pd.DataFrame(summary_data)
            summary_df.to_excel(writer, sheet_name='Summary', index=False)
            
            if analysis.get('trading_signals'):
                signals_df = pd.DataFrame(analysis['trading_signals'])
                signals_df.to_excel(writer, sheet_name='Trading_Signals', index=False)
            
            if analysis.get('opportunities'):
                opportunities_df = pd.DataFrame(analysis['opportunities'])
                opportunities_df.to_excel(writer, sheet_name='Opportunities', index=False)
            
            if analysis.get('recommendations'):
                recommendations_df = pd.DataFrame(analysis['recommendations'])
                recommendations_df.to_excel(writer, sheet_name='Recommendations', index=False)
            
            if analysis.get('position_sizing'):
                position_data = {
                    'Metric': ['PFF Market Cap', 'Total ICE Exposure', 'Recommended Position Size', 'Risk Per Trade', 'Diversification Note'],
                    'Value': [
                        analysis['position_sizing'].get('pff_market_cap', 0),
                        analysis['position_sizing'].get('total_ice_exposure', 0),
                        analysis['position_sizing'].get('recommended_position_size', 0),
                        analysis['position_sizing'].get('risk_per_trade', ''),
                        analysis['position_sizing'].get('diversification_note', '')
                    ]
                }
                position_df = pd.DataFrame(position_data)
                position_df.to_excel(writer, sheet_name='Position_Sizing', index=False)
            
            if analysis.get('timing_analysis'):
                timing_data = {
                    'Metric': ['Rebalancing Frequency', 'Optimal Entry Window', 'Exit Strategy', 'Monitoring Frequency', 'Next Rebalancing Estimate'],
                    'Value': [
                        analysis['timing_analysis'].get('rebalancing_frequency', ''),
                        analysis['timing_analysis'].get('optimal_entry_window', ''),
                        analysis['timing_analysis'].get('exit_strategy', ''),
                        analysis['timing_analysis'].get('monitoring_frequency', ''),
                        analysis['timing_analysis'].get('next_rebalancing_estimate', '')
                    ]
                }
                timing_df = pd.DataFrame(timing_data)
                timing_df.to_excel(writer, sheet_name='Timing_Analysis', index=False)
        
        export_filename = f"ice_analysis_{filename.replace('.xlsx', '')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return FileResponse(
            path=temp_path,
            filename=export_filename,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    
    except Exception as e:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=f"Error creating Excel file: {str(e)}")

@app.get("/export/trading-signals/{filename}")
async def export_trading_signals(filename: str):
    """Export only trading signals to Excel file"""
    timestamp_entry = None
    for timestamp, data in processed_data_store.items():
        if data.get("filename") == filename and data.get("has_analysis"):
            timestamp_entry = data
            break
    
    if not timestamp_entry:
        raise HTTPException(status_code=404, detail="Analysis not found for this file")
    
    analysis = timestamp_entry["analysis"]
    trading_signals = analysis.get('trading_signals', [])
    
    if not trading_signals:
        raise HTTPException(status_code=404, detail="No trading signals found")
    
    with tempfile.NamedTemporaryFile(delete=False, suffix='.xlsx') as tmp_file:
        temp_path = tmp_file.name
    
    try:
        signals_df = pd.DataFrame(trading_signals)
        
        buy_signals = signals_df[signals_df['action'] == 'BUY'].copy()
        sell_signals = signals_df[signals_df['action'] == 'SELL/SHORT'].copy()
        
        with pd.ExcelWriter(temp_path, engine='openpyxl') as writer:
            signals_df.to_excel(writer, sheet_name='All_Signals', index=False)
            
            if not buy_signals.empty:
                buy_signals.to_excel(writer, sheet_name='Buy_Signals', index=False)
            
            if not sell_signals.empty:
                sell_signals.to_excel(writer, sheet_name='Sell_Signals', index=False)
        
        export_filename = f"trading_signals_{filename.replace('.xlsx', '')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx"
        
        return FileResponse(
            path=temp_path,
            filename=export_filename,
            media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
    
    except Exception as e:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=f"Error creating Excel file: {str(e)}")

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

def get_next_quarter_end() -> str:
    """Calculate the next quarter end date for rebalancing timing"""
    from datetime import datetime, timedelta
    import calendar
    
    now = datetime.now()
    quarter_ends = [
        datetime(now.year, 3, 31),
        datetime(now.year, 6, 30), 
        datetime(now.year, 9, 30),
        datetime(now.year, 12, 31)
    ]
    
    for quarter_end in quarter_ends:
        if quarter_end > now:
            return quarter_end.strftime("%Y-%m-%d")
    
    return datetime(now.year + 1, 3, 31).strftime("%Y-%m-%d")

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
        "recommendations": [],
        "trading_signals": [],
        "position_sizing": {},
        "timing_analysis": {}
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
        
        trading_signals = []
        
        if 'symbol' in df.columns and 'weight' in df.columns:
            if pd.api.types.is_numeric_dtype(df['weight']):
                high_weight_threshold = df['weight'].quantile(0.8)
                potential_additions = df[df['weight'] > high_weight_threshold]
                
                for _, security in potential_additions.iterrows():
                    signal = {
                        "ticker": security.get('symbol', 'N/A'),
                        "action": "BUY",
                        "reasoning": f"High weight ({security.get('weight', 0):.2f}%) suggests likely PFF addition",
                        "confidence": "HIGH" if security.get('weight', 0) > df['weight'].quantile(0.9) else "MEDIUM",
                        "target_allocation": f"{security.get('weight', 0):.2f}%",
                        "sector": security.get('sector', 'Unknown'),
                        "dividend_yield": security.get('dividend_yield', 'N/A')
                    }
                    trading_signals.append(signal)
        
        if 'weight' in df.columns and pd.api.types.is_numeric_dtype(df['weight']):
            low_weight_threshold = df['weight'].quantile(0.2)
            potential_removals = df[df['weight'] < low_weight_threshold]
            
            for _, security in potential_removals.iterrows():
                signal = {
                    "ticker": security.get('symbol', 'N/A'),
                    "action": "SELL/SHORT",
                    "reasoning": f"Low weight ({security.get('weight', 0):.2f}%) suggests likely PFF removal",
                    "confidence": "MEDIUM",
                    "target_allocation": f"{security.get('weight', 0):.2f}%",
                    "sector": security.get('sector', 'Unknown')
                }
                trading_signals.append(signal)
        
        analysis["trading_signals"] = trading_signals
        
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
        
        pff_market_cap = pff_data.get("info", {}).get("marketCap", 13000000000)
        total_ice_value = analysis.get("total_market_value", 0)
        
        position_sizing = {
            "pff_market_cap": pff_market_cap,
            "total_ice_exposure": total_ice_value,
            "recommended_position_size": min(pff_market_cap * 0.01, 1000000),
            "risk_per_trade": "2% of portfolio maximum",
            "diversification_note": "Spread across 5-10 top signals to reduce single-security risk"
        }
        analysis["position_sizing"] = position_sizing
        
        timing_analysis = {
            "rebalancing_frequency": "Quarterly (March, June, September, December)",
            "optimal_entry_window": "2-4 weeks before quarter end",
            "exit_strategy": "Within 1 week of rebalancing announcement",
            "monitoring_frequency": "Weekly weight tracking recommended",
            "next_rebalancing_estimate": get_next_quarter_end()
        }
        analysis["timing_analysis"] = timing_analysis
        
        recommendations = []
        
        if trading_signals:
            buy_signals = [s for s in trading_signals if s["action"] == "BUY"]
            sell_signals = [s for s in trading_signals if s["action"] == "SELL/SHORT"]
            
            if buy_signals:
                high_confidence_buys = [s for s in buy_signals if s["confidence"] == "HIGH"]
                recommendations.append({
                    "action": "IMMEDIATE_BUY",
                    "description": f"Execute buy orders for {len(high_confidence_buys)} high-confidence securities: {', '.join([s['ticker'] for s in high_confidence_buys[:3]])}{'...' if len(high_confidence_buys) > 3 else ''}",
                    "priority": "high",
                    "tickers": [s["ticker"] for s in high_confidence_buys],
                    "reasoning": "High weight allocation suggests imminent PFF inclusion"
                })
            
            if sell_signals:
                recommendations.append({
                    "action": "MONITOR_FOR_SHORT",
                    "description": f"Monitor {len(sell_signals)} securities for shorting opportunities: {', '.join([s['ticker'] for s in sell_signals[:3]])}{'...' if len(sell_signals) > 3 else ''}",
                    "priority": "medium",
                    "tickers": [s["ticker"] for s in sell_signals],
                    "reasoning": "Low weight allocation suggests potential PFF removal"
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
                "action": "CONTINUE_MONITORING",
                "description": "No immediate trading signals detected. Continue monitoring for weight changes.",
                "priority": "low"
            })
        
        analysis["recommendations"] = recommendations
    
    return analysis
