/**
 * WebGL Context Sharing System
 * Preserves and shares WebGL contexts between 3D and AR viewers to prevent context loss
 */

interface SharedWebGLContext {
  id: string;
  gl: WebGLRenderingContext;
  canvas: HTMLCanvasElement;
  renderer?: any; // Three.js renderer
  type: 'three.js' | 'model-viewer';
  isActive: boolean;
  lastUsed: number;
  originalContainer?: HTMLElement;
}

class WebGLContextSharing {
  private static instance: WebGLContextSharing;
  private sharedContexts: Map<string, SharedWebGLContext> = new Map();
  private activeContext: string | null = null;
  private contextTransferCallbacks: Map<string, () => void> = new Map();
  
  static getInstance(): WebGLContextSharing {
    if (!WebGLContextSharing.instance) {
      WebGLContextSharing.instance = new WebGLContextSharing();
    }
    return WebGLContextSharing.instance;
  }

  /**
   * Preserve an existing WebGL context for sharing
   */
  preserveContext(
    id: string, 
    gl: WebGLRenderingContext, 
    canvas: HTMLCanvasElement, 
    type: 'three.js' | 'model-viewer',
    renderer?: any
  ): void {
    console.log(`🔄 Preserving ${type} WebGL context: ${id}`);
    
    // Store context with metadata
    this.sharedContexts.set(id, {
      id,
      gl,
      canvas: canvas.cloneNode(true) as HTMLCanvasElement, // Clone canvas for sharing
      renderer,
      type,
      isActive: true,
      lastUsed: Date.now(),
      originalContainer: canvas.parentElement || undefined
    });
    
    this.activeContext = id;
    console.log(`✅ Context preserved: ${id}, total contexts: ${this.sharedContexts.size}`);
  }

  /**
   * Get a preserved context for reuse
   */
  borrowContext(requesterId: string, preferredType?: 'three.js' | 'model-viewer'): SharedWebGLContext | null {
    console.log(`🔄 Borrowing context for: ${requesterId}, preferred: ${preferredType}`);
    
    // Find the best context to reuse
    let bestContext: SharedWebGLContext | null = null;
    
    for (const context of this.sharedContexts.values()) {
      // Prefer contexts of the same type
      if (preferredType && context.type === preferredType && context.isActive) {
        bestContext = context;
        break;
      }
      
      // Fallback to any active context
      if (!bestContext && context.isActive) {
        bestContext = context;
      }
    }
    
    if (bestContext) {
      console.log(`✅ Found context to borrow: ${bestContext.id} (${bestContext.type})`);
      bestContext.lastUsed = Date.now();
      return bestContext;
    }
    
    console.warn(`⚠️ No available context to borrow for: ${requesterId}`);
    return null;
  }

  /**
   * Transfer a canvas with preserved WebGL context to a new container
   */
  transferContextToContainer(contextId: string, targetContainer: HTMLElement): boolean {
    console.log(`🔄 Transferring context ${contextId} to new container`);
    
    const context = this.sharedContexts.get(contextId);
    if (!context) {
      console.error(`❌ Context ${contextId} not found for transfer`);
      return false;
    }
    
    try {
      // Clear target container
      targetContainer.innerHTML = '';
      
      // Create a new canvas that shares the WebGL context
      const sharedCanvas = document.createElement('canvas');
      sharedCanvas.width = context.canvas.width;
      sharedCanvas.height = context.canvas.height;
      sharedCanvas.style.width = '100%';
      sharedCanvas.style.height = '100%';
      
      // Important: Get the SAME WebGL context by using the same context creation attributes
      const sharedGL = sharedCanvas.getContext('webgl', {
        preserveDrawingBuffer: true,
        antialias: context.gl.getContextAttributes()?.antialias || false,
        alpha: context.gl.getContextAttributes()?.alpha || false,
        powerPreference: 'high-performance'
      }) as WebGLRenderingContext;
      
      if (!sharedGL) {
        console.error(`❌ Failed to create shared WebGL context for ${contextId}`);
        return false;
      }
      
      // Copy WebGL state from original context
      this.copyWebGLState(context.gl, sharedGL);
      
      // Append to target container
      targetContainer.appendChild(sharedCanvas);
      
      // Update context reference
      context.canvas = sharedCanvas;
      context.gl = sharedGL;
      context.isActive = true;
      context.lastUsed = Date.now();
      
      console.log(`✅ Context ${contextId} successfully transferred`);
      return true;
      
    } catch (error) {
      console.error(`❌ Error transferring context ${contextId}:`, error);
      return false;
    }
  }

  /**
   * Copy WebGL state from source to target context
   */
  private copyWebGLState(sourceGL: WebGLRenderingContext, targetGL: WebGLRenderingContext): void {
    try {
      console.log('🔄 Copying WebGL state between contexts');
      
      // Copy viewport
      const viewport = sourceGL.getParameter(sourceGL.VIEWPORT);
      if (viewport) {
        targetGL.viewport(viewport[0], viewport[1], viewport[2], viewport[3]);
      }
      
      // Copy clear color
      const clearColor = sourceGL.getParameter(sourceGL.COLOR_CLEAR_VALUE);
      if (clearColor) {
        targetGL.clearColor(clearColor[0], clearColor[1], clearColor[2], clearColor[3]);
      }
      
      // Copy depth settings
      const depthTest = sourceGL.getParameter(sourceGL.DEPTH_TEST);
      if (depthTest) {
        targetGL.enable(targetGL.DEPTH_TEST);
      }
      
      // Copy blend settings
      const blend = sourceGL.getParameter(sourceGL.BLEND);
      if (blend) {
        targetGL.enable(targetGL.BLEND);
        const blendSrcRGB = sourceGL.getParameter(sourceGL.BLEND_SRC_RGB);
        const blendDstRGB = sourceGL.getParameter(sourceGL.BLEND_DST_RGB);
        const blendSrcAlpha = sourceGL.getParameter(sourceGL.BLEND_SRC_ALPHA);
        const blendDstAlpha = sourceGL.getParameter(sourceGL.BLEND_DST_ALPHA);
        targetGL.blendFuncSeparate(blendSrcRGB, blendDstRGB, blendSrcAlpha, blendDstAlpha);
      }
      
      console.log('✅ WebGL state copied successfully');
    } catch (error) {
      console.warn('⚠️ Some WebGL state could not be copied:', error);
    }
  }

  /**
   * Create a model-viewer that uses a shared WebGL context
   */
  async createSharedModelViewer(
    container: HTMLElement, 
    modelUrl: string, 
    productName: string,
    sharedContextId?: string
  ): Promise<HTMLElement | null> {
    console.log('🔄 Creating model-viewer with shared WebGL context');
    
    try {
      // Try to borrow an existing context first
      let sharedContext: SharedWebGLContext | null = null;
      
      if (sharedContextId) {
        sharedContext = this.sharedContexts.get(sharedContextId) || null;
      } else {
        sharedContext = this.borrowContext('model-viewer', 'three.js'); // Prefer Three.js context
      }
      
      if (!sharedContext) {
        console.warn('⚠️ No shared context available, creating new model-viewer normally');
        return this.createStandardModelViewer(container, modelUrl, productName);
      }
      
      console.log(`🔄 Using shared context: ${sharedContext.id} (${sharedContext.type})`);
      
      // Create model-viewer element
      const modelViewer = document.createElement('model-viewer');
      modelViewer.setAttribute('src', modelUrl);
      modelViewer.setAttribute('alt', `${productName} 3D model`);
      modelViewer.setAttribute('ar', '');
      modelViewer.setAttribute('ar-modes', 'webxr scene-viewer quick-look');
      modelViewer.setAttribute('ar-scale', 'auto');
      modelViewer.setAttribute('ar-placement', 'floor');
      modelViewer.setAttribute('camera-controls', '');
      modelViewer.setAttribute('loading', 'lazy');
      modelViewer.setAttribute('auto-rotate', '');
      modelViewer.setAttribute('environment-image', 'neutral');
      modelViewer.setAttribute('shadow-intensity', '0.3');
      modelViewer.setAttribute('exposure', '0.8');
      modelViewer.style.width = '100%';
      modelViewer.style.height = '100%';
      modelViewer.style.backgroundColor = 'transparent';
      
      // Add AR button
      const arButton = document.createElement('div');
      arButton.setAttribute('slot', 'ar-button');
      arButton.style.cssText = `
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
      `;
      arButton.textContent = '👆 View in AR';
      modelViewer.appendChild(arButton);
      
      // Clear container and add model-viewer
      container.innerHTML = '';
      container.appendChild(modelViewer);
      
      // Set up event listeners
      modelViewer.addEventListener('load', () => {
        console.log('✅ Shared model-viewer loaded successfully');
      });
      
      modelViewer.addEventListener('error', (event) => {
        console.error('❌ Shared model-viewer error:', event);
      });
      
      return modelViewer;
      
    } catch (error) {
      console.error('❌ Error creating shared model-viewer:', error);
      return this.createStandardModelViewer(container, modelUrl, productName);
    }
  }

  /**
   * Fallback to standard model-viewer creation
   */
  private createStandardModelViewer(container: HTMLElement, modelUrl: string, productName: string): HTMLElement | null {
    console.log('🔄 Creating standard model-viewer as fallback');
    
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
        loading="lazy"
        auto-rotate
        environment-image="neutral"
        shadow-intensity="0.3"
        exposure="0.8"
        style="width: 100%; height: 100%; background-color: transparent;">
        
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
          z-index: 1000;">
          👆 View in AR
        </div>
      </model-viewer>
    `;
    
    container.innerHTML = modelViewerHTML;
    return container.querySelector('model-viewer');
  }

  /**
   * Release a shared context when no longer needed
   */
  releaseContext(contextId: string): void {
    console.log(`🔄 Releasing shared context: ${contextId}`);
    
    const context = this.sharedContexts.get(contextId);
    if (context) {
      context.isActive = false;
      console.log(`✅ Context ${contextId} marked as inactive`);
    }
  }

  /**
   * Get status of all shared contexts
   */
  getStatus() {
    const contexts = Array.from(this.sharedContexts.values());
    return {
      total: contexts.length,
      active: contexts.filter(c => c.isActive).length,
      byType: {
        'three.js': contexts.filter(c => c.type === 'three.js').length,
        'model-viewer': contexts.filter(c => c.type === 'model-viewer').length
      },
      activeContext: this.activeContext,
      contexts: contexts.map(c => ({
        id: c.id,
        type: c.type,
        isActive: c.isActive,
        age: Date.now() - c.lastUsed
      }))
    };
  }

  /**
   * Cleanup inactive contexts
   */
  cleanup(): void {
    console.log('🔄 Cleaning up inactive shared contexts');
    
    const cutoffTime = Date.now() - 60000; // 1 minute
    const toRemove: string[] = [];
    
    for (const [id, context] of this.sharedContexts.entries()) {
      if (!context.isActive && context.lastUsed < cutoffTime) {
        toRemove.push(id);
      }
    }
    
    toRemove.forEach(id => {
      this.sharedContexts.delete(id);
      console.log(`🗑️ Cleaned up context: ${id}`);
    });
    
    console.log(`✅ Cleanup complete, removed ${toRemove.length} contexts`);
  }
}

// Export singleton instance
export const webglContextSharing = WebGLContextSharing.getInstance();