import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { KCLEditor, prefetchMonacoEditor } from './KCLEditor';
import { ModelViewer3D } from './ModelViewer3D';
import { ClientKCLEngine, KCLExecutionResult, KCLError } from '../services/clientKCLEngine';
import { ArchitecturalModel } from '../types/architectural';
import { debounce } from 'lodash';
import { 
  Loader2, 
  Play, 
  Square, 
  RotateCcw, 
  Settings, 
  Maximize2, 
  Minimize2,
  AlertCircle,
  CheckCircle,
  Clock
} from 'lucide-react';

interface RealTimeKCLEditorProps {
  initialCode?: string;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  className?: string;
}

const DEFAULT_KCL_CODE = `// Real-time KCL Editor
// Edit this code and see the 3D model update live!

const width = 100
const height = 50
const depth = 30

// Create a simple box
const box = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([width, 0], %)
  |> line([0, height], %)
  |> line([-width, 0], %)
  |> close(%)
  |> extrude(depth, %)

// Add a fillet to soften edges
const filletedBox = box |> fillet(5, %)
`;

export const RealTimeKCLEditor: React.FC<RealTimeKCLEditorProps> = ({
  initialCode = DEFAULT_KCL_CODE,
  onModelUpdate,
  className = ''
}) => {
  // State management
  const [kclCode, setKclCode] = useState(initialCode);
  const [model, setModel] = useState<ArchitecturalModel | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState<KCLExecutionResult | null>(null);
  const [errors, setErrors] = useState<KCLError[]>([]);
  const [isLivePreview, setIsLivePreview] = useState(true);
  const [executionTime, setExecutionTime] = useState<number>(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [splitRatio, setSplitRatio] = useState(50); // Percentage for editor vs viewer

  useEffect(() => {
    prefetchMonacoEditor();
  }, []);

  // Refs
  const kclEngineRef = useRef<ClientKCLEngine | null>(null);
  const isModelInitialized = useRef(false);
  const executionCountRef = useRef(0);

  // Initialize KCL engine
  useEffect(() => {
    const initializeEngine = async () => {
      try {
        console.log('🚀 Initializing RealTimeKCLEditor...');
        kclEngineRef.current = new ClientKCLEngine();
        await kclEngineRef.current.initialize();
        
        // Execute initial code
        await executeKCLCode(kclCode);
        console.log('✅ RealTimeKCLEditor initialized');
      } catch (error) {
        console.error('❌ Failed to initialize RealTimeKCLEditor:', error);
        setErrors([{
          line: 1,
          column: 1,
          message: `Initialization failed: ${error.message}`,
          severity: 'error'
        }]);
      }
    };

    initializeEngine();

    // Cleanup on unmount
    return () => {
      if (kclEngineRef.current) {
        kclEngineRef.current.dispose();
      }
    };
  }, []);

  // Debounced KCL execution for real-time updates
  const debouncedExecute = useMemo(
    () => debounce(async (code: string) => {
      if (isLivePreview && kclEngineRef.current) {
        await executeKCLCode(code);
      }
    }, 500), // 500ms delay
    [isLivePreview]
  );

  // Execute KCL code and update model
  const executeKCLCode = useCallback(async (code: string) => {
    if (!kclEngineRef.current || !code.trim()) return;

    setIsExecuting(true);
    setErrors([]);
    executionCountRef.current += 1;
    const currentExecution = executionCountRef.current;

    try {
      console.log(`🔄 Executing KCL code (execution #${currentExecution})...`);
      
      const result = await kclEngineRef.current.executeKCL(code, {
        format: 'gltf',
        quality: 'normal',
        useCache: true
      });

      // Check if this is still the latest execution
      if (currentExecution !== executionCountRef.current) {
        console.log('⏭️ Execution outdated, skipping result');
        return;
      }

      setExecutionResult(result);
      setExecutionTime(result.executionTime);

      if (result.errors && result.errors.length > 0) {
        setErrors(result.errors);
        console.warn('⚠️ KCL execution completed with errors:', result.errors);
      } else {
        // Convert execution result to ArchitecturalModel
        const architecturalModel = await convertResultToModel(result, code);
        setModel(architecturalModel);
        isModelInitialized.current = true;
        
        // Notify parent component
        if (onModelUpdate) {
          onModelUpdate(architecturalModel);
        }
        
        console.log(`✅ KCL execution completed successfully in ${result.executionTime.toFixed(2)}ms`);
      }

    } catch (error) {
      // Check if this is still the latest execution
      if (currentExecution !== executionCountRef.current) {
        return;
      }

      console.error('❌ KCL execution failed:', error);
      setErrors([{
        line: 1,
        column: 1,
        message: error.message || 'Unknown execution error',
        severity: 'error'
      }]);
    } finally {
      if (currentExecution === executionCountRef.current) {
        setIsExecuting(false);
      }
    }
  }, [onModelUpdate]);

  // Handle code changes with real-time preview
  const handleCodeChange = useCallback((newCode: string) => {
    setKclCode(newCode);
    
    if (isLivePreview) {
      debouncedExecute(newCode);
    }
  }, [isLivePreview, debouncedExecute]);

  // Manual execution (for when live preview is disabled)
  const handleManualExecute = useCallback(() => {
    executeKCLCode(kclCode);
  }, [kclCode, executeKCLCode]);

  // Reset to default code
  const handleReset = useCallback(() => {
    setKclCode(DEFAULT_KCL_CODE);
    if (isLivePreview) {
      debouncedExecute(DEFAULT_KCL_CODE);
    }
  }, [isLivePreview, debouncedExecute]);

  // Convert execution result to ArchitecturalModel
  const convertResultToModel = async (result: KCLExecutionResult, code: string): Promise<ArchitecturalModel> => {
    return {
      id: `kcl-${Date.now()}`,
      name: 'Real-time KCL Model',
      title: 'Real-time KCL Model', 
      description: 'Live-generated model from KCL code',
      style: 'modern',
      rooms: [], // KCL models don't use rooms
      totalArea: 0,
      cadModel: {
        id: `kcl-cad-${Date.now()}`,
        prompt: '// Generated from real-time KCL editor',
        kclCode: code,
        gltfUrl: '', // Will be populated from result.gltf
        thumbnailUrl: '',
        formats: {
          gltf: '', // Will be populated
          stl: result.stl ? '' : undefined
        },
        properties: {
          dimensions: { width: 100, height: 50, depth: 30 }, // Default, would be calculated
          volume: 150000,
          surfaceArea: 22000,
          complexity: 'moderate'
        }
      },
      gltfUrl: '', // Will be populated from result.gltf
      properties: {
        dimensions: { width: 100, height: 50, depth: 30 },
        volume: 150000,
        surfaceArea: 22000
      }
    };
  };

  // Get status indicator
  const getStatusIndicator = () => {
    if (isExecuting) {
      return (
        <div className="flex items-center gap-2 text-blue-400">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Executing...</span>
        </div>
      );
    }
    
    if (errors.length > 0) {
      return (
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle className="w-4 h-4" />
          <span className="text-sm">{errors.length} error{errors.length > 1 ? 's' : ''}</span>
        </div>
      );
    }
    
    if (executionResult && !errors.length) {
      return (
        <div className="flex items-center gap-2 text-green-400">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm">Ready</span>
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock className="w-3 h-3" />
            <span>{executionTime.toFixed(1)}ms</span>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 text-gray-400">
        <Square className="w-4 h-4" />
        <span className="text-sm">Ready</span>
      </div>
    );
  };

  return (
    <div className={`flex flex-col h-full bg-gray-900 text-white ${className}`}>
      {/* Header with controls */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Real-time KCL Editor</h2>
          {getStatusIndicator()}
        </div>
        
        <div className="flex items-center gap-2">
          {/* Live preview toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isLivePreview}
              onChange={(e) => setIsLivePreview(e.target.checked)}
              className="rounded"
            />
            Live Preview
          </label>
          
          {/* Manual execute button (when live preview is off) */}
          {!isLivePreview && (
            <button
              onClick={handleManualExecute}
              disabled={isExecuting}
              className="flex items-center gap-2 px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 text-sm"
            >
              <Play className="w-4 h-4" />
              Execute
            </button>
          )}
          
          {/* Reset button */}
          <button
            onClick={handleReset}
            className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            <RotateCcw className="w-4 h-4" />
            Reset
          </button>
          
          {/* Settings button */}
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            <Settings className="w-4 h-4" />
          </button>
          
          {/* Fullscreen toggle */}
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Settings panel */}
      {showSettings && (
        <div className="p-4 bg-gray-800 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm">
              Editor/Viewer Split:
              <input
                type="range"
                min="20"
                max="80"
                value={splitRatio}
                onChange={(e) => setSplitRatio(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-xs text-gray-400">{splitRatio}%</span>
            </label>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className={`flex-1 flex ${isFullscreen ? 'fixed inset-0 z-50 bg-gray-900' : ''}`}>
        {/* KCL Editor Panel */}
        <div 
          className="border-r border-gray-700 flex flex-col"
          style={{ width: `${splitRatio}%` }}
        >
          <KCLEditor
            initialCode={kclCode}
            onCodeChange={handleCodeChange}
            onExecute={!isLivePreview ? handleManualExecute : undefined}
            onGenerateFromPrompt={async (prompt) => {
              // Generate KCL from natural language prompt
              if (kclEngineRef.current) {
                // This would use AI to generate KCL from prompt
                return `// Generated from: ${prompt}\n${DEFAULT_KCL_CODE}`;
              }
              return DEFAULT_KCL_CODE;
            }}
            isLoading={isExecuting}
            error={errors.length > 0 ? errors.map(e => e.message).join('; ') : null}
            className="h-full"
          />
          
          {/* Error display */}
          {errors.length > 0 && (
            <div className="p-3 bg-red-900/20 border-t border-red-800/50 max-h-32 overflow-y-auto">
              <div className="text-sm font-medium text-red-300 mb-2">Errors:</div>
              {errors.map((error, index) => (
                <div key={index} className="text-sm text-red-300 mb-1">
                  Line {error.line}: {error.message}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 3D Viewer Panel */}
        <div 
          className="flex-1 flex flex-col bg-gray-900"
          style={{ width: `${100 - splitRatio}%` }}
        >
          {/* Viewer header */}
          <div className="p-3 bg-gray-800 border-b border-gray-700">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium">3D Preview</h3>
              <div className="text-xs text-gray-400">
                {model ? 'Model loaded' : 'No model'}
              </div>
            </div>
          </div>
          
          {/* 3D Model Viewer */}
          <div className="flex-1 relative">
            {model ? (
              <ModelViewer3D 
                model={model}
                className="h-full"
                onModelUpdate={onModelUpdate}
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                {isExecuting ? (
                  <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <div className="text-sm">Generating 3D model...</div>
                  </div>
                ) : errors.length > 0 ? (
                  <div className="flex flex-col items-center gap-3">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                    <div className="text-sm">Fix errors to see preview</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Square className="w-8 h-8" />
                    <div className="text-sm">
                      {isLivePreview ? 'Start typing KCL code...' : 'Click Execute to preview'}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer with execution stats */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex items-center justify-between">
          <div>
            Real-time KCL Editor • Client-side execution • WebAssembly powered
          </div>
          <div className="flex items-center gap-4">
            {executionResult && (
              <>
                <span>Execution: {executionTime.toFixed(1)}ms</span>
                {executionResult.cacheKey && <span>Cached</span>}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealTimeKCLEditor; 
