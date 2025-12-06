import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, RootState } from '@react-three/fiber';
import { webglContextManager } from '../utils/webglContextManager';

interface ManagedWebGLOptions {
  priority?: 'high' | 'normal';
  pixelRatio?: number;
}

export const useManagedWebGLContext = (options: ManagedWebGLOptions = {}) => {
  const { priority = 'normal', pixelRatio = 1.5 } = options;
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const registeredRef = useRef(false);
  const contextId = useMemo(() => `three-${Math.random().toString(36).slice(2)}-${Date.now()}`, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const permitted = await webglContextManager.requestContext('three.js', priority);
      if (cancelled) return;

      if (!permitted) {
        setError('WebGL resources busy. Close other 3D/AR views to continue.');
      }

      setReady(permitted);
    })();

    return () => {
      cancelled = true;

      if (rendererRef.current) {
        try {
          rendererRef.current.dispose();
        } catch (err) {
          console.warn('Failed to dispose renderer', err);
        }
      }

      if (registeredRef.current) {
        webglContextManager.disposeContext(contextId);
        registeredRef.current = false;
      }
    };
  }, [contextId, priority]);

  const handleCreated = useCallback((state: RootState) => {
    rendererRef.current = state.gl;
    const canvas = state.gl.domElement;
    const glContext = canvas?.getContext('webgl2') || canvas?.getContext('webgl');

    if (canvas && glContext) {
      webglContextManager.registerContext(
        contextId,
        'three.js',
        canvas,
        glContext,
        { powerPreference: state.gl.getContextAttributes()?.powerPreference }
      );
      registeredRef.current = true;
    }

    state.gl.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatio));
    state.gl.outputColorSpace = THREE.SRGBColorSpace;
    state.gl.toneMapping = THREE.ACESFilmicToneMapping;
    state.gl.toneMappingExposure = 1.0;
  }, [contextId, pixelRatio]);

  const markUsage = useCallback(() => {
    if (registeredRef.current) {
      webglContextManager.updateContextUsage(contextId);
    }
  }, [contextId]);

  const UsageMarker = useMemo(() => {
    return function UsageTracker() {
      useFrame(() => {
        markUsage();
      });
      return null;
    };
  }, [markUsage]);

  return { ready, error, handleCreated, UsageMarker };
};
