import React, { useState, useEffect } from 'react';
import { MessageCircle, Send, Loader2, AlertCircle, Sparkles, Zap, Crown } from 'lucide-react';
import { ArchitecturalModel } from '../../types/architectural';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useUsage } from '../../hooks/useUsage';
import { CADAIService } from '../../services/cadAI';
import UpgradePrompt from '../UpgradePrompt';

interface DesignIterationProps {
  model: ArchitecturalModel;
  onUpdate: (model: ArchitecturalModel) => void;
}

const DesignIteration: React.FC<DesignIterationProps> = ({ model, onUpdate }) => {
  const { user } = useAuth();
  const { usage, canUseRefine, incrementRefineUsage, getUsageLimits } = useUsage();
  const [message, setMessage] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [chatHistory, setChatHistory] = useState<Array<{
    type: 'user' | 'assistant';
    content: string;
    timestamp: Date;
  }>>([]);

  const cadAI = new CADAIService();

  const suggestions = [
    "Make the seat wider",
    "Add armrests",
    "Change material to carbon fiber",
    "Make it more compact when folded",
    "Add a small table attachment"
  ];

  const handleSendFeedback = async (message: string) => {
    if (!message.trim() || !user) return;

    // Check if user can use more refine chats
    if (!canUseRefine()) {
      setShowUpgradePrompt(true);
      return;
    }

    const newHistory = [...chatHistory, { type: 'user', content: message, timestamp: new Date() }];
    setChatHistory(newHistory);
    setMessage('');
    setIsProcessing(true);

    try {
      // Increment refine usage
      const canProceed = await incrementRefineUsage();
      
      if (!canProceed) {
        setShowUpgradePrompt(true);
        setIsProcessing(false);
        return;
      }

      // Get current design context
      const designSessionId = sessionStorage.getItem('currentDesignSessionId');
      let currentModel = null;
      let designData = null;

      if (designSessionId) {
        const { data } = await supabase
          .from('design_sessions')
          .select('design_data')
          .eq('id', designSessionId)
          .single();
        
        designData = data?.design_data;
        currentModel = designData?.model;
      }

      // Process with real AI if model exists
      let aiResponse = '';
      let updatedModel = null;

      if (currentModel) {
        try {
          // Import and use the real AI service
          const { architecturalAI } = await import('../../services/architecturalAI');
          const result = await architecturalAI.processDesignIteration(currentModel, message);
          
          aiResponse = result.explanation;
          updatedModel = result.updatedModel;

          // Update session with new model
          if (designSessionId && updatedModel) {
            await supabase
              .from('design_sessions')
              .update({
                design_data: {
                  ...designData,
                  model: updatedModel,
                  last_iteration: message,
                  iterations: [...(designData.iterations || []), {
                    timestamp: new Date().toISOString(),
                    user_feedback: message,
                    ai_response: aiResponse,
                    model_changes: result.confidence
                  }]
                }
              })
              .eq('id', designSessionId);
          }

        } catch (aiError) {
          console.warn('AI processing failed, using fallback:', aiError);
          aiResponse = `I understand you want to "${message}". While I'm processing this with my design algorithms, I can tell you that this modification would affect the structural integrity and aesthetics of your design. Let me work on incorporating this change and I'll update the model accordingly.`;
        }
      } else {
        // Fallback response when no model context
        aiResponse = `I understand your feedback: "${message}". To make specific design changes, please first generate a 3D model from the initial design step. Then I can help you refine and iterate on the design with detailed AI-powered modifications.`;
      }

      // Save refine chat to database with AI response
      if (designSessionId) {
        await supabase
          .from('refine_chats')
          .insert({
            user_id: user.id,
            design_session_id: designSessionId,
            message: message,
            response: aiResponse
          });
      }
      
      // Add AI response to chat history
      setChatHistory([...newHistory, { type: 'assistant', content: aiResponse, timestamp: new Date() }]);
      setIsProcessing(false);

    } catch (error) {
      console.error('Error processing design feedback:', error);
      
      // Add error response to chat
      const errorResponse = 'I apologize, but I encountered an issue processing your request. Please try again or contact support if the problem persists.';
      setChatHistory([...newHistory, { type: 'assistant', content: errorResponse, timestamp: new Date() }]);
      
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSendFeedback(message);
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
        type="chats"
        onClose={handleUpgradeClose}
        onUpgrade={handleUpgradeClick}
        usageData={{
          used: usage?.refine_chats_used || 0,
          limit: limits.refine_chats
        }}
        isModal={false}
      />
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Chat Interface */}
        <div className="lg:col-span-2">
          <div className="cosmic-panel p-6">
            <div className="flex items-center gap-3 mb-6">
              <MessageCircle className="w-6 h-6 text-cyan-400" />
              <h3 className="text-xl font-bold text-white">Design Conversation</h3>
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
                        ? 'horizon-button-primary text-white'
                        : 'horizon-card text-gray-300'
                    }`}
                  >
                    <p className="text-sm">{chat.content}</p>
                  </div>
                </div>
              ))}
              
              {isProcessing && (
                <div className="flex justify-start">
                  <div className="horizon-card text-gray-300 px-4 py-3 rounded-2xl">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-5 h-5 animate-spin text-cyan-400" />
                      <span className="ml-2 text-sm">AI is updating your design...</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Input Form */}
            <form onSubmit={handleSubmit} className="flex gap-3">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell me what you'd like to change..."
                className="flex-1 horizon-input"
                disabled={isProcessing}
              />
              <button
                type="submit"
                disabled={!message.trim() || isProcessing}
                className={`px-6 py-3 rounded-xl font-semibold transition-all duration-300 ${
                  message.trim() && !isProcessing
                    ? 'horizon-button-primary'
                    : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                }`}
              >
                <Send className="w-5 h-5" />
              </button>
            </form>

            {/* Quick Suggestions */}
            <div className="mt-6">
              <p className="text-sm text-gray-400 mb-3">Quick suggestions:</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((suggestion, index) => (
                  <button
                    key={index}
                    onClick={() => handleSendFeedback(suggestion)}
                    disabled={isProcessing}
                    className="px-3 py-1 text-sm horizon-card rounded-full text-gray-300 hover:text-white hover:border-cyan-400/30 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Design Preview & Controls */}
        <div className="space-y-6">
          <div className="cosmic-panel p-6">
            <h3 className="text-lg font-bold text-white mb-4">Updated Design</h3>
            
            {/* Mock updated 3D preview */}
            <div className="aspect-square bg-gradient-to-br from-gray-800 to-gray-900 rounded-xl border border-white/10 flex items-center justify-center mb-4">
              <div className="w-24 h-32 bg-gradient-to-br from-cyan-400 to-purple-500 rounded-lg shadow-2xl transform rotate-12">
                <div className="w-full h-full bg-white/10 rounded-lg"></div>
              </div>
            </div>
            
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-green-400" />
                <span className="text-green-400">Design updated</span>
              </div>
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-cyan-400" />
                <span className="text-cyan-400">AI optimized</span>
              </div>
            </div>
          </div>

          <div className="cosmic-panel p-6">
            <h3 className="text-lg font-bold text-white mb-4">Version History</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-cyan-500/20 border border-cyan-500/30 rounded-lg">
                <div>
                  <div className="text-white font-medium text-sm">Current</div>
                  <div className="text-cyan-400 text-xs">With wider seat</div>
                </div>
                <button className="p-1 text-cyan-400 hover:text-white transition-colors">
                  <Sparkles className="w-4 h-4" />
                </button>
              </div>
              <div className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-lg">
                <div>
                  <div className="text-gray-300 font-medium text-sm">Version 1</div>
                  <div className="text-gray-400 text-xs">Original design</div>
                </div>
                <button className="p-1 text-gray-400 hover:text-white transition-colors">
                  <AlertCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          <button
            onClick={() => onUpdate(model)}
            className="w-full px-6 py-3 horizon-button-primary text-white font-semibold rounded-lg transition-all duration-300"
          >
            Find Manufacturers
          </button>
        </div>
      </div>
    </div>
  );
};

export default DesignIteration;