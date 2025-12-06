import React, { useState, useEffect } from 'react';
import { generateMobileUrl, getNetworkInfo, getDeviceInfo } from '../utils/networkDetection';

// Enhanced utility function using network detection
const getNetworkUrl = (currentUrl: string) => {
  try {
    // Use the comprehensive network detection utility
    return generateMobileUrl();
  } catch (error) {
    console.warn('Network detection fallback:', error);
    
    // Fallback to original logic
    if (!currentUrl.includes('localhost') && !currentUrl.includes('127.0.0.1')) {
      return currentUrl;
    }
    
    const port = window.location.port;
    const protocol = window.location.protocol;
    const pathname = window.location.pathname;
    const search = window.location.search;
    
    const networkIP = '192.168.1.207';
    return `${protocol}//${networkIP}:${port}${pathname}${search}`;
  }
};

interface QRCodeGeneratorProps {
  currentUrl: string;
  className?: string;
  style?: React.CSSProperties;
}

const QRCodeGenerator: React.FC<QRCodeGeneratorProps> = ({ currentUrl, className, style }) => {
  const [showQR, setShowQR] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [networkUrl, setNetworkUrl] = useState('');
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [deviceInfo, setDeviceInfo] = useState<any>(null);
  
  // Initialize network and device information
  useEffect(() => {
    const initializeInfo = async () => {
      try {
        const netInfo = getNetworkInfo();
        const devInfo = getDeviceInfo();
        
        setNetworkInfo(netInfo);
        setDeviceInfo(devInfo);
        
        console.log('🌐 QR Generator network info:', netInfo);
        console.log('📱 QR Generator device info:', devInfo);
      } catch (error) {
        console.error('Failed to initialize QR generator info:', error);
      }
    };
    
    initializeInfo();
  }, []);

  const generateQRCode = async () => {
    try {
      const networkAccessibleUrl = getNetworkUrl(currentUrl);
      
      // Always generate QR code with network IP
      setNetworkUrl(networkAccessibleUrl);
      
      // Use QR Server API (free, no API key required)
      const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(networkAccessibleUrl)}`;
      setQrDataUrl(qrUrl);
      setShowQR(true);
      
      console.log('📱 QR Code generated for:', networkAccessibleUrl);
    } catch (error) {
      console.error('Failed to generate QR code:', error);
    }
  };

  return (
    <div className={className} style={style}>
      {!showQR ? (
        <>
          <h4 style={{ margin: '0 0 0.5rem 0' }}>📱 AR Not Available</h4>
          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.9rem' }}>
            AR is not available on this device. Please open this link on a device that supports AR:
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
          <button
            onClick={generateQRCode}
            style={{
              background: 'rgba(255, 255, 255, 0.2)',
              border: '1px solid rgba(255, 255, 255, 0.4)',
              color: 'white',
              padding: '8px 16px',
              borderRadius: '20px',
              fontSize: '12px',
              fontWeight: '600',
              cursor: 'pointer',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.3)';
            }}
            onMouseOut={(e) => {
              (e.target as HTMLButtonElement).style.background = 'rgba(255, 255, 255, 0.2)';
            }}
          >
            📲 Generate QR Code
          </button>
        </>
      ) : (
        <>
          <div style={{ marginBottom: '12px' }}>
            <strong>📲 Scan with your phone</strong>
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
              {networkUrl}
            </code>
          </div>
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
        </>
      )}
    </div>
  );
};

export default QRCodeGenerator;