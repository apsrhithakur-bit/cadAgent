/**
 * URL Detection Utilities for Cross-Device AR Sharing
 * 
 * Handles detection of shared model URLs to prevent nested QR code generation
 * and improve user experience when accessing models via QR code scans.
 */

export interface SharedUrlContext {
  isSharedUrl: boolean;
  modelId?: string;
  currentUrl: string;
  shouldReuseQRCode: boolean;
}

/**
 * Detects if the current URL is a shared model URL (from QR code scan)
 */
export function detectSharedUrlContext(): SharedUrlContext {
  const pathname = window.location.pathname;
  const href = window.location.href;
  
  // Check for shared model URL pattern: /model/abc-123-def
  const modelMatch = pathname.match(/^\/model\/([a-f0-9-]+)$/);
  
  if (modelMatch) {
    const modelId = modelMatch[1];
    console.log('🔗 Detected shared model URL context:', {
      pathname,
      modelId,
      fullUrl: href
    });
    
    return {
      isSharedUrl: true,
      modelId,
      currentUrl: href,
      shouldReuseQRCode: true
    };
  }
  
  return {
    isSharedUrl: false,
    currentUrl: href,
    shouldReuseQRCode: false
  };
}

/**
 * Gets the appropriate URL for QR code generation based on context
 */
export function getQRCodeUrl(): string {
  const context = detectSharedUrlContext();
  
  if (context.isSharedUrl) {
    // When we're already in a shared URL, reuse the same URL
    console.log('♻️ Reusing existing shared URL for QR code:', context.currentUrl);
    return context.currentUrl;
  }
  
  // For new QR codes, this will be handled by the QR generator
  console.log('🔄 New QR code will be generated with fresh shared model URL');
  return '';
}

/**
 * Checks if QR code generation should be bypassed
 */
export function shouldSkipQRGeneration(): boolean {
  const context = detectSharedUrlContext();
  return context.isSharedUrl;
}

/**
 * Gets sharing context information for UI display
 */
export function getSharingContextInfo(): {
  isReused: boolean;
  contextMessage: string;
  iconText: string;
} {
  const context = detectSharedUrlContext();
  
  if (context.isSharedUrl) {
    return {
      isReused: true,
      contextMessage: '✅ Your model progress is preserved in this link',
      iconText: '♻️ Existing shared link'
    };
  }
  
  return {
    isReused: false,
    contextMessage: '✅ Your model progress is preserved in this link',
    iconText: '🔗 New shared link'
  };
}