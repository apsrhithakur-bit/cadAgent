import React, { useState, useCallback, useMemo } from 'react';
import ModelViewer3D from './ModelViewer3D';
import { ComponentListPanel } from './ComponentListPanel';
import { Layers } from 'lucide-react';
import type { ArchitecturalModel } from '../types/architectural';
import type { CalculatedProperties } from '../services/cadPropertyCalculator';

interface EnhancedModelViewer3DProps {
  model: ArchitecturalModel | null;
  className?: string;
  onARModeToggle?: (enabled: boolean) => void;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
  calculatedProperties?: CalculatedProperties | null;
  onNext?: () => void;
  onPrevious?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
}

interface MechanicalAnalysis {
  components: Array<{
    name: string;
    type: string;
    material: string;
    massProperties: {
      volume: number;
      mass: number;
      centerOfMass: { x: number; y: number; z: number };
    };
  }>;
}

export const EnhancedModelViewer3D: React.FC<EnhancedModelViewer3DProps> = ({
  model,
  className = '',
  onARModeToggle,
  onModelUpdate,
  onPropertiesCalculated,
  calculatedProperties,
  onNext,
  onPrevious,
  canGoNext,
  canGoPrevious
}) => {
  const [showComponentList, setShowComponentList] = useState(true);
  const [selectedComponent, setSelectedComponent] = useState<string | null>(null);
  const [componentVisibility, setComponentVisibility] = useState<Record<string, boolean>>({});
  const [mechanicalAnalysis, setMechanicalAnalysis] = useState<MechanicalAnalysis | null>(null);

  // Convert mechanical analysis components to UI format
  const components = useMemo(() => {
    if (!mechanicalAnalysis?.components) return [];
    
    return mechanicalAnalysis.components.map((comp, index) => ({
      id: `comp-${index}`,
      name: comp.name,
      type: comp.type,
      material: comp.material,
      visible: componentVisibility[`comp-${index}`] !== false,
      volume: comp.massProperties.volume,
      mass: comp.massProperties.mass
    }));
  }, [mechanicalAnalysis, componentVisibility]);

  const handleGLTFDataLoaded = useCallback((gltfData: any, analysis?: MechanicalAnalysis) => {
    console.log('📊 Enhanced viewer received GLTF data with analysis:', {
      hasAnalysis: !!analysis,
      componentCount: analysis?.components?.length || 0
    });
    
    if (analysis) {
      setMechanicalAnalysis(analysis);
      
      // Initialize all components as visible
      const visibility: Record<string, boolean> = {};
      analysis.components.forEach((_, index) => {
        visibility[`comp-${index}`] = true;
      });
      setComponentVisibility(visibility);
    }
  }, []);

  const handleComponentSelect = useCallback((id: string) => {
    setSelectedComponent(prev => prev === id ? null : id);
  }, []);

  const handleComponentVisibilityToggle = useCallback((id: string) => {
    setComponentVisibility(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }, []);

  const handleComponentRename = useCallback((id: string, newName: string) => {
    if (!mechanicalAnalysis) return;
    
    const index = parseInt(id.split('-')[1]);
    const updatedAnalysis = {
      ...mechanicalAnalysis,
      components: mechanicalAnalysis.components.map((comp, i) => 
        i === index ? { ...comp, name: newName } : comp
      )
    };
    
    setMechanicalAnalysis(updatedAnalysis);
  }, [mechanicalAnalysis]);

  return (
    <div className={`relative ${className}`}>
      <div className="flex gap-4">
        {/* 3D Viewer */}
        <div className="flex-1">
          <ModelViewer3D
            model={model}
            onARModeToggle={onARModeToggle}
            onModelUpdate={onModelUpdate}
            onGLTFDataLoaded={handleGLTFDataLoaded}
            onPropertiesCalculated={onPropertiesCalculated}
          />
        </div>

        {/* Component List Panel */}
        {showComponentList && components.length > 0 && (
          <div className="w-80">
            <ComponentListPanel
              components={components}
              selectedComponent={selectedComponent}
              onComponentSelect={handleComponentSelect}
              onComponentVisibilityToggle={handleComponentVisibilityToggle}
              onComponentRename={handleComponentRename}
              isExpanded={true}
            />
          </div>
        )}
      </div>

      {/* Toggle Component List Button */}
      {components.length > 0 && (
        <button
          onClick={() => setShowComponentList(!showComponentList)}
          className="absolute top-4 right-4 bg-white/90 hover:bg-white shadow-lg rounded-lg p-2 transition-all"
          title={showComponentList ? 'Hide component list' : 'Show component list'}
        >
          <Layers className="w-5 h-5 text-gray-700" />
        </button>
      )}
    </div>
  );
};