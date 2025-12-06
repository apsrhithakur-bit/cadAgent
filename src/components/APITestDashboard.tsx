import React, { useState, useEffect } from 'react';
import { 
  Brain, 
  Mic, 
  Image, 
  Database, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  Loader2,
  Play,
  Pause,
  RefreshCw,
  Activity
} from 'lucide-react';
import { architecturalAI } from '../services/architecturalAI';
import { voiceService } from '../services/voiceService';
import { cacheService } from '../services/cacheService';

interface TestResult {
  success: boolean;
  duration: number;
  result?: any;
  error?: string;
  source?: string;
  confidence?: number;
}

interface TestSuite {
  name: string;
  tests: Array<{
    name: string;
    description: string;
    test: () => Promise<TestResult>;
    status: 'pending' | 'running' | 'success' | 'error';
    result?: TestResult;
  }>;
}

const APITestDashboard: React.FC = () => {
  const [testSuites, setTestSuites] = useState<TestSuite[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string | null>(null);
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [results, setResults] = useState<Record<string, string>>({});

  useEffect(() => {
    initializeTestSuites();
    loadCacheStats();
  }, []);

  const initializeTestSuites = () => {
    const suites: TestSuite[] = [
      {
        name: 'AI Text Analysis',
        tests: [
          {
            name: 'Basic Text Analysis',
            description: 'Test OpenAI GPT-4 text analysis with fallback',
            test: testTextAnalysis,
            status: 'pending'
          },
          {
            name: 'Complex Architectural Query',
            description: 'Test complex architectural requirements parsing',
            test: testComplexArchitecturalQuery,
            status: 'pending'
          }
        ]
      },
      {
        name: 'Image Analysis',
        tests: [
          {
            name: 'Sample Image Analysis',
            description: 'Test GPT-4V image analysis with sample data',
            test: testImageAnalysis,
            status: 'pending'
          }
        ]
      },
      {
        name: 'Voice Services',
        tests: [
          {
            name: 'Voice Synthesis Test',
            description: 'Test ElevenLabs text-to-speech',
            test: testVoiceSynthesis,
            status: 'pending'
          },
          {
            name: 'Voice Recognition Test',
            description: 'Test Web Speech API availability',
            test: testVoiceRecognition,
            status: 'pending'
          }
        ]
      },
      {
        name: 'Cache System',
        tests: [
          {
            name: 'Browser Cache Test',
            description: 'Test IndexedDB cache functionality',
            test: testBrowserCache,
            status: 'pending'
          },
          {
            name: 'Cache Fallback Test',
            description: 'Test fallback data generation',
            test: testCacheFallback,
            status: 'pending'
          }
        ]
      }
    ];

    setTestSuites(suites);
  };

  const loadCacheStats = async () => {
    try {
      const stats = await cacheService.getCacheStats();
      setCacheStats(stats);
    } catch (error) {
      console.warn('Failed to load cache stats:', error);
    }
  };

  // Test Functions
  async function testTextAnalysis(): Promise<TestResult> {
    const startTime = Date.now();
    const testInput = "I want a modern 3-bedroom house with an open-plan living area, large windows facing south, and a spacious kitchen island";
    
    try {
      const response = await architecturalAI.generateModel({
        inputs: {
          text: {
            type: 'text',
            content: testInput,
            timestamp: new Date()
          },
          combined: false
        },
        preferences: {
          style: 'modern',
          units: 'metric',
          complexity: 'detailed'
        }
      });

      return {
        success: true,
        duration: Date.now() - startTime,
        result: response.model,
        source: 'ai_analysis',
        confidence: response.confidence
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async function testComplexArchitecturalQuery(): Promise<TestResult> {
    const startTime = Date.now();
    const complexInput = "Design a sustainable office building with natural lighting, green roof, underground parking for 100 cars, 5 floors, modern minimalist style, and LEED certification requirements";
    
    try {
      const response = await architecturalAI.generateModel({
        inputs: {
          text: {
            type: 'text',
            content: complexInput,
            timestamp: new Date()
          },
          combined: false
        },
        preferences: {
          style: 'minimalist',
          units: 'metric',
          complexity: 'complex'
        }
      });

      return {
        success: true,
        duration: Date.now() - startTime,
        result: response.model,
        source: 'ai_analysis',
        confidence: response.confidence
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async function testImageAnalysis(): Promise<TestResult> {
    const startTime = Date.now();
    // Use a sample base64 encoded 1x1 pixel image for testing
    const sampleImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    
    try {
      const response = await architecturalAI.generateModel({
        inputs: {
          photo: {
            type: 'photo',
            imageData: sampleImage,
            metadata: {
              width: 1,
              height: 1,
              device: 'test'
            },
            timestamp: new Date()
          },
          combined: false
        },
        preferences: {
          style: 'modern',
          units: 'metric',
          complexity: 'detailed'
        }
      });

      return {
        success: true,
        duration: Date.now() - startTime,
        result: response.model,
        source: response.processing?.steps?.join(', ') || 'unknown'
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async function testVoiceSynthesis(): Promise<TestResult> {
    const startTime = Date.now();
    const testText = "Welcome to AgentiCAD! Your AI architectural assistant is ready.";
    
    try {
      const audioData = await architecturalAI.synthesizeSpeech(testText);
      
      return {
        success: !!audioData,
        duration: Date.now() - startTime,
        result: { audioLength: audioData.length },
        source: 'elevenlabs'
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async function testVoiceRecognition(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const availability = voiceService.isVoiceAvailable();
      
      return {
        success: availability.recognition,
        duration: Date.now() - startTime,
        result: availability,
        source: 'web_speech_api'
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async function testBrowserCache(): Promise<TestResult> {
    const startTime = Date.now();
    const testKey = 'test_cache_entry';
    const testData = { test: true, timestamp: Date.now() };
    
    try {
      // Test cache set and get
      await cacheService.cacheTextAnalysis(testKey, testData);
      const retrieved = await cacheService.getCachedTextAnalysis(testKey);
      
      const success = retrieved && retrieved.test === true;
      
      return {
        success,
        duration: Date.now() - startTime,
        result: { cached: !!retrieved },
        source: 'indexeddb'
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  async function testCacheFallback(): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      const fallbackData = cacheService.getFallbackData('text_analysis', {
        input: 'fallback test input'
      });
      
      return {
        success: !!fallbackData,
        duration: Date.now() - startTime,
        result: fallbackData,
        source: 'fallback_rules'
      };
    } catch (error) {
      return {
        success: false,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  // Test Pica API connection
  const testPicaAPI = async () => {
    setResults(prev => ({ ...prev, pica: 'Testing...' }));
    
    try {
      const config = {
        secretKey: import.meta.env.VITE_PICA_SECRET_KEY || '',
        openaiConnectionKey: import.meta.env.VITE_PICA_OPENAI_CONNECTION_KEY || ''
      };

      if (!config.secretKey || !config.openaiConnectionKey) {
        setResults(prev => ({ ...prev, pica: '❌ Missing API keys in .env file' }));
        return;
      }

      console.log('Testing Pica with keys:', {
        secretKey: config.secretKey.substring(0, 10) + '...',
        connectionKey: config.openaiConnectionKey.substring(0, 20) + '...'
      });

      const response = await fetch('https://api.picaos.com/v1/passthrough/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-pica-secret': config.secretKey,
          'x-pica-connection-key': config.openaiConnectionKey,
          'x-pica-action-id': 'conn_mod_def::GDzgi1QfvM4::4OjsWvZhRxmAVuLAuWgfVA'
        },
        body: JSON.stringify({
          messages: [
            {
              role: 'user',
              content: 'Hello, this is a test message.'
            }
          ],
          model: 'gpt-4o-mini',
          max_tokens: 50
        })
      });

      const data = await response.text();
      
      if (response.ok) {
        setResults(prev => ({ ...prev, pica: '✅ Pica API connection successful!' }));
      } else {
        setResults(prev => ({ 
          ...prev, 
          pica: `❌ Pica API failed: ${response.status} - ${data}` 
        }));
      }
    } catch (error) {
      setResults(prev => ({ 
        ...prev, 
        pica: `❌ Pica API error: ${error instanceof Error ? error.message : 'Unknown error'}` 
      }));
    }
  };

  const runTest = async (suiteIndex: number, testIndex: number) => {
    const suite = testSuites[suiteIndex];
    const test = suite.tests[testIndex];
    
    setCurrentTest(`${suite.name} - ${test.name}`);
    
    // Update test status to running
    setTestSuites(prev => {
      const updated = [...prev];
      updated[suiteIndex].tests[testIndex].status = 'running';
      return updated;
    });

    try {
      const result = await test.test();
      
      // Update test with results
      setTestSuites(prev => {
        const updated = [...prev];
        updated[suiteIndex].tests[testIndex].status = result.success ? 'success' : 'error';
        updated[suiteIndex].tests[testIndex].result = result;
        return updated;
      });
    } catch (error) {
      setTestSuites(prev => {
        const updated = [...prev];
        updated[suiteIndex].tests[testIndex].status = 'error';
        updated[suiteIndex].tests[testIndex].result = {
          success: false,
          duration: 0,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
        return updated;
      });
    }
    
    setCurrentTest(null);
  };

  const runAllTests = async () => {
    setIsRunning(true);
    
    for (let suiteIndex = 0; suiteIndex < testSuites.length; suiteIndex++) {
      const suite = testSuites[suiteIndex];
      for (let testIndex = 0; testIndex < suite.tests.length; testIndex++) {
        await runTest(suiteIndex, testIndex);
        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
    
    setIsRunning(false);
    await loadCacheStats();
  };

  const resetTests = () => {
    initializeTestSuites();
    setCacheStats(null);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'running':
        return <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />;
      default:
        return <AlertTriangle className="w-5 h-5 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-purple-900 to-violet-900 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-4">
            AgentiCAD API Test Dashboard
          </h1>
          <p className="text-gray-300 text-lg">
            Test your AI API configuration and verify fallback behavior
          </p>
        </div>

        {/* Control Panel */}
        <div className="cosmic-panel rounded-2xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={runAllTests}
                disabled={isRunning}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-purple-500 text-white font-semibold rounded-lg hover:from-cyan-600 hover:to-purple-600 disabled:opacity-50 transition-all"
              >
                {isRunning ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                {isRunning ? 'Running Tests...' : 'Run All Tests'}
              </button>
              
              <button
                onClick={testPicaAPI}
                className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors"
              >
                <Brain className="w-4 h-4" />
                Test Pica API
              </button>
              
              <button
                onClick={resetTests}
                disabled={isRunning}
                className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Reset
              </button>
            </div>

            {currentTest && (
              <div className="flex items-center gap-2 text-cyan-400">
                <Activity className="w-4 h-4 animate-pulse" />
                <span className="text-sm">{currentTest}</span>
              </div>
            )}
          </div>
          
          {/* Pica API Test Result */}
          {results.pica && (
            <div className="mt-4 p-3 bg-black/20 rounded-lg">
              <h4 className="text-white font-medium mb-2">Pica API Test Result:</h4>
              <p className="text-sm" style={{ color: results.pica.includes('✅') ? '#4ade80' : '#f87171' }}>
                {results.pica}
              </p>
            </div>
          )}
        </div>

        {/* Cache Statistics */}
        {cacheStats && (
          <div className="cosmic-panel rounded-2xl p-6 mb-8">
            <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
              <Database className="w-5 h-5" />
              Cache Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-cyan-400">{cacheStats.browserEntries}</div>
                <div className="text-sm text-gray-300">Browser Entries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-400">{cacheStats.cloudEntries}</div>
                <div className="text-sm text-gray-300">Cloud Entries</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{cacheStats.totalSize}MB</div>
                <div className="text-sm text-gray-300">Total Size</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-400">
                  {cacheStats.oldestEntry ? Math.floor((Date.now() - new Date(cacheStats.oldestEntry).getTime()) / (1000 * 60 * 60)) : 0}h
                </div>
                <div className="text-sm text-gray-300">Oldest Entry</div>
              </div>
            </div>
          </div>
        )}

        {/* Test Suites */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {testSuites.map((suite, suiteIndex) => (
            <div key={suite.name} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6">
              <h3 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
                {suite.name === 'AI Text Analysis' && <Brain className="w-5 h-5" />}
                {suite.name === 'Image Analysis' && <Image className="w-5 h-5" />}
                {suite.name === 'Voice Services' && <Mic className="w-5 h-5" />}
                {suite.name === 'Cache System' && <Database className="w-5 h-5" />}
                {suite.name}
              </h3>
              
              <div className="space-y-4">
                {suite.tests.map((test, testIndex) => (
                  <div key={test.name} className="border border-white/10 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        {getStatusIcon(test.status)}
                        <span className="font-medium text-white">{test.name}</span>
                      </div>
                      
                      <button
                        onClick={() => runTest(suiteIndex, testIndex)}
                        disabled={isRunning || test.status === 'running'}
                        className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 disabled:opacity-50 text-sm transition-colors"
                      >
                        Run
                      </button>
                    </div>
                    
                    <p className="text-gray-300 text-sm mb-2">{test.description}</p>
                    
                    {test.result && (
                      <div className="mt-3 p-3 bg-black/20 rounded text-xs">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-gray-400">Duration: {test.result.duration}ms</span>
                          {test.result.source && (
                            <span className="text-gray-400">Source: {test.result.source}</span>
                          )}
                        </div>
                        
                        {test.result.confidence && (
                          <div className="mb-1">
                            <span className="text-gray-400">Confidence: {(test.result.confidence * 100).toFixed(1)}%</span>
                          </div>
                        )}
                        
                        {test.result.error && (
                          <div className="text-red-400 text-xs mt-2">{test.result.error}</div>
                        )}
                        
                        {test.result.result && !test.result.error && (
                          <details className="mt-2">
                            <summary className="text-gray-400 cursor-pointer">Result Details</summary>
                            <pre className="text-xs text-gray-300 mt-1 overflow-auto">
                              {JSON.stringify(test.result.result, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Instructions */}
        <div className="mt-8 bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <h3 className="text-lg font-semibold text-white mb-3">Testing Instructions</h3>
          <div className="text-gray-300 text-sm space-y-2">
            <p>• <strong>Green checkmarks:</strong> API working correctly</p>
            <p>• <strong>Red X:</strong> API failed, check your environment variables</p>
            <p>• <strong>Yellow warning:</strong> Using fallback mechanisms</p>
            <p>• Tests automatically try fallbacks: OpenAI → Gemini → Rule-based</p>
            <p>• Cache tests verify browser IndexedDB and Supabase sync</p>
          </div>
        </div>
      </div>
    </div>
  );
};

 