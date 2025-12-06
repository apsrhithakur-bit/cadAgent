import React from 'react';
import { EnhancedModelViewer3D } from './EnhancedModelViewer3D';
import type { ArchitecturalModel } from '../types/architectural';

// Demo component showing how to use the enhanced 3D viewer with component identification
export const CADViewerDemo: React.FC = () => {
  // Example CAD model with multi-component prompt
  const demoModel: ArchitecturalModel = {
    id: 'demo-1',
    name: 'Assembly Demo',
    style: 'modern',
    rooms: [],
    cadModel: {
      id: 'cad-demo-1',
      prompt: 'design an assembly with base plate and top cover',
      originalPrompt: 'box with lid',
      gltfUrl: '', // Will be populated by actual API
      formats: {},
      properties: {
        volume: 1000,
        complexity: 'moderate'
      }
    }
  };

  return (
    <div className="p-8 bg-gray-100 min-h-screen">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold mb-8">Enhanced CAD Viewer Demo</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6">
          <h2 className="text-xl font-semibold mb-4">Features:</h2>
          <ul className="list-disc list-inside mb-6 space-y-2">
            <li>Automatic component detection and separation</li>
            <li>Visual labels for each component in 3D space</li>
            <li>Interactive component list panel</li>
            <li>Toggle component visibility</li>
            <li>Rename components by double-clicking</li>
            <li>Select components to highlight them</li>
          </ul>

          <div className="mb-6">
            <h3 className="text-lg font-medium mb-2">Try these prompts for better component separation:</h3>
            <ul className="list-disc list-inside space-y-1 text-gray-700">
              <li>"design an assembly with base plate and mounting bracket"</li>
              <li>"design a housing with removable lid"</li>
              <li>"design a mechanical assembly with shaft and bearing"</li>
              <li>"design a device with main body and side panels"</li>
            </ul>
          </div>

          {/* Enhanced 3D Viewer */}
          <EnhancedModelViewer3D
            model={demoModel}
            className="h-[600px]"
          />
        </div>
      </div>
    </div>
  );
};