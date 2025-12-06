import { ArchitecturalModel } from '../types/architectural';
import { SharedModelData } from '../services/sharedModelService';

/**
 * Extract shared model data from ProcessWizard state
 * This function gathers all the necessary data to recreate the AR experience on another device
 */
export const extractSharedModelData = (
  currentStep: number,
  generatedResults: any,
  architecturalModel: ArchitecturalModel | null,
  originalPrompt?: string,
  refinementHistory?: any[],
  designSession?: any
): SharedModelData => {
  const sharedData: SharedModelData = {
    currentStep: currentStep, // Preserve the original step to restore user's progress
    originalPrompt,
    refinementHistory: refinementHistory || [],
    designSession,
  };

  // Include current generation results if available
  if (generatedResults) {
    sharedData.generatedResults = {
      ...generatedResults,
      // Ensure we have the model URLs
      gltfUrl: generatedResults.gltfUrl,
      modelViewerUrl: generatedResults.modelViewerUrl,
    };
  }

  // Include architectural model data
  if (architecturalModel) {
    // Prioritize shareable GLTF URL over blob URL for cross-device compatibility
    const shareableGltfUrl = architecturalModel.cadModel?.shareableGltfUrl || 
                            architecturalModel.cadModel?.formats?.shareableGltf ||
                            architecturalModel.cadModel?.gltfUrl ||
                            architecturalModel.gltfUrl;
    
    sharedData.architecturalModel = {
      ...architecturalModel,
      // Ensure essential URLs are preserved (use shareable URL for cross-device access)
      gltfUrl: shareableGltfUrl,
      modelViewerUrl: architecturalModel.modelViewerUrl,
    };

    // Extract essential model data
    sharedData.modelData = {
      title: architecturalModel.title,
      description: architecturalModel.description,
      gltfUrl: shareableGltfUrl, // Use shareable URL instead of blob URL
      modelViewerUrl: architecturalModel.modelViewerUrl,
      properties: architecturalModel.properties,
      components: architecturalModel.components,
    };
  }

  // Ensure we have GLTF URL from any available source (prefer shareable URLs)
  if (!sharedData.gltfUrl && !sharedData.modelData?.gltfUrl) {
    if (generatedResults?.gltfUrl) {
      sharedData.gltfUrl = generatedResults.gltfUrl;
    } else if (architecturalModel) {
      // Use the same logic to get shareable URL
      const shareableGltfUrl = architecturalModel.cadModel?.shareableGltfUrl || 
                              architecturalModel.cadModel?.formats?.shareableGltf ||
                              architecturalModel.cadModel?.gltfUrl ||
                              architecturalModel.gltfUrl;
      sharedData.gltfUrl = shareableGltfUrl;
    }
  }

  console.log('📦 Extracted shared model data:', sharedData);
  return sharedData;
};

/**
 * Check if we have enough data to create a shared model
 */
export const canCreateSharedModel = (data: any): boolean => {
  // We need at least a GLTF URL or architectural model
  const hasGltfUrl = !!(data.gltfUrl || data.generatedResults?.gltfUrl || data.architecturalModel?.gltfUrl);
  const hasModelData = !!(data.architecturalModel || data.generatedResults);
  
  return hasGltfUrl && hasModelData;
};

/**
 * Get a fallback URL when shared model creation fails
 */
export const getFallbackUrl = (): string => {
  const currentUrl = window.location.href;
  
  // If already on a step URL, preserve it
  if (currentUrl.includes('step=ar')) {
    return currentUrl;
  }
  
  // Add AR step parameter
  const url = new URL(currentUrl);
  url.searchParams.set('step', 'ar');
  return url.toString();
};