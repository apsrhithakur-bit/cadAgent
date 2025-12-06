import React, { useState, useEffect, useRef, useCallback, Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import ManagedCanvas from './ManagedCanvas';
import * as THREE from 'three';
import { 
  Camera, 
  ArrowLeft, 
  Smartphone, 
  AlertTriangle, 
  Loader2,
  Eye,
  EyeOff,
  RotateCcw,
  Move3D,
  Monitor,
  Settings
} from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName } from '../utils/productNameExtractor';

interface HybridARViewerProps {
  model: ArchitecturalModel | null;
  onClose: (e?: React.MouseEvent) => void;
  className?: string;
}

// Device detection utilities
const useDeviceDetection = () => {
  const [deviceInfo, setDeviceInfo] = useState({
    isIOS: false,
    isAndroid: false,
    isMobile: false,
    supportsWebXR: false,
    supportsModelViewer: false
  });

  useEffect(() => {
    const userAgent = navigator.userAgent.toLowerCase();
    const isIOS = /iphone|ipad|ipod/.test(userAgent);
    const isAndroid = /android/.test(userAgent);
    const isMobile = /mobile|tablet|android|iphone|ipad|ipod/.test(userAgent);
    
    // Check WebXR support
    const supportsWebXR = 'xr' in navigator && !isIOS; // iOS doesn't support WebXR yet
    
    // Model-viewer works on both platforms
    const supportsModelViewer = true;

    setDeviceInfo({
      isIOS,
      isAndroid,
      isMobile,
      supportsWebXR,
      supportsModelViewer
    });
  }, []);

  return deviceInfo;
};

// Model Scene Component for fallback
const ModelScene: React.FC<{ 
  modelUrl?: string; 
  scale: number; 
  position: [number, number, number];
  rotation: [number, number, number];
}> = ({ modelUrl, scale, position, rotation }) => {
  const modelRef = useRef<THREE.Group>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Only load GLTF if modelUrl exists and is valid
  let gltfScene = null;
  let error = null;
  
  try {
    if (modelUrl && modelUrl.trim() !== '') {
      const gltfResult = useGLTF(modelUrl);
      gltfScene = gltfResult.scene;
      error = null;
    }
  } catch (e) {
    error = e;
    console.error('GLTF loading error:', e);
  }

  useEffect(() => {
    if (gltfScene && modelRef.current) {
      try {
        // Clear previous model
        modelRef.current.clear();
        
        // Clone the scene to avoid conflicts
        const modelClone = gltfScene.clone();
        
        // Configure materials for better visibility
        modelClone.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.material) {
              const material = child.material as THREE.MeshStandardMaterial;
              material.metalness = 0.1;
              material.roughness = 0.8;
              material.envMapIntensity = 0.5;
            }
          }
        });
        
        modelRef.current.add(modelClone);
        
        // Center the model
        const box = new THREE.Box3().setFromObject(modelClone);
        const center = box.getCenter(new THREE.Vector3());
        modelClone.position.sub(center);
        
        setIsLoaded(true);
        setLoadError(null);
      } catch (e) {
        console.error('Model setup error:', e);
        setLoadError('Failed to setup 3D model');
      }
    }
  }, [gltfScene]);

  // Update model transform
  useEffect(() => {
    if (modelRef.current && isLoaded) {
      modelRef.current.position.set(...position);
      modelRef.current.rotation.set(...rotation);
      modelRef.current.scale.setScalar(scale / 100);
    }
  }, [position, rotation, scale, isLoaded]);

  if (error || loadError) {
    return (
      <Html center>
        <div className="text-red-400 text-center bg-black/70 p-4 rounded-lg">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
          <div className="text-sm">Failed to load 3D model</div>
        </div>
      </Html>
    );
  }

  if (!isLoaded && modelUrl) {
    return (
      <Html center>
        <div className="text-white text-center bg-black/70 p-4 rounded-lg">
          <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
          <div className="text-sm">Loading 3D model...</div>
        </div>
      </Html>
    );
  }

  return (
    <group ref={modelRef}>
      {/* Ground plane for reference */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[2, 2]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
      
      {/* Show placeholder if no model */}
      {!modelUrl && (
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
          <meshStandardMaterial color="#00ffff" />
        </mesh>
      )}
    </group>
  );
};

// Main Hybrid AR Viewer Component
const HybridARViewer: React.FC<HybridARViewerProps> = ({ model, onClose, className = '' }) => {
  const [arMethod, setArMethod] = useState<'auto' | 'modelviewer' | 'webxr' | 'fallback'>('auto');
  const [showControls, setShowControls] = useState(true);
  const [scale, setScale] = useState(100);
  const [position, setPosition] = useState<[number, number, number]>([0, 0, -1]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [isModelViewerLoaded, setIsModelViewerLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const modelViewerRef = useRef<any>(null);
  const deviceInfo = useDeviceDetection();

  const getModelUrl = useCallback(() => {
    return model?.cadModel?.gltfUrl || '';
  }, [model]);

  const getProductName = useCallback(() => {
    return getModelProductName(model);
  }, [model]);

  const getModelSpecs = useCallback(() => {
    if (!model) return null;
    
    return {
      name: getProductName(),
      dimensions: model.productSpecs?.specifications?.dimensions || model.cadModel?.properties?.dimensions,
      materials: model.productSpecs?.manufacturing?.materials,
      description: model.description || model.productSpecs?.description,
      originalPrompt: model.cadModel?.originalPrompt || model.cadModel?.prompt,
      volume: model.cadModel?.properties?.volume,
      surfaceArea: model.cadModel?.properties?.surfaceArea,
      complexity: model.cadModel?.properties?.complexity
    };
  }, [model, getProductName]);

  // Load model-viewer for compatible devices
  useEffect(() => {
    if (deviceInfo.supportsModelViewer && (arMethod === 'auto' || arMethod === 'modelviewer')) {
      const loadModelViewer = async () => {
        if (customElements.get('model-viewer')) {
          setIsModelViewerLoaded(true);
          return;
        }

        try {
          const script = document.createElement('script');
          script.type = 'module';
          script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
          
          script.onload = () => {
            console.log('✅ Model Viewer loaded for hybrid AR');
            setIsModelViewerLoaded(true);
          };
          
          script.onerror = () => {
            console.error('❌ Failed to load Model Viewer, falling back');
            setArMethod('fallback');
          };
          
          document.head.appendChild(script);
        } catch (error) {
          console.error('❌ Error loading Model Viewer:', error);
          setArMethod('fallback');
        }
      };

      loadModelViewer();
    }
  }, [deviceInfo.supportsModelViewer, arMethod]);

  // Determine best AR method
  useEffect(() => {
    if (arMethod !== 'auto') return;

    if (deviceInfo.isIOS && deviceInfo.isMobile) {
      setArMethod('modelviewer'); // Use Quick Look on iOS
    } else if (deviceInfo.isAndroid && deviceInfo.supportsWebXR) {
      setArMethod('modelviewer'); // Use WebXR via model-viewer on Android
    } else {
      setArMethod('fallback'); // Use Three.js fallback for desktop/unsupported
    }
  }, [deviceInfo, arMethod]);

  const handleResetPosition = () => {
    setPosition([0, 0, -1]);
    setRotation([0, 0, 0]);
    setScale(100);
  };

  const handleRotateModel = () => {
    setRotation(prev => [prev[0], prev[1] + Math.PI / 2, prev[2]]);
  };

  if (!model) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <p>No 3D model available for AR visualization</p>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose(e);
            }}
            className="mt-4 px-4 py-2 horizon-button-primary"
          >
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const modelUrl = getModelUrl();
  const specs = getModelSpecs();

  // Render Model Viewer AR (iOS Quick Look + Android WebXR)
  if ((arMethod === 'modelviewer' || arMethod === 'auto') && isModelViewerLoaded && modelUrl) {
    return (
      <div className={`${className} relative`}>
        <div className="cosmic-panel rounded-2xl p-8">
          {/* Header with context preservation */}
          <div className="text-center max-w-2xl mx-auto mb-8">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full horizon-card flex items-center justify-center">
              <Camera className="w-10 h-10 text-white" />
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-4">
              Experience Your {specs?.name} in Native AR
            </h3>
            
            <p className="text-gray-300 text-lg mb-4 leading-relaxed">
              {specs?.originalPrompt && (
                <span className="text-cyan-400 italic block mb-2">
                  "{specs.originalPrompt}"
                </span>
              )}
              View your {specs?.name.toLowerCase()} in real-world scale using {deviceInfo.isIOS ? 'Quick Look' : 'WebXR'} technology.
            </p>

            {/* Enhanced Model Context */}
            {specs && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <div className="p-4 rounded-xl horizon-card text-left">
                  <h4 className="font-semibold text-white text-sm mb-2">Product Details</h4>
                  <div className="space-y-1 text-xs text-gray-300">
                    <div className="font-medium text-cyan-300">{specs.name}</div>
                    {specs.complexity && (
                      <div>Complexity: {specs.complexity}</div>
                    )}
                    {specs.dimensions && (
                      <div>
                        {Math.round(specs.dimensions.length || 0)}×
                        {Math.round(specs.dimensions.width || 0)}×
                        {Math.round(specs.dimensions.height || 0)}cm
                      </div>
                    )}
                  </div>
                </div>
                
                <div className="p-4 rounded-xl horizon-card text-left">
                  <h4 className="font-semibold text-white text-sm mb-2">Materials & Build</h4>
                  <div className="space-y-1 text-xs text-gray-300">
                    {specs.materials && specs.materials[0] ? (
                      <div>Material: {specs.materials[0]}</div>
                    ) : (
                      <div>Material: PLA Plastic</div>
                    )}
                    {specs.volume && (
                      <div>Volume: {Math.round(specs.volume)} cm³</div>
                    )}
                    {specs.surfaceArea && (
                      <div>Surface: {Math.round(specs.surfaceArea)} cm²</div>
                    )}
                  </div>
                </div>
                
                <div className="p-4 rounded-xl horizon-card text-left">
                  <h4 className="font-semibold text-white text-sm mb-2">AR Platform</h4>
                  <div className="space-y-1 text-xs text-gray-300">
                    <div className="flex items-center gap-1">
                      {deviceInfo.isIOS ? <Smartphone className="w-3 h-3" /> : <Monitor className="w-3 h-3" />}
                      {deviceInfo.isIOS ? 'iOS Quick Look' : 'Android WebXR'}
                    </div>
                    <div>• Real-world scale</div>
                    <div>• Surface detection</div>
                    <div>• Native performance</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Model Viewer */}
          <div className="relative mb-8">
            <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 relative" style={{ minHeight: '400px' }}>
              <model-viewer
                ref={modelViewerRef}
                src={modelUrl}
                alt={`AR model of ${specs?.name} - ${specs?.originalPrompt || specs?.description}`}
                ar
                ar-modes="webxr scene-viewer quick-look"
                camera-controls
                touch-action="pan-y"
                auto-rotate
                auto-rotate-delay="3000"
                shadow-intensity="1"
                environment-image="neutral"
                exposure="1"
                shadow-softness="0.5"
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'transparent'
                }}
              />
              
              {/* Context overlay */}
              {showControls && specs && (
                <div className="absolute bottom-4 left-4 cosmic-panel rounded-xl p-4 text-white text-sm max-w-64">
                  <div className="space-y-2">
                    <div className="font-semibold text-cyan-300">{specs.name}</div>
                    {specs.originalPrompt && (
                      <div className="text-gray-300 text-xs italic">
                        Original: "{specs.originalPrompt.substring(0, 60)}..."
                      </div>
                    )}
                    {specs.description && (
                      <div className="text-gray-300 text-xs line-clamp-2">
                        {specs.description}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AR Ready indicator */}
              <div className="absolute top-4 right-4">
                <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm border border-green-500/30 flex items-center gap-2">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  Native AR Ready
                </div>
              </div>

              {/* Controls toggle */}
              <div className="absolute top-4 left-4">
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowControls(!showControls);
                  }}
                  className="p-2 cosmic-panel text-white transition-colors"
                >
                  {showControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Instructions with method selection */}
          <div className="text-center space-y-4">
            <div className="text-sm text-gray-300 mb-4">
              <strong className="text-white">Instructions:</strong> Tap the AR button in the 3D viewer above, then point your camera at a flat surface to place your {specs?.name.toLowerCase()}.
            </div>

            {/* Method selector for debugging/preference */}
            <div className="flex items-center justify-center gap-4 mb-4">
              <button
                onClick={() => setArMethod('modelviewer')}
                className={`px-3 py-1 text-xs rounded ${arMethod === 'modelviewer' ? 'horizon-button-primary text-white' : 'cosmic-panel text-gray-300'}`}
              >
                Native AR
              </button>
              <button
                onClick={() => setArMethod('fallback')}
                className={`px-3 py-1 text-xs rounded ${arMethod === 'fallback' ? 'horizon-button-primary text-white' : 'cosmic-panel text-gray-300'}`}
              >
                Fallback Mode
              </button>
            </div>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose(e);
              }}
              className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4 inline mr-2" />
              Back to 3D View
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Fallback Three.js AR (for desktop/unsupported devices)
  return (
    <div className={`${className} relative`}>
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
        <div className="text-center max-w-2xl mx-auto mb-8">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-orange-400 to-red-400 flex items-center justify-center">
            <Monitor className="w-10 h-10 text-white" />
          </div>
          
          <h3 className="text-2xl font-bold text-white mb-4">
            Preview Your {specs?.name} - AR Simulation
          </h3>
          
          <p className="text-gray-300 text-lg mb-4 leading-relaxed">
            {specs?.originalPrompt && (
              <span className="text-orange-400 italic block mb-2">
                "{specs.originalPrompt}"
              </span>
            )}
            AR simulation mode for desktop or unsupported devices. For full AR experience, use Chrome on Android or Safari on iOS.
          </p>

          {/* Model Context in fallback mode */}
          {specs && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="p-4 rounded-xl horizon-card text-left">
                <h4 className="font-semibold text-white text-sm mb-2">Your Design</h4>
                <div className="space-y-1 text-xs text-gray-300">
                  <div className="font-medium text-orange-300">{specs.name}</div>
                  {specs.originalPrompt && (
                    <div className="italic">From: "{specs.originalPrompt.substring(0, 40)}..."</div>
                  )}
                  {specs.dimensions && (
                    <div>
                      Size: {Math.round(specs.dimensions.length || 0)}×
                      {Math.round(specs.dimensions.width || 0)}×
                      {Math.round(specs.dimensions.height || 0)}cm
                    </div>
                  )}
                </div>
              </div>
              
              <div className="p-4 rounded-xl horizon-card text-left">
                <h4 className="font-semibold text-white text-sm mb-2">Simulation Mode</h4>
                <div className="space-y-1 text-xs text-gray-300">
                  <div>• Interactive 3D preview</div>
                  <div>• Scale and rotation controls</div>
                  <div>• Desktop compatible</div>
                  <div>• Model context preserved</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Three.js Fallback Viewer */}
        <div className="relative mb-8">
          <div className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 relative">
            <ManagedCanvas
              camera={{ position: [0, 1, 2], fov: 60 }}
              style={{ width: '100%', height: '100%' }}
              gl={{ alpha: true }}
            >
              <ambientLight intensity={0.6} />
              <directionalLight
                position={[10, 10, 5]}
                intensity={1}
                castShadow
              />
              
              <Suspense fallback={null}>
                <ModelScene
                  modelUrl={modelUrl}
                  scale={scale}
                  position={position}
                  rotation={rotation}
                />
              </Suspense>
              
              <OrbitControls
                enablePan={false}
                enableZoom={true}
                enableRotate={true}
                maxPolarAngle={Math.PI / 2}
              />
            </ManagedCanvas>

            {/* Context overlay for fallback */}
            {showControls && specs && (
              <div className="absolute bottom-4 left-4 cosmic-panel rounded-xl p-4 text-white text-sm max-w-64">
                <div className="space-y-2">
                  <div className="font-semibold text-orange-300">{specs.name}</div>
                  {specs.originalPrompt && (
                    <div className="text-gray-300 text-xs italic">
                      "{specs.originalPrompt.substring(0, 50)}..."
                    </div>
                  )}
                  <div className="text-gray-300 text-xs">
                    AR Simulation - Scale: {scale}%
                  </div>
                </div>
              </div>
            )}

            {/* Simulation controls */}
            {showControls && (
              <div className="absolute bottom-4 right-4">
                <div className="cosmic-panel rounded-xl p-4 flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-white text-sm">Scale:</span>
                    <input
                      type="range"
                      min="50"
                      max="150"
                      value={scale}
                      onChange={(e) => setScale(Number(e.target.value))}
                      className="w-20 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                    />
                    <span className="text-white text-sm w-12">{scale}%</span>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRotateModel}
                      className="p-2 horizon-card text-white transition-colors"
                      title="Rotate 90°"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleResetPosition}
                      className="p-2 horizon-card text-white transition-colors"
                      title="Reset Position"
                    >
                      <Move3D className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Controls toggle */}
            <div className="absolute top-4 left-4">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowControls(!showControls);
                }}
                className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
              >
                {showControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Fallback indicator */}
            <div className="absolute top-4 right-4">
              <div className="bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-sm border border-orange-500/30 flex items-center gap-2">
                <Settings className="w-3 h-3" />
                Simulation Mode
              </div>
            </div>
          </div>
        </div>

        {/* Method selection and back button */}
        <div className="text-center space-y-4">
          <div className="flex items-center justify-center gap-4 mb-4">
            <button
              onClick={() => setArMethod('modelviewer')}
              className={`px-3 py-1 text-xs rounded ${arMethod === 'modelviewer' ? 'horizon-button-primary text-white' : 'cosmic-panel text-gray-300'}`}
            >
              Try Native AR
            </button>
            <button
              onClick={() => setArMethod('fallback')}
              className={`px-3 py-1 text-xs rounded ${arMethod === 'fallback' ? 'horizon-button-primary border-orange-400 text-white' : 'cosmic-panel text-gray-300'}`}
            >
              Simulation Mode
            </button>
          </div>

          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose(e);
            }}
            className="px-6 py-2 text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Back to 3D View
          </button>
        </div>
      </div>
    </div>
  );
};

export default HybridARViewer;
