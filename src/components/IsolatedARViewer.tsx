import React, { useEffect, useRef, useState } from 'react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName } from '../utils/productNameExtractor';

interface IsolatedARViewerProps {
  model: ArchitecturalModel | null;
  onClose: (e?: React.MouseEvent) => void;
  className?: string;
}

/**
 * Isolated AR Viewer using iframe to completely separate WebGL contexts
 * This prevents WebGL context conflicts between Three.js and model-viewer
 */
const IsolatedARViewer: React.FC<IsolatedARViewerProps> = ({ model, onClose, className = '' }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getModelUrl = () => model?.cadModel?.gltfUrl || '';
  const getProductName = () => getModelProductName(model);

  // Create isolated AR viewer HTML content
  const createIframeContent = () => {
    const modelUrl = getModelUrl();
    const productName = getProductName();
    
    const isAndroid = /Android/.test(navigator.userAgent);
    const arModes = isAndroid ? 'webxr scene-viewer quick-look' : 'quick-look webxr';

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AR Viewer</title>
    <script type="module" src="https://ajax.googleapis.com/ajax/libs/model-viewer/4.1.0/model-viewer.min.js"></script>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
            overflow: hidden;
        }
        
        model-viewer {
            width: 100vw;
            height: 100vh;
            background-color: transparent;
        }
        
        .ar-button {
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
        }
        
        .loading {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            color: white;
            text-align: center;
        }
        
        .spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: #4CAF50;
            animation: spin 1s ease-in-out infinite;
            margin: 0 auto 16px;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        .device-info {
            position: absolute;
            top: 20px;
            left: 20px;
            background: rgba(0,0,0,0.7);
            backdrop-filter: blur(10px);
            border-radius: 12px;
            padding: 16px;
            color: white;
            font-size: 14px;
            max-width: 280px;
        }
        
        .ar-ready {
            position: absolute;
            top: 20px;
            right: 20px;
            background: rgba(76, 175, 80, 0.2);
            color: #4CAF50;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            border: 1px solid rgba(76, 175, 80, 0.3);
        }
        
        .close-button {
            position: absolute;
            top: 20px;
            right: 80px;
            background: rgba(255,255,255,0.1);
            border: 1px solid rgba(255,255,255,0.2);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            cursor: pointer;
            backdrop-filter: blur(10px);
        }
        
        .close-button:hover {
            background: rgba(255,255,255,0.2);
        }
    </style>
</head>
<body>
    <div class="loading" id="loading">
        <div class="spinner"></div>
        <p>Loading AR Viewer...</p>
    </div>
    
    <div class="device-info" id="deviceInfo" style="display: none;">
        <h4 style="margin: 0 0 8px 0; color: #4CAF50;">📱 Cross-Device AR</h4>
        <p style="margin: 0 0 6px 0; font-size: 12px;"><strong>Device:</strong> <span id="deviceType"></span></p>
        <p style="margin: 0 0 6px 0; font-size: 12px;"><strong>AR Mode:</strong> <span id="arMode"></span></p>
        <p style="margin: 0; font-size: 11px; opacity: 0.8;" id="support"></p>
    </div>
    
    <model-viewer
        id="modelViewer"
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
        crossorigin="anonymous"
        data-js-focus-visible
        reveal="interaction"
        preload
        style="display: none;">
        
        <div slot="ar-button" class="ar-button">
            👆 View in AR
        </div>
    </model-viewer>
    
    <button class="close-button" onclick="closeViewer()">← Back</button>
    <div class="ar-ready" id="arReady" style="display: none;">AR Ready</div>

    <script>
        let modelViewer;
        
        function getDeviceInfo() {
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
                    support: 'Native AR support via Quick Look'
                };
            } else if (isAndroid && isChrome) {
                return {
                    device: 'Android Chrome',
                    arMode: 'Scene Viewer',
                    support: 'Google ARCore Scene Viewer'
                };
            } else if (isDesktop) {
                return {
                    device: 'Desktop/Laptop',
                    arMode: '3D Viewer Only',
                    support: '3D model viewing (AR not available on desktop)'
                };
            } else {
                return {
                    device: 'Other Device',
                    arMode: '3D Viewer Only',
                    support: '3D model viewing (AR not available)'
                };
            }
        }
        
        function setupDeviceInfo() {
            const deviceInfo = getDeviceInfo();
            document.getElementById('deviceType').textContent = deviceInfo.device;
            document.getElementById('arMode').textContent = deviceInfo.arMode;
            document.getElementById('support').textContent = deviceInfo.support;
            document.getElementById('deviceInfo').style.display = 'block';
        }
        
        function closeViewer() {
            // Send message to parent to close the viewer
            window.parent.postMessage({ action: 'closeARViewer' }, '*');
        }
        
        document.addEventListener('DOMContentLoaded', function() {
            console.log('🔧 Isolated AR viewer initialized');
            
            modelViewer = document.getElementById('modelViewer');
            setupDeviceInfo();
            
            // Model loading events
            modelViewer.addEventListener('load', function() {
                console.log('✅ Model loaded in isolated context');
                document.getElementById('loading').style.display = 'none';
                modelViewer.style.display = 'block';
                document.getElementById('arReady').style.display = 'block';
            });
            
            modelViewer.addEventListener('error', function(event) {
                console.error('❌ Model loading error in isolated context:', event);
                document.getElementById('loading').innerHTML = 
                    '<div style="color: #ff6b6b; text-align: center;">' +
                    '<p>Failed to load 3D model</p>' +
                    '<button onclick="closeViewer()" style="margin-top: 10px; padding: 8px 16px; background: #666; color: white; border: none; border-radius: 4px; cursor: pointer;">Go Back</button>' +
                    '</div>';
            });
            
            // AR status monitoring
            modelViewer.addEventListener('ar-status', function(event) {
                const status = event.detail.status;
                console.log('🔮 AR status in isolated context:', status);
                
                if (status === 'session-started') {
                    console.log('🎉 AR session started in isolated context');
                } else if (status === 'not-presenting') {
                    console.log('📱 AR session ended in isolated context');
                } else if (status === 'failed') {
                    console.error('❌ AR session failed in isolated context');
                }
            });
            
            // Log WebGL context creation
            console.log('🔍 Isolated context WebGL info:', {
                webglSupported: !!(document.createElement('canvas').getContext('webgl') || 
                                 document.createElement('canvas').getContext('experimental-webgl')),
                url: '${modelUrl}',
                userAgent: navigator.userAgent
            });
        });
        
        // Handle messages from parent
        window.addEventListener('message', function(event) {
            if (event.data.action === 'refreshModel') {
                location.reload();
            }
        });
    </script>
</body>
</html>`;
  };

  useEffect(() => {
    if (!model || !iframeRef.current) return;

    const iframe = iframeRef.current;
    
    // Add delay to ensure previous WebGL contexts are properly disposed
    const initializeIframe = () => {
      console.log('🔧 Initializing iframe with WebGL context cleanup delay');
      
      // Create and inject the iframe content
      const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (iframeDoc) {
        iframeDoc.open();
        iframeDoc.write(createIframeContent());
        iframeDoc.close();
        setIframeLoaded(true);
      }
    };
    
    // Wait for any previous WebGL contexts to be disposed (React cleanup + browser GC)
    // Increased delay to ensure proper cleanup when WEBGL_lose_context is not supported
    const initTimer = setTimeout(initializeIframe, 1500);

    // Listen for messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      if (event.data.action === 'closeARViewer') {
        onClose();
      }
    };

    window.addEventListener('message', handleMessage);
    
    return () => {
      clearTimeout(initTimer);
      window.removeEventListener('message', handleMessage);
    };
  }, [model, onClose]);

  if (!model) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-gray-400">
          <p>No 3D model available for AR visualization</p>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onClose(e);
            }}
            className="mt-4 px-4 py-2 horizon-button-primary"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className} relative w-full`}>
      <div className="cosmic-panel rounded-2xl p-6 flex flex-col" style={{ minHeight: '820px' }}>
        <div className="text-center max-w-4xl mx-auto mb-6">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full horizon-card flex items-center justify-center">
            <span className="text-3xl">🔗</span>
          </div>
          
          <h3 className="text-3xl font-bold text-white mb-4">
            Isolated AR Experience - {getProductName()}
          </h3>
          
          <p className="text-gray-300 text-lg mb-6 leading-relaxed">
            This AR viewer runs in complete isolation to prevent WebGL conflicts. 
            Experience your {getProductName().toLowerCase()} in real-world scale.
          </p>
        </div>

        <div className="relative flex-1 mb-6">
          <div 
            className="cosmic-panel rounded-2xl overflow-hidden relative w-full h-full border border-gray-700"
            style={{ minHeight: '720px' }}
          >
            <iframe
              ref={iframeRef}
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '16px'
              }}
              sandbox="allow-scripts allow-same-origin allow-popups allow-presentation" // allow-same-origin needed for model-viewer CORS
              title="Isolated AR Viewer"
              onLoad={() => {
                console.log('🔧 Iframe loaded successfully');
                setIframeLoaded(true);
              }}
              onError={() => {
                console.error('❌ Iframe failed to load');
                setError('Failed to initialize AR viewer');
              }}
            />
            
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div className="text-center text-white">
                  <div className="w-12 h-12 mx-auto mb-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-lg mb-2">Initializing Isolated AR Context...</p>
                  <p className="text-sm text-gray-400">This prevents WebGL conflicts</p>
                </div>
              </div>
            )}

            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-sm">
                <div className="text-center text-white">
                  <div className="text-red-400 text-4xl mb-4">⚠️</div>
                  <p className="text-red-400 text-lg mb-4">{error}</p>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onClose(e);
                    }}
                    className="px-6 py-2 horizon-button-primary"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center">
          <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full"></span>
              Isolated WebGL Context
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-400 rounded-full"></span>
              No Context Conflicts
            </span>
            <span className="flex items-center gap-2">
              <span className="w-2 h-2 bg-purple-400 rounded-full"></span>
              Enhanced Stability
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IsolatedARViewer;