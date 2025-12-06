import React, { useState, useCallback, useRef, useEffect } from 'react';
import type { Monaco } from '@monaco-editor/react';
import { 
  Code2, 
  Play, 
  RefreshCw, 
  Download, 
  Upload,
  Copy,
  Check,
  AlertCircle,
  Loader2,
  FileCode,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { kclService } from '../services/kclService';

type MonacoEditorModule = typeof import('@monaco-editor/react');

let monacoLoaderPromise: Promise<MonacoEditorModule> | null = null;

const loadMonacoEditor = () => import('@monaco-editor/react');

export const prefetchMonacoEditor = (): Promise<MonacoEditorModule> => {
  if (!monacoLoaderPromise) {
    monacoLoaderPromise = loadMonacoEditor();
  }
  return monacoLoaderPromise;
};

interface KCLEditorProps {
  initialCode?: string;
  onCodeChange?: (code: string) => void;
  onExecute?: (code: string) => Promise<void>;
  onGenerateFromPrompt?: (prompt: string) => Promise<string>;
  isLoading?: boolean;
  error?: string | null;
}

const DEFAULT_KCL_CODE = `// KCL Code Editor - Zoo.dev
// Design your CAD models with code

// Example: Simple box with lid
const boxWidth = 100
const boxLength = 80
const boxHeight = 50
const wallThickness = 3

// Base component
const base = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([boxWidth, 0], %)
  |> line([0, boxLength], %)
  |> line([-boxWidth, 0], %)
  |> close(%)
  |> extrude(boxHeight, %)

// Add your components here...
`;

export const KCLEditor: React.FC<KCLEditorProps> = ({
  initialCode = DEFAULT_KCL_CODE,
  onCodeChange,
  onExecute,
  onGenerateFromPrompt,
  isLoading = false,
  error = null
}) => {
  const [code, setCode] = useState(initialCode);
  const [copied, setCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editorModule, setEditorModule] = useState<MonacoEditorModule | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<Monaco | null>(null);

  useEffect(() => {
    let cancelled = false;
    prefetchMonacoEditor()
      .then((module) => {
        if (!cancelled) {
          setEditorModule(module);
        }
      })
      .catch((error) => {
        console.error('Failed to load Monaco editor:', error);
        if (!cancelled) {
          setEditorError('Failed to load editor');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const MonacoEditor = editorModule?.default;

  const handleEditorDidMount = (editor: any, monaco: Monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Register KCL language if needed
    monaco.languages.register({ id: 'kcl' });
    
    // Register completion provider for KCL
    monaco.languages.registerCompletionItemProvider('kcl', {
      provideCompletionItems: async (model, position) => {
        const textUntilPosition = model.getValueInRange({
          startLineNumber: 1,
          startColumn: 1,
          endLineNumber: position.lineNumber,
          endColumn: position.column
        });
        
        try {
          const completions = await kclService.getCompletions({
            prompt: textUntilPosition,
            maxTokens: 150,
            temperature: 0.2
          });
          
          return {
            suggestions: completions.completions.map((comp, index) => ({
              label: comp.text,
              kind: monaco.languages.CompletionItemKind.Function,
              insertText: comp.text,
              documentation: comp.description || 'KCL code suggestion',
              sortText: String(index).padStart(3, '0')
            }))
          };
        } catch (error) {
          console.error('Failed to get KCL completions:', error);
          return { suggestions: [] };
        }
      }
    });
    
    // Set KCL language configuration
    monaco.languages.setMonarchTokensProvider('kcl', {
      keywords: [
        'const', 'let', 'fn', 'return', 'if', 'else', 'for', 'while',
        'startSketchOn', 'startProfileAt', 'line', 'arc', 'tangentArc',
        'close', 'extrude', 'revolve', 'sweep', 'loft', 'shell', 'fillet', 'chamfer'
      ],
      
      tokenizer: {
        root: [
          [/[a-zA-Z_]\w*/, {
            cases: {
              '@keywords': 'keyword',
              '@default': 'identifier'
            }
          }],
          [/\/\/.*$/, 'comment'],
          [/\/\*/, 'comment', '@comment'],
          [/\d+\.?\d*/, 'number'],
          [/".*?"/, 'string'],
          [/'.*?'/, 'string'],
        ],
        
        comment: [
          [/[^\/*]+/, 'comment'],
          [/\*\//, 'comment', '@pop'],
          [/[\/*]/, 'comment']
        ]
      }
    });

    // Set theme
    monaco.editor.defineTheme('kclTheme', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'keyword', foreground: 'ff79c6' },
        { token: 'identifier', foreground: 'f8f8f2' },
        { token: 'number', foreground: 'bd93f9' },
        { token: 'string', foreground: 'f1fa8c' },
        { token: 'comment', foreground: '6272a4' }
      ],
      colors: {
        'editor.background': '#0f172a',
        'editor.foreground': '#f8f8f2',
        'editor.lineHighlightBackground': '#1e293b',
        'editorLineNumber.foreground': '#6272a4',
        'editor.selectionBackground': '#44475a',
      }
    });
    
    monaco.editor.setTheme('kclTheme');
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      onCodeChange?.(value);
    }
  };

  const handleExecute = async () => {
    if (onExecute && !isLoading) {
      await onExecute(code);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([code], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'model.kcl';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.kcl,.txt';
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e) => {
          const content = e.target?.result as string;
          setCode(content);
          onCodeChange?.(content);
        };
        reader.readAsText(file);
      }
    };
    input.click();
  };

  const handleGenerateFromPrompt = async () => {
    if (!onGenerateFromPrompt || !promptInput.trim() || isGenerating) return;
    
    setIsGenerating(true);
    try {
      const generatedCode = await onGenerateFromPrompt(promptInput);
      setCode(generatedCode);
      onCodeChange?.(generatedCode);
      setPromptInput('');
    } catch (error) {
      console.error('Failed to generate KCL code:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className={`flex flex-col bg-slate-900 rounded-lg shadow-2xl ${isFullscreen ? 'fixed inset-0 z-50' : ''}`}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-800 border-b border-slate-700 rounded-t-lg">
        <div className="flex items-center gap-3">
          <FileCode className="w-5 h-5 text-indigo-400" />
          <h3 className="text-white font-semibold">KCL Code Editor</h3>
          <span className="text-xs text-gray-400">Powered by Zoo.dev</span>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleUpload}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="Upload KCL file"
          >
            <Upload className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleDownload}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="Download KCL file"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={handleCopy}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title="Copy code"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
          </button>
          
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-2 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors"
            title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* AI Prompt Input */}
      {onGenerateFromPrompt && (
        <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700">
          <div className="flex gap-2">
            <input
              type="text"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerateFromPrompt()}
              placeholder="Describe what you want to create (e.g., 'box with hinged lid')..."
              className="flex-1 px-3 py-2 bg-slate-700 text-white rounded-lg text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              disabled={isGenerating}
            />
            <button
              onClick={handleGenerateFromPrompt}
              disabled={!promptInput.trim() || isGenerating}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Code2 className="w-4 h-4" />
                  Generate KCL
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Editor */}
      <div className="flex-1 min-h-[400px]">
        {!MonacoEditor ? (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-300 bg-slate-900/80 border border-slate-800 rounded-lg">
            {editorError ? (
              <>
                <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
                <p className="text-sm">{editorError}</p>
              </>
            ) : (
              <>
                <Loader2 className="w-6 h-6 animate-spin text-indigo-400 mb-2" />
                <p className="text-sm">Loading KCL editor…</p>
              </>
            )}
          </div>
        ) : (
          <MonacoEditor
            height="100%"
            defaultLanguage="javascript"
            language="kcl"
            value={code}
            onChange={handleCodeChange}
            onMount={handleEditorDidMount}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: 'on',
              theme: 'kclTheme'
            }}
          />
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-3 bg-red-900/20 border-t border-red-800/50">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 mt-0.5" />
            <span className="text-sm text-red-300">{error}</span>
          </div>
        </div>
      )}

      {/* Footer with Execute Button */}
      {onExecute && (
        <div className="px-4 py-3 bg-slate-800 border-t border-slate-700 rounded-b-lg">
          <button
            onClick={handleExecute}
            disabled={isLoading}
            className="w-full px-4 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Generating Model...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Generate 3D Model
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
