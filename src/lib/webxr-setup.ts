import 'webxr-polyfill';

// Extend existing WebXR types if needed
declare global {
  interface Navigator {
    xr?: XRSystem;
  }
}

export interface ARCapabilities {
  webxr: boolean;
  webxrImmersive: boolean;
  hitTest: boolean;
  planeDetection: boolean;
  handTracking: boolean;
  imageTracking: boolean;
  camera: boolean;
  deviceOrientation: boolean;
  fullscreen: boolean;
}

export class WebXRManager {
  private session: XRSession | null = null;
  private referenceSpace: XRReferenceSpace | null = null;
  private isSessionActive = false;

  async checkCapabilities(): Promise<ARCapabilities> {
    const capabilities: ARCapabilities = {
      webxr: false,
      webxrImmersive: false,
      hitTest: false,
      planeDetection: false,
      handTracking: false,
      imageTracking: false,
      camera: false,
      deviceOrientation: false,
      fullscreen: false
    };

    // Check WebXR support
    if ('xr' in navigator && navigator.xr) {
      capabilities.webxr = true;

      try {
        const immersiveSupported = await navigator.xr.isSessionSupported('immersive-ar');
        capabilities.webxrImmersive = immersiveSupported;
      } catch (error) {
        console.warn('Error checking immersive AR support:', error);
      }

      // Check feature support (these would need to be tested with actual session)
      capabilities.hitTest = true; // Assume supported if WebXR is available
      capabilities.planeDetection = true;
    }

    // Check camera access - more permissive for AR testing
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        // Just check if getUserMedia exists, don't actually request camera yet
        capabilities.camera = true;
        console.log('✅ Camera API available');
      } catch (error) {
        console.warn('Camera access not available:', error);
      }
    } else {
      // For desktop testing, assume camera is available
      capabilities.camera = true;
      console.log('📷 Desktop: Assuming camera available for AR simulation');
    }

    // Check device orientation
    if ('DeviceOrientationEvent' in window) {
      capabilities.deviceOrientation = true;
    }

    // Check fullscreen API
    if (document.fullscreenEnabled || (document as any).webkitFullscreenEnabled) {
      capabilities.fullscreen = true;
    }

    return capabilities;
  }

  async startARSession(
    canvas: HTMLCanvasElement,
    options: {
      requiredFeatures?: string[];
      optionalFeatures?: string[];
    } = {}
  ): Promise<boolean> {
    if (!('xr' in navigator) || !navigator.xr) {
      throw new Error('WebXR not supported');
    }

    try {
      const sessionOptions = {
        requiredFeatures: options.requiredFeatures || ['local-floor'],
        optionalFeatures: options.optionalFeatures || ['hit-test', 'plane-detection']
      };

      this.session = await navigator.xr.requestSession('immersive-ar', sessionOptions);
      this.isSessionActive = true;

      // Set up reference space
      this.referenceSpace = await this.session.requestReferenceSpace('local-floor');

      // Handle session end
      this.session.addEventListener('end', () => {
        this.isSessionActive = false;
        this.session = null;
        this.referenceSpace = null;
      });

      return true;
    } catch (error) {
      console.error('Failed to start AR session:', error);
      throw error;
    }
  }

  async endARSession(): Promise<void> {
    if (this.session) {
      await this.session.end();
    }
  }

  getSession(): XRSession | null {
    return this.session;
  }

  getReferenceSpace(): XRReferenceSpace | null {
    return this.referenceSpace;
  }

  isActive(): boolean {
    return this.isSessionActive;
  }

  requestAnimationFrame(callback: XRFrameRequestCallback): number {
    if (!this.session) {
      throw new Error('No active XR session');
    }
    return this.session.requestAnimationFrame(callback);
  }

  cancelAnimationFrame(id: number): void {
    if (this.session) {
      this.session.cancelAnimationFrame(id);
    }
  }
}

// Fallback AR implementation for devices without WebXR
export class FallbackARManager {
  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isActive = false;

  async startARSession(container: HTMLElement): Promise<boolean> {
    try {
      // Request camera access
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });

      // Create video element
      this.video = document.createElement('video');
      this.video.srcObject = this.stream;
      this.video.autoplay = true;
      this.video.playsInline = true;
      this.video.style.width = '100%';
      this.video.style.height = '100%';
      this.video.style.objectFit = 'cover';

      // Add to container
      container.appendChild(this.video);

      this.isActive = true;
      return true;
    } catch (error) {
      console.error('Failed to start fallback AR:', error);
      throw error;
    }
  }

  async endARSession(): Promise<void> {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.video) {
      this.video.remove();
      this.video = null;
    }

    this.isActive = false;
  }

  isARActive(): boolean {
    return this.isActive;
  }

  getVideoElement(): HTMLVideoElement | null {
    return this.video;
  }
}

// Utility functions
export const requestFullscreen = (element: HTMLElement): Promise<void> => {
  if (element.requestFullscreen) {
    return element.requestFullscreen();
  } else if ((element as any).webkitRequestFullscreen) {
    return (element as any).webkitRequestFullscreen();
  } else if ((element as any).mozRequestFullScreen) {
    return (element as any).mozRequestFullScreen();
  } else if ((element as any).msRequestFullscreen) {
    return (element as any).msRequestFullscreen();
  }
  return Promise.reject(new Error('Fullscreen not supported'));
};

export const exitFullscreen = (): Promise<void> => {
  if (document.exitFullscreen) {
    return document.exitFullscreen();
  } else if ((document as any).webkitExitFullscreen) {
    return (document as any).webkitExitFullscreen();
  } else if ((document as any).mozCancelFullScreen) {
    return (document as any).mozCancelFullScreen();
  } else if ((document as any).msExitFullscreen) {
    return (document as any).msExitFullscreen();
  }
  return Promise.reject(new Error('Exit fullscreen not supported'));
};

export const isFullscreen = (): boolean => {
  return !!(
    document.fullscreenElement ||
    (document as any).webkitFullscreenElement ||
    (document as any).mozFullScreenElement ||
    (document as any).msFullscreenElement
  );
};

// Initialize WebXR polyfill
export const initializeWebXR = async (): Promise<ARCapabilities> => {
  const manager = new WebXRManager();
  return await manager.checkCapabilities();
}; 