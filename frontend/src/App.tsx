import React, { useState, useEffect } from 'react';
import { Upload, BarChart3, TrendingUp, AlertCircle, CheckCircle, FileText, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

interface ProcessedDataEntry {
  timestamp: string;
  filename: string;
  has_processed_data: boolean;
  has_analysis: boolean;
}

interface AnalysisResult {
  timestamp: string;
  ice_securities_count: number;
  pff_current_price: number;
  opportunities: Array<{
    type: string;
    description: string;
    count: number;
  }>;
  risks: Array<any>;
  recommendations: Array<{
    action: string;
    description: string;
    priority: string;
    tickers?: string[];
  }>;
  trading_signals?: Array<{
    ticker: string;
    action: string;
    reasoning: string;
    confidence: string;
    target_allocation: string;
    sector: string;
    dividend_yield?: string;
  }>;
  position_sizing?: {
    recommended_position_size: number;
    risk_per_trade: string;
    diversification_note: string;
  };
  timing_analysis?: {
    next_rebalancing_estimate: string;
    optimal_entry_window: string;
    exit_strategy: string;
  };
  total_market_value?: number;
  weight_distribution?: any;
}

function App() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const [processedData, setProcessedData] = useState<ProcessedDataEntry[]>([]);
  const [currentAnalysis, setCurrentAnalysis] = useState<AnalysisResult | null>(null);
  const [pffData, setPffData] = useState<any>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tradingBotStatus, setTradingBotStatus] = useState<any>(null);
  const [tradingSignals, setTradingSignals] = useState<any[]>([]);
  const [portfolioMetrics, setPortfolioMetrics] = useState<any>(null);
  const [riskDashboard, setRiskDashboard] = useState<any>(null);
  const [mlPredictions, setMlPredictions] = useState<any>(null);

  const fetchTradingBotStatus = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading-bot/status`);
      if (response.ok) {
        const data = await response.json();
        setTradingBotStatus(data);
        setPortfolioMetrics(data.performance_metrics);
      }
    } catch (error) {
      console.error('Failed to fetch trading bot status:', error);
    }
  };

  const fetchTradingSignals = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading-bot/signals`);
      if (response.ok) {
        const data = await response.json();
        setTradingSignals(data.signals || []);
        setMlPredictions(data.ml_predictions);
      }
    } catch (error) {
      console.error('Failed to fetch trading signals:', error);
    }
  };

  const fetchRiskDashboard = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading-bot/risk-dashboard`);
      if (response.ok) {
        const data = await response.json();
        setRiskDashboard(data);
      }
    } catch (error) {
      console.error('Failed to fetch risk dashboard:', error);
    }
  };

  const startTradingBot = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading-bot/start`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        setUploadMessage(`Trading Bot Started: ${data.message}`);
        fetchTradingBotStatus();
      }
    } catch (error) {
      console.error('Failed to start trading bot:', error);
    }
  };

  const stopTradingBot = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading-bot/stop`, {
        method: 'POST'
      });
      if (response.ok) {
        const data = await response.json();
        setUploadMessage(`Trading Bot Stopped: ${data.message}`);
        fetchTradingBotStatus();
      }
    } catch (error) {
      console.error('Failed to stop trading bot:', error);
    }
  };

  const executeSignal = async (signal: any) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/trading-bot/execute-signal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signal)
      });
      if (response.ok) {
        const data = await response.json();
        setUploadMessage(`Signal executed: ${data.status}`);
        fetchTradingBotStatus();
      }
    } catch (error) {
      console.error('Failed to execute signal:', error);
    }
  };

  useEffect(() => {
    fetchProcessedData();
  }, []);

  const fetchProcessedData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/data/processed`);
      const data = await response.json();
      setProcessedData(data.entries || []);
    } catch (error) {
      console.error('Error fetching processed data:', error);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadStatus('idle');
    }
  };

  const handleFileUpload = async () => {
    if (!selectedFile) return;

    setUploadStatus('uploading');
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const response = await fetch(`${API_BASE_URL}/upload/ice-data`, {
        method: 'POST',
        body: formData,
      });

      console.log('Upload response status:', response.status);
      const result = await response.json();
      console.log('Upload response data:', result);
      
      if (response.ok) {
        setUploadStatus('success');
        setUploadMessage(`File uploaded successfully! ${result.total_sheets} sheets processed`);
        fetchProcessedData();
      } else {
        setUploadStatus('error');
        setUploadMessage(result.detail || 'Upload failed');
      }
    } catch (error) {
      console.error('Upload error:', error);
      setUploadStatus('error');
      setUploadMessage('Network error during upload');
    }
  };

  const handleProcessData = async (timestamp: string) => {
    setIsProcessing(true);
    try {
      const response = await fetch(`${API_BASE_URL}/process/ice-data/${timestamp}`, {
        method: 'POST',
      });

      const result = await response.json();
      
      if (response.ok) {
        setUploadMessage('Data processed successfully!');
        fetchProcessedData();
      } else {
        setUploadMessage(result.detail || 'Processing failed');
      }
    } catch (error) {
      setUploadMessage('Network error during processing');
    }
    setIsProcessing(false);
  };

  const fetchPffData = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/fetch/pff-data`);
      const result = await response.json();
      
      if (response.ok) {
        setPffData(result);
        setUploadMessage('PFF data fetched successfully!');
      } else {
        setUploadMessage(result.detail || 'Failed to fetch PFF data');
      }
    } catch (error) {
      setUploadMessage('Network error fetching PFF data');
    }
  };

  const performAnalysis = async (iceTimestamp: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/analyze/comparison/${iceTimestamp}`, {
        method: 'POST',
      });

      const result = await response.json();
      
      if (response.ok) {
        setCurrentAnalysis(result.analysis);
        setUploadMessage('Analysis completed successfully!');
        fetchProcessedData();
      } else {
        setUploadMessage(result.detail || 'Analysis failed');
      }
    } catch (error) {
      setUploadMessage('Network error during analysis');
    }
  };

  const handleExportAnalysis = async (type: 'full' | 'signals') => {
    if (!currentAnalysis) return;
    
    const analysisFile = processedData.find(d => d.has_analysis);
    if (!analysisFile) return;
    
    try {
      const endpoint = type === 'full' 
        ? `/export/analysis/${analysisFile.filename}`
        : `/export/trading-signals/${analysisFile.filename}`;
      
      const response = await fetch(`${API_BASE_URL}${endpoint}`);
      
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const contentDisposition = response.headers.get('content-disposition');
        const filename = contentDisposition 
          ? contentDisposition.split('filename=')[1]?.replace(/"/g, '')
          : `ice_analysis_${Date.now()}.xlsx`;
        
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        console.error('Export failed:', response.statusText);
      }
    } catch (error) {
      console.error('Export error:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">ICE ETF Analyzer</h1>
          <p className="text-lg text-gray-600">
            Automated analysis of ICE data for ETF front-running opportunities
          </p>
        </div>

        {uploadMessage && (
          <Alert className={`mb-6 ${uploadStatus === 'error' ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
            {uploadStatus === 'error' ? <AlertCircle className="h-4 w-4" /> : <CheckCircle className="h-4 w-4" />}
            <AlertDescription>{uploadMessage}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-6">
            <TabsTrigger value="upload">Data Upload</TabsTrigger>
            <TabsTrigger value="process">Data Processing</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="trading-bot">Trading Bot</TabsTrigger>
            <TabsTrigger value="risk-dashboard">Risk</TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5" />
                  Upload ICE Data
                </CardTitle>
                <CardDescription>
                  Upload your ICE data files (CSV or Excel format) for analysis
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                  <input
                    type="file"
                    accept=".csv,.xlsx,.xls"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-upload"
                  />
                  <label htmlFor="file-upload" className="cursor-pointer">
                    <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                    <p className="text-lg font-medium text-gray-900 mb-2">
                      {selectedFile ? selectedFile.name : 'Choose a file or drag and drop'}
                    </p>
                    <p className="text-sm text-gray-500">CSV, Excel files up to 10MB</p>
                  </label>
                </div>
                
                {selectedFile && (
                  <Button 
                    onClick={handleFileUpload} 
                    disabled={uploadStatus === 'uploading'}
                    className="w-full"
                  >
                    {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload File'}
                  </Button>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="process" className="space-y-6">
            <div className="grid gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Data Processing
                  </CardTitle>
                  <CardDescription>
                    Process uploaded ICE data and fetch PFF ETF data for comparison
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Button onClick={fetchPffData} variant="outline" className="w-full">
                    Fetch Current PFF ETF Data
                  </Button>
                  
                  {pffData && (
                    <Alert className="border-blue-200 bg-blue-50">
                      <CheckCircle className="h-4 w-4" />
                      <AlertDescription>
                        PFF Data: Current Price ${pffData.current_price?.toFixed(2)} | Market Cap: ${(pffData.market_cap / 1e9)?.toFixed(2)}B
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Uploaded Files</CardTitle>
                  <CardDescription>Process your uploaded ICE data files</CardDescription>
                </CardHeader>
                <CardContent>
                  {processedData.length === 0 ? (
                    <p className="text-gray-500 text-center py-4">No files uploaded yet</p>
                  ) : (
                    <div className="space-y-3">
                      {processedData.map((entry) => (
                        <div key={entry.timestamp} className="flex items-center justify-between p-3 border rounded-lg">
                          <div>
                            <p className="font-medium">{entry.filename}</p>
                            <p className="text-sm text-gray-500">
                              Uploaded: {new Date(entry.timestamp).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {!entry.has_processed_data ? (
                              <Button 
                                onClick={() => handleProcessData(entry.timestamp)}
                                disabled={isProcessing}
                                size="sm"
                              >
                                {isProcessing ? 'Processing...' : 'Process'}
                              </Button>
                            ) : (
                              <Button 
                                onClick={() => performAnalysis(entry.timestamp)}
                                size="sm"
                                variant="outline"
                              >
                                Analyze
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="analysis" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Analysis Results
                </CardTitle>
                <CardDescription>
                  Comparison analysis between ICE data and PFF ETF
                </CardDescription>
              </CardHeader>
              <CardContent>
                {currentAnalysis ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-blue-900">Securities Count</h3>
                        <p className="text-2xl font-bold text-blue-700">{currentAnalysis.ice_securities_count}</p>
                      </div>
                      <div className="bg-green-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-green-900">PFF Price</h3>
                        <p className="text-2xl font-bold text-green-700">${currentAnalysis.pff_current_price?.toFixed(2)}</p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-purple-900">Trading Signals</h3>
                        <p className="text-2xl font-bold text-purple-700">{currentAnalysis.trading_signals?.length || 0}</p>
                      </div>
                    </div>

                    {currentAnalysis.trading_signals && currentAnalysis.trading_signals.length > 0 && (
                      <div>
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="text-lg font-semibold">Trading Signals</h3>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleExportAnalysis('signals')}
                          >
                            <Download className="h-4 w-4 mr-2" />
                            Export Signals
                          </Button>
                        </div>
                        <div className="space-y-2">
                          {currentAnalysis.trading_signals.map((signal, index) => (
                            <div key={index} className={`p-3 border rounded-lg ${
                              signal.action === 'BUY' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                            }`}>
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium text-lg">{signal.ticker}</p>
                                  <p className={`text-sm font-semibold ${
                                    signal.action === 'BUY' ? 'text-green-700' : 'text-red-700'
                                  }`}>{signal.action}</p>
                                  <p className="text-sm text-gray-600">{signal.reasoning}</p>
                                  <p className="text-xs text-gray-500">Target: {signal.target_allocation} | Sector: {signal.sector}</p>
                                </div>
                                <span className={`px-2 py-1 text-xs rounded-full ${
                                  signal.confidence === 'HIGH' ? 'bg-green-100 text-green-800' :
                                  signal.confidence === 'MEDIUM' ? 'bg-yellow-100 text-yellow-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {signal.confidence}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentAnalysis.position_sizing && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Position Sizing</h3>
                        <div className="bg-blue-50 p-4 rounded-lg">
                          <p><strong>Recommended Position Size:</strong> ${(currentAnalysis.position_sizing.recommended_position_size / 1000000).toFixed(1)}M</p>
                          <p><strong>Risk Per Trade:</strong> {currentAnalysis.position_sizing.risk_per_trade}</p>
                          <p><strong>Diversification:</strong> {currentAnalysis.position_sizing.diversification_note}</p>
                        </div>
                      </div>
                    )}

                    {currentAnalysis.timing_analysis && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Timing Analysis</h3>
                        <div className="bg-purple-50 p-4 rounded-lg">
                          <p><strong>Next Rebalancing:</strong> {currentAnalysis.timing_analysis.next_rebalancing_estimate}</p>
                          <p><strong>Optimal Entry:</strong> {currentAnalysis.timing_analysis.optimal_entry_window}</p>
                          <p><strong>Exit Strategy:</strong> {currentAnalysis.timing_analysis.exit_strategy}</p>
                        </div>
                      </div>
                    )}

                    {currentAnalysis.opportunities.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Identified Opportunities</h3>
                        <div className="space-y-2">
                          {currentAnalysis.opportunities.map((opp, index) => (
                            <div key={index} className="p-3 border border-green-200 bg-green-50 rounded-lg">
                              <p className="font-medium text-green-900">{opp.type}</p>
                              <p className="text-sm text-green-700">{opp.description}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {currentAnalysis.recommendations.length > 0 && (
                      <div>
                        <h3 className="text-lg font-semibold mb-3">Recommendations</h3>
                        <div className="space-y-2">
                          {currentAnalysis.recommendations.map((rec, index) => (
                            <div key={index} className="p-3 border border-blue-200 bg-blue-50 rounded-lg">
                              <p className="font-medium text-blue-900 capitalize">{rec.action}</p>
                              <p className="text-sm text-blue-700">{rec.description}</p>
                              {rec.tickers && (
                                <p className="text-xs text-blue-500 mt-1">Tickers: {rec.tickers.join(', ')}</p>
                              )}
                              <span className={`inline-block px-2 py-1 text-xs rounded-full mt-2 ${
                                rec.priority === 'high' ? 'bg-red-100 text-red-800' :
                                rec.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {rec.priority} priority
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-8">
                    No analysis results yet. Process some ICE data first.
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Data Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span>Uploaded Files:</span>
                      <span className="font-semibold">{processedData.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Processed Files:</span>
                      <span className="font-semibold">
                        {processedData.filter(d => d.has_processed_data).length}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Analyzed Files:</span>
                      <span className="font-semibold">
                        {processedData.filter(d => d.has_analysis).length}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">PFF ETF Status</CardTitle>
                </CardHeader>
                <CardContent>
                  {pffData ? (
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span>Current Price:</span>
                        <span className="font-semibold">${pffData.current_price?.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Last Updated:</span>
                        <span className="text-sm text-gray-500">
                          {new Date(pffData.timestamp).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-gray-500">No PFF data fetched yet</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleExportAnalysis('full')}
                    disabled={!currentAnalysis}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Full Analysis
                  </Button>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={() => handleExportAnalysis('signals')}
                    disabled={!currentAnalysis || !currentAnalysis.trading_signals?.length}
                  >
                    <BarChart3 className="h-4 w-4 mr-2" />
                    Export Trading Signals
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="trading-bot" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Super Frontrunner Trading Bot
                </CardTitle>
                <CardDescription>
                  Hedge fund-level algorithmic trading with advanced quantitative strategies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  {tradingBotStatus && (
                    <>
                      <div className={`p-4 rounded-lg ${tradingBotStatus.is_active ? 'bg-green-50' : 'bg-red-50'}`}>
                        <h3 className={`font-semibold ${tradingBotStatus.is_active ? 'text-green-900' : 'text-red-900'}`}>
                          Bot Status
                        </h3>
                        <p className={`text-xl font-bold ${tradingBotStatus.is_active ? 'text-green-700' : 'text-red-700'}`}>
                          {tradingBotStatus.is_active ? 'ACTIVE' : 'STOPPED'}
                        </p>
                      </div>
                      <div className="bg-blue-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-blue-900">Portfolio Value</h3>
                        <p className="text-xl font-bold text-blue-700">
                          ${(tradingBotStatus.portfolio_value / 1000000).toFixed(2)}M
                        </p>
                      </div>
                      <div className={`p-4 rounded-lg ${(tradingBotStatus.total_pnl || 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                        <h3 className={`font-semibold ${(tradingBotStatus.total_pnl || 0) >= 0 ? 'text-green-900' : 'text-red-900'}`}>
                          Total P&L
                        </h3>
                        <p className={`text-xl font-bold ${(tradingBotStatus.total_pnl || 0) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {tradingBotStatus.pnl_percentage?.toFixed(2)}%
                        </p>
                      </div>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <h3 className="font-semibold text-purple-900">Active Positions</h3>
                        <p className="text-xl font-bold text-purple-700">{tradingBotStatus.active_positions}</p>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-4">
                  <Button 
                    onClick={startTradingBot}
                    disabled={tradingBotStatus?.is_active}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Start Trading Bot
                  </Button>
                  <Button 
                    onClick={stopTradingBot}
                    disabled={!tradingBotStatus?.is_active}
                    variant="destructive"
                  >
                    Stop Trading Bot
                  </Button>
                  <Button onClick={fetchTradingBotStatus} variant="outline">
                    Refresh Status
                  </Button>
                  <Button onClick={fetchTradingSignals} variant="outline">
                    Get Signals
                  </Button>
                </div>

                {portfolioMetrics && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Performance Metrics</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">Sharpe Ratio</p>
                        <p className="font-semibold">{portfolioMetrics.sharpe_ratio?.toFixed(2)}</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">Win Rate</p>
                        <p className="font-semibold">{(portfolioMetrics.win_rate * 100)?.toFixed(1)}%</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">Max Drawdown</p>
                        <p className="font-semibold">{(portfolioMetrics.max_drawdown * 100)?.toFixed(2)}%</p>
                      </div>
                      <div className="bg-gray-50 p-3 rounded-lg">
                        <p className="text-sm text-gray-600">Volatility</p>
                        <p className="font-semibold">{(portfolioMetrics.volatility * 100)?.toFixed(2)}%</p>
                      </div>
                    </div>
                  </div>
                )}

                {tradingSignals.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Active Trading Signals</h3>
                    <div className="space-y-3">
                      {tradingSignals.slice(0, 5).map((signal, index) => (
                        <div key={index} className={`p-4 border rounded-lg ${
                          signal.action === 'BUY' ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
                        }`}>
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium text-lg">{signal.ticker}</p>
                              <p className={`text-sm font-semibold ${
                                signal.action === 'BUY' ? 'text-green-700' : 'text-red-700'
                              }`}>{signal.action} - {signal.strategy}</p>
                              <p className="text-sm text-gray-600">
                                Entry: ${signal.entry_price?.toFixed(2)} | Target: ${signal.target_price?.toFixed(2)}
                              </p>
                              <p className="text-xs text-gray-500">
                                Expected Return: {(signal.expected_return * 100)?.toFixed(2)}%
                              </p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`px-2 py-1 text-xs rounded-full ${
                                signal.confidence > 0.8 ? 'bg-green-100 text-green-800' :
                                signal.confidence > 0.6 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {(signal.confidence * 100).toFixed(0)}% confidence
                              </span>
                              <Button 
                                size="sm" 
                                onClick={() => executeSignal(signal)}
                                disabled={!tradingBotStatus?.is_active}
                              >
                                Execute
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {mlPredictions && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">ML Predictions</h3>
                    <div className="bg-indigo-50 p-4 rounded-lg">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm text-indigo-600">Rebalancing Probability</p>
                          <p className="font-semibold text-indigo-700">{(mlPredictions.rebalancing_prob * 100)?.toFixed(1)}%</p>
                        </div>
                        <div>
                          <p className="text-sm text-indigo-600">Price Direction</p>
                          <p className="font-semibold text-indigo-700">{mlPredictions.price_direction}</p>
                        </div>
                        <div>
                          <p className="text-sm text-indigo-600">Confidence</p>
                          <p className="font-semibold text-indigo-700">{(mlPredictions.confidence * 100)?.toFixed(1)}%</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="risk-dashboard" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5" />
                  Institutional Risk Dashboard
                </CardTitle>
                <CardDescription>
                  Comprehensive risk analysis and portfolio monitoring
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button onClick={fetchRiskDashboard} variant="outline" className="mb-4">
                  Refresh Risk Dashboard
                </Button>

                {riskDashboard && (
                  <>
                    <div>
                      <h3 className="text-lg font-semibold mb-3">Portfolio Risk Metrics</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-red-50 p-3 rounded-lg">
                          <p className="text-sm text-red-600">VaR (95%)</p>
                          <p className="font-semibold text-red-700">{(riskDashboard.portfolio_risk?.var_95 * 100)?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-orange-50 p-3 rounded-lg">
                          <p className="text-sm text-orange-600">Beta</p>
                          <p className="font-semibold text-orange-700">{riskDashboard.portfolio_risk?.beta?.toFixed(2)}</p>
                        </div>
                        <div className="bg-yellow-50 p-3 rounded-lg">
                          <p className="text-sm text-yellow-600">Volatility</p>
                          <p className="font-semibold text-yellow-700">{(riskDashboard.portfolio_risk?.volatility * 100)?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-blue-50 p-3 rounded-lg">
                          <p className="text-sm text-blue-600">Liquidity Score</p>
                          <p className="font-semibold text-blue-700">{riskDashboard.liquidity_risk?.liquidity_score?.toFixed(2)}</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-3">Stress Testing Results</h3>
                      <div className="bg-gray-50 p-4 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-sm text-gray-600">Worst Case Loss</p>
                            <p className="font-semibold">{(riskDashboard.stress_testing?.worst_case_loss * 100)?.toFixed(2)}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Scenarios Tested</p>
                            <p className="font-semibold">{riskDashboard.stress_testing?.scenarios_tested}</p>
                          </div>
                          <div>
                            <p className="text-sm text-gray-600">Stress VaR</p>
                            <p className="font-semibold">{(riskDashboard.stress_testing?.stress_var * 100)?.toFixed(2)}%</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-3">Scenario Analysis</h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-green-50 p-3 rounded-lg">
                          <p className="text-sm text-green-600">Bull Case</p>
                          <p className="font-semibold text-green-700">{(riskDashboard.scenario_analysis?.bull_case * 100)?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-lg">
                          <p className="text-sm text-gray-600">Base Case</p>
                          <p className="font-semibold text-gray-700">{(riskDashboard.scenario_analysis?.base_case * 100)?.toFixed(2)}%</p>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg">
                          <p className="text-sm text-red-600">Bear Case</p>
                          <p className="font-semibold text-red-700">{(riskDashboard.scenario_analysis?.bear_case * 100)?.toFixed(2)}%</p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-3">Risk Attribution</h3>
                      <div className="bg-purple-50 p-4 rounded-lg">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <p className="text-sm text-purple-600">Market Risk</p>
                            <p className="font-semibold text-purple-700">{(riskDashboard.risk_attribution?.market_risk * 100)?.toFixed(1)}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-purple-600">Specific Risk</p>
                            <p className="font-semibold text-purple-700">{(riskDashboard.risk_attribution?.specific_risk * 100)?.toFixed(1)}%</p>
                          </div>
                          <div>
                            <p className="text-sm text-purple-600">Factor Risk</p>
                            <p className="font-semibold text-purple-700">{(riskDashboard.risk_attribution?.factor_risk * 100)?.toFixed(1)}%</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

export default App;
