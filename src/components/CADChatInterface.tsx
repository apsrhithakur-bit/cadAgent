import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef, useCallback } from 'react';
import { 
  Send, 
  Loader2, 
  Undo2, 
  RotateCcw, 
  MessageSquare, 
  User, 
  Bot,
  Clock,
  CheckCircle,
  AlertCircle,
  Trash2,
  History,
  Zap
} from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { cadPropertyCalculator, type CalculatedProperties } from '../services/cadPropertyCalculator';
import { getModelProductName, extractProductName } from '../utils/productNameExtractor';

export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system' | 'quick-tool';
  content: string;
  timestamp: Date;
  status: 'sending' | 'completed' | 'failed';
  modelSnapshot?: ArchitecturalModel; // Store model state for undo
  toolName?: string; // For quick tool messages
}

export interface ModelVersion {
  id: string;
  model: ArchitecturalModel;
  timestamp: Date;
  description: string;
  chatMessageId: string;
}

interface CADChatInterfaceProps {
  model: ArchitecturalModel | null;
  onModelUpdate: (model: ArchitecturalModel) => void;
  onPropertiesCalculated?: (properties: CalculatedProperties) => void;
  className?: string;
}

export interface CADChatInterfaceRef {
  addQuickToolMessage: (toolName: string, description: string) => string;
  addAssistantMessage: (content: string) => string;
  completeQuickToolAction: (content: string, model: ArchitecturalModel, toolName: string) => void;
}

export const CADChatInterface = forwardRef<CADChatInterfaceRef, CADChatInterfaceProps>(({
  model,
  onModelUpdate,
  onPropertiesCalculated,
  className = ''
}, ref) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      type: 'system',
      content: '🎯 **CAD Assistant Ready**\n\nI can help you modify your CAD model. Try commands like:\n• "Make it 20% lighter"\n• "Optimize for 3D printing"\n• "Change dimensions to 150×100×50mm"\n• "Add rounded corners"',
      timestamp: new Date(),
      status: 'completed'
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [modelVersions, setModelVersions] = useState<ModelVersion[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Store initial model version
  useEffect(() => {
    if (model && modelVersions.length === 0) {
      const initialVersion: ModelVersion = {
        id: 'initial',
        model,
        timestamp: new Date(),
        description: 'Original model',
        chatMessageId: 'welcome'
      };
      setModelVersions([initialVersion]);
    }
  }, [model, modelVersions.length]);

  const addMessage = (message: Omit<ChatMessage, 'id' | 'timestamp'>) => {
    const newMessage: ChatMessage = {
      ...message,
      id: `msg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  };

  const updateMessage = (messageId: string, updates: Partial<ChatMessage>) => {
    setMessages(prev => prev.map(msg => 
      msg.id === messageId ? { ...msg, ...updates } : msg
    ));
  };

  // Function to recalculate properties when model is updated
  const recalculateProperties = useCallback(async (updatedModel: ArchitecturalModel) => {
    if (!updatedModel.cadModel?.gltfUrl || !onPropertiesCalculated) return;
    
    try {
      console.log('🔄 Recalculating properties for updated model...');
      
      // Use the CAD property calculator to get updated volume and properties
      const newProperties = await cadPropertyCalculator.calculatePropertiesFromGLTF(
        updatedModel.cadModel.gltfUrl,
        updatedModel.cadModel.properties?.complexity || 'moderate'
      );
      
      console.log('📊 New properties calculated:', newProperties);
      
      // Update the parent component with new properties
      onPropertiesCalculated(newProperties);
      
    } catch (error) {
      console.error('❌ Failed to recalculate properties:', error);
    }
  }, [onPropertiesCalculated]);

  // Expose methods for quick tool integration
  useImperativeHandle(ref, () => ({
    addQuickToolMessage: (toolName: string, description: string) => {
      return addMessage({
        type: 'quick-tool',
        content: `��️ **Used Quick Tool: ${toolName}**\n\n${description}`,
        status: 'completed',
        toolName
      });
    },
    
    addAssistantMessage: (content: string) => {
      return addMessage({
        type: 'assistant',
        content,
        status: 'sending'
      });
    },
    
    completeQuickToolAction: (content: string, updatedModel: ArchitecturalModel, toolName: string) => {
      // Add success message
      const messageId = addMessage({
        type: 'assistant',
        content,
        status: 'completed',
        modelSnapshot: updatedModel
      });

      // Store model version for undo
      const newVersion: ModelVersion = {
        id: `version-${Date.now()}`,
        model: updatedModel,
        timestamp: new Date(),
        description: `Quick Tool: ${toolName}`,
        chatMessageId: messageId
      };
      setModelVersions(prev => [...prev, newVersion]);

      // Recalculate properties for the updated model
      recalculateProperties(updatedModel);
    }
  }), [addMessage, recalculateProperties]);

  const handleSendMessage = async () => {
    if (!inputText.trim() || !model || isGenerating) return;

    const userMessageId = addMessage({
      type: 'user',
      content: inputText.trim(),
      status: 'completed'
    });

    const assistantMessageId = addMessage({
      type: 'assistant',
      content: '🔄 Processing your request...',
      status: 'sending'
    });

    const userPrompt = inputText.trim();
    setInputText('');
    setIsGenerating(true);

    try {
      // Import the CAD AI service and process the modification
      const { cadAI } = await import('../services/cadAI');
      
      // Extract product name using utility function
      const productName = getModelProductName(model);
      
      // Create modification prompt using template
      const modificationPrompt = `Design a ${productName} that is ${userPrompt}`;
      
      updateMessage(assistantMessageId, {
        content: `🚀 Generating: "${modificationPrompt}"`
      });

      // Generate modified model
      const modifiedModelData = await cadAI.generateAndWaitForCAD({
        prompt: modificationPrompt,
        outputFormat: 'gltf',
        units: 'mm'
      });

      if (!modifiedModelData) {
        throw new Error('Failed to generate modified model');
      }

      // Create updated model
      const updatedModel: ArchitecturalModel = {
        ...model,
        id: `${model.id}-chat-${Date.now()}`,
        name: `${model.name} (Modified)`,
        description: modificationPrompt,
        cadModel: {
          ...model.cadModel!,
          id: modifiedModelData.id || `cad-${Date.now()}`,
          prompt: modificationPrompt,
          originalPrompt: model.cadModel?.originalPrompt || model.cadModel?.prompt || model.description || model.name || 'mechanical part', // Preserve original
          gltfUrl: modifiedModelData.gltfUrl || '',
          thumbnailUrl: modifiedModelData.thumbnailUrl || '',
          formats: modifiedModelData.formats || {},
          properties: modifiedModelData.properties || model.cadModel?.properties || {
            dimensions: { width: 100, height: 100, depth: 100 },
            volume: 100000,
            surfaceArea: 60000,
            complexity: 'moderate' as const
          }
        }
      };

      // Store model version for undo
      const newVersion: ModelVersion = {
        id: `version-${Date.now()}`,
        model: updatedModel,
        timestamp: new Date(),
        description: userPrompt,
        chatMessageId: assistantMessageId
      };
      setModelVersions(prev => [...prev, newVersion]);

      // Update the model
      onModelUpdate(updatedModel);

      // Recalculate properties for the updated model
      await recalculateProperties(updatedModel);

      // Update assistant message with success
      updateMessage(assistantMessageId, {
        content: `✅ **Model updated successfully!**\n\nApplied: ${userPrompt}\n\n*Your CAD model has been regenerated with the requested changes.*`,
        status: 'completed',
        modelSnapshot: updatedModel
      });

    } catch (error) {
      console.error('❌ Chat modification error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      updateMessage(assistantMessageId, {
        content: `❌ **Error applying changes**\n\n${errorMessage}\n\nPlease try rephrasing your request or use simpler modifications.`,
        status: 'failed'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleUndo = () => {
    if (modelVersions.length <= 1) return;

    // Remove the last version and revert to previous
    const newVersions = modelVersions.slice(0, -1);
    const previousVersion = newVersions[newVersions.length - 1];
    
    setModelVersions(newVersions);
    onModelUpdate(previousVersion.model);

    // Add system message about undo
    addMessage({
      type: 'system',
      content: `↩️ **Undid changes**\n\nReverted to: ${previousVersion.description}`,
      status: 'completed'
    });
  };

  const handleRevertToVersion = (version: ModelVersion) => {
    // Remove all versions after this one
    const versionIndex = modelVersions.findIndex(v => v.id === version.id);
    const newVersions = modelVersions.slice(0, versionIndex + 1);
    
    setModelVersions(newVersions);
    onModelUpdate(version.model);
    setShowHistory(false);

    // Add system message about revert
    addMessage({
      type: 'system',
      content: `🔄 **Reverted to version**\n\n${version.description} (${version.timestamp.toLocaleTimeString()})`,
      status: 'completed'
    });
  };

  const clearChat = () => {
    setMessages([{
      id: 'welcome-new',
      type: 'system',
      content: '🎯 **Chat cleared**\n\nReady for new modifications!',
      timestamp: new Date(),
      status: 'completed'
    }]);
  };

  const formatMessageContent = (content: string) => {
    // Simple markdown-like formatting
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/•/g, '&bull;')
      .split('\n').map((line, i) => (
        <div key={i} dangerouslySetInnerHTML={{ __html: line || '<br/>' }} />
      ));
  };

  const getMessageIcon = (message: ChatMessage) => {
    if (message.type === 'user') return <User className="w-4 h-4 text-white" />;
    if (message.type === 'quick-tool') return <Zap className="w-4 h-4 text-white" />;
    if (message.type === 'system') return <Bot className="w-4 h-4 text-white" />;
    return <Bot className="w-4 h-4 text-white" />;
  };

  const getMessageStyle = (message: ChatMessage) => {
    if (message.type === 'user') return 'bg-cyan-600 text-white';
    if (message.type === 'quick-tool') return 'bg-gradient-to-r from-yellow-600 to-orange-600 text-white border border-yellow-500';
    if (message.type === 'system') return 'cosmic-panel text-white';
    return 'cosmic-panel text-gray-200';
  };



  return (
    <div className={`flex flex-col h-full bg-gray-900 border border-gray-700 rounded-xl ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-cyan-400" />
          <h3 className="text-white font-medium">CAD Assistant</h3>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
            title="Version History"
          >
            <History className="w-4 h-4" />
          </button>
          <button
            onClick={handleUndo}
            disabled={modelVersions.length <= 1}
            className="p-2 text-gray-400 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors rounded-lg hover:bg-white/10"
            title="Undo Last Change"
          >
            <Undo2 className="w-4 h-4" />
          </button>
          <button
            onClick={clearChat}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-white/10"
            title="Clear Chat"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Version History Panel */}
      {showHistory && (
        <div className="p-4 border-b border-gray-700 cosmic-panel/50">
          <h4 className="text-white text-sm font-medium mb-3">Version History</h4>
          <div className="space-y-2 max-h-32 overflow-y-auto">
            {modelVersions.map((version, index) => (
              <div 
                key={version.id}
                className="flex items-center justify-between p-2 cosmic-panel rounded-lg"
              >
                <div className="flex-1">
                  <div className="text-sm text-white">{version.description}</div>
                  <div className="text-xs text-gray-400">{version.timestamp.toLocaleTimeString()}</div>
                </div>
                {index > 0 && (
                  <button
                    onClick={() => handleRevertToVersion(version)}
                    className="px-3 py-1 text-xs bg-cyan-600 text-white rounded hover:bg-cyan-700 transition-colors"
                  >
                    Revert
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.type === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.type !== 'user' && (
              <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.type === 'quick-tool' 
                  ? 'bg-gradient-to-r from-yellow-500 to-orange-500' 
                  : 'horizon-button-primary'
              }`}>
                {getMessageIcon(message)}
              </div>
            )}
            
            <div className={`max-w-[80%] ${message.type === 'user' ? 'order-1' : 'order-2'}`}>
              <div className={`p-3 rounded-xl ${getMessageStyle(message)}`}>
                <div className="text-sm">
                  {formatMessageContent(message.content)}
                </div>
                
                <div className="flex items-center gap-2 mt-2 text-xs opacity-70">
                  <Clock className="w-3 h-3" />
                  {message.timestamp.toLocaleTimeString()}
                  
                  {message.status === 'sending' && (
                    <Loader2 className="w-3 h-3 animate-spin ml-1" />
                  )}
                  {message.status === 'completed' && (
                    <CheckCircle className="w-3 h-3 ml-1" />
                  )}
                  {message.status === 'failed' && (
                    <AlertCircle className="w-3 h-3 ml-1 text-red-400" />
                  )}
                </div>
              </div>
            </div>

            {message.type === 'user' && (
              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <User className="w-4 h-4 text-gray-300" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="p-4 border-t border-gray-700">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Describe how you want to modify your CAD model..."
            className="flex-1 p-3 cosmic-panel border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:border-cyan-400 min-h-[80px] max-h-32"
            rows={2}
            disabled={isGenerating}
          />
          <button
            onClick={handleSendMessage}
            disabled={!inputText.trim() || isGenerating}
            className="px-4 py-3 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isGenerating ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        
        {/* Quick suggestions */}
        {!isGenerating && messages.length <= 2 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[
              'Make it lighter',
              'Optimize for 3D printing',
              'Add mounting holes',
              'Reduce material usage',
              'Round all edges'
            ].map((suggestion) => (
              <button
                key={suggestion}
                onClick={() => setInputText(suggestion)}
                className="px-3 py-1 text-xs cosmic-panel text-gray-300 rounded-full hover:bg-gray-700 transition-colors text-center"
              >
                {suggestion}
              </button>
            ))}
          </div>
        )}


      </div>
    </div>
  );
}); 