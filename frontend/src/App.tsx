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
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="upload">Data Upload</TabsTrigger>
            <TabsTrigger value="process">Data Processing</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
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
        </Tabs>
      </div>
    </div>
  );
}

export default App;
