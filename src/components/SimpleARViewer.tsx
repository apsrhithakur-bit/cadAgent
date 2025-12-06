import React, { useState, useEffect, useRef, Suspense } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF, Html } from '@react-three/drei';
import ManagedCanvas from './ManagedCanvas';
import * as THREE from 'three';
import { 
  Camera, 
  AlertTriangle, 
  Loader2,
  RotateCcw,
  Move3D,
  Crosshair,
  Eye,
  EyeOff,
  ArrowLeft
} from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName } from '../utils/productNameExtractor';

interface SimpleARViewerProps {
  model: ArchitecturalModel | null;
  onClose: (e?: React.MouseEvent) => void;
  className?: string;
}

// Simple 3D Scene Component
const Simple3DScene: React.FC<{ 
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
        
        // Ensure materials are properly configured
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
          <div className="text-xs text-gray-400 mt-1">
            {loadError || 'GLTF loading error'}
          </div>
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
      
      {/* Placement helper */}
      <group>
        <mesh position={[0, 0.01, 0]}>
          <ringGeometry args={[0.3, 0.35, 32]} />
          <meshBasicMaterial color="#00ffff" transparent opacity={0.5} />
        </mesh>
      </group>
      
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

// Main Simple AR Viewer Component
const SimpleARViewer: React.FC<SimpleARViewerProps> = ({ model, onClose, className = '' }) => {
  const [isARActive, setIsARActive] = useState(false);
  const [scale, setScale] = useState(100);
  const [position, setPosition] = useState<[number, number, number]>([0, 0, -1]);
  const [rotation, setRotation] = useState<[number, number, number]>([0, 0, 0]);
  const [showControls, setShowControls] = useState(true);
  const [isPlaced, setIsPlaced] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const getModelUrl = () => {
    return model?.cadModel?.gltfUrl || '';
  };

  const getProductName = () => {
    return getModelProductName(model);
  };

  const handleStartAR = async () => {
    console.log('🚀 Starting Simple AR Experience');
    
    // Try to get camera access for mobile devices
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' }
        });
        setCameraStream(stream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        console.log('✅ Camera access granted');
      } catch (error) {
        console.log('📷 Camera not available, using simulated AR');
        // Continue with desktop simulation
      }
    }
    
    setIsARActive(true);
    setIsPlaced(false);
  };

  const handleStopAR = () => {
    console.log('🛑 Stopping AR Experience');
    
    // Stop camera stream
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => track.stop());
      setCameraStream(null);
    }
    
    setIsARActive(false);
    setIsPlaced(false);
  };

  const handlePlaceModel = () => {
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

  const handleCapturePhoto = () => {
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
      if (cameraStream) {
        cameraStream.getTracks().forEach(track => track.stop());
      }
    };
  }, [cameraStream]);

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
              Experience Your {getProductName()} in AR
            </h3>
            
            <p className="text-gray-300 text-lg mb-8 leading-relaxed">
              View your {getProductName().toLowerCase()} in augmented reality. 
              Works on all devices with camera simulation and real camera support.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="p-4 rounded-xl horizon-card text-center">
                <Camera className="w-6 h-6 text-cyan-400 mb-2 mx-auto" />
                <h4 className="font-semibold text-white text-sm mb-1">Universal Support</h4>
                <p className="text-gray-400 text-xs">Works on all browsers and devices</p>
              </div>
              <div className="p-4 rounded-xl horizon-card text-center">
                <Eye className="w-6 h-6 text-purple-400 mb-2 mx-auto" />
                <h4 className="font-semibold text-white text-sm mb-1">3D Visualization</h4>
                <p className="text-gray-400 text-xs">Full 3D model rendering</p>
              </div>
            </div>

            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                handleStartAR();
              }}
              disabled={!getModelUrl()}
              className="px-8 py-4 horizon-button-primary flex items-center gap-2 mx-auto mb-4 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Camera className="w-5 h-5" />
              Start AR Experience
            </button>
            
            {!getModelUrl() && (
              <p className="text-red-400 text-sm mb-4">
                No 3D model available. Please generate a model first.
              </p>
            )}
            
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
      ) : (
        /* Active AR View */
        <div className="relative">
          <div className="relative bg-black overflow-hidden aspect-video rounded-2xl">
            {/* Camera Video Background (if available) */}
            {cameraStream && (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            
            {/* 3D Canvas Overlay */}
            <div className="absolute inset-0">
              <ManagedCanvas
                ref={canvasRef as any}
                camera={{ position: [0, 1, 2], fov: 60 }}
                style={{ width: '100%', height: '100%' }}
                gl={{ alpha: true, preserveDrawingBuffer: true }}
              >
                <ambientLight intensity={0.6} />
                <directionalLight
                  position={[10, 10, 5]}
                  intensity={1}
                  castShadow
                />
                
                <Suspense fallback={null}>
                  <Simple3DScene
                    modelUrl={getModelUrl()}
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
            </div>
            
            {/* AR UI Overlay */}
            <div className="absolute inset-0 pointer-events-none">
              {/* Top Bar */}
              <div className="absolute top-4 left-4 right-4 flex items-center justify-between pointer-events-auto">
                <div className="flex items-center gap-2">
                  <div className="px-3 py-1 bg-green-500 text-white text-sm rounded-full flex items-center gap-2">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                    AR Active
                  </div>
                  <div className="px-3 py-1 bg-black/50 text-white text-sm rounded-lg">
                    {getProductName()}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
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
              {!isPlaced && showControls && (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-auto">
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handlePlaceModel();
                    }}
                    className="bg-cyan-500 hover:bg-cyan-600 text-white p-4 rounded-full transition-all duration-300 transform hover:scale-110 shadow-lg"
                  >
                    <Crosshair className="w-8 h-8" />
                  </button>
                </div>
              )}
              
              {/* Bottom Controls */}
              {showControls && (
                <div className="absolute bottom-4 left-4 right-4 pointer-events-auto">
                  <div className="flex items-center justify-center">
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
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleRotateModel();
                          }}
                          className="p-2 horizon-card text-white transition-colors"
                          title="Rotate 90°"
                        >
                          <RotateCcw className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleResetPosition();
                          }}
                          className="p-2 horizon-card text-white transition-colors"
                          title="Reset Position"
                        >
                          <Move3D className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCapturePhoto();
                          }}
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
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SimpleARViewer;
