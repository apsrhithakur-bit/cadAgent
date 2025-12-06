import React, { useEffect, useState } from 'react';
import { Loader2, AlertCircle, Clock } from 'lucide-react';
import { sharedModelService, SharedModelData } from '../services/sharedModelService';

interface SharedModelLoaderProps {
  modelId: string;
  onModelLoaded: (modelData: SharedModelData) => void;
  onError: (error: string) => void;
}

const SharedModelLoader: React.FC<SharedModelLoaderProps> = ({
  modelId,
  onModelLoaded,
  onError
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  useEffect(() => {
    const loadSharedModel = async () => {
      try {
        setLoading(true);
        setError(null);

        console.log(`🔗 Loading shared model: ${modelId}`);
        
        const sharedModel = await sharedModelService.getSharedModel(modelId);
        
        console.log('✅ Shared model loaded:', sharedModel);
        
        setExpiresAt(sharedModel.expires_at);
        onModelLoaded(sharedModel.model_data);
        
      } catch (err) {
        console.error('❌ Failed to load shared model:', err);
        const errorMessage = err instanceof Error ? err.message : 'Failed to load shared model';
        setError(errorMessage);
        onError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    if (modelId) {
      loadSharedModel();
    }
  }, [modelId, onModelLoaded, onError]);

  if (loading) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        {/* Cosmic Destiny Background */}
        <div className="absolute inset-0" style={{ background: 'var(--destiny-gradient)' }}></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(59,130,246,0.1),transparent_50%)] animate-pulse"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(147,51,234,0.1),transparent_50%)] animate-pulse" style={{ animationDelay: '2s' }}></div>
        {/* Persistent Logo Navigation */}
        <button
          onClick={() => window.location.href = '/'}
          className="fixed top-6 left-6 z-50 group hover:scale-110 transition-transform duration-300"
        >
          <img
            src="/agenticad-logo.png"
            alt="AgentiCAD Logo"
            className="w-16 h-16 object-cover rounded-full shadow-lg hover:shadow-xl transition-shadow duration-300"
            style={{
              boxShadow: '0 4px 20px rgba(96, 165, 250, 0.3)'
            }}
          />
          {/* Hover tooltip */}
          <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 bg-black/90 text-white px-3 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Back to Home
          </div>
        </button>
        
        
        <div className="cosmic-panel text-center max-w-md mx-4 relative z-10">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Loading Shared Model</h2>
          <p className="text-gray-300 text-sm">
            Retrieving your AR model from the cloud...
          </p>
          <div className="mt-4 text-xs text-gray-400">
            Model ID: {modelId.substring(0, 8)}...
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen relative flex items-center justify-center">
        {/* Cosmic Destiny Background */}
        <div className="absolute inset-0" style={{ background: 'var(--destiny-gradient)' }}></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(239,68,68,0.1),transparent_50%)] animate-pulse"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(220,38,38,0.1),transparent_50%)] animate-pulse" style={{ animationDelay: '2s' }}></div>
        {/* Persistent Logo Navigation */}
        <button
          onClick={() => window.location.href = '/'}
          className="fixed top-6 left-6 z-50 group hover:scale-110 transition-transform duration-300"
        >
          <img
            src="/agenticad-logo.png"
            alt="AgentiCAD Logo"
            className="w-16 h-16 object-cover rounded-full shadow-lg hover:shadow-xl transition-shadow duration-300"
            style={{
              boxShadow: '0 4px 20px rgba(96, 165, 250, 0.3)'
            }}
          />
          {/* Hover tooltip */}
          <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 bg-black/90 text-white px-3 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            Back to Home
          </div>
        </button>
        
        
        <div className="cosmic-panel text-center max-w-md mx-4 relative z-10 border-red-500/20">
          <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Load Model</h2>
          <p className="text-gray-300 text-sm mb-4">{error}</p>
          
          <div className="space-y-3">
            <button
              onClick={() => window.location.href = '/'}
              className="w-full horizon-button-primary px-6 py-2 font-semibold"
            >
              Create New Model
            </button>
            
            <button
              onClick={() => window.location.reload()}
              className="w-full text-gray-300 hover:text-white px-6 py-2 rounded-lg border border-gray-600 hover:border-gray-500 transition-all duration-300"
            >
              Try Again
            </button>
          </div>
          
          {error.includes('expired') && (
            <div className="mt-4 text-xs text-gray-400 flex items-center justify-center gap-2">
              <Clock className="w-3 h-3" />
              Shared models expire after 7 days for security
            </div>
          )}
        </div>
      </div>
    );
  }

  // This component only renders loading/error states
  // Once loaded, the parent handles the actual content
  return null;
};

export default SharedModelLoader;