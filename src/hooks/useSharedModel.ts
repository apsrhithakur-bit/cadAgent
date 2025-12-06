import { useState, useCallback } from 'react';
import { sharedModelService, SharedModelData } from '../services/sharedModelService';

export const useSharedModel = () => {
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  const createSharedModel = useCallback(async (modelData: SharedModelData) => {
    try {
      setIsCreating(true);
      setError(null);
      
      console.log('🔗 Creating shared model for cross-device AR access...');
      
      const sharedModel = await sharedModelService.createSharedModel(modelData, 7); // 7 days expiration
      const url = sharedModelService.generateShareUrl(sharedModel.id);
      
      setShareUrl(url);
      
      console.log('✅ Shared model created:', {
        id: sharedModel.id,
        shareUrl: url,
        expiresAt: sharedModel.expires_at
      });
      
      return {
        id: sharedModel.id,
        shareUrl: url,
        expiresAt: sharedModel.expires_at
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create shared model';
      console.error('❌ Failed to create shared model:', errorMessage);
      setError(errorMessage);
      throw err;
    } finally {
      setIsCreating(false);
    }
  }, []);

  const resetShareState = useCallback(() => {
    setShareUrl(null);
    setError(null);
  }, []);

  return {
    createSharedModel,
    isCreating,
    error,
    shareUrl,
    resetShareState
  };
};