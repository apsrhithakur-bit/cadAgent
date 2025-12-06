/**
 * Enhanced WebGL Context Manager
 * Coordinates WebGL context usage between Three.js and model-viewer to prevent conflicts
 * Enhanced for cross-device AR functionality with comprehensive context lifecycle management
 */

export interface WebGLContextInfo {
  id: string;
  type: 'three.js' | 'model-viewer' | 'webxr' | 'other';
  canvas: HTMLCanvasElement;
  context: WebGLRenderingContext | WebGL2RenderingContext | null;
  created: number;
  lastUsed: number;
  isXRCompatible: boolean;
  deviceInfo: {
    isMobile: boolean;
    isAR: boolean;
    powerPreference: string;
  };
}

export interface WebGLCapabilities {
  hasWebGL: boolean;
  hasWebGL2: boolean;
  hasWebXR: boolean;
  maxTextureSize: number;
  extensions: string[];
  vendor: string;
  renderer: string;
  memoryInfo: {
    used: number;
    total: number;
    pressure: 'low' | 'medium' | 'high' | 'critical';
  };
}

class WebGLContextManager {
  private static instance: WebGLContextManager;
  private contexts: Map<string, WebGLContextInfo> = new Map();
  private activeContext: string | null = null;
  private maxContexts = 4; // Conservative limit to prevent browser issues
  
  static getInstance(): WebGLContextManager {
    if (!WebGLContextManager.instance) {
      WebGLContextManager.instance = new WebGLContextManager();
    }
    return WebGLContextManager.instance;
  }

  /**
   * Get comprehensive WebGL capabilities for cross-device AR
   */
  async getWebGLCapabilities(): Promise<WebGLCapabilities> {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') || canvas.getContext('webgl');
    
    const capabilities: WebGLCapabilities = {
      hasWebGL: !!context,
      hasWebGL2: !!(canvas.getContext('webgl2')),
      hasWebXR: 'xr' in navigator,
      maxTextureSize: 0,
      extensions: [],
      vendor: 'Unknown',
      renderer: 'Unknown',
      memoryInfo: {
        used: 0,
        total: 0,
        pressure: 'low'
      }
    };
    
    if (context) {
      const debugInfo = context.getExtension('WEBGL_debug_renderer_info');
      capabilities.maxTextureSize = context.getParameter(context.MAX_TEXTURE_SIZE);
      capabilities.extensions = context.getSupportedExtensions() || [];
      capabilities.vendor = debugInfo ? context.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : 'Unknown';
      capabilities.renderer = debugInfo ? context.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'Unknown';
      
      // Memory info (Chrome-specific)
      if ('memory' in performance) {
        const memory = (performance as any).memory;
        capabilities.memoryInfo.used = memory.usedJSHeapSize;
        capabilities.memoryInfo.total = memory.jsHeapSizeLimit;
        const pressure = capabilities.memoryInfo.used / capabilities.memoryInfo.total;
        
        if (pressure > 0.9) capabilities.memoryInfo.pressure = 'critical';
        else if (pressure > 0.7) capabilities.memoryInfo.pressure = 'high';
        else if (pressure > 0.5) capabilities.memoryInfo.pressure = 'medium';
        else capabilities.memoryInfo.pressure = 'low';
      }
      
      // Cleanup test context
      const loseContext = context.getExtension('WEBGL_lose_context');
      if (loseContext) loseContext.loseContext();
    }
    
    return capabilities;
  }

  /**
   * Request permission to create a WebGL context (enhanced for cross-device AR)
   */
  async requestContext(
    type: 'three.js' | 'model-viewer' | 'webxr', 
    priority: 'high' | 'normal' = 'normal',
    deviceHints: { isMobile?: boolean; isAR?: boolean } = {}
  ): Promise<boolean> {
    console.log(`🔧 Context Manager: Requesting ${type} context (priority: ${priority})`);
    
    // Count active contexts
    const activeContexts = Array.from(this.contexts.values()).filter(ctx => ctx.context && !this.isContextLost(ctx.context));
    console.log(`🔧 Context Manager: ${activeContexts.length} active contexts found`);
    
    // If we're at the limit, try to free up space
    if (activeContexts.length >= this.maxContexts) {
      console.log(`🔧 Context Manager: At context limit (${this.maxContexts}), attempting cleanup`);
      
      if (priority === 'high') {
        // For high priority requests, force cleanup of other contexts
        await this.forceCleanupContexts(type);
      } else {
        console.warn(`🔧 Context Manager: Cannot create ${type} context - at limit`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Register a new WebGL context (enhanced for cross-device AR)
   */
  registerContext(
    id: string, 
    type: 'three.js' | 'model-viewer' | 'webxr', 
    canvas: HTMLCanvasElement, 
    context: WebGLRenderingContext | WebGL2RenderingContext,
    options: { isMobile?: boolean; isAR?: boolean; powerPreference?: string } = {}
  ): void {
    console.log(`🔧 Context Manager: Registering ${type} context: ${id}`);
    
    // Check XR compatibility if context supports it
    let isXRCompatible = false;
    if ('makeXRCompatible' in context) {
      (context as any).makeXRCompatible()
        .then(() => {
          isXRCompatible = true;
          console.log(`✅ Context ${id} is XR compatible`);
        })
        .catch((error: any) => {
          console.warn(`⚠️ Context ${id} XR compatibility failed:`, error);
        });
    }

    this.contexts.set(id, {
      id,
      type,
      canvas,
      context,
      created: Date.now(),
      lastUsed: Date.now(),
      isXRCompatible,
      deviceInfo: {
        isMobile: options.isMobile || /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
        isAR: options.isAR || false,
        powerPreference: options.powerPreference || 'default'
      }
    });
    
    this.activeContext = id;
    this.logContextStatus();
  }

  /**
   * Unregister and dispose of a WebGL context
   */
  async disposeContext(id: string): Promise<void> {
    console.log(`🔧 Context Manager: Disposing context: ${id}`);
    
    const contextInfo = this.contexts.get(id);
    if (!contextInfo) {
      console.warn(`🔧 Context Manager: Context ${id} not found for disposal`);
      return;
    }

    try {
      // Force context loss
      if (contextInfo.context) {
        const loseContextExt = contextInfo.context.getExtension('WEBGL_lose_context');
        if (loseContextExt) {
          loseContextExt.loseContext();
          console.log(`🔧 Context Manager: Forced context loss for ${id}`);
        }
      }
      
      // Remove canvas if it's still in DOM
      if (contextInfo.canvas && contextInfo.canvas.parentElement) {
        contextInfo.canvas.remove();
        console.log(`🔧 Context Manager: Removed canvas for ${id}`);
      }
      
      this.contexts.delete(id);
      
      if (this.activeContext === id) {
        this.activeContext = null;
      }
      
      // Wait for cleanup to complete
      await new Promise(resolve => setTimeout(resolve, 100));
      
      console.log(`🔧 Context Manager: Successfully disposed context ${id}`);
      this.logContextStatus();
      
    } catch (error) {
      console.error(`🔧 Context Manager: Error disposing context ${id}:`, error);
    }
  }

  /**
   * Force cleanup of contexts of a different type
   */
  private async forceCleanupContexts(keepType: 'three.js' | 'model-viewer'): Promise<void> {
    console.log(`🔧 Context Manager: Force cleanup - keeping ${keepType} contexts`);
    
    const contextsToRemove: string[] = [];
    
    for (const [id, info] of this.contexts.entries()) {
      if (info.type !== keepType) {
        contextsToRemove.push(id);
      }
    }
    
    // Dispose of other contexts
    for (const id of contextsToRemove) {
      await this.disposeContext(id);
    }
    
    console.log(`🔧 Context Manager: Cleaned up ${contextsToRemove.length} contexts`);
  }

  /**
   * Check if a WebGL context is lost
   */
  private isContextLost(context: WebGLRenderingContext): boolean {
    try {
      return context.isContextLost();
    } catch (error) {
      return true; // Assume lost if we can't check
    }
  }

  /**
   * Prepare for AR mode by disposing Three.js contexts
   */
  async prepareForAR(): Promise<void> {
    console.log(`🔧 Context Manager: Preparing for AR mode`);
    await this.forceCleanupContexts('model-viewer');
    
    // Extra wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`🔧 Context Manager: AR mode preparation complete`);
  }

  /**
   * Prepare for 3D mode by disposing model-viewer contexts
   */
  async prepareFor3D(): Promise<void> {
    console.log(`🔧 Context Manager: Preparing for 3D mode`);
    await this.forceCleanupContexts('three.js');
    
    // Extra wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 500));
    console.log(`🔧 Context Manager: 3D mode preparation complete`);
  }

  /**
   * Get current context status
   */
  getStatus() {
    const activeContexts = Array.from(this.contexts.values()).filter(ctx => 
      ctx.context && !this.isContextLost(ctx.context)
    );
    
    return {
      total: this.contexts.size,
      active: activeContexts.length,
      maxContexts: this.maxContexts,
      contexts: activeContexts.map(ctx => ({
        id: ctx.id,
        type: ctx.type,
        age: Date.now() - ctx.created
      }))
    };
  }

  /**
   * Log current context status
   */
  private logContextStatus(): void {
    const status = this.getStatus();
    console.log(`🔧 Context Manager Status:`, status);
  }

  /**
   * Emergency cleanup - dispose all contexts
   */
  async emergencyCleanup(): Promise<void> {
    console.log(`🚨 Context Manager: Emergency cleanup of all contexts`);
    
    const allIds = Array.from(this.contexts.keys());
    for (const id of allIds) {
      await this.disposeContext(id);
    }
    
    this.contexts.clear();
    this.activeContext = null;
    
    console.log(`🚨 Context Manager: Emergency cleanup complete`);
  }

  /**
   * Optimize contexts for cross-device AR performance
   */
  async optimizeForCrossDeviceAR(): Promise<void> {
    console.log(`🎯 Context Manager: Optimizing for cross-device AR`);
    
    const capabilities = await this.getWebGLCapabilities();
    
    // If memory pressure is high, cleanup non-essential contexts
    if (capabilities.memoryInfo.pressure === 'high' || capabilities.memoryInfo.pressure === 'critical') {
      console.log(`⚠️ High memory pressure detected, cleaning up contexts`);
      await this.forceCleanupOldestContexts(2); // Keep only 2 most recent
    }
    
    // Adjust max contexts based on device capabilities
    if (capabilities.memoryInfo.pressure === 'critical') {
      this.maxContexts = 2;
    } else if (capabilities.memoryInfo.pressure === 'high') {
      this.maxContexts = 3;
    }
    
    console.log(`🎯 Cross-device AR optimization complete (max contexts: ${this.maxContexts})`);
  }

  /**
   * Clean up oldest contexts to free resources
   */
  private async forceCleanupOldestContexts(keepCount: number): Promise<void> {
    const contexts = Array.from(this.contexts.values())
      .sort((a, b) => a.lastUsed - b.lastUsed); // Oldest first
    
    const toRemove = contexts.slice(0, -keepCount); // Remove all but the newest keepCount
    
    for (const context of toRemove) {
      await this.disposeContext(context.id);
    }
    
    console.log(`🧹 Cleaned up ${toRemove.length} oldest contexts`);
  }

  /**
   * Update last used timestamp for context
   */
  updateContextUsage(id: string): void {
    const context = this.contexts.get(id);
    if (context) {
      context.lastUsed = Date.now();
    }
  }

  /**
   * Get cross-device compatibility report
   */
  async getCrossDeviceCompatibilityReport(): Promise<{
    webglSupport: boolean;
    webgl2Support: boolean;
    webxrSupport: boolean;
    arCompatible: boolean;
    memoryStatus: string;
    recommendations: string[];
  }> {
    const capabilities = await this.getWebGLCapabilities();
    const recommendations: string[] = [];
    
    if (capabilities.memoryInfo.pressure === 'high') {
      recommendations.push('🔄 Close other browser tabs to free memory');
    }
    
    if (capabilities.memoryInfo.pressure === 'critical') {
      recommendations.push('⚠️ Critical memory usage - restart browser');
    }
    
    if (!capabilities.hasWebGL2) {
      recommendations.push('📱 WebGL2 not available - using WebGL1 fallback');
    }
    
    if (!capabilities.hasWebXR) {
      recommendations.push('🥽 WebXR not available - using model-viewer fallback');
    }
    
    const arCompatible = capabilities.hasWebGL && (capabilities.hasWebXR || /iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
    
    return {
      webglSupport: capabilities.hasWebGL,
      webgl2Support: capabilities.hasWebGL2,
      webxrSupport: capabilities.hasWebXR,
      arCompatible,
      memoryStatus: capabilities.memoryInfo.pressure,
      recommendations
    };
  }
}

// Export singleton instance
export const webglContextManager = WebGLContextManager.getInstance();