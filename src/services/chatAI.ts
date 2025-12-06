import { ArchitecturalModel } from '../types/architectural';
import { CalculatedProperties } from './cadPropertyCalculator';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class ChatAIService {
  private supabaseUrl: string;
  private supabaseAnonKey: string;

  constructor() {
    this.supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
    this.supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';
    
    if (!this.supabaseUrl) {
      console.warn('VITE_SUPABASE_URL not found, chat AI functionality will be limited');
    }
  }

  /**
   * Generate a smart response for the completion page assistant
   */
  async generateSmartResponse(
    userMessage: string, 
    model: ArchitecturalModel | null,
    calculatedProperties?: CalculatedProperties | null,
    chatHistory: Array<{type: string, message: string}> = []
  ): Promise<string> {
    try {
      if (!this.supabaseUrl) {
        return this.getFallbackResponse(userMessage, model);
      }

      // Extract product context
      const productName = this.extractProductName(model);
      const productSpecs = this.extractProductSpecs(model, calculatedProperties);
      
      // Build context for AI
      const systemPrompt = this.buildSystemPrompt(productName, productSpecs);
      const userContext = this.buildUserContext(userMessage, model, calculatedProperties);
      
      // Recent chat history for context (last 3 messages)
      const recentHistory = chatHistory.slice(-6); // Last 3 exchanges
      
      const messages: ChatMessage[] = [
        { role: 'system', content: systemPrompt },
        ...recentHistory.map(msg => ({
          role: msg.type === 'user' ? 'user' as const : 'assistant' as const,
          content: msg.message
        })),
        { role: 'user', content: userContext }
      ];

      // Try OpenAI first
      try {
        const response = await this.callOpenAI(messages);
        const content = response.choices?.[0]?.message?.content;
        
        if (content) {
          console.log('✅ OpenAI chat response generated');
          return content;
        }
      } catch (openaiError) {
        console.warn('OpenAI failed, trying Gemini:', openaiError);
      }

      // Fallback to Gemini
      try {
        const response = await this.callGemini(messages);
        const content = response.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (content) {
          console.log('✅ Gemini chat response generated');
          return content;
        }
      } catch (geminiError) {
        console.warn('Gemini also failed:', geminiError);
      }

      // Final fallback
      return this.getFallbackResponse(userMessage, model);

    } catch (error) {
      console.error('❌ Chat AI error:', error);
      return this.getFallbackResponse(userMessage, model);
    }
  }

  /**
   * Build system prompt with product context
   */
  private buildSystemPrompt(productName: string, productSpecs: any): string {
    return `You are an AI assistant helping users with their ${productName} prototype. 

Product Context:
- Product: ${productName}
- Current Specifications: ${productSpecs}

Your role:
- Answer questions about the design, manufacturing, and optimization of this product
- Provide helpful suggestions for improvements or alternatives
- Explain technical concepts in an accessible way
- Help users understand next steps in their product development journey
- If asked about navigation, remind them they can use the step buttons at the top

Keep responses concise, helpful, and focused on actionable advice. Use a friendly, professional tone.`;
  }

  /**
   * Build user context with current state
   */
  private buildUserContext(userMessage: string, model: ArchitecturalModel | null, calculatedProperties?: CalculatedProperties | null): string {
    let context = `User Question: ${userMessage}\n\n`;
    
    if (calculatedProperties) {
      context += `Current Design Properties:
- Volume: ${calculatedProperties.volume.displayValue}
- Surface Area: ${calculatedProperties.specifications.surfaceAreaDisplay}
- Manufacturing Cost: ${calculatedProperties.manufacturing.costDisplay}
- Material: ${calculatedProperties.manufacturing.materialsUsed || 'PLA'}
- Complexity: ${calculatedProperties.specifications.complexity}\n\n`;
    }
    
    if (model?.type) {
      context += `Current Model Type: ${model.type}\n\n`;
    }
    
    return context;
  }

  /**
   * Extract product name from model
   */
  private extractProductName(model: ArchitecturalModel | null): string {
    if (!model) return 'your product';
    
    // Try various ways to get the product name
    if (model.productSpecs?.name) return model.productSpecs.name;
    if (model.productSpecs?.title) return model.productSpecs.title;
    if (model.name) return model.name;
    if (model.cadModel?.prompt) {
      // Extract product name from prompt
      const match = model.cadModel.prompt.match(/(?:design|create|make|build)\s+(?:a\s+)?(.+?)(?:\s+(?:that|which|with|for)|$)/i);
      if (match) return match[1].trim();
    }
    
    return 'your product';
  }

  /**
   * Extract product specifications
   */
  private extractProductSpecs(model: ArchitecturalModel | null, calculatedProperties?: CalculatedProperties | null): string {
    if (!model && !calculatedProperties) return 'No specifications available';
    
    const specs: string[] = [];
    
    if (model?.productSpecs) {
      if (model.productSpecs.specifications?.dimensions) {
        const dims = model.productSpecs.specifications.dimensions;
        specs.push(`Dimensions: ${dims.length}×${dims.width}×${dims.height}mm`);
      }
      if (model.productSpecs.manufacturing?.materials) {
        specs.push(`Materials: ${model.productSpecs.manufacturing.materials.join(', ')}`);
      }
      if (model.productSpecs.description) specs.push(`Purpose: ${model.productSpecs.description}`);
    }
    
    if (calculatedProperties) {
      specs.push(`Volume: ${calculatedProperties.volume.displayValue}`);
      specs.push(`Surface Area: ${calculatedProperties.specifications.surfaceAreaDisplay}`);
      specs.push(`Estimated Cost: ${calculatedProperties.manufacturing.costDisplay}`);
    }
    
    return specs.length > 0 ? specs.join(', ') : 'Basic prototype specifications';
  }

  /**
   * Call OpenAI API via Supabase Edge Function
   */
  private async callOpenAI(messages: ChatMessage[]): Promise<any> {
    const response = await fetch(`${this.supabaseUrl}/functions/v1/chat-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseAnonKey}`
      },
      body: JSON.stringify({
        provider: 'openai',
        messages,
        temperature: 0.7,
        maxTokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`OpenAI API error: ${response.status} - ${errorData?.error || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Call Gemini API via Supabase Edge Function
   */
  private async callGemini(messages: ChatMessage[]): Promise<any> {
    const response = await fetch(`${this.supabaseUrl}/functions/v1/chat-ai`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.supabaseAnonKey}`
      },
      body: JSON.stringify({
        provider: 'gemini',
        messages,
        temperature: 0.7,
        maxTokens: 500
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(`Gemini API error: ${response.status} - ${errorData?.error || 'Unknown error'}`);
    }

    return response.json();
  }

  /**
   * Provide fallback responses when AI is unavailable
   */
  private getFallbackResponse(userMessage: string, model: ArchitecturalModel | null): string {
    const productName = this.extractProductName(model);
    
    // Simple keyword-based responses
    const message = userMessage.toLowerCase();
    
    if (message.includes('cost') || message.includes('price') || message.includes('expensive')) {
      return `The cost of your ${productName} depends on materials, complexity, and production volume. For prototyping, 3D printing is typically the most cost-effective option. Consider optimizing the design to reduce material usage.`;
    }
    
    if (message.includes('material') || message.includes('plastic') || message.includes('metal')) {
      return `For ${productName}, PLA plastic is great for prototyping due to its ease of use and low cost. For production, consider ABS for durability, PETG for chemical resistance, or metal for high-strength applications.`;
    }
    
    if (message.includes('improve') || message.includes('optimize') || message.includes('better')) {
      return `To improve your ${productName}, consider: 1) Reducing material usage for cost savings, 2) Adding structural reinforcements where needed, 3) Optimizing for your manufacturing method, 4) Testing with users for feedback.`;
    }
    
    if (message.includes('manufacture') || message.includes('production') || message.includes('make')) {
      return `For manufacturing your ${productName}, start with 3D printing for prototypes. For larger quantities, consider injection molding, CNC machining, or other production methods based on your material and volume requirements.`;
    }
    
    if (message.includes('next') || message.includes('step') || message.includes('what now')) {
      return `Great question! Use the navigation steps at the top to explore different aspects of your ${productName}. You can view the 3D model, run patent searches, or connect with manufacturers.`;
    }
    
    // Default response
    return `I'd love to help you with your ${productName}! While I'm having trouble connecting to my AI services right now, I can still provide basic guidance. Try asking about costs, materials, manufacturing options, or next steps in your product development.`;
  }
}

// Export singleton instance
export const chatAI = new ChatAIService(); 