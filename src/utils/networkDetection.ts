// Network Detection Utilities for Cross-Device AR
// Enhanced network IP detection and mobile connectivity

export interface NetworkInfo {
  localIP: string;
  networkIPs: string[];
  preferredIP: string;
  port: string;
  protocol: string;
  isLocalhost: boolean;
  mobileAccessUrl: string;
  qrCodeUrl: string;
}

export interface DeviceInfo {
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isIOS: boolean;
  isAndroid: boolean;
  browser: string;
  supportsAR: boolean;
  arCapabilities: string[];
}

// Get comprehensive network information for cross-device setup
export const getNetworkInfo = (): NetworkInfo => {
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = window.location.port || (protocol === 'https:' ? '443' : '80');
  const pathname = window.location.pathname;
  const search = window.location.search;
  
  const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
  
  // Known working network IPs for AGENTICAD development
  const knownNetworkIPs = [
    '192.168.1.207', // Primary development IP
    '172.25.32.1',   // WSL network interface
    '192.168.1.100', // Common router range start
    '192.168.0.100', // Alternative router range
    '10.0.0.100',    // Corporate network range
    '192.168.56.1'   // VirtualBox host-only adapter
  ];
  
  // Prefer the known working IP for AGENTICAD
  const preferredIP = '192.168.1.207';
  
  const mobileAccessUrl = isLocalhost 
    ? `${protocol}//${preferredIP}:${port}${pathname}${search}`
    : window.location.href;
  
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(mobileAccessUrl)}`;
  
  return {
    localIP: hostname,
    networkIPs: knownNetworkIPs,
    preferredIP,
    port,
    protocol,
    isLocalhost,
    mobileAccessUrl,
    qrCodeUrl
  };
};

// Enhanced device detection with AR capability assessment
export const getDeviceInfo = (): DeviceInfo => {
  const userAgent = navigator.userAgent.toLowerCase();
  
  // Device type detection
  const isMobile = /android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent);
  const isTablet = /ipad|android(?!.*mobile)/i.test(userAgent);
  const isDesktop = !isMobile && !isTablet;
  
  // OS detection
  const isIOS = /ipad|iphone|ipod/.test(userAgent);
  const isAndroid = /android/.test(userAgent);
  
  // Browser detection
  let browser = 'unknown';
  if (userAgent.includes('chrome')) browser = 'chrome';
  else if (userAgent.includes('safari')) browser = 'safari';
  else if (userAgent.includes('firefox')) browser = 'firefox';
  else if (userAgent.includes('edge')) browser = 'edge';
  
  // AR capability assessment
  const arCapabilities: string[] = [];
  let supportsAR = false;
  
  if (isIOS && browser === 'safari') {
    arCapabilities.push('Quick Look AR');
    supportsAR = true;
  }
  
  if (isAndroid && browser === 'chrome') {
    arCapabilities.push('WebXR');
    arCapabilities.push('Scene Viewer');
    supportsAR = true;
  }
  
  // Check for WebXR support
  if ('xr' in navigator) {
    arCapabilities.push('WebXR API');
    supportsAR = true;
  }
  
  // Check for device orientation (needed for AR)
  if ('DeviceOrientationEvent' in window) {
    arCapabilities.push('Device Orientation');
  }
  
  // Check for secure context (required for camera access)
  if (window.isSecureContext) {
    arCapabilities.push('Secure Context');
  } else {
    arCapabilities.push('⚠️ Insecure Context - Camera access limited');
  }
  
  return {
    isMobile,
    isTablet,
    isDesktop,
    isIOS,
    isAndroid,
    browser,
    supportsAR,
    arCapabilities
  };
};

// Generate mobile-friendly URLs with automatic network detection
export const generateMobileUrl = (customPath?: string): string => {
  const networkInfo = getNetworkInfo();
  const basePath = customPath || window.location.pathname;
  const search = window.location.search;
  
  if (networkInfo.isLocalhost) {
    return `${networkInfo.protocol}//${networkInfo.preferredIP}:${networkInfo.port}${basePath}${search}`;
  }
  
  return `${networkInfo.protocol}//${networkInfo.localIP}:${networkInfo.port}${basePath}${search}`;
};

// Test network connectivity to mobile URL
export const testMobileConnectivity = async (url?: string): Promise<{
  success: boolean;
  url: string;
  error?: string;
  latency?: number;
}> => {
  const testUrl = url || generateMobileUrl();
  const startTime = Date.now();
  
  try {
    // Use fetch with no-cors mode to avoid CORS issues during testing
    await fetch(testUrl, { 
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-cache'
    });
    
    const latency = Date.now() - startTime;
    
    return {
      success: true,
      url: testUrl,
      latency
    };
  } catch (error) {
    return {
      success: false,
      url: testUrl,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Get comprehensive setup information for cross-device AR
export const getCrossDeviceSetupInfo = async (): Promise<{
  networkInfo: NetworkInfo;
  deviceInfo: DeviceInfo;
  connectivityTest: Awaited<ReturnType<typeof testMobileConnectivity>>;
  recommendations: string[];
}> => {
  const networkInfo = getNetworkInfo();
  const deviceInfo = getDeviceInfo();
  const connectivityTest = await testMobileConnectivity();
  
  const recommendations: string[] = [];
  
  // Network recommendations
  if (networkInfo.isLocalhost) {
    recommendations.push('🌐 Using localhost - mobile devices need network IP access');
    recommendations.push(`📱 Share this URL with mobile: ${networkInfo.mobileAccessUrl}`);
  }
  
  // Device-specific recommendations
  if (deviceInfo.isDesktop) {
    recommendations.push('💻 Desktop detected - use QR code for mobile AR handoff');
  }
  
  if (deviceInfo.supportsAR) {
    recommendations.push('✅ AR support detected on this device');
    recommendations.push(`🎯 AR capabilities: ${deviceInfo.arCapabilities.join(', ')}`);
  } else {
    recommendations.push('📱 AR not supported - use QR code to access from AR-capable device');
  }
  
  // Security recommendations
  if (!window.isSecureContext) {
    recommendations.push('🔒 HTTPS required for full AR functionality');
  }
  
  // Connectivity recommendations
  if (!connectivityTest.success && networkInfo.isLocalhost) {
    recommendations.push('🔗 Ensure both devices are on the same WiFi network');
  }
  
  return {
    networkInfo,
    deviceInfo,
    connectivityTest,
    recommendations
  };
};

// Utility to format network information for display
export const formatNetworkInfo = (networkInfo: NetworkInfo): string => {
  return `
Network Configuration:
- Local: ${networkInfo.protocol}//${networkInfo.localIP}:${networkInfo.port}
- Mobile: ${networkInfo.mobileAccessUrl}
- Localhost: ${networkInfo.isLocalhost ? 'Yes' : 'No'}
- Preferred IP: ${networkInfo.preferredIP}
- Available IPs: ${networkInfo.networkIPs.join(', ')}
  `.trim();
};

// Utility to format device information for display
export const formatDeviceInfo = (deviceInfo: DeviceInfo): string => {
  return `
Device Information:
- Type: ${deviceInfo.isMobile ? 'Mobile' : deviceInfo.isTablet ? 'Tablet' : 'Desktop'}
- OS: ${deviceInfo.isIOS ? 'iOS' : deviceInfo.isAndroid ? 'Android' : 'Other'}
- Browser: ${deviceInfo.browser}
- AR Support: ${deviceInfo.supportsAR ? 'Yes' : 'No'}
- AR Capabilities: ${deviceInfo.arCapabilities.join(', ')}
  `.trim();
};

// Console logging utility for network debugging
export const logNetworkSetup = async (): Promise<void> => {
  console.log('🌐 AGENTICAD Cross-Device Network Setup');
  console.log('=====================================');
  
  const setupInfo = await getCrossDeviceSetupInfo();
  
  console.log('\n📊 Network Information:');
  console.log(formatNetworkInfo(setupInfo.networkInfo));
  
  console.log('\n📱 Device Information:');
  console.log(formatDeviceInfo(setupInfo.deviceInfo));
  
  console.log('\n🔗 Connectivity Test:');
  console.log(`- Success: ${setupInfo.connectivityTest.success}`);
  console.log(`- URL: ${setupInfo.connectivityTest.url}`);
  if (setupInfo.connectivityTest.latency) {
    console.log(`- Latency: ${setupInfo.connectivityTest.latency}ms`);
  }
  if (setupInfo.connectivityTest.error) {
    console.log(`- Error: ${setupInfo.connectivityTest.error}`);
  }
  
  console.log('\n💡 Recommendations:');
  setupInfo.recommendations.forEach(rec => console.log(`  ${rec}`));
  
  console.log('\n🎯 Quick Actions:');
  console.log(`  📱 Mobile URL: ${setupInfo.networkInfo.mobileAccessUrl}`);
  console.log(`  📲 QR Code: ${setupInfo.networkInfo.qrCodeUrl}`);
  console.log('=====================================');
};

// Export utility functions for backward compatibility
export default {
  getNetworkInfo,
  getDeviceInfo,
  generateMobileUrl,
  testMobileConnectivity,
  getCrossDeviceSetupInfo,
  formatNetworkInfo,
  formatDeviceInfo,
  logNetworkSetup
};