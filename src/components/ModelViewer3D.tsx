import React, { useRef, useEffect, useState, useCallback, Suspense, useMemo } from 'react';
import { useFrame, useThree, useLoader, RootState } from '@react-three/fiber';
import { OrbitControls, Environment, Grid, Text, Box, Plane, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { 
  Maximize2, 
  Minimize2, 
  RotateCcw, 
  Move3D, 
  Eye, 
  EyeOff,
  Ruler,
  Camera,
  Download,
  Share2,
  Settings,
  Layers,
  AlertTriangle,
  ChevronDown,
  Loader2,
  Tag
} from 'lucide-react';
import type { 
  ArchitecturalModel, 
  Room, 
  Door, 
  Window, 
  ViewerState,
  ARCapabilities,
  ARSession,
  ARPlacement
} from '../types/architectural';
import { CADAIService } from '../services/cadAI';
import { cadPropertyCalculator, type CalculatedProperties } from '../services/cadPropertyCalculator';
import { getModelProductName } from '../utils/productNameExtractor';
import ManagedCanvas from './ManagedCanvas';

interface ModelViewer3DProps {
  model: ArchitecturalModel | null;
  className?: string;
  calculatedProperties?: CalculatedProperties | null;
  onARModeToggle?: (enabled: boolean) => void;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  onGLTFDataLoaded?: (gltfData: any, mechanicalAnalysis?: MechanicalAnalysis) => void;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
}

// CAD Export Types
type CADFormat = 'gltf' | 'stl' | 'obj' | 'ply' | 'fbx' | 'dae';
type ExportStatus = 'ready' | 'loading' | 'failed';

interface CADExportProps {
  gltfUrl: string;
  modelName: string;
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

// Multi-Format CAD Export Component
const CADExportComponent: React.FC<CADExportProps> = ({ 
  gltfUrl, 
  modelName, 
  className = '' 
}) => {
  const [currentFormat, setCurrentFormat] = useState<CADFormat>('gltf');
  const [status, setStatus] = useState<ExportStatus>('ready');
  const [cachedFormats, setCachedFormats] = useState<Partial<Record<CADFormat, string>>>(() => ({ gltf: gltfUrl }));
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

  // Convert GLTF to other formats (client-side implementation)
  const convertFormat = async (targetFormat: CADFormat): Promise<string> => {
    if (cachedFormats[targetFormat]) {
      return cachedFormats[targetFormat];
    }

    setStatus('loading');
    
    try {
      let convertedUrl: string;
      
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
          throw new Error(`${targetFormat.toUpperCase()} format not yet supported in client-side conversion`);
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

  const handleFormatChange = async (format: CADFormat) => {
    setCurrentFormat(format);
    setDropdownOpen(false);
    
    try {
      const downloadUrl = await convertFormat(format);
      
      // Trigger download
      if (downloadLinkRef.current) {
        downloadLinkRef.current.href = downloadUrl;
        downloadLinkRef.current.download = `${modelName.replace(/\.[^/.]+$/, '')}${CADFormats[format].extension}`;
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
      <div className={`flex items-center bg-gradient-to-r from-cyan-500 to-blue-500 rounded-lg overflow-hidden shadow-lg ${
        status === 'loading' ? 'animate-pulse' : ''
      } ${status === 'failed' ? 'from-red-500 to-red-600' : ''}`}>
        
        {/* Download Button */}
        <button
          disabled={status === 'loading'}
          className={`flex items-center gap-2 px-4 py-3 text-white font-semibold transition-all ${
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
            {status === 'loading' ? 'Converting...' : status === 'failed' ? 'Failed' : 'Export'}
          </span>
        </button>

        {/* Format Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            disabled={status === 'loading'}
            className={`flex items-center gap-1 px-3 py-3 text-white border-l border-white/20 transition-all ${
              status === 'loading' ? 'cursor-not-allowed opacity-70' : 'hover:bg-white/10'
            }`}
          >
            <span className="text-sm font-mono uppercase">
              {CADFormats[currentFormat].name}
            </span>
            <ChevronDown className={`w-4 h-4 transition-transform ${
              dropdownOpen ? 'rotate-180' : ''
            }`} />
          </button>

          {/* Dropdown Menu */}
          {dropdownOpen && (
            <div className="absolute top-full right-0 mt-2 w-48 bg-gray-900 border border-gray-700 rounded-lg shadow-xl z-50">
              <div className="py-2">
                {formatOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => handleFormatChange(option.value)}
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      currentFormat === option.value 
                        ? 'bg-cyan-500/20 text-cyan-300' 
                        : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                    }`}
                  >
                    <div className="font-mono font-semibold">{option.label}</div>
                    <div className="text-xs text-gray-400">{option.description}</div>
                  </button>
                ))}
              </div>
              
              {/* Info about unsupported formats */}
              <div className="border-t border-gray-700 p-3 text-xs text-gray-400">
                <div className="font-medium text-gray-300 mb-1">Coming Soon:</div>
                <div>FBX, DAE formats require server conversion</div>
              </div>
            </div>
          )}
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
          className="fixed inset-0 z-40" 
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
};

// Error Boundary Component
class ThreeJSErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Three.js Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

// Loading Component for Three.js Canvas
const ModelLoader: React.FC = () => {
  const meshRef = useRef<THREE.Mesh>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.rotation.z = state.clock.getElapsedTime() * 2;
    }
  });

  return (
    <group>
      {/* Loading spinner using Three.js primitives */}
      <mesh ref={meshRef} position={[0, 0, 0]}>
        <torusGeometry args={[1, 0.1, 8, 32]} />
        <meshStandardMaterial color="#00bcd4" emissive="#00bcd4" emissiveIntensity={0.3} />
      </mesh>
      
      {/* Loading text using Three.js Text */}
      <Text
        position={[0, -2, 0]}
        fontSize={0.5}
        color="#9ca3af"
        anchorX="center"
        anchorY="middle"
      >
        Loading 3D Model...
      </Text>
    </group>
  );
};

// Error Fallback Component
const ModelError: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <div className="flex items-center justify-center h-full">
    <div className="text-center p-6">
      <AlertTriangle className="w-12 h-12 text-yellow-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-white mb-2">3D Viewer Error</h3>
      <p className="text-gray-400 text-sm mb-4">
        Unable to initialize 3D viewer. This may be due to WebGL compatibility issues.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm"
        >
          Try Again
        </button>
      )}
    </div>
  </div>
);

// Safe GLTF Loader Component (Fixed hook ordering)
const SafeGLTFLoader: React.FC<{ 
  url: string; 
  onError?: (error: string) => void;
  onGLTFDataLoaded?: (gltfData: any, mechanicalAnalysis?: MechanicalAnalysis) => void;
}> = React.memo(({ url, onError, onGLTFDataLoaded }) => {
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Always call useGLTF (required by React hooks rules) but only process after validation
  const gltf = useGLTF(url);
  
  useEffect(() => {
    // Preload the GLTF to check if it's valid
    const preloadGLTF = async () => {
      try {
        setValidated(false);
        setError(null);
        
        // Test if the URL is accessible
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.text();
        if (data.length === 0) {
          throw new Error('Empty GLTF data');
        }
        
        // Try to parse as JSON to validate GLTF structure
        const gltfData = JSON.parse(data);
        if (!gltfData.asset || !gltfData.scenes) {
          throw new Error('Invalid GLTF structure');
        }
        
        console.log('✅ GLTF validation passed, ready to load');
        setValidated(true);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load GLTF';
        console.error('❌ GLTF preload failed:', errorMessage);
        setError(errorMessage);
        onError?.(errorMessage);
      }
    };
    
    if (url) {
      preloadGLTF();
    }
  }, [url, onError, onGLTFDataLoaded]);
  
  // Memoize the processed scene and mechanical analysis
  const processedScene = useMemo(() => {
    if (validated && gltf?.scene) {
      console.log('✅ GLTF loaded successfully');
      const clonedScene = gltf.scene.clone();
      
      // Scale and center the model
      const bbox = new THREE.Box3().setFromObject(clonedScene);
      const size = bbox.getSize(new THREE.Vector3());
      const maxDimension = Math.max(size.x, size.y, size.z);
      const scale = maxDimension > 0 ? 4 / maxDimension : 1;
      
      clonedScene.scale.setScalar(scale);
      
      const center = bbox.getCenter(new THREE.Vector3());
      clonedScene.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
      
      // Extract mechanical analysis after scaling
      const mechanicalAnalysis = extractMechanicalComponents(clonedScene);
      
      // Pass both GLTF data and mechanical analysis to the callback
      onGLTFDataLoaded?.(gltf, mechanicalAnalysis);
      
      return clonedScene;
    }
    return null;
  }, [validated, gltf, onGLTFDataLoaded]);
  
  if (error) {
    return (
      <group>
        <mesh>
          <boxGeometry args={[3, 0.5, 3]} />
          <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.2} />
        </mesh>
        <Text position={[0, 1, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
          LOAD ERROR
        </Text>
        <Text position={[0, 0.5, 0]} fontSize={0.12} color="#fecaca" anchorX="center">
          {error}
        </Text>
      </group>
    );
  }
  
  if (!validated) {
    return (
      <group>
        <mesh>
          <boxGeometry args={[3, 0.5, 3]} />
          <meshStandardMaterial color="#4a90e2" />
        </mesh>
        <Text position={[0, 1, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
          VALIDATING...
        </Text>
      </group>
    );
  }
  
  if (processedScene) {
    return <primitive object={processedScene} />;
  }
  
  console.warn('⚠️ GLTF loaded but no scene found');
  return (
    <group>
      <mesh>
        <boxGeometry args={[3, 0.5, 3]} />
        <meshStandardMaterial color="#ffa500" />
      </mesh>
      <Text position={[0, 1, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
        NO SCENE
      </Text>
    </group>
  );
});

// Mechanical Component Analysis Types
interface MechanicalComponent {
  name: string;
  type: 'structural' | 'fastener' | 'housing' | 'shaft' | 'plate' | 'bracket' | 'container' | 'complex';
  material: string;
  massProperties: {
    volume: number; // cm³
    mass: number; // g
    centerOfMass: THREE.Vector3;
    boundingBox: {
      min: THREE.Vector3;
      max: THREE.Vector3;
      dimensions: { width: number; length: number; height: number };
    };
    surfaceArea: number; // cm²
  };
  manufacturingFeatures: {
    holes: number;
    fillets: boolean;
    sharpEdges: boolean;
    thinWalls: boolean;
    overhangs: boolean;
    complexity: 'simple' | 'moderate' | 'complex';
  };
  function: string;
  connections: string[];
}

interface MechanicalAnalysis {
  components: MechanicalComponent[];
  massProperties: {
    totalMass: number;
    totalVolume: number;
    centerOfMass: THREE.Vector3;
    overallDimensions: { width: number; length: number; height: number };
  };
  materials: string[];
  manufacturingRecommendations: {
    primaryMethod: string;
    alternativeMethods: string[];
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedCost: { min: number; max: number };
    reasoning: string;
  };
}

// Extract mechanical components from Three.js scene using GLTF node hierarchy and spatial analysis
function extractMechanicalComponents(scene: THREE.Object3D, gltfData?: any): MechanicalAnalysis {
  console.log('🔧 Starting advanced component detection...');
  console.log('GLTF Data available:', !!gltfData);
  
  // Check if model is too small and auto-scale it
  const initialBBox = new THREE.Box3().setFromObject(scene);
  const initialSize = new THREE.Vector3();
  initialBBox.getSize(initialSize);
  const maxInitialDimension = Math.max(initialSize.x, initialSize.y, initialSize.z);
  
  console.log(`📏 Initial model size: ${initialSize.x.toFixed(4)}×${initialSize.y.toFixed(4)}×${initialSize.z.toFixed(4)}`);
  
  // If model is smaller than 1 unit (e.g., 0.03 as in the logs), scale it up
  const MIN_REALISTIC_SIZE = 10; // Minimum 10 units for realistic size
  let scaleApplied = 1;
  
  if (maxInitialDimension < MIN_REALISTIC_SIZE) {
    scaleApplied = MIN_REALISTIC_SIZE / maxInitialDimension;
    console.log(`🔍 Model is too small (${maxInitialDimension.toFixed(4)} units), scaling up by ${scaleApplied.toFixed(2)}x`);
    
    // Apply scale to the entire scene
    scene.scale.multiplyScalar(scaleApplied);
    scene.updateMatrixWorld(true);
  }
  
  const components: MechanicalComponent[] = [];
  const materials = new Set<string>();
  let totalMass = 0;
  let totalVolume = 0;
  
  // Overall bounding box (after scaling)
  const overallBoundingBox = new THREE.Box3().setFromObject(scene);
  const overallSize = new THREE.Vector3();
  overallBoundingBox.getSize(overallSize);

  // Strategy 1: Use GLTF node hierarchy if available (most reliable)
  if (gltfData && gltfData.nodes && gltfData.meshes) {
    console.log('📋 Using GLTF node hierarchy for component detection');
    const spatiallyDistinctComponents = detectSpatiallyDistinctComponents(scene, gltfData);
    
    if (spatiallyDistinctComponents.length > 0) {
      spatiallyDistinctComponents.forEach((componentData, index) => {
        try {
          const component = createComponentFromSpatialGroup(componentData, index);
          components.push(component);
          materials.add(component.material);
          totalMass += component.massProperties.mass;
          totalVolume += component.massProperties.volume;
          console.log(`✅ GLTF Component ${index + 1}: ${component.name}`);
        } catch (error) {
          console.warn('Error creating component from GLTF data:', error);
        }
      });
    }
  }

  // Strategy 2: Fallback to Three.js scene analysis with spatial separation
  if (components.length === 0) {
    console.log('🔄 Fallback: Using Three.js scene spatial analysis');
    const spatialComponents = detectComponentsByThreeJSSpatialSeparation(scene);
    
    spatialComponents.forEach((meshGroup, index) => {
      try {
        const component = analyzeComponentGroup(meshGroup, index);
        components.push(component);
        materials.add(component.material);
        totalMass += component.massProperties.mass;
        totalVolume += component.massProperties.volume;
        console.log(`✅ Spatial Component ${index + 1}: ${component.name} (${meshGroup.length} meshes)`);
      } catch (error) {
        console.warn('Error analyzing spatial component group:', error);
      }
    });
  }

  // Strategy 3: Final fallback - single component
  if (components.length === 0) {
    console.log('🆘 Final fallback: Creating single component from entire scene');
    const allMeshes: THREE.Mesh[] = [];
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        allMeshes.push(obj);
      }
    });

    if (allMeshes.length > 0) {
      try {
        const fallbackComponent = analyzeComponentGroup(allMeshes, 0);
        components.push(fallbackComponent);
        materials.add(fallbackComponent.material);
        totalMass += fallbackComponent.massProperties.mass;
        totalVolume += fallbackComponent.massProperties.volume;
        console.log(`✅ Fallback component created: ${fallbackComponent.name}`);
      } catch (error) {
        console.error('Failed to create fallback component:', error);
      }
    }
  }

  console.log(`🎯 Final result: ${components.length} components detected`);
  
  // Calculate center of mass (mass-weighted average)
  let centerOfMass = new THREE.Vector3(0, 0, 0);
  if (totalMass > 0) {
    components.forEach(comp => {
      const weightedPos = comp.massProperties.centerOfMass.clone().multiplyScalar(comp.massProperties.mass);
      centerOfMass.add(weightedPos);
    });
    centerOfMass.divideScalar(totalMass);
  }
  
  // Determine manufacturing recommendations
  const manufacturingRecommendations = determineManufacturingMethod(components, totalVolume);
  
  return {
    components,
    massProperties: {
      totalMass,
      totalVolume,
      centerOfMass,
      overallDimensions: {
        width: Math.round(overallSize.x * 10) / 10,
        length: Math.round(overallSize.z * 10) / 10,
        height: Math.round(overallSize.y * 10) / 10
      }
    },
    materials: Array.from(materials),
    manufacturingRecommendations
  };
}

// Detect spatially distinct components using GLTF node hierarchy and spatial analysis
function detectSpatiallyDistinctComponents(scene: THREE.Object3D, gltfData: any): SpatialComponentGroup[] {
  console.log('🔍 Analyzing GLTF hierarchy for spatial components...');
  
  const spatialGroups: SpatialComponentGroup[] = [];
  const processedNodes = new Set<number>();
  
  // Get root nodes (nodes that aren't children of other nodes)
  const rootNodes = gltfData.nodes.filter((node: any, index: number) => {
    return !gltfData.nodes.some((otherNode: any) => 
      otherNode.children && otherNode.children.includes(index)
    );
  });
  
  console.log(`📋 Found ${rootNodes.length} root nodes in GLTF hierarchy`);
  
  // Analyze each root node as a potential component
  rootNodes.forEach((rootNode: any, rootIndex: number) => {
    console.log(`🔍 Analyzing root node ${rootIndex}: ${rootNode.name || 'unnamed'}, has mesh: ${rootNode.mesh !== undefined}`);
    
    if (rootNode.mesh !== undefined) {
      const spatialGroup = analyzeSpatialGroup(rootNode, gltfData, scene, rootIndex);
      if (spatialGroup) {
        spatialGroups.push(spatialGroup);
        console.log(`🎯 Created spatial group: ${spatialGroup.name} with ${spatialGroup.meshes.length} meshes`);
      } else {
        console.log(`⚠️ Failed to create spatial group for root node ${rootIndex}`);
      }
    } else {
      console.log(`⚠️ Root node ${rootIndex} has no mesh, skipping`);
    }
  });
  
  // If no meaningful groups found from root nodes, try spatial clustering of all nodes
  if (spatialGroups.length === 0) {
    console.log('🔄 No root node components found, trying spatial clustering...');
    return clusterNodesBySpatialPosition(gltfData, scene);
  }
  
  return spatialGroups;
}

// Analyze a node and its children as a spatial component group
function analyzeSpatialGroup(node: any, gltfData: any, scene: THREE.Object3D, index: number): SpatialComponentGroup | null {
  console.log(`🔧 Analyzing spatial group for node: ${node.name || 'unnamed'}`);
  const meshes: THREE.Mesh[] = [];
  const nodePositions: THREE.Vector3[] = [];
  
  // Helper function to traverse node hierarchy and collect meshes
  function collectMeshesFromNode(nodeIndex: number, transform: THREE.Matrix4 = new THREE.Matrix4()) {
    const currentNode = gltfData.nodes[nodeIndex];
    if (!currentNode) return;
    
    // Calculate node transform
    const nodeTransform = new THREE.Matrix4();
    if (currentNode.matrix) {
      nodeTransform.fromArray(currentNode.matrix);
    } else {
      const translation = new THREE.Vector3(...(currentNode.translation || [0, 0, 0]));
      const rotation = new THREE.Quaternion(...(currentNode.rotation || [0, 0, 0, 1]));
      const scale = new THREE.Vector3(...(currentNode.scale || [1, 1, 1]));
      nodeTransform.compose(translation, rotation, scale);
    }
    
    const combinedTransform = new THREE.Matrix4().multiplyMatrices(transform, nodeTransform);
    
    // If this node has a mesh, find corresponding Three.js mesh
    if (currentNode.mesh !== undefined) {
      const position = new THREE.Vector3();
      combinedTransform.decompose(position, new THREE.Quaternion(), new THREE.Vector3());
      nodePositions.push(position);
      
      // Find Three.js mesh that corresponds to this node
      scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          // Simple heuristic: mesh positions should be close to node positions
          const meshPos = obj.position.clone();
          if (position.distanceTo(meshPos) < 0.1) { // Very close positions
            meshes.push(obj);
          }
        }
      });
    }
    
    // Recursively process children
    if (currentNode.children) {
      currentNode.children.forEach((childIndex: number) => {
        collectMeshesFromNode(childIndex, combinedTransform);
      });
    }
  }
  
  // Start collecting from the root node
  const nodeIndex = gltfData.nodes.indexOf(node);
  collectMeshesFromNode(nodeIndex);
  
  // If no meshes found via position matching, try a broader search
  if (meshes.length === 0) {
    console.log('🔍 No meshes found via position matching, using broader search...');
    scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj.geometry) {
        const bbox = new THREE.Box3().setFromObject(obj);
        const volume = bbox.getSize(new THREE.Vector3()).x * bbox.getSize(new THREE.Vector3()).y * bbox.getSize(new THREE.Vector3()).z;
        if (volume > 0.0000001) { // Much lower threshold for tiny models
          meshes.push(obj);
        }
      }
    });
    
    // If we found meshes, limit to a reasonable number to avoid the original problem
    if (meshes.length > 5) {
      console.log(`⚠️ Found ${meshes.length} meshes, limiting to largest 3 to avoid redundancy`);
      meshes.sort((a, b) => {
        const sizeA = new THREE.Box3().setFromObject(a).getSize(new THREE.Vector3());
        const sizeB = new THREE.Box3().setFromObject(b).getSize(new THREE.Vector3());
        const volA = sizeA.x * sizeA.y * sizeA.z;
        const volB = sizeB.x * sizeB.y * sizeB.z;
        return volB - volA;
      });
      meshes.splice(3); // Keep only the 3 largest meshes
    }
  }
  
  if (meshes.length === 0) {
    console.log(`⚠️ No meshes found for spatial group: ${node.name || 'unnamed'}`);
    return null;
  }
  
  console.log(`✅ Found ${meshes.length} meshes for spatial group: ${node.name || 'unnamed'}`);
  
  // Calculate spatial bounds for this group
  const groupBounds = new THREE.Box3();
  meshes.forEach(mesh => {
    const meshBounds = new THREE.Box3().setFromObject(mesh);
    groupBounds.union(meshBounds);
  });
  
  const center = groupBounds.getCenter(new THREE.Vector3());
  const size = groupBounds.getSize(new THREE.Vector3());
  
  console.log(`📐 Spatial group bounds: center=(${center.x.toFixed(2)}, ${center.y.toFixed(2)}, ${center.z.toFixed(2)}), size=(${size.x.toFixed(2)}, ${size.y.toFixed(2)}, ${size.z.toFixed(2)})`);
  
  return {
    name: node.name || `Component_${index + 1}`,
    meshes,
    spatialBounds: groupBounds,
    center,
    size,
    nodeData: node
  };
}

// Cluster nodes by spatial position when hierarchy analysis fails
function clusterNodesBySpatialPosition(gltfData: any, scene: THREE.Object3D): SpatialComponentGroup[] {
  console.log('🌍 Clustering components by spatial position...');
  
  const allMeshes: THREE.Mesh[] = [];
  
  // Enhanced mesh traversal with debug logging
  const traverseAndCollect = (obj: THREE.Object3D, depth = 0) => {
    const indent = '  '.repeat(depth);
    console.log(`${indent}🔍 Examining object: ${obj.type} "${obj.name}" (children: ${obj.children.length})`);
    
    if (obj instanceof THREE.Mesh && obj.geometry) {
      console.log(`${indent}✅ Found mesh: "${obj.name}" with geometry`);
      try {
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = bbox.getSize(new THREE.Vector3());
        const volume = size.x * size.y * size.z;
        console.log(`${indent}📏 Mesh size: ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}, volume: ${volume.toFixed(4)}`);
        
        if (volume > 0.0000001) { // Much lower threshold for tiny models
          allMeshes.push(obj);
          console.log(`${indent}✅ Mesh added to collection`);
        } else {
          console.log(`${indent}⚠️ Mesh too small, skipping`);
        }
      } catch (error) {
        console.log(`${indent}❌ Error processing mesh:`, error);
      }
    }
    
    // Recursively traverse children
    obj.children.forEach(child => traverseAndCollect(child, depth + 1));
  };
  
  traverseAndCollect(scene);
  
  console.log(`🔍 Found ${allMeshes.length} meshes for spatial clustering`);
  
  if (allMeshes.length === 0) return [];
  if (allMeshes.length === 1) {
    const mesh = allMeshes[0];
    const bounds = new THREE.Box3().setFromObject(mesh);
    return [{
      name: 'Single_Component',
      meshes: [mesh],
      spatialBounds: bounds,
      center: bounds.getCenter(new THREE.Vector3()),
      size: bounds.getSize(new THREE.Vector3()),
      nodeData: null
    }];
  }
  
  // Use k-means clustering based on mesh centers
  const meshCenters = allMeshes.map(mesh => {
    const bounds = new THREE.Box3().setFromObject(mesh);
    return bounds.getCenter(new THREE.Vector3());
  });
  
  // Estimate optimal number of clusters (components)
  const maxClusters = Math.min(Math.ceil(allMeshes.length / 3), 5); // Max 5 components
  const clusters = performSpatialClustering(meshCenters, allMeshes, maxClusters);
  
  console.log(`🎯 Spatial clustering created ${clusters.length} component groups`);
  
  return clusters.map((cluster, index) => {
    const groupBounds = new THREE.Box3();
    cluster.meshes.forEach(mesh => {
      const meshBounds = new THREE.Box3().setFromObject(mesh);
      groupBounds.union(meshBounds);
    });
    
    return {
      name: `Spatial_Component_${index + 1}`,
      meshes: cluster.meshes,
      spatialBounds: groupBounds,
      center: groupBounds.getCenter(new THREE.Vector3()),
      size: groupBounds.getSize(new THREE.Vector3()),
      nodeData: null
    };
  });
}

// Simple spatial clustering algorithm
function performSpatialClustering(centers: THREE.Vector3[], meshes: THREE.Mesh[], maxClusters: number): {meshes: THREE.Mesh[], center: THREE.Vector3}[] {
  if (centers.length <= maxClusters) {
    // Each mesh is its own cluster
    return centers.map((center, index) => ({
      meshes: [meshes[index]],
      center
    }));
  }
  
  // Simple distance-based clustering
  const clusters: {meshes: THREE.Mesh[], center: THREE.Vector3}[] = [];
  const processed = new Set<number>();
  
  centers.forEach((center, index) => {
    if (processed.has(index)) return;
    
    const cluster = {
      meshes: [meshes[index]],
      center: center.clone()
    };
    processed.add(index);
    
    // Find nearby meshes to cluster together
    const clusterRadius = 2.0; // Adjust based on typical model scale
    centers.forEach((otherCenter, otherIndex) => {
      if (processed.has(otherIndex) || index === otherIndex) return;
      
      if (center.distanceTo(otherCenter) < clusterRadius) {
        cluster.meshes.push(meshes[otherIndex]);
        processed.add(otherIndex);
      }
    });
    
    clusters.push(cluster);
  });
  
  return clusters;
}

// Fallback: Detect components by Three.js spatial separation
function detectComponentsByThreeJSSpatialSeparation(scene: THREE.Object3D): THREE.Mesh[][] {
  console.log('🔧 Using Three.js spatial separation fallback...');
  
  const allMeshes: THREE.Mesh[] = [];
  
  // Enhanced traversal with detailed logging
  const traverseScene = (obj: THREE.Object3D, depth = 0) => {
    const indent = '  '.repeat(depth);
    console.log(`${indent}🔍 Traversing: ${obj.type} "${obj.name}" (children: ${obj.children.length})`);
    
    if (obj instanceof THREE.Mesh && obj.geometry) {
      // Filter out edge lines and tiny meshes
      if (obj.material && 'type' in obj.material && obj.material.type === 'LineBasicMaterial') {
        console.log(`${indent}⚠️ Skipping line material mesh`);
        return;
      }
      
      try {
        const bbox = new THREE.Box3().setFromObject(obj);
        const size = bbox.getSize(new THREE.Vector3());
        const volume = size.x * size.y * size.z;
        console.log(`${indent}📏 Mesh "${obj.name}": ${size.x.toFixed(2)}×${size.y.toFixed(2)}×${size.z.toFixed(2)}, vol: ${volume.toFixed(4)}`);
        
        if (volume > 0.0000001) { // Much lower threshold for tiny models
          allMeshes.push(obj);
          console.log(`${indent}✅ Added mesh to component detection`);
        } else {
          console.log(`${indent}⚠️ Volume too small, skipping`);
        }
      } catch (error) {
        console.log(`${indent}❌ Error processing mesh:`, error);
      }
    }
    
    // Recursively traverse children
    obj.children.forEach(child => traverseScene(child, depth + 1));
  };
  
  traverseScene(scene);
  console.log(`🎯 Total meshes found: ${allMeshes.length}`);
  
  if (allMeshes.length === 0) return [];
  
  // Group by spatial proximity with conservative settings
  return groupMeshesIntoComponents(allMeshes);
}

// Create component from spatial group data
function createComponentFromSpatialGroup(spatialGroup: SpatialComponentGroup, index: number, productContext?: string): MechanicalComponent {
  const { meshes, center, size, name } = spatialGroup;
  
  // Convert to real-world dimensions
  const dimensions = {
    width: Math.round(size.x * 10) / 10,
    length: Math.round(size.z * 10) / 10,
    height: Math.round(size.y * 10) / 10
  };
  
  // Calculate volume
  const volume = (size.x * size.y * size.z) / 1000; // Convert mm³ to cm³
  
  // Use largest mesh for material classification
  const primaryMesh = meshes.reduce((largest, current) => {
    const sizeA = new THREE.Box3().setFromObject(largest).getSize(new THREE.Vector3());
    const sizeB = new THREE.Box3().setFromObject(current).getSize(new THREE.Vector3());
    const volA = sizeA.x * sizeA.y * sizeA.z;
    const volB = sizeB.x * sizeB.y * sizeB.z;
    return volB > volA ? current : largest;
  });
  
  // Determine component properties
  const componentType = classifyComponentType(dimensions, primaryMesh);
  const material = inferMaterial(primaryMesh, componentType);
  const density = getMaterialDensity(material);
  const mass = volume * density;
  const manufacturingFeatures = analyzeManufacturingFeatures(primaryMesh, dimensions);
  const componentFunction = inferComponentFunction(componentType, dimensions, index, productContext);
  
  return {
    name: name || generateComponentName(componentType, index, dimensions, productContext),
    type: componentType,
    material,
    massProperties: {
      volume: Math.round(volume * 100) / 100,
      mass: Math.round(mass * 100) / 100,
      centerOfMass: center,
      boundingBox: {
        min: spatialGroup.spatialBounds.min,
        max: spatialGroup.spatialBounds.max,
        dimensions
      },
      surfaceArea: calculateGroupSurfaceArea(meshes)
    },
    manufacturingFeatures,
    function: componentFunction,
    connections: []
  };
}

// Interface for spatial component groups
interface SpatialComponentGroup {
  name: string;
  meshes: THREE.Mesh[];
  spatialBounds: THREE.Box3;
  center: THREE.Vector3;
  size: THREE.Vector3;
  nodeData: any;
}

// Group meshes into logical components based on spatial proximity and size
function groupMeshesIntoComponents(meshes: THREE.Mesh[]): THREE.Mesh[][] {
  if (meshes.length === 0) return [];
  if (meshes.length === 1) return [meshes];

  const groups: THREE.Mesh[][] = [];
  const processed = new Set<THREE.Mesh>();

  // Sort meshes by volume (largest first) to start with main components
  const sortedMeshes = [...meshes].sort((a, b) => {
    const volumeA = calculateMeshVolume(a);
    const volumeB = calculateMeshVolume(b);
    return volumeB - volumeA;
  });

  sortedMeshes.forEach(mesh => {
    if (processed.has(mesh)) return;

    const group = [mesh];
    processed.add(mesh);
    
    const meshCenter = getMeshCenter(mesh);
    const meshSize = getMeshSize(mesh);
    const meshVolume = calculateMeshVolume(mesh);
    
    // More conservative grouping - only group very close, similar-sized meshes
    const groupingRadius = Math.max(meshSize.x, meshSize.y, meshSize.z) * 0.2; // Very small radius for tight grouping

    // Find other meshes that are very close to this one
    sortedMeshes.forEach(otherMesh => {
      if (processed.has(otherMesh) || mesh === otherMesh) return;

      const otherCenter = getMeshCenter(otherMesh);
      const otherVolume = calculateMeshVolume(otherMesh);
      const distance = meshCenter.distanceTo(otherCenter);
      
      // Only group if meshes are EXTREMELY close AND similar in size
      const volumeRatio = Math.min(meshVolume, otherVolume) / Math.max(meshVolume, otherVolume);
      const shouldGroup = distance < groupingRadius && volumeRatio > 0.1; // Volume ratio threshold
      
      if (shouldGroup) {
        group.push(otherMesh);
        processed.add(otherMesh);
        console.log(`🔗 Grouped mesh (distance: ${distance.toFixed(2)}, volume ratio: ${volumeRatio.toFixed(2)})`);
      }
    });

    groups.push(group);
    console.log(`📋 Created group with ${group.length} mesh(es)`);
  });

  return groups;
}

// Analyze a group of meshes as a single component
function analyzeComponentGroup(meshGroup: THREE.Mesh[], index: number, productContext?: string): MechanicalComponent {
  // Calculate combined bounding box
  const combinedBoundingBox = new THREE.Box3();
  meshGroup.forEach(mesh => {
    const meshBox = new THREE.Box3().setFromObject(mesh);
    combinedBoundingBox.union(meshBox);
  });
  
  const size = new THREE.Vector3();
  const combinedCenter = new THREE.Vector3();
  combinedBoundingBox.getSize(size);
  combinedBoundingBox.getCenter(combinedCenter);
  
  // Convert to real-world dimensions (assuming model units are in mm)
  const dimensions = {
    width: Math.round(size.x * 10) / 10,
    length: Math.round(size.z * 10) / 10,
    height: Math.round(size.y * 10) / 10
  };
  
  // Calculate total volume from individual meshes
  const volume = meshGroup.reduce((total, mesh) => {
    const meshBox = new THREE.Box3().setFromObject(mesh);
    const meshSize = new THREE.Vector3();
    meshBox.getSize(meshSize);
    return total + (meshSize.x * meshSize.y * meshSize.z) / 1000; // Convert mm³ to cm³
  }, 0);
  
  // Use the largest mesh for type and material classification
  const primaryMesh = meshGroup.reduce((largest, current) => {
    const sizeA = new THREE.Box3().setFromObject(largest).getSize(new THREE.Vector3());
    const sizeB = new THREE.Box3().setFromObject(current).getSize(new THREE.Vector3());
    const volA = sizeA.x * sizeA.y * sizeA.z;
    const volB = sizeB.x * sizeB.y * sizeB.z;
    return volB > volA ? current : largest;
  });
  
  // Determine component properties
  const componentType = classifyComponentType(dimensions, primaryMesh);
  const material = inferMaterial(primaryMesh, componentType);
  const density = getMaterialDensity(material);
  const mass = volume * density;
  const manufacturingFeatures = analyzeManufacturingFeatures(primaryMesh, dimensions);
  
  // Generate component name
  const name = generateComponentName(componentType, index, dimensions, productContext);
  
  // Determine function
  const componentFunction = inferComponentFunction(componentType, dimensions, index, productContext);
  
  return {
    name,
    type: componentType,
    material,
    massProperties: {
      volume: Math.round(volume * 100) / 100,
      mass: Math.round(mass * 100) / 100,
      centerOfMass: combinedCenter,
      boundingBox: {
        min: combinedBoundingBox.min,
        max: combinedBoundingBox.max,
        dimensions
      },
      surfaceArea: calculateGroupSurfaceArea(meshGroup)
    },
    manufacturingFeatures,
    function: componentFunction,
    connections: []
  };
}

// Helper functions for mesh analysis
function calculateMeshVolume(mesh: THREE.Mesh): number {
  const bbox = new THREE.Box3().setFromObject(mesh);
  const size = bbox.getSize(new THREE.Vector3());
  return size.x * size.y * size.z;
}

function getMeshCenter(mesh: THREE.Mesh): THREE.Vector3 {
  const bbox = new THREE.Box3().setFromObject(mesh);
  return bbox.getCenter(new THREE.Vector3());
}

function getMeshSize(mesh: THREE.Mesh): THREE.Vector3 {
  const bbox = new THREE.Box3().setFromObject(mesh);
  return bbox.getSize(new THREE.Vector3());
}

function calculateGroupSurfaceArea(meshGroup: THREE.Mesh[]): number {
  // Approximate surface area for the group
  const totalVolume = meshGroup.reduce((sum, mesh) => sum + calculateMeshVolume(mesh), 0);
  
  // Simple approximation based on volume (cube root approximation)
  const approximateSize = Math.cbrt(totalVolume);
  const surfaceArea = 6 * approximateSize * approximateSize;
  
  return Math.round(surfaceArea / 100) / 10; // Convert mm² to cm²
}

// Professional Component Labels System with Collision Avoidance
const ComponentLabels: React.FC<{
  mechanicalAnalysis: MechanicalAnalysis;
  showLabels: boolean;
  labelSize?: number;
}> = ({ mechanicalAnalysis, showLabels, labelSize = 1 }) => {
  // Auto-adjust label size based on component count and model size
  const componentCount = mechanicalAnalysis.components.length;
  const autoScale = componentCount > 5 ? 0.8 : componentCount > 10 ? 0.6 : 1.0;
  const adjustedLabelSize = labelSize * autoScale;
  if (!showLabels || !mechanicalAnalysis.components.length) {
    return null;
  }

  // Calculate optimal label positions to avoid overlaps
  const calculateLabelPositions = () => {
    const components = mechanicalAnalysis.components;
    const labelPositions: Array<{
      component: any;
      center: THREE.Vector3;
      size: THREE.Vector3;
      labelPosition: THREE.Vector3;
      connectionPoint: THREE.Vector3;
    }> = [];

    // First pass: calculate basic positions and component bounds
    components.forEach((component, index) => {
      const { min, max } = component.massProperties.boundingBox;
      const center = new THREE.Vector3(
        (min.x + max.x) / 2,
        (min.y + max.y) / 2,
        (min.z + max.z) / 2
      );
      const size = new THREE.Vector3(
        max.x - min.x,
        max.y - min.y,
        max.z - min.z
      );

      // Start with ideal position above component
      const baseDistance = Math.max(1.2, size.y / 2 + 0.8);
      const labelPosition = new THREE.Vector3(
        center.x,
        center.y + baseDistance,
        center.z
      );

      const connectionPoint = new THREE.Vector3(
        center.x,
        center.y + size.y / 2,
        center.z
      );

      labelPositions.push({
        component,
        center,
        size,
        labelPosition,
        connectionPoint
      });
    });

        // Second pass: resolve overlaps using enhanced angular separation
    const usedAngles: number[] = [];
    const minAngularSeparation = Math.PI / 6; // 30 degrees minimum separation
    
    for (let i = 0; i < labelPositions.length; i++) {
      const current = labelPositions[i];
      let adjusted = false;
      let attempts = 0;
      const maxAttempts = 12; // Try 12 different angles (30° increments)
      
      // Check for overlaps with other labels
      for (let j = 0; j < labelPositions.length; j++) {
        if (i === j) continue;
        
        const other = labelPositions[j];
        const distance = current.labelPosition.distanceTo(other.labelPosition);
        const minDistance = 1.2; // Increased minimum safe distance
        
        if (distance < minDistance) {
          // Find an optimal angle that doesn't conflict with existing labels
          let bestAngle = (i / labelPositions.length) * Math.PI * 2;
          let bestDistance = 0;
          
          // Try different angles to find the best separation
          for (let angleAttempt = 0; angleAttempt < maxAttempts; angleAttempt++) {
            const testAngle = (angleAttempt / maxAttempts) * Math.PI * 2;
            
            // Check if this angle has sufficient separation from used angles
            let validAngle = true;
            for (const usedAngle of usedAngles) {
              const angleDiff = Math.abs(testAngle - usedAngle);
              const normalizedDiff = Math.min(angleDiff, Math.PI * 2 - angleDiff);
              if (normalizedDiff < minAngularSeparation) {
                validAngle = false;
                break;
              }
            }
            
            if (validAngle) {
              // Test this position and measure distance to other labels
              const offsetDistance = 1.8; // Increased offset distance
              const testX = current.center.x + Math.cos(testAngle) * offsetDistance;
              const testZ = current.center.z + Math.sin(testAngle) * offsetDistance;
              const testY = current.center.y + current.size.y / 2 + 0.8;
              const testPosition = new THREE.Vector3(testX, testY, testZ);
              
              // Calculate minimum distance to all other labels
              let minDistToOthers = Infinity;
              for (let k = 0; k < labelPositions.length; k++) {
                if (k === i) continue;
                const distToOther = testPosition.distanceTo(labelPositions[k].labelPosition);
                minDistToOthers = Math.min(minDistToOthers, distToOther);
              }
              
              // Choose the angle that maximizes distance to other labels
              if (minDistToOthers > bestDistance) {
                bestDistance = minDistToOthers;
                bestAngle = testAngle;
              }
            }
          }
          
          // Apply the best angle found
          const offsetDistance = Math.max(1.8 * adjustedLabelSize, bestDistance * 0.7);
          current.labelPosition.x = current.center.x + Math.cos(bestAngle) * offsetDistance;
          current.labelPosition.z = current.center.z + Math.sin(bestAngle) * offsetDistance;
          current.labelPosition.y = Math.max(
            current.center.y + current.size.y / 2 + 0.8,
            current.labelPosition.y
          );
          
          // Record this angle as used
          usedAngles.push(bestAngle);
          adjusted = true;
          break; // Move to next label after adjusting this one
        }
      }

      // Ensure label doesn't intersect with its own component or others
      for (let j = 0; j < labelPositions.length; j++) {
        const comp = labelPositions[j];
        const { min, max } = comp.component.massProperties.boundingBox;
        
        // Check if label position is inside any component's bounding box
        if (current.labelPosition.x >= min.x && current.labelPosition.x <= max.x &&
            current.labelPosition.y >= min.y && current.labelPosition.y <= max.y &&
            current.labelPosition.z >= min.z && current.labelPosition.z <= max.z) {
          
          // Move label further away from the component
          const direction = current.labelPosition.clone().sub(comp.center).normalize();
          const safeDistance = Math.max(comp.size.length() / 2, 1.0);
          current.labelPosition = comp.center.clone().add(direction.multiplyScalar(safeDistance));
          current.labelPosition.y = Math.max(current.labelPosition.y, comp.center.y + comp.size.y / 2 + 0.5);
        }
      }
    }
    
    // Third pass: Add vertical layering for any remaining close labels
    for (let i = 0; i < labelPositions.length; i++) {
      for (let j = i + 1; j < labelPositions.length; j++) {
        const label1 = labelPositions[i];
        const label2 = labelPositions[j];
        const distance = label1.labelPosition.distanceTo(label2.labelPosition);
        const minDistance = 1.0;
        
        if (distance < minDistance) {
          // Add vertical separation - move the higher indexed label up
          const verticalOffset = 0.6;
          label2.labelPosition.y += verticalOffset;
          
          // Update connection point to maintain visual connection
          label2.connectionPoint.y = Math.min(
            label2.connectionPoint.y,
            label2.labelPosition.y - 0.3
          );
        }
      }
    }

    return labelPositions;
  };

  const labelData = calculateLabelPositions();
  const fontSize = 0.1 * adjustedLabelSize;

  return (
    <>
      {labelData.map((data, index) => {
        return (
          <group key={`smart-label-${index}`}>
            {/* Professional label with background panel */}
            <group position={data.labelPosition}>
              {/* Label background panel for better readability */}
              <mesh position={[0, 0, -0.01]}>
                <planeGeometry args={[data.component.name.length * fontSize * 0.6, fontSize * 1.8]} />
                <meshBasicMaterial 
                  color="#1f2937" 
                  opacity={0.8} 
                  transparent 
                  side={THREE.DoubleSide}
                />
              </mesh>
              
              {/* Label text */}
              <Text
                position={[0, 0, 0]}
                fontSize={fontSize}
                color="#ffffff"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.005}
                outlineColor="#000000"
                fontWeight="500"
              >
                {data.component.name}
              </Text>
            </group>
            
            {/* Smart connection line with curve for offset labels */}
            {(() => {
              const startPoint = data.connectionPoint;
              const endPoint = new THREE.Vector3(
                data.labelPosition.x, 
                data.labelPosition.y - fontSize * 0.9, 
                data.labelPosition.z
              );
              
              // Calculate if the label is significantly offset horizontally
              const horizontalDistance = Math.sqrt(
                Math.pow(endPoint.x - startPoint.x, 2) + 
                Math.pow(endPoint.z - startPoint.z, 2)
              );
              
              if (horizontalDistance > 0.5) {
                // Create a curved line for offset labels
                const midPoint = new THREE.Vector3(
                  (startPoint.x + endPoint.x) / 2,
                  Math.max(startPoint.y, endPoint.y) + 0.2,
                  (startPoint.z + endPoint.z) / 2
                );
                
                const curve = new THREE.QuadraticBezierCurve3(
                  startPoint,
                  midPoint,
                  endPoint
                );
                const points = curve.getPoints(20);
                const geometry = new THREE.BufferGeometry().setFromPoints(points);
                
                return (
                  <primitive object={new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: "#64748b", opacity: 0.6, transparent: true }))} />
                );
              } else {
                // Straight line for directly above labels
                return (
                  <line>
                    <bufferGeometry>
                      <bufferAttribute
                        attach="attributes-position"
                        array={new Float32Array([
                          startPoint.x, startPoint.y, startPoint.z,
                          endPoint.x, endPoint.y, endPoint.z
                        ])}
                        count={2}
                        itemSize={3}
                      />
                    </bufferGeometry>
                    <lineBasicMaterial color="#64748b" opacity={0.7} transparent />
                  </line>
                );
              }
            })()}
            
            {/* Component indicator dot */}
            <mesh position={data.connectionPoint}>
              <sphereGeometry args={[0.015 * adjustedLabelSize]} />
              <meshStandardMaterial 
                color="#3b82f6" 
                emissive="#1e40af" 
                emissiveIntensity={0.2}
              />
            </mesh>
          </group>
        );
      })}
    </>
  );
};

// Analyze individual mesh component
function analyzeMeshComponent(mesh: THREE.Mesh, index: number, productContext?: string): MechanicalComponent {
  // Calculate bounding box and dimensions
  const boundingBox = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  boundingBox.getSize(size);
  boundingBox.getCenter(center);
  
  // Convert to real-world dimensions (assuming model units are in mm)
  const dimensions = {
    width: Math.round(size.x * 10) / 10,
    length: Math.round(size.z * 10) / 10,
    height: Math.round(size.y * 10) / 10
  };
  
  // Calculate volume from bounding box (approximation)
  const volume = (size.x * size.y * size.z) / 1000; // Convert mm³ to cm³
  
  // Determine component type based on geometry
  const componentType = classifyComponentType(dimensions, mesh);
  
  // Infer material from mesh material or name
  const material = inferMaterial(mesh, componentType);
  
  // Calculate mass (density * volume)
  const density = getMaterialDensity(material); // g/cm³
  const mass = volume * density;
  
  // Analyze manufacturing features
  const manufacturingFeatures = analyzeManufacturingFeatures(mesh, dimensions);
  
  // Generate component name
  const name = generateComponentName(componentType, index, dimensions, productContext);
  
  // Determine function
  const componentFunction = inferComponentFunction(componentType, dimensions, index, productContext);
  
  return {
    name,
    type: componentType,
    material,
    massProperties: {
      volume: Math.round(volume * 100) / 100,
      mass: Math.round(mass * 100) / 100,
      centerOfMass: center,
      boundingBox: {
        min: boundingBox.min,
        max: boundingBox.max,
        dimensions
      },
      surfaceArea: calculateSurfaceArea(mesh)
    },
    manufacturingFeatures,
    function: componentFunction,
    connections: [] // Could be enhanced with proximity analysis
  };
}

// Classify component type based on geometry
function classifyComponentType(dimensions: any, mesh: THREE.Mesh): MechanicalComponent['type'] {
  const { width, length, height } = dimensions;
  const aspectRatio = Math.max(width, length) / Math.min(width, length);
  const heightRatio = height / Math.max(width, length);
  
  // Very thin and flat - likely a plate or bracket
  if (heightRatio < 0.2) {
    if (aspectRatio > 3) return 'bracket';
    return 'plate';
  }
  
  // Tall and thin - likely a shaft or rod
  if (height > Math.max(width, length) * 2) {
    return 'shaft';
  }
  
  // Roughly cubic or spherical - could be housing or container
  if (aspectRatio < 1.5 && heightRatio > 0.5 && heightRatio < 2) {
    // Check if hollow (this is simplified - real analysis would need mesh topology)
    const volume = width * length * height;
    if (volume > 1000) return 'housing'; // Larger components likely housings
    if (volume < 100) return 'fastener'; // Small components likely fasteners
    return 'container';
  }
  
  // Default for complex shapes
  return 'complex';
}

// Infer material from mesh properties
function inferMaterial(mesh: THREE.Mesh, componentType: MechanicalComponent['type']): string {
  const material = mesh.material;
  
  // Try to get material name from Three.js material
  if (material && 'name' in material && material.name) {
    const name = material.name.toLowerCase();
    if (name.includes('steel') || name.includes('metal')) return 'Steel';
    if (name.includes('aluminum') || name.includes('aluminium')) return 'Aluminum';
    if (name.includes('plastic') || name.includes('polymer')) return 'ABS Plastic';
    if (name.includes('brass')) return 'Brass';
    if (name.includes('titanium')) return 'Titanium';
  }
  
  // Infer based on component type - defaulting to 3D printing materials
  switch (componentType) {
    case 'fastener': return 'PLA Plastic';
    case 'shaft': return 'PLA Plastic';
    case 'housing': return 'PLA Plastic';
    case 'bracket': return 'PLA Plastic';
    case 'plate': return 'PLA Plastic';
    case 'container': return 'PLA Plastic';
    default: return 'PLA Plastic';
  }
}

// Get material density in g/cm³
function getMaterialDensity(material: string): number {
  const densities: Record<string, number> = {
    'Steel': 7.85,
    'Aluminum': 2.70,
    'ABS Plastic': 1.05,
    'PLA Plastic': 1.25,
    'Brass': 8.50,
    'Titanium': 4.50,
    'Nylon': 1.15
  };
  return densities[material] || 1.05; // Default to ABS plastic
}

// Analyze manufacturing features
function analyzeManufacturingFeatures(mesh: THREE.Mesh, dimensions: any): MechanicalComponent['manufacturingFeatures'] {
  const geometry = mesh.geometry;
  let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
  
  // Analyze geometry complexity
  if (geometry.attributes.position) {
    const vertexCount = geometry.attributes.position.count;
    if (vertexCount > 10000) complexity = 'complex';
    else if (vertexCount > 1000) complexity = 'moderate';
  }
  
  // Simplified feature detection (real implementation would be more sophisticated)
  const volume = dimensions.width * dimensions.length * dimensions.height;
  const minDimension = Math.min(dimensions.width, dimensions.length, dimensions.height);
  
  return {
    holes: Math.floor(Math.random() * 3), // Simplified - real detection would analyze mesh topology
    fillets: complexity !== 'simple',
    sharpEdges: complexity === 'simple',
    thinWalls: minDimension < 5, // < 5mm
    overhangs: complexity === 'complex',
    complexity
  };
}

// Calculate approximate surface area
function calculateSurfaceArea(mesh: THREE.Mesh): number {
  const geometry = mesh.geometry;
  if (!geometry.attributes.position) return 0;
  
  // Simplified calculation - real implementation would sum triangle areas
  const boundingBox = new THREE.Box3().setFromObject(mesh);
  const size = new THREE.Vector3();
  boundingBox.getSize(size);
  
  // Approximate surface area of bounding box (overestimate)
  const surfaceArea = 2 * (size.x * size.y + size.y * size.z + size.z * size.x);
  return Math.round(surfaceArea / 100) / 10; // Convert mm² to cm²
}

// Generate descriptive component name using actual product context
function generateComponentName(type: MechanicalComponent['type'], index: number, dimensions: any, productContext?: string): string {
  const { width, length, height } = dimensions;
  
  // Extract the actual product name for better context
  const productName = productContext || 'Component';
  const productWords = productName.toLowerCase().split(/\s+/).filter(word => 
    word.length > 2 && !['the', 'and', 'for', 'with', 'design', 'create', 'make', 'build'].includes(word)
  );
  const mainProductWord = productWords[0] || 'component';
  
  switch (type) {
    case 'shaft':
      return `${productName} Shaft (${Math.round(Math.min(width, length))}×${Math.round(height)}mm)`;
    case 'plate':
      return index === 0 ? `${productName} Base Plate` : `${productName} Mounting Plate ${index + 1}`;
    case 'bracket':
      return `${productName} Support Bracket`;
    case 'housing':
      return index === 0 ? `${productName} Main Housing` : `${productName} Housing ${index + 1}`;
    case 'container':
      return `${productName} Container Body`;
    case 'fastener':
      return `${productName} Fastener (M${Math.round(Math.min(width, length))})`;
    case 'structural':
      return index === 0 ? `${productName} Main Body` : `${productName} Support Structure`;
    default:
      // Use meaningful names based on product context
      if (index === 0) {
        return `${productName} Main Component`;
      } else {
        // Try to create meaningful secondary component names
        const componentParts = ['Handle', 'Cover', 'Support', 'Interface', 'Connector', 'Guard', 'Mount'];
        const partName = componentParts[index % componentParts.length];
        return `${productName} ${partName}`;
      }
  }
}

// Infer component function using actual product context
function inferComponentFunction(type: MechanicalComponent['type'], dimensions: any, index: number, productContext?: string): string {
  const productName = productContext || 'device';
  
  switch (type) {
    case 'shaft': 
      return `Rotational component for ${productName} mechanism`;
    case 'plate': 
      return index === 0 ? `Primary base structure for ${productName}` : `Mounting interface for ${productName} assembly`;
    case 'bracket': 
      return `Support and mounting structure for ${productName}`;
    case 'housing': 
      return `Protective enclosure for ${productName} components`;
    case 'container': 
      return `Primary containment body of ${productName}`;
    case 'fastener': 
      return `Assembly hardware for ${productName} connection`;
    case 'structural': 
      return index === 0 ? `Main structural element of ${productName}` : `Secondary support structure for ${productName}`;
    default: 
      if (index === 0) {
        return `Primary functional component of ${productName}`;
      } else {
        return `Secondary component for ${productName} operation`;
      }
  }
}

// Determine optimal manufacturing method
function determineManufacturingMethod(components: MechanicalComponent[], totalVolume: number): MechanicalAnalysis['manufacturingRecommendations'] {
  // This function is deprecated in favor of the enhanced cadPropertyCalculator
  // Return basic defaults and let the cadPropertyCalculator handle the proper analysis
  return {
    primaryMethod: '3D Printing (FDM)',
    alternativeMethods: ['CNC Machining', 'Injection Molding'],
    complexity: 'simple',
    estimatedCost: { min: 15, max: 45 },
    reasoning: 'Pending detailed analysis from CAD property calculator'
  };
}

// Error Boundary specifically for GLTF loading
class GLTFErrorBoundary extends React.Component<
  { children: React.ReactNode; onError?: (error: string) => void },
  { hasError: boolean; error?: Error }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error) {
    console.error('🚨 GLTF Error Boundary caught:', error);
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('🚨 GLTF Component Error:', error, errorInfo);
    this.props.onError?.(error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <group>
          <mesh>
            <boxGeometry args={[3, 0.5, 3]} />
            <meshStandardMaterial color="#ff6b6b" />
          </mesh>
          <Text position={[0, 1, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
            BOUNDARY ERROR
          </Text>
          <Text position={[0, 0.5, 0]} fontSize={0.12} color="#ffcccc" anchorX="center">
            {this.state.error?.message || 'Unknown error'}
          </Text>
        </group>
      );
    }

    return this.props.children;
  }
}

// Enhanced 3D Viewer Component for GLTF models
const Advanced3DViewer: React.FC<{ 
  gltfUrl: string; 
  onError?: (error: string) => void;
  onGLTFDataLoaded?: (gltfData: any, mechanicalAnalysis?: MechanicalAnalysis) => void;
  enableAutoRotate?: boolean;
  enableZoom?: boolean;
  resetTrigger?: number;
}> = ({ 
  gltfUrl, 
  onError, 
  onGLTFDataLoaded,
  enableAutoRotate = true, 
  enableZoom = true,
  resetTrigger = 0
}) => {
  const [modelBounds, setModelBounds] = useState<{
    size: THREE.Vector3;
    center: THREE.Vector3;
    maxDistance: number;
  } | null>(null);
  const [shouldAutoRotate, setShouldAutoRotate] = useState(enableAutoRotate);
  const [isUserInteracting, setIsUserInteracting] = useState(false);
  const autoRotateTimeoutRef = useRef<NodeJS.Timeout>();
  const isModelInitialized = useRef(false); // Track if model setup is complete
  
  const { camera, size: canvasSize } = useThree();
  const orbitControlsRef = useRef<any>();
  
  // Load GLTF model
  const gltf = useGLTF(gltfUrl);
  
  // Reset initialization flag when URL changes
  useEffect(() => {
    isModelInitialized.current = false;
    console.log('🔄 New model URL detected, resetting initialization flag');
  }, [gltfUrl]);
  
  // Enhanced mechanical component analysis and GLTF data capture
  useEffect(() => {
    if (onGLTFDataLoaded && gltfUrl && gltf?.scene) {
      const captureMechanicalData = async () => {
        try {
          console.log('🔧 Analyzing mechanical components and extracting GLTF data...');
          
          // Download raw GLTF data
          const response = await fetch(gltfUrl);
          let gltfData = null;
          if (response.ok) {
            gltfData = await response.json();
          }
          
          // Extract mechanical component data from Three.js scene
          const mechanicalAnalysis = extractMechanicalComponents(gltf.scene, gltfData);
          
          // Send both raw GLTF data and mechanical analysis separately
          onGLTFDataLoaded(gltfData, mechanicalAnalysis);
          
          console.log('✅ Mechanical analysis completed:', {
            componentCount: mechanicalAnalysis.components.length,
            totalMass: mechanicalAnalysis.massProperties.totalMass.toFixed(2),
            materialTypes: mechanicalAnalysis.materials.length
          });
        } catch (error) {
          console.warn('⚠️ Failed to capture mechanical data:', error);
        }
      };
      captureMechanicalData();
    }
  }, [gltfUrl, onGLTFDataLoaded, gltf]);
  
  // Calculate model bounding box and setup camera
  useEffect(() => {
    if (!gltf?.scene || !camera) {
      console.log('⏳ Waiting for GLTF scene and camera...');
      return;
    }
    
    // Prevent re-initialization if model is already set up
    if (isModelInitialized.current) {
      console.log('🚫 Model already initialized, skipping setup');
      return;
    }
    
    console.log('🎯 Starting model processing and camera setup...');
    
    try {
      // Create bounding box
      const boundingBox = new THREE.Box3();
      boundingBox.setFromObject(gltf.scene);
      
      if (boundingBox.isEmpty()) {
        onError?.('Model appears to be empty');
        return;
      }
      
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      boundingBox.getSize(size);
      boundingBox.getCenter(center);
      
      const maxDistance = Math.max(size.x, size.y, size.z);
      console.log(`📏 Original model size: ${maxDistance.toFixed(4)} units`);
      
      // 🔧 SMART SCALING: Auto-scale tiny models for optimal viewing
      let scaleFactor = 1;
      const OPTIMAL_SIZE = 5; // Target size for optimal viewing (5 units)
      const MIN_SIZE_THRESHOLD = 1.0; // If model is smaller than this, scale it up
      
      if (maxDistance < MIN_SIZE_THRESHOLD) {
        scaleFactor = OPTIMAL_SIZE / maxDistance;
        console.log(`🔍 Model is too small (${maxDistance.toFixed(4)} units), applying scale factor: ${scaleFactor.toFixed(2)}x`);
        
        // Apply scaling to the entire scene
        gltf.scene.scale.setScalar(scaleFactor);
      }

      // Style the model with website theme colors (cyan/purple theme)
      gltf.scene.traverse((child: THREE.Object3D) => {
        if (child instanceof THREE.Mesh) {
          // Set material color to match website theme (cyan)
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(mat => {
                if (mat instanceof THREE.MeshStandardMaterial) {
                  mat.color = new THREE.Color(0x22d3ee); // cyan-400
                  mat.metalness = 0.3;
                  mat.roughness = 0.4;
                  mat.emissive = new THREE.Color(0x0891b2); // subtle cyan glow
                  mat.emissiveIntensity = 0.1;
                }
              });
            } else if (child.material instanceof THREE.MeshStandardMaterial) {
              child.material.color = new THREE.Color(0x22d3ee); // cyan-400
              child.material.metalness = 0.3;
              child.material.roughness = 0.4;
              child.material.emissive = new THREE.Color(0x0891b2); // subtle cyan glow
              child.material.emissiveIntensity = 0.1;
            }
          }
          
          // Removed edge lines to prevent unwanted visual artifacts
        }
      });
      
      // Calculate final bounds after scaling and centering
      const finalBoundingBox = new THREE.Box3().setFromObject(gltf.scene);
      const finalCenter = new THREE.Vector3();
      const finalSize = new THREE.Vector3();
      finalBoundingBox.getCenter(finalCenter);
      finalBoundingBox.getSize(finalSize);
      const finalMaxDistance = Math.max(finalSize.x, finalSize.y, finalSize.z);
      
      console.log(`📐 Final model dimensions: ${finalMaxDistance.toFixed(2)} units (after scaling)`);
      
      // Center the model using final dimensions
      gltf.scene.position.sub(finalCenter);
      console.log(`🎯 Model centered at origin`);
      
      // Set modelBounds to final dimensions for consistent OrbitControls
      setModelBounds({ 
        size: finalSize, 
        center: new THREE.Vector3(0, 0, 0), // Centered at origin after positioning
        maxDistance: finalMaxDistance 
      });
      
      // 🧠 DYNAMIC CAMERA POSITIONING: Adapt distance based on model dimensions and scaling
      let cameraMultiplier = 0.52; // Base multiplier for normal-sized models (moved slightly back)
      
      // Adjust camera distance based on scaling factor to prevent zoom-in when heavily scaled
      if (scaleFactor > 5) {
        cameraMultiplier = 1.0; // Even closer for heavily scaled generated models
      } else if (scaleFactor > 2) {
        cameraMultiplier = 0.9; // Moderately further back for medium scaling (moved slightly back)
      } else if (scaleFactor > 1.5) {
        cameraMultiplier = 0.7; // Slightly further back for light scaling (moved slightly back)
      }
      
      // Additionally, consider the largest dimension to ensure full model visibility
      const largestDimension = Math.max(finalSize.x, finalSize.y, finalSize.z);
      
      // For very elongated models, increase distance further
      const aspectRatio = largestDimension / Math.min(finalSize.x, finalSize.y, finalSize.z);
      if (aspectRatio > 3) {
        cameraMultiplier *= 1.2; // 20% further back for elongated models
      }
      
      const optimalDistance = finalMaxDistance * cameraMultiplier;
      console.log(`📷 Dynamic camera positioning: scaleFactor=${scaleFactor.toFixed(2)}, multiplier=${cameraMultiplier.toFixed(2)}, distance=${optimalDistance.toFixed(2)}`);
      console.log(`📷 Setting camera position to: (${optimalDistance.toFixed(2)}, ${optimalDistance.toFixed(2)}, ${optimalDistance.toFixed(2)})`);
      
      // Use setTimeout to ensure camera positioning happens after React state update
      setTimeout(() => {
        camera.position.set(optimalDistance, optimalDistance, optimalDistance);
        camera.lookAt(0, 0, 0);
        if (camera instanceof THREE.OrthographicCamera) {
          camera.updateProjectionMatrix();
        }
        
        // Force camera update to ensure position is applied immediately
        if (orbitControlsRef.current) {
          orbitControlsRef.current.update();
          console.log(`🔄 OrbitControls updated with final bounds`);
        }
        
        console.log(`✅ Camera positioned at distance: ${camera.position.length().toFixed(2)} units`);
        
        // Mark model as initialized to prevent re-setup
        isModelInitialized.current = true;
        console.log('✅ Model initialization complete');
      }, 100); // Small delay to ensure state update completes
      
      console.log(`📐 Final model setup: size=${finalMaxDistance.toFixed(2)}, camera distance=${optimalDistance.toFixed(2)}`);
      if (scaleFactor > 1) {
        console.log(`✅ Model scaled ${scaleFactor.toFixed(2)}x from ${maxDistance.toFixed(4)} to ${finalMaxDistance.toFixed(2)} units`);
      }
      
    } catch (error) {
      console.error('Error processing GLTF model:', error);
      onError?.('Failed to process 3D model');
    }
    
    // Note: Removed aggressive Three.js cleanup that was causing WebGL context loss
    // React Three Fiber handles resource cleanup automatically
  }, [gltf, camera, onError]); // Removed canvasSize to prevent scroll resets
  
  // Auto-rotation logic
  useFrame((state, delta) => {
    if (shouldAutoRotate && !isUserInteracting && orbitControlsRef.current) {
      orbitControlsRef.current.autoRotate = true;
    } else if (orbitControlsRef.current) {
      orbitControlsRef.current.autoRotate = false;
    }
  });
  
  // Handle camera reset
  useEffect(() => {
    if (resetTrigger > 0 && modelBounds && orbitControlsRef.current && camera) {
      // Reset camera position to optimal distance (for navigation back)
      const distance = modelBounds.maxDistance * 0.51; // Keep original navigation distance
      camera.position.set(distance, distance, distance);
      camera.lookAt(0, 0, 0);
      
      // Reset orbit controls
      orbitControlsRef.current.reset();
      
      // Update camera if it's orthographic
      if (camera instanceof THREE.OrthographicCamera) {
        camera.updateProjectionMatrix();
      }
      
      console.log('🔄 Camera view reset');
    }
  }, [resetTrigger, modelBounds, camera]);
  
  // Handle user interaction for auto-rotate
  const handleInteractionStart = useCallback(() => {
    setIsUserInteracting(true);
    setShouldAutoRotate(false);
    if (autoRotateTimeoutRef.current) {
      clearTimeout(autoRotateTimeoutRef.current);
    }
  }, []);
  
  const handleInteractionEnd = useCallback(() => {
    setIsUserInteracting(false);
    if (enableAutoRotate) {
      autoRotateTimeoutRef.current = setTimeout(() => {
        setShouldAutoRotate(true);
      }, 3000); // Resume auto-rotate after 3 seconds
    }
  }, [enableAutoRotate]);
  
  if (!modelBounds) {
    return (
            <group>
              <mesh>
          <boxGeometry args={[2, 0.3, 2]} />
          <meshStandardMaterial color="#6366f1" emissive="#4338ca" emissiveIntensity={0.2} />
              </mesh>
        <Text position={[0, 0.5, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
          Loading CAD Model...
              </Text>
            </group>
    );
  }
  
  return (
    <>
      {/* Dynamic Lighting Setup with theme tint */}
      <ambientLight color="#f0f9ff" intensity={2.8} />
      <directionalLight 
        position={[-modelBounds.maxDistance * 2, -modelBounds.maxDistance, modelBounds.maxDistance]} 
        intensity={1.0}
        castShadow
      />
      <directionalLight 
        position={[0, 0, modelBounds.maxDistance * 2]} 
        intensity={1.4}
      />
      <directionalLight 
        position={[-modelBounds.maxDistance * 2, -modelBounds.maxDistance * 2, modelBounds.maxDistance * 2]} 
        intensity={0.8}
      />
      
      {/* Orbit Controls */}
      <OrbitControls
        ref={orbitControlsRef}
        enableDamping
        dampingFactor={0.08}
        enableZoom={true} // Re-enabled zoom functionality
        enableRotate={true}
        enablePan={true}
        autoRotate={shouldAutoRotate}
        autoRotateSpeed={1.0}
        onStart={handleInteractionStart}
        onEnd={handleInteractionEnd}
        maxDistance={modelBounds.maxDistance * 6} // Reasonable zoom out limit
        minDistance={modelBounds.maxDistance * 0.2} // Prevent getting too close
        zoomSpeed={1.0} // Standard zoom speed for better control
        rotateSpeed={1.0}
        panSpeed={1.0}
      />
      
      {/* Professional Grid with theme colors */}
      <Grid
        position={[0, -modelBounds.size.y / 2 - 0.1, 0]}
        args={[modelBounds.maxDistance * 4, modelBounds.maxDistance * 4]}
        cellSize={modelBounds.maxDistance / 10}
        cellThickness={0.5}
        cellColor="#374151" // gray-700 - subtle
        sectionSize={modelBounds.maxDistance}
        sectionThickness={1}
        sectionColor="#6366f1" // indigo-500 - theme accent
        fadeDistance={modelBounds.maxDistance * 3}
        fadeStrength={1}
      />
      
      {/* Render the actual GLTF model */}
      <primitive object={gltf.scene} />
    </>
  );
};

// OrthographicCamera Component
const CADCamera: React.FC = () => {
  const { set, size } = useThree();
  
  const camera = useMemo(() => {
    const aspect = size.width / size.height;
    const cam = new THREE.OrthographicCamera(
      -10, 10, 10 / aspect, -10 / aspect, 0.1, 1000
    );
    cam.position.set(10, 10, 10);
    cam.lookAt(0, 0, 0);
    return cam;
  }, [size]);
  
  useEffect(() => {
    set({ camera });
  }, [camera, set]);
  
  return null;
};

// Enhanced CAD Model Component with auto-rotate control
const EnhancedCADModelComponent: React.FC<{ 
  cadModel: any; 
  onGLTFDataLoaded?: (gltfData: any, mechanicalAnalysis?: MechanicalAnalysis) => void;
  enableAutoRotate?: boolean;
  enableZoom?: boolean;
  resetTrigger?: number;
}> = React.memo(({ cadModel, onGLTFDataLoaded, enableAutoRotate = true, enableZoom = true, resetTrigger = 0 }) => {
  const [loadError, setLoadError] = useState<string | null>(null);
  
  // Debug log for CAD model data
  console.log('🔧 EnhancedCADModelComponent received cadModel:', {
    hasCadModel: !!cadModel,
    gltfUrl: cadModel?.gltfUrl,
    cadModelKeys: cadModel ? Object.keys(cadModel) : [],
    cadModel: cadModel
  });
  
  if (!cadModel?.gltfUrl) {
    return (
      <group>
        <mesh>
          <boxGeometry args={[3, 0.5, 3]} />
          <meshStandardMaterial color="#4b5563" emissive="#374151" emissiveIntensity={0.1} />
        </mesh>
        <Text position={[0, 1, 0]} fontSize={0.3} color="#ffffff" anchorX="center">
          No CAD Model Available
        </Text>
      </group>
    );
  }

  const handleError = useCallback((error: string) => {
    console.error('CAD Model Error:', error);
    setLoadError(error);
  }, []);
  
  if (loadError) {
    return (
      <group>
        <mesh>
          <boxGeometry args={[3, 0.5, 3]} />
          <meshStandardMaterial color="#ef4444" emissive="#dc2626" emissiveIntensity={0.2} />
        </mesh>
        <Text position={[0, 1, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
          Model Load Error
        </Text>
        <Text position={[0, 0.5, 0]} fontSize={0.1} color="#fecaca" anchorX="center">
          {loadError}
        </Text>
      </group>
    );
  }

  return (
    <Suspense fallback={
    <group>
      <mesh>
          <boxGeometry args={[2, 0.3, 2]} />
          <meshStandardMaterial color="#6366f1" emissive="#4338ca" emissiveIntensity={0.2} />
      </mesh>
        <Text position={[0, 0.5, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
          Loading Model...
      </Text>
      </group>
    }>
      <Advanced3DViewer 
        gltfUrl={cadModel.gltfUrl} 
        onError={handleError}
        onGLTFDataLoaded={onGLTFDataLoaded}
        enableAutoRotate={enableAutoRotate}
        enableZoom={enableZoom}
        resetTrigger={resetTrigger}
      />
    </Suspense>
  );
});

// Main scene component with enhanced CAD support
const EnhancedProductScene: React.FC<{ 
  model: ArchitecturalModel; 
  onGLTFDataLoaded?: (gltfData: any, mechanicalAnalysis?: MechanicalAnalysis) => void;
  enableAutoRotate?: boolean;
  enableZoom?: boolean;
  resetTrigger?: number;
  showLabels?: boolean;
  mechanicalAnalysis?: MechanicalAnalysis | null;
  modelScale?: number;
  minObjectSize?: number;
  labelSize?: number;
}> = ({ model, onGLTFDataLoaded, enableAutoRotate = true, enableZoom = true, resetTrigger = 0, showLabels = false, mechanicalAnalysis, modelScale = 1, minObjectSize = 1, labelSize = 1 }) => {
  // Check if this is a CAD model
  if (model?.cadModel) {
    return (
      <>
        <EnhancedCADModelComponent 
          cadModel={model.cadModel} 
          onGLTFDataLoaded={onGLTFDataLoaded}
          enableAutoRotate={enableAutoRotate}
          enableZoom={enableZoom}
          resetTrigger={resetTrigger}
        />
        {/* Component Labels with Adaptive Sizing */}
        {mechanicalAnalysis && (
          <ComponentLabels 
            mechanicalAnalysis={mechanicalAnalysis} 
            showLabels={showLabels}
            labelSize={labelSize}
          />
        )}
      </>
    );
  }
  
  // Fallback for non-CAD models
  return (
    <>
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1.0} />
      <Text
        position={[0, 0, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        No 3D model available
      </Text>
    </>
  );
};

// Product Component for rendering individual product parts (Legacy support)
const ProductComponent: React.FC<{ component: Room; materials: any }> = ({ component, materials }) => {
  const meshRef = useRef<THREE.Mesh>(null);

  if (!component || !component.dimensions) {
    return null;
  }

  // Get a nice color based on component type
  const getComponentColor = (name: string) => {
    const colors = {
      'main_body': '#4a90e2',
      'body': '#4a90e2', 
      'interface': '#50c878',
      'handle': '#ff6b6b',
      'cover': '#ffa500',
      'stand': '#8b4513',
      'connector': '#ffd700',
      'sensor': '#9370db',
      'battery': '#32cd32',
      'speaker': '#ff69b4',
      'default': '#808080'
    };
    
    for (const [key, color] of Object.entries(colors)) {
      if (name.toLowerCase().includes(key)) {
        return color;
      }
    }
    return colors.default;
  };

  const componentColor = getComponentColor(component.name);

  return (
    <group position={[component.position.x, component.position.y, component.position.z]}>
      {/* Main component body */}
      <mesh ref={meshRef}>
        <boxGeometry args={[
          component.dimensions.width / 10, // Convert cm to units 
          component.dimensions.height / 10,
          component.dimensions.length / 10
        ]} />
        <meshStandardMaterial 
          color={componentColor}
          metalness={0.3}
          roughness={0.4}
        />
      </mesh>

      {/* Component label */}
      <Text
        position={[0, (component.dimensions.height / 10) + 0.5, 0]}
        fontSize={0.3}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        {component.name.replace('_', ' ').toUpperCase()}
      </Text>

      {/* Component details */}
      <Text
        position={[0, (component.dimensions.height / 10) + 0.2, 0]}
        fontSize={0.15}
        color="#cccccc"
        anchorX="center"
        anchorY="middle"
      >
        {component.dimensions.width}×{component.dimensions.length}×{component.dimensions.height}cm
      </Text>
    </group>
  );
};

// Main scene component
const ProductScene: React.FC<{ model: ArchitecturalModel; viewerState: ViewerState }> = ({ 
  model, 
  viewerState 
}) => {
  const { camera } = useThree();

  useEffect(() => {
    if (viewerState.camera) {
      camera.position.set(
        viewerState.camera.position.x,
        viewerState.camera.position.y,
        viewerState.camera.position.z
      );
      camera.lookAt(
        viewerState.camera.target.x,
        viewerState.camera.target.y,
        viewerState.camera.target.z
      );
    }
  }, [camera, viewerState.camera]);

  // Check if this is a CAD model
  if (model?.cadModel) {
    return (
      <>
        {/* Enhanced lighting for CAD models */}
        <ambientLight intensity={0.6} />
        <directionalLight 
          position={[10, 10, 5]} 
          intensity={1.2}
          castShadow
          shadow-mapSize-width={2048}
          shadow-mapSize-height={2048}
        />
        <pointLight position={[-10, 10, -10]} intensity={0.4} />
        <pointLight position={[10, -10, 10]} intensity={0.3} />

        {/* Professional grid for CAD visualization */}
        <Grid
          position={[0, -0.01, 0]}
          args={[50, 50]}
          cellSize={0.5}
          cellThickness={0.3}
          cellColor="#3f3f3f"
          sectionSize={5}
          sectionThickness={0.8}
          sectionColor="#5f5f5f"
          fadeDistance={30}
          fadeStrength={1}
        />

        {/* Render CAD model */}
        <EnhancedCADModelComponent cadModel={model.cadModel} />

        {/* Professional environment for CAD */}
        <Environment preset="studio" />
      </>
    );
  }

  // Legacy product component rendering
  if (!model || !model.rooms || model.rooms.length === 0) {
    return (
      <Text
        position={[0, 0, 0]}
        fontSize={0.5}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
      >
        No product components to display
      </Text>
    );
  }

  return (
    <>
      {/* Environment lighting */}
      <ambientLight intensity={viewerState.lighting.ambient} />
      <directionalLight 
        position={[10, 10, 5]} 
        intensity={viewerState.lighting.directional}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <pointLight position={[0, 10, 0]} intensity={0.5} />

      {/* Ground grid */}
      <Grid
        position={[0, -0.01, 0]}
        args={[100, 100]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#6f6f6f"
        sectionSize={10}
        sectionThickness={1}
        sectionColor="#9d4b4b"
        fadeDistance={50}
        fadeStrength={1}
      />

      {/* Render product components */}
      {model.rooms && model.rooms.map((component) => (
        <ProductComponent 
          key={component.id} 
          component={component} 
          materials={viewerState.materials}
        />
      ))}

      {/* Environment for realistic lighting */}
      <Environment preset="city" />
    </>
  );
};

// WebGL Support Check
const checkWebGLSupport = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!(gl && gl instanceof WebGLRenderingContext);
  } catch (e) {
    return false;
  }
};

// AR overlay component
const AROverlay: React.FC<{
  arSession: ARSession;
  onPlaceModel: (placement: ARPlacement) => void;
  onExitAR: () => void;
}> = ({ arSession, onPlaceModel, onExitAR }) => {
  return (
    <div className="absolute inset-0 z-50">
      {/* AR UI Controls */}
      <div className="absolute top-4 left-4 right-4 flex justify-between items-start">
        <div className="bg-black/70 rounded-lg p-3">
          <p className="text-white text-sm">
            {arSession.modelPlaced ? 'Tap to reposition' : 'Tap to place model'}
          </p>
        </div>
        
        <button
          onClick={onExitAR}
          className="bg-red-500/80 hover:bg-red-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Exit AR
        </button>
      </div>

      {/* AR measurement tools */}
      {arSession.measurements.length > 0 && (
        <div className="absolute bottom-20 left-4 right-4">
          <div className="bg-black/70 rounded-lg p-3">
            <h4 className="text-white font-medium mb-2">Measurements</h4>
            {arSession.measurements.map((measurement) => (
              <div key={measurement.id} className="text-white text-sm">
                {measurement.label}: {measurement.value.toFixed(2)} {measurement.unit}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AR controls */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
        <div className="flex gap-4 bg-black/70 rounded-lg p-3">
          <button className="text-white p-2 hover:bg-white/20 rounded-lg transition-colors">
            <Ruler className="w-5 h-5" />
          </button>
          <button className="text-white p-2 hover:bg-white/20 rounded-lg transition-colors">
            <Camera className="w-5 h-5" />
          </button>
          <button className="text-white p-2 hover:bg-white/20 rounded-lg transition-colors">
            <Share2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

// Main ModelViewer3D component with enhanced capabilities
const ModelViewer3D: React.FC<{
  model: ArchitecturalModel | null;
  className?: string;
  onARModeToggle?: (enabled: boolean) => void;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  onGLTFDataLoaded?: (gltfData: any, mechanicalAnalysis?: MechanicalAnalysis) => void;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
  calculatedProperties?: CalculatedProperties | null;
}> = ({
  model,
  className = '',
  onARModeToggle,
  onModelUpdate,
  onGLTFDataLoaded,
  onPropertiesCalculated,
  calculatedProperties
}) => {
  const [viewerState, setViewerState] = useState<ViewerState>({
    mode: '3d',
    model: model || undefined,
    camera: {
      position: { x: 10, y: 10, z: 10 },
      target: { x: 0, y: 0, z: 0 }
    },
    lighting: {
      ambient: 0.4,
      directional: 0.8
    },
    materials: {
      walls: '#e0e0e0',
      floors: '#f5f5f5',
      roofs: '#8B4513'
    }
  });

  const [arCapabilities, setArCapabilities] = useState<ARCapabilities>({
    supported: false,
    features: {
      hitTest: false,
      planeDetection: false,
      handTracking: false,
      imageTracking: false
    },
    device: {
      mobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
      orientation: window.innerWidth > window.innerHeight ? 'landscape' : 'portrait',
      camera: false,
      gyroscope: false,
      accelerometer: false
    }
  });

  const [arSession, setArSession] = useState<ARSession>({
    active: false,
    modelPlaced: false,
    measurements: []
  });

  const [showControls, setShowControls] = useState(true);
  const [autoRotate, setAutoRotate] = useState(true);
  const [resetTrigger, setResetTrigger] = useState(0);
  const [showLabels, setShowLabels] = useState(false);
  const [labelSize, setLabelSize] = useState(1); // Default label size multiplier
  const [mechanicalAnalysis, setMechanicalAnalysis] = useState<MechanicalAnalysis | null>(null);
  const [modelScale, setModelScale] = useState(1);
  const [minObjectSize, setMinObjectSize] = useState(1); // Default 1m³
  const [showScalingControls, setShowScalingControls] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handleCanvasCreated = useCallback(({ gl, scene, camera }: RootState) => {
    const canvas = gl.domElement;

    canvas.addEventListener('webglcontextlost', (event) => {
      console.warn('🔥 WebGL context lost, attempting to prevent and prepare for restoration');
      event.preventDefault();

      const sceneState = {
        objects: scene.children.length,
        lights: scene.children.filter(child => child.type.includes('Light')).length,
        hasModel: scene.children.some(child => child.userData?.isCADModel),
        timestamp: new Date().toISOString()
      };
      console.log('💾 Stored scene state:', sceneState);

      console.log('🔍 GL context info:', {
        drawingBufferWidth: gl.domElement.width,
        drawingBufferHeight: gl.domElement.height
      });
    });

    canvas.addEventListener('webglcontextrestored', () => {
      console.log('✅ WebGL context restored - beginning comprehensive restoration');

      try {
        gl.setSize(gl.domElement.width, gl.domElement.height);
        gl.physicallyCorrectLights = true;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.0;

        gl.clear();
        gl.render(scene, camera);

        setTimeout(() => {
          gl.render(scene, camera);
        }, 100);

        setTimeout(() => {
          gl.render(scene, camera);
        }, 500);

        console.log('✅ WebGL context restoration complete');
      } catch (error) {
        console.error('❌ Error during context restoration:', error);
      }
    });
  }, []);

  // Handle GLTF data loaded with mechanical analysis
  const handleGLTFDataLoaded = useCallback((gltfData: any, mechanicalAnalysisData?: MechanicalAnalysis) => {
    console.log('🔧 GLTF data loaded with mechanical analysis:', {
      hasGltfData: !!gltfData,
      hasMechanicalAnalysis: !!mechanicalAnalysisData,
      componentCount: mechanicalAnalysisData?.components?.length || 0
    });
    
    // Store mechanical analysis for labels
    if (mechanicalAnalysisData) {
      setMechanicalAnalysis(mechanicalAnalysisData);
    }
    
    // Pass to parent callback
    onGLTFDataLoaded?.(gltfData, mechanicalAnalysisData);
  }, [onGLTFDataLoaded]);

  // Track calculated GLTF URLs to prevent infinite loops
  const calculatedGltfUrls = useRef<Set<string>>(new Set());

  // Calculate CAD properties when model is available (only once per GLTF URL)
  useEffect(() => {
    const calculateProperties = async () => {
      const gltfUrl = model?.cadModel?.gltfUrl;
      
      if (gltfUrl && onPropertiesCalculated && !calculatedGltfUrls.current.has(gltfUrl)) {
        try {
          console.log('📊 Calculating accurate CAD properties from:', gltfUrl);
          calculatedGltfUrls.current.add(gltfUrl); // Mark as calculated to prevent re-calculation
          
          const properties = await cadPropertyCalculator.calculatePropertiesFromGLTF(
            gltfUrl,
            'pla' // Default material hint, could be made dynamic based on user input
          );
          
          console.log('✅ Properties calculated:', properties);
          onPropertiesCalculated(properties);
        } catch (error) {
          console.warn('⚠️ Property calculation failed:', error);
          calculatedGltfUrls.current.delete(gltfUrl); // Remove from calculated set on error
        }
      }
    };

    calculateProperties();
  }, [model?.cadModel?.gltfUrl]); // Removed onPropertiesCalculated from dependencies

  // Check WebGL support on mount
  useEffect(() => {
    const isSupported = checkWebGLSupport();
    if (!isSupported) {
      console.warn('WebGL not supported');
    }
  }, []);

  // Detect AR capabilities
  useEffect(() => {
    const detectARCapabilities = async () => {
      let supported = false;
      const features = {
        hitTest: false,
        planeDetection: false,
        handTracking: false,
        imageTracking: false
      };

      // Check WebXR support
      if ('xr' in navigator) {
        try {
          const isSupported = await (navigator as any).xr.isSessionSupported('immersive-ar');
          if (isSupported) {
            supported = true;
            features.hitTest = true;
            features.planeDetection = true;
          }
        } catch (error) {
          console.log('WebXR not fully supported:', error);
        }
      }

      // Check device capabilities
      const device = {
        ...arCapabilities.device,
        camera: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        gyroscope: 'DeviceOrientationEvent' in window,
        accelerometer: 'DeviceMotionEvent' in window
      };

      setArCapabilities(prev => ({
        ...prev,
        supported,
        features,
        device
      }));
    };

    detectARCapabilities();
  }, []);

  // Start AR session
  const startARSession = useCallback(async () => {
    if (!arCapabilities.supported) {
      alert('AR is not supported on this device');
      return;
    }

    try {
      // Initialize WebXR session
      if ('xr' in navigator) {
        const session = await (navigator as any).xr.requestSession('immersive-ar', {
          requiredFeatures: ['hit-test'],
          optionalFeatures: ['plane-detection', 'hand-tracking']
        });

        setArSession(prev => ({ ...prev, active: true }));
        setViewerState(prev => ({ ...prev, mode: 'ar' }));
        onARModeToggle?.(true);

        // Handle session end
        session.addEventListener('end', () => {
          setArSession(prev => ({ ...prev, active: false, modelPlaced: false }));
          setViewerState(prev => ({ ...prev, mode: '3d' }));
          onARModeToggle?.(false);
        });
      }
    } catch (error) {
      console.error('Failed to start AR session:', error);
      alert('Failed to start AR session. Please ensure you\'re using a compatible device and browser.');
    }
  }, [arCapabilities.supported, onARModeToggle]);

  // Exit AR session
  const exitARSession = useCallback(() => {
    setArSession(prev => ({ ...prev, active: false, modelPlaced: false }));
    setViewerState(prev => ({ ...prev, mode: '3d' }));
    onARModeToggle?.(false);
  }, [onARModeToggle]);

  // Handle model placement in AR
  const handleModelPlacement = useCallback((placement: ARPlacement) => {
    setArSession(prev => ({
      ...prev,
      modelPlaced: true,
      placement
    }));
  }, []);

  // Reset camera view
  const resetCamera = useCallback(() => {
    console.log('🎯 Reset camera triggered');
    setResetTrigger(prev => prev + 1);
  }, []);

  // Toggle controls visibility
  const toggleControls = useCallback(() => {
    setShowControls(prev => !prev);
  }, []);

  // Export model as image
  const exportImage = useCallback(() => {
    if (canvasRef.current) {
      const canvas = canvasRef.current;
      const link = document.createElement('a');
      link.download = `${model?.name || 'architectural-model'}.png`;
      link.href = canvas.toDataURL();
      link.click();
    }
  }, [model?.name]);

  if (!model) {
    return (
      <div className={`flex items-center justify-center h-96 bg-white/5 border border-white/20 rounded-2xl ${className}`}>
        <p className="text-gray-400">No model to display. Generate a model first.</p>
      </div>
    );
  }

  return (
    <div className={`relative bg-white/5 border border-white/20 rounded-2xl overflow-hidden ${className}`}>
      {/* Enhanced 3D Canvas with OrthographicCamera */}
      <ThreeJSErrorBoundary fallback={<ModelError onRetry={resetCamera} />}>
        <ManagedCanvas
          ref={canvasRef}
          shadows
          priority="high"
          className="w-full h-96"
          gl={{ 
            powerPreference: "high-performance",
            antialias: true,
            alpha: false,
            preserveDrawingBuffer: true
          }}
          dpr={[1, 2]}
          onCreated={handleCanvasCreated}
        >
          <Suspense fallback={
            <group>
              <mesh>
                <boxGeometry args={[2, 0.3, 2]} />
                <meshStandardMaterial color="#6366f1" emissive="#4338ca" emissiveIntensity={0.2} />
              </mesh>
              <Text position={[0, 0.5, 0]} fontSize={0.2} color="#ffffff" anchorX="center">
                Loading 3D Viewer...
              </Text>
            </group>
          }>
            <EnhancedProductScene 
              model={model} 
              onGLTFDataLoaded={handleGLTFDataLoaded}
              enableAutoRotate={autoRotate}
              enableZoom={true}
              resetTrigger={resetTrigger}
              showLabels={showLabels}
              mechanicalAnalysis={mechanicalAnalysis}
              labelSize={labelSize}
            />
          </Suspense>
        </ManagedCanvas>
      </ThreeJSErrorBoundary>

      {/* AR Overlay */}
      {arSession.active && (
        <AROverlay
          arSession={arSession}
          onPlaceModel={handleModelPlacement}
          onExitAR={exitARSession}
        />
      )}

      {/* Enhanced Controls Panel */}
      {showControls && !arSession.active && (
        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg p-3">
          <div className="flex flex-col gap-2">
            <button
              onClick={() => setAutoRotate(!autoRotate)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                autoRotate 
                  ? 'bg-green-600 text-white hover:bg-green-700' 
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              <RotateCcw className="w-4 h-4" />
              Auto Rotate
            </button>
            
            <button
              onClick={resetCamera}
              className="flex items-center gap-2 px-3 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm"
            >
              <Eye className="w-4 h-4" />
              Reset View
            </button>
            
            <button
              onClick={() => setShowLabels(!showLabels)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors text-sm ${
                showLabels 
                  ? 'bg-blue-600 text-white hover:bg-blue-700' 
                  : 'bg-gray-600 text-white hover:bg-gray-700'
              }`}
            >
              <Tag className="w-4 h-4" />
              Component Labels
            </button>
            
            {/* Label Size Slider - only show when labels are enabled */}
            {showLabels && (
              <div className="px-3 py-2 bg-gray-800 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-white text-xs">Label Size</span>
                  <span className="text-gray-400 text-xs">{labelSize.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0.5"
                  max="3"
                  step="0.1"
                  value={labelSize}
                  onChange={(e) => setLabelSize(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer slider"
                  style={{
                    background: `linear-gradient(to right, #3b82f6 0%, #3b82f6 ${((labelSize - 0.5) / 2.5) * 100}%, #4b5563 ${((labelSize - 0.5) / 2.5) * 100}%, #4b5563 100%)`
                  }}
                />
              </div>
            )}
            
            <button
              onClick={exportImage}
              className="flex items-center gap-2 px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors text-sm"
            >
              <Download className="w-4 h-4" />
              Export PNG
            </button>
          </div>
        </div>
      )}

      {/* Toggle Controls Button */}
      <button
        onClick={toggleControls}
        className="absolute top-4 left-4 bg-black/70 text-white p-2 rounded-lg hover:bg-black/80 transition-colors"
      >
        {showControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
      </button>

      {/* Enhanced Model Info */}
      <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-lg p-3 text-white text-sm">
        <h4 className="font-medium mb-1">
          {getModelProductName(model)}
        </h4>
        {model.cadModel ? (
          <>
            <p className="text-gray-300">
              CAD Model • {calculatedProperties?.volume?.displayValue || `${(model.cadModel.properties?.volume || 0).toFixed(1)} mL`}
            </p>
            <p className="text-gray-400 text-xs">
              {calculatedProperties?.specifications?.complexity || model.cadModel.properties?.complexity || 'Professional'} • AgenticadML Engine
            </p>
            {model.cadModel.gltfUrl && (
              <p className="text-green-400 text-xs">✓ 360° Interactive View</p>
            )}
          </>
        ) : (
          <>
            <p className="text-gray-300">{model.rooms?.length || 0} components</p>
            <p className="text-gray-400 text-xs">{model.style} style</p>
          </>
        )}
      </div>

      {/* View Mode Indicator */}
      <div className="absolute bottom-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg px-3 py-2 text-white text-sm">
        CAD VIEWER • 360°
      </div>
    </div>
  );
};

export default ModelViewer3D; 
