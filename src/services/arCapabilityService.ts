// Enhanced AR Capability Detection Service
export interface ARCapabilities {
  // Device Detection
  isIOS: boolean;
  isAndroid: boolean;
  isMobile: boolean;
  isDesktop: boolean;
  
  // Browser Capabilities
  hasWebXR: boolean;
  hasWebXRImmersive: boolean;
  hasCamera: boolean;
  hasDeviceOrientation: boolean;
  
  // AR Method Support
  supportsQuickLook: boolean;
  supportsSceneViewer: boolean;
  supportsModelViewer: boolean;
  supportsWebXRAR: boolean;
  
  // Recommended Method
  recommendedMethod: ARMethod;
  fallbackMethods: ARMethod[];
}

export type ARMethod = 
  | 'quicklook'      // iOS native AR (best for iOS)
  | 'scene-viewer'   // Android native AR  
  | 'webxr'          // WebXR immersive AR
  | 'model-viewer'   // Web component AR
  | '3d-fallback'    // 3D viewer only
  | 'unsupported';

class ARCapabilityService {
  private capabilities: ARCapabilities | null = null;
  
  async detectCapabilities(): Promise<ARCapabilities> {
    if (this.capabilities) {
      return this.capabilities;
    }

    console.log('🔍 Detecting AR capabilities...');
    
    const userAgent = navigator.userAgent;
    const isIOS = /iPad|iPhone|iPod/.test(userAgent);
    const isAndroid = /Android/.test(userAgent);
    const isMobile = isIOS || isAndroid || /Mobile/.test(userAgent);
    const isDesktop = !isMobile;

    // Browser capability detection
    const hasWebXR = 'xr' in navigator;
    let hasWebXRImmersive = false;
    let hasCamera = false;
    let hasDeviceOrientation = false;

    // Check WebXR immersive AR support
    if (hasWebXR) {
      try {
        const xr = (navigator as any).xr;
        hasWebXRImmersive = await xr.isSessionSupported('immersive-ar');
      } catch (error) {
        console.log('WebXR immersive AR not supported:', error);
      }
    }

    // Check camera access
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: 'environment' } 
        });
        hasCamera = true;
        stream.getTracks().forEach(track => track.stop()); // Clean up
      }
    } catch (error) {
      console.log('Camera access not available:', error);
    }

    // Check device orientation
    hasDeviceOrientation = 'DeviceOrientationEvent' in window;

    // AR Method Support Detection
    const supportsQuickLook = isIOS && 
      (parseFloat((userAgent.match(/OS (\d+)_/) || ['', '0'])[1]) >= 12);
    
    const supportsSceneViewer = isAndroid && 
      (parseInt((userAgent.match(/Android (\d+)/) || ['', '0'])[1]) >= 7);
    
    const supportsModelViewer = hasCamera || isDesktop;
    const supportsWebXRAR = hasWebXRImmersive;

    // Determine recommended method and fallbacks
    const { recommendedMethod, fallbackMethods } = this.determineOptimalARMethod({
      isIOS,
      isAndroid,
      isMobile,
      isDesktop,
      supportsQuickLook,
      supportsSceneViewer,
      supportsModelViewer,
      supportsWebXRAR,
      hasCamera
    });

    this.capabilities = {
      isIOS,
      isAndroid,
      isMobile,
      isDesktop,
      hasWebXR,
      hasWebXRImmersive,
      hasCamera,
      hasDeviceOrientation,
      supportsQuickLook,
      supportsSceneViewer,
      supportsModelViewer,
      supportsWebXRAR,
      recommendedMethod,
      fallbackMethods,
    };

    console.log('🎯 AR Capabilities detected:', this.capabilities);
    return this.capabilities;
  }

  private determineOptimalARMethod(caps: any): { 
    recommendedMethod: ARMethod; 
    fallbackMethods: ARMethod[] 
  } {
    // Priority order based on device and capabilities
    if (caps.isIOS && caps.supportsQuickLook) {
      return {
        recommendedMethod: 'quicklook',
        fallbackMethods: ['model-viewer', '3d-fallback']
      };
    }

    if (caps.isAndroid && caps.supportsSceneViewer) {
      return {
        recommendedMethod: 'scene-viewer',
        fallbackMethods: ['webxr', 'model-viewer', '3d-fallback']
      };
    }

    if (caps.supportsWebXRAR) {
      return {
        recommendedMethod: 'webxr',
        fallbackMethods: ['model-viewer', '3d-fallback']
      };
    }

    if (caps.supportsModelViewer) {
      return {
        recommendedMethod: 'model-viewer',
        fallbackMethods: ['3d-fallback']
      };
    }

    return {
      recommendedMethod: '3d-fallback',
      fallbackMethods: []
    };
  }

  // Get user-friendly AR method description
  getMethodDescription(method: ARMethod): string {
    const descriptions = {
      'quicklook': 'iOS Quick Look AR (Native)',
      'scene-viewer': 'Android Scene Viewer (Native)', 
      'webxr': 'WebXR Immersive AR',
      'model-viewer': 'Web-based AR Viewer',
      '3d-fallback': '3D Viewer Only',
      'unsupported': 'AR Not Supported'
    };
    return descriptions[method] || 'Unknown';
  }

  // Reset capabilities (for testing)
  reset(): void {
    this.capabilities = null;
  }

  // Get current capabilities without re-detection
  getCurrentCapabilities(): ARCapabilities | null {
    return this.capabilities;
  }
}

export const arCapabilityService = new ARCapabilityService();