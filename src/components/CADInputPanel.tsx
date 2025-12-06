import React, { useState, useCallback } from 'react';
import { 
  Send, 
  Wand2, 
  Lightbulb, 
  AlertCircle, 
  CheckCircle,
  Loader2,
  RefreshCw,
  Settings,
  ExternalLink,
  BookOpen,
  Download,
  ToggleLeft,
  ToggleRight,
  Zap,
  ZapOff
} from 'lucide-react';
import { cadAI } from '../services/cadAI';
import { useUsage } from '../hooks/useUsage';
import { useAuth } from '../hooks/useAuth';
import type { CADGenerationRequest, CADExportOptions, ArchitecturalModel } from '../types/architectural';
import { extractProductName, getModelProductName } from '../utils/productNameExtractor';

interface CADInputPanelProps {
  onCADGenerated: (model: any) => void;
  isGenerating: boolean;
  className?: string;
}

const CADInputPanel: React.FC<CADInputPanelProps> = ({
  onCADGenerated,
  isGenerating,
  className = ''
}) => {
  const [prompt, setPrompt] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [advancedOptions, setAdvancedOptions] = useState<{
    outputFormat?: 'gltf' | 'stl' | 'obj' | 'ply' | 'step' | 'fbx';
    units?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
    scale?: number;
  }>({
    outputFormat: 'gltf',
    units: 'mm',
    scale: 1
  });
  const [validation, setValidation] = useState<{ valid: boolean; suggestions?: string[] }>({ valid: true });
  const [showExamples, setShowExamples] = useState(false);
  const [showTips, setShowTips] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [enhancementInfo, setEnhancementInfo] = useState<{
    original: string;
    enhanced: string;
    source: string;
    confidence: number;
  } | null>(null);
  const [lastGeneratedModel, setLastGeneratedModel] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<any | null>(null);
  const [generationSteps, setGenerationSteps] = useState<string[]>([]);
  
  // Add state for prompt enhancement toggle
  const [skipEnhancement, setSkipEnhancement] = useState(false);

  // Add states for loading screen and progress
  const [isLocallyGenerating, setIsLocallyGenerating] = useState(false);
  const [processingSteps, setProcessingSteps] = useState<string[]>([]);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);

  // Add usage tracking hooks
  const { canUseDesign, incrementDesignUsage } = useUsage();
  const { user } = useAuth();

  // Enhanced prompt validation based on AgenticadML's best practices
  const validatePromptEnhanced = useCallback((value: string) => {
    const minLength = 15; // Increased minimum for more detailed prompts
    const maxLength = 500;
    
    if (value.length < minLength) {
      return {
        valid: false,
        suggestions: [
          'Add specific dimensions (e.g., "200mm wide, 50mm thick")',
          'Include technical features (holes, chamfers, fillets, cuts)',
          'Specify the intended function or use case'
        ]
      };
    }
    
    if (value.length > maxLength) {
      return {
        valid: false,
        suggestions: [
          'Keep the description more concise',
          'Focus on the essential geometric features',
          'Remove unnecessary narrative details'
        ]
      };
    }

    // Check for specific technical terms (based on AgenticadML's algorithms)
    const technicalTerms = ['mm', 'cm', 'holes', 'diameter', 'thick', 'wide', 'long', 'chamfer', 'fillet', 'cut', 'bolt', 'screw', 'gear', 'teeth'];
    const hasTechnicalTerms = technicalTerms.some(term => 
      value.toLowerCase().includes(term)
    );

    // Check for vague nouns that our AI engine handles differently
    const vagueNouns = ['cover', 'case', 'box', 'thing', 'object', 'item', 'device'];
    const hasVagueTerms = vagueNouns.some(noun => 
      value.toLowerCase().includes(noun) && !value.includes('with') && !value.includes('holes')
    );

    if (hasVagueTerms && !hasTechnicalTerms) {
      return {
        valid: true, // Allow but warn
        suggestions: [
          'Add specific dimensions (e.g., "100mm × 50mm × 10mm")',
          'Include features like "with 4 holes" or "rounded corners"',
          'Specify material or manufacturing constraints'
        ]
      };
    }

    if (!hasTechnicalTerms) {
      return {
        valid: true,
        suggestions: [
          'Consider adding dimensions for better results',
          'Mention specific features (holes, cuts, chamfers)',
          'Include functional requirements'
        ]
      };
    }

    return { valid: true };
  }, []);

  // Validate prompt in real-time
  const handlePromptChange = useCallback((value: string) => {
    setPrompt(value);
    const validationResult = validatePromptEnhanced(value);
    setValidation(validationResult);
    setLastError(null); // Clear previous errors when user types
  }, [validatePromptEnhanced]);

  // Handle CAD generation with better error handling, usage tracking, and loading screen
  const handleGenerate = useCallback(async () => {
    if (!prompt.trim() || !validation.valid || isGenerating || isLocallyGenerating) return;

    // Check if user can create more designs
    if (!canUseDesign()) {
      setShowUpgradePrompt(true);
      return;
    }

    setLastError(null);
    setEnhancementInfo(null);
    setIsLocallyGenerating(true);
    setProcessingSteps([]);
    setCurrentStep('Starting generation...');
    
    try {
      // Increment design usage before generation
      const canProceed = await incrementDesignUsage();
      
      if (!canProceed) {
        setShowUpgradePrompt(true);
        return;
      }

      const request: CADGenerationRequest = {
        prompt: prompt.trim(),
        ...advancedOptions
      };

      // Pass the skipEnhancement flag and progress callback to the CAD generation function
      const cadModel = await cadAI.generateAndWaitForCAD(
        request, 
        skipEnhancement,
        (step: string, details?: any) => {
          setCurrentStep(step);
          setProcessingSteps(prev => {
            const newSteps = [...prev];
            if (!newSteps.includes(step)) {
              newSteps.push(step);
            }
            return newSteps;
          });
        }
      );
      
      // Show enhancement info if prompt was enhanced
      if (cadModel.enhancementInfo?.wasEnhanced) {
        setEnhancementInfo({
          original: cadModel.originalPrompt || prompt.trim(),
          enhanced: cadModel.prompt,
          source: cadModel.enhancementInfo.source,
          confidence: cadModel.enhancementInfo.confidence
        });
      }
      
      // Transform CAD model to ArchitecturalModel format for compatibility
      const architecturalModel = {
        id: cadModel.id,
        name: extractProductName(cadModel.originalPrompt || cadModel.prompt), // Use extracted product name
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
          name: extractProductName(cadModel.originalPrompt || cadModel.prompt), // Use extracted name
          title: extractProductName(cadModel.originalPrompt || cadModel.prompt), // Use extracted title
          description: cadModel.prompt,
          components: [
            {
              name: `${extractProductName(cadModel.originalPrompt || cadModel.prompt)} - Primary Component`,
              material: "Engineering Plastic",
              dimensions: {
                width: cadModel.properties.dimensions.width,
                length: cadModel.properties.dimensions.depth,
                height: cadModel.properties.dimensions.height
              },
              function: `Main structural element for ${extractProductName(cadModel.originalPrompt || cadModel.prompt)}`
            }
          ],
          manufacturing: {
            method: "3D Printing / CNC Machining",
            materials: ["ABS Plastic", "PLA", "Aluminum"],
            complexity: cadModel.properties.complexity,
            estimated_cost: "15-45 USD"
          },
          specifications: {
            weight: `${Math.round(cadModel.properties.volume / 1000 * 1.2 * 100) / 100} g`, // Estimate based on volume
            durability: "High"
          },
          totalVolume: Math.round(cadModel.properties.volume),
          style: "modern"
        }
      };

      setCurrentStep('Generation complete!');
      onCADGenerated(architecturalModel);
      setPrompt('');
      setLastGeneratedModel(architecturalModel);
    } catch (error) {
      console.error('CAD generation failed:', error);
      
      // Enhanced error handling for AgenticadML API specific errors
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('422') || errorMessage.includes('Unprocessable Entity')) {
        setLastError('agenticad_422');
      } else if (errorMessage.includes('timeout')) {
        setLastError('timeout');
      } else if (errorMessage.includes('rate limit')) {
        setLastError('rate_limit');
      } else if (errorMessage.includes('402') || errorMessage.includes('quota exceeded') || errorMessage.includes('payment method') || errorMessage.includes('free API credits')) {
        setLastError('payment_required');
      } else {
        setLastError('general');
      }
      setCurrentStep('Generation failed');
    } finally {
      setIsLocallyGenerating(false);
      // Clear processing steps after a delay
      setTimeout(() => {
        setProcessingSteps([]);
        setCurrentStep('');
      }, 3000);
    }
  }, [prompt, validation.valid, isGenerating, isLocallyGenerating, advancedOptions, onCADGenerated, skipEnhancement, canUseDesign, incrementDesignUsage]);

  // Insert example prompt
  const insertExample = useCallback((example: string) => {
    setPrompt(example);
    handlePromptChange(example);
    setShowExamples(false);
  }, [handlePromptChange]);

  // Test with AgenticadML's verified working examples
  const handleTestAgenticadExamples = useCallback(async () => {
    if (isGenerating || isLocallyGenerating) return;
    
    setLastError(null);
    setEnhancementInfo(null);
    
    try {
      console.log('🧪 Testing with AgenticadML verified example...');
      await cadAI.testWithZooExamples(); // Backend call (still uses Zoo API internally)
      
      // If test succeeds, try generating with the first verified example
      const verifiedExample = "involute helical gear with 36 teeth";
      const request: CADGenerationRequest = {
        prompt: verifiedExample,
        outputFormat: 'gltf',
        units: 'mm'
      };

      const cadModel = await cadAI.generateAndWaitForCAD(request, true); // Skip enhancement for test
      
      // Transform to architectural model format
      const architecturalModel = {
        id: cadModel.id,
        name: `Test CAD Model - ${cadModel.prompt.substring(0, 30)}...`,
        description: `Test with verified example: ${cadModel.prompt}`,
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
          name: `Test: ${cadModel.prompt.substring(0, 50)}...`,
          description: `Test with verified example: ${cadModel.prompt}`,
          components: [
            {
              name: "Test Component",
              material: "Engineering Plastic",
              dimensions: {
                width: cadModel.properties.dimensions.width,
                length: cadModel.properties.dimensions.depth,
                height: cadModel.properties.dimensions.height
              },
              function: "Test component from AgenticadML verified example"
            }
          ],
          manufacturing: {
            method: "3D Printing / CNC Machining",
            materials: ["ABS Plastic", "PLA", "Aluminum"],
            complexity: cadModel.properties.complexity,
            estimated_cost: "10-30 USD"
          },
          specifications: {
            weight: `${Math.round(cadModel.properties.volume / 1000 * 1.2 * 100) / 100} g`,
            durability: "High"
          },
          totalVolume: Math.round(cadModel.properties.volume),
          style: "modern"
        }
      };

      onCADGenerated(architecturalModel);
      console.log('✅ AgenticadML test successful!');
      setLastGeneratedModel(architecturalModel);
      
    } catch (error) {
      console.error('❌ AgenticadML test failed:', error);
      setLastError('general');
    }
  }, [isGenerating, isLocallyGenerating, onCADGenerated]);

  // Enhanced example prompts based on AgenticadML's research
  const getAgenticadExamplePrompts = () => [
    "involute helical gear with 36 teeth, 50mm diameter, 10mm thickness",
    "rectangular plate with 4 holes near each corner and rounded corners, 200mm × 100mm × 5mm thick",
    "smartphone case with rounded corners, camera cutout 30mm diameter, 150mm × 75mm × 8mm thick",
    "desk pen holder with 3 compartments, 80mm diameter, 100mm tall, 2mm wall thickness",
    "wall mounting bracket with 2 bolt holes, 100mm wide, 50mm deep, 5mm thick aluminum",
    "simple bookend with L-shape, 150mm tall, 100mm deep, 10mm thick with rounded edges",
    "cable organizer tray with 5 slots, 200mm × 50mm × 30mm deep, 3mm wall thickness",
    "phone stand with adjustable angle, 100mm wide base, 80mm tall, with cable slot",
    "plant pot with drainage holes, 120mm diameter, 100mm tall, 3mm wall thickness",
    "laptop stand with ventilation slots, 300mm wide, 200mm deep, adjustable height"
  ];

  const renderErrorMessage = () => {
    if (!lastError) return null;

    switch (lastError) {
      case 'agenticad_422':
        return (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-400 mt-0.5" />
              <div>
                <h4 className="text-yellow-400 font-medium text-sm mb-2">Prompt Needs More Detail</h4>
                <p className="text-yellow-300 text-sm mb-3">
                  Our AgenticadML AI works best with specific, technical descriptions. Try being more detailed about:
                </p>
                <ul className="text-yellow-300 text-sm space-y-1 mb-3">
                  <li>• <strong>Dimensions:</strong> "200mm wide, 50mm thick"</li>
                  <li>• <strong>Features:</strong> "with 4 holes", "rounded corners", "chamfered edges"</li>
                  <li>• <strong>Technical details:</strong> "gear with 36 teeth", "2mm wall thickness"</li>
                </ul>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowExamples(true)}
                    className="text-xs px-3 py-1 bg-yellow-500/20 text-yellow-200 rounded-lg hover:bg-yellow-500/30 transition-colors"
                  >
                    View Examples
                  </button>
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setShowTips(true); }}
                    className="flex items-center gap-1 text-xs px-3 py-1 bg-yellow-500/20 text-yellow-200 rounded-lg hover:bg-yellow-500/30 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Best Practices
                  </a>
                </div>
              </div>
            </div>
          </div>
        );

      case 'timeout':
        return (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-orange-400" />
              <div>
                <h4 className="text-orange-400 font-medium text-sm">Generation Timeout</h4>
                <p className="text-orange-300 text-sm">The CAD generation took too long. Try a simpler design or try again.</p>
              </div>
            </div>
          </div>
        );

      case 'rate_limit':
        return (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <div>
                <h4 className="text-red-400 font-medium text-sm">Rate Limit Exceeded</h4>
                <p className="text-red-300 text-sm">Too many requests. Please wait a moment before trying again.</p>
              </div>
            </div>
          </div>
        );

      case 'payment_required':
        return (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-orange-400 mt-0.5" />
              <div>
                <h4 className="text-orange-400 font-medium text-sm mb-2">Service Quota Exceeded</h4>
                <p className="text-orange-300 text-sm mb-3">
                  The CAD generation service has reached its quota limit. The free API credits have been used up and a payment method is required.
                </p>
                <p className="text-orange-300 text-sm">
                  Please contact support to upgrade your account or try again later when the quota resets.
                </p>
              </div>
            </div>
          </div>
        );

      default:
        return (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-red-400" />
              <div>
                <h4 className="text-red-400 font-medium text-sm">Generation Failed</h4>
                <p className="text-red-300 text-sm">Unable to generate CAD model. Please try again with a different prompt.</p>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className={`cosmic-panel ${className}`}>
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center">
          <h3 className="text-4xl font-black cosmic-glow-text mb-4 tracking-wider">⚡ QUANTUM CAD GENESIS</h3>
          <div className="cosmic-divider mx-auto max-w-md mb-6"></div>
          <p className="cosmic-text-shadow text-xl leading-relaxed">
            Powered by <span className="text-cyan-400 font-semibold">AgenticadML</span> • Describe your vision with <span className="text-purple-400 font-semibold">technical precision</span> for optimal manifestation
          </p>
        </div>

        {/* Main Input Area */}
        <div className="space-y-6">
          {/* Prompt Input */}
          <div className="relative">
            <textarea
              value={prompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              placeholder="Describe your CAD part with specific dimensions and features... (e.g., 'rectangular plate with 4 holes near each corner, 200mm × 100mm × 5mm thick')"
              className={`w-full h-40 horizon-input resize-none text-lg ${
                validation.valid 
                  ? '' 
                  : 'border-red-500/50'
              }`}
              disabled={isGenerating || isLocallyGenerating}
            />
            
            {/* Character count and validation */}
            <div className="absolute bottom-4 right-4 flex items-center gap-3">
              <span className={`text-sm font-medium ${prompt.length > 400 ? 'text-red-400' : 'text-gray-400'}`}>
                {prompt.length}/500
              </span>
              {prompt && (
                validation.valid ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-400" />
                )
              )}
            </div>
          </div>

          {/* Validation Feedback */}
          {!validation.valid && validation.suggestions && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
              <h4 className="text-red-400 font-semibold text-sm mb-3">Improve Your Prompt:</h4>
              <ul className="text-red-300 text-sm space-y-2">
                {validation.suggestions.map((suggestion, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <span className="text-red-400 mt-0.5 text-lg">•</span>
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Error Messages */}
          {renderErrorMessage()}

          {/* Upgrade Prompt Modal */}
          {showUpgradePrompt && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <AlertCircle className="w-5 h-5 text-orange-400" />
                  <div>
                    <h4 className="text-orange-400 font-medium text-sm">Design Limit Reached</h4>
                    <p className="text-orange-300 text-sm">You've reached your monthly design generation limit. Upgrade to continue creating.</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowUpgradePrompt(false)}
                  className="text-orange-400 hover:text-orange-300 transition-colors px-3 py-1 rounded-lg hover:bg-orange-500/10"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Prompt Enhancement Status */}
          {!skipEnhancement && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Zap className="w-5 h-5 text-blue-400" />
                <div>
                  <h4 className="text-blue-400 font-medium text-sm">AI Prompt Enhancement Enabled</h4>
                  <p className="text-blue-300 text-sm">Your prompts will be enhanced for better AgenticadML compatibility</p>
                </div>
              </div>
            </div>
          )}
          
          {skipEnhancement && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <ZapOff className="w-5 h-5 text-orange-400" />
                <div>
                  <h4 className="text-orange-400 font-medium text-sm">AI Prompt Enhancement Disabled</h4>
                  <p className="text-orange-300 text-sm">Using your original prompts directly with AgenticadML API</p>
                </div>
              </div>
            </div>
          )}

          {/* Prompt Enhancement Info */}
          {enhancementInfo && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
              <div className="flex items-start gap-4">
                <CheckCircle className="w-6 h-6 text-green-400 mt-0.5" />
                <div className="flex-1">
                  <h4 className="text-green-400 font-semibold text-base mb-3">
                    ✨ Prompt Enhanced by AI ({enhancementInfo.source})
                  </h4>
                  <div className="grid grid-cols-1 gap-4 text-sm">
                    <div>
                      <span className="text-gray-400 font-medium">Original:</span>
                      <p className="text-gray-300 bg-black/20 rounded-lg p-3 mt-2">{enhancementInfo.original}</p>
                    </div>
                    <div>
                      <span className="text-green-400 font-medium">Enhanced:</span>
                      <p className="text-green-300 bg-green-500/10 rounded-lg p-3 mt-2">{enhancementInfo.enhanced}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-sm text-gray-400">
                      Confidence: {Math.round(enhancementInfo.confidence * 100)}%
                    </span>
                    <button
                      onClick={() => setEnhancementInfo(null)}
                      className="text-sm text-gray-400 hover:text-white transition-colors px-3 py-1 rounded-lg hover:bg-white/10"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div className="flex items-center gap-4 flex-wrap">
            <button
              onClick={() => setShowExamples(!showExamples)}
              className="flex items-center gap-2 px-4 py-3 horizon-card text-white rounded-xl transition-colors font-medium"
            >
              <Lightbulb className="w-4 h-4" />
              Examples
            </button>
            
            <button
              onClick={() => setShowTips(!showTips)}
              className="flex items-center gap-2 px-4 py-3 bg-blue-500/20 text-blue-300 rounded-xl hover:bg-blue-500/30 transition-colors font-medium border border-blue-500/30"
            >
              <BookOpen className="w-4 h-4" />
              Tips
            </button>
            
            {/* Temporarily commented out debugging feature */}
            {/* <button
              onClick={handleTestAgenticadExamples}
              disabled={isGenerating || isLocallyGenerating}
              className="flex items-center gap-2 px-4 py-3 bg-orange-500/20 text-orange-300 rounded-xl hover:bg-orange-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium border border-orange-500/30"
            >
              <RefreshCw className="w-4 h-4" />
              Test AgenticadML API
            </button> */}
            
            {/* Prompt Enhancement Toggle */}
            <button
              onClick={() => setSkipEnhancement(!skipEnhancement)}
              className={`flex items-center gap-2 px-4 py-3 rounded-xl transition-colors font-medium border ${
                skipEnhancement 
                  ? 'bg-orange-500/20 text-orange-300 border-orange-500/30 hover:bg-orange-500/30'
                  : 'bg-green-500/20 text-green-300 border-green-500/30 hover:bg-green-500/30'
              }`}
            >
              {skipEnhancement ? <ZapOff className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
              {skipEnhancement ? 'Enable Enhancement' : 'Disable Enhancement'}
            </button>
            
            {/* Temporarily commented out debugging feature */}
            {/* <button
              onClick={async () => {
                console.log('🧪 Running prompt enhancement tests...');
                await cadAI.testPromptEnhancement();
              }}
              disabled={isGenerating || isLocallyGenerating}
              className="flex items-center gap-2 px-4 py-3 horizon-card text-white rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
            >
              <Settings className="w-4 h-4" />
              Test Enhancement
            </button> */}
            
            {/* Debug Download Button */}
            {lastGeneratedModel?.cadModel?.gltfUrl && (
              <button
                onClick={() => {
                  const cadModel = lastGeneratedModel.cadModel;
                  if (cadModel.gltfUrl.startsWith('blob:')) {
                    // For blob URLs, we need to access the original base64 data
                    console.log('🔍 GLTF Debug Info:');
                    console.log('Model ID:', cadModel.id);
                    console.log('Blob URL:', cadModel.gltfUrl);
                    console.log('To download the GLTF data, check the console for base64 output from AgenticadML API.');
                    alert('Check browser console for GLTF debug information. The base64 GLTF data was logged earlier.');
                  } else {
                    // Direct URL - open in new tab
                    window.open(cadModel.gltfUrl, '_blank');
                  }
                }}
                className="flex items-center gap-2 px-4 py-3 bg-green-500/20 text-green-300 rounded-xl hover:bg-green-500/30 transition-colors font-medium border border-green-500/30"
              >
                <Download className="w-4 h-4" />
                Debug GLTF
              </button>
            )}
            
            {/* Temporarily commented out debugging feature */}
            {/* <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="flex items-center gap-2 px-4 py-3 bg-gray-500/20 text-gray-300 rounded-xl hover:bg-gray-500/30 transition-colors font-medium border border-gray-500/30"
            >
              <Settings className="w-4 h-4" />
              Advanced
            </button> */}
            
            <div className="flex-1" />
            
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim() || !validation.valid || isGenerating || isLocallyGenerating}
              className="horizon-button-primary flex items-center gap-3 px-10 py-4 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:transform-none"
            >
              {isGenerating || isLocallyGenerating ? (
                <span className="cosmic-text-shadow">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  🌌 Materializing Reality...
                </span>
              ) : (
                <span className="cosmic-text-shadow">
                  <Wand2 className="w-5 h-5" />
                  ⚡ Genesis CAD Model
                </span>
              )}
            </button>
          </div>

          {/* Loading Overlay */}
          {isLocallyGenerating && (
            <div className="fixed inset-0 z-50 flex items-center justify-center">
              {/* Cosmic destiny background */}
              <div className="absolute inset-0 bg-gradient-to-br from-black via-indigo-950/50 to-purple-950/60 backdrop-blur-md"></div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(59,130,246,0.1),transparent_50%)] animate-pulse"></div>
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(99,102,241,0.1),transparent_50%)] animate-pulse" style={{ animationDelay: '2s' }}></div>
              
              <div className="cosmic-panel max-w-2xl w-full mx-8 relative z-10">
                <div className="text-center">
                  {/* Cosmic Loading Spinner */}
                  <div className="relative w-28 h-28 mx-auto mb-12">
                    <div className="absolute inset-0 border-4 border-cyan-400/30 rounded-full cosmic-energy-pulse"></div>
                    <div className="absolute inset-0 border-4 border-transparent border-t-cyan-400 rounded-full animate-spin"></div>
                    <div className="absolute inset-2 border-3 border-purple-400/40 rounded-full animate-spin" style={{ animationDirection: 'reverse', animationDuration: '3s' }}></div>
                    <div className="absolute inset-4 border-2 border-cyan-300/60 rounded-full animate-pulse"></div>
                    <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/20 to-purple-400/20 rounded-full blur-sm animate-pulse"></div>
                  </div>
                  
                  {/* Cosmic Heading */}
                  <h3 className="text-4xl font-black cosmic-glow-text mb-4 tracking-wider">🌌 MATERIALIZING DESTINY</h3>
                  <div className="cosmic-divider mx-auto max-w-md mb-8"></div>
                  <p className="cosmic-text-shadow text-lg text-cyan-300 mb-12">Your imagination transcends into dimensional reality...</p>
                  
                  {/* Progress Steps */}
                  <div className="space-y-4 text-left">
                    {(skipEnhancement ? [
                      '🌟 Igniting Genesis Sequence...',
                      '⚡ Channeling AgenticadML Cosmic Energy...',
                      '🔮 Weaving Dimensional Matrices...',
                      '✨ Crystallizing Reality Fragments...'
                    ] : [
                      '🧠 Amplifying Quantum Intention...',
                      '🌟 Igniting Genesis Sequence...',
                      '⚡ Channeling AgenticadML Cosmic Energy...',
                      '🔮 Weaving Dimensional Matrices...',
                      '✨ Crystallizing Reality Fragments...'
                    ]).map((step, index) => (
                      <div key={index} className="flex items-center gap-4">
                        <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center transition-all duration-300 ${
                          index < processingSteps.length 
                            ? 'bg-green-500 shadow-lg shadow-green-500/30' 
                            : index === processingSteps.length 
                            ? 'bg-cyan-500 animate-pulse shadow-lg shadow-cyan-500/30' 
                            : 'bg-gray-600/50 border border-gray-500/30'
                        }`}>
                          {index < processingSteps.length ? (
                            <CheckCircle className="w-4 h-4 text-white" />
                          ) : index === processingSteps.length ? (
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                          ) : (
                            <div className="w-2 h-2 bg-gray-400 rounded-full"></div>
                          )}
                        </div>
                        <span className={`text-lg transition-all duration-300 cosmic-text-shadow ${
                          index < processingSteps.length 
                            ? 'text-green-400 font-semibold cosmic-glow-text' 
                            : index === processingSteps.length 
                            ? 'text-cyan-400 font-semibold cosmic-glow-text animate-pulse' 
                            : 'text-gray-400'
                        }`}>
                          {step}
                        </span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Enhancement Status */}
                  {skipEnhancement && (
                    <div className="mt-6 flex items-center justify-center gap-2 text-orange-400">
                      <div className="w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✕</span>
                      </div>
                      <span className="text-sm font-medium">Enhancement Disabled</span>
                    </div>
                  )}
                  
                  {!skipEnhancement && (
                    <div className="mt-6 flex items-center justify-center gap-2 text-blue-400">
                      <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs font-bold">✓</span>
                      </div>
                      <span className="text-sm font-medium">AI Enhancement Active</span>
                    </div>
                  )}
                  
                  {/* Status Message */}
                  <div className="mt-8 text-gray-300">
                    <p className="text-sm">Using AgenticadML AI with {skipEnhancement ? 'direct prompt processing' : 'enhanced prompt processing'}...</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Example Prompts */}
          {showExamples && (
            <div className="cosmic-panel">
              <div className="flex items-center justify-between mb-3">
                <h4 className="cosmic-glow-text font-bold text-lg">✨ COSMIC EXAMPLES (AgenticadML)</h4>
                <button
                  onClick={() => setShowTips(true)}
                  className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
                >
                  <ExternalLink className="w-3 h-3" />
                  More Examples
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
                {getAgenticadExamplePrompts().map((example, index) => (
                  <button
                    key={index}
                    onClick={() => insertExample(example)}
                    className="text-left horizon-button text-sm cosmic-hover-glow"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Tips Panel */}
          {showTips && (
            <div className="bg-cyan-500/10 border border-cyan-500/20 rounded-xl p-4">
              <h4 className="text-cyan-400 font-medium text-sm mb-3">AgenticadML AI Best Practices:</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                  <h5 className="text-white font-medium mb-2">✅ DO Include:</h5>
                  <ul className="text-cyan-300 space-y-1">
                    <li>• Specific dimensions (200mm, 5mm thick)</li>
                    <li>• Technical features (holes, chamfers, fillets)</li>
                    <li>• Part function or application</li>
                    <li>• Material constraints if relevant</li>
                  </ul>
                </div>
                <div>
                  <h5 className="text-white font-medium mb-2">❌ AVOID:</h5>
                  <ul className="text-red-300 space-y-1">
                    <li>• Vague nouns ("cover", "case")</li>
                    <li>• Missing dimensions</li>
                    <li>• Overly complex descriptions</li>
                    <li>• Non-mechanical objects</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="cosmic-panel space-y-4">
              <h4 className="cosmic-glow-text font-bold text-lg">⚙️ QUANTUM PARAMETERS</h4>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Output Format</label>
                  <select
                    value={advancedOptions.outputFormat || 'gltf'}
                    onChange={(e) => setAdvancedOptions(prev => ({ 
                      ...prev, 
                      outputFormat: e.target.value as any 
                    }))}
                    className="w-full horizon-input"
                  >
                    <option value="gltf">GLTF (.gltf)</option>
                    <option value="stl">STL (.stl)</option>
                    <option value="obj">OBJ (.obj)</option>
                    <option value="ply">PLY (.ply)</option>
                    <option value="step">STEP (.step)</option>
                    <option value="fbx">FBX (.fbx)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Units</label>
                  <select
                    value={advancedOptions.units || 'mm'}
                    onChange={(e) => setAdvancedOptions(prev => ({ 
                      ...prev, 
                      units: e.target.value as any 
                    }))}
                    className="w-full horizon-input"
                  >
                    <option value="mm">Millimeters (mm)</option>
                    <option value="cm">Centimeters (cm)</option>
                    <option value="m">Meters (m)</option>
                    <option value="in">Inches (in)</option>
                    <option value="ft">Feet (ft)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">Scale Factor</label>
                  <input
                    type="number"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={advancedOptions.scale || 1}
                    onChange={(e) => setAdvancedOptions(prev => ({ 
                      ...prev, 
                      scale: parseFloat(e.target.value) || 1 
                    }))}
                    className="w-full horizon-input"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CADInputPanel; 