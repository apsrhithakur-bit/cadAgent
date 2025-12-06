import React, { useState, useEffect, useRef } from 'react';
import { Camera, Smartphone, Download, Settings, AlertTriangle, Loader2 } from 'lucide-react';
import { ArchitecturalModel } from '../../types/architectural';
import { WebXRManager, FallbackARManager, initializeWebXR, ARCapabilities } from '../../lib/webxr-setup';
import { getModelProductName } from '../../utils/productNameExtractor';

interface ARVisualizationProps {
  model: ArchitecturalModel | null;
  onNext: () => void;
  onPrevious: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

const ARVisualization: React.FC<ARVisualizationProps> = ({ model, onNext }) => {
  const [isARActive, setIsARActive] = useState(false);
  const [scale, setScale] = useState(100);
  const [capabilities, setCapabilities] = useState<ARCapabilities | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const webxrManager = useRef<WebXRManager | null>(null);
  const fallbackManager = useRef<FallbackARManager | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize WebXR capabilities on mount
  useEffect(() => {
    const initCapabilities = async () => {
      try {
        const caps = await initializeWebXR();
        setCapabilities(caps);
        console.log('🔍 AR Capabilities:', caps);
      } catch (error) {
        console.error('❌ Failed to initialize WebXR:', error);
        setError('AR initialization failed');
      }
    };
    initCapabilities();
  }, []);

  // Get product name for AR context
  const getProductName = () => {
    return getModelProductName(model);
  };

  const handleStartAR = async () => {
    if (!capabilities) return;
    
    setIsLoading(true);
    setError(null);

    try {
      if (capabilities.webxr && capabilities.webxrImmersive) {
        // Use WebXR
        webxrManager.current = new WebXRManager();
        const canvas = document.createElement('canvas');
        await webxrManager.current.startARSession(canvas, {
          requiredFeatures: ['local-floor'],
          optionalFeatures: ['hit-test', 'plane-detection']
        });
        console.log('✅ WebXR AR session started');
      } else if (capabilities.camera) {
        // Use fallback camera AR
        fallbackManager.current = new FallbackARManager();
        if (containerRef.current) {
          await fallbackManager.current.startARSession(containerRef.current);
          console.log('✅ Fallback AR session started');
        }
      } else {
        throw new Error('No AR capabilities available');
      }
      
      setIsARActive(true);
    } catch (error) {
      console.error('❌ Failed to start AR session:', error);
      setError(error instanceof Error ? error.message : 'Failed to start AR');
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
    } catch (error) {
      console.error('❌ Error stopping AR session:', error);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      {!isARActive ? (
        /* AR Setup */
        <div className="cosmic-panel p-8">
          <div className="text-center max-w-2xl mx-auto">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
              <Camera className="w-10 h-10 text-white" />
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">Experience Your {getProductName()} in AR</h3>
            <p className="text-gray-300 text-lg mb-8 leading-relaxed">
              See how your {getProductName().toLowerCase()} looks and fits in your actual space. 
              Use your device's camera to place the 3D model in your environment.
            </p>
            
            {error && (
              <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <div className="flex items-center gap-2 text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                  <span>{error}</span>
                </div>
              </div>
            )}
            
            {capabilities && (
              <div className="mb-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                <h4 className="text-sm font-semibold text-blue-400 mb-2">AR Capabilities Detected:</h4>
                <div className="grid grid-cols-2 gap-2 text-sm text-gray-300">
                  <div className={capabilities.webxr ? 'text-green-400' : 'text-gray-500'}>
                    WebXR: {capabilities.webxr ? '✓' : '✗'}
                  </div>
                  <div className={capabilities.camera ? 'text-green-400' : 'text-gray-500'}>
                    Camera: {capabilities.camera ? '✓' : '✗'}
                  </div>
                  <div className={capabilities.webxrImmersive ? 'text-green-400' : 'text-gray-500'}>
                    Immersive AR: {capabilities.webxrImmersive ? '✓' : '✗'}
                  </div>
                  <div className={capabilities.deviceOrientation ? 'text-green-400' : 'text-gray-500'}>
                    Orientation: {capabilities.deviceOrientation ? '✓' : '✗'}
                  </div>
                </div>
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
              <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                <Smartphone className="w-8 h-8 text-cyan-400 mb-3" />
                <h4 className="font-semibold text-white mb-2">Mobile Device</h4>
                <p className="text-gray-400 text-sm">Best experience on phone or tablet with camera</p>
              </div>
              <div className="p-6 rounded-xl bg-white/5 border border-white/10">
                <Settings className="w-8 h-8 text-purple-400 mb-3" />
                <h4 className="font-semibold text-white mb-2">Camera Permission</h4>
                <p className="text-gray-400 text-sm">Allow camera access for AR visualization</p>
              </div>
            </div>

            <button
              onClick={handleStartAR}
              disabled={isLoading || !capabilities?.camera}
              className="px-8 py-4 horizon-button-primary text-white font-semibold rounded-xl transition-all duration-300 shadow-lg hover:shadow-cyan-500/25 transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none flex items-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Starting AR...
                </>
              ) : (
                'Start AR Experience'
              )}
            </button>
          </div>
        </div>
      ) : (
        /* AR Viewer */
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2">
            <div className="cosmic-panel p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">AR View - {getProductName()}</h3>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                    <span className="text-sm text-gray-400">AR Active</span>
                  </div>
                  <button
                    onClick={handleStopAR}
                    className="px-3 py-1 bg-red-500 hover:bg-red-600 text-white text-sm rounded-lg transition-colors"
                  >
                    Stop AR
                  </button>
                </div>
              </div>
              
              {/* AR View Container */}
              <div 
                ref={containerRef}
                className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-white/10 relative overflow-hidden"
              >
                {/* WebXR will render directly into containerRef, fallback shows camera feed */}
                {!webxrManager.current && (
                  <>
                    {/* Simulated camera feed background for fallback */}
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-green-900/20"></div>
                    
                    {/* Virtual model in AR space */}
                    <div className="absolute bottom-1/3 left-1/2 transform -translate-x-1/2">
                      <div 
                        className="bg-gradient-to-br from-cyan-400 to-purple-500 rounded-lg shadow-2xl transition-all duration-300"
                        style={{ 
                          width: `${scale * 0.8}px`, 
                          height: `${scale * 1.0}px`,
                          transform: `perspective(500px) rotateX(-10deg)`
                        }}
                      >
                        <div className="w-full h-full bg-white/10 rounded-lg flex items-center justify-center">
                          <span className="text-white text-xs font-semibold">
                            {getProductName()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </>
                )}
                
                {/* AR UI Elements */}
                <div className="absolute top-4 left-4 px-3 py-1 bg-green-500 text-white text-sm rounded-full">
                  {webxrManager.current ? 'WebXR AR' : 'Camera AR'}
                </div>
                <div className="absolute bottom-4 right-4 flex gap-2">
                  <button className="p-2 bg-white/20 rounded-full text-white hover:bg-white/30 transition-colors">
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
                
                {/* Scale and model info */}
                <div className="absolute top-4 right-4 space-y-2">
                  <div className="px-3 py-1 bg-black/50 text-white text-sm rounded-lg">
                    Scale: {scale}%
                  </div>
                  {model?.productSpecs?.manufacturing && (
                    <div className="px-3 py-1 bg-black/50 text-white text-xs rounded-lg max-w-40">
                      Material: {model.productSpecs.manufacturing.materials?.[0] || 'Plastic'}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="cosmic-panel p-6">
              <h3 className="text-lg font-bold text-white mb-4">AR Controls</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Scale</label>
                  <input
                    type="range"
                    min="50"
                    max="150"
                    value={scale}
                    onChange={(e) => setScale(Number(e.target.value))}
                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>50%</span>
                    <span>150%</span>
                  </div>
                </div>
                
                <div className="pt-4 border-t border-white/10">
                  <h4 className="text-sm font-semibold text-white mb-3">Quick Actions</h4>
                  <div className="space-y-2">
                    <button className="w-full p-2 horizon-card text-white rounded-lg transition-colors text-sm">
                      Reset Position
                    </button>
                    <button className="w-full p-2 horizon-card text-white rounded-lg transition-colors text-sm">
                      Rotate 90°
                    </button>
                    <button className="w-full p-2 horizon-card text-white rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                      <Download className="w-4 h-4" />
                      Save AR Photo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="cosmic-panel p-6">
              <h3 className="text-lg font-bold text-white mb-4">Model Details</h3>
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex justify-between">
                  <span>Product:</span>
                  <span className="text-white">{getProductName()}</span>
                </div>
                {model?.productSpecs?.manufacturing?.materials && (
                  <div className="flex justify-between">
                    <span>Materials:</span>
                    <span className="text-white">{model.productSpecs.manufacturing.materials.slice(0, 2).join(', ')}</span>
                  </div>
                )}
                {model?.productSpecs?.manufacturing?.method && (
                  <div className="flex justify-between">
                    <span>Method:</span>
                    <span className="text-white">{model.productSpecs.manufacturing.method}</span>
                  </div>
                )}
                {model?.productSpecs?.keyFeatures && (
                  <div className="mt-3">
                    <span className="block mb-2">Key Features:</span>
                    <ul className="space-y-1 ml-2">
                      {model.productSpecs.keyFeatures.slice(0, 3).map((feature, index) => (
                        <li key={index} className="text-xs text-gray-400">• {feature}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>

            <div className="cosmic-panel p-6">
              <h3 className="text-lg font-bold text-white mb-4">Placement Tips</h3>
              <div className="space-y-3 text-sm text-gray-300">
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Find a flat surface with good lighting</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Move your device slowly to track the surface</span>
                </div>
                <div className="flex items-start gap-2">
                  <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                  <span>Tap to place the {getProductName().toLowerCase()} in your space</span>
                </div>
              </div>
            </div>

            <button
              onClick={onNext}
              className="w-full px-6 py-3 horizon-button-primary text-white font-semibold rounded-lg transition-all duration-300"
            >
              Continue to Export & Optimization
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ARVisualization;