import React, { useState, useEffect, useRef, Suspense, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, useGLTF, Text, Html } from '@react-three/drei';
import ManagedCanvas from './ManagedCanvas';
import * as THREE from 'three';
import { 
  Camera, 
  Smartphone, 
  Download, 
  Settings, 
  AlertTriangle, 
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Move3D,
  Crosshair,
  Ruler,
  Eye,
  EyeOff
} from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { WebXRManager, FallbackARManager, initializeWebXR, ARCapabilities } from '../lib/webxr-setup';
import { getModelProductName } from '../utils/productNameExtractor';

interface EnhancedARViewerProps {
  model: ArchitecturalModel | null;
  onClose: (e?: React.MouseEvent) => void;
  className?: string;
}

// AR Scene Component that renders the 3D model
const ARScene: React.FC<{ 
  modelUrl?: string; 
  scale: number; 
  position: [number, number, number];
  rotation: [number, number, number];
  isWebXR: boolean;
}> = ({ modelUrl, scale, position, rotation, isWebXR }) => {
  const { scene, camera, gl } = useThree();
  const modelRef = useRef<THREE.Group>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load GLTF model - only if modelUrl exists
  const gltfResult = modelUrl ? useGLTF(modelUrl) : { scene: null, error: null };
  const { scene: gltfScene, error } = gltfResult;

  useEffect(() => {
    if (gltfScene && modelRef.current) {
      // Clear previous model
      modelRef.current.clear();
      
      // Clone the scene to avoid conflicts
      const modelClone = gltfScene.clone();
      
      // Ensure materials are properly configured for AR
      modelClone.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          // Make materials more visible in AR environments
          if (child.material) {
            const material = child.material as THREE.MeshStandardMaterial;
            material.metalness = 0.1;
            material.roughness = 0.8;
            material.envMapIntensity = 0.5;
          }
        }
      });
      
      modelRef.current.add(modelClone);
      setIsLoaded(true);

      // Center the model
      const box = new THREE.Box3().setFromObject(modelClone);
      const center = box.getCenter(new THREE.Vector3());
      modelClone.position.sub(center);
    }
  }, [gltfScene]);

  // Handle WebXR rendering
  useFrame(() => {
    if (modelRef.current && isLoaded) {
      modelRef.current.position.set(...position);
      modelRef.current.rotation.set(...rotation);
      modelRef.current.scale.setScalar(scale / 100);
    }
  });

  if (error) {
    return (
      <Html center>
        <div className="text-red-400 text-center">
          <AlertTriangle className="w-6 h-6 mx-auto mb-2" />
          <div>Failed to load 3D model</div>
        </div>
      </Html>
    );
  }

  return (
    <group ref={modelRef}>
      {!isLoaded && (
        <Html center>
          <div className="text-white text-center">
            <Loader2 className="w-6 h-6 mx-auto mb-2 animate-spin" />
            <div>Loading 3D model...</div>
          </div>
        </Html>
      )}
      
      {/* Ground plane for reference */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <planeGeometry args={[2, 2]} />
        <shadowMaterial opacity={0.2} />
      </mesh>
      
      {/* Placement helper */}
      {!isWebXR && (
        <group>
          <mesh position={[0, 0.01, 0]}>
            <ringGeometry args={[0.3, 0.35, 32]} />
            <meshBasicMaterial color="#00ffff" transparent opacity={0.5} />
          </mesh>
          <Text
            position={[0, 0.5, 0]}
            fontSize={0.1}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
          >
            Tap to place
          </Text>
        </group>
      )}
    </group>
  );
};

// Main AR Viewer Component
const EnhancedARViewer: React.FC<EnhancedARViewerProps> = ({ model, onClose, className = '' }) => {
  const [isARActive, setIsARActive] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [scale, setScale] = useState(100);
  const [position, setPosition] = useState<[number, number, number]>([0, 0, -1]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [capabilities, setCapabilities] = useState<ARCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showControls, setShowControls] = useState(true);
  const [measurements, setMeasurements] = useState<Array<{id: string, points: THREE.Vector3[], distance: number}>>([]);
  const [isPlaced, setIsPlaced] = useState(false);
  
  const webxrManager = useRef<WebXRManager | null>(null);
  const fallbackManager = useRef<FallbackARManager | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize AR capabilities
  useEffect(() => {
    const initCapabilities = async () => {
      try {
        const caps = await initializeWebXR();
        setCapabilities(caps);
        console.log('🔍 Enhanced AR Capabilities:', caps);
      } catch (error) {
        console.error('❌ Failed to initialize enhanced AR:', error);
        setError('AR initialization failed');
      }
    };
    initCapabilities();
  }, []);

  const getModelUrl = useCallback(() => {
    return model?.cadModel?.gltfUrl || '';
  }, [model]);

  const getProductName = useCallback(() => {
    return getModelProductName(model);
  }, [model]);

  const handleStartAR = async () => {
    if (!capabilities || !model) return;
    
    setIsLoading(true);
    setError(null);

    try {
      if (capabilities.webxr && capabilities.webxrImmersive && canvasRef.current) {
        // Use WebXR for immersive AR
        webxrManager.current = new WebXRManager();
        await webxrManager.current.startARSession(canvasRef.current, {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['hit-test', 'plane-detection', 'anchors']
        });
        console.log('✅ Enhanced WebXR AR session started');
      } else if (capabilities.camera && containerRef.current) {
        // Use fallback camera AR
        fallbackManager.current = new FallbackARManager();
        await fallbackManager.current.startARSession(containerRef.current);
        console.log('✅ Enhanced fallback AR session started');
      } else {
        throw new Error('No AR capabilities available on this device');
      }
      
      setIsARActive(true);
      setIsPlaced(false);
    } catch (error) {
      console.error('❌ Failed to start enhanced AR session:', error);
      setError(error instanceof Error ? error.message : 'Failed to start AR session');
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopAR = async () => {
    try {
      if (webxrManager.current) {
        await webxrManager.current.endARSession();
        webxrManager.current = null;
      }
      if (fallbackManager.current) {
        await fallbackManager.current.endARSession();
        fallbackManager.current = null;
      }
      setIsARActive(false);
      setIsPlaced(false);
      if (isFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('❌ Error stopping enhanced AR session:', error);
    }
  };

  const handlePlaceModel = () => {
    // In real WebXR, this would use hit-test results
    // For now, we simulate placing the model
    setIsPlaced(true);
    console.log('📍 Model placed in AR space');
  };

  const handleResetPosition = () => {
    setPosition([0, 0, -1]);
    setRotation([0, 0, 0]);
    setScale(100);
    setIsPlaced(false);
  };

  const handleRotateModel = () => {
    setRotation(prev => [prev[0], prev[1] + Math.PI / 2, prev[2]]);
  };

  const handleToggleFullscreen = async () => {
    try {
      if (!isFullscreen && containerRef.current) {
        await containerRef.current.requestFullscreen();
        setIsFullscreen(true);
      } else if (isFullscreen) {
        await document.exitFullscreen();
        setIsFullscreen(false);
      }
    } catch (error) {
      console.error('❌ Fullscreen toggle failed:', error);
    }
  };

  const handleCapturePhoto = async () => {
    if (canvasRef.current) {
      const link = document.createElement('a');
      link.download = `${getProductName()}_AR_${Date.now()}.png`;
      link.href = canvasRef.current.toDataURL();
      link.click();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      handleStopAR();
    };
  }, []);

  if (!model) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <p>No 3D model available for AR visualization</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} relative`}>
      {!isARActive ? (
        /* AR Setup Screen */
        <div className="cosmic-panel rounded-2xl p-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full horizon-card flex items-center justify-center">
              <Camera className="w-10 h-10 text-white" />
            </div>
            
            <h3 className="text-2xl font-bold text-white mb-4">
              Experience Your {getProductName()} in Augmented Reality
            </h3>
            
            <p className="text-gray-300 text-lg mb-8 leading-relaxed">
              Place your {getProductName().toLowerCase()} in your real environment. 
              See how it looks and fits in your actual space with accurate scale and lighting.
            </p>
            
            {error && (
              <div className="mb-6 p-4 horizon-card border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                  <span>{error}</span>
                </div>
              </div>
            )}
            
            {capabilities && (
              <div className="mb-6 p-4 horizon-card border border-blue-500/20 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-400 mb-3">AR Capabilities:</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className={`flex items-center gap-2 ${capabilities.webxr ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${capabilities.webxr ? 'bg-green-400' : 'bg-gray-500'}`} />
                    WebXR Support
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.camera ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${capabilities.camera ? 'bg-green-400' : 'bg-gray-500'}`} />
                    Camera Access
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.webxrImmersive ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${capabilities.webxrImmersive ? 'bg-green-400' : 'bg-gray-500'}`} />
                    Immersive AR
                  </div>
                  <div className={`flex items-center gap-2 ${capabilities.deviceOrientation ? 'text-green-400' : 'text-gray-500'}`}>
                    <div className={`w-2 h-2 rounded-full ${capabilities.deviceOrientation ? 'bg-green-400' : 'bg-gray-500'}`} />
                    Device Sensors
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              <div className="p-4 rounded-xl horizon-card text-center">
                <Smartphone className="w-6 h-6 text-cyan-400 mb-2 mx-auto" />
                <h4 className="font-semibold text-white text-sm mb-1">Mobile Optimized</h4>
                <p className="text-gray-400 text-xs">Best on phone/tablet</p>
              </div>
              <div className="p-4 rounded-xl horizon-card text-center">
                <Eye className="w-6 h-6 text-purple-400 mb-2 mx-auto" />
                <h4 className="font-semibold text-white text-sm mb-1">True Scale</h4>
                <p className="text-gray-400 text-xs">Accurate dimensions</p>
              </div>
              <div className="p-4 rounded-xl horizon-card text-center">
                <Crosshair className="w-6 h-6 text-green-400 mb-2 mx-auto" />
                <h4 className="font-semibold text-white text-sm mb-1">Precise Placement</h4>
                <p className="text-gray-400 text-xs">Real world positioning</p>
              </div>
            </div>

            <button
              onClick={handleStartAR}
              disabled={isLoading || !capabilities?.camera || !getModelUrl()}
              className="px-8 py-4 horizon-button-primary flex items-center gap-2 mx-auto disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Initializing AR...
                </>
              ) : (
                <>
                  <Camera className="w-5 h-5" />
                  Start AR Experience
                </>
              )}
            </button>
            
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onClose(e);
              }}
              className="mt-4 px-6 py-2 text-gray-400 hover:text-white transition-colors"
            >
              Back to 3D View
            </button>
          </div>
        </div>
      ) : (
        /* Active AR View */
        <div className="relative">
          {/* AR Container */}
          <div 
            ref={containerRef}
            className={`relative bg-black overflow-hidden ${isFullscreen ? 'fixed inset-0 z-50' : 'aspect-video rounded-2xl'}`}
          >
            {/* 3D Canvas for AR */}
            <ManagedCanvas
              ref={canvasRef as any}
              camera={{ position: [0, 1, 2], fov: 60 }}
              style={{ width: '100%', height: '100%' }}
              priority="high"
              onCreated={({ gl, scene }) => {
                gl.xr.enabled = !!webxrManager.current;
                gl.shadowMap.enabled = true;
                gl.shadowMap.type = THREE.PCFSoftShadowMap;
                scene.background = null;
              }}
            >
              <ambientLight intensity={0.6} />
              <directionalLight
                position={[10, 10, 5]}
                intensity={1}
                castShadow
                shadow-mapSize-width={2048}
                shadow-mapSize-height={2048}
              />
              
              <Suspense fallback={null}>
                <ARScene
                  modelUrl={getModelUrl()}
                  scale={scale}
                  position={position}
                  rotation={rotation}
                  isWebXR={!!webxrManager.current}
                />
              </Suspense>
              
              {!webxrManager.current && (
                <OrbitControls
                  enablePan={false}
                  enableZoom={true}
                  enableRotate={true}
                  maxPolarAngle={Math.PI / 2}
                />
              )}
            </ManagedCanvas>
            
            {/* AR UI Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top Bar */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-green-500 text-white text-sm rounded-full flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    {webxrManager.current ? 'WebXR AR' : 'Camera AR'}
                  </div>
                  <div className="px-3 py-1 bg-black/50 text-white text-sm rounded-lg">
                    {getProductName()}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowControls(!showControls)}
                    className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                  >
                    {showControls ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={handleToggleFullscreen}
                    className="p-2 bg-black/50 text-white rounded-lg hover:bg-black/70 transition-colors"
                  >
                    {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleStopAR();
                    }}
                    className="px-3 py-2 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                  >
                    Exit AR
                  </button>
                </div>
              </div>
              
              {/* Center Placement Guide */}
              {!isPlaced && !webxrManager.current && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                  <button
                    onClick={handlePlaceModel}
                    className="horizon-button-primary text-white p-4 rounded-full"
                  >
                    <Crosshair className="w-8 h-8" />
                  </button>
                </div>
              )}
              
              {/* Bottom Controls */}
              {showControls && (
                <div className="absolute bottom-4 left-4 right-4 pointer-events-auto">
                  <div className="flex items-center justify-center gap-4">
                    <div className="cosmic-panel rounded-xl p-4 flex items-center gap-4">
                      {/* Scale Control */}
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
                      
                      {/* Action Buttons */}
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
                        <button
                          onClick={handleCapturePhoto}
                          className="p-2 horizon-button-primary text-white"
                          title="Capture Photo"
                        >
                          <Camera className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              {/* Model Info */}
              <div className="absolute top-20 right-4 pointer-events-auto">
                <div className="cosmic-panel rounded-xl p-3 text-white text-sm max-w-48">
                  <div className="space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-300">Scale:</span>
                      <span>{scale}%</span>
                    </div>
                    {model?.productSpecs?.manufacturing?.materials && (
                      <div className="flex justify-between">
                        <span className="text-gray-300">Material:</span>
                        <span className="truncate ml-2">{model.productSpecs.manufacturing.materials[0]}</span>
                      </div>
                    )}
                    {model?.productSpecs?.specifications?.dimensions && (
                      <div className="text-gray-300 text-xs mt-2">
                        Dimensions: {Math.round(model.productSpecs.specifications.dimensions.length)}×
                        {Math.round(model.productSpecs.specifications.dimensions.width)}×
                        {Math.round(model.productSpecs.specifications.dimensions.height)}cm
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Placement Tips */}
              {!isPlaced && (
                <div className="absolute bottom-20 left-4 pointer-events-none">
                  <div className="cosmic-panel rounded-xl p-3 text-white text-sm max-w-64">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-2 h-2 bg-cyan-400 rounded-full animate-pulse" />
                      <span className="font-semibold">Placement Tips:</span>
                    </div>
                    <ul className="space-y-1 text-xs text-gray-300">
                      <li>• Find a flat, well-lit surface</li>
                      <li>• Move slowly to detect the environment</li>
                      <li>• Tap the crosshair to place your model</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EnhancedARViewer;
