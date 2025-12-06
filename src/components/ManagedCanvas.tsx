import React, { forwardRef } from 'react';
import { Canvas, CanvasProps, RootState } from '@react-three/fiber';
import { useManagedWebGLContext } from '../hooks/useManagedWebGLContext';

interface ManagedCanvasProps extends CanvasProps {
  priority?: 'high' | 'normal';
  fallback?: React.ReactNode;
}

const ManagedCanvas = forwardRef<HTMLCanvasElement, ManagedCanvasProps>(({
  children,
  onCreated,
  priority = 'normal',
  fallback,
  ...rest
}, ref) => {
  const { ready, error, handleCreated, UsageMarker } = useManagedWebGLContext({ priority });

  if (!ready) {
    return (
      <div className="flex items-center justify-center min-h-[200px] text-center text-white/70 text-sm">
        {error || fallback || 'Preparing 3D renderer...'}
      </div>
    );
  }

  const handleCanvasCreated = (state: RootState) => {
    handleCreated(state);
    onCreated?.(state);
  };

  return (
    <Canvas ref={ref as any} onCreated={handleCanvasCreated} {...rest}>
      <UsageMarker />
      {children}
    </Canvas>
  );
});

ManagedCanvas.displayName = 'ManagedCanvas';

export default ManagedCanvas;
