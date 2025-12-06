import React, { useState } from 'react';
import { Code2, Eye, Wrench, Download, Layers } from 'lucide-react';
import { IntegratedCADEditor } from '../IntegratedCADEditor';
import { EnhancedModelViewer3D } from '../EnhancedModelViewer3D';
import { CADExportPanel } from '../CADExportPanel';
import OptimizationPanel from '../OptimizationPanel';
import { OptimizationResult } from '../../services/optimizationService';
import type { ArchitecturalModel } from '../../types/architectural';

interface EnhancedDesignIterationProps {
  model: ArchitecturalModel | null;
  onModelUpdate: (model: ArchitecturalModel) => void;
}

export const EnhancedDesignIteration: React.FC<EnhancedDesignIterationProps> = ({
  model,
  onModelUpdate
}) => {
  const [viewMode, setViewMode] = useState<'viewer' | 'code' | 'optimize'>('viewer');
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);

  const handleOptimizationComplete = (result: OptimizationResult) => {
    setOptimizationResult(result);
    // Optionally switch to viewer mode to show the optimized model
    if (result.optimizedModel) {
      onModelUpdate(result.optimizedModel);
      setViewMode('viewer');
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-white mb-4">Export & Optimize</h2>
        <p className="text-gray-300 text-lg max-w-3xl mx-auto">
          Export your design to various CAD formats, edit with KCL code, or optimize for manufacturing.
        </p>
      </div>

      {/* View Mode Selector */}
      <div className="flex justify-center mb-8">
        <div className="flex bg-white/10 backdrop-blur-sm rounded-xl p-1">
          <button
            onClick={() => setViewMode('viewer')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
              viewMode === 'viewer'
                ? 'bg-cyan-500 text-white shadow-lg'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Eye className="w-5 h-5" />
            3D Viewer
          </button>
          
          <button
            onClick={() => setViewMode('code')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
              viewMode === 'code'
                ? 'bg-cyan-500 text-white shadow-lg'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Code2 className="w-5 h-5" />
            KCL Editor
          </button>
          
          <button
            onClick={() => setViewMode('optimize')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg transition-all ${
              viewMode === 'optimize'
                ? 'bg-cyan-500 text-white shadow-lg'
                : 'text-gray-300 hover:text-white hover:bg-white/10'
            }`}
          >
            <Wrench className="w-5 h-5" />
            Optimize
          </button>
        </div>
      </div>

      {/* Content based on view mode */}
      {viewMode === 'viewer' && (
        <div className="space-y-6">
          {/* Enhanced 3D Viewer with Component List */}
          <EnhancedModelViewer3D
            model={model}
            onModelUpdate={onModelUpdate}
            className="max-w-7xl mx-auto h-[600px]"
          />
          
          {/* Export Panel */}
          {model && (
            <div className="max-w-4xl mx-auto">
              <CADExportPanel model={model} />
            </div>
          )}
        </div>
      )}

      {viewMode === 'code' && (
        <div className="max-w-7xl mx-auto h-[700px]">
          <IntegratedCADEditor
            initialModel={model}
            onModelUpdate={onModelUpdate}
          />
        </div>
      )}

      {viewMode === 'optimize' && model && (
        <div className="max-w-6xl mx-auto">
          <OptimizationPanel
            model={model}
            onOptimizationComplete={handleOptimizationComplete}
            onModelUpdate={onModelUpdate}
          />
        </div>
      )}
    </div>
  );
};