import React, { useState, useEffect } from 'react';
import { Loader2, Clock, Share2, AlertCircle, RefreshCw } from 'lucide-react';
import { sharedModelService, SharedModelData } from '../services/sharedModelService';
import { generateMobileUrl, getNetworkInfo, getDeviceInfo } from '../utils/networkDetection';
import { detectSharedUrlContext, getQRCodeUrl, getSharingContextInfo } from '../utils/urlDetection';

interface SharedModelQRGeneratorProps {
  modelData: SharedModelData;
  className?: string;
  style?: React.CSSProperties;
  fallbackUrl?: string; // Original URL fallback
  autoShow?: boolean; // Auto-show QR code immediately without button interface
}

const SharedModelQRGenerator: React.FC<SharedModelQRGeneratorProps> = ({ 
  modelData, 
  className, 
  style,
  fallbackUrl,
  autoShow = false
}) => {
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [finalUrl, setFinalUrl] = useState('');
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  const [useSharedModel, setUseSharedModel] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);

  // Initialize network and device information
  useEffect(() => {
    const initializeInfo = async () => {
      try {
        const netInfo = getNetworkInfo();
        const devInfo = getDeviceInfo();
        
        setNetworkInfo(netInfo);
        setDeviceInfo(devInfo);
        
        console.log('🌐 SharedModelQR network info:', netInfo);
        console.log('📱 SharedModelQR device info:', devInfo);
      } catch (error) {
        console.error('Failed to initialize SharedModelQR info:', error);
      }
    };
    
    initializeInfo();
  }, []);

  // Auto-show QR code when autoShow prop is true
  useEffect(() => {
    if (autoShow && networkInfo && !showQR && !isCreating) {
      console.log('🔄 Auto-showing QR code due to autoShow prop');
      generateQRCode();
    }
  }, [autoShow, networkInfo, showQR, isCreating]);

  const createSharedModel = async (modelData: SharedModelData) => {
    try {
      setIsCreating(true);
      setError(null);
      
      // Check if we're already in a shared URL context
      const urlContext = detectSharedUrlContext();
      
      if (urlContext.isSharedUrl) {
        console.log('♻️ Reusing existing shared URL instead of creating new one:', urlContext.currentUrl);
        setShareUrl(urlContext.currentUrl);
        setIsCreating(false);
        return;
      }
      
      console.log('🔗 Creating new shared model for cross-device AR access...');
      console.log('📦 Model data being saved:', {
        modelData,
        hasGltfUrl: !!modelData?.gltfUrl,
        hasArchModel: !!modelData?.architecturalModel,
        hasArchModelGltf: !!modelData?.architecturalModel?.gltfUrl,
        hasCadModel: !!modelData?.architecturalModel?.cadModel,
        cadModelGltf: modelData?.architecturalModel?.cadModel?.gltfUrl
      });
      
      const sharedModel = await sharedModelService.createSharedModel(modelData, 7);
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
  };

  const generateQRCode = async () => {
    try {
      setShowQR(true);
      
      let urlToUse = '';
      
      if (useSharedModel && modelData) {
        try {
          // Try to create a shared model first
          const result = await createSharedModel(modelData);
          urlToUse = result.shareUrl;
          console.log('✅ Using shared model URL:', urlToUse);
        } catch (sharedError) {
          console.warn('⚠️ Shared model creation failed, falling back to direct URL:', sharedError);
          // Fall back to original method
          urlToUse = fallbackUrl || generateMobileUrl();
        }
      } else {
        // Use original URL generation
        urlToUse = fallbackUrl || generateMobileUrl();
      }
      
      setFinalUrl(urlToUse);
      
      // Generate QR code using QR Server API
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlToUse)}`;
      setQrDataUrl(qrUrl);
      
      console.log('📱 QR Code generated for:', urlToUse);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  };

  const toggleSharedModelMode = () => {
    setUseSharedModel(!useSharedModel);
    setShowQR(false);
    setQrDataUrl('');
    setFinalUrl('');
  };

  return (
    <div className={className} style={style}>
      {!showQR ? (
        <>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>📱 AR Not Available</h4>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
            AR is not available on this device. {useSharedModel ? 'Generate a shareable link' : 'Open this link'} on a device that supports AR:
          </p>
          <div style={{ fontSize: '0.85rem', lineHeight: '1.4', marginBottom: '1rem' }}>
            <strong>Compatible devices:</strong><br/>
            📱 Android smartphone (Chrome 88+)<br/>
            📱 iPhone/iPad (Safari 14+)<br/>
            🥽 Apple Vision Pro<br/>
            👓 AR-capable devices
            {networkInfo && networkInfo.isLocalhost && (
              <>
                <br/><br/>
                <strong>Network Status:</strong><br/>
                🌐 Local development mode<br/>
                📡 Network IP: {networkInfo.preferredIP}
              </>
            )}
          </div>
          
          {/* Mode Toggle */}
          <div style={{ marginBottom: '1rem', fontSize: '0.8rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={useSharedModel}
                onChange={toggleSharedModelMode}
                style={{ marginRight: '4px' }}
              />
              <Share2 size={12} />
              Create persistent share link (works across devices)
            </label>
            {!useSharedModel && (
              <div style={{ marginTop: '4px', color: '#fbbf24', fontSize: '0.75rem' }}>
                ⚠️ Direct network link only works on same WiFi
              </div>
            )}
          </div>
          
          {error && (
            <div style={{ 
              marginBottom: '1rem', 
              padding: '8px', 
              backgroundColor: 'rgba(248, 113, 113, 0.1)', 
              border: '1px solid rgba(248, 113, 113, 0.3)',
              borderRadius: '4px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <AlertCircle size={12} color="#f87171" />
              {error}
            </div>
          )}
          
          <button
            onClick={generateQRCode}
            disabled={isCreating}
            style={{
              background: isCreating ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: isCreating ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
            onMouseOver={(e) => {
              if (!isCreating) {
                (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.3)';
              }
            }}
            onMouseOut={(e) => {
              if (!isCreating) {
                (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.2)';
              }
            }}
          >
            {isCreating ? (
              <>
                <Loader2 size={12} className="animate-spin" />
                Creating Share Link...
              </>
            ) : (
              <>
                📲 Generate QR Code
                {useSharedModel && <Share2 size={10} />}
              </>
            )}
          </button>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <strong>📲 Scan with your phone</strong>
            {useSharedModel && shareUrl && (
              <div style={{ fontSize: '10px', backgroundColor: 'rgba(34, 197, 94, 0.2)', padding: '2px 6px', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Share2 size={8} />
                Shared Link
                <Clock size={8} />
                7 days
              </div>
            )}
          </div>
          
          <div style={{ 
            background: 'white', 
            padding: '8px', 
            borderRadius: '8px', 
            marginBottom: '12px',
            display: 'inline-block'
          }}>
            <img 
              src={qrDataUrl} 
              alt="QR Code for AR viewing"
              style={{ 
                display: 'block',
                width: '120px',
                height: '120px'
              }}
            />
          </div>
          
          <div style={{ fontSize: '11px', fontWeight: '400', marginBottom: '8px' }}>
            Scan to open: <br/>
            <code style={{ 
              background: 'rgba(0,0,0,0.3)', 
              padding: '2px 4px', 
              borderRadius: '3px',
              fontSize: '10px',
              wordBreak: 'break-all'
            }}>
              {finalUrl}
            </code>
          </div>
          
          <div style={{ 
            fontSize: '10px', 
            color: '#fbbf24', 
            background: 'rgba(251, 191, 36, 0.1)',
            border: '1px solid rgba(251, 191, 36, 0.2)',
            borderRadius: '4px',
            padding: '4px 6px',
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <AlertCircle size={10} />
            Mobile users will need to sign in to access shared content
          </div>
          
          {useSharedModel && shareUrl && (() => {
            const contextInfo = getSharingContextInfo();
            return (
              <div style={{ fontSize: '10px', color: '#10b981', marginBottom: '8px' }}>
                {contextInfo.contextMessage}
                {contextInfo.isReused && (
                  <div style={{ fontSize: '9px', color: '#6b7280', marginTop: '2px' }}>
                    {contextInfo.iconText} - No new QR needed
                  </div>
                )}
              </div>
            );
          })()}
          
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            <button
              onClick={() => setShowQR(false)}
              style={{
                background: '#374151',
                border: '1px solid #4b5563',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                (e.target as HTMLButtonElement).style.background = '#1f2937';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLButtonElement).style.background = '#374151';
              }}
            >
              ← Back
            </button>
            
            <button
              onClick={generateQRCode}
              style={{
                background: '#2563eb',
                border: '1px solid #3b82f6',
                color: 'white',
                padding: '8px 16px',
                borderRadius: '20px',
                fontSize: '12px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => {
                (e.target as HTMLButtonElement).style.background = '#1d4ed8';
              }}
              onMouseOut={(e) => {
                (e.target as HTMLButtonElement).style.background = '#2563eb';
              }}
            >
              <RefreshCw size={10} />
              Regenerate
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default SharedModelQRGenerator;