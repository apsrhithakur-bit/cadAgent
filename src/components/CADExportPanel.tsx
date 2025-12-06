import React, { useState, useCallback } from 'react';
import { 
  Download, 
  Settings, 
  FileText, 
  Package, 
  Printer,
  Factory,
  Loader2,
  CheckCircle,
  AlertCircle,
  DollarSign,
  Ruler
} from 'lucide-react';
import { cadAI } from '../services/cadAI';
import type { CADModelData, CADExportOptions } from '../types/architectural';

interface CADExportPanelProps {
  cadModel: CADModelData;
  className?: string;
}

const CADExportPanel: React.FC<CADExportPanelProps> = ({ 
  cadModel, 
  className = '' 
}) => {
  const [exportOptions, setExportOptions] = useState<CADExportOptions>({
    format: 'gltf',
    units: 'mm',
    quality: 'high',
    scale: 1
  });
  const [isExporting, setIsExporting] = useState(false);
  const [exportHistory, setExportHistory] = useState<Array<{
    format: string;
    timestamp: Date;
    filename: string;
    downloadUrl: string;
  }>>([]);
  const [showCostEstimate, setShowCostEstimate] = useState(false);
  const [costEstimate, setCostEstimate] = useState<any>(null);

  // Format configurations
  const formatInfo = {
    gltf: {
      name: 'GLTF',
      description: '3D viewer compatible',
      icon: <FileText className="w-5 h-5" />,
      color: 'bg-blue-500',
      useCases: ['Web viewing', 'AR/VR', 'Game engines']
    },
    stl: {
      name: 'STL',
      description: '3D printing ready',
      icon: <Printer className="w-5 h-5" />,
      color: 'bg-green-500',
      useCases: ['3D printing', 'Rapid prototyping']
    },
    obj: {
      name: 'OBJ',
      description: 'Universal 3D format',
      icon: <Package className="w-5 h-5" />,
      color: 'bg-purple-500',
      useCases: ['CAD software', 'Modeling apps']
    },
    ply: {
      name: 'PLY',
      description: 'Research & analysis',
      icon: <Settings className="w-5 h-5" />,
      color: 'bg-orange-500',
      useCases: ['Research', 'Point clouds', 'Analysis']
    },
    step: {
      name: 'STEP',
      description: 'Professional CAD',
      icon: <Factory className="w-5 h-5" />,
      color: 'bg-red-500',
      useCases: ['CAD software', 'Engineering', 'Manufacturing']
    },
    fbx: {
      name: 'FBX',
      description: 'Animation & games',
      icon: <Package className="w-5 h-5" />,
      color: 'bg-yellow-500',
      useCases: ['Animation', 'Game development', 'Media']
    }
  };

  // Handle export
  const handleExport = useCallback(async () => {
    if (isExporting) return;

    setIsExporting(true);
    try {
      const exportResult = await cadAI.exportCADModel(cadModel, exportOptions);
      
      // Add to export history
      const newExport = {
        format: exportOptions.format,
        timestamp: new Date(),
        filename: exportResult.filename,
        downloadUrl: exportResult.downloadUrl
      };
      setExportHistory(prev => [newExport, ...prev.slice(0, 4)]); // Keep last 5 exports

      // Trigger download
      const link = document.createElement('a');
      link.href = exportResult.downloadUrl;
      link.download = exportResult.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

    } catch (error) {
      console.error('Export failed:', error);
      // You might want to show an error toast here
    } finally {
      setIsExporting(false);
    }
  }, [cadModel, exportOptions, isExporting]);

  // Estimate manufacturing cost
  const estimateCost = useCallback(async (material: string = 'PLA') => {
    setShowCostEstimate(true);
    try {
      const estimate = await cadAI.estimateManufacturingCost(cadModel, material);
      setCostEstimate(estimate);
    } catch (error) {
      console.error('Cost estimation failed:', error);
    }
  }, [cadModel]);

  return (
    <div className={`bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-6 ${className}`}>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-white">Export CAD Model</h3>
            <p className="text-gray-300 text-sm">Download in professional CAD formats</p>
          </div>
          <div className="text-right text-sm text-gray-400">
            <div>Volume: {cadModel.properties.volume.toLocaleString()} mm³</div>
            <div>Complexity: {cadModel.properties.complexity}</div>
          </div>
        </div>

        {/* Format Selection */}
        <div className="space-y-4">
          <h4 className="text-white font-medium">Select Format</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {Object.entries(formatInfo).map(([format, info]) => (
              <button
                key={format}
                onClick={() => setExportOptions(prev => ({ ...prev, format: format as any }))}
                className={`p-4 rounded-xl border-2 transition-all text-left ${
                  exportOptions.format === format
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-white/10 bg-white/5 hover:border-white/20'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`p-2 rounded-lg ${info.color} text-white`}>
                    {info.icon}
                  </div>
                  <div>
                    <div className="text-white font-medium">{info.name}</div>
                    <div className="text-gray-400 text-xs">{info.description}</div>
                  </div>
                </div>
                <div className="text-xs text-gray-400">
                  {info.useCases.join(', ')}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Export Options */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Units */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Units</label>
            <select
              value={exportOptions.units}
              onChange={(e) => setExportOptions(prev => ({ 
                ...prev, 
                units: e.target.value as any 
              }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="mm">Millimeters</option>
              <option value="cm">Centimeters</option>
              <option value="m">Meters</option>
              <option value="in">Inches</option>
              <option value="ft">Feet</option>
            </select>
          </div>

          {/* Quality */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Quality</label>
            <select
              value={exportOptions.quality}
              onChange={(e) => setExportOptions(prev => ({ 
                ...prev, 
                quality: e.target.value as any 
              }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            >
              <option value="low">Low (fast)</option>
              <option value="medium">Medium</option>
              <option value="high">High (best)</option>
            </select>
          </div>

          {/* Scale */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">Scale Factor</label>
            <input
              type="number"
              min="0.1"
              max="10"
              step="0.1"
              value={exportOptions.scale || 1}
              onChange={(e) => setExportOptions(prev => ({ 
                ...prev, 
                scale: parseFloat(e.target.value) || 1 
              }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50"
            />
          </div>
        </div>

        {/* Scale Options - NEW FIX */}
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <h4 className="text-amber-400 font-medium mb-3 flex items-center gap-2">
            <Ruler className="w-4 h-4" />
            Export Scale Options
          </h4>
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="scaleMode"
                value="original"
                checked={exportOptions.useViewerScale !== true}
                onChange={() => setExportOptions(prev => ({ ...prev, useViewerScale: false }))}
                className="text-cyan-500 focus:ring-cyan-500/50"
              />
              <div>
                <div className="text-white text-sm font-medium">Original Dimensions</div>
                <div className="text-gray-400 text-xs">Export actual model size (recommended for manufacturing)</div>
              </div>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="radio"
                name="scaleMode"
                value="viewer"
                checked={exportOptions.useViewerScale === true}
                onChange={() => setExportOptions(prev => ({ ...prev, useViewerScale: true }))}
                className="text-cyan-500 focus:ring-cyan-500/50"
              />
              <div>
                <div className="text-white text-sm font-medium">Viewer Scale</div>
                <div className="text-gray-400 text-xs">Export what you see on screen (may be scaled for viewing)</div>
              </div>
            </label>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleExport}
            disabled={isExporting}
            className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isExporting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-5 h-5" />
                Export {formatInfo[exportOptions.format].name}
              </>
            )}
          </button>

          <button
            onClick={() => estimateCost('PLA')}
            className="px-4 py-3 bg-green-500/20 text-green-300 rounded-lg hover:bg-green-500/30 transition-colors"
          >
            <DollarSign className="w-5 h-5" />
          </button>
        </div>

        {/* Manufacturing Cost Estimate */}
        {showCostEstimate && costEstimate && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
            <h4 className="text-green-400 font-medium mb-3">Manufacturing Cost Estimate</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Material</div>
                <div className="text-white font-medium">{costEstimate.material}</div>
              </div>
              <div>
                <div className="text-gray-400">Volume</div>
                <div className="text-white font-medium">{costEstimate.volume.toFixed(1)} cm³</div>
              </div>
              <div>
                <div className="text-gray-400">Est. Cost</div>
                <div className="text-white font-medium">${costEstimate.cost}</div>
              </div>
              <div>
                <div className="text-gray-400">Currency</div>
                <div className="text-white font-medium">{costEstimate.currency}</div>
              </div>
            </div>
            <p className="text-gray-400 text-xs mt-2">
              *Estimate based on material costs and complexity. Actual costs may vary.
            </p>
          </div>
        )}

        {/* Export History */}
        {exportHistory.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-white font-medium">Recent Exports</h4>
            <div className="space-y-2">
              {exportHistory.map((export_, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg ${formatInfo[export_.format as keyof typeof formatInfo].color} text-white`}>
                      {formatInfo[export_.format as keyof typeof formatInfo].icon}
                    </div>
                    <div>
                      <div className="text-white text-sm font-medium">{export_.filename}</div>
                      <div className="text-gray-400 text-xs">
                        {export_.timestamp.toLocaleString()}
                      </div>
                    </div>
                  </div>
                  <a
                    href={export_.downloadUrl}
                    download={export_.filename}
                    className="text-cyan-400 hover:text-cyan-300 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Model Info */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-4">
          <h4 className="text-white font-medium mb-3">Model Information</h4>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-400">Dimensions</div>
              <div className="text-white">
                {cadModel.properties.dimensions.width} × {cadModel.properties.dimensions.height} × {cadModel.properties.dimensions.depth} mm
              </div>
            </div>
            <div>
              <div className="text-gray-400">Surface Area</div>
              <div className="text-white">{cadModel.properties.surfaceArea.toLocaleString()} mm²</div>
            </div>
            <div>
              <div className="text-gray-400">Available Formats</div>
              <div className="text-white">{Object.keys(cadModel.formats).length} formats</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CADExportPanel; 