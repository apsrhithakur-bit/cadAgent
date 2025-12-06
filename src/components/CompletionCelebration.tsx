import React, { useState, useEffect } from 'react';
import { Sparkles, ArrowLeft, MessageCircle, Send, Eye, Wrench, Users, Search, Download, Share2, CheckCircle, Hand, FileText, ExternalLink, Bot } from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { getModelProductName, extractProductName } from '../utils/productNameExtractor';
import { CADAIService } from '../services/cadAI';
import { useAuth } from '../hooks/useAuth';
import { CalculatedProperties } from '../services/cadPropertyCalculator';
import { chatAI } from '../services/chatAI';

interface CompletionCelebrationProps {
  onBack: () => void;
  onStepClick: (stepIndex: number) => void;
  completedSteps: boolean[];
  steps: Array<{
    id: string;
    title: string;
    icon: React.ReactNode;
    component: React.ComponentType<any>;
  }>;
  model: ArchitecturalModel | null;
  calculatedProperties?: CalculatedProperties | null;
}

const CompletionCelebration: React.FC<CompletionCelebrationProps> = ({ 
  onBack, 
  onStepClick, 
  completedSteps, 
  steps,
  model,
  calculatedProperties 
}) => {
  const { profile } = useAuth();
  const [showConfetti, setShowConfetti] = useState(true);
  const [chatMessage, setChatMessage] = useState('');
  const [isProcessingMessage, setIsProcessingMessage] = useState(false);
  const [recoveredModel, setRecoveredModel] = useState<ArchitecturalModel | null>(null);
  
  // Try to recover model from localStorage if missing
  const tryRecoverModel = (): ArchitecturalModel | null => {
    try {
      const backup = localStorage.getItem('agenticad_current_model');
      if (backup) {
        const parsed = JSON.parse(backup);
        if (parsed.model) {
          console.log('🔄 COMPLETION: Recovered model from localStorage');
          return parsed.model;
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to recover model from localStorage:', error);
    }
    return null;
  };
  
  // Debug the received model data and try recovery if needed
  useEffect(() => {
    console.log('🎉 COMPLETION PAGE - Received model:', model);
    console.log('🎉 Model name:', model?.name);
    console.log('🎉 Model description:', model?.description);
    console.log('🎉 CAD model:', model?.cadModel);
    console.log('🎉 Product specs:', model?.productSpecs);
    console.log('🎉 Model type:', model?.type);
    
    // If model is missing or incomplete, try to recover
    if (!model || !model.name) {
      console.log('⚠️ Model missing or incomplete, attempting recovery...');
      const recovered = tryRecoverModel();
      if (recovered) {
        setRecoveredModel(recovered);
        console.log('✅ Model recovered successfully:', recovered.name);
      } else {
        console.log('❌ Could not recover model data');
      }
    }
  }, [model]);
  
  // Use recovered model as fallback
  const activeModel = model || recoveredModel;
  
  // Enhanced dynamic product information with better fallbacks
  const productName = activeModel ? getModelProductName(activeModel) : 'Your Prototype';
  const productDescription = activeModel?.description || 
                           activeModel?.cadModel?.prompt || 
                           activeModel?.cadModel?.originalPrompt ||
                           activeModel?.productSpecs?.description ||
                           'Custom design';

  // Use real calculated costs from ProcessWizard (same priority as 3D viewer)
  const getDisplayCost = (): string => {
    // Priority 1: Real calculated costs from CAD analysis
    if (calculatedProperties?.manufacturing?.costDisplay) {
      return calculatedProperties.manufacturing.costDisplay;
    }
    // Priority 2: Fallback to product specs (manual/default values)  
    if (activeModel?.productSpecs?.manufacturing?.estimated_cost) {
      return activeModel.productSpecs.manufacturing.estimated_cost;
    }
    // Priority 3: Default
    return '$8-25';
  };

  const getDisplayMethod = (): string => {
    return calculatedProperties?.manufacturing?.recommendedMethod || 
           activeModel?.productSpecs?.manufacturing?.method ||
           '3D Printing (FDM)';
  };

  const getDisplayComplexity = (): string => {
    return calculatedProperties?.manufacturing?.complexity || 
           activeModel?.productSpecs?.manufacturing?.complexity ||
           'moderate complexity';
  };

  // Simple markdown renderer for chat messages
  const renderMarkdown = (text: string): string => {
    // Convert **bold** to HTML
    return text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  };
                           
  // Enhanced debugging for product name extraction
  console.log('🏷️ PRODUCT NAME EXTRACTION:');
  console.log('  - Active model (prop or recovered):', !!activeModel);
  console.log('  - Original model name:', activeModel?.name);
  console.log('  - CAD prompt:', activeModel?.cadModel?.prompt);
  console.log('  - CAD original prompt:', activeModel?.cadModel?.originalPrompt);
  console.log('  - Product specs name:', activeModel?.productSpecs?.name);
  console.log('  - Extracted product name:', productName);
  
  const totalSteps = steps.length;
  const completedCount = completedSteps.filter(Boolean).length;
  
  const [chatHistory, setChatHistory] = useState([
    {
      type: 'ai',
      message: `🎉 Amazing work! You've successfully completed your prototype journey! I'm your AgentiCAD assistant and I can help you navigate back to any step, make design modifications, find manufacturers, analyze patents, download files, and much more. What would you like to do next?`
    }
  ]);

  // Update the initial chat message when productName is determined
  useEffect(() => {
    if (productName && productName !== 'Your Prototype') {
      setChatHistory([
        {
          type: 'ai',
          message: `🎉 Amazing work! You've successfully completed your **${productName}** prototype journey! I'm your AgentiCAD assistant and I can help you navigate back to any step, make design modifications, find manufacturers, analyze patents, download files, and much more. What would you like to do next?`
        }
      ]);
    }
  }, [productName]);

  useEffect(() => {
    // Hide confetti after 5 seconds
    const timer = setTimeout(() => {
      setShowConfetti(false);
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  const quickActions = [
    { icon: <Eye className="w-4 h-4" />, text: "Review CAD model", action: "cad", stepId: 'model' },
    { icon: <Wrench className="w-4 h-4" />, text: "Make design changes", action: "iterate", stepId: 'iterate' },
    { icon: <Users className="w-4 h-4" />, text: "Find manufacturers", action: "manufacturers", stepId: 'manufacture' },
    { icon: <Search className="w-4 h-4" />, text: "Patent analysis", action: "patents", stepId: 'patent' },
    { icon: <Download className="w-4 h-4" />, text: "Download files", action: "download", stepId: 'model' },
    { icon: <Share2 className="w-4 h-4" />, text: "Share design", action: "share", stepId: null }
  ];

  const handleSendMessage = async (message: string) => {
    if (!message.trim() || isProcessingMessage) return;

    const newHistory = [...chatHistory, { type: 'user', message }];
    setChatHistory(newHistory);
    setChatMessage('');
    setIsProcessingMessage(true);

    try {
      // Enhanced AI response based on message content and model data
      let aiResponse = await chatAI.generateSmartResponse(
        message, 
        activeModel, 
        calculatedProperties,
        chatHistory.map(chat => ({ type: chat.type, message: chat.message }))
      );
      
      // Check if AI response includes navigation commands
      if (aiResponse.includes('[NAVIGATE:')) {
        const navMatch = aiResponse.match(/\[NAVIGATE:(\w+)\]/);
        if (navMatch) {
          const stepId = navMatch[1];
          handleStepNavigation(stepId);
          // Remove navigation command from displayed message
          aiResponse = aiResponse.replace(/\[NAVIGATE:\w+\]/, '');
        }
      }
      
      setChatHistory([...newHistory, { type: 'ai', message: aiResponse }]);
    } catch (error) {
      console.error('AI response error:', error);
      setChatHistory([...newHistory, { 
        type: 'ai', 
        message: "I apologize, but I'm having trouble connecting to our AI service right now. However, I can still help you navigate to different steps or answer questions about your prototype using the quick action buttons below!" 
      }]);
    } finally {
      setIsProcessingMessage(false);
    }
  };

  const handleQuickAction = (action: string, stepId?: string) => {
    const actionMessages = {
      cad: `Show me detailed technical specifications and export options for my ${productName}`,
      manufacturers: `Help me find the best manufacturers and get quotes for my ${productName}`,
      patents: `Analyze patent risks and protection opportunities for my ${productName}`,
      download: `What file formats can I download for my ${productName} and how do I export them?`,
      share: `How can I share my ${productName} design with collaborators and stakeholders?`,
      iterate: `I want to make design modifications to my ${productName}`
    };

    if (stepId) {
      // Navigate to specific step
      const stepIndex = steps.findIndex(step => step.id === stepId);
      if (stepIndex !== -1) {
        onStepClick(stepIndex);
        return;
      }
    }

    handleSendMessage(actionMessages[action as keyof typeof actionMessages]);
  };

  const handleStepNavigation = (stepId: string) => {
    const stepIndex = steps.findIndex(step => step.id === stepId);
    if (stepIndex !== -1) {
      onStepClick(stepIndex);
    }
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Confetti Animation */}
      {showConfetti && (
        <div className="fixed inset-0 pointer-events-none z-50">
          {[...Array(50)].map((_, i) => (
            <div
              key={i}
              className="absolute animate-bounce"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 2}s`,
                animationDuration: `${2 + Math.random() * 2}s`
              }}
            >
              <div className={`w-2 h-2 rounded-full ${
                ['bg-cyan-400', 'bg-purple-400', 'bg-yellow-400', 'bg-green-400', 'bg-pink-400'][Math.floor(Math.random() * 5)]
              }`}></div>
            </div>
          ))}
        </div>
      )}

      {/* Header */}
      <header className="px-6 py-4 border-b border-white/10">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button
            onClick={onBack}
            className="flex items-center text-gray-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5 mr-2" />
            Back to Home
          </button>
          <div className="flex items-center gap-3 text-white font-semibold">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-cyan-400/20 to-purple-400/20 flex items-center justify-center">
              <img
                src="/agenticad-cosmic-logo.png"
                alt="AgentiCAD Galaxy"
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-lg font-bold tracking-wide">Journey Complete!</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="px-6 py-12">
        <div className="max-w-6xl mx-auto">
          {/* Dynamic Celebration Header */}
          <div className="text-center mb-12">
            <div className="relative w-40 h-40 mx-auto mb-8">
              {/* Custom Galaxy Hand Logo - Professional Version */}
              <div className="relative w-full h-full">
                <div className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-cyan-400/10 to-purple-400/10 flex items-center justify-center">
                  <img
                    src="/agenticad-cosmic-logo.png"
                    alt="AgentiCAD - Hand Holding Galaxy"
                    className="w-full h-full object-cover"
                  />
                </div>
                {/* Subtle glow effect - not overdone */}
                <div className="absolute inset-0 bg-gradient-to-r from-cyan-400/10 to-purple-400/10 rounded-full blur-2xl animate-pulse" style={{ animationDelay: '1s' }}></div>
              </div>
            </div>
            <h1 className="text-5xl md:text-7xl font-black cosmic-glow-text mb-6 tracking-wide">
              PROTOTYPE MANIFESTED
            </h1>
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-cyan-400 to-transparent"></div>
              <div className="w-10 h-10 rounded-full overflow-hidden bg-gradient-to-br from-cyan-400/20 to-purple-400/20 flex items-center justify-center opacity-80">
                <img
                  src="/agenticad-cosmic-logo.png"
                  alt="AgentiCAD"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-16 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-transparent"></div>
            </div>
            <div className="cosmic-divider mx-auto max-w-2xl mb-6"></div>
            <p className="text-2xl md:text-3xl cosmic-text-shadow leading-relaxed mb-8">
              <span className="text-cyan-400 font-semibold">IF YOU CAN IMAGINE IT,</span><br/>
              <span className="text-purple-400 font-semibold">WE CAN PROTOTYPE IT!</span>
            </p>
            <div className="cosmic-panel max-w-3xl mx-auto cosmic-hover-glow">
              <h3 className="text-2xl font-black cosmic-glow-text mb-4 tracking-wide">🌟 Your {productName} Manifested</h3>
              <p className="cosmic-text-shadow text-lg leading-relaxed">
                <span className="text-cyan-300">From imagination to material reality</span> in {totalSteps} transformative steps. Your <span className="text-purple-300 font-semibold">vision has transcended dimensions!</span>
              </p>
              {activeModel?.productSpecs?.manufacturing && (
                <div className="mt-4 flex justify-center gap-4 text-sm text-gray-400">
                  <span>💰 {getDisplayCost()}</span>
                  <span>🔧 {getDisplayMethod()}</span>
                  <span>📦 {getDisplayComplexity()}</span>
                </div>
              )}
            </div>
          </div>

          {/* Enhanced AI Assistant Chat */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              <div className="cosmic-panel rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-6">
                  <Bot className="w-6 h-6 text-cyan-400" />
                  <h3 className="text-xl font-bold text-white">Your AgentiCAD Assistant</h3>
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                  <span className="text-xs text-green-400">AI-Powered</span>
                </div>

                {/* Chat History */}
                <div className="space-y-4 mb-6 max-h-96 overflow-y-auto">
                  {chatHistory.map((chat, index) => (
                    <div
                      key={index}
                      className={`flex ${chat.type === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-3 rounded-2xl ${
                          chat.type === 'user'
                            ? 'horizon-button-primary'
                            : 'horizon-card'
                        }`}
                      >
                        <div 
                          className="text-sm whitespace-pre-line"
                          dangerouslySetInnerHTML={{ 
                            __html: renderMarkdown(chat.message) 
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  {isProcessingMessage && (
                    <div className="flex justify-start">
                      <div className="bg-white/10 text-gray-300 px-4 py-3 rounded-2xl">
                        <div className="flex items-center gap-2">
                          <div className="animate-spin w-4 h-4 border-2 border-cyan-400 border-t-transparent rounded-full"></div>
                          <span className="text-sm">Assistant is thinking...</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Input Form */}
                <form 
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendMessage(chatMessage);
                  }} 
                  className="flex gap-3"
                >
                  <input
                    type="text"
                    value={chatMessage}
                    onChange={(e) => setChatMessage(e.target.value)}
                    placeholder={`Ask me anything about your ${productName}...`}
                    disabled={isProcessingMessage}
                    className="flex-1 px-4 py-3 bg-white/10 border border-white/20 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300 disabled:opacity-50"
                  />
                  <button
                    type="submit"
                    disabled={!chatMessage.trim() || isProcessingMessage}
                    className={`horizon-button-primary px-6 py-3 font-semibold ${
                      chatMessage.trim() && !isProcessingMessage
                        ? ''
                        : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>

                {/* Enhanced Quick Actions */}
                <div className="mt-6">
                  <p className="text-sm text-gray-400 mb-3">Quick actions for your {productName}:</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {quickActions.map((action, index) => (
                      <button
                        key={index}
                        onClick={() => handleQuickAction(action.action, action.stepId || undefined)}
                        className="flex items-center gap-2 px-3 py-2 text-sm bg-white/5 border border-white/10 rounded-lg text-gray-300 hover:text-white hover:border-cyan-400/30 hover:bg-white/10 transition-all duration-300"
                      >
                        {action.icon}
                        {action.text}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Enhanced Summary Panel */}
            <div className="space-y-6">
              <div className="cosmic-panel rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Journey Summary</h3>
                <div className="space-y-3">
                  {steps.map((step, index) => (
                    <button
                      key={step.id}
                      onClick={() => onStepClick(index)}
                      className="w-full flex items-center gap-3 text-sm p-2 rounded-lg hover:bg-white/5 transition-colors group"
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        completedSteps[index] ? 'bg-green-500' : 'bg-gray-500'
                      }`}>
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                      <span className="text-gray-300 group-hover:text-white transition-colors text-left">
                        {step.title}
                      </span>
                    </button>
                  ))}
                </div>
                <div className="mt-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="text-center text-sm">
                    <div className="text-green-400 font-semibold">{completedCount}/{totalSteps} Steps Complete</div>
                    <div className="text-gray-400 text-xs mt-1">Click any step to review or modify</div>
                  </div>
                </div>
              </div>

              <div className="cosmic-panel rounded-2xl p-6">
                <h3 className="text-lg font-bold text-white mb-4">Next Steps</h3>
                <div className="space-y-3 text-sm text-gray-300">
                  <button 
                    onClick={() => handleQuickAction('manufacturers', 'manufacture')}
                    className="w-full flex items-start gap-2 p-2 rounded hover:bg-white/5 transition-colors"
                  >
                    <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Request manufacturing quotes</span>
                  </button>
                  <button 
                    onClick={() => handleQuickAction('patents', 'patent')}
                    className="w-full flex items-start gap-2 p-2 rounded hover:bg-white/5 transition-colors"
                  >
                    <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Analyze patent protection</span>
                  </button>
                  <button 
                    onClick={() => handleQuickAction('download', 'model')}
                    className="w-full flex items-start gap-2 p-2 rounded hover:bg-white/5 transition-colors"
                  >
                    <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Download production files</span>
                  </button>
                  <button 
                    onClick={() => handleQuickAction('share')}
                    className="w-full flex items-start gap-2 p-2 rounded hover:bg-white/5 transition-colors"
                  >
                    <div className="w-2 h-2 bg-cyan-400 rounded-full mt-2 flex-shrink-0"></div>
                    <span>Share with stakeholders</span>
                  </button>
                </div>
              </div>

              <div className="cosmic-panel text-center cosmic-hover-glow">
                <h4 className="cosmic-glow-text font-black text-xl mb-3 tracking-wide">🚀 READY FOR MANIFESTATION!</h4>
                <p className="text-sm text-gray-300 mb-4">
                  <span dangerouslySetInnerHTML={{ 
                    __html: renderMarkdown(`Your **${productName}** is manufacturable and ready for the next phase.`) 
                  }} />
                </p>
                {activeModel?.productSpecs?.manufacturing && (
                  <div className="text-xs text-gray-400">
                    Estimated cost: {getDisplayCost()} • {getDisplayMethod()}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CompletionCelebration;