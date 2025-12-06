/**
 * Base64 Model Reconstructor - Cross-Device AR Sharing Utility
 * 
 * This utility handles reconstruction of 3D models from stored base64 data
 * when shareable URLs are not available (e.g., Zoo API returns only base64).
 * 
 * Key Use Case: When QR codes are scanned on mobile devices, shareable URLs
 * may not be available, but base64 data can be converted back to blob URLs
 * for cross-device AR compatibility.
 */

export interface Base64ReconstructionResult {
  success: boolean;
  gltfUrl?: string;
  error?: string;
  source: 'shareable-url' | 'base64-reconstruction' | 'fallback' | 'none';
}

/**
 * Reconstructs a GLTF URL from CAD model data with intelligent fallback strategy
 */
export function reconstructGltfUrl(cadModel: any): Base64ReconstructionResult {
  console.log('🔧 Base64 reconstruction attempt:', {
    shareableGltfUrl: cadModel?.shareableGltfUrl,
    base64Data: cadModel?.base64Data ? 'present' : 'missing',
    base64Format: cadModel?.base64Format,
    gltfUrl: cadModel?.gltfUrl
  });

  // Strategy 1: Use shareable URL if available (best for cross-device)
  if (cadModel?.shareableGltfUrl && cadModel.shareableGltfUrl.startsWith('http')) {
    console.log('✅ Using shareable URL for cross-device compatibility');
    return {
      success: true,
      gltfUrl: cadModel.shareableGltfUrl,
      source: 'shareable-url'
    };
  }

  // Strategy 1b: Check formats.shareableGltf as fallback
  if (cadModel?.formats?.shareableGltf && cadModel.formats.shareableGltf.startsWith('http')) {
    console.log('✅ Using formats.shareableGltf for cross-device compatibility');
    return {
      success: true,
      gltfUrl: cadModel.formats.shareableGltf,
      source: 'shareable-url'
    };
  }

  // Strategy 2: Reconstruct from base64 data (cross-device compatible)
  if (cadModel?.base64Data && cadModel?.base64Format) {
    try {
      console.log('🔄 Reconstructing model from base64 data for cross-device sharing');
      const mimeType = cadModel.base64Format === 'glb' 
        ? 'model/gltf-binary' 
        : 'model/gltf+json';
      
      // Convert base64 to blob URL
      const base64Data = cadModel.base64Data;
      const binaryData = atob(base64Data);
      const bytes = new Uint8Array(binaryData.length);
      
      for (let i = 0; i < binaryData.length; i++) {
        bytes[i] = binaryData.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: mimeType });
      const blobUrl = URL.createObjectURL(blob);
      
      console.log('✅ Successfully reconstructed blob URL from base64 data', {
        format: cadModel.base64Format,
        mimeType,
        blobUrl: blobUrl.substring(0, 50) + '...'
      });

      return {
        success: true,
        gltfUrl: blobUrl,
        source: 'base64-reconstruction'
      };
    } catch (error) {
      console.error('❌ Failed to reconstruct from base64:', error);
      // Continue to fallback strategy
    }
  }

  // Strategy 3: Use existing blob URL as fallback (limited cross-device compatibility)
  if (cadModel?.gltfUrl) {
    console.log('⚠️ Using existing blob URL (limited cross-device compatibility)');
    return {
      success: true,
      gltfUrl: cadModel.gltfUrl,
      source: 'fallback'
    };
  }

  // Strategy 4: No URL available
  console.error('❌ No GLTF URL could be reconstructed');
  return {
    success: false,
    error: 'No valid GLTF data available for reconstruction',
    source: 'none'
  };
}

/**
 * Reconstructs GLTF URL from architectural model with comprehensive fallback
 */
export function reconstructArchitecturalModelUrl(architecturalModel: any): Base64ReconstructionResult {
  console.log('🏗️ Reconstructing URL from architectural model');

  // First try CAD model reconstruction
  if (architecturalModel?.cadModel) {
    const result = reconstructGltfUrl(architecturalModel.cadModel);
    if (result.success) {
      return result;
    }
  }

  // Fallback to architectural model's own gltfUrl
  if (architecturalModel?.gltfUrl) {
    console.log('⚠️ Using architectural model gltfUrl as fallback');
    return {
      success: true,
      gltfUrl: architecturalModel.gltfUrl,
      source: 'fallback'
    };
  }

  return {
    success: false,
    error: 'No valid GLTF data in architectural model',
    source: 'none'
  };
}

/**
 * Main function to extract GLTF URL from shared model data with base64 reconstruction
 */
export function extractGltfUrlWithReconstruction(sharedModelData: any): Base64ReconstructionResult {
  console.log('🔍 Extracting GLTF URL with base64 reconstruction support');

  // Strategy 1: Try architectural model reconstruction
  if (sharedModelData?.architecturalModel) {
    const result = reconstructArchitecturalModelUrl(sharedModelData.architecturalModel);
    if (result.success) {
      return result;
    }
  }

  // Strategy 2: Try direct CAD model in shared data
  if (sharedModelData?.cadModel) {
    const result = reconstructGltfUrl(sharedModelData.cadModel);
    if (result.success) {
      return result;
    }
  }

  // Strategy 3: Use shared data's own GLTF URL
  if (sharedModelData?.gltfUrl) {
    console.log('⚠️ Using shared data gltfUrl as fallback');
    return {
      success: true,
      gltfUrl: sharedModelData.gltfUrl,
      source: 'fallback'
    };
  }

  // Strategy 4: Try other fallback sources
  const fallbackUrl = sharedModelData?.generatedResults?.gltfUrl ||
                     sharedModelData?.cadData?.gltfUrl ||
                     sharedModelData?.modelData?.gltfUrl;

  if (fallbackUrl) {
    console.log('⚠️ Using fallback URL from other sources');
    return {
      success: true,
      gltfUrl: fallbackUrl,
      source: 'fallback'
    };
  }

  return {
    success: false,
    error: 'No valid GLTF data found in shared model data',
    source: 'none'
  };
}

/**
 * Utility to check if a URL is suitable for cross-device sharing
 */
export function isValidShareableUrl(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('blob:')) return false;
  if (url.startsWith('http://localhost')) return false;
  if (url.startsWith('http://127.0.0.1')) return false;
  return url.startsWith('http://') || url.startsWith('https://');
}

/**
 * Gets reconstruction statistics for debugging
 */
export function getReconstructionStats(sharedModelData: any) {
  const result = extractGltfUrlWithReconstruction(sharedModelData);
  
  return {
    success: result.success,
    source: result.source,
    hasShareableUrl: !!(sharedModelData?.architecturalModel?.cadModel?.shareableGltfUrl || 
                        sharedModelData?.architecturalModel?.cadModel?.formats?.shareableGltf),
    hasBase64Data: !!(sharedModelData?.architecturalModel?.cadModel?.base64Data),
    hasFallbackUrl: !!(sharedModelData?.gltfUrl || 
                      sharedModelData?.architecturalModel?.gltfUrl),
    isShareable: isValidShareableUrl(result.gltfUrl || ''),
    finalUrl: result.gltfUrl?.substring(0, 50) + (result.gltfUrl && result.gltfUrl.length > 50 ? '...' : '')
  };
}