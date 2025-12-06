import React from 'react';
import { ChevronLeft, ChevronRight, Move3D, BarChart3, Package, DollarSign } from 'lucide-react';
import { EnhancedModelViewer3D } from './EnhancedModelViewer3D';
import type { ArchitecturalModel } from '../types/architectural';
import type { CalculatedProperties } from '../services/cadPropertyCalculator';
import { extractProductName } from '../utils/productNameExtractor';

interface CADViewerStepProps {
  model: ArchitecturalModel | null;
  onModelUpdate?: (model: ArchitecturalModel) => void;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
  calculatedProperties?: CalculatedProperties | null;
  onNext?: () => void;
  onPrevious?: () => void;
  canGoNext?: boolean;
  canGoPrevious?: boolean;
}

const CADViewerStep: React.FC<CADViewerStepProps> = ({
  model,
  onModelUpdate,
  onPropertiesCalculated,
  calculatedProperties,
  onNext,
  onPrevious,
  canGoNext,
  canGoPrevious
}) => {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="cosmic-panel p-6 mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
            <Move3D className="w-5 h-5 text-white" />
          </div>
          <h3 className="text-2xl font-bold text-white">3D Model Viewer</h3>
        </div>
        
        {model && (
          <p className="text-gray-300">
            Analyzing: {extractProductName(model.cadModel?.originalPrompt || model.name || 'CAD Model')}
          </p>
        )}
      </div>

      {/* Model Viewer */}
      <div className="cosmic-panel overflow-hidden mb-6">
        <div className="h-[600px]">
          <EnhancedModelViewer3D 
            model={model} 
            onModelUpdate={onModelUpdate}
            onPropertiesCalculated={onPropertiesCalculated}
            calculatedProperties={calculatedProperties}
            className="w-full h-full"
          />
        </div>
      </div>

      {/* Metrics Panel */}
      {calculatedProperties && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          {/* Geometry Metrics */}
          <div className="cosmic-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <BarChart3 className="w-6 h-6 text-cyan-400" />
              <h4 className="text-lg font-bold text-white">Geometry</h4>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-400">Volume</div>
                <div className="text-white font-semibold">
                  {calculatedProperties.geometry.volume.toFixed(2)} cm³
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Surface Area</div>
                <div className="text-white font-semibold">
                  {calculatedProperties.geometry.surfaceArea.toFixed(2)} cm²
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Bounding Box</div>
                <div className="text-white font-semibold text-xs">
                  {calculatedProperties.geometry.boundingBox.width.toFixed(1)} × 
                  {calculatedProperties.geometry.boundingBox.height.toFixed(1)} × 
                  {calculatedProperties.geometry.boundingBox.depth.toFixed(1)} mm
                </div>
              </div>
            </div>
          </div>

          {/* Materials */}
          <div className="cosmic-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <Package className="w-6 h-6 text-purple-400" />
              <h4 className="text-lg font-bold text-white">Materials</h4>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-400">Primary Material</div>
                <div className="text-white font-semibold">
                  {calculatedProperties.materials.primary}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Density</div>
                <div className="text-white font-semibold">
                  {calculatedProperties.materials.density} g/cm³
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Estimated Mass</div>
                <div className="text-white font-semibold">
                  {(calculatedProperties.geometry.volume * calculatedProperties.materials.density / 1000).toFixed(2)} kg
                </div>
              </div>
            </div>
          </div>

          {/* Manufacturing */}
          <div className="cosmic-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <Move3D className="w-6 h-6 text-green-400" />
              <h4 className="text-lg font-bold text-white">Manufacturing</h4>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-400">Process</div>
                <div className="text-white font-semibold">
                  {calculatedProperties.manufacturing.process}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Complexity</div>
                <div className="text-white font-semibold capitalize">
                  {calculatedProperties.specifications.complexity}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Material Cost</div>
                <div className="text-white font-semibold">
                  ${calculatedProperties.manufacturing.materialCost.toFixed(2)}
                </div>
              </div>
            </div>
          </div>

          {/* Cost Analysis */}
          <div className="cosmic-panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <DollarSign className="w-6 h-6 text-yellow-400" />
              <h4 className="text-lg font-bold text-white">Cost Analysis</h4>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-sm text-gray-400">Total Cost</div>
                <div className="text-white font-semibold text-xl">
                  ${calculatedProperties.manufacturing.totalCost.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Labor Cost</div>
                <div className="text-white font-semibold">
                  ${calculatedProperties.manufacturing.laborCost.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-400">Setup Cost</div>
                <div className="text-white font-semibold">
                  ${calculatedProperties.manufacturing.setupCost.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <button
          onClick={onPrevious}
          disabled={!canGoPrevious}
          className="flex items-center gap-2 px-6 py-3 horizon-card text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
          Previous
        </button>
        
        <button
          onClick={onNext}
          disabled={!canGoNext}
          className="flex items-center gap-2 px-6 py-3 horizon-button-primary text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Continue to AR
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default CADViewerStep;