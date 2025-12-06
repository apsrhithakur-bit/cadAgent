import React, { useEffect, useRef, useState } from 'react';
import { Camera, ArrowLeft, Smartphone, Monitor, AlertTriangle, Loader2, Wifi, WifiOff, Zap, QrCode, Info } from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName } from '../utils/productNameExtractor';
import QRCodeGenerator from './QRCodeGenerator';
import SharedModelQRGenerator from './SharedModelQRGenerator';
import { extractSharedModelData, canCreateSharedModel, getFallbackUrl } from '../utils/sharedModelDataExtractor';
import { getNetworkInfo, getDeviceInfo } from '../utils/networkDetection';
import { 
  checkCrossDeviceARSupport, 
  selectOptimalARMode, 
  initializeCrossDeviceAR,
  enableWebXRForModelViewer,
  detectMemoryPressure,
  validateModelForCrossDevice,
  type ARCapabilities,
  type ModelValidation
} from '../utils/crossDeviceARManager';

interface SimpleUnifiedARViewerProps {
  model: ArchitecturalModel | null;
  onClose: () => void;
  className?: string;
  // Optional ProcessWizard state for shared models
  currentStep?: number;
  generatedResults?: any;
  originalPrompt?: string;
  refinementHistory?: any[];
  designSession?: any;
}

const SimpleUnifiedARViewer: React.FC<SimpleUnifiedARViewerProps> = ({ 
  model, 
  onClose, 
  className = '',
  currentStep,
  generatedResults,
  originalPrompt,
  refinementHistory,
  designSession
}) => {
  const [modelViewerLoaded, setModelViewerLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isModelLoading, setIsModelLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInAR, setIsInAR] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showInstructions, setShowInstructions] = useState(true);
  const modelViewerRef = useRef<any>(null);
  
  // Cross-device AR state
  const [arCapabilities, setArCapabilities] = useState<ARCapabilities | null>(null);
  const [modelValidation, setModelValidation] = useState<ModelValidation | null>(null);
  const [arMode, setArMode] = useState<'webxr' | 'scene-viewer' | '3d-only'>('3d-only');
  const [arConfig, setArConfig] = useState<any>({});
  const [arModeData, setArModeData] = useState<any>(null);
  const [showCompatibilityInfo, setShowCompatibilityInfo] = useState(false);
  const [memoryStatus, setMemoryStatus] = useState<any>(null);
  const [showQRCode, setShowQRCode] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);

  const productName = model ? getModelProductName(model) : 'Product';
  const modelUrl = model?.cadModel?.gltfUrl || '';

  // Initialize cross-device AR capabilities
  useEffect(() => {
    console.log('🔍 Initializing cross-device AR capabilities...');
    
    const initializeAR = async () => {
      try {
        // Get network and device info
        const netInfo = getNetworkInfo();
        const devInfo = getDeviceInfo();
        setNetworkInfo(netInfo);
        setDeviceInfo(devInfo);
        
        // Check device capabilities
        const capabilities = checkCrossDeviceARSupport();
        setArCapabilities(capabilities);
        console.log('📊 AR Capabilities detected:', capabilities);
        
        // Check memory status
        const memory = detectMemoryPressure();
        setMemoryStatus(memory);
        console.log('🧠 Memory status:', memory);
        
        // Validate model if available
        if (modelUrl) {
          const validation = await validateModelForCrossDevice(modelUrl);
          setModelValidation(validation);
          console.log('✅ Model validation:', validation);
          
          // Select optimal AR mode
          const optimalMode = await selectOptimalARMode(modelUrl);
          setArMode(optimalMode.mode);
          setArConfig(optimalMode.config);
          setArModeData(optimalMode);
          console.log('🎯 Selected AR mode:', optimalMode);
        }
        
        // Initialize cross-device AR system
        const arInit = await initializeCrossDeviceAR();
        console.log('🚀 Cross-device AR initialization:', arInit);
        
      } catch (error) {
        console.error('❌ Cross-device AR initialization failed:', error);
      }
    };
    
    initializeAR();
  }, [modelUrl]);
  
  // Get device-specific AR modes with cross-device intelligence
  const getARModes = () => {
    if (arConfig && Object.keys(arConfig).length > 0) {
      return arConfig['ar-modes'] || 'webxr scene-viewer quick-look';
    }
    
    // Fallback to basic device detection
    const isAndroid = /Android/.test(navigator.userAgent);
    return isAndroid ? 'webxr scene-viewer quick-look' : 'quick-look webxr';
  };


  // Debug logging
  useEffect(() => {
    console.log('🔧 SimpleUnifiedARViewer - model data:', {
      hasModel: !!model,
      productName,
      modelUrl,
      modelKeys: model ? Object.keys(model) : [],
      fullModel: model
    });
    
    if (model) {
      console.log('🔧 Looking for GLTF URL in model object:');
      console.log('🔧 model.cadModel?.gltfUrl:', model.cadModel?.gltfUrl);
      console.log('🔧 model.cadModel exists:', !!model.cadModel);
      console.log('🔧 Full cadModel data:', model.cadModel);
    }
  }, [model, productName, modelUrl]);

  // Preload GLTF model to prevent double loading between Three.js and model-viewer
  useEffect(() => {
    if (modelUrl && !modelUrl.startsWith('blob:')) {
      console.log('🔄 Preloading GLTF model for AR viewer:', modelUrl);
      
      // Create preload link for better caching (skip for blob URLs)
      const preloadLink = document.createElement('link');
      preloadLink.rel = 'preload';
      preloadLink.href = modelUrl;
      preloadLink.as = 'fetch';
      preloadLink.crossOrigin = 'anonymous';
      
      // Check if already exists
      const existingPreload = document.querySelector(`link[href="${modelUrl}"]`);
      if (!existingPreload) {
        document.head.appendChild(preloadLink);
        console.log('✅ GLTF preload link added');
      }
      
      return () => {
        // Don't remove on cleanup - keep cached for performance
      };
    } else if (modelUrl.startsWith('blob:')) {
      console.log('🔄 Blob URL detected, skipping preload link (blob URLs cannot be preloaded)');
    }
  }, [modelUrl]);

  // Enhanced WebGL preparation to prevent context conflicts
  const prepareWebGLForModelViewer = () => {
    console.log('🔧 Preparing WebGL for model-viewer (enhanced approach)');
    
    // Force garbage collection if available
    if (window.gc) {
      window.gc();
    }
    
    // Wait longer for any pending WebGL operations to complete
    return new Promise(resolve => {
      // Longer delay to allow Three.js context to fully settle
      setTimeout(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            console.log('🔧 WebGL preparation complete');
            resolve(void 0);
          });
        });
      }, 500); // 500ms delay instead of immediate
    });
  };

  // Load model-viewer script (simplified)
  useEffect(() => {
    console.log('📱 Loading simple AR viewer for:', productName);
    
    // Check if model-viewer is already loaded
    if (customElements.get('model-viewer')) {
      console.log('✅ Model-viewer already loaded');
      // Use gentle WebGL preparation before setting loaded
      prepareWebGLForModelViewer().then(() => {
        console.log('🔧 Setting modelViewerLoaded to true after WebGL preparation (existing script)');
        setModelViewerLoaded(true);
        // Set isLoading false so model-viewer JSX renders and ref becomes available
        setIsLoading(false);
      });
      return;
    }

    console.log('📦 Loading model-viewer script...');
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js';
    
    script.onload = () => {
      console.log('✅ Model-viewer loaded successfully');
      // Use gentle WebGL preparation before setting loaded
      prepareWebGLForModelViewer().then(() => {
        console.log('🔧 Setting modelViewerLoaded to true after WebGL preparation (new script)');
        setModelViewerLoaded(true);
        // Set isLoading false so model-viewer JSX renders and ref becomes available
        setIsLoading(false);
      });
    };
    
    script.onerror = (err) => {
      console.error('❌ Failed to load model-viewer:', err);
      setError('Failed to load AR viewer');
      setIsLoading(false);
    };
    
    document.head.appendChild(script);
  }, []);

  // Enhanced model-viewer events with cross-device AR integration
  useEffect(() => {
    console.log('🔧 Model-viewer setup useEffect triggered:', {
      modelViewerLoaded,
      hasModelViewerRef: !!modelViewerRef.current,
      modelUrl,
      arMode,
      allConditionsMet: modelViewerLoaded && modelViewerRef.current && modelUrl
    });
    
    if (modelViewerLoaded && modelViewerRef.current && modelUrl) {
      const modelViewer = modelViewerRef.current;
      
      console.log('🔧 Setting up enhanced model-viewer with cross-device AR:', {
        modelUrl,
        arMode,
        arConfig,
        capabilities: arCapabilities
      });
      
      // Enable WebXR integration from cross-device manager
      enableWebXRForModelViewer(modelViewer).then(webxrEnabled => {
        console.log('🔧 WebXR integration status:', webxrEnabled);
      });

      // Set initial camera position immediately when model-viewer is ready
      setTimeout(() => {
        modelViewer.cameraOrbit = '0deg 75deg 1.4m';
        modelViewer.fieldOfView = '35deg';
        console.log('🎥 Early camera position set on model-viewer ready');
      }, 50);
      
      const handleLoad = () => {
        console.log('✅ 3D model loaded in enhanced AR viewer');
        console.log('📊 Model validation results:', modelValidation);
        console.log('🎯 Active AR mode:', arMode);
        setIsModelLoading(false);
        
        // Force camera position after model loads to prevent zoom-in on navigation
        setTimeout(() => {
          if (modelViewer && modelViewer.cameraOrbit) {
            modelViewer.cameraOrbit = '0deg 75deg 1.4m';
            modelViewer.fieldOfView = '35deg';
            console.log('🎥 Camera position forced to prevent zoom-in');
          }
        }, 100);
      };
      
      const handleError = (event: any) => {
        console.error('❌ Model loading error:', event);
        console.error('❌ Model URL was:', modelUrl);
        console.error('❌ AR mode was:', arMode);
        console.error('❌ Model validation:', modelValidation);
        setError('Failed to load 3D model');
        setIsModelLoading(false);
      };

      const handleProgress = (event: any) => {
        console.log('🔄 Model loading progress:', event.detail);
      };

      const handleARStatus = (event: any) => {
        const status = event.detail.status;
        console.log('🔮 Enhanced AR status:', status, 'Mode:', arMode);
        
        if (status === 'session-started') {
          console.log('🎉 Enhanced AR session started successfully');
          console.log('📱 AR capabilities:', arCapabilities);
          setIsInAR(true);
        } else if (status === 'not-presenting') {
          console.log('📱 Enhanced AR session ended');
          setIsInAR(false);
        } else if (status === 'failed') {
          console.error('❌ Enhanced AR session failed');
          console.error('⚠️ Device capabilities:', arCapabilities);
          console.error('⚠️ Model validation:', modelValidation);
          setIsInAR(false);
        }
      };

      modelViewer.addEventListener('load', handleLoad);
      modelViewer.addEventListener('error', handleError);
      modelViewer.addEventListener('progress', handleProgress);
      modelViewer.addEventListener('ar-status', handleARStatus);

      // Apply cross-device AR configuration
      if (arConfig && Object.keys(arConfig).length > 0) {
        Object.entries(arConfig).forEach(([key, value]) => {
          if (value !== undefined && value !== null) {
            console.log(`🔧 Applying AR config: ${key} = ${value}`);
            if (value === '') {
              modelViewer.setAttribute(key, '');
            } else {
              modelViewer.setAttribute(key, value);
            }
          }
        });
      }

      // Debug interaction events
      modelViewer.addEventListener('mousedown', (e) => {
        console.log('🖱️ Mouse down on model-viewer:', e);
      });
      
      modelViewer.addEventListener('touchstart', (e) => {
        console.log('👆 Touch start on model-viewer:', e);
      });

      // Ensure camera controls are enabled
      console.log('🔧 Camera controls enabled:', modelViewer.cameraControls);
      
      // Make sure the model-viewer can receive focus
      modelViewer.tabIndex = 0;

      // Force set the src if it's not already set
      if (modelViewer.src !== modelUrl) {
        console.log('🔧 Force setting enhanced model-viewer src to:', modelUrl);
        modelViewer.src = modelUrl;
      }

      // Force initial camera position immediately to prevent auto-zoom on first load
      modelViewer.cameraOrbit = '0deg 75deg 1.4m';
      modelViewer.fieldOfView = '35deg';
      console.log('🎥 Initial camera position set to prevent auto-zoom on first load');

      return () => {
        modelViewer.removeEventListener('load', handleLoad);
        modelViewer.removeEventListener('error', handleError);
        modelViewer.removeEventListener('progress', handleProgress);
        modelViewer.removeEventListener('ar-status', handleARStatus);
      };
    }
  }, [modelViewerLoaded, modelUrl, arMode, arConfig]);

  // Auto-hide instructions after 4 seconds
  useEffect(() => {
    if (!isModelLoading && showInstructions) {
      const timer = setTimeout(() => {
        setShowInstructions(false);
      }, 4000);
      
      return () => clearTimeout(timer);
    }
  }, [isModelLoading, showInstructions]);

  // Cleanup on unmount to prevent WebGL context conflicts
  useEffect(() => {
    return () => {
      if (modelViewerRef.current) {
        console.log('🧹 Cleaning up SimpleUnifiedARViewer');
        try {
          // Clear the model-viewer source to release WebGL resources
          if (modelViewerRef.current.src) {
            modelViewerRef.current.src = '';
            modelViewerRef.current.removeAttribute('src');
          }
          // Stop any ongoing animations or processes
          if (typeof modelViewerRef.current.pause === 'function') {
            modelViewerRef.current.pause();
          }
          // Force garbage collection of WebGL resources
          if (typeof modelViewerRef.current.renderer?.dispose === 'function') {
            modelViewerRef.current.renderer.dispose();
          }
        } catch (error) {
          console.warn('⚠️ Model viewer cleanup warning:', error);
        }
      }
    };
  }, []);

  if (!model) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[600px]`}>
        <div className="text-center p-8">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">No Model Available</h3>
          <p className="text-gray-300 mb-4">
            Please generate a 3D model first before trying AR visualization.
          </p>
          <button
            onClick={onClose}
            className="horizon-button-primary px-6 py-2"
          >
            Return to Previous Step
          </button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[600px]`}>
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-blue-400 mx-auto mb-4" />
          <p className="text-gray-300">Loading AR viewer...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`${className} flex items-center justify-center min-h-[600px]`}>
        <div className="text-center p-8">
          <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-white mb-2">AR Error</h3>
          <p className="text-gray-300 mb-4">{error}</p>
          <button
            onClick={onClose}
            className="horizon-button-primary px-6 py-2"
          >
            Return to 3D View
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} relative w-full min-h-screen`} style={{ height: 'calc(100vh + 300px)' }}>
      {/* Full-screen AR Viewer */}
      <div className="absolute inset-0">
        {/* AR Instructions Overlay */}
        {showInstructions && !isModelLoading && (
          <div 
            className="absolute top-16 left-1/2 transform -translate-x-1/2 cosmic-panel text-white/90 px-6 py-3 rounded-lg text-center z-50 font-medium cursor-pointer"
            onClick={() => setShowInstructions(false)}
            style={{
              animation: 'slideDown 0.5s ease-out'
            }}
          >
            🎯 AR Preview Mode - Look for the "View in AR" button below!
            <div className="text-xs mt-2 opacity-90">
              Tap anywhere to dismiss
            </div>
          </div>
        )}

        {/* Cross-Device AR Status - Top Left Overlay */}
        {arCapabilities && (
          <div className="absolute top-5 left-5 cosmic-panel text-white/85 p-3 rounded-lg z-40 max-w-80">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-4 h-4 text-cyan-400" />
              <h4 className="font-semibold text-sm">Cross-Device AR</h4>
            </div>
            <div className="space-y-1 text-xs">
              <div><strong>Device:</strong> {deviceInfo?.isDesktop ? 'Desktop/Laptop' : deviceInfo?.isMobile ? 'Mobile' : 'Unknown'}</div>
              <div><strong>AR Mode:</strong> {arCapabilities.integrationMode === 'scene-viewer' && arCapabilities.arCoreVersion === 'Cross-Device AR (QR Handoff)' ? '3D Viewer Only' : arCapabilities.integrationMode}</div>
              <div className="text-gray-300">{arCapabilities.arCoreVersion}</div>
              {arCapabilities.recommendations?.[0] && (
                <div className="mt-2 p-2 bg-cyan-400/5 rounded text-cyan-300/70 text-xs">
                  {arCapabilities.recommendations[0]}
                </div>
              )}
            </div>
          </div>
        )}


        {/* Full-screen Model Viewer */}
        <div className="w-full h-full relative" style={{ pointerEvents: 'auto' }}>
            {modelViewerLoaded ? (
              <model-viewer
                ref={modelViewerRef}
                src={modelUrl}
                alt={`AR view of ${productName}`}
                ar
                ar-modes={getARModes()}
                ar-scale="auto"
                ar-placement="floor"
                camera-controls="true"
                touch-action="pan-y"
                loading="lazy"
                interaction-prompt-threshold="2000"
                interaction-prompt-style="wiggle"
                disable-pan="false"
                disable-zoom="false"
                disable-tap="false"
                environment-image="neutral"
                shadow-intensity="0.5"
                exposure="0.8"
                auto-rotate
                auto-rotate-delay="3000"
                xr-environment
                seamless-poster
                crossorigin="anonymous"
                data-js-focus-visible
                reveal="auto"
                preload
                scale="1.0 1.0 1.0"
                camera-orbit="0deg 75deg 1.4m"
                field-of-view="35deg"
                min-camera-orbit="auto auto 1.2m"
                max-camera-orbit="auto auto 2.2m"
                camera-target="auto auto auto"
                interaction-prompt="none"
                style={{
                  width: '100%',
                  height: '100%',
                  backgroundColor: 'transparent',
                  '--poster-color': 'transparent',
                  '--progress-bar-color': 'transparent',
                  '--progress-mask': 'transparent',
                  pointerEvents: 'auto',
                  touchAction: 'pan-y',
                  cursor: 'grab',
                }}
              >
                {/* Loading indicator */}
                {isModelLoading && (
                  <div 
                    slot="progress-bar" 
                    className="flex items-center justify-center h-full"
                  >
                    <div className="text-center text-white">
                      <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-2" />
                      <p className="text-white text-sm">Loading 3D model...</p>
                    </div>
                  </div>
                )}

                {/* Enhanced AR button with animations */}
                <div 
                  slot="ar-button" 
                  style={{
                    position: 'absolute',
                    bottom: '120px',
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #06b6d4, #8b5cf6)',
                    color: 'white',
                    border: 'none',
                    padding: '16px 32px',
                    borderRadius: '30px',
                    fontSize: '18px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
                    zIndex: 1000,
                    animation: 'arButtonPulse 2s infinite',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateX(-50%) scale(1.05)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateX(-50%) scale(1)';
                  }}
                >
                  👆 View in AR
                </div>

                {/* Add CSS animations and interaction fixes */}
                <style>{`
                  model-viewer {
                    pointer-events: auto !important;
                    touch-action: pan-y !important;
                    cursor: grab !important;
                  }
                  
                  model-viewer:active {
                    cursor: grabbing !important;
                  }
                  
                  @keyframes arButtonPulse {
                    0% { 
                      box-shadow: 0 6px 20px rgba(0,0,0,0.4), 0 0 0 0 rgba(6, 182, 212, 0.4); 
                    }
                    70% { 
                      box-shadow: 0 6px 20px rgba(0,0,0,0.4), 0 0 0 10px rgba(0,0,0,0); 
                    }
                    100% { 
                      box-shadow: 0 6px 20px rgba(0,0,0,0.4), 0 0 0 0 rgba(0,0,0,0); 
                    }
                  }
                  
                  @keyframes slideDown {
                    from {
                      opacity: 0;
                      transform: translateX(-50%) translateY(-20px);
                    }
                    to {
                      opacity: 1;
                      transform: translateX(-50%) translateY(0);
                    }
                  }
                `}</style>
              </model-viewer>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-white">
                  <Loader2 className="w-8 h-8 animate-spin text-white mx-auto mb-2" />
                  <p className="text-white text-sm">Initializing AR viewer...</p>
                </div>
              </div>
            )}
        </div>

        {/* Central AR Not Available Overlay - Non-blocking for model interaction */}
        {deviceInfo?.isDesktop && arCapabilities?.integrationMode === 'scene-viewer' && arCapabilities?.arCoreVersion === 'Cross-Device AR (QR Handoff)' && (
          <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
            <div className="cosmic-panel text-white p-6 rounded-xl text-center max-w-md mx-4 pointer-events-auto border border-orange-400/30">
              <div className="mb-4">
                <Smartphone className="w-8 h-8 mx-auto mb-2" />
                <h3 className="text-lg font-bold">📱 AR Not Available</h3>
              </div>
              
              <p className="mb-4 text-sm">
                AR is not available on this device. Please open this link on a device that supports AR:
              </p>
              
              <div className="mb-4 p-3 horizon-card border border-cyan-400/30">
                <p className="text-xs text-cyan-100">
                  💡 <strong>You can still interact with the 3D model!</strong><br/>
                  Drag to rotate, scroll to zoom
                </p>
              </div>
              
              <div className="mb-4 text-sm">
                <div className="font-semibold mb-2">Compatible devices:</div>
                <div className="space-y-1 text-xs">
                  <div>📱 Android smartphone (Chrome 88+)</div>
                  <div>📱 iPhone/iPad (Safari 14+)</div>
                  <div>🥽 Apple Vision Pro</div>
                  <div>👓 Spectacles or Meta Quest</div>
                </div>
              </div>
              
              {networkInfo && (
                <button
                  onClick={() => setShowQRCode(true)}
                  className="horizon-button-primary flex items-center gap-2 mx-auto px-6 py-3"
                >
                  <QrCode className="w-4 h-4" />
                  📲 Generate QR Code
                </button>
              )}
            </div>
          </div>
        )}

        {/* QR Code Modal Overlay */}
        {showQRCode && networkInfo && (
          <div className="absolute inset-0 bg-black/50 backdrop-blur-md flex items-center justify-center z-50">
            <div className="cosmic-panel p-6 rounded-xl text-center max-w-sm mx-4">
              <div className="mb-4">
                <QrCode className="w-8 h-8 mx-auto mb-2 text-gray-700" />
                <h3 className="text-lg font-bold text-gray-800">📲 Scan with your phone</h3>
              </div>
              
              <SharedModelQRGenerator 
                modelData={extractSharedModelData(
                  currentStep || 2,
                  generatedResults,
                  model,
                  originalPrompt,
                  refinementHistory,
                  designSession
                )}
                fallbackUrl={networkInfo.mobileAccessUrl}
                autoShow={true}
                style={{
                  background: 'transparent',
                  color: '#1f2937',
                  padding: '0',
                  fontSize: '12px',
                  lineHeight: '1.4'
                }}
              />
              
              {/* Close modal button - only if SharedModelQRGenerator doesn't provide one */}
              <div className="mt-4 text-center">
                <button
                  onClick={() => setShowQRCode(false)}
                  className="horizon-button-primary px-4 py-2 text-sm"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
        
      </div>
    </div>
  );
};

export default SimpleUnifiedARViewer;