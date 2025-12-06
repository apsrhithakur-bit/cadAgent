/**
 * Google Maps API Loader
 * Ensures the Google Maps JavaScript API is loaded before use
 */

declare global {
  interface Window {
    google: any;
    initGoogleMapsCallback?: () => void;
    googleMapsLoaded?: boolean;
    googleMapsLoadPromise?: Promise<void>;
  }
}

const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY;

let loadPromise: Promise<void> | null = null;

export async function loadGoogleMapsAPI(): Promise<void> {
  // If already loaded, return immediately
  if (window.google?.maps?.places) {
    console.log('✅ Google Maps API already loaded');
    return Promise.resolve();
  }

  // If already loading, return the existing promise
  if (loadPromise) {
    console.log('⏳ Google Maps API already loading, waiting...');
    return loadPromise;
  }

  // Create new loading promise
  loadPromise = new Promise((resolve, reject) => {
    // Check if script already exists
    const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
    if (existingScript) {
      // Script exists, wait for it to load
      console.log('📍 Google Maps script found, waiting for load...');
      
      let attempts = 0;
      const maxAttempts = 100; // 10 seconds timeout
      const checkInterval = setInterval(() => {
        attempts++;
        if (window.google?.maps?.places) {
          clearInterval(checkInterval);
          console.log('✅ Google Maps API loaded successfully');
          resolve();
        } else if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          reject(new Error('Google Maps API load timeout'));
        }
      }, 100);
      return;
    }

    // Create callback function
    const callbackName = 'initGoogleMapsCallback_' + Date.now();
    (window as any)[callbackName] = () => {
      console.log('✅ Google Maps API loaded via callback');
      window.googleMapsLoaded = true;
      delete (window as any)[callbackName];
      resolve();
    };

    // Create and append script
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_API_KEY}&libraries=places&callback=${callbackName}`;
    script.async = true;
    script.defer = true;
    script.onerror = () => {
      delete (window as any)[callbackName];
      reject(new Error('Failed to load Google Maps script'));
    };

    console.log('📍 Loading Google Maps API...');
    document.head.appendChild(script);
  });

  return loadPromise;
}

// Helper to check if Google Maps is loaded
export function isGoogleMapsLoaded(): boolean {
  return !!(window.google?.maps?.places);
}

// Wait for Google Maps with timeout
export async function waitForGoogleMaps(timeout: number = 10000): Promise<void> {
  const startTime = Date.now();
  
  // First try to load it
  await loadGoogleMapsAPI();
  
  // Then verify it's really loaded
  return new Promise((resolve, reject) => {
    const checkLoaded = () => {
      if (window.google?.maps?.places) {
        resolve();
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Google Maps API failed to load within ${timeout}ms`));
      } else {
        setTimeout(checkLoaded, 100);
      }
    };
    checkLoaded();
  });
}