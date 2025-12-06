import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { RealTimeKCLEditor } from './RealTimeKCLEditor';
import { ClientKCLEngine, KCLExecutionResult, KCLError } from '../services/clientKCLEngine';
import { ArchitecturalModel } from '../types/architectural';
import { 
  Loader2, 
  Play, 
  Pause,
  Settings,
  Eye,
  EyeOff,
  Code,
  Sliders,
  MousePointer,
  Box,
  Zap,
  Download,
  Upload,
  RotateCcw,
  Maximize2,
  Minimize2,
  AlertCircle,
  CheckCircle,
  Clock,
  Layers,
  Edit3,
  Sparkles
} from 'lucide-react';

interface EnhancedKCLEditorProps {
  initialCode?: string;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  className?: string;
}

const EXAMPLE_MODELS = {
  simple_box: `// Simple parametric box
const width = 80
const height = 60
const depth = 40

const box = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([width, 0], %)
  |> line([0, height], %)
  |> line([-width, 0], %)
  |> close(%)
  |> extrude(depth, %)`,

  rounded_container: `// Rounded container with lid
const diameter = 100
const height = 80
const wall_thickness = 3
const corner_radius = 5

// Main container
const container = startSketchOn('XY')
  |> startProfileAt([corner_radius, 0], %)
  |> arc([0, corner_radius], corner_radius, %)
  |> line([0, diameter - 2 * corner_radius], %)
  |> arc([-corner_radius, 0], corner_radius, %)
  |> line([-(diameter - 2 * corner_radius), 0], %)
  |> arc([0, -corner_radius], corner_radius, %)
  |> line([0, -(diameter - 2 * corner_radius)], %)
  |> arc([corner_radius, 0], corner_radius, %)
  |> close(%)
  |> extrude(height, %)
  |> shell(wall_thickness, %)`,

  mechanical_part: `// Mechanical bracket
const base_length = 120
const base_width = 60
const base_thickness = 10
const support_height = 40
const hole_diameter = 8
const fillet_radius = 4

// Base plate
const base = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([base_length, 0], %)
  |> line([0, base_width], %)
  |> line([-base_length, 0], %)
  |> close(%)
  |> extrude(base_thickness, %)

// Mounting holes
const holes = startSketchOn('XY')
  |> startProfileAt([10, 10], %)
  |> circle([0, 0], hole_diameter / 2, %)
  |> startProfileAt([base_length - 10, 10], %)
  |> circle([0, 0], hole_diameter / 2, %)
  |> startProfileAt([10, base_width - 10], %)
  |> circle([0, 0], hole_diameter / 2, %)
  |> startProfileAt([base_length - 10, base_width - 10], %)
  |> circle([0, 0], hole_diameter / 2, %)
  |> extrude(-base_thickness, %)

// Support wall
const support = startSketchOn('YZ')
  |> startProfileAt([0, base_thickness], %)
  |> line([base_width, 0], %)
  |> line([0, support_height], %)
  |> line([-base_width, 0], %)
  |> close(%)
  |> extrude(10, %)

// Apply fillets
const final_part = base 
  |> fillet(fillet_radius, %)
  |> subtract(holes, %)
  |> union(support, %)`
};

export const EnhancedKCLEditor: React.FC<EnhancedKCLEditorProps> = ({
  initialCode = EXAMPLE_MODELS.simple_box,
  onModelUpdate,
  className = ''
}) => {
  // Main state
  const [activeTab, setActiveTab] = useState<'editor' | 'parameters' | 'interactive'>('editor');
  const [kclCode, setKclCode] = useState(initialCode);
  const [model, setModel] = useState<ArchitecturalModel | null>(null);
  const [isLivePreview, setIsLivePreview] = useState(true);
  const [isExecuting, setIsExecuting] = useState(false);

  // Editor features state
  const [showLineNumbers, setShowLineNumbers] = useState(true);
  const [showMinimap, setShowMinimap] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [autoComplete, setAutoComplete] = useState(true);

  // Interactive features
  const [editableParameters, setEditableParameters] = useState<any[]>([]);
  const [selectedParameter, setSelectedParameter] = useState<string | null>(null);
  const [interactiveMode, setInteractiveMode] = useState(false);

  // Performance metrics
  const [executionStats, setExecutionStats] = useState({
    executionTime: 0,
    cacheHits: 0,
    linesOfCode: 0
  });

  // Refs
  const kclEngineRef = useRef<ClientKCLEngine | null>(null);

  // Initialize KCL engine
  useEffect(() => {
    const initializeEngine = async () => {
      try {
        console.log('🚀 Initializing Enhanced KCL Editor...');
        kclEngineRef.current = new ClientKCLEngine();
        await kclEngineRef.current.initialize();
        
        // Extract initial parameters
        updateEditableParameters(kclCode);
        console.log('✅ Enhanced KCL Editor initialized');
      } catch (error) {
        console.error('❌ Failed to initialize Enhanced KCL Editor:', error);
      }
    };

    initializeEngine();

    return () => {
      if (kclEngineRef.current) {
        kclEngineRef.current.dispose();
      }
    };
  }, []);

  // Update editable parameters when code changes
  const updateEditableParameters = useCallback((code: string) => {
    if (!kclEngineRef.current) return;

    const parameters = kclEngineRef.current.extractEditableParameters(code);
    setEditableParameters(parameters);
    setExecutionStats(prev => ({
      ...prev,
      linesOfCode: code.split('\n').length
    }));
  }, []);

  // Handle code changes
  const handleCodeChange = useCallback((newCode: string) => {
    setKclCode(newCode);
    updateEditableParameters(newCode);
  }, [updateEditableParameters]);

  // Handle parameter value updates
  const handleParameterUpdate = useCallback((paramName: string, newValue: any) => {
    if (!kclEngineRef.current) return;

    const updatedCode = kclEngineRef.current.updateParameter(kclCode, paramName, newValue);
    setKclCode(updatedCode);
    updateEditableParameters(updatedCode);
  }, [kclCode, updateEditableParameters]);

  // Handle model updates
  const handleModelUpdate = useCallback((updatedModel: ArchitecturalModel) => {
    setModel(updatedModel);
    if (onModelUpdate) {
      onModelUpdate(updatedModel);
    }
  }, [onModelUpdate]);

  // Load example model
  const loadExample = useCallback((exampleKey: keyof typeof EXAMPLE_MODELS) => {
    const exampleCode = EXAMPLE_MODELS[exampleKey];
    setKclCode(exampleCode);
    updateEditableParameters(exampleCode);
  }, [updateEditableParameters]);

  // Export KCL code
  const exportCode = useCallback(() => {
    const blob = new Blob([kclCode], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.kcl';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [kclCode]);

  // Import KCL code
  const importCode = useCallback(() => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kcl,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setKclCode(content);
          updateEditableParameters(content);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }, [updateEditableParameters]);

  // Render parameter editor
  const renderParameterEditor = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Sliders className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold">Editable Parameters</h3>
      </div>

      {editableParameters.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Box className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No editable parameters found</p>
          <p className="text-sm mt-1">Add 'const' declarations to make them editable</p>
        </div>
      ) : (
        <div className="space-y-3">
          {editableParameters.map((param, index) => (
            <div
              key={param.name}
              className={`p-3 rounded-lg border ${
                selectedParameter === param.name
                  ? 'border-blue-500 bg-blue-500/10'
                  : 'border-gray-600 bg-gray-800/50'
              }`}
            >
              <div className="flex items-center justify-between mb-2">
                <label className="font-medium text-white">{param.name}</label>
                <span className="text-xs text-gray-400">Line {param.line}</span>
              </div>
              
              {param.type === 'number' ? (
                <input
                  type="number"
                  value={param.value}
                  onChange={(e) => handleParameterUpdate(param.name, Number(e.target.value))}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  onFocus={() => setSelectedParameter(param.name)}
                  onBlur={() => setSelectedParameter(null)}
                />
              ) : param.type === 'boolean' ? (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={param.value}
                    onChange={(e) => handleParameterUpdate(param.name, e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-300">
                    {param.value ? 'true' : 'false'}
                  </span>
                </label>
              ) : (
                <input
                  type="text"
                  value={param.value}
                  onChange={(e) => handleParameterUpdate(param.name, e.target.value)}
                  className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white"
                  onFocus={() => setSelectedParameter(param.name)}
                  onBlur={() => setSelectedParameter(null)}
                />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Render interactive mode
  const renderInteractiveMode = () => (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <MousePointer className="w-5 h-5 text-green-400" />
        <h3 className="text-lg font-semibold">Interactive Editing</h3>
      </div>

      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Edit3 className="w-4 h-4 text-blue-400" />
          <span className="font-medium">Click-to-Edit Features</span>
        </div>
        
        <div className="space-y-2 text-sm text-gray-300">
          <p>• Click on faces to add features</p>
          <p>• Drag edges to adjust dimensions</p>
          <p>• Right-click for context menu</p>
          <p>• Hold Shift to multi-select</p>
        </div>

        <button
          onClick={() => setInteractiveMode(!interactiveMode)}
          className={`mt-3 px-4 py-2 rounded ${
            interactiveMode
              ? 'bg-green-600 text-white'
              : 'bg-gray-600 text-gray-300'
          } transition-colors`}
        >
          {interactiveMode ? 'Exit Interactive Mode' : 'Enter Interactive Mode'}
        </button>
      </div>

      <div className="bg-gray-800/50 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="font-medium">AI Assistant</span>
        </div>
        
        <div className="space-y-2">
          <input
            type="text"
            placeholder="Describe what you want to modify..."
            className="w-full p-2 bg-gray-700 border border-gray-600 rounded text-white text-sm"
          />
          <button className="w-full px-3 py-2 bg-purple-600 text-white rounded text-sm hover:bg-purple-700 transition-colors">
            Apply AI Modification
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col h-full bg-gray-900 text-white ${className}`}>
      {/* Enhanced Header */}
      <div className="flex items-center justify-between p-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Code className="w-5 h-5 text-blue-400" />
            Enhanced KCL Editor
          </h2>
          
          {/* Mode tabs */}
          <div className="flex bg-gray-700 rounded-lg p-1">
            {[
              { id: 'editor', label: 'Code', icon: Code },
              { id: 'parameters', label: 'Parameters', icon: Sliders },
              { id: 'interactive', label: 'Interactive', icon: MousePointer }
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id as any)}
                className={`flex items-center gap-2 px-3 py-1 rounded text-sm transition-colors ${
                  activeTab === id
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-300 hover:text-white'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {/* Example models dropdown */}
          <select
            onChange={(e) => loadExample(e.target.value as keyof typeof EXAMPLE_MODELS)}
            className="px-3 py-1 bg-gray-700 border border-gray-600 rounded text-sm"
            defaultValue=""
          >
            <option value="" disabled>Load Example</option>
            <option value="simple_box">Simple Box</option>
            <option value="rounded_container">Rounded Container</option>
            <option value="mechanical_part">Mechanical Part</option>
          </select>

          {/* Tools */}
          <button
            onClick={importCode}
            className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          
          <button
            onClick={exportCode}
            className="flex items-center gap-2 px-3 py-1 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex">
        {/* Left Panel */}
        <div className="w-1/3 border-r border-gray-700 flex flex-col">
          {activeTab === 'editor' && (
            <div className="flex-1">
              {/* Editor settings */}
              <div className="p-3 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-4 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={showLineNumbers}
                      onChange={(e) => setShowLineNumbers(e.target.checked)}
                      className="rounded"
                    />
                    Line Numbers
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={wordWrap}
                      onChange={(e) => setWordWrap(e.target.checked)}
                      className="rounded"
                    />
                    Word Wrap
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={autoComplete}
                      onChange={(e) => setAutoComplete(e.target.checked)}
                      className="rounded"
                    />
                    Auto Complete
                  </label>
                </div>
              </div>
              
              {/* Code editor area */}
              <div className="flex-1 bg-gray-900">
                <textarea
                  value={kclCode}
                  onChange={(e) => handleCodeChange(e.target.value)}
                  className="w-full h-full p-4 bg-gray-900 text-white font-mono text-sm resize-none focus:outline-none"
                  style={{
                    fontFamily: '"Fira Code", "JetBrains Mono", monospace',
                    lineHeight: '1.5'
                  }}
                  placeholder="Enter your KCL code here..."
                />
              </div>
            </div>
          )}

          {activeTab === 'parameters' && renderParameterEditor()}
          {activeTab === 'interactive' && renderInteractiveMode()}
        </div>

        {/* Right Panel - 3D Viewer */}
        <div className="flex-1">
          <RealTimeKCLEditor
            initialCode={kclCode}
            onModelUpdate={handleModelUpdate}
            className="h-full"
          />
        </div>
      </div>

      {/* Status Bar */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 text-xs text-gray-400">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <span>Enhanced KCL Editor</span>
            <span>Client-side execution</span>
            <span>WebAssembly powered</span>
          </div>
          <div className="flex items-center gap-4">
            <span>Lines: {executionStats.linesOfCode}</span>
            <span>Parameters: {editableParameters.length}</span>
            {executionStats.executionTime > 0 && (
              <span>Last execution: {executionStats.executionTime.toFixed(1)}ms</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default EnhancedKCLEditor; 