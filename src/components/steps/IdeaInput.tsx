import React, { useState } from 'react';
import { Lightbulb, Loader2, AlertCircle } from 'lucide-react';
import { ArchitecturalModel } from '../../types/architectural';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useUsage } from '../../hooks/useUsage';
import { CADAIService } from '../../services/cadAI';
import UpgradePrompt from '../UpgradePrompt';

interface IdeaInputProps {
  onComplete: (model: ArchitecturalModel) => void;
}

const IdeaInput: React.FC<IdeaInputProps> = ({ onComplete }) => {
  const { user } = useAuth();
  const { usage, canUseDesign, incrementDesignUsage, getUsageLimits } = useUsage();
  const [userIdea, setUserIdea] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [generationSteps, setGenerationSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const cadAI = new CADAIService();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userIdea.trim() || !user) return;
    
    setError(null);

    try {
      // Increment design usage
      const canProceed = await incrementDesignUsage();
      
      if (!canProceed) {
        setShowUpgradePrompt(true);
        return;
      }

      // Save design session to database
      const { data, error } = await supabase
        .from('design_sessions')
        .insert({
          user_id: user.id,
          design_data: {
            idea: userIdea,
            step: 'idea_input',
            timestamp: new Date().toISOString()
          }
        })
        .select()
        .single();

      if (error) throw error;

      // Store session ID for later use
      sessionStorage.setItem('currentDesignSessionId', data.id);
      
      // Generate CAD model from the user's idea
      const request = {
        prompt: userIdea.trim(),
        outputFormat: 'gltf' as const,
        units: 'mm' as const,
        scale: 1
      };

      const cadModel = await cadAI.generateAndWaitForCAD(request, false);
      
      // Transform CAD model to ArchitecturalModel format for compatibility
      const architecturalModel: ArchitecturalModel = {
        id: cadModel.id,
        name: cadModel.originalPrompt || cadModel.prompt,
        description: cadModel.prompt,
        type: 'cad' as const,
        rooms: [],
        doors: [],
        windows: [],
        totalArea: cadModel.properties.volume,
        style: 'modern',
        created: new Date(),
        modified: new Date(),
        cadModel,
        // Add productSpecs for proper display
        productSpecs: {
          name: cadModel.originalPrompt || cadModel.prompt,
          title: cadModel.originalPrompt || cadModel.prompt,
          description: cadModel.prompt,
          components: [
            {
              name: `${cadModel.originalPrompt || cadModel.prompt} - Main Component`,
              material: "Engineering Plastic",
              dimensions: {
                width: cadModel.properties.dimensions.width,
                length: cadModel.properties.dimensions.depth,
                height: cadModel.properties.dimensions.height
              },
              function: `Primary structural element of ${cadModel.originalPrompt || cadModel.prompt}`
            }
          ],
          manufacturing: {
            method: "3D Printing / CNC Machining",
            materials: ["ABS Plastic", "PLA", "Aluminum"],
            complexity: cadModel.properties.complexity,
            estimated_cost: "15-45 USD"
          },
          specifications: {
            weight: `${Math.round(cadModel.properties.volume / 1000 * 1.2 * 100) / 100} g`,
            durability: "High"
          },
          totalVolume: Math.round(cadModel.properties.volume),
          style: "modern"
        }
      };

      onComplete(architecturalModel);
    } catch (error) {
      console.error('Error generating CAD model:', error);
      setError(error instanceof Error ? error.message : 'An error occurred while generating your design');
      // Create a fallback model to prevent blocking the user
      const fallbackModel: ArchitecturalModel = {
        id: `fallback_${Date.now()}`,
        name: userIdea,
        description: userIdea,
        type: 'cad' as const,
        rooms: [],
        doors: [],
        windows: [],
        totalArea: 1000,
        style: 'modern',
        created: new Date(),
        modified: new Date(),
        productSpecs: {
          name: userIdea,
          title: userIdea,
          description: userIdea,
          components: [],
          manufacturing: {
            method: "3D Printing",
            materials: ["PLA"],
            complexity: "Medium",
            estimated_cost: "20-40 USD"
          },
          specifications: {
            weight: "100 g",
            durability: "Medium"
          },
          totalVolume: 1000,
          style: "modern"
        }
      };
      onComplete(fallbackModel);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    setUserIdea(suggestion);
  };

  const handleUpgradeClose = () => {
    setShowUpgradePrompt(false);
  };

  const handleUpgradeClick = () => {
    setShowUpgradePrompt(false);
    window.dispatchEvent(new CustomEvent('openSubscriptionModal'));
  };

  if (showUpgradePrompt) {
    const limits = getUsageLimits(user?.profile?.subscription_tier || 'free');
    return (
      <UpgradePrompt
        type="designs"
        onClose={handleUpgradeClose}
        onUpgrade={handleUpgradeClick}
        usageData={{
          used: usage?.designs_used || 0,
          limit: limits.designs
        }}
        isModal={false}
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="cosmic-panel p-8">
        <div className="flex items-center gap-3 mb-6">
          <Lightbulb className="w-8 h-8 text-yellow-400" />
          <h3 className="text-2xl font-bold text-white">What's Your Idea?</h3>
        </div>
        
        <p className="text-gray-300 mb-8 text-lg leading-relaxed">
          Describe your hardware product idea in simple terms. Don't worry about technical details - 
          our AI will handle the complexity. The more specific you are, the better we can help bring your vision to life.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="relative">
            <textarea
              value={userIdea}
              onChange={(e) => setUserIdea(e.target.value)}
              placeholder="Example: I want to create a foldable chair that's lightweight and has a cup holder. It should be easy to carry and set up quickly for outdoor activities..."
              className="w-full h-40 horizon-input resize-none"
              maxLength={1000}
              disabled={isGenerating}
            />
            <div className="absolute bottom-4 right-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsGenerating(!isGenerating)}
                disabled={isGenerating}
                className={`p-2 rounded-lg transition-all duration-300 ${
                  isGenerating ? 'bg-red-500 text-white' : 'bg-white/10 text-gray-400 hover:text-white'
                } disabled:opacity-50`}
              >
                <AlertCircle className="w-5 h-5" />
              </button>
            </div>
          </div>
          
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-400">
              {userIdea.length}/1000 characters
            </span>
            <button
              type="submit"
              disabled={!userIdea.trim() || isGenerating}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                userIdea.trim() && !isGenerating
                  ? 'horizon-button-primary'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating CAD Model...
                </>
              ) : (
                <>
                  <Lightbulb className="w-5 h-5" />
                  Generate CAD Model
                </>
              )}
            </button>
          </div>
        </form>

        {/* Suggestions */}
        <div className="mt-12">
          <h4 className="text-lg font-semibold text-white mb-4">Need Inspiration? Try These Ideas:</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {["A foldable chair with a built-in cup holder", "A smart water bottle that tracks hydration", "A phone stand with wireless charging base", "A modular desk organizer system", "A portable laptop cooling pad with fans"].map((suggestion, index) => (
              <button
                key={index}
                onClick={() => handleSuggestionClick(suggestion)}
                disabled={isGenerating}
                className="p-4 text-left rounded-lg horizon-card hover:border-cyan-400/30 transition-all duration-300 text-gray-300 hover:text-white disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdeaInput;