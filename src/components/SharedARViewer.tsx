import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Camera, ArrowLeft, Smartphone, AlertTriangle, Loader2 } from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName } from '../utils/productNameExtractor';
import QRCodeGenerator from './QRCodeGenerator';
import { webglContextSharing } from '../utils/webglContextSharing';

interface SharedARViewerProps {
  model: ArchitecturalModel | null;
  onClose: (e?: React.MouseEvent) => void;
  className?: string;
  sharedContextId: string;
}

/**
 * SharedARViewer - Uses preserved WebGL context from Three.js for model-viewer
 * This prevents WebGL context loss by reusing existing contexts
 */
const SharedARViewer: React.FC<SharedARViewerProps> = ({ 
  model, 
  onClose, 
  className = '', 
  sharedContextId 
}) => {
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [contextReady, setContextReady] = useState(false);
  const modelViewerRef = useRef<HTMLDivElement>(null);
  const modelViewerElementRef = useRef<HTMLElement | null>(null);

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
          console.log('✅ Model Viewer loaded successfully for shared context');
          setScriptLoaded(true);
        };
        
        script.onerror = () => {
          console.error('❌ Failed to load Model Viewer for shared context');
          setLoadError('Failed to load AR viewer');
        };
        
        document.head.appendChild(script);
      } catch (error) {
        console.error('❌ Error loading Model Viewer for shared context:', error);
        setLoadError('AR viewer initialization failed');
      }
    };

    loadModelViewer();

    return () => {
      // Cleanup model viewer element
      if (modelViewerElementRef.current) {
        try {
          const modelViewer = modelViewerElementRef.current;
          if (typeof (modelViewer as any).pause === 'function') {
            (modelViewer as any).pause();
          }
          (modelViewer as any).src = '';
        } catch (error) {
          console.warn('Cleanup warning:', error);
        }
      }
    };
  }, []);

  // Create shared model-viewer when conditions are met
  useEffect(() => {
    if (scriptLoaded && model && modelViewerRef.current) {
      createSharedModelViewer();
    }
  }, [scriptLoaded, model]);

  const createSharedModelViewer = async () => {
    if (!modelViewerRef.current || !model) return;

    console.log('🔄 Creating model-viewer with shared WebGL context');
    setContextReady(false);

    try {
      const modelUrl = getModelUrl();
      const productName = getProductName();
      
      // Use the shared context system
      const modelViewer = await webglContextSharing.createSharedModelViewer(
        modelViewerRef.current,
        modelUrl,
        productName,
        sharedContextId
      );

      if (modelViewer) {
        modelViewerElementRef.current = modelViewer;
        
        // Set up event listeners
        modelViewer.addEventListener('load', () => {
          console.log('✅ Shared model loaded successfully');
          setIsModelLoaded(true);
          setLoadError(null);
          setContextReady(true);
        });

        modelViewer.addEventListener('error', (event: any) => {
          console.error('❌ Shared model loading error:', event);
          setLoadError('Failed to load 3D model with shared context');
          setIsModelLoaded(false);
        });

        // AR status monitoring
        modelViewer.addEventListener('ar-status', (event: any) => {
          const status = event.detail.status;
          console.log('🔮 Shared AR status:', status);
          
          if (status === 'session-started') {
            console.log('🎉 Shared AR session started successfully');
          } else if (status === 'not-presenting') {
            console.log('📱 Shared AR session ended');
          } else if (status === 'failed') {
            console.error('❌ Shared AR session failed');
          }
        });

        setContextReady(true);
      } else {
        setLoadError('Failed to create shared model viewer');
      }
      
    } catch (error) {
      console.error('❌ Error creating shared model viewer:', error);
      setLoadError('Shared context creation failed');
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
          <p>Loading Shared AR viewer...</p>
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

  const deviceInfo = getDeviceInfo();

  return (
    <div className={`${className} relative w-full`}>
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 flex flex-col" style={{ minHeight: '820px' }}>
        <div className="text-center max-w-4xl mx-auto mb-6">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gradient-to-r from-green-400 to-blue-400 flex items-center justify-center">
            <span className="text-3xl">🔄</span>
          </div>
          
          <h3 className="text-3xl font-bold text-white mb-4">
            Shared Context AR - {getProductName()}
          </h3>
          
          <p className="text-gray-300 text-lg mb-6 leading-relaxed">
            This AR viewer reuses the WebGL context from the 3D viewer, preventing context loss. 
            Experience your {getProductName().toLowerCase()} seamlessly.
          </p>
        </div>

        <div className="relative flex-1 mb-6">
          <div 
            className="bg-black rounded-2xl overflow-hidden border border-white/10 relative w-full h-full"
            style={{ minHeight: '720px' }}
          >
            <div ref={modelViewerRef} style={{ width: '100%', height: '100%' }} />
            
            {(!isModelLoaded || !contextReady) && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <div className="text-center text-white">
                  <Loader2 className="w-8 h-8 mx-auto mb-2 animate-spin" />
                  <p>{!contextReady ? 'Preparing shared WebGL context...' : 'Loading 3D model...'}</p>
                </div>
              </div>
            )}

            {isModelLoaded && contextReady && (
              <div className="absolute top-4 right-4">
                <div className="bg-green-500/20 text-green-400 px-3 py-1 rounded-full text-sm border border-green-500/30">
                  AR Ready (Shared Context)
                </div>
              </div>
            )}
          </div>

          {/* Context Status Panel */}
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl p-4 text-white text-sm max-w-64">
            <h4 style={{ margin: '0 0 0.5rem 0', color: '#4CAF50' }}>
              🔄 Context Sharing
            </h4>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>
              <strong>Status:</strong> {contextReady ? 'Active' : 'Preparing'}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>
              <strong>Context ID:</strong> {sharedContextId.slice(-8)}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>
              <strong>Device:</strong> {deviceInfo.device}
            </p>
            <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.8rem' }}>
              <strong>AR Mode:</strong> {deviceInfo.arMode}
            </p>
            <p style={{ margin: '0', fontSize: '0.75rem', opacity: 0.8 }}>
              WebGL context preserved from 3D viewer
            </p>
            
            {deviceInfo.arMode !== '3D Viewer Only' && (
              <div style={{ 
                marginTop: '1rem', 
                padding: '0.5rem', 
                background: 'rgba(76, 175, 80, 0.2)', 
                borderRadius: '4px', 
                fontSize: '0.75rem' 
              }}>
                <strong>💡 Tip:</strong> Look for the "👆 View in AR" button at the bottom
              </div>
            )}
          </div>
        </div>

        {/* QR Code for non-AR devices */}
        {deviceInfo.arMode === '3D Viewer Only' && (
          <QRCodeGenerator 
            currentUrl={window.location.href}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              background: 'rgba(34, 197, 94, 0.95)',
              color: 'white',
              border: '2px solid rgba(34, 197, 94, 0.8)',
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

export default SharedARViewer;