import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, ArrowLeft, Smartphone, AlertTriangle, Loader2 } from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName } from '../utils/productNameExtractor';
import QRCodeGenerator from './QRCodeGenerator';
import SharedModelQRGenerator from './SharedModelQRGenerator';
import { extractSharedModelData, canCreateSharedModel, getFallbackUrl } from '../utils/sharedModelDataExtractor';
import { webglContextManager } from '../utils/webglContextManager';
import { getNetworkInfo, getDeviceInfo, getCrossDeviceSetupInfo } from '../utils/networkDetection';

interface CrossDeviceARViewerProps {
  model: ArchitecturalModel | null;
  onClose: (e?: React.MouseEvent) => void;
  className?: string;
  // Optional ProcessWizard state for shared models
  currentStep?: number;
  generatedResults?: any;
  originalPrompt?: string;
  refinementHistory?: any[];
  designSession?: any;
}

// Utility function for gentle WebGL preparation
const prepareWebGLForModelViewer = () => {
  console.log('🔧 Preparing WebGL for model-viewer (gentle approach)');
  
  // Force garbage collection if available (but don't force context loss)
  if (window.gc) {
    window.gc();
  }
  
  // Just wait for any pending WebGL operations to complete
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        console.log('🔧 WebGL preparation complete');
        resolve(void 0);
      });
    });
  });
};

const CrossDeviceARViewer: React.FC<CrossDeviceARViewerProps> = ({ 
  model, 
  onClose, 
  className = '',
  currentStep,
  generatedResults,
  originalPrompt,
  refinementHistory,
  designSession
}) => {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const modelViewerRef = useRef<any>(null);
  const [webglReady, setWebglReady] = useState(false);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [crossDeviceReady, setCrossDeviceReady] = useState(false);

  // Enhanced initialization with cross-device setup
  useEffect(() => {
    console.log('🔧 CrossDeviceARViewer mounted - enhanced cross-device approach');
    
    const initializeCrossDevice = async () => {
      try {
        // Get comprehensive cross-device setup information
        const setupInfo = await getCrossDeviceSetupInfo();
        
        setNetworkInfo(setupInfo.networkInfo);
        setDeviceInfo(setupInfo.deviceInfo);
        
        console.log('🌐 Cross-device setup info:', setupInfo);
        
        // Optimize WebGL context manager for cross-device AR
        await webglContextManager.optimizeForCrossDeviceAR();
        
        setCrossDeviceReady(true);
        setWebglReady(true);
        
        // Log setup recommendations
        if (setupInfo.recommendations.length > 0) {
          console.log('💡 Cross-device recommendations:');
          setupInfo.recommendations.forEach(rec => console.log(`  ${rec}`));
        }
        
      } catch (error) {
        console.error('❌ Cross-device initialization failed:', error);
        setLoadError('Cross-device setup failed');
      }
    };
    
    initializeCrossDevice();
  }, []);

  // Cleanup on unmount - dispose context with manager
  useEffect(() => {
    return () => {
      // Component unmounting - no specific cleanup needed as manager handles disposal
      console.log('🔧 CrossDeviceARViewer unmounting');
    };
  }, []);

  // Load model-viewer script dynamically
  useEffect(() => {
    const loadModelViewer = async () => {
      if (customElements.get('model-viewer')) {
        setScriptLoaded(true);
        return;
      }

      try {
        const script = document.createElement('script');
        script.type = 'module';
        script.src = 'https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js';
        
        script.onload = () => {
          console.log('✅ Model Viewer loaded successfully');
          setScriptLoaded(true);
        };
        
        script.onerror = () => {
          console.error('❌ Failed to load Model Viewer');
          setLoadError('Failed to load AR viewer');
        };
        
        document.head.appendChild(script);
      } catch (error) {
        console.error('❌ Error loading Model Viewer:', error);
        setLoadError('AR viewer initialization failed');
      }
    };

    loadModelViewer();

    return () => {
      const scripts = document.querySelectorAll('script[src*="model-viewer"]');
      scripts.forEach(script => script.remove());
    };
  }, []);

  useEffect(() => {
    if (scriptLoaded && model && webglReady) {
      console.log('🔧 All conditions met, creating model viewer');
      // Minimal delay to allow any pending operations to complete
      const initTimer = setTimeout(() => {
        createModelViewer();
      }, 100); // Reduced delay - just enough for cleanup
      
      return () => clearTimeout(initTimer);
    }
    
    // Cleanup function to prevent WebGL context issues
    return () => {
      if (modelViewerRef.current) {
        const modelViewer = modelViewerRef.current.querySelector('model-viewer');
        if (modelViewer) {
          // Force model-viewer to dispose of its WebGL context
          try {
            // Stop any ongoing animations or processes
            if (typeof modelViewer.pause === 'function') {
              modelViewer.pause();
            }
            if (typeof modelViewer.dismissPoster === 'function') {
              modelViewer.dismissPoster();
            }
            // Clear the source to release WebGL resources
            modelViewer.src = '';
            modelViewer.removeAttribute('src');
            // Force garbage collection of WebGL resources
            if (typeof modelViewer.renderer?.dispose === 'function') {
              modelViewer.renderer.dispose();
            }
          } catch (error) {
            console.warn('Model viewer cleanup warning:', error);
          }
        }
        modelViewerRef.current.innerHTML = '';
      }
    };
  }, [scriptLoaded, model, webglReady]);

  const getModelUrl = useCallback(() => {
    return model?.cadModel?.gltfUrl || '';
  }, [model]);

  const getProductName = useCallback(() => {
    return getModelProductName(model);
  }, [model]);

  const getDeviceInfo = () => {
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isSafari = /Safari/.test(userAgent) && !/Chrome/.test(userAgent);
    const isChrome = /Chrome/.test(userAgent);
    const isDesktop = /Windows|Mac|Linux/.test(userAgent) && !isAndroid && !isIOS;

    if (isIOS && isSafari) {
      return {
        device: 'iOS Safari',
        arMode: 'Quick Look',
        icon: '📱',
        support: 'Native AR support via Quick Look'
      };
    } else if (isAndroid && isChrome) {
      return {
        device: 'Android Chrome',
        arMode: 'Scene Viewer',
        icon: '🤖',
        support: 'Google ARCore Scene Viewer'
      };
    } else if (isDesktop) {
      return {
        device: 'Desktop/Laptop',
        arMode: '3D Viewer Only',
        icon: '💻',
        support: '3D model viewing (AR not available on desktop)'
      };
    } else {
      return {
        device: 'Other Device',
        arMode: '3D Viewer Only',
        icon: '💻',
        support: '3D model viewing (AR not available)'
      };
    }
  };

  const createModelViewer = () => {
    if (!modelViewerRef.current || !model) return;

    // Clear any existing model-viewer to prevent WebGL conflicts
    if (modelViewerRef.current.innerHTML) {
      modelViewerRef.current.innerHTML = '';
      // Small delay to ensure cleanup
      setTimeout(() => {
        createModelViewerElement();
      }, 50);
      return;
    }
    
    createModelViewerElement();
  };

  const createModelViewerElement = () => {
    if (!modelViewerRef.current || !model) return;

    const modelUrl = getModelUrl();
    const productName = getProductName();
    const deviceInfo = getDeviceInfo();
    
    const isAndroid = /Android/.test(navigator.userAgent);
    const arModes = isAndroid ? 'webxr scene-viewer quick-look' : 'quick-look webxr';
    
    const modelViewerHTML = `
      <model-viewer
        src="${modelUrl}"
        alt="${productName} 3D model"
        ar
        ar-modes="${arModes}"
        ar-scale="auto"
        ar-placement="floor"
        camera-controls
        touch-action="pan-y"
        loading="lazy"
        interaction-prompt="auto"
        interaction-prompt-threshold="3000"
        environment-image="neutral"
        shadow-intensity="0.3"
        exposure="0.8"
        auto-rotate
        auto-rotate-delay="5000"
        xr-environment
        disable-zoom
        disable-pan
        seamless-poster
        style="width: 100%; height: 100%; background-color: transparent;"
        crossorigin="anonymous"
        data-js-focus-visible
        reveal="interaction"
        preload>
        
        <div slot="ar-button" style="
          position: absolute;
          bottom: 20px;
          left: 50%;
          transform: translateX(-50%);
          background: #4CAF50;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 25px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(0,0,0,0.3);
          z-index: 1000;
        ">
          👆 View in AR
        </div>
      </model-viewer>
    `;
    
    modelViewerRef.current.innerHTML = modelViewerHTML;
    
    const modelViewer = modelViewerRef.current.querySelector('model-viewer');
    if (modelViewer) {
      modelViewer.addEventListener('load', () => {
        console.log('✅ Model loaded successfully');
        setIsModelLoaded(true);
        setLoadError(null);
      });

      modelViewer.addEventListener('error', (event: any) => {
        console.error('❌ Model loading error:', event);
        setLoadError('Failed to load 3D model');
        setIsModelLoaded(false);
      });

      // AR status monitoring
      modelViewer.addEventListener('ar-status', (event: any) => {
        const status = event.detail.status;
        console.log('🔮 AR status:', status);
        
        if (status === 'session-started') {
          console.log('🎉 AR session started successfully');
        } else if (status === 'not-presenting') {
          console.log('📱 AR session ended');
        } else if (status === 'failed') {
          console.error('❌ AR session failed');
        }
      });
    }
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
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 inline mr-2" />
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!scriptLoaded && !loadError) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-white">
          <Loader2 className="w-8 h-8 mx-auto mb-4 animate-spin" />
          <p>Loading AR viewer...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-white">
          <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-red-400" />
          <p className="text-red-400">{loadError}</p>
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

  const deviceDetails = getDeviceInfo();

  return (
    <div className={`${className} relative w-full`}>
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex flex-col" style={{ minHeight: '820px' }}>

        <div className="relative flex-1 mb-6">
          <div 
            className="bg-black rounded-2xl overflow-hidden border border-white/10 relative w-full h-full"
            style={{ minHeight: '720px' }}
          >
            <div ref={modelViewerRef} style={{ width: '100%', height: '100%' }} />
            
            {(!isModelLoaded || !webglReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center text-white">
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  <p>{!webglReady ? 'Preparing WebGL context...' : 'Loading 3D model...'}</p>
                </div>
              </div>
            )}

            {isModelLoaded && (
              <div className="absolute top-4 right-4">
                <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm border border-green-500/30">
                  AR Ready
                </div>
              </div>
            )}
          </div>

          {/* Device Info Panel */}
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl p-4 text-white text-sm max-w-64">
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#4CAF50' }}>
              {deviceDetails.icon} Cross-Device AR
            </h4>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>
              <strong>Device:</strong> {deviceDetails.device}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>
              <strong>AR Mode:</strong> {deviceDetails.arMode}
            </p>
            <p style={{ margin: '0', fontSize: '0.75rem', opacity: 0.8 }}>
              {deviceDetails.support}
            </p>
            
            {deviceDetails.arMode !== '3D Viewer Only' && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.5rem', 
                background: 'rgba(76, 175, 80, 0.2)', 
                borderRadius: '4px', 
                fontSize: '0.75rem' 
              }}>
                <strong>💡 Tip:</strong> Look for the "👆 View in AR" button at the bottom to launch AR
              </div>
            )}
          </div>
        </div>

        {/* Enhanced QR Code for cross-device AR with shared model support */}
        {deviceInfo && !deviceInfo.supportsAR && networkInfo && (
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
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(255, 152, 0, 0.95)',
              color: 'white',
              border: '2px solid rgba(255, 193, 7, 0.8)',
              padding: '16px 24px',
              borderRadius: '25px',
              fontSize: '14px',
              fontWeight: '600',
              textAlign: 'center',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              zIndex: 1000,
              maxWidth: '320px',
              lineHeight: '1.4'
            }}
          />
        )}

        {/* Network connectivity status */}
        {crossDeviceReady && networkInfo && networkInfo.isLocalhost && (
          <div className="absolute bottom-4 left-4 bg-blue-500/20 text-blue-400 px-3 py-1 rounded-full text-xs border border-blue-500/30">
            🌐 Network: {networkInfo.preferredIP}
          </div>
        )}

        <div className="text-center">
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

export default CrossDeviceARViewer;
