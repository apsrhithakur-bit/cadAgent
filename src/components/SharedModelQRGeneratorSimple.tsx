import React, { useState, useEffect } from 'react';
import { Loader2, Clock, Share2, AlertCircle, RefreshCw } from 'lucide-react';
import { sharedModelService, SharedModelData } from '../services/sharedModelService';
import { generateMobileUrl, getNetworkInfo, getDeviceInfo } from '../utils/networkDetection';

interface SharedModelQRGeneratorProps {
  modelData: SharedModelData;
  className?: string;
  style?: React.CSSProperties;
  fallbackUrl?: string;
}

const SharedModelQRGeneratorSimple: React.FC<SharedModelQRGeneratorProps> = ({ 
  modelData, 
  className, 
  style,
  fallbackUrl
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

  const createSharedModel = async (modelData: SharedModelData) => {
    try {
      setIsCreating(true);
      setError(null);
      
      console.log('🔗 Creating shared model for cross-device AR access...');
      
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
          
          {useSharedModel && shareUrl && (
            <div style={{ fontSize: '10px', color: '#10b981', marginBottom: '8px' }}>
              ✅ Your model progress is preserved in this link
            </div>
          )}
          
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              onClick={() => setShowQR(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.2)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer'
              }}
            >
              ← Back
            </button>
            
            <button
              onClick={generateQRCode}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                color: 'white',
                padding: '6px 12px',
                borderRadius: '15px',
                fontSize: '11px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
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

export default SharedModelQRGeneratorSimple;