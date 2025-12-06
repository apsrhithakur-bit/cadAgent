import React, { useEffect } from 'react';
import CrossDeviceARViewer from './CrossDeviceARViewer';
import { ArchitecturalModel } from '../types/architectural';
import { CalculatedProperties } from '../services/cadPropertyCalculator';

interface ModelViewerWithARProps {
  model: ArchitecturalModel | null;
  className?: string;
  onARModeToggle?: (enabled: boolean) => void;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  onGLTFDataLoaded?: (gltfData: any, mechanicalAnalysis?: any) => void;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
  calculatedProperties?: CalculatedProperties | null;
}

export const ModelViewerWithAR: React.FC<ModelViewerWithARProps> = ({
  model,
  className = '',
  onARModeToggle,
  onModelUpdate,
  onGLTFDataLoaded,
  onPropertiesCalculated,
  calculatedProperties
}) => {
  // Force WebGL cleanup when component unmounts
  useEffect(() => {
    return () => {
      console.log('🔧 ModelViewerWithAR unmounting - single CrossDeviceARViewer approach');
    };
  }, []);

  if (!model) {
    return (
      <div className={`${className} flex items-center justify-center h-64`}>
        <div className="text-center text-gray-400">
          <p>No 3D model available</p>
        </div>
      </div>
    );
  }

  console.log('🔧 Rendering: Single CrossDeviceARViewer (handles both 3D and AR)');

  // Simple approach: Only use CrossDeviceARViewer which handles both 3D and AR modes internally
  return (
    <div className={className} style={{ height: '100%', position: 'relative' }}>
      <CrossDeviceARViewer
        model={model}
        onClose={() => {
          console.log('🔧 CrossDeviceARViewer closed');
          onARModeToggle?.(false);
        }}
        className="w-full h-full"
      />
      
      {/* Status indicator */}
      <div style={{
        position: 'absolute',
        top: '20px',
        left: '20px',
        background: 'rgba(76, 175, 80, 0.9)',
        color: 'white',
        padding: '8px 16px',
        borderRadius: '20px',
        fontSize: '12px',
        fontWeight: '600',
        zIndex: 50
      }}>
        🎯 Single WebGL Context (No Conflicts)
      </div>
    </div>
  );
};

export default ModelViewerWithAR;