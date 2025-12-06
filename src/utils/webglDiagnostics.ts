// WebGL Diagnostics Utility
export class WebGLDiagnostics {
  private static instance: WebGLDiagnostics;
  private contexts: WeakSet<WebGLRenderingContext> = new WeakSet();
  private contextCount = 0;

  static getInstance(): WebGLDiagnostics {
    if (!WebGLDiagnostics.instance) {
      WebGLDiagnostics.instance = new WebGLDiagnostics();
    }
    return WebGLDiagnostics.instance;
  }

  // Hook into WebGL context creation
  monitorWebGLContexts() {
    const originalGetContext = HTMLCanvasElement.prototype.getContext;
    const self = this;

    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement, contextType: string, ...args: any[]) {
      const context = originalGetContext.call(this, contextType, ...args);
      
      if (contextType === 'webgl' || contextType === 'experimental-webgl') {
        if (context) {
          self.contextCount++;
          self.contexts.add(context as WebGLRenderingContext);
          console.log(`🔍 WebGL context created (#${self.contextCount}):`, {
            contextType,
            canvas: {
              width: this.width,
              height: this.height,
              id: this.id,
              className: this.className
            },
            stack: new Error().stack?.split('\n').slice(1, 4).join('\n')
          });
        }
      }
      
      return context;
    };
  }

  // Get current WebGL info (cached to avoid creating test contexts)
  getWebGLInfo() {
    // Avoid creating test contexts when we already have many contexts
    if (this.contextCount > 10) {
      return {
        supported: true, // Assume supported if we've created contexts before
        renderer: 'Unknown (avoiding context creation)',
        vendor: 'Unknown (avoiding context creation)', 
        version: 'Unknown (avoiding context creation)',
        maxTextureSize: 'Unknown',
        maxTextureUnits: 'Unknown',
        maxVertexAttributes: 'Unknown',
        maxViewportDims: 'Unknown',
        contextCount: this.contextCount,
        warning: 'Avoiding test context creation due to high context count'
      };
    }

    try {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const gl = canvas.getContext('webgl', { antialias: false, alpha: false }) || 
                 canvas.getContext('experimental-webgl', { antialias: false, alpha: false });
      
      if (!gl) {
        canvas.remove();
        return { supported: false, contextCount: this.contextCount };
      }

      const info = {
        supported: true,
        renderer: gl.getParameter(gl.RENDERER),
        vendor: gl.getParameter(gl.VENDOR),
        version: gl.getParameter(gl.VERSION),
        maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
        maxTextureUnits: gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS),
        maxVertexAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS),
        maxViewportDims: gl.getParameter(gl.MAX_VIEWPORT_DIMS),
        contextCount: this.contextCount
      };

      // Properly dispose of test context
      const extension = gl.getExtension('WEBGL_lose_context');
      if (extension) {
        extension.loseContext();
      }
      canvas.remove();
      
      return info;
    } catch (error) {
      console.warn('WebGL info gathering failed:', error);
      return { 
        supported: false, 
        error: error.message,
        contextCount: this.contextCount 
      };
    }
  }

  // Count active canvases (without creating new contexts)
  getActiveCanvases() {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    return canvases.map(canvas => {
      // Check if canvas has WebGL context without creating one
      let hasWebGL = false;
      try {
        // Check if canvas already has a WebGL context by checking the rendering context
        // without attempting to create a new one
        const context = (canvas as any).getContext && (canvas as any).__webglContext;
        hasWebGL = !!context;
      } catch (error) {
        // If we can't safely check, assume it doesn't have WebGL
        hasWebGL = false;
      }

      return {
        id: canvas.id,
        className: canvas.className,
        width: canvas.width,
        height: canvas.height,
        hasWebGL,
        parentElement: canvas.parentElement?.tagName,
        // Add context type detection without creating new contexts
        contextType: this.getCanvasContextType(canvas)
      };
    });
  }

  // Safely detect canvas context type without creating new contexts
  private getCanvasContextType(canvas: HTMLCanvasElement): string {
    try {
      // Check for existing context without creating new ones
      if ((canvas as any).getContext) {
        // Check common context types by looking at canvas properties
        const style = getComputedStyle(canvas);
        const parent = canvas.parentElement;
        
        // Heuristic detection based on usage patterns
        if (parent?.className.includes('three') || canvas.className.includes('three')) {
          return 'webgl (three.js)';
        }
        if (parent?.tagName === 'MODEL-VIEWER' || canvas.closest('model-viewer')) {
          return 'webgl (model-viewer)';
        }
        if (canvas.width > 0 && canvas.height > 0) {
          return 'unknown (active)';
        }
      }
      return 'none';
    } catch (error) {
      return 'unknown';
    }
  }

  // Force context loss for testing
  loseAllContexts() {
    const canvases = document.querySelectorAll('canvas');
    canvases.forEach(canvas => {
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (gl) {
        const loseContext = gl.getExtension('WEBGL_lose_context');
        if (loseContext) {
          loseContext.loseContext();
          console.log('🔥 Forced context loss for canvas:', canvas);
        }
      }
    });
  }
}

// Global diagnostics instance
export const webglDiagnostics = WebGLDiagnostics.getInstance();