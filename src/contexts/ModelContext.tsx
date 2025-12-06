import React, { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { ArchitecturalModel, CalculatedProperties } from '../types/architectural';

interface ModelContextType {
  // Model State
  model: ArchitecturalModel | null;
  calculatedProperties: CalculatedProperties | null;
  
  // Three.js References
  scene: THREE.Scene | null;
  renderer: THREE.WebGLRenderer | null;
  camera: THREE.PerspectiveCamera | null;
  
  // Model Management
  setModel: (model: ArchitecturalModel | null) => void;
  setCalculatedProperties: (properties: CalculatedProperties | null) => void;
  
  // Context Management
  initializeRenderer: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;
  disposeRenderer: () => void;
  
  // AR State
  arMode: 'none' | '3d' | 'ar';
  setArMode: (mode: 'none' | '3d' | 'ar') => void;
  
  // Loading States
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
}

const ModelContext = createContext<ModelContextType | null>(null);

export const useModelContext = () => {
  const context = useContext(ModelContext);
  if (!context) {
    throw new Error('useModelContext must be used within a ModelContextProvider');
  }
  return context;
};

export const ModelContextProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Model State
  const [model, setModelState] = useState<ArchitecturalModel | null>(null);
  const [calculatedProperties, setCalculatedPropertiesState] = useState<CalculatedProperties | null>(null);
  
  // Three.js References (persistent across component unmounts)
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  
  // AR State
  const [arMode, setArMode] = useState<'none' | '3d' | 'ar'>('none');
  const [isLoading, setIsLoading] = useState(false);

  // Initialize persistent Three.js scene
  useEffect(() => {
    if (!sceneRef.current) {
      console.log('🏗️ Initializing persistent Three.js scene');
      sceneRef.current = new THREE.Scene();
      sceneRef.current.background = new THREE.Color(0x1a1a1a);
      
      // Add default lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(10, 10, 5);
      
      sceneRef.current.add(ambientLight);
      sceneRef.current.add(directionalLight);
    }

    if (!cameraRef.current) {
      console.log('📹 Initializing persistent camera');
      cameraRef.current = new THREE.PerspectiveCamera(75, 1, 0.1, 1000);
      cameraRef.current.position.set(0, 0, 5);
    }
  }, []);

  // Initialize renderer (only when needed)
  const initializeRenderer = useCallback((canvas: HTMLCanvasElement): THREE.WebGLRenderer => {
    if (rendererRef.current) {
      console.log('♻️ Reusing existing renderer');
      return rendererRef.current;
    }

    console.log('🎨 Creating new WebGL renderer');
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // For AR screenshots
    });
    
    renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;

    // Context loss handling
    canvas.addEventListener('webglcontextlost', (event) => {
      console.warn('🔥 WebGL context lost - preventing default');
      event.preventDefault();
    });

    canvas.addEventListener('webglcontextrestored', () => {
      console.log('🔄 WebGL context restored');
    });

    rendererRef.current = renderer;
    return renderer;
  }, []);

  // Dispose renderer (only when truly needed)
  const disposeRenderer = useCallback(() => {
    if (rendererRef.current) {
      console.log('🗑️ Disposing WebGL renderer');
      rendererRef.current.dispose();
      rendererRef.current = null;
    }
  }, []);

  // Model setters with persistence
  const setModel = useCallback((newModel: ArchitecturalModel | null) => {
    console.log('📦 Model updated in context:', newModel?.name || 'null');
    setModelState(newModel);
  }, []);

  const setCalculatedProperties = useCallback((properties: CalculatedProperties | null) => {
    console.log('📊 Properties updated in context');
    setCalculatedPropertiesState(properties);
  }, []);

  // Cleanup on unmount (only dispose renderer, keep scene/camera)
  useEffect(() => {
    return () => {
      console.log('🧹 ModelContextProvider unmounting');
      // Don't dispose scene/camera - they persist across navigation
      // Only dispose renderer when absolutely necessary
    };
  }, []);

  const contextValue: ModelContextType = {
    // Model State
    model,
    calculatedProperties,
    
    // Three.js References
    scene: sceneRef.current,
    renderer: rendererRef.current,
    camera: cameraRef.current,
    
    // Model Management
    setModel,
    setCalculatedProperties,
    
    // Context Management
    initializeRenderer,
    disposeRenderer,
    
    // AR State
    arMode,
    setArMode,
    
    // Loading States
    isLoading,
    setIsLoading,
  };

  return (
    <ModelContext.Provider value={contextValue}>
      {children}
    </ModelContext.Provider>
  );
};