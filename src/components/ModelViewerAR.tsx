import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, ArrowLeft, Smartphone, AlertTriangle, Loader2, Eye, EyeOff, RotateCcw, Move3D, Download } from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName } from '../utils/productNameExtractor';

interface ModelViewerARProps {
  model: ArchitecturalModel | null;
  onClose: (e?: React.MouseEvent) => void;
  className?: string;
}

// Model Viewer AR Component using Google's <model-viewer>
const ModelViewerAR: React.FC<ModelViewerARProps> = ({ model, onClose, className = '' }) => {
  const [isARSupported, setIsARSupported] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const modelViewerRef = useRef<any>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);

  // Load model-viewer script dynamically to avoid Three.js conflicts
  useEffect(() => {
    const loadModelViewer = async () => {
      // Check if model-viewer is already loaded
      if (customElements.get('model-viewer')) {
        setIsARSupported(true);
        return;
      }

      try {
        setIsLoading(true);
        
        // Load model-viewer from CDN to avoid version conflicts
        const script = document.createElement('script');
        script.type = 'module';
        script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/3.4.0/model-viewer.min.js';
        
        script.onload = () => {
          console.log('✅ Model Viewer loaded successfully');
          setIsARSupported(true);
          setIsLoading(false);
        };
        
        script.onerror = () => {
          console.error('❌ Failed to load Model Viewer');
          setError('Failed to load AR viewer');
          setIsARSupported(false);
          setIsLoading(false);
        };
        
        document.head.appendChild(script);
      } catch (error) {
        console.error('❌ Error loading Model Viewer:', error);
        setError('AR viewer initialization failed');
        setIsARSupported(false);
        setIsLoading(false);
      }
    };

    loadModelViewer();

    // Cleanup script on unmount
    return () => {
      const scripts = document.querySelectorAll('script[src*="model-viewer"]');
      scripts.forEach(script => script.remove());
    };
  }, []);

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
      volume: model.cadModel?.properties?.volume,
      surfaceArea: model.cadModel?.properties?.surfaceArea
    };
  }, [model, getProductName]);

  const handleModelLoad = useCallback(() => {
    console.log('✅ 3D Model loaded in AR viewer');
    setIsModelLoaded(true);
    setError(null);
  }, []);

  const handleModelError = useCallback((event: any) => {
    console.error('❌ Model loading error:', event);
    setError('Failed to load 3D model');
    setIsModelLoaded(false);
  }, []);

  const handleARSessionStart = useCallback(() => {
    console.log('🚀 AR session started');
    // Track AR usage or send analytics
  }, []);

  const handleARSessionEnd = useCallback(() => {
    console.log('🛑 AR session ended');
  }, []);

  const captureARPhoto = useCallback(() => {
    if (modelViewerRef.current) {
      try {
        // Use model-viewer's toBlob method if available
        const canvas = modelViewerRef.current.querySelector('canvas');
        if (canvas) {
          canvas.toBlob((blob: Blob) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `${getProductName()}_AR_${Date.now()}.png`;
            link.click();
            URL.revokeObjectURL(url);
          });
        }
      } catch (error) {
        console.error('❌ Failed to capture AR photo:', error);
      }
    }
  }, [getProductName]);

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
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
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

  if (isLoading) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-white">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
          <p>Loading AR viewer...</p>
        </div>
      </div>
    );
  }

  if (!isARSupported || error) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-gray-400">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
          <p>{error || 'AR not supported on this device'}</p>
          <p className="text-sm mt-2">Try using Chrome on Android or Safari on iOS</p>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose(e);
            }}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
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
      {/* Model Viewer AR Setup */}
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          {/* Model Context Information */}
          {specs && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left">
                <h4 className="font-semibold text-white text-sm mb-2">Model Details</h4>
                <div className="space-y-1 text-xs text-gray-300">
                  <div>Product: {specs.name}</div>
                  {specs.dimensions && (
                    <div>
                      Size: {Math.round(specs.dimensions.length || 0)}×
                      {Math.round(specs.dimensions.width || 0)}×
                      {Math.round(specs.dimensions.height || 0)}cm
                    </div>
                  )}
                  {specs.materials && specs.materials[0] && (
                    <div>Material: {specs.materials[0]}</div>
                  )}
                </div>
              </div>
              
              <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-left">
                <h4 className="font-semibold text-white text-sm mb-2">AR Features</h4>
                <div className="space-y-1 text-xs text-gray-300">
                  <div>• Native iOS/Android AR</div>
                  <div>• Real-world scale</div>
                  <div>• Surface detection</div>
                  <div>• Touch to place</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Model Viewer Component */}
        <div className="relative mb-8">
          <div 
            className="aspect-video bg-black rounded-2xl overflow-hidden border border-white/10 relative"
            style={{ minHeight: '400px' }}
          >
            {modelUrl ? (
              <>
                <model-viewer
                  ref={modelViewerRef}
                  src={modelUrl}
                  alt={`3D model of ${specs?.name}`}
                  ar
                  ar-modes="webxr scene-viewer quick-look"
                  camera-controls
                  touch-action="pan-y"
                  auto-rotate
                  shadow-intensity="1"
                  environment-image="neutral"
                  exposure="1"
                  shadow-softness="0.5"
                  style={{
                    width: '100%',
                    height: '100%',
                    backgroundColor: 'transparent'
                  }}
                  onLoad={handleModelLoad}
                  onError={handleModelError}
                  onArStatus={handleARSessionStart}
                />
                
                {/* Loading overlay */}
                {!isModelLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                    <div className="text-center text-white">
                      <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                      <p>Loading 3D model...</p>
                    </div>
                  </div>
                )}

                {/* AR Button overlay */}
                {isModelLoaded && (
                  <div className="absolute top-4 right-4">
                    <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm border border-green-500/30">
                      AR Ready
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
                  <p>No 3D model URL available</p>
                  <p className="text-sm mt-2">Please generate a model first</p>
                </div>
              </div>
            )}
          </div>

          {/* Model Info Panel */}
          {showControls && specs && (
            <div className="absolute bottom-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl p-4 text-white text-sm max-w-64">
              <div className="space-y-2">
                <div className="font-semibold">{specs.name}</div>
                {specs.description && (
                  <div className="text-gray-300 text-xs line-clamp-2">
                    {specs.description}
                  </div>
                )}
                {specs.volume && (
                  <div className="text-gray-300 text-xs">
                    Volume: {Math.round(specs.volume)} cm³
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Controls overlay */}
          <div className="absolute top-4 left-4 flex items-center gap-2">
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
        </div>

        {/* Instructions */}
        <div className="text-center space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div className="flex items-center gap-3">
              <Smartphone className="w-5 h-5 text-cyan-400" />
              <span>Tap the AR button in the 3D viewer above to start</span>
            </div>
            <div className="flex items-center gap-3">
              <Camera className="w-5 h-5 text-purple-400" />
              <span>Point your camera at a flat surface to place the model</span>
            </div>
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

export default ModelViewerAR;