import React, { useState, useCallback, useEffect } from 'react';
import { KCLEditor, prefetchMonacoEditor } from './KCLEditor';
import { EnhancedModelViewer3D } from './EnhancedModelViewer3D';
import { CADAIService } from '../services/cadAI';
import { kclService } from '../services/kclService';
import type { ArchitecturalModel } from '../types/architectural';
import { Grip, X } from 'lucide-react';

interface IntegratedCADEditorProps {
  initialModel?: ArchitecturalModel | null;
  onModelUpdate?: (model: ArchitecturalModel) => void;
}

export const IntegratedCADEditor: React.FC<IntegratedCADEditorProps> = ({
  initialModel = null,
  onModelUpdate
}) => {
  const [model, setModel] = useState<ArchitecturalModel | null>(initialModel);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [splitPosition, setSplitPosition] = useState(50); // Percentage
  const [isDragging, setIsDragging] = useState(false);
  const [showEditor, setShowEditor] = useState(true);

  const cadService = new CADAIService();

  // Generate KCL code from prompt using Zoo API
  const handleGenerateKCL = useCallback(async (prompt: string): Promise<string> => {
    try {
      // Use our KCL service to generate code from prompt
      const kclCode = await kclService.generateKCLFromPrompt(prompt);
      return kclCode;
    } catch (error) {
      console.error('Failed to generate KCL:', error);
      // Fallback to template generation
      const enhancedPrompt = await cadService.enhancePromptForCAD(prompt);
      
      // Generate template KCL code based on prompt keywords
      let kclCode = `// Generated KCL code for: ${prompt}\n\n`;
      
      if (prompt.toLowerCase().includes('box') || prompt.toLowerCase().includes('case')) {
        kclCode += `// Box with lid
const width = 100
const length = 80
const height = 50
const thickness = 3
const lidHeight = 10

// Base box
const box = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([width, 0], %)
  |> line([0, length], %)
  |> line([-width, 0], %)
  |> close(%)
  |> extrude(height, %)
  |> shell({ faces: ['top'], thickness })

// Lid
const lid = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([width + thickness * 2, 0], %)
  |> line([0, length + thickness * 2], %)
  |> line([-(width + thickness * 2), 0], %)
  |> close(%)
  |> extrude(lidHeight, %)
  |> shell({ faces: ['bottom'], thickness })
`;
      } else if (prompt.toLowerCase().includes('gear')) {
        kclCode += `// Gear
const numTeeth = 20
const pitchRadius = 50
const toothHeight = 5
const thickness = 10

const gear = startSketchOn('XY')
  |> circle({ center: [0, 0], radius: pitchRadius }, %)
  |> extrude(thickness, %)

// Add teeth using pattern
const tooth = startSketchOn('XY')
  |> startProfileAt([pitchRadius, -2], %)
  |> line([toothHeight, 0], %)
  |> line([0, 4], %)
  |> line([-toothHeight, 0], %)
  |> close(%)
  |> extrude(thickness, %)

const gearWithTeeth = pattern({
  instance: tooth,
  n: numTeeth,
  axis: [0, 0, 1],
  angle: 360
})
`;
      } else if (prompt.toLowerCase().includes('bracket')) {
        kclCode += `// L-shaped bracket
const length1 = 100
const length2 = 80
const width = 50
const thickness = 5
const holeRadius = 5

// L-shape profile
const bracket = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([length1, 0], %)
  |> line([0, thickness], %)
  |> line([-(length1 - thickness), 0], %)
  |> line([0, length2 - thickness], %)
  |> line([-thickness, 0], %)
  |> line([0, -length2], %)
  |> close(%)
  |> extrude(width, %)

// Add mounting holes
const hole1 = startSketchOn(bracket, 'top')
  |> circle({ center: [20, width/2], radius: holeRadius }, %)
  |> extrude(-thickness, %)

const hole2 = startSketchOn(bracket, 'front')
  |> circle({ center: [width/2, 20], radius: holeRadius }, %)
  |> extrude(-thickness, %)
`;
      } else {
        // Default template
        kclCode += `// Basic shape
const width = 100
const length = 100
const height = 20

const shape = startSketchOn('XY')
  |> startProfileAt([0, 0], %)
  |> line([width, 0], %)
  |> line([0, length], %)
  |> line([-width, 0], %)
  |> close(%)
  |> extrude(height, %)
`;
      }
      
      return kclCode;
    } catch (error) {
      console.error('Failed to generate KCL code:', error);
      throw error;
    }
  }, [cadService]);

  // Execute KCL code and generate 3D model
  const handleExecuteKCL = useCallback(async (kclCode: string) => {
    setIsLoading(true);
    setError(null);
    
    try {
      // For now, we'll use the text-to-CAD API with a descriptive prompt
      // In the future, this would use Zoo's KCL execution API
      
      // Extract a description from the KCL code comments
      const commentMatch = kclCode.match(/\/\/\s*(.+)/);
      const description = commentMatch ? commentMatch[1] : 'custom KCL model';
      
      // Generate CAD model using the description
      const result = await cadService.generateTextToCAD(description);
      
      const newModel: ArchitecturalModel = {
        id: `kcl-${Date.now()}`,
        name: 'KCL Generated Model',
        style: 'modern',
        rooms: [],
        cadModel: result
      };
      
      setModel(newModel);
      onModelUpdate?.(newModel);
      
    } catch (error) {
      console.error('Failed to execute KCL code:', error);
      setError(error instanceof Error ? error.message : 'Failed to generate model');
    } finally {
      setIsLoading(false);
    }
  }, [cadService, onModelUpdate]);

  // Handle split panel dragging
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;
    
    const container = document.getElementById('cad-editor-container');
    if (!container) return;
    
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = (x / rect.width) * 100;
    
    setSplitPosition(Math.max(20, Math.min(80, percentage)));
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  useEffect(() => {
    if (showEditor) {
      prefetchMonacoEditor();
    }
  }, [showEditor]);

  return (
    <div id="cad-editor-container" className="flex h-full bg-gray-100">
      {/* KCL Editor Panel */}
      {showEditor && (
        <div 
          className="relative bg-slate-900"
          style={{ width: `${splitPosition}%` }}
        >
          <KCLEditor
            onExecute={handleExecuteKCL}
            onGenerateFromPrompt={handleGenerateKCL}
            isLoading={isLoading}
            error={error}
          />
          
          {/* Close button */}
          <button
            onClick={() => setShowEditor(false)}
            className="absolute top-3 right-3 p-1 text-gray-400 hover:text-white hover:bg-slate-700 rounded transition-colors z-10"
            title="Close editor"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Draggable Divider */}
      {showEditor && (
        <div
          className="w-1 bg-gray-300 hover:bg-indigo-500 cursor-col-resize transition-colors relative"
          onMouseDown={() => setIsDragging(true)}
        >
          <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
            <Grip className="w-4 h-4 text-gray-500" />
          </div>
        </div>
      )}

      {/* 3D Viewer Panel */}
      <div className={showEditor ? 'flex-1' : 'w-full'}>
        <div className="h-full p-4">
          {!showEditor && (
            <button
              onClick={() => setShowEditor(true)}
              onMouseEnter={prefetchMonacoEditor}
              onFocus={prefetchMonacoEditor}
              className="mb-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              Show KCL Editor
            </button>
          )}
          
          <EnhancedModelViewer3D
            model={model}
            className="h-full"
            onModelUpdate={onModelUpdate}
          />
        </div>
      </div>
    </div>
  );
};
