import React, { useState } from 'react';
import { RotateCcw, Download, Share2, Maximize } from 'lucide-react';

interface CADViewerProps {
  userIdea: string;
  cadModel: any;
  setCadModel: (model: any) => void;
  onNext: () => void;
  onPrevious: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

const CADViewer: React.FC<CADViewerProps> = ({ userIdea, onNext }) => {
  const [isGenerating, setIsGenerating] = useState(true);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });

  React.useEffect(() => {
    // Simulate AI generation process
    const timer = setTimeout(() => {
      setIsGenerating(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  const handleRotate = () => {
    setRotation(prev => ({ x: prev.x + 45, y: prev.y + 45 }));
  };

  if (isGenerating) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="cosmic-panel p-8">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r from-cyan-400 to-purple-400 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h3 className="text-2xl font-bold text-white mb-4">AI is Creating Your Design</h3>
            <p className="text-gray-300 text-lg mb-8">
              Analyzing your idea: "{userIdea.slice(0, 100)}..."
            </p>
            <div className="space-y-3 max-w-md mx-auto">
              {[
                "Processing natural language description...",
                "Generating 3D geometry...",
                "Optimizing design parameters...",
                "Finalizing CAD model..."
              ].map((step, index) => (
                <div key={index} className="flex items-center gap-3 text-gray-400">
                  <div className={`w-2 h-2 rounded-full ${index < 3 ? 'bg-green-400' : 'bg-cyan-400 animate-pulse'}`}></div>
                  <span>{step}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* 3D Viewer */}
        <div className="lg:col-span-2">
          <div className="cosmic-panel p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-white">3D Model Preview</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRotate}
                  className="p-2 rounded-lg horizon-card text-gray-400 hover:text-white transition-colors"
                >
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button className="p-2 rounded-lg horizon-card text-gray-400 hover:text-white transition-colors">
                  <Maximize className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            {/* Mock 3D Viewer */}
            <div className="aspect-video bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-white/10 flex items-center justify-center relative overflow-hidden">
              <div 
                className="w-40 h-40 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-lg shadow-2xl transition-transform duration-500"
                style={{ transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)` }}
              >
                <div className="w-full h-full bg-white/10 rounded-lg"></div>
              </div>
              <div className="absolute top-4 left-4 px-3 py-1 bg-green-500 text-white text-sm rounded-full">
                AI Generated
              </div>
            </div>
          </div>
        </div>

        {/* Details Panel */}
        <div className="space-y-6">
          <div className="cosmic-panel p-6">
            <h3 className="text-lg font-bold text-white mb-4">Design Specifications</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-400">Dimensions:</span>
                <span className="text-white">45 x 38 x 80 cm</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Material:</span>
                <span className="text-white">Aluminum Alloy</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Weight:</span>
                <span className="text-white">2.3 kg</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Estimated Cost:</span>
                <span className="text-white">$85 - $120</span>
              </div>
            </div>
          </div>

          <div className="cosmic-panel p-6">
            <h3 className="text-lg font-bold text-white mb-4">AI Analysis</h3>
            <p className="text-gray-300 text-sm leading-relaxed mb-4">
              Your foldable chair design incorporates excellent portability features with 
              the integrated cup holder adding practical functionality. The design is 
              optimized for outdoor use while maintaining structural integrity.
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-green-400 text-sm">Structurally sound</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-green-400 text-sm">Manufacturable</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-yellow-400 text-sm">Minor optimization suggested</span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <button className="flex items-center justify-center gap-2 px-4 py-2 horizon-card text-white rounded-lg transition-colors">
              <Download className="w-4 h-4" />
              Download CAD File
            </button>
            <button className="flex items-center justify-center gap-2 px-4 py-2 horizon-card text-white rounded-lg transition-colors">
              <Share2 className="w-4 h-4" />
              Share Design
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CADViewer;