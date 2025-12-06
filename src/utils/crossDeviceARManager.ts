// Cross-Device AR Manager - Port from root directory AR functionality
// Enhanced cross-device AR compatibility and management

export interface ARCapabilities {
  webxrSupported: boolean;
  sceneViewerSupported: boolean;
  arCoreVersion: string | null;
  integrationMode: 'webxr' | 'scene-viewer' | '3d-only' | 'unknown';
  deviceInfo: {
    isAndroid: boolean;
    isChrome: boolean;
    chromeVersion: number;
    androidVersion: number;
    isSecureContext: boolean;
    hasWebGL: boolean;
    hasWebXR: boolean;
  };
  recommendations: string[];
  warnings: string[];
}

export interface ModelValidation {
  isValid: boolean;
  size: number;
  sizeFormatted: string;
  sceneViewerCompatible: boolean;
  arCoreOptimized: boolean;
  score: number;
  issues: string[];
  recommendations: string[];
}

// Enhanced cross-device compatibility detection (supports desktop + mobile)
export const checkCrossDeviceARSupport = (): ARCapabilities => {
  const userAgent = navigator.userAgent;
  const isAndroid = /Android/.test(userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(userAgent);
  const isMobile = isAndroid || isIOS;
  const isDesktop = !isMobile;
  const isChrome = /Chrome/.test(userAgent);
  const isSafari = /Safari/.test(userAgent) && !isChrome;
  const chromeVersion = isChrome ? parseInt(userAgent.match(/Chrome\/(\d+)/)?.[1] || '0') : 0;
  const androidVersion = isAndroid ? parseFloat(userAgent.match(/Android ([\d.]+)/)?.[1] || '0') : 0;
  
  const hasWebXR = 'xr' in navigator;
  const hasDeviceOrientation = typeof DeviceOrientationEvent !== 'undefined';
  const isSecureContext = window.isSecureContext || window.location.protocol === 'http:'; // Allow localhost
  
  const hasWebGL = (() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl', { xrCompatible: true });
      return !!gl;
    } catch {
      return false;
    }
  })();
  
  // WebXR compatibility (more permissive for cross-device)
  const webxrCompatible = (
    hasWebGL && 
    isSecureContext && 
    (
      // Native AR devices
      (isAndroid && isChrome && chromeVersion >= 88 && androidVersion >= 7.0 && hasWebXR) ||
      // Desktop browsers that can support WebXR
      (isDesktop && isChrome && chromeVersion >= 88) ||
      // iOS devices with modern Safari
      (isIOS && isSafari)
    )
  );
  
  // Scene Viewer compatibility (Android Chrome + iOS Safari + Desktop for QR handoff)
  const sceneViewerCompatible = (
    hasWebGL && 
    (
      // Android Scene Viewer
      (isAndroid && isChrome && chromeVersion >= 88 && androidVersion >= 7.0) ||
      // iOS Quick Look AR
      (isIOS && isSafari) ||
      // Desktop browsers for QR code handoff to mobile
      (isDesktop && (isChrome || isSafari))
    )
  );

  const capabilities: ARCapabilities = {
    webxrSupported: webxrCompatible,
    sceneViewerSupported: sceneViewerCompatible,
    arCoreVersion: null,
    integrationMode: 'unknown',
    deviceInfo: {
      isAndroid,
      isChrome,
      chromeVersion,
      androidVersion,
      isSecureContext,
      hasWebGL,
      hasWebXR,
    },
    recommendations: [],
    warnings: []
  };

  // Determine integration mode (enhanced logic for cross-device)
  if (isDesktop && sceneViewerCompatible) {
    capabilities.integrationMode = 'scene-viewer';
    capabilities.arCoreVersion = 'Cross-Device AR (QR Handoff)';
    capabilities.recommendations.push('📱 Desktop detected - AR via QR code to mobile device');
  } else if (webxrCompatible && hasWebXR) {
    capabilities.integrationMode = 'webxr';
    capabilities.arCoreVersion = 'Native WebXR';
    capabilities.recommendations.push('✅ Native WebXR AR ready');
  } else if (isIOS && isSafari) {
    capabilities.integrationMode = 'scene-viewer';
    capabilities.arCoreVersion = 'iOS Quick Look';
    capabilities.recommendations.push('📱 iOS Quick Look AR available');
  } else if (isAndroid && isChrome) {
    capabilities.integrationMode = 'scene-viewer';
    capabilities.arCoreVersion = 'Android Scene Viewer';
    capabilities.recommendations.push('📱 Android Scene Viewer AR available');
  } else {
    capabilities.integrationMode = '3d-only';
    capabilities.recommendations.push('📺 3D preview only - use QR code for mobile AR');
  }

  // Add warnings based on compatibility issues
  if (!isSecureContext) {
    capabilities.warnings.push('⚠️ HTTPS required for AR functionality');
  }
  if (!hasWebGL) {
    capabilities.warnings.push('⚠️ WebGL not supported - AR will not work');
  }
  if (isAndroid && chromeVersion < 88) {
    capabilities.warnings.push('⚠️ Chrome version too old for AR - update to Chrome 88+');
  }
  if (isAndroid && androidVersion < 7.0) {
    capabilities.warnings.push('⚠️ Android version too old for AR - requires Android 7.0+');
  }

  console.log('🔍 Cross-device AR capabilities:', capabilities);
  return capabilities;
};

// WebXR Session Manager (from root directory)
export class WebXRSessionManager {
  private session: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private isSupported = false;
  private isInitialized = false;

  async checkSupport(): Promise<boolean> {
    console.log('🔍 Checking WebXR support...');
    
    if (!('xr' in navigator)) {
      console.warn('❌ WebXR not available');
      return false;
    }

    try {
      this.isSupported = await navigator.xr!.isSessionSupported('immersive-ar');
      console.log(`✅ WebXR AR supported: ${this.isSupported}`);
      return this.isSupported;
    } catch (error) {
      console.error('❌ WebXR support check failed:', error);
      return false;
    }
  }

  async initializeSession(): Promise<XRSession> {
    console.log('🚀 Initializing WebXR AR session...');
    
    if (!this.isSupported) {
      throw new Error('WebXR AR not supported');
    }

    try {
      this.session = await navigator.xr!.requestSession('immersive-ar', {
        requiredFeatures: ['local'],
        optionalFeatures: ['local-floor', 'bounded-floor', 'hit-test']
      });

      console.log('✅ WebXR AR session created');

      // Set up reference space
      this.referenceSpace = await this.session.requestReferenceSpace('local');
      console.log('✅ Reference space established');

      // Set up session event handlers
      this.session.addEventListener('end', () => {
        console.log('🔚 WebXR session ended');
        this.cleanup();
      });

      this.isInitialized = true;
      
      console.log('📊 WebXR Session Details:', {
        session: this.session,
        referenceSpace: this.referenceSpace.type,
        inputSources: this.session.inputSources.length,
        renderState: this.session.renderState
      });

      return this.session;

    } catch (error) {
      console.error('❌ WebXR session initialization failed:', error);
      throw error;
    }
  }

  async endSession(): Promise<void> {
    if (this.session) {
      console.log('🔚 Ending WebXR session...');
      await this.session.end();
    }
  }

  cleanup(): void {
    this.session = null;
    this.referenceSpace = null;
    this.isInitialized = false;
    console.log('🧹 WebXR session cleaned up');
  }
}

// Model validation for cross-device compatibility (handles blob URLs)
export const validateModelForCrossDevice = async (modelUrl: string): Promise<ModelValidation> => {
  console.log('🔍 Validating model for cross-device AR:', modelUrl);
  
  try {
    // Handle blob URLs specially (common in AGENTICAD)
    if (modelUrl.startsWith('blob:')) {
      console.log('📦 Blob URL detected - using special validation');
      
      const validation: ModelValidation = {
        isValid: true,
        size: 0, // Cannot determine blob size without fetch
        sizeFormatted: 'Unknown (Blob URL)',
        sceneViewerCompatible: true, // Assume compatible if it's a generated blob
        arCoreOptimized: true,
        score: 80, // Good score for blob URLs
        issues: [],
        recommendations: [
          '✅ Blob URL detected (locally generated model)',
          '✅ Compatible with AR viewers',
          '📱 Suitable for cross-device AR'
        ]
      };
      
      // Try to get some info about the blob without HEAD request
      try {
        const response = await fetch(modelUrl, { method: 'GET', cache: 'no-cache' });
        if (response.ok) {
          const blob = await response.blob();
          validation.size = blob.size;
          validation.sizeFormatted = formatFileSize(blob.size);
          
          // Update recommendations based on actual size
          const sizeMB = blob.size / 1024 / 1024;
          if (sizeMB > 50) {
            validation.issues.push(`⚠️ Large file: ${sizeMB.toFixed(2)}MB. May cause issues on mobile`);
            validation.score = 50;
          } else if (sizeMB > 10) {
            validation.recommendations.push(`📊 File size: ${sizeMB.toFixed(2)}MB (acceptable)`);
            validation.score = 70;
          } else {
            validation.recommendations.push(`✅ Optimal file size: ${sizeMB.toFixed(2)}MB`);
            validation.score = 90;
          }
        }
      } catch (blobError) {
        console.warn('Could not fetch blob details:', blobError);
        validation.recommendations.push('⚠️ Could not analyze blob size');
      }
      
      return validation;
    }
    
    // Regular URL validation
    const response = await fetch(modelUrl, { method: 'HEAD' });
    
    if (!response.ok) {
      throw new Error(`Model not accessible: ${response.status} ${response.statusText}`);
    }
    
    const contentType = response.headers.get('content-type');
    const contentLength = response.headers.get('content-length');
    const fileSize = contentLength ? parseInt(contentLength) : 0;
    
    const validation: ModelValidation = {
      isValid: true,
      size: fileSize,
      sizeFormatted: formatFileSize(fileSize),
      sceneViewerCompatible: false,
      arCoreOptimized: false,
      score: 0,
      issues: [],
      recommendations: []
    };
    
    // File size validation for ARCore resource limits
    const sizeMB = fileSize / 1024 / 1024;
    if (sizeMB > 50) {
      validation.issues.push(`❌ File too large: ${sizeMB.toFixed(2)}MB. ARCore limit is ~50MB`);
      validation.recommendations.push('Reduce model complexity and texture resolution');
      validation.score += 0;
    } else if (sizeMB > 10) {
      validation.issues.push(`⚠️ Large file: ${sizeMB.toFixed(2)}MB. May cause memory issues`);
      validation.recommendations.push('Consider optimizing for better performance');
      validation.score += 30;
    } else if (sizeMB > 5) {
      validation.recommendations.push(`✅ Good file size: ${sizeMB.toFixed(2)}MB`);
      validation.score += 60;
    } else {
      validation.recommendations.push(`✅ Excellent file size: ${sizeMB.toFixed(2)}MB`);
      validation.score += 80;
    }
    
    // Content-Type validation
    if (contentType?.includes('model/gltf-binary')) {
      validation.score += 20;
      validation.recommendations.push('✅ Correct MIME type for GLB');
    } else if (contentType?.includes('application/octet-stream')) {
      validation.score += 10;
      validation.issues.push('⚠️ Generic MIME type - may cause issues');
    } else {
      validation.issues.push('❌ Incorrect MIME type for 3D model');
    }
    
    // Scene Viewer compatibility assessment
    validation.sceneViewerCompatible = (
      validation.issues.filter(i => i.includes('❌')).length === 0 && 
      sizeMB <= 50
    );
    
    // ARCore optimization score
    validation.arCoreOptimized = validation.score >= 70;
    
    if (validation.sceneViewerCompatible) {
      validation.recommendations.push('✅ Compatible with Android Scene Viewer');
    } else {
      validation.recommendations.push('❌ May have Scene Viewer compatibility issues');
    }
    
    console.log('📊 Model validation results:', validation);
    return validation;
    
  } catch (error) {
    console.error('❌ Model validation failed:', error);
    return {
      isValid: false,
      size: 0,
      sizeFormatted: '0 Bytes',
      sceneViewerCompatible: false,
      arCoreOptimized: false,
      score: 0,
      issues: [`❌ ${error.message}`],
      recommendations: [
        'Check model file exists and is accessible',
        'Ensure HTTPS connection',
        'Verify file is not corrupted'
      ]
    };
  }
};

// Enhanced AR Mode selection for cross-device compatibility
export const selectOptimalARMode = async (modelUrl: string): Promise<{
  mode: 'webxr' | 'scene-viewer' | '3d-only';
  config: any;
  recommendations: string[];
  uiMode: 'native-ar' | 'qr-handoff' | '3d-only';
}> => {
  console.log('🎯 Selecting optimal AR mode...');
  
  const capabilities = checkCrossDeviceARSupport();
  const validation = await validateModelForCrossDevice(modelUrl);
  
  const result = {
    mode: 'scene-viewer' as const, // Default to scene-viewer for better compatibility
    config: {},
    recommendations: [...capabilities.recommendations, ...validation.recommendations],
    uiMode: '3d-only' as const
  };
  
  console.log('📊 AR capabilities for mode selection:', capabilities);
  console.log('📊 Model validation for mode selection:', validation);
  
  // Desktop browsers: Use QR handoff mode
  if (capabilities.integrationMode === 'scene-viewer' && capabilities.arCoreVersion === 'Cross-Device AR (QR Handoff)') {
    result.mode = 'scene-viewer';
    result.uiMode = 'qr-handoff';
    result.config = {
      'ar': true,
      'ar-modes': 'scene-viewer quick-look',
      'ar-scale': 'auto',
      'ar-placement': 'floor',
      'camera-controls': true,
      'auto-rotate': true,
      'touch-action': 'pan-y',
      'loading': 'lazy',
      'interaction-prompt': 'auto'
    };
    result.recommendations.push('📱 Desktop mode: Use QR code to access AR on mobile device');
    console.log('🎯 Selected mode: Desktop QR handoff');
    return result;
  }
  
  // Native WebXR (Android Chrome with WebXR support)
  if (capabilities.webxrSupported && validation.arCoreOptimized) {
    try {
      const sessionManager = new WebXRSessionManager();
      const supported = await sessionManager.checkSupport();
      
      if (supported) {
        result.mode = 'webxr';
        result.uiMode = 'native-ar';
        result.config = {
          'ar': true,
          'ar-modes': 'webxr scene-viewer quick-look',
          'xr-environment': true,
          'camera-controls': true,
          'touch-action': 'pan-y',
          'interaction-prompt': 'auto',
          'auto-rotate': true,
          'loading': 'eager'
        };
        result.recommendations.push('🚀 Native WebXR AR ready');
        console.log('🎯 Selected mode: Native WebXR');
        return result;
      }
    } catch (error) {
      console.warn('WebXR initialization failed, falling back:', error);
    }
  }
  
  // Scene Viewer (Android/iOS native AR)
  if (capabilities.sceneViewerSupported && validation.sceneViewerCompatible) {
    result.mode = 'scene-viewer';
    result.uiMode = 'native-ar';
    result.config = {
      'ar': true,
      'ar-modes': 'scene-viewer quick-look',
      'ar-scale': 'auto',
      'ar-placement': 'floor',
      'camera-controls': true,
      'auto-rotate': true,
      'loading': 'lazy',
      'interaction-prompt': 'auto'
    };
    
    if (capabilities.arCoreVersion === 'iOS Quick Look') {
      result.recommendations.push('📱 iOS Quick Look AR ready');
    } else if (capabilities.arCoreVersion === 'Android Scene Viewer') {
      result.recommendations.push('📱 Android Scene Viewer AR ready');
    } else {
      result.recommendations.push('📱 Scene Viewer AR available');
    }
    
    console.log('🎯 Selected mode: Scene Viewer');
    return result;
  }
  
  // Final fallback: 3D only with QR option
  result.mode = '3d-only';
  result.uiMode = validation.isValid ? 'qr-handoff' : '3d-only';
  result.config = {
    'camera-controls': true,
    'auto-rotate': true,
    'touch-action': 'pan-y',
    'loading': 'eager',
    'interaction-prompt': 'none'
  };
  
  if (result.uiMode === 'qr-handoff') {
    result.recommendations.push('📺 3D preview mode - scan QR code for mobile AR');
  } else {
    result.recommendations.push('📺 3D preview only');
  }
  
  console.log('🎯 Selected AR mode:', result);
  return result;
};

// Enhanced model-viewer WebXR integration (from root directory)
export const enableWebXRForModelViewer = async (modelViewer: any): Promise<boolean> => {
  console.log('🔧 Enabling WebXR for model-viewer...');
  
  try {
    if (!modelViewer.canActivateAR) {
      console.warn('⚠️ Model-viewer AR not available');
      return false;
    }

    // Add event listeners for AR state changes
    modelViewer.addEventListener('ar-status', (event: any) => {
      console.log('🔮 AR Status:', event.detail.status);
      
      if (event.detail.status === 'session-started') {
        console.log('✅ WebXR AR session started in model-viewer');
      } else if (event.detail.status === 'not-presenting') {
        console.log('📱 WebXR AR session ended');
      }
    });

    modelViewer.addEventListener('load', () => {
      console.log('📦 Model-viewer loaded, WebXR ready');
    });

    return true;

  } catch (error) {
    console.error('❌ WebXR model-viewer integration failed:', error);
    return false;
  }
};

// Memory pressure detection (from root directory)
export const detectMemoryPressure = () => {
  const memoryInfo = {
    pressure: 'unknown',
    recommendation: 'Unable to detect memory status'
  };
  
  // Chrome-specific memory API
  if ('memory' in performance) {
    const mem = (performance as any).memory;
    const memoryPressure = mem.usedJSHeapSize / mem.jsHeapSizeLimit;
    
    if (memoryPressure > 0.9) {
      memoryInfo.pressure = 'critical';
      memoryInfo.recommendation = 'Close other apps immediately - very high memory usage';
    } else if (memoryPressure > 0.7) {
      memoryInfo.pressure = 'high';
      memoryInfo.recommendation = 'Close other apps to free memory before using AR';
    } else if (memoryPressure > 0.5) {
      memoryInfo.pressure = 'medium';
      memoryInfo.recommendation = 'Memory usage is elevated but should work';
    } else {
      memoryInfo.pressure = 'low';
      memoryInfo.recommendation = 'Memory usage is good for AR';
    }
    
    console.log('📊 Memory pressure analysis:', {
      used: `${(mem.usedJSHeapSize / 1024 / 1024).toFixed(2)} MB`,
      limit: `${(mem.jsHeapSizeLimit / 1024 / 1024).toFixed(2)} MB`,
      pressure: memoryInfo.pressure,
      recommendation: memoryInfo.recommendation
    });
  }
  
  return memoryInfo;
};

// Utility functions
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Initialize cross-device AR (arjectify pattern from root directory)
export const initializeCrossDeviceAR = async (): Promise<{
  success: boolean;
  mode: string;
  version: string | null;
  recommendations: string[];
}> => {
  console.log('🚀 Initializing cross-device AR...');
  
  const initialization = {
    success: false,
    mode: 'none',
    version: null,
    recommendations: [] as string[]
  };
  
  try {
    // Step 1: Check WebXR availability (primary)
    if ('xr' in navigator) {
      console.log('✅ WebXR API detected');
      
      try {
        const arSupported = await navigator.xr!.isSessionSupported('immersive-ar');
        
        if (arSupported) {
          console.log('✅ WebXR AR sessions supported');
          
          // Test actual session creation
          try {
            const session = await navigator.xr!.requestSession('immersive-ar', {
              requiredFeatures: ['local'],
              optionalFeatures: ['local-floor', 'bounded-floor', 'hit-test']
            });
            
            console.log('✅ WebXR AR session created successfully');
            initialization.success = true;
            initialization.mode = 'webxr';
            initialization.version = 'Chrome WebXR + ARCore';
            initialization.recommendations.push('✅ Native WebXR AR ready');
            
            // End session immediately after validation
            await session.end();
            
            return initialization;
            
          } catch (sessionError) {
            console.warn('⚠️ WebXR session creation failed:', sessionError);
            initialization.recommendations.push('WebXR available but session failed - using fallback');
          }
        } else {
          console.warn('⚠️ WebXR AR sessions not supported');
        }
      } catch (webxrError) {
        console.warn('⚠️ WebXR check failed:', webxrError);
      }
    }
    
    // Step 2: Fallback to Scene Viewer
    const capabilities = checkCrossDeviceARSupport();
    if (capabilities.sceneViewerSupported) {
      console.log('📱 Falling back to Scene Viewer');
      initialization.success = true;
      initialization.mode = 'scene-viewer';
      initialization.version = 'Android Scene Viewer';
      initialization.recommendations.push('Using Scene Viewer fallback');
      return initialization;
    }
    
    // Step 3: Final fallback to 3D mode only
    console.log('📺 No AR support - 3D preview only');
    initialization.mode = '3d-only';
    initialization.recommendations.push('No AR support detected - 3D preview only');
    
  } catch (error) {
    console.error('❌ AR initialization failed:', error);
    initialization.recommendations.push('AR initialization failed - check device compatibility');
  }
  
  console.log('🎯 Cross-device AR initialization result:', initialization);
  return initialization;
};