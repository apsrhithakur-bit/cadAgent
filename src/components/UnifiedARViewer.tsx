import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, ArrowLeft, Smartphone, Monitor, AlertTriangle, Loader2, Eye } from 'lucide-react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, useGLTF } from '@react-three/drei';
import ManagedCanvas from './ManagedCanvas';
import { useModelContext } from '../contexts/ModelContext';
import { arCapabilityService, ARCapabilities, ARMethod } from '../services/arCapabilityService';
import { getModelProductName } from '../utils/productNameExtractor';

interface UnifiedARViewerProps {
  onClose: () => void;
  className?: string;
}

// 3D Model Component that reuses the persistent scene
const PersistentModel: React.FC<{ modelUrl: string }> = ({ modelUrl }) => {
  const { scene } = useThree();
  const { scene: persistentScene } = useModelContext();
  const [modelLoaded, setModelLoaded] = useState(false);

  useEffect(() => {
    let mixer: THREE.AnimationMixer | null = null;
    
    const loadModel = async () => {
      try {
        console.log('🔄 Loading model into persistent scene:', modelUrl);
        
        // Clear existing models from scene
        const existingModels = scene.children.filter(child => 
          child.userData.isModel === true
        );
        existingModels.forEach(model => {
          scene.remove(model);
          if (model instanceof THREE.Group) {
            model.traverse((child) => {
              if (child instanceof THREE.Mesh) {
                child.geometry?.dispose();
                if (Array.isArray(child.material)) {
                  child.material.forEach(material => material?.dispose());
                } else {
                  child.material?.dispose();
                }
              }
            });
          }
        });

        // Load new model
        const gltf = await new Promise<any>((resolve, reject) => {
          const loader = new GLTFLoader();
          loader.load(modelUrl, resolve, undefined, reject);
        });

        // Add model to scene
        const model = gltf.scene;
        model.userData.isModel = true;
        
        // Auto-scale and center model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        const scale = 2 / maxDim;
        
        model.scale.setScalar(scale);
        model.position.sub(center.multiplyScalar(scale));
        
        scene.add(model);
        setModelLoaded(true);

        // Handle animations if present
        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(model);
          gltf.animations.forEach(clip => {
            const action = mixer!.clipAction(clip);
            action.play();
          });
        }

        console.log('✅ Model loaded successfully into unified scene');
        
      } catch (error) {
        console.error('❌ Failed to load model:', error);
      }
    };

    if (modelUrl) {
      loadModel();
    }

    return () => {
      if (mixer) {
        mixer.stopAllAction();
      }
    };
  }, [modelUrl, scene]);

  // Animation loop for mixer
  useFrame((state, delta) => {
    if (mixer) {
      mixer.update(delta);
    }
  });

  return null;
};

// AR Method Components
const QuickLookARView: React.FC<{ modelUrl: string; productName: string }> = ({ 
  modelUrl, productName 
}) => (
  <div className="text-center p-8">
    <div className="w-24 h-24 mx-auto mb-6 rounded-full horizon-card flex items-center justify-center">
      <Smartphone className="w-12 h-12 text-white" />
    </div>
    <h3 className="text-2xl font-bold text-white mb-4">iOS Quick Look AR</h3>
    <p className="text-gray-300 mb-6">
      Experience your {productName.toLowerCase()} in native iOS AR
    </p>
    <a
      href={modelUrl}
      rel="ar"
      className="horizon-button-primary inline-block px-8 py-4"
    >
      View in AR
    </a>
  </div>
);

const ModelViewerARView: React.FC<{ modelUrl: string; productName: string }> = ({ 
  modelUrl, productName 
}) => {
  const modelViewerRef = useRef<any>(null);
  const [modelViewerLoaded, setModelViewerLoaded] = useState(false);

  useEffect(() => {
    // Load model-viewer script if not already loaded
    if (!customElements.get('model-viewer')) {
      const script = document.createElement('script');
      script.type = 'module';
      script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js';
      
      script.onload = () => {
        setModelViewerLoaded(true);
      };
      
      document.head.appendChild(script);
      
      return () => {
        // Don't remove script on unmount to avoid reloading
      };
    } else {
      setModelViewerLoaded(true);
    }
  }, []);

  if (!modelViewerLoaded) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-8 h-8 animate-spin text-blue-400 mr-3" />
        <span className="text-gray-300">Loading AR viewer...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-h-[600px]">
      <model-viewer
        ref={modelViewerRef}
        src={modelUrl}
        alt={`AR view of ${productName}`}
        ar
        ar-modes="webxr scene-viewer quick-look"
        camera-controls
        environment-image="neutral"
        shadow-intensity="1"
        auto-rotate
        auto-rotate-delay="1000"
        style={{
          width: '100%',
          height: '600px',
          backgroundColor: 'transparent'
        }}
      >
        <div slot="progress-bar" className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
        </div>
      </model-viewer>
    </div>
  );
};

const Unified3DView: React.FC<{ modelUrl: string }> = ({ modelUrl }) => {
  const { initializeRenderer } = useModelContext();
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvasRef.current) {
      // Initialize renderer using persistent context
      const renderer = initializeRenderer(canvasRef.current);
      console.log('🎨 Unified 3D view initialized with persistent renderer');
    }
  }, [initializeRenderer]);

  return (
    <div className="w-full h-full min-h-[600px] cosmic-panel rounded-xl overflow-hidden">
      <ManagedCanvas
        ref={canvasRef as any}
        camera={{ position: [0, 0, 5], fov: 75 }}
        gl={{ preserveDrawingBuffer: true }}
      >
        <ambientLight intensity={0.6} />
        <directionalLight position={[10, 10, 5]} intensity={0.8} />
        <PersistentModel modelUrl={modelUrl} />
        <OrbitControls 
          enablePan={true}
          enableZoom={true}
          enableRotate={true}
          minDistance={1}
          maxDistance={10}
        />
      </ManagedCanvas>
    </div>
  );
};

// Main Unified AR Viewer Component
const UnifiedARViewer: React.FC<UnifiedARViewerProps> = ({ onClose, className = '' }) => {
  const { model, setArMode } = useModelContext();
  const [capabilities, setCapabilities] = useState<ARCapabilities | null>(null);
  const [currentMethod, setCurrentMethod] = useState<ARMethod>('3d-fallback');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const productName = model ? getModelProductName(model) : 'Product';
  const modelUrl = model?.gltfUrl || '';

  // Initialize AR capabilities
  useEffect(() => {
    const initializeAR = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('🚀 Initializing Unified AR Viewer');
        const caps = await arCapabilityService.detectCapabilities();
        setCapabilities(caps);
        setCurrentMethod(caps.recommendedMethod);
        setArMode('ar');
        
        console.log(`🎯 Using AR method: ${caps.recommendedMethod}`);
        
      } catch (err) {
        console.error('❌ AR initialization failed:', err);
        setError('AR initialization failed');
        setCurrentMethod('3d-fallback');
      } finally {
        setIsLoading(false);
      }
    };

    initializeAR();

    return () => {
      setArMode('none');
    };
  }, [setArMode]);

  // Handle method switching
  const switchMethod = useCallback((method: ARMethod) => {
    console.log(`🔄 Switching to AR method: ${method}`);
    setCurrentMethod(method);
  }, []);

  // Handle close
  const handleClose = useCallback(() => {
    console.log('🚪 Closing Unified AR Viewer');
    setArMode('none');
    onClose();
  }, [onClose, setArMode]);

  if (isLoading) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[600px]`}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-gray-300">Initializing AR experience...</p>
        </div>
      </div>
    );
  }

  if (error || !model || !capabilities) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[600px]`}>
        <div className="text-center p-8">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">AR Unavailable</h3>
          <p className="text-gray-300 mb-4">
            {error || 'Unable to initialize AR experience'}
          </p>
          <button
            onClick={handleClose}
            className="horizon-button-primary px-6 py-2"
          >
            Return to 3D View
          </button>
        </div>
      </div>
    );
  }

  const renderARView = () => {
    switch (currentMethod) {
      case 'quicklook':
        return <QuickLookARView modelUrl={modelUrl} productName={productName} />;
      
      case 'model-viewer':
      case 'scene-viewer':
        return <ModelViewerARView modelUrl={modelUrl} productName={productName} />;
      
      case '3d-fallback':
      default:
        return <Unified3DView modelUrl={modelUrl} />;
    }
  };

  return (
    <div className={`${className} relative w-full`}>
      <div className="cosmic-panel rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-700">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full horizon-card flex items-center justify-center">
                <Camera className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">
                  {productName} AR Experience
                </h3>
                <p className="text-gray-400 text-sm">
                  {arCapabilityService.getMethodDescription(currentMethod)}
                </p>
              </div>
            </div>
            
            <button
              onClick={handleClose}
              className="flex items-center gap-2 px-4 py-2 text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to 3D View
            </button>
          </div>
          
          {/* Method Switcher */}
          {capabilities.fallbackMethods.length > 0 && (
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => switchMethod(capabilities.recommendedMethod)}
                className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                  currentMethod === capabilities.recommendedMethod
                    ? 'horizon-button-primary text-white'
                    : 'horizon-card text-gray-300'
                }`}
              >
                Recommended
              </button>
              {capabilities.fallbackMethods.map(method => (
                <button
                  key={method}
                  onClick={() => switchMethod(method)}
                  className={`px-3 py-1 text-xs rounded-lg transition-colors ${
                    currentMethod === method
                      ? 'horizon-button-primary text-white'
                      : 'horizon-card text-gray-300'
                  }`}
                >
                  {method === '3d-fallback' ? '3D View' : method}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* AR View */}
        <div className="p-6">
          {renderARView()}
        </div>
      </div>
    </div>
  );
};

export default UnifiedARViewer;
