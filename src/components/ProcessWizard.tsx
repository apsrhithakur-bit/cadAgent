import React, { useState, useCallback, useRef, useEffect, Suspense } from 'react';
import { 
  ArrowLeft, 
  ArrowRight, 
  MessageCircle, 
  Eye, 
  Wrench, 
  Users, 
  Search,
  CheckCircle,
  Hand,
  AlertCircle,
  Lock,
  Layers,
  Move3D,
  Wand2,
  Mic,
  MicOff,
  Lightbulb,
  BookOpen,
  Settings,
  RefreshCw,
  Download,
  ExternalLink,
  Loader2,
  Brain,
  Zap,
  ChevronDown,
  AlertTriangle,
  Box,
  Camera
} from 'lucide-react';
const loadModelViewer3D = () => import('./ModelViewer3D');
const ModelViewer3D = React.lazy(loadModelViewer3D);
const loadCrossDeviceARViewer = () => import('./CrossDeviceARViewer');
const CrossDeviceARViewer = React.lazy(loadCrossDeviceARViewer);
const loadSimpleUnifiedARViewer = () => import('./SimpleUnifiedARViewer');
const SimpleUnifiedARViewer = React.lazy(loadSimpleUnifiedARViewer);
const loadMultimodalInputPanel = () => import('./MultimodalInputPanel');
const MultimodalInputPanel = React.lazy(loadMultimodalInputPanel);
const loadCADInputPanel = () => import('./CADInputPanel');
const CADInputPanel = React.lazy(loadCADInputPanel);
const loadCompletionCelebration = () => import('./CompletionCelebration');
const CompletionCelebration = React.lazy(loadCompletionCelebration);
import { voiceService } from '../services/voiceService';
import { architecturalAI } from '../services/architecturalAI';
import { cadAI, type CADExportOptions, CADAIService } from '../services/cadAI';
import { optimizationService, QUICK_OPTIMIZATIONS } from '../services/optimizationService';
import type { CADChatInterfaceRef } from './CADChatInterface';
import type { CustomQuickTool } from './CustomQuickTools';
const loadCADChatInterface = () => import('./CADChatInterface').then(m => ({ default: m.CADChatInterface }));
const CADChatInterface = React.lazy(loadCADChatInterface);
const loadCustomQuickTools = () => import('./CustomQuickTools').then(m => ({ default: m.CustomQuickTools }));
const CustomQuickTools = React.lazy(loadCustomQuickTools);
import type { CalculatedProperties } from '../services/cadPropertyCalculator';
import type { 
  ArchitecturalModel, 
  MultimodalInput, 
  GenerationRequest,
  GenerationResponse,
  CADModelData 
} from '../types/architectural';

const loadManufacturingConnect = () => import('./steps/ManufacturingConnect');
const ManufacturingConnect = React.lazy(loadManufacturingConnect);
const loadPatentSearch = () => import('./steps/PatentSearch');
const PatentSearch = React.lazy(loadPatentSearch);
import { useUsage } from '../hooks/useUsage';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { getModelProductName, extractProductName, formatProductNameForDisplay } from '../utils/productNameExtractor';
import { extractGltfUrlWithReconstruction, isValidShareableUrl, getReconstructionStats } from '../utils/base64ModelReconstructor';
type PrefetchImporter = () => Promise<any>;

const componentPrefetchCache = new Set<string>();

const prefetchModule = (key: string, importer: PrefetchImporter) => {
  if (componentPrefetchCache.has(key)) return;
  componentPrefetchCache.add(key);
  importer().catch((error) => {
    console.warn(`Prefetch failed for ${key}`, error);
    componentPrefetchCache.delete(key);
  });
};

const scheduleIdleCallback = (callback: () => void) => {
  if (typeof window === 'undefined') {
    return () => {};
  }

  if ('requestIdleCallback' in window) {
    const idleId = (window as any).requestIdleCallback(callback);
    return () => (window as any).cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, 200);
  return () => window.clearTimeout(timeoutId);
};

const stepPrefetchMap: Record<string, PrefetchImporter[]> = {
  input: [loadCADInputPanel, loadMultimodalInputPanel],
  model: [loadModelViewer3D],
  ar: [loadSimpleUnifiedARViewer, loadCrossDeviceARViewer],
  iterate: [loadCADChatInterface, loadCustomQuickTools],
  manufacture: [loadManufacturingConnect],
  patent: [loadPatentSearch],
};

// Component deduplication utility
const deduplicateComponents = (components: any[]) => {
  if (!components || components.length === 0) return [];
  
  const uniqueComponents = [];
  const seen = new Set();
  
  for (const component of components) {
    // Create a key based on material, dimensions, and function to identify duplicates
    const key = `${component.material || ''}-${component.dimensions?.width || 0}x${component.dimensions?.length || 0}x${component.dimensions?.height || 0}-${component.function || ''}`.toLowerCase();
    
    if (!seen.has(key)) {
      seen.add(key);
      uniqueComponents.push(component);
    }
  }
  
  return uniqueComponents;
};

// Engineering-based durability assessment
const calculateDurabilityRating = (properties: CalculatedProperties): string => {
  const { manufacturing, specifications } = properties;
  
  // Get material from recommended method
  const material = manufacturing.recommendedMethod.toLowerCase();
  const complexity = specifications.complexity;
  
  // Material durability factors (engineering standards)
  const materialDurability = {
    'pla': 'Medium',           // PLA: Good for prototypes, limited outdoor use
    'abs': 'High',             // ABS: Excellent durability, chemical resistance
    'aluminum': 'Industrial',  // Al-6061: Aerospace grade durability
    'steel': 'Industrial',     // Steel: Maximum structural durability
    'titanium': 'Aerospace',   // Ti-6Al-4V: Ultimate strength-to-weight
    'nylon': 'High'            // Nylon: Excellent wear resistance
  };

  // Complexity impact on durability
  const complexityFactor = {
    'simple': 1.0,    // Simple geometry = higher durability
    'moderate': 0.85, // Some stress concentrations
    'complex': 0.7    // Many potential failure points
  };

  // Base material durability
  let baseDurability = 'Medium';
  for (const [mat, durability] of Object.entries(materialDurability)) {
    if (material.includes(mat)) {
      baseDurability = durability;
      break;
    }
  }

  // Apply complexity adjustment
  const factor = complexityFactor[complexity] || 0.85;
  
  if (factor >= 1.0) {
    return baseDurability;
  } else if (factor >= 0.85) {
    // Slightly reduce for moderate complexity
    if (baseDurability === 'Aerospace') return 'Industrial';
    if (baseDurability === 'Industrial') return 'High';
    if (baseDurability === 'High') return 'Medium';
    return 'Medium';
  } else {
    // Reduce for high complexity
    if (baseDurability === 'Aerospace') return 'High';
    if (baseDurability === 'Industrial') return 'Medium';
    if (baseDurability === 'High') return 'Medium';
    return 'Standard';
  }
};

// Mini 3D Component Renderer
interface MiniComponentRendererProps {
  component: any;
  size?: number;
}

const MiniComponentRenderer: React.FC<MiniComponentRendererProps> = ({ 
  component, 
  size = 80 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  useEffect(() => {
    if (!canvasRef.current || !component.dimensions) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    // Clear canvas with subtle background
    ctx.clearRect(0, 0, size, size);
    
    // Add subtle background gradient
    const gradient = ctx.createRadialGradient(size/2, size/2, 0, size/2, size/2, size/2);
    gradient.addColorStop(0, 'rgba(255,255,255,0.05)');
    gradient.addColorStop(1, 'rgba(0,0,0,0.1)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
    
    const { width, length, height } = component.dimensions;
    
    // Use proper dimensional scaling (ensure no dimension is zero)
    const safeWidth = Math.max(width || 1, 0.1);
    const safeLength = Math.max(length || 1, 0.1);  
    const safeHeight = Math.max(height || 1, 0.1);
    
    const maxDim = Math.max(safeWidth, safeLength, safeHeight);
    const scale = (size * 0.65) / maxDim; // Slightly smaller for better appearance
    
    // Calculate scaled dimensions for isometric view
    const scaledW = safeWidth * scale;
    const scaledL = safeLength * scale;
    const scaledH = safeHeight * scale;
    
    // Enhanced isometric projection for better 3D appearance
    const isoXAngle = Math.PI / 6; // 30 degrees
    const isoYAngle = Math.PI / 6; // 30 degrees
    const isoX = Math.cos(isoXAngle);
    const isoY = Math.sin(isoYAngle);
    
    // Center the drawing with slight offset for better visual balance
    const centerX = size / 2 + 2;
    const centerY = size / 2 - 2;
    
    // Calculate isometric coordinates for a simple box
    const frontBottomLeft = {
      x: centerX - (scaledW * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2
    };
    const frontBottomRight = {
      x: centerX + (scaledW * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2
    };
    const frontTopLeft = {
      x: centerX - (scaledW * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2 - scaledH
    };
    const frontTopRight = {
      x: centerX + (scaledW * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2 - scaledH
    };
    
    const backBottomLeft = {
      x: centerX - (scaledW * isoX) / 2 - (scaledL * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2 - (scaledL * isoY) / 2
    };
    const backBottomRight = {
      x: centerX + (scaledW * isoX) / 2 - (scaledL * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2 - (scaledL * isoY) / 2
    };
    const backTopLeft = {
      x: centerX - (scaledW * isoX) / 2 - (scaledL * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2 - (scaledL * isoY) / 2 - scaledH
    };
    const backTopRight = {
      x: centerX + (scaledW * isoX) / 2 - (scaledL * isoX) / 2,
      y: centerY + (scaledW * isoY) / 2 - (scaledL * isoY) / 2 - scaledH
    };
    
    // Material-based color mapping
    const getComponentColor = (material: string) => {
      const mat = material?.toLowerCase() || '';
      if (mat.includes('aluminum') || mat.includes('metal')) return '#A8A8A8';
      if (mat.includes('plastic') || mat.includes('pla') || mat.includes('abs')) return '#4A9EFF';
      if (mat.includes('wood')) return '#D2691E';
      if (mat.includes('steel')) return '#708090';
      if (mat.includes('carbon')) return '#2F2F2F';
      return '#6366F1'; // Default purple
    };
    
    const color = getComponentColor(component.material);
    
    // Draw the 3D box
    ctx.fillStyle = color;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    
    // Draw front face
    ctx.beginPath();
    ctx.moveTo(frontBottomLeft.x, frontBottomLeft.y);
    ctx.lineTo(frontBottomRight.x, frontBottomRight.y);
    ctx.lineTo(frontTopRight.x, frontTopRight.y);
    ctx.lineTo(frontTopLeft.x, frontTopLeft.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw right face (darker)
    ctx.fillStyle = color + '90'; // Add some transparency for depth
    ctx.beginPath();
    ctx.moveTo(frontBottomRight.x, frontBottomRight.y);
    ctx.lineTo(backBottomRight.x, backBottomRight.y);
    ctx.lineTo(backTopRight.x, backTopRight.y);
    ctx.lineTo(frontTopRight.x, frontTopRight.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Draw top face (lighter)
    ctx.fillStyle = color + 'B0';
    ctx.beginPath();
    ctx.moveTo(frontTopLeft.x, frontTopLeft.y);
    ctx.lineTo(frontTopRight.x, frontTopRight.y);
    ctx.lineTo(backTopRight.x, backTopRight.y);
    ctx.lineTo(backTopLeft.x, backTopLeft.y);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    
    // Add dimension text with better formatting and precision
    if (size >= 60) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.font = 'bold 7px Arial';
      ctx.textAlign = 'center';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 1;
      const dimText = `${safeWidth.toFixed(1)}×${safeLength.toFixed(1)}×${safeHeight.toFixed(1)}mm`;
      ctx.fillText(dimText, centerX, size - 6);
      ctx.shadowBlur = 0;
    }
    
  }, [component, size]);
  
  return (
    <div className="flex-shrink-0">
      <canvas 
        ref={canvasRef}
        width={size}
        height={size}
        className="rounded-lg cosmic-panel"
        title={`${component.name} - ${component.material}`}
      />
    </div>
  );
};

interface ProcessWizardProps {
  onBack: () => void;
  initialStep?: number; // For deep linking to specific steps
  sharedModelData?: any; // Shared model data from QR code scan
}

// CAD Export Types and Component
type CADFormat = 'gltf' | 'stl' | 'obj' | 'ply' | 'fbx' | 'dae';
type ExportStatus = 'ready' | 'loading' | 'failed';

interface CADExportProps {
  model: ArchitecturalModel;
  className?: string;
}

// CAD Format definitions
const CADFormats: Record<CADFormat, { 
  name: string; 
  extension: string; 
  mimeType: string; 
  description: string;
}> = {
  gltf: { name: 'GLTF', extension: '.gltf', mimeType: 'model/gltf+json', description: '3D Graphics Language' },
  stl: { name: 'STL', extension: '.stl', mimeType: 'application/vnd.ms-pki.stl', description: '3D Printing Format' },
  obj: { name: 'OBJ', extension: '.obj', mimeType: 'text/plain', description: 'Wavefront OBJ' },
  ply: { name: 'PLY', extension: '.ply', mimeType: 'application/octet-stream', description: 'Polygon File Format' },
  fbx: { name: 'FBX', extension: '.fbx', mimeType: 'application/octet-stream', description: 'Autodesk FBX' },
  dae: { name: 'DAE', extension: '.dae', mimeType: 'model/vnd.collada+xml', description: 'COLLADA' }
};

// Enhanced CAD Export Component with Zoo CLI consideration
const CADExportComponent: React.FC<CADExportProps> = ({ model, className = '' }) => {
  const [currentFormat, setCurrentFormat] = useState<CADFormat>('stl');
  const [status, setStatus] = useState<ExportStatus>('ready');
  const [cachedFormats, setCachedFormats] = useState<Partial<Record<CADFormat, string>>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  // Client-side conversion using Three.js exporters
  const convertToSTL = async (gltfUrl: string): Promise<string> => {
    const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(gltfUrl);
    
    const exporter = new STLExporter();
    const stlString = exporter.parse(gltf.scene);
    
    const blob = new Blob([stlString], { type: 'application/vnd.ms-pki.stl' });
    return URL.createObjectURL(blob);
  };

  const convertToOBJ = async (gltfUrl: string): Promise<string> => {
    const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(gltfUrl);
    
    const exporter = new OBJExporter();
    const objString = exporter.parse(gltf.scene);
    
    const blob = new Blob([objString], { type: 'text/plain' });
    return URL.createObjectURL(blob);
  };

  const convertToPLY = async (gltfUrl: string): Promise<string> => {
    const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(gltfUrl);
    
    const exporter = new PLYExporter();
    
    // PLY exporter uses a callback pattern
    return new Promise<string>((resolve, reject) => {
      try {
        exporter.parse(gltf.scene, (result: string) => {
          const blob = new Blob([result], { type: 'application/octet-stream' });
          resolve(URL.createObjectURL(blob));
        }, { binary: false });
      } catch (error) {
        reject(error);
      }
    });
  };

  // Future: Zoo CLI integration approach
  const convertWithZooCLI = async (targetFormat: CADFormat, gltfUrl: string): Promise<string> => {
    // This would be implemented later with Zoo's CLI conversion service
    // For now, throwing an error for unsupported formats
    throw new Error(`${targetFormat.toUpperCase()} conversion via Zoo CLI not yet implemented. Consider using Zoo's conversion service: https://zoo.dev/docs/developer-tools/cli/manual/zoo_file_convert`);
  };

  // Convert GLTF to other formats
  const convertFormat = async (targetFormat: CADFormat): Promise<string> => {
    if (cachedFormats[targetFormat]) {
      return cachedFormats[targetFormat];
    }

    if (!model?.cadModel?.gltfUrl) {
      throw new Error('No CAD model available for export');
    }

    setStatus('loading');
    
    try {
      let convertedUrl: string;
      const gltfUrl = model.cadModel.gltfUrl;
      
      switch (targetFormat) {
        case 'gltf':
          convertedUrl = gltfUrl;
          break;
        case 'stl':
          convertedUrl = await convertToSTL(gltfUrl);
          break;
        case 'obj':
          convertedUrl = await convertToOBJ(gltfUrl);
          break;
        case 'ply':
          convertedUrl = await convertToPLY(gltfUrl);
          break;
        case 'fbx':
        case 'dae':
          // Future: Use Zoo CLI for professional formats
          convertedUrl = await convertWithZooCLI(targetFormat, gltfUrl);
          break;
        default:
          throw new Error(`Unsupported format: ${targetFormat}`);
      }
      
      // Cache the converted format
      setCachedFormats(prev => ({
        ...prev,
        [targetFormat]: convertedUrl
      }));
      
      setStatus('ready');
      return convertedUrl;
    } catch (error) {
      console.error('Format conversion failed:', error);
      setStatus('failed');
      throw error;
    }
  };

  const handleDropdownToggle = () => {
    setDropdownOpen(!dropdownOpen);
  };

  const handleFormatChange = async (format: CADFormat) => {
    setCurrentFormat(format);
    setDropdownOpen(false);
    
    try {
      const downloadUrl = await convertFormat(format);
      
      // Trigger download
      if (downloadLinkRef.current) {
        const modelPrompt = model.cadModel?.prompt || model.description || model.name || model.productSpecs?.name || 'cad-model';
        const cleanModelName = CADAIService.cleanProductName(modelPrompt);
        downloadLinkRef.current.href = downloadUrl;
        downloadLinkRef.current.download = `${cleanModelName.replace(/\.[^/.]+$/, '')}${CADFormats[format].extension}`;
        downloadLinkRef.current.click();
      }
    } catch (error) {
      console.error('Download failed:', error);
      setStatus('failed');
      setTimeout(() => setStatus('ready'), 3000);
    }
  };

  // Only show supported formats for client-side conversion
  const supportedFormats = ['gltf', 'stl', 'obj', 'ply'] as CADFormat[];
  const formatOptions = supportedFormats.map(format => ({
    value: format,
    label: CADFormats[format].name,
    description: CADFormats[format].description
  }));

  return (
    <div className={`relative ${className}`}>
      <div className={`flex items-center bg-gradient-to-r from-cyan-500 to-blue-500 rounded-xl overflow-hidden shadow-lg ${
        status === 'loading' ? 'animate-pulse' : ''
      } ${status === 'failed' ? 'from-red-500 to-red-600' : ''}`}>
        
        {/* Download Button */}
        <button
          disabled={status === 'loading'}
          className={`flex items-center gap-2 px-4 py-3 text-white font-semibold transition-all flex-grow ${
            status === 'loading' ? 'cursor-not-allowed opacity-70' : 'hover:bg-white/10'
          }`}
          onClick={() => handleFormatChange(currentFormat)}
        >
          {status === 'loading' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === 'failed' ? (
            <AlertTriangle className="w-4 h-4" />
          ) : (
            <Download className="w-4 h-4" />
          )}
          
          <span>
            {status === 'loading' 
              ? 'Converting...' 
              : status === 'failed' 
              ? 'Try Again' 
              : `Export ${CADFormats[currentFormat].name}`}
          </span>
        </button>

        {/* Format Dropdown */}
        <div className="relative">
          <button
            onClick={handleDropdownToggle}
            disabled={status === 'loading'}
            className={`flex items-center gap-1 px-3 py-3 text-white border-l border-white/20 transition-all ${
              status === 'loading' ? 'cursor-not-allowed opacity-70' : 'hover:bg-white/10'
            }`}
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${
              dropdownOpen ? 'rotate-180' : ''
            }`} />
          </button>
        </div>
      </div>

      {/* Hidden download link */}
      <a
        ref={downloadLinkRef}
        className="hidden"
        href="#"
        download=""
      >
        Download
      </a>

      {/* Click outside to close dropdown */}
      {dropdownOpen && (
        <div 
          className="fixed inset-0 z-[9998]" 
          onClick={() => setDropdownOpen(false)}
        />
      )}

      {/* Dropdown Menu - Simple positioning below export button */}
      {dropdownOpen && (
        <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 w-48 cosmic-panel rounded-lg shadow-xl z-[99999]">
          <div className="py-2">
            {formatOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => handleFormatChange(option.value)}
                className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                  currentFormat === option.value 
                    ? 'bg-cyan-500/20 text-cyan-300' 
                    : 'text-gray-300 cosmic-hover-glow hover:text-white'
                }`}
              >
                <div className="font-mono font-semibold">{option.label}</div>
                <div className="text-xs text-gray-400">{option.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Step 1: Combined Input Step (Multimodal + CAD)
const CombinedInputStep: React.FC<{
  onComplete: (model: ArchitecturalModel) => void;
}> = ({ onComplete }) => {
  const [selectedMode, setSelectedMode] = useState<'technical' | 'multimodal'>('multimodal');

  const handleCADGenerated = (model: ArchitecturalModel) => {
    onComplete(model);
  };

  const handleMultimodalComplete = (model: ArchitecturalModel) => {
    onComplete(model);
  };

  return (
    <div className="space-y-8">
      <div className="text-center mb-12">
        <div className="mb-6">
          <h2 className="text-4xl font-black cosmic-glow-text mb-2 tracking-wider">IGNITE YOUR VISION</h2>
          <div className="cosmic-divider mx-auto max-w-xs"></div>
        </div>
        <p className="cosmic-text-shadow text-xl max-w-4xl mx-auto leading-relaxed">
          Choose your path to <span className="text-cyan-400 font-semibold">manifest reality</span>. Both methods harness the infinite power of AI to transform your imagination into <span className="text-purple-400 font-semibold">professional CAD models</span>.
        </p>
      </div>

      {/* Cosmic Mode Selection */}
      <div className="flex gap-8 max-w-5xl mx-auto mb-12">
          <button
          onClick={() => setSelectedMode('multimodal')}
          className={`group flex-1 p-8 rounded-3xl border-2 transition-all duration-500 relative overflow-hidden ${
            selectedMode === 'multimodal'
              ? 'border-cyan-400 bg-gradient-to-br from-cyan-400/20 via-purple-500/10 to-transparent shadow-2xl shadow-cyan-400/30'
              : 'border-purple-400/30 bg-gradient-to-br from-purple-900/20 via-indigo-900/10 to-transparent hover:border-cyan-400/50 hover:shadow-xl hover:shadow-cyan-400/20'
            }`}
          >
          {/* Cosmic background shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
          <div className="text-center relative z-10">
            <div className="relative mb-6">
              <Brain className="w-16 h-16 mx-auto text-cyan-400 group-hover:scale-110 transition-transform duration-300" />
              <div className="absolute inset-0 bg-cyan-400/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
            <h3 className="text-2xl font-black cosmic-glow-text mb-3">INTUITIVE CREATION</h3>
            <p className="cosmic-text-shadow text-gray-300 leading-relaxed">
              Channel your creative energy through <span className="text-cyan-400 font-medium">voice, sketches, photos, and words</span> to birth your vision into reality
            </p>
            </div>
          </button>
          
          <button
          onClick={() => setSelectedMode('technical')}
          className={`group flex-1 p-8 rounded-3xl border-2 transition-all duration-500 relative overflow-hidden ${
            selectedMode === 'technical'
              ? 'border-cyan-400 bg-gradient-to-br from-cyan-400/20 via-purple-500/10 to-transparent shadow-2xl shadow-cyan-400/30'
              : 'border-purple-400/30 bg-gradient-to-br from-purple-900/20 via-indigo-900/10 to-transparent hover:border-cyan-400/50 hover:shadow-xl hover:shadow-cyan-400/20'
            }`}
          >
          {/* Cosmic background shimmer */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-400/10 to-transparent -skew-x-12 translate-x-[-100%] group-hover:translate-x-[200%] transition-transform duration-1000"></div>
          <div className="text-center relative z-10">
            <div className="relative mb-6">
              <Zap className="w-16 h-16 mx-auto text-purple-400 group-hover:scale-110 transition-transform duration-300" />
              <div className="absolute inset-0 bg-purple-400/20 rounded-full blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
            </div>
            <h3 className="text-2xl font-black cosmic-glow-text mb-3">PRECISION ENGINEERING</h3>
            <p className="cosmic-text-shadow text-gray-300 leading-relaxed">
              Harness <span className="text-purple-400 font-medium">advanced technical specifications</span> and direct CAD generation for ultimate precision
            </p>
            </div>
          </button>
      </div>

      {/* Selected Mode Content */}
      {selectedMode === 'multimodal' ? (
        <MultimodalDesignInput onComplete={handleMultimodalComplete} />
      ) : (
        <CADGenerationStep onComplete={handleCADGenerated} />
      )}
    </div>
  );
};

// Original CAD Generation Component for technical input mode
const CADGenerationStep: React.FC<{
  onComplete: (model: ArchitecturalModel) => void;
}> = ({ onComplete }) => {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleCADGenerated = (model: ArchitecturalModel) => {
    onComplete(model);
  };

  return (
    <div className="space-y-6">
      <Suspense fallback={<div className="max-w-6xl mx-auto text-white">Loading CAD input…</div>}>
        <CADInputPanel 
          onCADGenerated={handleCADGenerated}
          isGenerating={isGenerating}
          className="max-w-6xl mx-auto"
        />
      </Suspense>
    </div>
  );
};

// Step 2: Multimodal Input Component (Legacy)
const MultimodalDesignInput: React.FC<{
  onComplete: (model: ArchitecturalModel) => void;
}> = ({ onComplete }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Add usage tracking hooks
  const { canUseDesign, incrementDesignUsage } = useUsage();
  const { user } = useAuth();

  const handleInputSubmit = async (input: MultimodalInput) => {
    // Check if user can create more designs
    if (!canUseDesign()) {
      setShowUpgradePrompt(true);
      return;
    }

    setIsProcessing(true);
    setError(null);
    setProcessingSteps([]);
    setShowUpgradePrompt(false);

    try {
      // Increment design usage before generation
      const canProceed = await incrementDesignUsage();
      
      if (!canProceed) {
        setShowUpgradePrompt(true);
        setIsProcessing(false);
        return;
      }

      // Step 1: Process all multimodal inputs through architecturalAI
      setProcessingSteps(['Analyzing your multimodal inputs...']);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      console.log('🔍 User provided multimodal inputs:', input);
      
      // Process multimodal inputs through architecturalAI to get structured data
      const processedData = await architecturalAI.generateModel({
        inputs: input,
        preferences: {
          style: 'modern',
          units: 'metric',
          complexity: 'simple'
        }
      });
      
      // Step 2: Generate AI-enhanced CAD prompt from processed data
      setProcessingSteps(prev => [...prev, 'Creating AI-enhanced CAD prompt...']);
      await new Promise(resolve => setTimeout(resolve, 800));
      
      let cadPrompt = '';
      
      // Use AI-generated product specifications from architecturalAI
      console.log('🔍 Checking processedData.model.productSpecs:', processedData.model.productSpecs);
      if (processedData.model.productSpecs?.technicalPrompt) {
        cadPrompt = processedData.model.productSpecs.technicalPrompt;
        console.log('✅ Using AI-generated technical prompt:', cadPrompt);
        console.log('🔍 This prompt should reflect user inputs:', input);
      } else {
        // Fallback: Generate enhanced prompt from AI analysis
        console.log('🔄 Generating enhanced prompt from AI analysis...');
        
        try {
          // Use the original inputs and processed data to create a technical prompt through AI
          const enhancedPrompt = await architecturalAI.generateTechnicalPromptWithAI(
            input, // Pass original multimodal inputs
            processedData.model // Pass processed analysis
          );
          
          if (enhancedPrompt?.technicalPrompt) {
            cadPrompt = enhancedPrompt.technicalPrompt;
            console.log('✅ AI-enhanced prompt generated:', cadPrompt);
          } else {
            throw new Error('AI prompt generation failed');
          }
        } catch (error) {
          console.warn('⚠️ AI prompt generation failed, using fallback:', error);
          
          // Final fallback: Use descriptive text from processed data
          const description = processedData.model.description || 
                             processedData.model.name || 
                             'mechanical component';
          
          // Create simple technical prompt from description
          cadPrompt = description
            .toLowerCase()
            .replace(/[^a-z\s]/g, '')
            .split(' ')
            .slice(0, 5)
            .join(' ');
          
          console.log('✅ Fallback prompt created:', cadPrompt);
        }
      }
      
      // Ensure prompt is valid and concise
      if (!cadPrompt || cadPrompt.trim().length === 0) {
        cadPrompt = 'design mechanical component';
      }
      
      // Limit to 5 words maximum for Zoo API compatibility
      const words = cadPrompt.trim().split(' ').filter(w => w.length > 0);
      if (words.length > 5) {
        cadPrompt = words.slice(0, 5).join(' ');
      }
      
      console.log('✅ Final CAD prompt:', cadPrompt);
      
      setProcessingSteps(prev => [...prev, 'Generating 3D CAD model...']);
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setProcessingSteps(prev => [...prev, 'Creating 3D prototype...']);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setProcessingSteps(prev => [...prev, 'Optimizing for manufacturing...']);
      
      // Import cadAI dynamically to avoid circular dependencies
      const { cadAI } = await import('../services/cadAI');
      
      // Generate CAD model using AgenticadML AI with progress tracking
      console.log('🚀 About to call cadAI.generateAndWaitForCAD with prompt:', cadPrompt);
      const cadModel = await cadAI.generateAndWaitForCAD({
        prompt: cadPrompt,
        outputFormat: 'gltf',
        units: 'mm'
      }, false, (step: string, details?: any) => {
        // Update processing steps based on actual progress
        setProcessingSteps(prev => {
          const newSteps = [...prev];
          if (!newSteps.includes(step)) {
            newSteps.push(step);
          }
          return newSteps;
        });
      });

      console.log('✅ CAD generation completed, received cadModel:', !!cadModel);

      // Debug: Check if cadModel has shareableGltfUrl
      console.log('🔧 CAD Model from cadAI service:', {
        hasGltfUrl: !!cadModel.gltfUrl,
        gltfUrlType: cadModel.gltfUrl?.startsWith('blob:') ? 'blob' : 'url',
        hasShareableGltfUrl: !!cadModel.shareableGltfUrl,
        shareableGltfUrl: cadModel.shareableGltfUrl,
        gltfUrl: cadModel.gltfUrl,
        cadModelKeys: Object.keys(cadModel)
      });

      // Convert CAD model to ArchitecturalModel format
      // Map CAD dimensions (width, height, depth) to architectural dimensions (width, length, height)
      const mappedDimensions = {
        width: cadModel.properties.dimensions.width,
        length: cadModel.properties.dimensions.depth, // Map depth to length
        height: cadModel.properties.dimensions.height
      };

      // Use the processed data to create a more comprehensive model
      const modelName = processedData.model.productSpecs?.name || 
                       processedData.model.name || 
                       cadPrompt;
      
      const architecturalModel: ArchitecturalModel = {
        id: cadModel.id,
        name: modelName,
        description: processedData.model.productSpecs?.description || 
                    processedData.model.description || 
                    `3D model generated from: "${cadPrompt}"`,
        rooms: [{
          id: 'cad_component',
          name: 'CAD Model',
          dimensions: mappedDimensions,
          position: { x: 0, y: 0, z: 0 },
          connections: [],
          features: ['cad_generated'],
          materials: { walls: '#cccccc', floor: '#999999', ceiling: '#ffffff' }
        }],
        doors: [],
        windows: [],
        totalArea: cadModel.properties.volume,
        style: 'modern',
        created: new Date(),
        modified: new Date(),
        // Store the CAD model data
        cadModel: cadModel,
        productSpecs: {
          name: modelName,
          title: modelName, // Also set the title for patent search
          description: processedData.model.productSpecs?.description || 
                      processedData.model.description || 
                      `3D model generated from user input: "${cadPrompt}"`,
          style: processedData.model.productSpecs?.style || 
                processedData.model.style || 
                'modern',
          components: processedData.model.productSpecs?.components || 
                     [{
                       name: `${modelName} - Main Component`,
                       dimensions: mappedDimensions,
                       material: 'Generated material',
                       function: `Primary structural element for ${modelName}`,
                       features: ['cad_generated'],
                       connections: []
                     }],
          totalVolume: cadModel.properties.volume,
          manufacturing: processedData.model.productSpecs?.manufacturing || 
                        processedData.model.manufacturing || 
                        {
                          method: '3D printing',
                          materials: ['PLA plastic'],
                          complexity: cadModel.properties.complexity,
                          estimated_cost: '$25-75'
                        },
          specifications: processedData.model.productSpecs?.specifications || 
                         processedData.model.specifications || 
                         {
                           weight: '200g',
                           dimensions: {
                             length: mappedDimensions.length,
                             width: mappedDimensions.width,
                             height: mappedDimensions.height
                           },
                           color_options: ['natural'],
                           durability: 'medium'
                         }
        }
      };
      
      setProcessingSteps(prev => [...prev, 'Complete!']);
      onComplete(architecturalModel);
      
    } catch (error) {
      console.error('Error generating CAD model:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      // Enhanced error messaging for common issues
      let userFriendlyMessage = 'Failed to generate product model. Please try again.';
      
      if (errorMessage.includes('422')) {
        userFriendlyMessage = 'The AI had trouble understanding your description. Try being more specific about the shape, size, or function of your product.';
      } else if (errorMessage.includes('429')) {
        userFriendlyMessage = 'Too many requests. Please wait a moment before trying again.';
      } else if (errorMessage.includes('AgenticadML API')) {
        userFriendlyMessage = 'The 3D modeling service is temporarily unavailable. Please try again in a few minutes.';
      } else if (errorMessage.includes('404')) {
        userFriendlyMessage = 'The 3D modeling service is not properly configured. Please contact support.';
      }
      
      setError(userFriendlyMessage);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-12">
        <div className="mb-8">
          <h2 className="text-5xl font-black cosmic-glow-text mb-4 tracking-wider">CHANNEL YOUR IMAGINATION</h2>
          <div className="cosmic-divider mx-auto max-w-md"></div>
        </div>
        <p className="cosmic-text-shadow text-xl max-w-4xl mx-auto leading-relaxed">
          Unleash your creative force through <span className="text-cyan-400 font-semibold">voice, sketches, images, and words</span>. 
          Our quantum <span className="text-purple-400 font-semibold">AgenticadML AI</span> will transcend dimensions to manifest your vision into <span className="text-cyan-300 font-semibold">precision 3D reality</span>.
        </p>
      </div>

      <Suspense fallback={<div className="max-w-6xl mx-auto text-white">Loading inputs…</div>}>
        <MultimodalInputPanel 
          onSubmit={handleInputSubmit}
          isProcessing={isProcessing}
          className="max-w-6xl mx-auto"
          key="multimodal-input" // Force remount on step changes
        />
      </Suspense>

      {/* Upgrade Prompt Modal */}
      {showUpgradePrompt && (
        <div className="max-w-6xl mx-auto bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-400" />
              <div>
                <h4 className="text-orange-400 font-medium text-sm">Design Limit Reached</h4>
                <p className="text-orange-300 text-sm">You've reached your monthly design generation limit. Upgrade to continue creating.</p>
              </div>
            </div>
            <button
              onClick={() => setShowUpgradePrompt(false)}
              className="text-orange-400 hover:text-orange-300 transition-colors px-3 py-1 rounded-lg hover:bg-orange-500/10"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Processing Overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center">
          <div className="bg-gradient-to-br from-purple-900/95 to-purple-800/95 backdrop-blur-sm border border-purple-500/30 rounded-3xl p-12 max-w-lg w-full mx-8 shadow-2xl">
            <div className="text-center">
              {/* Loading Spinner */}
              <div className="relative w-20 h-20 mx-auto mb-8">
                <div className="absolute inset-0 border-4 border-cyan-400/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-transparent border-t-cyan-400 rounded-full animate-spin"></div>
                <div className="absolute inset-2 border-2 border-cyan-400/30 rounded-full"></div>
              </div>
              
              {/* Main Heading */}
              <h3 className="text-3xl font-bold text-white mb-8">Generating Your 3D CAD Model</h3>
              
              {/* Progress Steps */}
              <div className="space-y-4 text-left">
                {[
                  'Analyzing your product concept...',
                  'Generating 3D CAD model...',
                  'Creating 3D prototype...',
                  'Optimizing for manufacturing...'
                ].map((step, index) => (
                  <div key={index} className="flex items-center gap-4">
                    <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                      index < processingSteps.length 
                        ? 'bg-green-500 shadow-lg shadow-green-500/30' 
                        : index === processingSteps.length 
                        ? 'bg-cyan-500 animate-pulse shadow-lg shadow-cyan-500/30' 
                        : 'bg-gray-600/50 border border-gray-500/30'
                    }`}>
                      {index < processingSteps.length ? (
                        <CheckCircle className="w-4 h-4 text-white" />
                      ) : index === processingSteps.length ? (
                        <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                      ) : (
                        <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                      )}
                    </div>
                    <span className={`text-lg transition-all duration-300 ${
                      index < processingSteps.length 
                        ? 'text-green-400 font-medium' 
                        : index === processingSteps.length 
                        ? 'text-cyan-400 font-medium' 
                        : 'text-gray-400'
                    }`}>
                      {step}
                    </span>
                  </div>
                ))}
              </div>
              
              {/* Status Message */}
              <div className="mt-8 text-gray-300">
                {processingSteps.length === 0 && (
                  <p className="text-sm animate-pulse">Starting CAD generation...</p>
                )}
                {processingSteps.length > 0 && processingSteps.length < 4 && (
                  <p className="text-sm">Using AgenticadML AI Engine...</p>
                )}
                {processingSteps.length === 4 && (
                  <p className="text-sm text-green-400 font-medium">Almost complete!</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="max-w-6xl mx-auto p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-red-400 font-medium">CAD Generation Error</p>
              <p className="text-red-300 text-sm mt-1">{error}</p>
              <p className="text-gray-400 text-xs mt-2">
                💡 Tip: Try describing a simple mechanical object like "a bracket with mounting holes" or "a cylindrical container with a lid"
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Step 2: 3D Model Viewer Component
const ThreeDModelViewer: React.FC<{
  model: ArchitecturalModel | null;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
  calculatedProperties?: CalculatedProperties | null;
}> = ({ model, onModelUpdate, onPropertiesCalculated, calculatedProperties }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [manufacturingCost, setManufacturingCost] = useState<any>(null);
  const [gltfData, setGltfData] = useState<any>(null); // NEW: Store captured GLTF data
  const [viewMode, setViewMode] = useState<'3d' | 'ar'>('3d'); // Keep for AR mode toggle
  
  // Initialize editable data from model
  const [editableData, setEditableData] = useState({
    title: model?.cadModel?.prompt ? extractProductName(model.cadModel.prompt) : (model?.description ? extractProductName(model.description) : (model?.name ? extractProductName(model.name) : 'CAD Model')),
    description: model?.description || '',
    specifications: {
      weight: model?.productSpecs?.specifications?.weight || 'Unknown',
      volume: model?.productSpecs?.totalVolume ? `${model.productSpecs.totalVolume} cm³` : 'Unknown',
      style: model?.productSpecs?.style || model?.style || 'modern',
      durability: model?.productSpecs?.specifications?.durability || 'High'
    },
    manufacturing: {
      method: model?.productSpecs?.manufacturing?.method || '3D Printing',
      materials: model?.productSpecs?.manufacturing?.materials || ['PLA'],
      complexity: model?.productSpecs?.manufacturing?.complexity || 'moderate',
      cost: model?.productSpecs?.manufacturing?.estimated_cost || '15-25 USD',
      reasoning: ''
    },
    components: deduplicateComponents(model?.productSpecs?.components || [])
  });

  // Enhanced: Callback to capture mechanical analysis and GLTF data
  const handleGLTFDataLoaded = useCallback((capturedGltfData: any, mechanicalAnalysis?: any) => {
    console.log('🔧 Mechanical analysis data captured:', {
      hasGltfData: !!capturedGltfData,
      hasMechanicalAnalysis: !!mechanicalAnalysis,
      componentCount: mechanicalAnalysis?.components?.length || 0,
      totalMass: mechanicalAnalysis?.massProperties?.totalMass || 0,
      materials: mechanicalAnalysis?.materials?.length || 0
    });
    
    setGltfData(capturedGltfData);
    
    // Update editable data with REAL mechanical component data
    if (mechanicalAnalysis) {
      setEditableData(prev => ({
        ...prev,
        // Update component count and details with REAL data
        components: mechanicalAnalysis.components.map((comp: any) => ({
          name: comp.name,
          material: mechanicalAnalysis.materials?.[0] || comp.material, // Use consistent material
          dimensions: comp.massProperties.boundingBox.dimensions,
          function: comp.function,
          mass: comp.massProperties.mass,
          volume: comp.massProperties.volume,
          type: comp.type,
          complexity: comp.manufacturingFeatures.complexity
        })),
        // Update specifications with calculated mass properties
        specifications: {
          ...prev.specifications,
          weight: `${Math.round(mechanicalAnalysis.massProperties.totalMass)} g`,
          volume: `${Math.round(mechanicalAnalysis.massProperties.totalVolume * 10) / 10} cm³`,
          dimensions: mechanicalAnalysis.massProperties.overallDimensions
        },
        // Update manufacturing with intelligent recommendations
        manufacturing: {
          method: mechanicalAnalysis.manufacturingRecommendations.primaryMethod,
          materials: mechanicalAnalysis.materials,
          complexity: mechanicalAnalysis.manufacturingRecommendations.complexity,
          cost: `${mechanicalAnalysis.manufacturingRecommendations.estimatedCost.min}-${mechanicalAnalysis.manufacturingRecommendations.estimatedCost.max} USD`,
          reasoning: mechanicalAnalysis.manufacturingRecommendations.reasoning
        }
      }));
      
      console.log('✅ UI updated with real mechanical data');
    }
  }, []);

  const analyzeCADWithAI = async () => {
    if (!model?.cadModel) {
      console.warn('No CAD model available for AI analysis');
      return;
    }

    setIsAnalyzing(true);
    try {
      // Prepare CAD data for analysis
      const cadData = {
        prompt: model.description || model.name,
        volume: model.cadModel.properties?.volume || model.productSpecs?.totalVolume,
        complexity: model.cadModel.properties?.complexity,
        components: model.productSpecs?.components || model.rooms,
        gltfUrl: model.cadModel.gltfUrl,
        gltfData: gltfData // NEW: Send parsed GLTF data if available
      };

      console.log('📤 Sending CAD analysis request with:', {
        hasGltfData: !!gltfData,
        hasGltfUrl: !!cadData.gltfUrl,
        prompt: cadData.prompt
      });

      // Call Gemini Flash API for analysis via Supabase Edge Function
      const { data: analysis, error } = await supabase.functions.invoke('analyze-cad', {
        body: cadData
      });

      if (error) {
        console.warn('AI analysis failed:', error);
        console.warn('Using existing data');
      } else if (analysis) {
        setEditableData(prev => ({
          ...prev,
          title: analysis.title || prev.title,
          description: analysis.description || prev.description,
          specifications: {
            weight: analysis.specifications?.weight || prev.specifications.weight,
            volume: analysis.specifications?.volume || prev.specifications.volume,
            style: analysis.specifications?.style || prev.specifications.style,
            durability: analysis.specifications?.durability || prev.specifications.durability
          },
          manufacturing: {
            method: analysis.manufacturing?.method || prev.manufacturing.method,
            materials: analysis.manufacturing?.materials || prev.manufacturing.materials,
            complexity: analysis.manufacturing?.complexity || prev.manufacturing.complexity,
            cost: analysis.manufacturing?.cost || prev.manufacturing.cost,
            reasoning: analysis.manufacturing?.reasoning || prev.manufacturing.reasoning
          }
        }));
      
        // Update model and editable data with new component data if available
        if (analysis.components && onModelUpdate) {
          // Update editable data state
          setEditableData(prev => ({
            ...prev,
            components: analysis.components
          }));
          
          const updatedModel = {
            ...model,
            productSpecs: {
              ...model.productSpecs,
              name: analysis.title || model.productSpecs?.name || model.name,
              description: analysis.description || model.productSpecs?.description || model.description,
              style: analysis.specifications?.style || model.productSpecs?.style || model.style || 'modern',
              components: analysis.components,
              specifications: {
                ...model.productSpecs?.specifications,
                weight: analysis.specifications?.weight || model.productSpecs?.specifications?.weight || 'Unknown',
                durability: analysis.specifications?.durability || model.productSpecs?.specifications?.durability || 'High',
                dimensions: model.productSpecs?.specifications?.dimensions || { length: 10, width: 10, height: 10 },
                color_options: model.productSpecs?.specifications?.color_options || ['Default']
              },
              manufacturing: {
                method: analysis.manufacturing?.method || model.productSpecs?.manufacturing?.method || '3D Printing',
                materials: analysis.manufacturing?.materials || model.productSpecs?.manufacturing?.materials || ['PLA'],
                complexity: analysis.manufacturing?.complexity || model.productSpecs?.manufacturing?.complexity || 'moderate',
                estimated_cost: analysis.manufacturing?.cost || model.productSpecs?.manufacturing?.estimated_cost || '15-25 USD'
              }
            }
          };
          onModelUpdate(updatedModel);
        }
        
        console.log('✅ AI analysis completed with', analysis.components?.length || 0, 'components analyzed');
      } else {
        console.warn('AI analysis returned no data, using existing data');
      }
    } catch (error) {
      console.error('AI analysis error:', error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Save edited data back to model
  const saveEditedData = () => {
    if (model && onModelUpdate) {
      const updatedModel = {
        ...model,
        name: editableData.title,
        description: editableData.description,
        productSpecs: {
          name: editableData.title,
          description: editableData.description,
          specifications: {
            weight: editableData.specifications.weight,
            durability: editableData.specifications.durability,
            dimensions: model.productSpecs?.specifications?.dimensions || { length: 100, width: 100, height: 10 },
            color_options: model.productSpecs?.specifications?.color_options || ['Default']
          },
          manufacturing: {
            method: editableData.manufacturing.method,
            materials: editableData.manufacturing.materials,
            complexity: editableData.manufacturing.complexity,
            estimated_cost: editableData.manufacturing.cost
          },
          style: editableData.specifications.style,
          totalVolume: parseFloat(editableData.specifications.volume.replace(/[^\d.]/g, '')) || model.productSpecs?.totalVolume || 0,
          components: editableData.components || model.productSpecs?.components || []
        }
      };
      onModelUpdate(updatedModel);
    }
    setIsEditing(false);
  };

  // Note: STL export functionality moved to CADExportComponent

  // Handle Send to Manufacturer
  const handleSendToManufacturer = async () => {
    if (!model?.cadModel) {
      alert('No CAD model available');
      return;
    }

    setIsExporting(true);
    setExportError(null);

    try {
      // Estimate manufacturing cost first
      const cost = await cadAI.estimateManufacturingCost(model.cadModel, 'PLA');
      setManufacturingCost(cost);

      // Generate multiple export formats for manufacturer
      const formats: Array<'stl' | 'step' | 'obj'> = ['stl', 'step', 'obj'];
      const exportPromises = formats.map(async (format) => {
        try {
          const exportOptions: CADExportOptions = {
            format,
            units: 'mm',
            quality: 'high'
          };
          const result = await cadAI.exportCADModel(model.cadModel!, exportOptions);
          return { format, ...result };
        } catch (error) {
          console.warn(`Export failed for ${format}:`, error);
          return null;
        }
      });

      const exportResults = await Promise.all(exportPromises);
      const successfulExports = exportResults.filter(result => result !== null);

      if (successfulExports.length === 0) {
        throw new Error('No export formats were successful');
      }

      // Create a summary for the manufacturer
      const manufacturerPackage = {
        modelId: model.cadModel.id,
        description: model.productSpecs?.description || model.description,
        specifications: model.productSpecs?.specifications,
        manufacturing: model.productSpecs?.manufacturing,
        estimatedCost: cost,
        availableFiles: successfulExports
      };

      console.log('📦 Manufacturer package prepared:', manufacturerPackage);
      
      // For now, download the STL file and show manufacturer info
      const stlExport = successfulExports.find(exp => exp?.format === 'stl');
      if (stlExport) {
        const link = document.createElement('a');
        link.href = stlExport.downloadUrl;
        link.download = stlExport.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }

      alert(`Manufacturing package prepared!\n\nEstimated cost: $${cost.cost} USD\nMaterial: ${cost.material}\nVolume: ${cost.volume.toFixed(2)} cm³\n\nSTL file downloaded for manufacturer review.`);

    } catch (error) {
      console.error('❌ Manufacturer export failed:', error);
      setExportError('Failed to prepare manufacturer package. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-12">
        <div className="mb-8">
          <h2 className="text-5xl font-black cosmic-glow-text mb-4 tracking-wider">BEHOLD YOUR CREATION</h2>
          <div className="cosmic-divider mx-auto max-w-lg"></div>
        </div>
        <p className="cosmic-text-shadow text-xl max-w-4xl mx-auto leading-relaxed">
          Your imagination has taken <span className="text-cyan-400 font-semibold">dimensional form</span>. Navigate through your prototype in full glory, 
          examine every detail of your creation, and <span className="text-purple-400 font-semibold">prepare to merge digital with reality</span>.
        </p>
      </div>

      <Suspense fallback={<div className="max-w-6xl mx-auto h-[600px] flex items-center justify-center text-white">Loading 3D viewer…</div>}>
        <ModelViewer3D 
          model={model}
          calculatedProperties={calculatedProperties}
          onARModeToggle={(enabled: boolean) => setViewMode(enabled ? 'ar' : '3d')}
          onModelUpdate={onModelUpdate}
          onGLTFDataLoaded={handleGLTFDataLoaded}
          onPropertiesCalculated={onPropertiesCalculated}
          className="max-w-6xl mx-auto h-[600px]"
        />
      </Suspense>
      
      {/* Debug info for shared model data */}
      {console.log('🎯 ThreeDModelViewer: Passing model to ModelViewer3D:', {
        hasModel: !!model,
        hasCadModel: !!model?.cadModel,
        gltfUrl: model?.cadModel?.gltfUrl,
        modelId: model?.id,
        modelName: model?.name
      })}

      {/* Export Error Message */}
      {exportError && (
        <div className="max-w-6xl mx-auto bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div>
              <p className="text-red-400 font-medium">Export Error</p>
              <p className="text-red-300 text-sm">{exportError}</p>
            </div>
          </div>
        </div>
      )}

      {/* Model Information Panel */}
      {model && (
        <div className="max-w-6xl mx-auto bg-gradient-to-br from-purple-900/90 to-purple-800/90 backdrop-blur-sm border border-purple-500/30 rounded-2xl p-8">
          {/* Header with title and edit controls */}
          <div className="flex items-center justify-between mb-6">
            {isEditing ? (
              <input
                type="text"
                value={editableData.title}
                onChange={(e) => setEditableData(prev => ({ ...prev, title: e.target.value }))}
                className="text-2xl font-bold text-white bg-transparent border-b border-cyan-400 focus:outline-none focus:border-cyan-300 flex-1 mr-4"
                placeholder="Model Title"
              />
            ) : (
              <h3 
                className="text-2xl font-bold text-white cursor-pointer hover:text-cyan-300 transition-colors"
                onDoubleClick={() => setIsEditing(true)}
                title="Double-click to edit"
              >
                {editableData.title}
          </h3>
            )}
            
            <div className="flex items-center gap-2">
              {/* Edit/Save Button */}
              {isEditing ? (
                <div className="flex gap-2">
                  <button
                    onClick={saveEditedData}
                    className="flex items-center gap-2 px-3 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors text-sm"
                  >
                    <CheckCircle className="w-4 h-4" />
                    Save
                  </button>
                  <button
                    onClick={() => setIsEditing(false)}
                    className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
                  >
                    <AlertCircle className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditing(true)}
                  className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
                >
                  <Settings className="w-4 h-4" />
                  Edit
                </button>
              )}
            </div>
          </div>
          
          {/* Show AI-generated product specs if available */}
          {model.productSpecs ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-2xl font-black cosmic-glow-text mb-2 tracking-wider">⚛️ QUANTUM COMPONENTS ({deduplicateComponents(editableData.components || []).length})</h4>
                  <div className="cosmic-divider mb-4"></div>
                  {isEditing && (
                    <button
                      onClick={() => setEditableData(prev => ({
                        ...prev,
                        components: deduplicateComponents([...(prev.components || []), {
                          
                          name: `New Component ${(prev.components?.length || 0) + 1}`,
                          material: 'Plastic',
                          dimensions: { width: 10, length: 10, height: 10 },
                          function: 'Structural component'
                        }])
                      }))}
                      className="text-xs bg-cyan-600 text-white px-2 py-1 rounded hover:bg-cyan-700 transition-colors"
                    >
                      + Add Component
                    </button>
                  )}
                </div>
                
                {isEditing ? (
                  <div className="space-y-3">
                    {deduplicateComponents(editableData.components || []).map((component: any, index: number) => (
                      <div key={index} className="cosmic-panel border-2 border-cyan-500/50 rounded-xl p-4 cosmic-hover-glow">
                        <div className="flex items-center justify-between mb-2">
                          <input
                            type="text"
                            value={component.name}
                            onChange={(e) => setEditableData(prev => ({
                              ...prev,
                              components: deduplicateComponents(prev.components?.map((c: any, i: number) => 
                                i === index ? { ...c, name: e.target.value } : c
                              ) || [])
                            }))}
                            className="horizon-input text-sm font-semibold flex-1 mr-2"
                            placeholder="Component name"
                          />
                          <button
                            onClick={() => setEditableData(prev => ({
                              ...prev,
                              components: deduplicateComponents(prev.components?.filter((c: any, i: number) => i !== index) || [])
                            }))}
                            className="text-red-400 hover:text-red-300 text-xs"
                          >
                            Remove
                          </button>
                        </div>
                        
                        <input
                          type="text"
                          value={component.material}
                          onChange={(e) => setEditableData(prev => ({
                            ...prev,
                            components: deduplicateComponents(prev.components?.map((c: any, i: number) => 
                              i === index ? { ...c, material: e.target.value } : c
                            ) || [])
                          }))}
                          className="horizon-input text-xs w-full mb-3"
                          placeholder="Material"
                        />
                        
                        <div className="grid grid-cols-3 gap-1 mb-2">
                          <input
                            type="number"
                            value={component.dimensions.width}
                            onChange={(e) => setEditableData(prev => ({
                              ...prev,
                              components: deduplicateComponents(prev.components?.map((c: any, i: number) => 
                                i === index ? { ...c, dimensions: { ...c.dimensions, width: parseInt(e.target.value) || 0 } } : c
                              ) || [])
                            }))}
                            className="horizon-input text-xs"
                            placeholder="W"
                          />
                          <input
                            type="number"
                            value={component.dimensions.length}
                            onChange={(e) => setEditableData(prev => ({
                              ...prev,
                              components: deduplicateComponents(prev.components?.map((c: any, i: number) => 
                                i === index ? { ...c, dimensions: { ...c.dimensions, length: parseInt(e.target.value) || 0 } } : c
                              ) || [])
                            }))}
                            className="horizon-input text-xs"
                            placeholder="L"
                          />
                          <input
                            type="number"
                            value={component.dimensions.height}
                            onChange={(e) => setEditableData(prev => ({
                              ...prev,
                              components: deduplicateComponents(prev.components?.map((c: any, i: number) => 
                                i === index ? { ...c, dimensions: { ...c.dimensions, height: parseInt(e.target.value) || 0 } } : c
                              ) || [])
                            }))}
                            className="horizon-input text-xs"
                            placeholder="H"
                          />
                        </div>
                        
                        <input
                          type="text"
                          value={component.function}
                          onChange={(e) => setEditableData(prev => ({
                            ...prev,
                            components: deduplicateComponents(prev.components?.map((c: any, i: number) => 
                              i === index ? { ...c, function: e.target.value } : c
                            ) || [])
                          }))}
                          className="horizon-input text-xs w-full"
                          placeholder="Component function"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                <ul className="text-gray-300 space-y-3 cursor-pointer hover:text-cyan-300 transition-colors" onDoubleClick={() => setIsEditing(true)} title="Double-click to edit">
                    {deduplicateComponents(editableData.components || model.productSpecs.components || []).map((component: any, index: number) => (
                    <li key={index} className="cosmic-panel border-l-4 border-cyan-500/60 pl-6 cosmic-hover-glow">
                      <div className="flex items-start gap-3">
                        {/* Mini 3D Render */}
                        <MiniComponentRenderer 
                          component={component} 
                          size={64}
                        />
                        
                        {/* Component Details */}
                        <div className="flex-1">
                      <div className="cosmic-glow-text font-black text-lg mb-2 tracking-wide">{component.name}</div>
                      <div className="cosmic-badge inline-block mb-2">{component.material}</div>
                      <div className="cosmic-text-shadow text-gray-300 text-sm">{component.function}</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
                )}
              </div>
              
              <div>
                <h4 className="text-2xl font-black cosmic-glow-text mb-2 tracking-wider">🔧 DESTINY FORGING</h4>
                <div className="cosmic-divider mb-4"></div>
                
                
{isEditing ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Method:</span>
                      <input
                        type="text"
                        value={editableData.manufacturing.method}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          manufacturing: { ...prev.manufacturing, method: e.target.value }
                        }))}
                        className="horizon-input text-sm flex-1"
                        placeholder="e.g., 3D Printing / CNC Machining"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Materials:</span>
                      <input
                        type="text"
                        value={editableData.manufacturing.materials.join(', ')}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          manufacturing: { ...prev.manufacturing, materials: e.target.value.split(', ') }
                        }))}
                        className="horizon-input text-sm flex-1"
                        placeholder="e.g., ABS Plastic, PLA, Aluminum"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Complexity:</span>
                      <select
                        value={editableData.manufacturing.complexity}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          manufacturing: { ...prev.manufacturing, complexity: e.target.value }
                        }))}
                        className="horizon-input text-sm flex-1"
                      >
                        <option value="simple">Simple</option>
                        <option value="moderate">Moderate</option>
                        <option value="complex">Complex</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Cost:</span>
                      <input
                        type="text"
                        value={editableData.manufacturing.cost}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          manufacturing: { ...prev.manufacturing, cost: e.target.value }
                        }))}
                        className="horizon-input text-sm flex-1"
                        placeholder="e.g., 15-45 USD"
                      />
                    </div>
                  </div>
                ) : (
                <ul className="cosmic-text-shadow space-y-4 cursor-pointer hover:text-cyan-300 transition-all duration-300" onDoubleClick={() => setIsEditing(true)} title="Double-click to edit">
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Method:</span> <span className="text-cyan-300">{calculatedProperties?.manufacturing?.recommendedMethod || editableData.manufacturing.method}</span></li>
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Materials:</span> <span className="text-cyan-300">{calculatedProperties?.manufacturing?.materialsUsed || editableData.manufacturing.materials.join(', ')}</span></li>
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Complexity:</span> <span className="text-cyan-300">{calculatedProperties?.manufacturing?.complexity || editableData.manufacturing.complexity}</span></li>
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Cost:</span> <span className="text-cyan-300">{calculatedProperties?.manufacturing?.costDisplay || editableData.manufacturing.cost}</span></li>
                </ul>
                )}
                
                {/* Manufacturing Reasoning Display */}
                {editableData.manufacturing.reasoning && (
                  <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <h5 className="text-blue-400 font-medium text-sm mb-2 flex items-center gap-2">
                      <Lightbulb className="w-4 h-4" />
                      Why This Method?
                    </h5>
                    <p className="text-blue-200 text-sm leading-relaxed">
                      {calculatedProperties?.manufacturing?.reasoning || editableData.manufacturing.reasoning}
                    </p>
                  </div>
                )}
                
                {manufacturingCost && (
                  <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                    <h5 className="text-green-400 font-medium text-sm mb-2">Detailed Cost Analysis</h5>
                    <ul className="text-green-300 text-sm space-y-1">
                      <li>Material: {manufacturingCost.material}</li>
                      <li>Volume: {manufacturingCost.volume.toFixed(2)} cm³</li>
                      <li>Estimated: ${manufacturingCost.cost} {manufacturingCost.currency}</li>
                    </ul>
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="text-2xl font-black cosmic-glow-text mb-2 tracking-wider">📊 COSMIC METRICS</h4>
                <div className="cosmic-divider mb-4"></div>
                {isEditing ? (
                  <div className="space-y-3 mb-6">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Weight:</span>
                      <input
                        type="text"
                        value={editableData.specifications.weight}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          specifications: { ...prev.specifications, weight: e.target.value }
                        }))}
                        className="horizon-input text-sm flex-1"
                        placeholder="e.g., 1200 g"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Volume:</span>
                      <input
                        type="text"
                        value={editableData.specifications.volume}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          specifications: { ...prev.specifications, volume: e.target.value }
                        }))}
                        className="horizon-input text-sm flex-1"
                        placeholder="e.g., 1000000 cm³"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Style:</span>
                      <input
                        type="text"
                        value={editableData.specifications.style}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          specifications: { ...prev.specifications, style: e.target.value }
                        }))}
                        className="horizon-input text-sm flex-1"
                        placeholder="e.g., modern"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium text-sm w-20">Durability:</span>
                      <select
                        value={editableData.specifications.durability}
                        onChange={(e) => setEditableData(prev => ({ 
                          ...prev, 
                          specifications: { ...prev.specifications, durability: e.target.value }
                        }))}
                        className="horizon-input text-sm flex-1"
                      >
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                        <option value="Very High">Very High</option>
                      </select>
                    </div>
                  </div>
                ) : (
                <ul className="cosmic-text-shadow space-y-4 mb-8 cursor-pointer hover:text-cyan-300 transition-all duration-300" onDoubleClick={() => setIsEditing(true)} title="Double-click to edit">
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Weight:</span> <span className="text-purple-300">{calculatedProperties?.specifications?.weightDisplay || editableData.specifications.weight}</span></li>
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Volume:</span> <span className="text-purple-300">{calculatedProperties?.volume?.displayValue || editableData.specifications.volume}</span></li>
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Style:</span> <span className="text-purple-300">{editableData.specifications.style}</span></li>
                    <li className="text-base p-3 rounded-lg horizon-card"><span className="cosmic-glow-text font-semibold">Durability:</span> <span className="text-purple-300">{calculatedProperties ? calculateDurabilityRating(calculatedProperties) : editableData.specifications.durability}</span></li>
                </ul>
                )}
                
                <div className="space-y-3">
                  {/* Enhanced CAD Export with Multiple Formats */}
                  <CADExportComponent 
                    model={model}
                    className="w-full"
                  />
                  <button 
                    onClick={handleSendToManufacturer}
                    disabled={isExporting}
                    className="horizon-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
                  >
                    <span className="cosmic-text-shadow">
                      {isExporting ? '🌌 Materializing Reality...' : '🔧 Manifest in Physical Realm'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            // Fallback to old format if no product specs
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div>
                <h4 className="text-cyan-400 font-semibold mb-4 text-lg">Components ({model.rooms?.length || 0})</h4>
                <ul className="text-gray-300 space-y-2">
                  {(model.rooms || []).map(room => (
                    <li key={room.id} className="text-sm">
                      {room.name.replace('_', ' ')} - {room.dimensions.width}cm × {room.dimensions.length}cm × {room.dimensions.height}cm
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-cyan-400 font-semibold mb-4 text-lg">Specifications</h4>
                <ul className="text-gray-300 space-y-2">
                  <li className="text-sm">{model.rooms?.length || 0} components</li>
                  <li className="text-sm">{model.totalArea || 0} cm³ volume</li>
                  <li className="text-sm capitalize">{model.style || 'modern'} style</li>
                  <li className="text-sm">Prototype ready</li>
                </ul>
              </div>
              <div>
                <h4 className="text-cyan-400 font-semibold mb-4 text-lg">Actions</h4>
                <div className="space-y-3">
                  {/* Enhanced CAD Export with Multiple Formats */}
                  <CADExportComponent 
                    model={model}
                    className="w-full"
                  />
                  <button 
                    onClick={handleSendToManufacturer}
                    disabled={isExporting}
                    className="horizon-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
                  >
                    <span className="cosmic-text-shadow">
                      {isExporting ? '🌌 Materializing Reality...' : '🔧 Manifest in Physical Realm'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Enhanced Product Description with AI Integration */}
            <div className="mt-8 pt-8 border-t border-purple-400/30">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-cyan-400 font-semibold text-lg">Product Description</h4>
                {calculatedProperties?.productDescription && (
                  <span className="px-2 py-1 bg-purple-500/20 text-purple-300 rounded text-xs">
                    AI Enhanced
                  </span>
                )}
              </div>
              
              {/* AI Product Title & Category */}
              {calculatedProperties?.productDescription && !isEditing && (
                <div className="mb-4 p-3 cosmic-panel rounded-lg">
                  <div className="flex items-center gap-3 mb-2">
                    <h5 className="text-white font-bold text-xl">
                      {calculatedProperties.productDescription.title}
                    </h5>
                    <span className="px-3 py-1 bg-cyan-500/20 text-cyan-300 rounded-full text-sm">
                      {calculatedProperties.productDescription.category}
                    </span>
                  </div>
            </div>
          )}
            
            {isEditing ? (
              <textarea
                value={editableData.description}
                onChange={(e) => setEditableData(prev => ({ ...prev, description: e.target.value }))}
                className="w-full h-24 horizon-input resize-none text-base"
                placeholder="Describe the product features, use cases, and technical details..."
              />
            ) : (
              <div className="space-y-4">
                <p 
                  className="text-gray-300 leading-relaxed text-base cursor-pointer hover:text-cyan-300 transition-colors"
                  onDoubleClick={() => setIsEditing(true)}
                  title="Double-click to edit"
                >
                  {calculatedProperties?.productDescription?.description || editableData.description || 'No description available'}
                </p>
                
                {/* AI-Generated Key Features */}
                {calculatedProperties?.productDescription?.keyFeatures && calculatedProperties.productDescription.keyFeatures.length > 0 && (
                  <div>
                    <h6 className="text-purple-300 font-medium mb-2 text-sm">Key Features</h6>
                    <ul className="grid grid-cols-1 md:grid-cols-2 gap-1 text-sm">
                      {calculatedProperties.productDescription.keyFeatures.map((feature, index) => (
                        <li key={index} className="text-gray-300 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full flex-shrink-0"></span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                
                {/* AI-Generated Potential Uses */}
                {calculatedProperties?.productDescription?.potentialUses && calculatedProperties.productDescription.potentialUses.length > 0 && (
                  <div>
                    <h6 className="text-purple-300 font-medium mb-2 text-sm">Potential Applications</h6>
                    <div className="flex flex-wrap gap-2">
                      {calculatedProperties.productDescription.potentialUses.map((use, index) => (
                        <span 
                          key={index} 
                          className="px-3 py-1 horizon-card text-gray-300 rounded-lg text-sm"
                        >
                          {use}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Utility to stop all camera streams
const stopAllCameraStreams = () => {
  console.log('🎥 Attempting to stop all camera streams...');
  
  // Get all video elements on the page and clear their sources
  const videoElements = document.querySelectorAll('video');
  videoElements.forEach((video, index) => {
    console.log(`🎥 Processing video element ${index + 1}/${videoElements.length}`);
    
    if (video.srcObject) {
      console.log(`🔌 Stopping media stream for video ${index + 1}`);
      const stream = video.srcObject as MediaStream;
      stream.getTracks().forEach(track => {
        console.log(`🛑 Stopping ${track.kind} track (${track.label})`);
        track.stop();
      });
      video.srcObject = null;
    }
    
    if (video.src) {
      console.log(`🗑️ Clearing video src for video ${index + 1}`);
      video.src = '';
    }
  });
  
  console.log(`✅ Processed ${videoElements.length} video elements`);
};

// Step 3: Simple AR Visualization Component
const ARVisualizationStep: React.FC<{
  model: ArchitecturalModel | null;
  calculatedProperties?: CalculatedProperties | null;
  onPrevious?: () => void;
  currentStep?: number;
  originalPrompt?: string;
}> = ({ model, calculatedProperties, onPrevious, currentStep, originalPrompt }) => {
  
  // Handle close - navigate back to 3D viewer
  const handleClose = useCallback(() => {
    console.log('🚪 Closing AR viewer, returning to 3D view');
    if (onPrevious) {
      onPrevious();
    }
  }, [onPrevious]);

  return (
    <div className="space-y-6">
      <div className="text-center mb-12">
        <div className="mb-8">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 horizon-button-primary rounded-full animate-pulse"></div>
            <div className="absolute inset-1 cosmic-panel rounded-full flex items-center justify-center backdrop-blur-sm">
              <Camera className="w-12 h-12 text-white cosmic-glow-text" />
            </div>
            <div className="absolute -inset-2 horizon-button-primary rounded-full blur-xl animate-pulse opacity-30" style={{ animationDelay: '1s' }}></div>
          </div>
          <h2 className="text-5xl font-black cosmic-glow-text mb-4 tracking-wider">
            REALITY TRANSCENDS DIMENSION
          </h2>
          <div className="cosmic-divider mx-auto max-w-xl mb-6"></div>
          <h3 className="text-2xl text-cyan-300 font-semibold mb-4">
            Your {model ? formatProductNameForDisplay(getModelProductName(model)) : 'Creation'} Awaits Physical Manifestation
          </h3>
        </div>
        <p className="cosmic-text-shadow text-xl max-w-4xl mx-auto leading-relaxed">
          <span className="text-purple-400 font-semibold">Transcend the digital realm</span> and witness your {model ? formatProductNameForDisplay(getModelProductName(model)).toLowerCase() : 'creation'} in <span className="text-cyan-400 font-semibold">true-to-life scale</span>. 
          Experience the convergence of imagination and reality through <span className="text-cyan-300 font-semibold">native AR technology</span> - seamlessly powered by iOS Quick Look and Android WebXR.
        </p>
        
        {/* Back to 3D View Button */}
        <div className="flex justify-center">
          <button
            onClick={handleClose}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-slate-800/40 via-slate-700/40 to-slate-800/40 hover:from-slate-700/50 hover:via-slate-600/50 hover:to-slate-700/50 backdrop-blur-md text-white rounded-lg font-medium transition-all duration-300 shadow-lg shadow-slate-800/20"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to 3D View
          </button>
        </div>
      </div>

      <Suspense fallback={<div className="w-full h-[400px] flex items-center justify-center text-white">Loading AR…</div>}>
        <SimpleUnifiedARViewer 
          model={model}
          onClose={handleClose}
          className="w-full"
          currentStep={currentStep}
          originalPrompt={originalPrompt}
          generatedResults={model}
        />
      </Suspense>
    </div>
  );
};

// Step 4: Design Iteration Component (Enhanced)
const EnhancedDesignIteration: React.FC<{
  model: ArchitecturalModel | null;
  onModelUpdate: (model: ArchitecturalModel) => void;
  calculatedProperties: CalculatedProperties | null;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
}> = ({ model, onModelUpdate, calculatedProperties, onPropertiesCalculated }) => {
  const [selectedRoom, setSelectedRoom] = useState('');
  const [modifications, setModifications] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState<'quick' | 'chat'>('chat');
  const chatInterfaceRef = useRef<CADChatInterfaceRef>(null);

  // Beta Access Management
  const { user, profile } = useAuth();
  const [showBetaAccess, setShowBetaAccess] = useState(false);
  const [betaRequestStatus, setBetaRequestStatus] = useState<'none' | 'pending' | 'approved'>('none');
  const [requestReason, setRequestReason] = useState('');
  const [isSubmittingRequest, setIsSubmittingRequest] = useState(false);

  // Check beta access on mount and user/profile changes
  useEffect(() => {
    const checkBetaAccess = async () => {
      if (profile?.optimization_beta_access === true) {
        setShowBetaAccess(false);
        setBetaRequestStatus('approved');
      } else {
        setShowBetaAccess(true);
        
        // Check if user already has a pending request
        if (user?.id) {
          try {
            const { data: existingRequests, error } = await supabase
              .from('beta_access_requests')
              .select('status')
              .eq('user_id', user.id)
              .eq('status', 'pending')
              .order('created_at', { ascending: false })
              .limit(1);

            if (error) {
              console.error('Error checking existing beta requests:', error);
            } else if (existingRequests && existingRequests.length > 0) {
              setBetaRequestStatus('pending');
            } else {
              setBetaRequestStatus('none');
            }
          } catch (error) {
            console.error('Error checking beta access status:', error);
          }
        }
      }
    };

    checkBetaAccess();
  }, [profile, user]);

  const handleBetaAccessRequest = async () => {
    if (import.meta.env.DEV) {
      console.log('🚀 Beta access request button clicked!');
      console.log('User ID:', user?.id);
      console.log('Request reason:', requestReason);
      console.log('Reason length:', requestReason.trim().length);
    }

    if (!user?.id) {
      if (import.meta.env.DEV) {
        console.error('❌ No user ID found');
      }
      alert('Please make sure you are logged in to request beta access.');
      return;
    }

    if (!requestReason.trim()) {
      console.error('❌ No reason provided');
      alert('Please provide a reason for requesting beta access.');
      return;
    }

    setIsSubmittingRequest(true);
    console.log('📝 Submitting beta access request...');

    try {
      const requestData = {
        user_id: user.id,
        email: user.email || profile?.email || 'unknown@example.com',
        reason: requestReason.trim(),
        status: 'pending'
      };

      console.log('📤 Request data:', requestData);

      const { data, error } = await supabase
        .from('beta_access_requests')
        .insert(requestData)
        .select();

      if (error) {
        console.error('❌ Supabase error:', error);
        throw error;
      }

      console.log('✅ Request submitted successfully:', data);

      // Send email notification directly from frontend
      try {
        console.log('📧 Sending email notification...');
        const { data: functionResult, error: functionError } = await supabase.functions.invoke('beta-access-notification', {
          body: {
            record: data[0],
            type: 'INSERT',
            table: 'beta_access_requests'
          }
        });

        if (functionError) {
          console.error('❌ Email notification failed:', functionError);
        } else {
          console.log('✅ Email notification sent:', functionResult);
        }
      } catch (emailError) {
        console.error('❌ Email notification error:', emailError);
        // Don't fail the whole request if email fails
      }

      setBetaRequestStatus('pending');
      setRequestReason('');
      alert('🎉 Beta access request submitted successfully! You will receive an email notification when your request is reviewed (typically within 24-48 hours).');
    } catch (error) {
      console.error('❌ Error submitting beta access request:', error);
      alert(`Failed to submit beta access request: ${error.message || 'Unknown error'}. Please try again.`);
    } finally {
      setIsSubmittingRequest(false);
      console.log('🏁 Request submission completed');
    }
  };

  const handleQuickOptimization = async (optimizationId: string) => {
    if (!model) return;

    setIsProcessing(true);
    try {
      console.log('🚀 Applying quick optimization:', optimizationId);
      
      // Find the optimization from the available options
      const optimization = QUICK_OPTIMIZATIONS.find(opt => opt.id === optimizationId);
      if (!optimization) {
        throw new Error(`Optimization ${optimizationId} not found`);
      }

      console.log('📝 Using optimization:', optimization);

      // FIXED: Direct prompt-based optimization (simpler approach)
      // This avoids the complex KCL modification pipeline that's failing
      const originalPrompt = model.cadModel?.originalPrompt || model.cadModel?.prompt || model.description || model.name || 'mechanical part';
      
      // Create simplified optimization prompt using the template approach
      const productMatch = originalPrompt.match(/^[Dd]esign\s+an?\s+(.+?)(?:\s+that|\s+with|\s+for|\s*$)/i);
      const productName = productMatch ? productMatch[1].trim() : originalPrompt.split(/[,.\n]/)[0].trim().replace(/^[Aa]n?\s+/i, '');
      
      // Convert optimization to simple modification text
      const optimizationMap: Record<string, string> = {
        'reduce_weight': 'lighter with hollow interior and thin walls',
        'cut_costs': 'simplified with reduced material usage',
        '3d_print_ready': 'optimized for 3D printing with proper support angles'
      };
      
      const modification = optimizationMap[optimizationId] || optimization.prompt;
      const optimizedPrompt = `Design a ${productName} that is ${modification}`;
      
      console.log('🔧 Quick optimization prompt:', optimizedPrompt);
      
      // Generate optimized model directly via CAD API
      const optimizedModelData = await cadAI.generateAndWaitForCAD({
        prompt: optimizedPrompt,
        outputFormat: 'gltf',
        units: 'mm'
      });

      if (!optimizedModelData) {
        throw new Error('Failed to generate optimized model');
      }

      console.log('✅ Quick optimization complete:', optimizedModelData);
      
      // Create updated model
      const optimizedModel: ArchitecturalModel = {
        ...model,
        id: `${model.id}-${optimizationId}-${Date.now()}`,
        name: `${model.name} (${optimization.label})`,
        description: optimizedPrompt,
        cadModel: {
          ...model.cadModel!,
          id: optimizedModelData.id || `cad-${Date.now()}`,
          prompt: optimizedPrompt,
          originalPrompt: originalPrompt, // Preserve original
          gltfUrl: optimizedModelData.gltfUrl || '',
          thumbnailUrl: optimizedModelData.thumbnailUrl || '',
          formats: optimizedModelData.formats || {},
          properties: optimizedModelData.properties || model.cadModel?.properties || {
            dimensions: { width: 100, height: 100, depth: 100 },
            volume: 100000,
            surfaceArea: 60000,
            complexity: 'moderate' as const
          }
        }
      };
      
      // Update the model with the optimized version
      onModelUpdate(optimizedModel);
      
    } catch (error) {
      console.error('❌ Error applying quick optimization:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to apply optimization: ${errorMessage}. Please try again.`);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModification = async () => {
    if (!model || !modifications.trim()) return;

    setIsProcessing(true);
    try {
      console.log('🔧 Applying user modifications:', modifications);
      
      // Start from the original user prompt that worked, not processed versions
      const originalPrompt = model.cadModel?.originalPrompt || model.cadModel?.prompt || model.description || model.name || 'mechanical part';
      
      console.log('📝 Using original prompt as base:', originalPrompt);
      
      // Extract product name from the original working prompt
      // Handle both "Design a..." patterns and direct descriptions
      let productName: string;
      
      const designMatch = originalPrompt.match(/^[Dd]esign\s+an?\s+(.+?)(?:\s+that|\s+with|\s+for|\s*$)/i);
      if (designMatch) {
        productName = designMatch[1].trim();
      } else {
        // For direct descriptions like "A complex engineered plastic component..."
        const directMatch = originalPrompt.match(/^[Aa]n?\s+(.+?)(?:\s+with|\s+for|\s+that|\s*\.|\s*$)/i);
        if (directMatch) {
          productName = directMatch[1].trim();
        } else {
          // Fallback: take first meaningful part
          productName = originalPrompt.split(/[,.\n]/)[0].trim().replace(/^[Aa]n?\s+/i, '');
        }
      }
      
      console.log('🏷️ Extracted product name:', productName);
      
      // Simplify modification based on focus area
      let simpleModification = modifications.trim();
      if (selectedRoom && selectedRoom !== '') {
        const focusModifications: Record<string, string> = {
          'material': `${modifications} with optimized material usage`,
          'cost': `${modifications} with cost reduction`,
          'manufacturing': `${modifications} with easier manufacturing`,
          'functionality': `${modifications} with improved functionality`,
          'aesthetics': `${modifications} with better aesthetics`
        };
        simpleModification = focusModifications[selectedRoom] || modifications;
      }
      
      // Use simple template: "Design a [product] that is [modification]"
      const modificationPrompt = `Design a ${productName} that is ${simpleModification}`;
      
      console.log('📝 Generated modification prompt:', modificationPrompt);
      
      // Use CAD AI service to regenerate the model with modifications
      const modifiedModelData = await cadAI.generateAndWaitForCAD({
        prompt: modificationPrompt,
        outputFormat: 'gltf',
        units: 'mm'
      });

      if (!modifiedModelData) {
        throw new Error('Failed to generate modified model');
      }

      console.log('✅ Modified model generated:', modifiedModelData);
      
      // Create updated model with new CAD data
      const updatedModel: ArchitecturalModel = {
        ...model,
        id: `${model.id}-modified-${Date.now()}`,
        name: `${model.name} (Modified)`,
        description: modificationPrompt,
        cadModel: {
          ...model.cadModel!,
          id: modifiedModelData.id || `cad-${Date.now()}`,
          prompt: modificationPrompt,
          gltfUrl: modifiedModelData.gltfUrl || '',
          thumbnailUrl: modifiedModelData.thumbnailUrl || '',
          formats: modifiedModelData.formats || {},
          properties: modifiedModelData.properties || model.cadModel?.properties || {
            dimensions: { width: 100, height: 100, depth: 100 },
            volume: 100000,
            surfaceArea: 60000,
            complexity: 'moderate' as const
          }
        }
      };
      
      console.log('🎯 Updated model created:', updatedModel);
      onModelUpdate(updatedModel);
      setModifications('');
    } catch (error) {
      console.error('❌ Error modifying model:', error);
      // Show user-friendly error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      alert(`Failed to apply modifications: ${errorMessage}. Please try again with a different description.`);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Beta Access Overlay */}
      {showBetaAccess && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-lg min-h-[80vh]">
          <div className="cosmic-panel max-w-2xl w-full mx-4 p-8 text-center">
            <h3 className="text-3xl font-bold text-white mb-6">
              {betaRequestStatus === 'pending' ? '⏳ Beta Access Pending' : '🚀 Optimization Features - Beta Access Required'}
            </h3>
            
            {betaRequestStatus === 'pending' ? (
              <div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Your beta access request is being reviewed. You will be notified once approved.
                </p>
                <div className="flex items-center justify-center space-x-2 text-cyan-400">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                  <span className="text-sm font-medium">Request Under Review</span>
                  <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse"></div>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-gray-300 mb-6 leading-relaxed">
                  Access to optimization features including the <strong className="text-cyan-400">AI Chat Interface</strong> and <strong className="text-purple-400">Quantum Tools</strong> is currently limited to beta users.
                </p>
                
                <div className="mb-6">
                  <textarea
                    value={requestReason}
                    onChange={(e) => setRequestReason(e.target.value)}
                    placeholder="Please tell us why you'd like beta access to optimization features..."
                    className="w-full h-32 px-4 py-3 rounded-lg bg-gray-800/50 text-white placeholder-gray-400 border border-gray-600/50 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 resize-none"
                    maxLength={500}
                  />
                  <div className="text-right text-sm text-gray-400 mt-1">
                    {requestReason.length}/500
                  </div>
                </div>
                
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    console.log('🔘 Button clicked - preventDefault called');
                    handleBetaAccessRequest();
                  }}
                  disabled={!requestReason.trim() || isSubmittingRequest}
                  className="horizon-button-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
                  type="button"
                >
                  {isSubmittingRequest ? (
                    <div className="flex items-center justify-center space-x-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Submitting Request...</span>
                    </div>
                  ) : (
                    '🚀 Request Beta Access'
                  )}
                </button>
                
                {/* Debug info - only in development */}
                {import.meta.env.DEV && (
                  <div className="text-xs text-gray-500 mt-2 space-y-1">
                    <div>User ID: {user?.id || 'Not logged in'}</div>
                    <div>Email: {user?.email || profile?.email || 'No email'}</div>
                    <div>Button disabled: {(!requestReason.trim() || isSubmittingRequest).toString()}</div>
                    <div>Reason length: {requestReason.length}</div>
                  </div>
                )}
                
                <p className="text-sm text-gray-400 mt-4">
                  Beta access requests are typically reviewed within 24-48 hours.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="text-center mb-12">
        <div className="mb-8">
          <h2 className="text-5xl font-black cosmic-glow-text mb-4 tracking-wider">PERFECT YOUR DESTINY</h2>
          <div className="cosmic-divider mx-auto max-w-2xl"></div>
        </div>
        <p className="cosmic-text-shadow text-xl max-w-5xl mx-auto leading-relaxed">
          <span className="text-purple-400 font-semibold">Evolve your creation</span> with quantum-powered optimization. 
          Engage the <span className="text-cyan-400 font-semibold">cosmic chat interface</span> for intuitive modifications,
          or unleash <span className="text-purple-300 font-semibold">instant transformation tools</span> for weight reduction, 3D print preparation, and reality-bending optimizations.
        </p>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Model Viewer */}
        <div className="xl:col-span-1">
          <Suspense fallback={<div className="h-[600px] flex items-center justify-center text-white">Loading 3D viewer…</div>}>
            <ModelViewer3D 
              model={model}
              className="h-[600px]"
              calculatedProperties={calculatedProperties}
            />
          </Suspense>
        </div>

        {/* Chat Interface */}
        <div className="xl:col-span-1">
          <Suspense fallback={<div className="h-[600px] flex items-center justify-center text-white">Loading chat…</div>}>
            <CADChatInterface 
              ref={chatInterfaceRef}
              model={model}
              onModelUpdate={onModelUpdate}
              onPropertiesCalculated={onPropertiesCalculated}
              className="h-[600px]"
            />
          </Suspense>
            </div>

        {/* Quick Modifications Panel */}
        <div className="xl:col-span-1 cosmic-panel cosmic-hover-glow">
          <h3 className="text-2xl font-black cosmic-glow-text mb-8 tracking-wider text-center">QUANTUM TOOLS</h3>
          <div className="cosmic-divider mb-6"></div>
          
          <Suspense fallback={<div className="text-white">Loading tools…</div>}>
            <CustomQuickTools 
              model={model}
              onApplyTool={async (tool: CustomQuickTool) => {
              if (!model) return;

              setIsProcessing(true);
              try {
                console.log('🚀 Applying quick tool:', tool.name);
                
                // Extract product name from original prompt
                const originalPrompt = model.cadModel?.originalPrompt || model.cadModel?.prompt || model.description || model.name || 'mechanical part';
                const productMatch = originalPrompt.match(/^[Dd]esign\s+an?\s+(.+?)(?:\s+that|\s+with|\s+for|\s*$)/i);
                const productName = productMatch ? productMatch[1].trim() : originalPrompt.split(/[,.\n]/)[0].trim().replace(/^[Aa]n?\s+/i, '');
                
                // Create optimization prompt using the tool's prompt
                const optimizedPrompt = `Design a ${productName} that is ${tool.prompt}`;
                
                console.log('🔧 Tool optimization prompt:', optimizedPrompt);
                
                // Generate optimized model directly via CAD API
                const optimizedModelData = await cadAI.generateAndWaitForCAD({
                  prompt: optimizedPrompt,
                  outputFormat: 'gltf',
                  units: 'mm'
                });

                if (!optimizedModelData) {
                  throw new Error('Failed to generate optimized model');
                }

                console.log('✅ Tool optimization complete:', optimizedModelData);
                
                // Create updated model
                const optimizedModel: ArchitecturalModel = {
                  ...model,
                  id: `${model.id}-${tool.id}-${Date.now()}`,
                  name: `${model.name} (${tool.name})`,
                  description: optimizedPrompt,
                  cadModel: {
                    ...model.cadModel!,
                    id: optimizedModelData.id || `cad-${Date.now()}`,
                    prompt: optimizedPrompt,
                    originalPrompt: originalPrompt,
                    gltfUrl: optimizedModelData.gltfUrl || '',
                    thumbnailUrl: optimizedModelData.thumbnailUrl || '',
                    formats: optimizedModelData.formats || {},
                    properties: optimizedModelData.properties || model.cadModel?.properties || {
                      dimensions: { width: 100, height: 100, depth: 100 },
                      volume: 100000,
                      surfaceArea: 60000,
                      complexity: 'moderate' as const
                    }
                  }
                };
                
                // Update the model with the optimized version
                onModelUpdate(optimizedModel);
                
                // Add single consolidated message to chat
                if (chatInterfaceRef.current?.completeQuickToolAction) {
                  chatInterfaceRef.current.completeQuickToolAction(
                    `🛠️ **${tool.name}** - ${tool.description}`,
                    optimizedModel,
                    tool.name
                  );
                }
                
              } catch (error) {
                console.error('❌ Error applying quick tool:', error);
                const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
                
                // Add single error message to chat
                if (chatInterfaceRef.current?.addAssistantMessage) {
                  chatInterfaceRef.current.addAssistantMessage(
                    `❌ **${tool.name} failed** - ${errorMessage}`
                  );
                }
                
                alert(`Failed to apply optimization: ${errorMessage}. Please try again.`);
              } finally {
                setIsProcessing(false);
              }
            }}
            isProcessing={isProcessing}
          />
          </Suspense>
        </div>
      </div>
    </div>
  );
};

const DesignIterationStep: React.FC<{
  model: ArchitecturalModel | null;
  onModelUpdate: (model: ArchitecturalModel) => void;
  calculatedProperties: CalculatedProperties | null;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
}> = ({ model, onModelUpdate, calculatedProperties, onPropertiesCalculated }) => {
  return <EnhancedDesignIteration model={model} onModelUpdate={onModelUpdate} calculatedProperties={calculatedProperties} onPropertiesCalculated={onPropertiesCalculated} />;
};

const ProcessWizard: React.FC<ProcessWizardProps> = ({ onBack, initialStep, sharedModelData }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [architecturalModel, setArchitecturalModel] = useState<ArchitecturalModel | null>(null);
  const [completedSteps, setCompletedSteps] = useState<boolean[]>([false, false, false, false, false, false]);
  const [showCompletion, setShowCompletion] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [hoveredStep, setHoveredStep] = useState<number | null>(null);
  const [clickedLockedStep, setClickedLockedStep] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelGenerated, setModelGenerated] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [calculatedProperties, setCalculatedProperties] = useState<CalculatedProperties | null>(null);

  // Backup model state to localStorage to prevent data loss
  const backupModelState = (model: ArchitecturalModel) => {
    try {
      const modelBackup = {
        model,
        timestamp: Date.now(),
        sessionId: Date.now().toString()
      };
      localStorage.setItem('agenticad_current_model', JSON.stringify(modelBackup));
      console.log('💾 Model state backed up to localStorage');
    } catch (error) {
      console.warn('⚠️ Failed to backup model state:', error);
    }
  };

  // Try to recover model state from localStorage
  const recoverModelState = (): ArchitecturalModel | null => {
    try {
      const backup = localStorage.getItem('agenticad_current_model');
      if (backup) {
        const parsed = JSON.parse(backup);
        // Only use backup if it's recent (within last hour)
        if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
          console.log('🔄 Recovered model state from localStorage');
          return parsed.model;
        } else {
          console.log('⏰ Model backup too old, ignoring');
          localStorage.removeItem('agenticad_current_model');
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to recover model state:', error);
    }
    return null;
  };

  // Initialize with backup recovery
  useEffect(() => {
    if (!architecturalModel) {
      const recovered = recoverModelState();
      if (recovered) {
        setArchitecturalModel(recovered);
        console.log('✅ Model state recovered on initialization');
      }
    }
  }, []);

  // Handle deep linking to specific steps
  useEffect(() => {
    if (initialStep !== undefined && initialStep >= 0 && initialStep < 6) {
      console.log(`🔗 Deep linking to step ${initialStep}`);
      setCurrentStep(initialStep);
      
      // Mark all previous steps as completed for navigation
      const newCompletedSteps = new Array(6).fill(false);
      for (let i = 0; i < initialStep; i++) {
        newCompletedSteps[i] = true;
      }
      setCompletedSteps(newCompletedSteps);
    }
  }, [initialStep]);
  // Initialize with shared model data from QR code scan
  useEffect(() => {
    if (sharedModelData) {
      console.log('🔗 Initializing ProcessWizard with shared model data:', sharedModelData);
      
      // Create CAD model from shared data - use advanced base64 reconstruction
      // This handles cross-device AR sharing by reconstructing blob URLs from base64 data
      // when shareable URLs are not available (fixes Zoo API base64-only responses)
      const reconstructionResult = extractGltfUrlWithReconstruction(sharedModelData);
      const gltfUrl = reconstructionResult.gltfUrl || '';
      
      console.log('🔍 GLTF URL reconstruction result:', {
        success: reconstructionResult.success,
        source: reconstructionResult.source,
        gltfUrl: gltfUrl.substring(0, 50) + (gltfUrl.length > 50 ? '...' : ''),
        isBlob: gltfUrl.startsWith('blob:'),
        isShareable: isValidShareableUrl(gltfUrl),
        error: reconstructionResult.error,
        stats: getReconstructionStats(sharedModelData)
      });
      
      const restoredModel: ArchitecturalModel = {
        id: sharedModelData.architecturalModel?.id || `shared-${Date.now()}`,
        name: sharedModelData.architecturalModel?.title || 'Shared Model',
        description: sharedModelData.architecturalModel?.description || 'Model shared via QR code',
        rooms: [], // Empty for CAD models
        doors: [], // Empty for CAD models  
        windows: [], // Empty for CAD models
        totalArea: 0, // Not applicable for CAD models
        style: sharedModelData.architecturalModel?.style || 'modern',
        created: new Date(),
        modified: new Date(),
        type: 'product', // CAD product model
        productSpecs: {
          name: sharedModelData.architecturalModel?.title || 'Shared Model',
          description: sharedModelData.architecturalModel?.description || 'Model shared via QR code',
          style: sharedModelData.architecturalModel?.style || 'modern',
          components: sharedModelData.architecturalModel?.components || [],
          title: sharedModelData.architecturalModel?.title || 'Shared Model',
          keyFeatures: ['Shared via QR code', '3D CAD model'],
          potentialUses: ['Visualization', 'AR Experience', 'Manufacturing']
        },
        cadModel: {
          id: sharedModelData.architecturalModel?.id || `shared-${Date.now()}`,
          prompt: sharedModelData.originalPrompt || 'Shared CAD model',
          originalPrompt: sharedModelData.originalPrompt || 'Shared CAD model', 
          gltfUrl: gltfUrl,
          formats: { gltf: gltfUrl },
          properties: {
            dimensions: { width: 100, height: 100, depth: 100 },
            volume: 1000,
            surfaceArea: 600,
            complexity: 'moderate' as const,
            ...sharedModelData.architecturalModel?.properties
          }
        }
      };
      
      setArchitecturalModel(restoredModel);
      setModelGenerated(true);
      
      // Note: Original prompt is preserved in the restored model's CAD data
      
      // Set the appropriate steps as completed based on shared model data
      const stepToComplete = Math.max((sharedModelData.currentStep || 2) - 1, 0);
      setCompletedSteps(prev => {
        const newCompleted = [...prev];
        for (let i = 0; i <= stepToComplete; i++) {
          newCompleted[i] = true;
        }
        return newCompleted;
      });
      
      console.log('✅ Shared model data loaded successfully');
      console.log('📊 Restored model:', restoredModel);
      console.log('🔄 Restored state:', {
        originalPrompt: sharedModelData.originalPrompt,
        currentStep: sharedModelData.currentStep,
        hasGeneratedResults: !!sharedModelData.generatedResults,
        hasRefinementHistory: !!(sharedModelData.refinementHistory?.length)
      });
      console.log('🔧 CAD Model check:', {
        hasCadModel: !!restoredModel.cadModel,
        gltfUrl: restoredModel.cadModel?.gltfUrl,
        cadModelId: restoredModel.cadModel?.id,
        architecturalModelId: restoredModel.id
      });
    }
  }, [sharedModelData]);
  const steps = [
    { 
      id: 'input', 
      title: 'Design Input', 
      icon: <MessageCircle className="w-5 h-5" />, 
      component: CombinedInputStep,
      description: 'Describe your product using text, voice, sketches, or photos'
    },
    { 
      id: 'model', 
      title: '3D Viewer', 
      icon: <Move3D className="w-5 h-5" />, 
      component: ThreeDModelViewer,
      description: 'Explore your CAD model in 3D with enhanced controls'
    },
    { 
      id: 'ar', 
      title: 'AR Preview', 
      icon: <Hand className="w-5 h-5" />, 
      component: ARVisualizationStep,
      description: 'View your product in real-world context using AR'
    },
    { 
      id: 'iterate', 
      title: 'Optimize', 
      icon: <Wrench className="w-5 h-5" />, 
      component: DesignIterationStep,
      description: 'Export to multiple CAD formats and optimize design'
    },
    { 
      id: 'manufacture', 
      title: 'Manufacturing', 
      icon: <Users className="w-5 h-5" />, 
      component: ManufacturingConnect,
      description: 'Connect with manufacturers and estimate costs'
    },
    { 
      id: 'patent', 
      title: 'Patent Search', 
      icon: <Search className="w-5 h-5" />, 
      component: PatentSearch,
      description: 'Check for existing products and protect your innovation'
    }
  ];

  const prefetchForStepId = useCallback((stepId: string) => {
    const importers = stepPrefetchMap[stepId];
    if (!importers) return;
    importers.forEach((importer, index) => {
      prefetchModule(`${stepId}-${index}`, importer);
    });
  }, []);

  const nextStepId = steps[currentStep + 1]?.id;

  useEffect(() => {
    if (!nextStepId) return;
    return scheduleIdleCallback(() => prefetchForStepId(nextStepId));
  }, [nextStepId, prefetchForStepId]);

  // Utility to stop all camera streams
  const stopAllCameraStreams = () => {
    console.log('🎥 Attempting to stop all camera streams...');
    
    // Get all video elements on the page and clear their sources
    const videoElements = document.querySelectorAll('video');
    videoElements.forEach((video, index) => {
      if (video.srcObject) {
        console.log(`🎥 Found video element ${index} with stream, stopping...`);
        const stream = video.srcObject as MediaStream;
        stream.getTracks().forEach(track => {
          console.log(`🎥 Stopping track: ${track.kind} - ${track.label}`);
          track.stop();
        });
        video.srcObject = null;
        video.src = '';
        video.load(); // Force video element to clear
      }
    });
    
    // Additional cleanup: Get all active media streams globally
    if (navigator.mediaDevices) {
      console.log('🎥 Performing global media stream cleanup...');
      // Try to stop any remaining tracks that might be active
      navigator.mediaDevices.getUserMedia({ video: false, audio: false }).catch(() => {
        // This is expected to fail, it's just to trigger cleanup
        console.log('🎥 Global media cleanup triggered');
      });
    }
  };

  const handleNext = () => {
    // Ensure any active camera streams are stopped before navigation
    if (currentStep === 0) {
      console.log('🎥 Navigating from input step - ensuring camera cleanup');
      stopAllCameraStreams();
    }
    
    if (currentStep < steps.length - 1) {
      // Mark current step as completed
      const newCompletedSteps = [...completedSteps];
      newCompletedSteps[currentStep] = true;
      setCompletedSteps(newCompletedSteps);
      setCurrentStep(currentStep + 1);
    } else {
      // Complete the journey
      console.log('🎯 COMPLETING JOURNEY - Current model state:', architecturalModel);
      console.log('🎯 Model name:', architecturalModel?.name);
      console.log('🎯 Model description:', architecturalModel?.description);
      console.log('🎯 CAD model data:', architecturalModel?.cadModel);
      console.log('🎯 Product specs:', architecturalModel?.productSpecs);
      
      const newCompletedSteps = [...completedSteps];
      newCompletedSteps[currentStep] = true;
      setCompletedSteps(newCompletedSteps);
      setShowCompletion(true);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleStepClick = (stepIndex: number) => {
    const isAccessible = stepIndex <= currentStep || completedSteps[stepIndex];
    
    if (isAccessible) {
      setCurrentStep(stepIndex);
      setShowAlert(false);
      setShowCompletion(false);
      setClickedLockedStep(null);
    } else {
      setClickedLockedStep(stepIndex);
      setShowAlert(true);
      setTimeout(() => {
        setShowAlert(false);
        setClickedLockedStep(null);
      }, 3000);
    }
  };

  const handleStepHover = (stepIndex: number) => {
    setHoveredStep(stepIndex);
    const stepId = steps[stepIndex]?.id;
    if (stepId) {
      prefetchForStepId(stepId);
    }
  };

  const isStepAccessible = (stepIndex: number) => {
    return stepIndex <= currentStep || completedSteps[stepIndex];
  };

  // Generate 3D architectural model
  const generateModel = async (inputs: MultimodalInput) => {
    try {
      setIsGenerating(true);
      const request: GenerationRequest = {
        inputs,
        preferences: {
          style: 'modern',
          units: 'metric',
          complexity: 'detailed'
        }
      };
      
      const response = await architecturalAI.generateModel(request);
      const generated = response.model;
      
      // Validate the generated model
      if (!generated || !generated.rooms || generated.rooms.length === 0) {
        throw new Error('Invalid model generated - no rooms found');
      }
      
      // Ensure all required fields are present
      const validatedModel: ArchitecturalModel = {
        ...generated,
        id: generated.id || `model_${Date.now()}`,
        name: generated.name || 'Architectural Design',
        rooms: generated.rooms.map((room: any) => ({
          ...room,
          id: room.id || `room_${Math.random().toString(36).substr(2, 9)}`,
          position: room.position || { x: 0, y: 0, z: 0 },
          dimensions: room.dimensions || { width: 5, height: 3, length: 5 }
        })),
        doors: generated.doors || [],
        windows: generated.windows || [],
        totalArea: generated.totalArea || 0,
        style: generated.style || 'modern'
      };
      
      setArchitecturalModel(validatedModel);
      setModelGenerated(true);
    } catch (error) {
      console.error('Error generating model:', error);
      setErrors({ general: `Failed to generate model: ${error instanceof Error ? error.message : 'Unknown error'}` });
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle model completion from first step
  const handleModelGenerated = (model: ArchitecturalModel) => {
    console.log('✨ MODEL GENERATED - New model:', model);
    console.log('✨ Model name:', model?.name);
    console.log('✨ Model description:', model?.description);
    
    // Ensure all media resources are cleaned up before proceeding
    console.log('🧹 Ensuring all media resources are cleaned up...');
    
    // Stop any active camera/media streams
    navigator.mediaDevices?.enumerateDevices?.().then(() => {
      // Trigger cleanup of any media resources
      if (navigator.mediaDevices.getUserMedia) {
        console.log('📱 Media devices available, ensuring cleanup...');
      }
    }).catch(e => console.log('📱 Media cleanup check completed'));
    
    setArchitecturalModel(model);
    backupModelState(model); // Backup to localStorage
    handleNext(); // Automatically proceed to next step
  };

  // Enhanced model update handler with better state preservation
  const handleModelUpdate = (model: ArchitecturalModel) => {
    console.log('🔄 MODEL UPDATE - Received model:', model);
    console.log('🔄 Model name:', model?.name);
    console.log('🔄 Model CAD data:', model?.cadModel);
    setArchitecturalModel(model);
    backupModelState(model); // Backup to localStorage
  };

  // Handle calculated properties from CAD geometry
  const handlePropertiesCalculated = (properties: CalculatedProperties) => {
    console.log('📊 Properties calculated in ProcessWizard:', properties);
    setCalculatedProperties(properties);
    
    // Update the architectural model with real calculated properties
    if (architecturalModel) {
      const updatedModel: ArchitecturalModel = {
        ...architecturalModel,
        // Update main description with AI-generated content
        description: properties.productDescription?.description || architecturalModel.description,
        productSpecs: {
          ...architecturalModel.productSpecs,
          // Preserve original user input, only use AI-generated as fallback
          name: architecturalModel.productSpecs?.name || architecturalModel.name || properties.productDescription?.title || 'Custom Product',
          title: architecturalModel.productSpecs?.title || architecturalModel.productSpecs?.name || properties.productDescription?.title || 'Custom Product',
          description: properties.productDescription?.description || architecturalModel.productSpecs?.description || '',
          style: architecturalModel.productSpecs?.style || architecturalModel.style || 'modern',
          components: architecturalModel.productSpecs?.components || [],
          category: properties.productDescription?.category || 'Custom Component',
          potentialUses: properties.productDescription?.potentialUses || [],
          keyFeatures: properties.productDescription?.keyFeatures || [],
          totalVolume: properties.volume.total,
          manufacturing: {
            method: properties.manufacturing.recommendedMethod,
            materials: (properties.manufacturing.materialsUsed || 'PLA Plastic').split(', '),
            complexity: properties.manufacturing.complexity,
            estimated_cost: properties.manufacturing.costDisplay
          },
          specifications: {
            weight: properties.specifications.weightDisplay,
            dimensions: {
              length: properties.dimensions.overall.length,
              width: properties.dimensions.overall.width,
              height: properties.dimensions.overall.height
            },
            color_options: ['Natural', 'Black', 'White'],
            durability: calculateDurabilityRating(properties)
          }
        },
        cadModel: architecturalModel.cadModel ? {
          ...architecturalModel.cadModel,
          properties: {
            dimensions: {
              width: properties.dimensions.overall.width,
              height: properties.dimensions.overall.height,
              depth: properties.dimensions.overall.length
            },
            volume: properties.volume.total,
            surfaceArea: properties.specifications.surfaceArea,
            complexity: properties.specifications.complexity
          },
          manufacturingCost: {
            material: properties.manufacturing.materialsUsed || 'PLA Plastic', // Use calculated material from property calculator
            volume: properties.volume.total,
            cost: properties.manufacturing.totalCost,
            currency: 'USD'
          }
        } : undefined
      };
      
      setArchitecturalModel(updatedModel);
    }
  };

  if (showCompletion) {
    return (
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
        <CompletionCelebration 
          onBack={onBack} 
          onStepClick={handleStepClick}
          completedSteps={completedSteps}
          steps={steps}
          model={architecturalModel}
          calculatedProperties={calculatedProperties}
        />
      </Suspense>
    );
  }

  const renderCurrentStep = () => {
    const step = steps[currentStep];
    
    switch (step.id) {
      case 'input':
        return <CombinedInputStep onComplete={handleModelGenerated} />;
      case 'model':
        return <ThreeDModelViewer model={architecturalModel} onModelUpdate={handleModelUpdate} onPropertiesCalculated={handlePropertiesCalculated} calculatedProperties={calculatedProperties} />;
      case 'ar':
        return <ARVisualizationStep 
          model={architecturalModel} 
          calculatedProperties={calculatedProperties} 
          onPrevious={handlePrevious}
          currentStep={currentStep}
          originalPrompt={architecturalModel?.cadModel?.originalPrompt || architecturalModel?.cadModel?.prompt}
        />;
      case 'iterate':
        return <DesignIterationStep model={architecturalModel} onModelUpdate={handleModelUpdate} calculatedProperties={calculatedProperties} onPropertiesCalculated={handlePropertiesCalculated} />;
      case 'manufacture':
        return (
          <Suspense fallback={<div className="min-h-[200px] flex items-center justify-center text-white">Loading…</div>}>
            <ManufacturingConnect 
              model={architecturalModel}
              onNext={handleNext}
              onPrevious={handlePrevious}
              canGoNext={true}
              canGoPrevious={true}
            />
          </Suspense>
        );
      case 'patent':
        return (
          <Suspense fallback={<div className="min-h-[200px] flex items-center justify-center text-white">Loading…</div>}>
            <PatentSearch 
              model={architecturalModel}
              onNext={handleNext}
              onPrevious={handlePrevious}
              canGoNext={true}
              canGoPrevious={true}
            />
          </Suspense>
        );
      default:
        return <div>Step not found</div>;
    }
  };

  return (
    <div className="min-h-screen relative">
      {/* Cosmic Destiny Background Layer */}
      <div className="fixed inset-0 z-0">
        <div className="absolute inset-0" style={{ background: 'var(--destiny-gradient)' }}></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(59,130,246,0.1),transparent_50%)] animate-pulse"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.1),transparent_50%)] animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_40%_90%,rgba(6,182,212,0.08),transparent_50%)] animate-pulse" style={{ animationDelay: '4s' }}></div>

        {/* Realistic random star field */}
        <div className="absolute inset-0 overflow-hidden">
          {/* Generate random stars programmatically */}
          {Array.from({ length: 150 }).map((_, i) => {
            const size = Math.random() * 2 + 0.5; // Random size between 0.5px and 2.5px
            const x = Math.random() * 100; // Random X position (percentage)
            const y = Math.random() * 100; // Random Y position (percentage)
            const animationDelay = Math.random() * 10; // Random animation delay
            const animationDuration = Math.random() * 3 + 2; // Random duration between 2-5s
            const opacity = Math.random() * 0.8 + 0.2; // Random opacity between 0.2-1

            return (
              <div
                key={i}
                className="absolute rounded-full bg-white animate-pulse"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  left: `${x}%`,
                  top: `${y}%`,
                  opacity,
                  animationDelay: `${animationDelay}s`,
                  animationDuration: `${animationDuration}s`,
                  boxShadow: `0 0 ${size * 2}px rgba(255, 255, 255, ${opacity * 0.5})`
              }}
            />
            );
          })}

          {/* Add some colored stars for variety */}
          {Array.from({ length: 30 }).map((_, i) => {
            const size = Math.random() * 1.5 + 0.5;
            const x = Math.random() * 100;
            const y = Math.random() * 100;
            const animationDelay = Math.random() * 8;
            const colors = ['rgb(96, 165, 250)', 'rgb(167, 139, 250)', 'rgb(129, 140, 248)', 'rgb(34, 211, 238)'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            return (
              <div
                key={`colored-${i}`}
                className="absolute rounded-full animate-pulse"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  left: `${x}%`,
                  top: `${y}%`,
                  backgroundColor: color,
                  opacity: Math.random() * 0.6 + 0.3,
                  animationDelay: `${animationDelay}s`,
                  animationDuration: `${Math.random() * 4 + 3}s`,
                  boxShadow: `0 0 ${size * 3}px ${color}`
                }}
              />
            );
          })}
        </div>
      </div>

      {/* Persistent Logo Navigation with Cosmic Enhancement */}
      <button
        onClick={onBack}
        className="fixed top-6 left-6 z-50 group hover:scale-110 transition-all duration-500"
      >
        <div className="relative">
          <div className="absolute inset-0 horizon-button-primary rounded-full opacity-0 group-hover:opacity-30 blur-sm transition-opacity duration-500 scale-150"></div>
          <img
            src="/agenticad-logo.png"
            alt="AgentiCAD Logo"
            className="w-16 h-16 object-cover rounded-full shadow-2xl group-hover:shadow-cyan-500/50 transition-all duration-500 relative z-10 ring-2 ring-white/20 group-hover:ring-cyan-400/50"
          />
          {/* Enhanced cosmic tooltip */}
          <div className="absolute -bottom-14 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-black/95 via-indigo-900/90 to-black/95 text-white px-4 py-2 rounded-xl text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all duration-300 backdrop-blur-sm border border-cyan-500/30 shadow-lg shadow-cyan-500/20">
            <span className="cosmic-glow-text">Back to Destiny</span>
          </div>
        </div>
      </button>
      
      {/* Cosmic Header */}
      <header className="relative px-6 py-6 border-b border-cyan-500/20 backdrop-blur-sm z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-black/20 via-indigo-900/10 to-black/20"></div>
        <div className="max-w-7xl mx-auto flex items-center justify-between relative z-10">
          <button
            onClick={onBack}
            className="group flex items-center text-gray-300 hover:text-cyan-300 transition-all duration-300 cosmic-text-shadow"
          >
            <div className="relative">
              <ArrowLeft className="w-5 h-5 mr-3 group-hover:scale-110 transition-transform duration-300" />
              <div className="absolute inset-0 bg-cyan-500/20 rounded-full blur-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            </div>
            <span className="font-medium">Return to Origins</span>
          </button>
          <div className="cosmic-glow-text font-bold text-lg tracking-wider">
            <span className="text-cyan-400">STEP</span> <span className="text-white text-2xl">{currentStep + 1}</span> <span className="text-purple-400">OF</span> <span className="text-white text-2xl">{steps.length}</span>
            <div className="text-xs text-gray-400 font-normal mt-1 tracking-normal opacity-80">FORGING THE FUTURE</div>
          </div>
        </div>
      </header>

      {/* Enhanced Alert for restricted access */}
      {showAlert && (
        <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 bg-red-500/95 backdrop-blur-sm text-white px-6 py-4 rounded-xl shadow-2xl border border-red-400/30 animate-pulse">
          <div className="flex items-center gap-3">
            <Lock className="w-5 h-5" />
            <div>
              <div className="font-semibold">Access Restricted</div>
              <div className="text-sm opacity-90">Complete all preceding steps to access this page</div>
            </div>
          </div>
        </div>
      )}

      {/* Cosmic Progress Navigation */}
      <div className="relative px-6 py-8 z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/10 to-transparent"></div>
        <div className="max-w-7xl mx-auto relative">
          <div className="flex items-start justify-between mb-12">
            {steps.map((step, index) => (
              <React.Fragment key={step.id}>
                <div className="flex flex-col items-center relative">
                  <div className="relative w-16 h-16 flex items-center justify-center">
                    <button
                      onClick={() => handleStepClick(index)}
                      onMouseEnter={() => handleStepHover(index)}
                      onMouseLeave={() => setHoveredStep(null)}
                      className={`
                        w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300 absolute top-0 left-0
                        ${isStepAccessible(index)
                          ? completedSteps[index]
                            ? 'bg-green-500 text-white shadow-lg shadow-green-500/30 hover:shadow-green-500/50 hover:animate-pulse'
                            : currentStep === index
                              ? 'horizon-button-primary text-white shadow-xl shadow-cyan-500/30 animate-pulse'
                              : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white hover:animate-pulse'
                          : 'bg-gray-600/50 text-gray-500 cursor-not-allowed'
                        }
                        ${clickedLockedStep === index ? 'animate-wiggle' : ''}
                      `}
                    >
                      {completedSteps[index] ? (
                        <CheckCircle className="w-6 h-6" />
                      ) : !isStepAccessible(index) ? (
                        <Lock className="w-5 h-5" />
                      ) : (
                        step.icon
                      )}
                    </button>

                    {/* Step Info Tooltip */}
                    {hoveredStep === index && (
                      <div className="absolute -top-20 left-1/2 transform -translate-x-1/2 bg-black/90 text-white px-4 py-2 rounded-lg shadow-xl whitespace-nowrap z-50 border border-white/20">
                        <div className="font-semibold">{step.title}</div>
                        <div className="text-sm text-gray-300">{step.description}</div>
                        <div className="absolute -bottom-1 left-1/2 transform -translate-x-1/2 border-4 border-transparent border-t-black/90"></div>
                      </div>
                    )}
                  </div>
                  
                  {/* Step Label */}
                  <div className="mt-2 text-center">
                    <div className={`text-sm font-medium transition-colors ${
                      isStepAccessible(index) ? 'text-white' : 'text-gray-500'
                    }`}>
                      {step.title}
                    </div>
                  </div>
                </div>

                {/* Connection Line */}
                {index < steps.length - 1 && (
                  <div className="flex-1 mx-4 mt-8">
                    <div className={`h-1 rounded-full transition-all duration-500 ${
                      completedSteps[index] || currentStep > index
                        ? 'bg-gradient-to-r from-green-500 to-cyan-500'
                        : 'bg-gray-600'
                    }`}></div>
                  </div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      {/* Cosmic Main Content Area */}
      <main className="relative px-6 pb-12 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="cosmic-panel relative">
            {/* Content shimmer overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 rounded-2xl"></div>
            <div className="relative z-10">
              {renderCurrentStep()}
            </div>
          </div>
        </div>
      </main>

      {/* Cosmic Navigation Footer */}
      <footer className="relative px-6 py-8 border-t border-cyan-500/20 backdrop-blur-sm z-10">
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 via-indigo-900/20 to-black/40"></div>
        <div className="max-w-7xl mx-auto flex items-center justify-between relative z-10">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="horizon-button group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none"
          >
            <ArrowLeft className="w-5 h-5 mr-2 group-hover:scale-110 transition-transform duration-300" />
            <span className="cosmic-text-shadow">Previous Reality</span>
          </button>
          
          <div className="text-center">
            <div className="cosmic-glow-text text-lg font-semibold">
              {currentStep + 1} <span className="text-cyan-400">of</span> {steps.length}
            </div>
            <div className="text-xs text-gray-400 mt-1 uppercase tracking-widest">
              Dimensions Unlocked
            </div>
          </div>
          
          {/* Hide Next button on patent search step - use in-content button instead */}
          {steps[currentStep]?.id !== 'patent' && (
            <button
              onClick={handleNext}
              disabled={currentStep === steps.length - 1}
              className="horizon-button-primary group disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none"
            >
              <span className="cosmic-text-shadow">Next Dimension</span>
              <ArrowRight className="w-5 h-5 ml-2 group-hover:scale-110 transition-transform duration-300" />
            </button>
          )}
          
          {/* Show invisible placeholder when on patent search to maintain layout */}
          {steps[currentStep]?.id === 'patent' && (
            <div className="w-[100px]"></div>
          )}
        </div>
      </footer>

      {/* Professional Disclaimer */}
      <div className="px-6 py-4 bg-black/20 border-t border-white/5">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-400 text-xs leading-relaxed text-center">
            <strong>Important Notice:</strong> AgenticCAD is continuously evolving to provide enhanced design capabilities. 
            The generated CAD models, material specifications, manufacturing recommendations, and cost estimates are AI-generated 
            and provided for conceptual purposes only. Material properties, dimensions, and manufacturing feasibility may not be 
            fully accurate in all cases. Users are strongly advised to perform proper due diligence, including independent 
            verification, professional engineering review, and material testing before proceeding with any manufacturing, 
            production, or implementation decisions. AgenticCAD disclaims any liability for decisions made based solely on 
            AI-generated content without appropriate professional validation.
          </p>
        </div>
      </div>
    </div>
  );
};

export default ProcessWizard;
