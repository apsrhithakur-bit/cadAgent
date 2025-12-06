import { supabase } from '../lib/supabase';

// Pica configuration for prompt enhancement
interface PicaConfig {
  secretKey: string;
  openaiConnectionKey: string;
}

const getPicaConfig = (): PicaConfig => ({
  secretKey: import.meta.env.VITE_PICA_SECRET_KEY || '',
  openaiConnectionKey: import.meta.env.VITE_PICA_OPENAI_CONNECTION_KEY || ''
});

  // Use Supabase Edge Function as proxy to AgenticadML API
const getSupabaseFunction = () => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  
  return {
    url: `${supabaseUrl}/functions/v1/zoo-text-to-cad`,
    headers: {
      'Authorization': `Bearer ${supabaseAnonKey}`,
      'Content-Type': 'application/json'
    }
  };
};

const getAuthenticatedSupabaseFunction = async (functionName: string) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const { data: { session }, error } = await supabase.auth.getSession();
  
  if (error || !session?.access_token) {
    throw new Error('User not authenticated');
  }
  
  return {
    url: `${supabaseUrl}/functions/v1/${functionName}`,
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    }
  };
};

export interface CADGenerationRequest {
  prompt: string;
  outputFormat?: 'gltf' | 'stl' | 'obj' | 'ply' | 'step' | 'fbx';
  units?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  scale?: number;
}

export interface CADGenerationResponse {
  id: string;
  status: 'queued' | 'in_progress' | 'completed' | 'failed';
  prompt: string;
  outputs?: {
    gltf?: string;
    glb?: string;
    model?: string;
    file?: string;
    thumbnail?: string;
    preview?: string;
    image?: string;
    // Zoo API specific output keys
    'source.gltf'?: string;
    'source.glb'?: string;
    'source.obj'?: string;
    'source.stl'?: string;
    [key: string]: string | undefined; // Allow any string key for flexibility
  };
  output?: {
    gltf?: string;
    glb?: string;
    model?: string;
    file?: string;
    thumbnail?: string;
    preview?: string;
    image?: string;
    'source.gltf'?: string;
    'source.glb'?: string;
    [key: string]: string | undefined;
  };
  // Additional possible response fields from Zoo API
  gltf?: string;
  model_url?: string;
  download_url?: string;
  thumbnail?: string;
  result?: {
    gltf?: string;
    model_url?: string;
    download_url?: string;
    file?: string;
    [key: string]: string | undefined;
  };
  error?: string;
  created_at: string;
  completed_at?: string;
}

export interface CADModel {
  id: string;
  prompt: string;
  originalPrompt?: string;
  enhancementInfo?: {
    source: string;
    confidence: number;
    wasEnhanced: boolean;
  };
  gltfUrl: string;
  thumbnailUrl?: string;
  formats: Record<string, string>;
  manufacturingCost?: {
    material: string;
    volume: number;
    cost: number;
    currency: string;
  };
  properties: {
    dimensions: {
      width: number;
      height: number;
      depth: number;
    };
    volume: number;
    surfaceArea: number;
    complexity: 'simple' | 'moderate' | 'complex';
  };
}

export interface CADExportOptions {
  format: 'stl' | 'obj' | 'ply' | 'step' | 'fbx' | 'gltf';
  units: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  quality: 'low' | 'medium' | 'high';
  scale?: number;
  // NEW FIX: Add viewer scale option
  useViewerScale?: boolean;
}

export class CADAIService {
  private promptHistory: Array<{prompt: string; success: boolean; timestamp: number; errorMessage?: string}> = [];
  
  private async addToPromptHistory(prompt: string, success: boolean, errorMessage?: string, confidence?: number, source?: string) {
    // Add to local memory for immediate access
    this.promptHistory.unshift({ prompt, success, timestamp: Date.now(), errorMessage });
    if (this.promptHistory.length > 100) this.promptHistory = this.promptHistory.slice(0, 100);
    console.log(`📚 Added to prompt history: ${success ? '✅' : '❌'} "${prompt}"`);
    
    // Save to backend database
    try {
      const { url, headers } = await getAuthenticatedSupabaseFunction('prompt-history');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
      // Convert confidence to integer (0-100) for database
      let confidenceInt = undefined;
      if (confidence !== undefined && confidence !== null) {
        if (confidence >= 0 && confidence <= 1) {
          // Decimal format (0.0-1.0) - convert to integer
          confidenceInt = Math.round(confidence * 100);
        } else if (confidence >= 0 && confidence <= 100) {
          // Already integer format (0-100) - use as is
          confidenceInt = Math.round(confidence);
        } else {
          console.warn('⚠️ Invalid confidence value:', confidence, '- using default 50');
          confidenceInt = 50; // Default fallback
        }
      }
      
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'save',
          prompt,
          success,
          error_message: errorMessage,
          confidence: confidenceInt,
          source
        })
      });
      
      if (!response.ok) {
        console.warn('⚠️ Failed to save prompt to backend:', response.statusText);
      } else {
        console.log('✅ Prompt saved to backend database');
      }
    } catch (error) {
      console.warn('⚠️ Backend saving failed:', error);
      // Continue execution - local memory backup is still available
    }
  }
  
  private async findSimilarSuccessfulPrompts(failedPrompt: string, count: number = 3): Promise<string[]> {
    try {
      // Try to get similar prompts from backend first
      const { url, headers } = await getAuthenticatedSupabaseFunction('prompt-history');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          action: 'find_similar',
          prompt: failedPrompt,
          limit: count
        })
      });
      
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data.length > 0) {
          console.log(`📚 Found ${result.data.length} similar prompts from backend`);
          return result.data.map((entry: any) => entry.prompt);
        }
      }
    } catch (error) {
      console.warn('⚠️ Backend similarity search failed, using local fallback:', error);
    }
    
    // Fallback to local memory
    const successful = this.promptHistory.filter(e => e.success).map(e => e.prompt);
    if (successful.length === 0) return ['design a rectangular bracket 50mm long with mounting holes'];
    const words = failedPrompt.toLowerCase().split(/\s+/);
    const scored = successful.map(p => ({
      prompt: p,
      score: words.filter(w => p.toLowerCase().includes(w)).length / words.length
    }));
    return scored.sort((a, b) => b.score - a.score).slice(0, count).map(s => s.prompt);
  }

  /**
   * Clean product name by removing prompt prefixes like "design a", "create a", etc.
   * Only keep the actual product description
   */
  static cleanProductName(prompt: string): string {
    if (!prompt || typeof prompt !== 'string') {
      return 'CAD Model';
    }
    
    let cleaned = prompt.trim();
    
    // Remove common prompt prefixes (case insensitive)
    const prefixesToRemove = [
      /^design\s+a?\s*/i,
      /^create\s+a?\s*/i,
      /^make\s+a?\s*/i,
      /^build\s+a?\s*/i,
      /^generate\s+a?\s*/i,
      /^model\s+a?\s*/i,
      /^i\s+want\s+a?\s*/i,
      /^i\s+need\s+a?\s*/i,
      /^please\s+create\s+a?\s*/i,
      /^please\s+design\s+a?\s*/i,
      /^please\s+make\s+a?\s*/i,
      /^can\s+you\s+create\s+a?\s*/i,
      /^can\s+you\s+design\s+a?\s*/i,
      /^can\s+you\s+make\s+a?\s*/i,
    ];
    
    for (const prefix of prefixesToRemove) {
      cleaned = cleaned.replace(prefix, '');
    }
    
    // Remove leading/trailing articles if they remain
    cleaned = cleaned.replace(/^(a|an|the)\s+/i, '');
    
    // Capitalize first letter and clean up
    cleaned = cleaned.trim();
    if (cleaned.length > 0) {
      cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    }
    
    // Fallback if nothing meaningful remains
    if (!cleaned || cleaned.length < 2) {
      return 'CAD Model';
    }
    
    return cleaned;
  }
  
  /**
   * Enhanced error-based prompt recovery using AI enhancement with error context
   */
  private async enhancePromptWithErrorContext(originalPrompt: string, errorMessage: string, retryCount: number = 0): Promise<{ enhancedPrompt: string; confidence: number; source: 'ai-error-recovery' }> {
    const maxAIAttempts = 3;
    
    for (let aiAttempt = 1; aiAttempt <= maxAIAttempts; aiAttempt++) {
      try {
        console.log(`🔧 AI error recovery attempt ${aiAttempt}/${maxAIAttempts} for prompt:`, originalPrompt);
        console.log('📋 Error context:', errorMessage);
        
        const aiEnhancement = await this.callOpenAI([
          {
            role: 'system',
            content: `You are a CAD prompt optimizer for Zoo's Text-to-CAD API. Your job is to fix prompts that failed.

ERROR CONTEXT: "${errorMessage}"

ZOO API FORMAT REQUIREMENTS:
- Start with action words like "design", "create", "make", "build"
- Be specific about geometry: shapes, dimensions, features
- Use engineering terminology: bracket, plate, housing, mount, etc.
- Include material hints: metal, plastic, aluminum, steel
- Keep prompts clear and concise (ideally 30-80 characters)
- Avoid artistic or abstract descriptions

COMMON ERROR FIXES:
- "422 Unprocessable Entity" → Simplify language, add specific dimensions, use basic shapes
- "400 Bad Request" → Make more specific about what object to design
- Text-to-CAD server errors → Focus on manufacturable mechanical parts

GOOD EXAMPLES:
- "design aluminum mounting bracket 50mm x 30mm with 4 holes"
- "create rectangular steel plate 100x50x5mm with center hole"
- "design plastic housing 80mm cube with ventilation slots"

Fix the original prompt while keeping its core intent. Respond with ONLY the improved prompt.`
          },
          {
            role: 'user',
            content: `Original failed prompt: "${originalPrompt}"\n\nError: ${errorMessage}\n\nProvide a fixed version:`
          }
        ]);
        
        if (aiEnhancement && aiEnhancement.choices && aiEnhancement.choices[0] && aiEnhancement.choices[0].message && aiEnhancement.choices[0].message.content) {
          const enhancedPrompt = aiEnhancement.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
          console.log(`✅ AI attempt ${aiAttempt} successful:`, enhancedPrompt);
          
          // More lenient validation - just check basic requirements
          const isValidFormat = (
            enhancedPrompt.length >= 10 && // Minimum length
            enhancedPrompt.length <= 120 && // More generous max length
            /^(design|create|make|build|generate)/i.test(enhancedPrompt) && // Starts with action word
            enhancedPrompt.trim().length > 0 && // Not empty
            !enhancedPrompt.includes('```') && // No code blocks
            !enhancedPrompt.includes('\n') // Single line
          );
          
          if (isValidFormat) {
            return {
              enhancedPrompt,
              confidence: Math.max(90 - (aiAttempt - 1) * 10, 70), // Higher confidence for earlier attempts
              source: 'ai-error-recovery'
            };
          } else {
            console.warn(`⚠️ AI attempt ${aiAttempt} validation failed:`, { 
              prompt: enhancedPrompt, 
              length: enhancedPrompt.length, 
              hasActionWord: /^(design|create|make|build|generate)/i.test(enhancedPrompt),
              isValidFormat
            });
            
            if (aiAttempt === maxAIAttempts) {
              throw new Error(`AI response doesn't follow Zoo API format after ${maxAIAttempts} attempts`);
            }
            // Continue to next attempt
            continue;
          }
        }
        
        throw new Error(`AI response was empty or malformed on attempt ${aiAttempt}`);
        
      } catch (error) {
        console.warn(`❌ AI attempt ${aiAttempt}/${maxAIAttempts} failed:`, error);
        
        if (aiAttempt === maxAIAttempts) {
          // All AI attempts failed, try other recovery methods
          break;
        }
        // Continue to next AI attempt
      }
    }
    
    // After AI attempts failed, try similar prompts
    try {
      console.log('🔄 AI attempts exhausted, trying similar prompt matching...');
      const similarPrompts = await this.findSimilarSuccessfulPrompts(originalPrompt, 3);
      if (similarPrompts.length > 0) {
        const bestSimilar = similarPrompts[0];
        console.log(`📚 Using similar successful prompt: "${bestSimilar}"`);
        return {
          enhancedPrompt: bestSimilar,
          confidence: 75,
          source: 'ai-error-recovery'
        };
      }
    } catch (similarError) {
      console.warn('❌ Similar prompts fallback failed:', similarError);
    }
    
    // FINAL FALLBACK: Rule-based error recovery
    console.log('🔄 Using final fallback - rule-based recovery');
    return this.ruleBasedErrorRecovery(originalPrompt, errorMessage);
  }

  /**
   * Zoo API specific prompt enhancement for 400 Bad Request errors
   */
  private enhanceForZooAPI(originalPrompt: string): { enhancedPrompt: string; confidence: number } {
    console.log('🎯 Applying Zoo API specific enhancements for:', originalPrompt);
    
    let enhanced = originalPrompt.toLowerCase().trim();
    
    // Ensure it starts with "design"
    if (!enhanced.startsWith('design ')) {
      enhanced = enhanced.replace(/^(create|make|build)\s+/, '');
      enhanced = enhanced.replace(/^(a|an)\s+/, '');
      enhanced = 'design ' + enhanced;
    }
    
    // Fix the specific "frustrum with a long noose" issue
    if (enhanced.includes('frustrum') || enhanced.includes('frustum')) {
      if (enhanced.includes('noose') || enhanced.includes('nose')) {
        // "noose" is ambiguous - convert to clear geometric term
        enhanced = enhanced.replace(/\b(noose|nose)\b/g, 'tapered section');
        enhanced = enhanced.replace(/\blong\b/g, 'extended');
        
        // Make it more geometrically specific
        enhanced = enhanced.replace(/frustrum|frustum/, 'truncated cone');
        
        // Add dimensions for clarity
        if (!/\d+\s*(mm|cm|m)/.test(enhanced)) {
          enhanced += ' with 50mm height and 30mm top diameter';
        }
        
        console.log('✅ Fixed frustrum/noose ambiguity:', enhanced);
        return { enhancedPrompt: enhanced, confidence: 0.9 };
      }
    }
    
    // General Zoo API improvements
    const improvements = [
      // Replace ambiguous terms with clear geometric terms
      { from: /\b(noose|loop|string)\b/g, to: 'circular opening' },
      { from: /\blong\b/g, to: 'extended' },
      { from: /\bshort\b/g, to: 'compact' },
      { from: /\bthing\b/g, to: 'component' },
      { from: /\bstuff\b/g, to: 'material' },
      
      // Add geometric clarity
      { from: /\bround\b/g, to: 'cylindrical' },
      { from: /\bsquare\b/g, to: 'rectangular' },
      { from: /\bflat\b/g, to: 'planar' },
      
      // Fix common typos that confuse the API
      { from: /\bfrustrum\b/g, to: 'truncated cone' },
      { from: /\bcylender\b/g, to: 'cylinder' },
      { from: /\brectange\b/g, to: 'rectangle' }
    ];
    
    improvements.forEach(({ from, to }) => {
      enhanced = enhanced.replace(from, to);
    });
    
    // Add basic dimensions if missing for geometric clarity
    if (!/\d+\s*(mm|cm|m|inch)/.test(enhanced) && 
        (enhanced.includes('cone') || enhanced.includes('cylinder') || enhanced.includes('box'))) {
      enhanced += ' with 50mm dimensions';
    }
    
    // Add material specification if missing (helps Zoo API understand it's a physical object)
    if (!/\b(plastic|metal|steel|aluminum|wood|material)\b/.test(enhanced)) {
      enhanced += ' made of plastic';
    }
    
         console.log('✅ Zoo API enhancement complete:', enhanced);
     return { enhancedPrompt: enhanced, confidence: 0.85 };
   }
   
   /**
    * Rule-based error recovery as fallback when AI enhancement fails
    */
  private ruleBasedErrorRecovery(originalPrompt: string, errorMessage: string): { enhancedPrompt: string; confidence: number; source: 'ai-error-recovery' } {
    console.log('🔧 Using rule-based error recovery');
    
    let recovered = originalPrompt.toLowerCase().trim();
    
    // Remove problematic terms based on error type
    if (errorMessage.includes('400') || errorMessage.includes('Bad Request')) {
      console.log('🔧 Handling 400 Bad Request error - using Zoo verified pattern');
      
      // Extract intent and map to Zoo verified pattern
      const coreObject = recovered.replace(/^design\s+a?\s*/i, '').replace(/with.*$/, '').trim();
      
      if (/bracket|mount|holder/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a rectangular bracket with mounting holes',
          confidence: 90,
          source: 'ai-error-recovery'
        };
      } else if (/plate|panel|board/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a rectangular plate with 4 holes near corners',
          confidence: 90,
          source: 'ai-error-recovery'
        };
      } else if (/cylinder|tube|pipe|housing/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a cylindrical bearing housing',
          confidence: 90,
          source: 'ai-error-recovery'
        };
      } else if (/bolt|screw|fastener/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a hexagonal bolt fastener',
          confidence: 90,
          source: 'ai-error-recovery'
        };
      }
      
      // Default to most reliable Zoo pattern
      return {
        enhancedPrompt: 'design a rectangular bracket with mounting holes',
        confidence: 75,
        source: 'ai-error-recovery'
      };
    }
    
    if (errorMessage.includes('422') || errorMessage.includes('Unprocessable')) {
      console.log('🔧 Handling 422 Unprocessable error - using simplest Zoo patterns');
      
      // For 422 errors, use the most basic, reliable patterns
      const coreObject = recovered.replace(/^design\s+a?\s*/i, '').replace(/with.*$/, '').trim();
      
      // Map to simplest working descriptions (Zoo API best practices - 1-2 sentences max)
      if (/bracket|mount|holder/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a L-shaped bracket',
          confidence: 85,
          source: 'ai-error-recovery'
        };
      } else if (/plate|panel|board/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a rectangular plate with 4 holes',
          confidence: 85,
          source: 'ai-error-recovery'
        };
      } else if (/cylinder|tube|pipe/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a cylindrical tube',
          confidence: 85,
          source: 'ai-error-recovery'
        };
      } else if (/box|case|container/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a rectangular box',
          confidence: 85,
          source: 'ai-error-recovery'
        };
      } else if (/bolt|screw|fastener/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a hexagonal bolt',
          confidence: 85,
          source: 'ai-error-recovery'
        };
      } else if (/bearing|housing/.test(coreObject)) {
        return {
          enhancedPrompt: 'design a cylindrical bearing housing',
          confidence: 85,
          source: 'ai-error-recovery'
        };
      } else {
        // Most reliable fallback for unknown objects
        return {
          enhancedPrompt: 'design a rectangular bracket',
          confidence: 75,
          source: 'ai-error-recovery'
        };
      }
    }
    
    // Default error recovery for other error types
    console.log('🔧 Using generic Zoo pattern for unknown error type');
    return {
      enhancedPrompt: 'design a rectangular bracket with mounting holes',
      confidence: 70,
      source: 'ai-error-recovery'
    };
  }
  
  /**
   * Enhanced prompt enhancement using AgenticadML's proven patterns and user intent mapping
   */
  async enhancePromptForCAD(originalPrompt: string): Promise<{ enhancedPrompt: string; confidence: number; source: 'ai' | 'rules' | 'original' }> {
    try {
      if (!originalPrompt || originalPrompt.trim().length === 0) {
        console.error('❌ Empty prompt provided to enhancePromptForCAD')
        return {
          enhancedPrompt: 'design a plate with 4 holes near each corner and rounded corners',
          confidence: 0.3,
          source: 'rules'
        }
      }

      const trimmedPrompt = originalPrompt.trim()
      console.log('🚀 Starting enhancement for prompt:', trimmedPrompt)

      // Check for specialized/medical terms that our AI might not understand
      const specializedTerms = [
        'surgical', 'medical', 'prosthetic', 'orthopedic', 'dental', 'implant',
        'catheter', 'stent', 'biopsy', 'endoscopic', 'laparoscopic', 'drill guide',
        'jig', 'fixture', 'template', 'gauge'
      ];
      const hasSpecializedTerms = specializedTerms.some(term => 
        trimmedPrompt.toLowerCase().includes(term)
      );

      if (hasSpecializedTerms) {
        console.log('⚠️  Specialized/medical terms detected - using conservative enhancement');
        return this.handleSpecializedPrompt(trimmedPrompt);
      }

      // First try AI enhancement to create relevant mechanical objects
      console.log('🤖 Attempting AI enhancement for user intent preservation...');
      const aiEnhancement = await this.tryAIEnhancement(trimmedPrompt);
      
      if (aiEnhancement) {
        console.log('✅ AI enhancement successful:', aiEnhancement);
        const enhancedWithDesign = this.ensureDesignPrefix(aiEnhancement);
        
        // Validate AI enhancement follows Zoo API best practices
        const isZooCompliant = this.validateZooCompliance(enhancedWithDesign);
        if (isZooCompliant) {
          return {
            enhancedPrompt: enhancedWithDesign,
            confidence: 0.8,
            source: 'ai'
          };
        } else {
          console.warn('⚠️ AI enhancement not Zoo compliant, converting to Zoo pattern:', enhancedWithDesign);
          // Convert to Zoo compliant pattern
          const zooCompliant = this.convertToZooPattern(trimmedPrompt);
          return {
            enhancedPrompt: zooCompliant,
            confidence: 0.85,
            source: 'rules'
          };
        }
      }
      
      // If AI enhancement fails, try pattern-based enhancement
      console.log('⚠️ AI enhancement failed, trying pattern-based enhancement...');
      const patternResult = this.enhanceWithAgenticadPatterns(trimmedPrompt);
      if (patternResult.confidence > 0.7) {
        console.log('🎯 Pattern-based enhancement successful:', patternResult.prompt);
        const enhancedWithDesign = this.ensureDesignPrefix(patternResult.prompt);
        return {
          enhancedPrompt: enhancedWithDesign,
          confidence: patternResult.confidence,
          source: 'rules'
        };
      }
      
      // Final fallback to verified templates
      console.log('🔧 Using verified template fallback');
      const fallbackResult = this.fallbackEnhancement(trimmedPrompt);
      console.log('🔧 Using verified template:', fallbackResult);
      return fallbackResult;
      
    } catch (error) {
      console.error('❌ Error in AI enhancement:', error)
      console.log('🔧 Using emergency fallback enhancement')
      return {
        enhancedPrompt: 'design a plate with 4 holes near each corner and rounded corners',
        confidence: 0.5,
        source: 'rules'
      };
    }
  }

  /**
   * Ensure enhanced prompt starts with "design" for better results
   */
  private ensureDesignPrefix(prompt: string): string {
    const trimmed = prompt.trim();
    const lowered = trimmed.toLowerCase();
    
    // Check if it already starts with "design"
    if (lowered.startsWith('design ')) {
      return trimmed;
    }
    
    // Check if it starts with "create", "make", "a", "an", or similar
    if (lowered.startsWith('create ') || lowered.startsWith('make ')) {
      return trimmed.replace(/^(create|make)\s+/i, 'design ');
    }
    
    // Check if it starts with an article
    if (lowered.startsWith('a ') || lowered.startsWith('an ')) {
      return 'design ' + trimmed;
    }
    
    // Otherwise, just prepend "design"
    return 'design ' + trimmed;
  }

  /**
   * Create a design-prefixed prompt from original prompt for fallback
   */
  private createDesignPrompt(originalPrompt: string): string {
    const trimmed = originalPrompt.trim();
    const lowered = trimmed.toLowerCase();
    
    // If already starts with design, return as-is
    if (lowered.startsWith('design ')) {
      return trimmed;
    }
    
    // Grammar fixes for common patterns
    if (lowered.startsWith('create ') || lowered.startsWith('make ')) {
      return trimmed.replace(/^(create|make)\s+/i, 'design ');
    }
    
    // Handle articles properly
    if (lowered.match(/^(a|an)\s+/)) {
      return 'design ' + trimmed;
    }
    
    // Handle direct object names
    if (lowered.match(/^[a-z]+\s+(with|that|having|for)/)) {
      return 'design ' + trimmed;
    }
    
    // Default: prepend design
    return 'design ' + trimmed;
  }

  /**
   * Check if prompt follows AgenticadML's proven working patterns
   */
  private isAgenticadCompatiblePrompt(prompt: string): boolean {
    // Check for specific technical indicators that our AI expects
    const hasDimensions = /\b\d+\s*(mm|cm|m|inch|inches|")\b/.test(prompt.toLowerCase())
    const hasThickness = /\b(thick|thickness|wall)\b/.test(prompt.toLowerCase()) && /\b\d+/.test(prompt)
    const hasSpecificMeasurements = /\b\d+\s*x\s*\d+\s*x?\s*\d*/.test(prompt.toLowerCase())
    
    // Check for geometric terms that indicate technical knowledge
    const technicalTerms = [
      'diameter', 'radius', 'chamfer', 'fillet', 'countersunk', 'thread',
      'flange', 'bearing', 'shaft', 'gasket', 'bracket', 'mount',
      'cutout', 'hole', 'slot', 'groove', 'ridge', 'boss'
    ]
    const hasTechnicalTerms = technicalTerms.some(term => prompt.toLowerCase().includes(term))
    
    // Check for specific object types that are inherently technical
    const technicalObjects = [
      'bearing', 'gasket', 'bracket', 'mount', 'flange', 'connector',
      'adapter', 'spacer', 'washer', 'bushing', 'coupling'
    ]
    const hasTechnicalObjects = technicalObjects.some(obj => prompt.toLowerCase().includes(obj))
    
    // Exclude vague terms that our AI can't handle well
    const vagueTerms = ['ribbons', 'decorative', 'pretty', 'beautiful', 'long edges', 'short edges', 'elegant', 'stylish']
    const hasVagueTerms = vagueTerms.some(term => prompt.toLowerCase().includes(term))
    
    // Must have dimensions OR (technical terms AND some measurement) AND no vague terms
    const isReasonablyTechnical = (hasDimensions || hasSpecificMeasurements || 
      (hasTechnicalTerms && /\b\d+/.test(prompt)) || 
      (hasTechnicalObjects && /\b\d+/.test(prompt))) && !hasVagueTerms
    
    console.log('🔍 Prompt compatibility check:', {
      prompt: prompt.substring(0, 50) + '...',
      hasDimensions,
      hasThickness,
      hasSpecificMeasurements,
      hasTechnicalTerms,
      hasTechnicalObjects,
      hasVagueTerms,
      isReasonablyTechnical
    })
    
    return isReasonablyTechnical
  }

  private simplifyEnhancement(overComplexPrompt: string, originalPrompt: string): { enhancedPrompt: string; confidence: number; source: 'rules' } {
    // Extract basic elements and rebuild simply
    const dimensionMatch = overComplexPrompt.match(/(\d+\s*(?:mm|cm)?\s*[×x]\s*\d+\s*(?:mm|cm)?(?:\s*[×x]\s*\d+\s*(?:mm|cm)?)?)/i)
    const thicknessMatch = overComplexPrompt.match(/(\d+\s*(?:mm|cm)?\s*thick)/i)
    const basicShape = originalPrompt.toLowerCase().includes('round') ? 'cylindrical' : 
                      originalPrompt.toLowerCase().includes('l-shape') ? 'L-shaped' :
                      'rectangular'
    
    let simplified = `${basicShape} ${originalPrompt.split(' ')[0]}`
    
    if (dimensionMatch) {
      simplified += ` ${dimensionMatch[1]}`
    } else {
      // Add basic dimensions
      simplified += ` 100mm × 50mm`
    }
    
    if (thicknessMatch) {
      simplified += ` ${thicknessMatch[1]}`
    } else {
      simplified += ` 5mm thick`
    }
    
    // Add one simple feature if original suggests it
    if (originalPrompt.toLowerCase().includes('hole')) {
      simplified += ' with center hole'
    } else if (originalPrompt.toLowerCase().includes('round')) {
      simplified += ' with rounded corners'
    }
    
    return {
      enhancedPrompt: this.ensureDesignPrefix(simplified),
      confidence: 0.6,
      source: 'rules'
    }
  }

  private handleSpecializedPrompt(originalPrompt: string): { enhancedPrompt: string; confidence: number; source: 'rules' } {
    console.log('🏥 Handling specialized/medical prompt:', originalPrompt);
    
    const words = originalPrompt.toLowerCase().split(' ');
    const prompt = originalPrompt.toLowerCase();
    
    // Convert specific specialized items to mechanical equivalents
    
    // Dispensers -> Containers with opening mechanisms
    if (prompt.includes('floss dispenser') || prompt.includes('tape dispenser')) {
      console.log('🔧 Converting dispenser to mechanical container');
      return {
        enhancedPrompt: 'design rectangular housing with slot opening',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    if (words.some(w => ['dispenser', 'holder', 'container'].includes(w))) {
      console.log('🔧 Converting dispenser/holder to mechanical housing');
      return {
        enhancedPrompt: 'design cylindrical housing with cap',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Medical tools -> Simple mechanical equivalents
    if (words.some(w => ['surgical', 'drill', 'guide'].includes(w))) {
      console.log('🔧 Converting surgical tool to cylindrical guide');
      return {
        enhancedPrompt: 'design cylindrical guide 50mm long',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Dental items -> Mechanical equivalents
    if (words.some(w => ['dental', 'tooth', 'oral'].includes(w))) {
      console.log('🔧 Converting dental item to curved component');
      return {
        enhancedPrompt: 'design curved housing with opening',
        confidence: 0.7,
        source: 'rules'
      };
    }
    
    // Fixtures and templates
    if (words.some(w => ['jig', 'fixture', 'template'].includes(w))) {
      console.log('🔧 Converting fixture to mounting plate');
      return {
        enhancedPrompt: 'design mounting plate with holes',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Measuring tools
    if (words.some(w => ['gauge', 'measure', 'ruler'].includes(w))) {
      console.log('🔧 Converting measuring tool to graduated plate');
      return {
        enhancedPrompt: 'design graduated plate 100mm long',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Prosthetics and implants
    if (words.some(w => ['prosthetic', 'implant', 'orthotic'].includes(w))) {
      console.log('🔧 Converting prosthetic to curved bracket');
      return {
        enhancedPrompt: 'design curved bracket with smooth edges',
        confidence: 0.7,
        source: 'rules'
      };
    }
    
    // Handles and grips
    if (words.some(w => ['handle', 'grip', 'knob'].includes(w))) {
      console.log('🔧 Converting handle to cylindrical grip');
      return {
        enhancedPrompt: 'design cylindrical grip 80mm long',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Covers and caps
    if (words.some(w => ['cover', 'cap', 'lid'].includes(w))) {
      console.log('🔧 Converting cover to circular cap');
      return {
        enhancedPrompt: 'design circular cap with rim',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Electronics housings
    if (words.some(w => ['circuit', 'electronic', 'pcb', 'board'].includes(w))) {
      console.log('🔧 Converting electronics to rectangular housing');
      return {
        enhancedPrompt: 'design rectangular housing with mounting posts',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Default: Extract core object and convert to mechanical equivalent
    console.log('🔧 Converting unknown specialized term to basic mechanical part');
    
    // Try to identify the core object type
    if (words.some(w => ['box', 'case', 'housing'].includes(w))) {
      return {
        enhancedPrompt: 'design rectangular housing',
        confidence: 0.7,
        source: 'rules'
      };
    }
    
    if (words.some(w => ['tube', 'pipe', 'cylinder'].includes(w))) {
      return {
        enhancedPrompt: 'design cylindrical tube',
        confidence: 0.7,
        source: 'rules'
      };
    }
    
    // Final fallback - but make it more specific than generic plate
    return {
      enhancedPrompt: 'design rectangular bracket with mounting holes',
      confidence: 0.6,
      source: 'rules'
    };
  }

  private fallbackEnhancement(originalPrompt: string): { enhancedPrompt: string; confidence: number; source: 'rules' } {
    if (!originalPrompt || originalPrompt.trim().length === 0) {
      console.error('❌ Empty prompt provided to fallbackEnhancement')
      return {
        enhancedPrompt: 'design a plate with 4 holes near each corner and rounded corners',
        confidence: 0.3,
        source: 'rules'
      }
    }

    const words = originalPrompt.toLowerCase().split(' ')
    
    console.log('🔧 Fallback enhancement for:', originalPrompt)
    
    // Smart intent mapping for different types of objects
    
    // Animal/character toys - convert to recognizable shapes
    if (words.some(w => ['cat', 'dog', 'animal', 'pet', 'creature'].includes(w))) {
      if (words.some(w => ['toy', 'wooden', 'figure', 'model'].includes(w))) {
        return {
          enhancedPrompt: 'design a cat-shaped ornament with curved body outline, pointed ears, 80mm tall, 60mm wide, 10mm thick',
          confidence: 0.9,
          source: 'rules'
        };
      }
    }
    
    // Character/figure toys
    if (words.some(w => ['toy', 'figure', 'character', 'doll'].includes(w))) {
      return {
        enhancedPrompt: 'design a decorative figure with rounded base, 100mm tall, 40mm wide, 15mm thick',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Wooden/carved items
    if (words.some(w => ['wooden', 'carved', 'ornament', 'decoration'].includes(w))) {
      return {
        enhancedPrompt: 'design a decorative ornamental piece with curved edges, 80mm × 60mm × 12mm thick',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Use AgenticadML's VERIFIED working examples as templates for technical objects
    const verifiedTemplates = [
      'design a plate with 4 holes near each corner and rounded corners',
      'design a 9 pointed star',
      'design an involute helical gear with 36 teeth',
      'design a sketch of a christmas tree with a star on top'
    ];
    
    // Simple object type mapping to verified examples
    if (words.some(w => ['star', 'pointed'].includes(w))) {
      return {
        enhancedPrompt: 'design a 9 pointed star',
        confidence: 0.9,
        source: 'rules'
      };
    }
    
    if (words.some(w => ['tree', 'christmas'].includes(w))) {
      return {
        enhancedPrompt: 'design a sketch of a christmas tree with a star on top',
        confidence: 0.9,
        source: 'rules'
      };
    }
    
    if (words.some(w => ['gear', 'cog', 'tooth', 'teeth'].includes(w))) {
      return {
        enhancedPrompt: 'design an involute helical gear with 36 teeth',
        confidence: 0.9,
        source: 'rules'
      };
    }
    
    // Complex mechanical requests - use simple plate as fallback
    const isComplexRequest = words.some(w => 
      ['steering', 'wheel', 'spring', 'complex', 'intricate', 'moving', 'articulated'].includes(w)
    );
    
    if (isComplexRequest) {
      console.log('🔧 Complex request detected, using verified simple plate template');
      return {
        enhancedPrompt: 'design a plate with 4 holes near each corner and rounded corners',
        confidence: 0.8,
        source: 'rules'
      };
    }
    
    // Default to the most reliable template for everything else
    console.log('🔧 Using default verified plate template');
    return {
      enhancedPrompt: 'design a plate with 4 holes near each corner and rounded corners',
      confidence: 0.7,
      source: 'rules'
    };
  }

  /**
   * Enhanced AI prompt enhancement with AgenticadML-specific instruction
   */
  private async tryAIEnhancement(originalPrompt: string): Promise<string | null> {
    try {
      const messages = [
        {
          role: 'system',
          content: `You are helping convert user ideas into Zoo Text-to-CAD API compatible prompts.

CRITICAL RULES (Zoo API best practices):
1. Use 1-2 sentences MAXIMUM (shorter prompts succeed more often)
2. Focus on traditional mechanical parts: fasteners, bearings, connectors, brackets
3. ALWAYS START WITH "design" - this is critical
4. Use simple geometric shapes and clear dimensions
5. Avoid complex or artistic descriptions
6. Use traditional engineering terminology
7. NEVER mention materials, manufacturing processes, or complex specifications

PROVEN WORKING EXAMPLES from Zoo API:
- "design a rectangular bracket with mounting holes"
- "design a cylindrical bearing housing"
- "design a hexagonal bolt fastener"
- "design a L-shaped bracket"
- "design a rectangular plate with 4 holes"
- "design a cylindrical tube with flanged ends"

CONVERSION PRINCIPLES:
1. ALWAYS START WITH "design" 
2. Keep it EXTREMELY SIMPLE - 1-2 sentences only, under 10 words
3. Use basic mechanical terms: bracket, bearing, connector, fastener, housing, plate, tube
4. Avoid artistic, complex, material, or manufacturing descriptions
5. Focus on traditional mechanical parts that work best
6. Add simple geometric descriptors: rectangular, cylindrical, hexagonal, L-shaped

CONVERT user intent to simple mechanical parts:
- "phone stand" → "design a L-shaped bracket"
- "phone case" → "design a rectangular housing"
- "phone holder" → "design a cylindrical housing"
- "box" → "design a rectangular container"
- "holder" → "design a cylindrical housing"
- "mount" → "design a L-shaped bracket"
- "fastener" → "design a hexagonal bolt"
- "connector" → "design a cylindrical connector"

Keep prompts under 8 words. Focus on ONE simple mechanical object. Traditional mechanical parts work best.`
        },
        {
          role: 'user',
          content: `Convert this into a Zoo Text-to-CAD compatible prompt that starts with "design": "${originalPrompt}"`
        }
      ];

      const response = await this.callOpenAI(messages);
      console.log('🔍 OpenAI Response:', response);
      let enhancement = response?.choices?.[0]?.message?.content?.trim();
      console.log('🔍 Extracted enhancement:', enhancement);
      
      if (enhancement) {
        // Clean up the AI response - remove quotes and extra whitespace
        enhancement = enhancement.replace(/^["']|["']$/g, '').trim();
        
        // Remove duplicate "design" prefixes if AI added them
        enhancement = enhancement.replace(/^design\s+"?design\s+/i, 'design ');
        enhancement = enhancement.replace(/^"?design\s+"?design\s+/i, 'design ');
        
        console.log('🔍 Cleaned enhancement:', enhancement);
        console.log(`🔍 Enhancement validation: length=${enhancement.length}, starts with design=${enhancement.toLowerCase().startsWith('design')}`);
        
        if (enhancement.length > 5 && enhancement.length < 150) {
          // Ensure it starts with "design" but don't duplicate
          let finalEnhancement = enhancement;
          if (!finalEnhancement.toLowerCase().startsWith('design')) {
            finalEnhancement = 'design ' + finalEnhancement.replace(/^(a|an|the)\s+/i, '');
          }
          
          // Check for materials/manufacturing terms (less strict)
          const invalidTerms = ['injection-molded', 'manufactured', 'machined', '3d-printed'];
          const hasInvalidTerms = invalidTerms.some(term => finalEnhancement.toLowerCase().includes(term));
          
          if (!hasInvalidTerms) {
            console.log('✅ AI enhancement accepted:', finalEnhancement);
            return finalEnhancement;
          } else {
            console.warn('🚫 AI enhancement contains manufacturing terms, rejecting:', finalEnhancement);
          }
        } else {
          console.warn('🚫 AI enhancement failed length validation:', enhancement.length);
        }
      } else {
        console.warn('🚫 No enhancement content extracted from AI response');
      }
    } catch (error) {
      console.warn('❌ AI enhancement failed:', error);
    }
    
    return null;
  }

  /**
   * Pattern-based enhancement using AgenticadML's simplified approach
   * Based on AgenticadML documentation preference for concise, direct descriptions
   */
  private enhanceWithAgenticadPatterns(prompt: string): { prompt: string; confidence: number } {
    // Intent mapping based on AgenticadML's preference for simple object descriptions
    // SIMPLIFIED patterns based on AgenticadML's preference for concise descriptions
    const intentMaps = [
      {
        patterns: [/cat|dog|animal|pet|creature/i],
        template: (match: string) => {
            if (/cat/i.test(match)) {
            return `cat-shaped figure`;
            } else if (/dog/i.test(match)) {
            return `dog-shaped figure`;
            } else {
            return `animal-shaped figure`;
            }
        },
        confidence: 0.9
      },
      {
        patterns: [/toy|figure|character|doll|ornament/i],
        template: (match: string) => `decorative figure`,
        confidence: 0.8
      },
      {
        patterns: [/board|plank/i],
        template: (match: string) => {
          if (/cutting|chopping/i.test(match)) {
            return `cutting board with rounded corners`;
          } else if (/circuit|pcb/i.test(match)) {
            return `circuit board with mounting holes`;
          } else if (/long|skate/i.test(match)) {
            return `skateboard with mounting holes`;
          } else {
            return `rectangular board with rounded corners`;
          }
        },
        confidence: 0.8
      },
      {
        patterns: [/plate/i],
        template: (match: string) => `plate with rounded corners`,
        confidence: 0.8
      },
      {
        patterns: [/gear/i],
        template: (match: string) => `gear with teeth`,
        confidence: 0.9
      },
      {
        patterns: [/case|cover|shell/i],
        template: (match: string) => `protective case with rounded corners`,
        confidence: 0.8
      },
      {
        patterns: [/holder|stand|mount/i],
        template: (match: string) => `cylindrical holder`,
        confidence: 0.8
      },
      {
        patterns: [/bracket|clamp/i],
        template: (match: string) => `L-shaped bracket`,
        confidence: 0.8
      },
      {
        patterns: [/box|container|housing/i],
        template: (match: string) => `rectangular housing`,
        confidence: 0.8
      },
      {
        patterns: [/clip|fastener/i],
        template: (match: string) => `spring clip`,
        confidence: 0.7
      },
      {
        patterns: [/wheel|disc/i],
        template: (match: string) => `circular disc with center hole`,
        confidence: 0.8
      },
      {
        patterns: [/handle|grip/i],
        template: (match: string) => `cylindrical handle`,
        confidence: 0.7
      },
      {
        patterns: [/connector|adapter/i],
        template: (match: string) => `cylindrical connector`,
        confidence: 0.7
      }
    ];

    // Try to match user intent with AgenticadML patterns
    for (const intentMap of intentMaps) {
      for (const pattern of intentMap.patterns) {
        if (pattern.test(prompt)) {
          const match = prompt; // Pass full prompt for context
          return {
            prompt: intentMap.template(match),
            confidence: intentMap.confidence
          };
        }
      }
    }

    // Generic fallback for unknown prompts - use AgenticadML's verified simple template
    return {
      prompt: `plate with rounded corners`,
      confidence: 0.6
    };
  }

  private async callOpenAI(messages: any[]): Promise<any> {
    const config = getPicaConfig();
    const baseUrl = 'https://api.picaos.com/v1/passthrough';
    
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pica-secret': config.secretKey,
        'x-pica-connection-key': config.openaiConnectionKey,
        'x-pica-action-id': 'conn_mod_def::GDzgi1QfvM4::4OjsWvZhRxmAVuLAuWgfVA'
      },
      body: JSON.stringify({
        messages,
        model: 'gpt-4o',
        temperature: 0.3,
        max_completion_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async callSupabaseFunction(action: string, payload: any): Promise<any> {
    const { url, headers } = getSupabaseFunction();
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action,
        ...payload
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Supabase function error: ${response.status} - ${errorData.error || response.statusText}`);
    }

    return response.json();
  }

  async generateCADModel(request: CADGenerationRequest): Promise<CADGenerationResponse> {
    try {
      console.log('Generating CAD model via Supabase function:', request.prompt);
      
      const data = await this.callSupabaseFunction('generate', {
        prompt: request.prompt,
        outputFormat: request.outputFormat || 'gltf',
        units: request.units || 'mm',
        scale: request.scale || 1
      });
      
      return {
        id: data.id,
        status: data.status || 'queued',
        prompt: request.prompt,
        outputs: data.outputs,
        created_at: data.created_at || new Date().toISOString()
      };
    } catch (error) {
      console.error('CAD generation error:', error);
      throw new Error(`Failed to generate CAD model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getCADModel(id: string): Promise<CADGenerationResponse> {
    try {
      console.log('Checking CAD model status via Supabase function:', id);
      
      const data = await this.callSupabaseFunction('status', { id });
      
      return data;
    } catch (error) {
      console.error('CAD model fetch error:', error);
      throw new Error(`Failed to fetch CAD model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async convertCADFormat(id: string, outputFormat: string): Promise<{ download_url: string }> {
    try {
      console.log('Converting CAD format:', id, 'to', outputFormat);
      
      // For STL format, Zoo API doesn't provide direct conversion
      // We need to implement client-side conversion from GLTF
      if (outputFormat === 'stl') {
        console.log('STL conversion detected - Zoo API does not support direct STL download');
        throw new Error('STL conversion requires GLTF-to-STL conversion. Use browser-based conversion instead.');
      }
      
      // Try Zoo API conversion for other formats (may still fail)
      console.log('Attempting Zoo API format conversion via Supabase function...');
      
      const data = await this.callSupabaseFunction('convert', {
        id,
        convertFormat: outputFormat
      });
      
      return data;
    } catch (error) {
      console.error('Format conversion error:', error);
      throw new Error(`Failed to convert format: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async pollForCompletion(
    id: string, 
    maxAttempts: number = 60, 
    intervalMs: number = 3000,
    onProgress?: (step: string, attempt: number, maxAttempts: number) => void
  ): Promise<CADGenerationResponse> {
    let attempts = 0;
    
    console.log(`⏳ Starting polling for CAD model ${id} (max ${maxAttempts} attempts, ${intervalMs/1000}s intervals)`);
    
    while (attempts < maxAttempts) {
      try {
        const result = await this.getCADModel(id);
        
        console.log(`📊 Poll attempt ${attempts + 1}/${maxAttempts}: Status = ${result.status}`);
        
        // Provide progress updates
        if (onProgress) {
          if (result.status === 'queued') {
            onProgress('Waiting in queue...', attempts + 1, maxAttempts);
          } else if (result.status === 'in_progress') {
            onProgress('Generating 3D model...', attempts + 1, maxAttempts);
          }
        }
        
        if (result.status === 'completed') {
          console.log(`✅ CAD generation completed after ${attempts + 1} attempts (${((attempts + 1) * intervalMs / 1000)}s)`);
          if (onProgress) {
            onProgress('Generation complete!', attempts + 1, maxAttempts);
          }
          return result;
        } else if (result.status === 'failed') {
          const errorMessage = result.error || 'Unknown error';
          console.error(`❌ CAD generation failed: ${errorMessage}`);
          
          // Check for specific error types that should trigger error cascade
          const isPromptError = errorMessage.includes('400 Bad Request') || 
                              errorMessage.includes('The prompt must clearly describe a CAD model') ||
                              errorMessage.includes('422') || 
                              errorMessage.includes('Unprocessable Entity') ||
                              errorMessage.includes('prompt is not clear') ||
                              errorMessage.includes('cannot understand the prompt');
          
          if (isPromptError) {
            console.log('🛑 Prompt error detected - triggering error cascade');
            if (onProgress) {
              onProgress('Prompt needs improvement - starting error cascade', attempts + 1, maxAttempts);
            }
            throw new Error(`CAD generation failed: ${errorMessage}`);
          }
          
          // For other errors, also stop polling
          throw new Error(`CAD generation failed: ${errorMessage}`);
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          console.log(`⏳ Waiting ${intervalMs/1000}s before next poll...`);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      } catch (pollError) {
        console.error(`❌ Error during polling attempt ${attempts + 1}:`, pollError);
        
        // Check for prompt-related errors that should trigger error cascade
        const errorMessage = pollError instanceof Error ? pollError.message : String(pollError);
        const isPromptError = errorMessage.includes('400 Bad Request') || 
                            errorMessage.includes('The prompt must clearly describe a CAD model') ||
                            errorMessage.includes('422') || 
                            errorMessage.includes('Unprocessable Entity') ||
                            errorMessage.includes('prompt is not clear') ||
                            errorMessage.includes('cannot understand the prompt');
        
        if (isPromptError) {
          console.log('🛑 Prompt error in polling - triggering error cascade');
          if (onProgress) {
            onProgress('Error: Prompt needs improvement - starting error cascade', attempts + 1, maxAttempts);
          }
          throw pollError; // Re-throw to stop polling and trigger error cascade
        }
        
        attempts++;
        if (attempts < maxAttempts) {
          console.log(`🔄 Retrying polling in ${intervalMs/1000}s...`);
          await new Promise(resolve => setTimeout(resolve, intervalMs));
        }
      }
    }
    
    console.error(`❌ CAD generation timed out after ${maxAttempts} attempts (${(maxAttempts * intervalMs / 1000)}s total)`);
    if (onProgress) {
      onProgress('Generation timed out', maxAttempts, maxAttempts);
    }
    throw new Error(`CAD generation timed out after ${(maxAttempts * intervalMs / 1000)} seconds`);
  }

  async generateAndWaitForCAD(
    request: CADGenerationRequest, 
    skipEnhancement: boolean = false,
    onProgress?: (step: string, details?: any) => void
  ): Promise<CADModel> {
    let enhancement = { enhancedPrompt: request.prompt, confidence: 1, source: 'original' };
    
    if (!skipEnhancement) {
      // Enhance the prompt for better Zoo ML-ephant results
      console.log('🚀 Starting CAD generation with prompt enhancement...');
      if (onProgress) onProgress('Enhancing prompt for better results...');
      
      enhancement = await this.enhancePromptForCAD(request.prompt);
      
      console.log(`📝 Prompt enhancement: ${enhancement.source} (confidence: ${enhancement.confidence})`);
      console.log(`   Original: "${request.prompt}"`);
      console.log(`   Enhanced: "${enhancement.enhancedPrompt}"`);
      
      if (onProgress) onProgress('Starting 3D model generation...', { 
        enhancementSource: enhancement.source,
        confidence: enhancement.confidence 
      });
    } else {
      console.log('🚀 Starting CAD generation (enhancement skipped)...');
      console.log(`   Prompt: "${request.prompt}"`);
      if (onProgress) onProgress('Starting 3D model generation...');
    }
    
    // Try generation with fallback logic for failed prompts
    let completedResponse: CADGenerationResponse;
    
    try {
    // Use the enhanced prompt
    const enhancedRequest = {
      ...request,
      prompt: enhancement.enhancedPrompt
    };
    
    // Start generation
      if (onProgress) onProgress('Submitting request to AgenticadML API...');
    const generationResponse = await this.generateCADModel(enhancedRequest);
    
      // Poll for completion with progress updates
      if (onProgress) onProgress('Processing 3D model...');
      completedResponse = await this.pollForCompletion(
        generationResponse.id, 
        150, 
        3000, 
        (step, attempt, maxAttempts) => {
          if (onProgress) onProgress(step, { attempt, maxAttempts });
        }
      );
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 🚀 SMART ERROR RECOVERY: Use AI-powered prompt enhancement with error context
      console.log('🔧 Starting smart error recovery with AI enhancement...');
      console.log(`🔍 Error details: ${errorMessage}`);
      
      // Track failed prompt in history
      // await this.addToPromptHistory(request.prompt, false, errorMessage); // Don't save failed prompts
      console.log('📚 Skipping failed prompt history:', request.prompt);
      
      // Special handling for Zoo API "400 Bad Request" errors
      if (errorMessage.includes('400 Bad Request') && errorMessage.includes('The prompt must clearly describe a CAD model')) {
        console.log('🎯 Detected Zoo API prompt clarity error - applying specialized fixes...');
        
        // Try Zoo API specific enhancement first
        const zooEnhancement = this.enhanceForZooAPI(request.prompt);
        console.log('🚀 Trying Zoo API specific enhancement:', zooEnhancement.enhancedPrompt);
        if (onProgress) onProgress('Applying Zoo API specific fixes...');
        
        try {
          const zooRequest = { ...request, prompt: zooEnhancement.enhancedPrompt };
          const zooResponse = await this.generateCADModel(zooRequest);
          completedResponse = await this.pollForCompletion(
            zooResponse.id,
            150,
            3000,
            (step, attempt, maxAttempts) => {
              if (onProgress) onProgress(`Zoo Fix: ${step}`, { attempt, maxAttempts });
            }
          );
          
          console.log('✅ Zoo API specific fix successful!');
          enhancement = {
            enhancedPrompt: zooEnhancement.enhancedPrompt,
            confidence: zooEnhancement.confidence,
            source: 'rules'
          };
          
          // Success! Continue with normal processing
          
        } catch (zooError) {
          console.warn('⚠️ Zoo API specific fix failed, trying AI error recovery...');
          
          // Continue with AI error recovery
          if (onProgress) onProgress('Analyzing error and fixing prompt with AI...');
          
          try {
            // Use AI to understand the error and fix the prompt
            const errorRecovery = await this.enhancePromptWithErrorContext(request.prompt, errorMessage);
            console.log('✅ AI error recovery result:', errorRecovery);
            
            if (onProgress) onProgress('Retrying with AI-enhanced prompt...');
            
            const recoveredRequest = {
              ...request,
              prompt: errorRecovery.enhancedPrompt
            };
            
            const recoveredGenerationResponse = await this.generateCADModel(recoveredRequest);
            completedResponse = await this.pollForCompletion(
              recoveredGenerationResponse.id,
              150,
              3000,
              (step, attempt, maxAttempts) => {
                if (onProgress) onProgress(`AI Recovery: ${step}`, { attempt, maxAttempts });
              }
            );
            
            console.log('✅ Generation successful with AI error recovery!');
            enhancement = {
              enhancedPrompt: errorRecovery.enhancedPrompt,
              confidence: errorRecovery.confidence,
              source: errorRecovery.source
            };
            
          } catch (recoveryError) {
            console.warn('⚠️ AI error recovery also failed, trying design prompt fallback...');
            // Fall through to the existing fallback logic below
            throw recoveryError;
          }
        }
      } else {
        // For non-Zoo API errors, use the existing AI error recovery
        if (onProgress) onProgress('Analyzing error and fixing prompt with AI...');
        
        try {
          // Use AI to understand the error and fix the prompt
          const errorRecovery = await this.enhancePromptWithErrorContext(request.prompt, errorMessage);
          console.log('✅ AI error recovery result:', errorRecovery);
          
          if (onProgress) onProgress('Retrying with AI-enhanced prompt...');
          
          const recoveredRequest = {
            ...request,
            prompt: errorRecovery.enhancedPrompt
          };
          
          const recoveredGenerationResponse = await this.generateCADModel(recoveredRequest);
          completedResponse = await this.pollForCompletion(
            recoveredGenerationResponse.id,
            150,
            3000,
            (step, attempt, maxAttempts) => {
              if (onProgress) onProgress(`AI Recovery: ${step}`, { attempt, maxAttempts });
            }
          );
          
          console.log('✅ Generation successful with AI error recovery!');
          enhancement = {
            enhancedPrompt: errorRecovery.enhancedPrompt,
            confidence: errorRecovery.confidence,
            source: errorRecovery.source
          };
          
        } catch (recoveryError) {
          console.warn('⚠️ AI error recovery failed, searching prompt history for similar successful prompts...');
          if (onProgress) onProgress('Searching prompt history for similar prompts...');
          
          try {
            // Try to find similar successful prompts from history
            const similarPrompts = await this.findSimilarSuccessfulPrompts(request.prompt, 3);
            
            if (similarPrompts.length > 0) {
              const bestSimilar = similarPrompts[0];
              console.log(`📚 Found similar successful prompt: "${bestSimilar}"`);
              
              const similarRequest = {
                ...request,
                prompt: bestSimilar
              };
              
              const similarGenerationResponse = await this.generateCADModel(similarRequest);
              completedResponse = await this.pollForCompletion(
                similarGenerationResponse.id,
                150,
                3000,
                (step, attempt, maxAttempts) => {
                  if (onProgress) onProgress(`Similar Prompt: ${step}`, { attempt, maxAttempts });
                }
              );
              
              console.log('✅ Generation successful with similar prompt from history!');
              enhancement = {
                enhancedPrompt: bestSimilar,
                confidence: 75,
                source: 'prompt-history'
              };
              
            } else {
              throw new Error('No similar successful prompts found in history');
            }
            
          } catch (historyError) {
            console.warn('⚠️ Prompt history search failed, trying design prompt fallback...');
            if (onProgress) onProgress('History search failed, trying design prompt...');
            
            try {
              // Fallback to design prompt if history search fails
              const designPrompt = this.createDesignPrompt(request.prompt);
              console.log('🔧 Design prompt fallback:', designPrompt);
              
              const designRequest = {
                ...request,
                prompt: designPrompt
              };
              
              const designGenerationResponse = await this.generateCADModel(designRequest);
              completedResponse = await this.pollForCompletion(
                designGenerationResponse.id,
                150,
                3000,
                (step, attempt, maxAttempts) => {
                  if (onProgress) onProgress(`Design: ${step}`, { attempt, maxAttempts });
                }
              );
              
              console.log('✅ Generation successful with design prompt fallback');
              enhancement = { 
                enhancedPrompt: designPrompt, 
                confidence: 0.7, 
                source: 'rules' 
              };
              
            } catch (designError) {
              console.warn('⚠️ Design prompt also failed, using verified template...');
              if (onProgress) onProgress('Using verified template...');
              
              // Final fallback to known working template
              const fallbackRequest = {
                ...request,
                prompt: 'design a plate with 4 holes near each corner and rounded corners'
              };
              
              const fallbackGenerationResponse = await this.generateCADModel(fallbackRequest);
              completedResponse = await this.pollForCompletion(
                fallbackGenerationResponse.id,
                150,
                3000,
                (step, attempt, maxAttempts) => {
                  if (onProgress) onProgress(`Fallback: ${step}`, { attempt, maxAttempts });
                }
              );
              
              console.log('✅ Generation successful with verified template');
              enhancement = { 
                enhancedPrompt: 'design a plate with 4 holes near each corner and rounded corners', 
                confidence: 0.5, 
                source: 'rules' 
              };
            }
          }
        }
      }
    }
    
    if (onProgress) onProgress('Processing 3D model data...');
    
    console.log('✅ Completed response:', JSON.stringify(completedResponse, null, 2));
    
    // Track successful prompt in history
    await this.addToPromptHistory(enhancement.enhancedPrompt, true, undefined, enhancement.confidence, enhancement.source);
    console.log('📚 Added successful prompt to history:', enhancement.enhancedPrompt);
    
    // Zoo API might return outputs in different formats - check multiple possible paths
    const outputs = completedResponse.outputs || completedResponse.output || {};
    let gltfUrl = outputs.gltf || outputs.glb || outputs.model || outputs.file;
    
    // IMPORTANT: Store the original downloadable URL before creating blob URLs
    // For Zoo API, we need to create a shareable URL since they return base64 data
    let originalDownloadableUrl = gltfUrl || completedResponse.gltf || completedResponse.model_url || completedResponse.download_url;
    
    // If no direct URL available, we'll need to create a shareable one after blob creation
    let needsShareableUrl = !originalDownloadableUrl || (!originalDownloadableUrl.startsWith('http'));
    
    // Check for base64 encoded GLTF data (Zoo API returns this)
    let gltfBase64Data = null;
    let glbBinaryData = null;
    
    // Check all possible locations for GLTF/GLB data
    const possibleGltfKeys = ['source.gltf', 'gltf', 'model', 'file'];
    const possibleGlbKeys = ['source.glb', 'glb', 'model_binary', 'binary'];
    
    // Look for GLTF data
    for (const key of possibleGltfKeys) {
      const value = (outputs as any)[key] || (completedResponse as any)[key];
      if (value && typeof value === 'string' && !value.startsWith('http') && value.length > 100) {
        gltfBase64Data = value;
        console.log(`🎯 Found base64 GLTF data in "${key}"`);
        break;
      }
    }
    
    // Look for GLB binary data (alternative format)
    for (const key of possibleGlbKeys) {
      const value = (outputs as any)[key] || (completedResponse as any)[key];
      if (value && typeof value === 'string' && !value.startsWith('http') && value.length > 100) {
        glbBinaryData = value;
        console.log(`🎯 Found base64 GLB data in "${key}"`);
        break;
      }
    }

    // Debug all available output keys
    console.log('🔍 Available output keys:', {
      outputKeys: Object.keys(outputs),
      responseKeys: Object.keys(completedResponse),
      hasGltfData: !!gltfBase64Data,
      hasGlbData: !!glbBinaryData
    });

    // If we have base64 data, convert it to a blob URL
    if (gltfBase64Data || glbBinaryData) {
      try {
        console.log('🔄 Converting base64 data to blob URL...');
        
        if (glbBinaryData) {
          // Handle GLB (binary GLTF) format
          console.log('📦 Processing GLB binary data...');
          
          // GLB is a binary format, decode and create blob directly
          const binaryData = Uint8Array.from(atob(glbBinaryData), c => c.charCodeAt(0));
          console.log('📄 GLB binary data length:', binaryData.length);
          
          // Validate GLB header (should start with "glTF")
          const header = String.fromCharCode(...binaryData.slice(0, 4));
          if (header !== 'glTF') {
            console.warn('⚠️  GLB header validation failed, treating as raw binary');
          }
          
          // Create blob for GLB format
          const glbBlob = new Blob([binaryData], { type: 'model/gltf-binary' });
          gltfUrl = URL.createObjectURL(glbBlob);
          
          console.log('✅ Successfully created GLB blob URL');
          
          // Debug tools for GLB
          (window as any).zooGLBData = glbBinaryData;
          (window as any).downloadZooGLB = (filename: string = 'zoo-model.glb') => {
            const binaryData = Uint8Array.from(atob(glbBinaryData), c => c.charCodeAt(0));
            const blob = new Blob([binaryData], { type: 'model/gltf-binary' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('✅ Downloaded GLB file:', filename);
          };
          
        } else if (gltfBase64Data) {
          // Handle GLTF (JSON) format
          console.log('📄 Processing GLTF JSON data...');
          
          // Decode base64 to get the GLTF JSON
          const gltfJsonString = atob(gltfBase64Data);
          console.log('📄 Decoded GLTF preview:', gltfJsonString.substring(0, 200) + '...');
          
          // Parse and enhance GLTF structure
          let gltfObject;
          try {
            gltfObject = JSON.parse(gltfJsonString);
            console.log('✅ GLTF JSON parsed successfully');
            
            // Validate essential GLTF components
            const validationResults = this.validateGLTFCompleteness(gltfObject);
            console.log('🔍 GLTF validation:', validationResults);
            
            if (!validationResults.isComplete) {
              console.log('⚠️  GLTF data needs enhancement:', validationResults.missingComponents);
              // Try to enhance the GLTF if possible
              gltfObject = this.enhanceGLTFStructure(gltfObject);
              
              // Re-validate after enhancement
              const postEnhancementValidation = this.validateGLTFCompleteness(gltfObject);
              if (postEnhancementValidation.isComplete) {
                console.log('✅ GLTF enhancement successful - all components now present');
              } else {
                console.warn('⚠️  Some GLTF components still missing after enhancement:', postEnhancementValidation.missingComponents);
              }
            } else {
              console.log('✅ GLTF data is complete - no enhancement needed');
            }
            
            // Convert back to string with enhanced structure
            const enhancedGltfString = JSON.stringify(gltfObject, null, 2);
            
            // Create blob with enhanced GLTF
            const gltfBlob = new Blob([enhancedGltfString], { type: 'model/gltf+json' });
            gltfUrl = URL.createObjectURL(gltfBlob);
            
            console.log('✅ Successfully created enhanced GLTF blob URL');
            
          } catch (parseError) {
            console.error('❌ Invalid GLTF JSON structure:', parseError);
            // Still try to create blob with raw data
            const gltfBlob = new Blob([gltfJsonString], { type: 'model/gltf+json' });
            gltfUrl = URL.createObjectURL(gltfBlob);
            console.log('⚠️  Created blob with raw GLTF data (may be incomplete)');
          }
          
          // Enhanced debug tools
          (window as any).zooGLTFData = gltfBase64Data;
          (window as any).zooGLTFObject = gltfObject;
          (window as any).downloadZooGLTF = (filename: string = 'zoo-model.gltf') => {
            const jsonString = atob(gltfBase64Data);
            const blob = new Blob([jsonString], { type: 'model/gltf+json' });
            const url = URL.createObjectURL(blob);
            
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            
            console.log('✅ Downloaded GLTF file:', filename);
          };
        }
        
        console.log('🎯 Enhanced Debug Tools Available:');
        if (glbBinaryData) {
          console.log('- window.zooGLBData contains the base64 GLB data');
          console.log('- window.downloadZooGLB() to download the GLB file');
        }
        if (gltfBase64Data) {
          console.log('- window.zooGLTFData contains the base64 GLTF data');
          console.log('- window.zooGLTFObject contains the parsed GLTF object');
          console.log('- window.downloadZooGLTF() to download the GLTF file');
        }
        
        // Verify the blob URL is accessible and complete
        if (gltfUrl) {
          fetch(gltfUrl)
            .then(response => response.arrayBuffer())
            .then(data => {
              console.log('✅ Blob URL verification successful, data size:', data.byteLength, 'bytes');
              
              // Additional validation for GLTF content
              if (gltfUrl && gltfUrl.includes('gltf+json')) {
                const textData = new TextDecoder().decode(data);
                const parsedData = JSON.parse(textData);
                console.log('📊 GLTF content validation:', {
                  hasAsset: !!parsedData.asset,
                  meshCount: parsedData.meshes?.length || 0,
                  nodeCount: parsedData.nodes?.length || 0,
                  bufferCount: parsedData.buffers?.length || 0,
                  accessorCount: parsedData.accessors?.length || 0,
                  sceneCount: parsedData.scenes?.length || 0
                });
              }
            })
            .catch(error => {
              console.error('❌ Blob URL verification failed:', error);
            });
        }
        
      } catch (decodeError) {
        console.error('❌ Failed to decode base64 data:', decodeError);
        console.log('🔄 Attempting alternative decoding methods...');
        
        // Try alternative decoding approach
        try {
          if (gltfBase64Data) {
            // Sometimes base64 might need padding
            const paddedData = gltfBase64Data + '='.repeat((4 - gltfBase64Data.length % 4) % 4);
            const alternativeJsonString = atob(paddedData);
            const gltfBlob = new Blob([alternativeJsonString], { type: 'model/gltf+json' });
            gltfUrl = URL.createObjectURL(gltfBlob);
            console.log('✅ Alternative decoding successful');
          }
        } catch (altError) {
          console.error('❌ Alternative decoding also failed:', altError);
        }
      }
    }
    
    // Also check for direct URLs in the response root (fallback)
    if (!gltfUrl) {
      gltfUrl = completedResponse.gltf || completedResponse.model_url || completedResponse.download_url;
    }
    
    // Check for nested output structures
    if (!gltfUrl && completedResponse.result) {
      const result = completedResponse.result;
      gltfUrl = result.gltf || result.model_url || result.download_url || result.file;
    }
    
    console.log('🔍 Output analysis:', {
      hasOutputs: !!completedResponse.outputs,
      hasOutput: !!completedResponse.output,
      hasResult: !!completedResponse.result,
      hasBase64Gltf: !!gltfBase64Data,
      outputKeys: Object.keys(outputs),
      responseKeys: Object.keys(completedResponse),
      gltfUrl: gltfUrl ? (gltfUrl.startsWith('blob:') ? 'blob:// URL created' : gltfUrl.substring(0, 100) + '...') : 'none found'
    });
    
    // If no direct GLTF URL, try to get it via conversion
    if (!gltfUrl) {
      console.log('No direct GLTF output, attempting to get model URL from Zoo API...');
      try {
        // First try to get the model data again (might have been updated)
        const refreshedResponse = await this.getCADModel(completedResponse.id);
        
        // Check the refreshed response for URLs
        const refreshedOutputs = refreshedResponse.outputs || refreshedResponse.output || {};
        gltfUrl = refreshedOutputs.gltf || refreshedOutputs.glb || refreshedOutputs.model || refreshedOutputs.file;
        
        if (!gltfUrl) {
          gltfUrl = refreshedResponse.gltf || refreshedResponse.model_url || refreshedResponse.download_url;
        }
        
        console.log('🔄 Refreshed model check:', {
          foundUrl: !!gltfUrl,
          url: gltfUrl ? gltfUrl.substring(0, 100) + '...' : 'none'
        });
      } catch (refreshError) {
        console.warn('Failed to refresh model data:', refreshError);
      }
      
      // If still no URL, try conversion
      if (!gltfUrl) {
        try {
          console.log('Attempting format conversion...');
          const convertResult = await this.convertCADFormat(completedResponse.id, 'gltf');
          gltfUrl = convertResult.download_url;
          console.log('✅ Conversion successful, GLTF URL:', gltfUrl ? gltfUrl.substring(0, 100) + '...' : 'none');
        } catch (convertError) {
          console.warn('Failed to convert to GLTF, trying alternative approach:', convertError);
          
          // As a fallback, construct URLs based on common patterns
          const fallbackUrls = [
            `https://api.zoo.dev/user/text-to-cad/${completedResponse.id}/download?format=gltf`,
            `https://api.zoo.dev/models/${completedResponse.id}/download?format=gltf`,
            `https://api.zoo.dev/file/${completedResponse.id}.gltf`,
            `https://api.zoo.dev/user/text-to-cad/${completedResponse.id}.gltf`
          ];
          
          // Try the first fallback URL
          gltfUrl = fallbackUrls[0];
          console.log('🔄 Using fallback GLTF URL:', gltfUrl);
          
          // TODO: Could test these URLs to see which one works
        }
      }
    }
    
    if (!gltfUrl) {
      console.error('No GLTF URL available after all attempts. Full response:', JSON.stringify(completedResponse, null, 2));
      throw new Error(`No GLTF output available. Status: ${completedResponse.status}. Available outputs: ${Object.keys(outputs).join(', ')}. Response keys: ${Object.keys(completedResponse).join(', ')}`);
    }

    console.log('✅ Final GLTF URL:', gltfUrl ? gltfUrl.substring(0, 100) + '...' : 'none');

    // Transform to CADModel format
    return {
      id: completedResponse.id,
      prompt: enhancement.enhancedPrompt, // Use enhanced prompt
      originalPrompt: request.prompt, // Keep original for reference
      enhancementInfo: {
        source: enhancement.source,
        confidence: enhancement.confidence,
        wasEnhanced: enhancement.source !== 'original'
      },
      gltfUrl: gltfUrl,
      shareableGltfUrl: originalDownloadableUrl && originalDownloadableUrl.startsWith('http') ? originalDownloadableUrl : null,
      // NEW: Store base64 data for cross-device reconstruction  
      base64Data: gltfBase64Data || glbBinaryData,
      base64Format: glbBinaryData ? 'glb' : (gltfBase64Data ? 'gltf' : null),
      thumbnailUrl: outputs.thumbnail || outputs.preview || outputs.image || completedResponse.thumbnail,
      formats: {
        gltf: gltfUrl,
        shareableGltf: originalDownloadableUrl && originalDownloadableUrl.startsWith('http') ? originalDownloadableUrl : null,
        // Store base64 for cross-device sharing
        base64: gltfBase64Data || glbBinaryData,
        base64Format: glbBinaryData ? 'glb' : (gltfBase64Data ? 'gltf' : null),
        ...(outputs.thumbnail && { thumbnail: outputs.thumbnail }),
        ...(completedResponse.thumbnail && { thumbnail: completedResponse.thumbnail })
      },
      properties: {
        dimensions: { width: 100, height: 100, depth: 100 }, // Placeholder - would come from API
        volume: 1000000, // Placeholder - would come from API
        surfaceArea: 60000, // Placeholder - would come from API
        complexity: 'moderate' // Placeholder - would be analyzed
      }
    };
  }

  async exportCADModel(model: CADModel, options: CADExportOptions): Promise<{ downloadUrl: string; filename: string }> {
    try {
      if (options.format === 'gltf' && model.gltfUrl) {
        // Direct download for GLTF
        return {
          downloadUrl: model.gltfUrl,
          filename: `${model.id}.gltf`
        };
      }

      if (options.format === 'stl') {
        // Client-side STL conversion from GLTF
        console.log('🔄 Converting GLTF to STL format...');
        console.log('🔧 FIX: Using viewer scale option:', options.useViewerScale);
        
        // NEW FIX: Pass viewer scale option to conversion
        const stlData = await this.convertGLTFToSTL(model.gltfUrl, options.useViewerScale);
        
        // Create blob URL for STL data
        const stlBlob = new Blob([stlData], { type: 'application/vnd.ms-pki.stl' });
        const downloadUrl = URL.createObjectURL(stlBlob);
        
        const scaleNote = options.useViewerScale ? '_viewer_scale' : '_original';
        console.log('✅ STL conversion successful with scale option:', scaleNote);
        return {
          downloadUrl,
          filename: `${model.id}${scaleNote}.stl`
        };
      }

      // Try Zoo API conversion for other formats
      const conversionResult = await this.convertCADFormat(model.id, options.format);
      
      return {
        downloadUrl: conversionResult.download_url,
        filename: `${model.id}.${options.format}`
      };
    } catch (error) {
      console.error('Export error:', error);
      throw new Error(`Failed to export model: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async convertGLTFToSTL(gltfUrl: string, useViewerScale: boolean = false): Promise<string> {
    try {
      console.log('🔄 Starting GLTF to STL conversion...');
      
      // Fetch the GLTF data
      const response = await fetch(gltfUrl);
      let gltfData: any;
      
      if (gltfUrl.includes('model/gltf-binary')) {
        // Handle GLB (binary GLTF) format
        console.log('📦 Processing GLB binary format...');
        const arrayBuffer = await response.arrayBuffer();
        gltfData = this.parseGLB(arrayBuffer);
      } else {
        // Handle GLTF JSON format
        console.log('📄 Processing GLTF JSON format...');
        gltfData = await response.json();
      }
      
      console.log('📊 GLTF data loaded:', {
        meshes: gltfData.meshes?.length || 0,
        nodes: gltfData.nodes?.length || 0,
        accessors: gltfData.accessors?.length || 0,
        buffers: gltfData.buffers?.length || 0
      });
      
      // Extract mesh data and convert to STL
      const stlContent = this.generateSTLFromGLTF(gltfData, useViewerScale);
      console.log('✅ STL conversion completed');
      
      return stlContent;
    } catch (error) {
      console.error('❌ GLTF to STL conversion failed:', error);
      throw new Error(`Failed to convert GLTF to STL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private parseGLB(arrayBuffer: ArrayBuffer): any {
    // Basic GLB parser - extracts JSON chunk
    const view = new DataView(arrayBuffer);
    
    // Check GLB header
    const magic = view.getUint32(0, true);
    if (magic !== 0x46546C67) { // "glTF" in little-endian
      throw new Error('Invalid GLB file format');
    }
    
    const version = view.getUint32(4, true);
    const length = view.getUint32(8, true);
    
    console.log('📦 GLB header:', { version, length });
    
    // Read JSON chunk
    let offset = 12;
    const chunkLength = view.getUint32(offset, true);
    const chunkType = view.getUint32(offset + 4, true);
    
    if (chunkType !== 0x4E4F534A) { // "JSON" in little-endian
      throw new Error('Expected JSON chunk in GLB');
    }
    
    const jsonBytes = new Uint8Array(arrayBuffer, offset + 8, chunkLength);
    const jsonString = new TextDecoder().decode(jsonBytes);
    
    return JSON.parse(jsonString);
  }

  private generateSTLFromGLTF(gltfData: any, useViewerScale: boolean = false): string {
    console.log('🔄 Generating STL from GLTF mesh data...');
    console.log('🔧 FIX: Viewer scale option enabled:', useViewerScale);
    
    if (!gltfData.meshes || gltfData.meshes.length === 0) {
      throw new Error('No meshes found in GLTF data');
    }
    
    // Calculate viewer scale if needed (same logic as ModelViewer3D)
    let viewerScale = 1;
    let centerOffset = [0, 0, 0];
    
    if (useViewerScale) {
      console.log('📏 Calculating viewer scale transformations...');
      const bounds = this.calculateGLTFBounds(gltfData);
      const maxDimension = Math.max(bounds.width, bounds.height, bounds.depth);
      viewerScale = maxDimension > 0 ? 4 / maxDimension : 1;
      centerOffset = [
        -bounds.center[0] * viewerScale,
        -bounds.center[1] * viewerScale,
        -bounds.center[2] * viewerScale
      ];
      console.log('📐 Viewer transformations:', { viewerScale, centerOffset });
    }
    
    let stlContent = 'solid model\n';
    let triangleCount = 0;
    
    // Process each mesh
    for (let meshIndex = 0; meshIndex < gltfData.meshes.length; meshIndex++) {
      const mesh = gltfData.meshes[meshIndex];
      console.log(`📐 Processing mesh ${meshIndex}:`, mesh.name || `mesh_${meshIndex}`);
      
      // Process each primitive in the mesh
      for (let primIndex = 0; primIndex < mesh.primitives.length; primIndex++) {
        const primitive = mesh.primitives[primIndex];
        
        try {
          const vertices = this.extractVertices(gltfData, primitive);
          const indices = this.extractIndices(gltfData, primitive);
          
          console.log(`📊 Primitive ${primIndex}: ${vertices.length/3} vertices, ${indices ? indices.length/3 : vertices.length/9} triangles`);
          
          // Generate triangles
          if (indices) {
            // Indexed geometry
            for (let i = 0; i < indices.length; i += 3) {
              const i1 = indices[i] * 3;
              const i2 = indices[i + 1] * 3;
              const i3 = indices[i + 2] * 3;
              
              let v1 = [vertices[i1], vertices[i1 + 1], vertices[i1 + 2]];
              let v2 = [vertices[i2], vertices[i2 + 1], vertices[i2 + 2]];
              let v3 = [vertices[i3], vertices[i3 + 1], vertices[i3 + 2]];
              
              // Apply viewer transformations if enabled
              if (useViewerScale) {
                v1 = this.applyViewerTransform(v1, viewerScale, centerOffset);
                v2 = this.applyViewerTransform(v2, viewerScale, centerOffset);
                v3 = this.applyViewerTransform(v3, viewerScale, centerOffset);
              }
              
              const normal = this.calculateNormal(v1, v2, v3);
              stlContent += this.formatSTLTriangle(normal, v1, v2, v3);
              triangleCount++;
            }
          } else {
            // Non-indexed geometry
            for (let i = 0; i < vertices.length; i += 9) {
              let v1 = [vertices[i], vertices[i + 1], vertices[i + 2]];
              let v2 = [vertices[i + 3], vertices[i + 4], vertices[i + 5]];
              let v3 = [vertices[i + 6], vertices[i + 7], vertices[i + 8]];
              
              // Apply viewer transformations if enabled
              if (useViewerScale) {
                v1 = this.applyViewerTransform(v1, viewerScale, centerOffset);
                v2 = this.applyViewerTransform(v2, viewerScale, centerOffset);
                v3 = this.applyViewerTransform(v3, viewerScale, centerOffset);
              }
              
              const normal = this.calculateNormal(v1, v2, v3);
              stlContent += this.formatSTLTriangle(normal, v1, v2, v3);
              triangleCount++;
            }
          }
        } catch (primitiveError) {
          console.warn(`⚠️  Failed to process primitive ${primIndex}:`, primitiveError);
        }
      }
    }
    
    stlContent += 'endsolid model\n';
    
    console.log(`✅ STL generation complete: ${triangleCount} triangles`);
    return stlContent;
  }

  private extractVertices(gltfData: any, primitive: any): Float32Array {
    const positionAccessorIndex = primitive.attributes.POSITION;
    if (positionAccessorIndex === undefined) {
      throw new Error('No POSITION attribute found in primitive');
    }
    
    const accessor = gltfData.accessors[positionAccessorIndex];
    const bufferView = gltfData.bufferViews[accessor.bufferView];
    
    // For blob URLs, we need to get the data differently
    if (gltfData.buffers[bufferView.buffer].uri?.startsWith('data:')) {
      // Handle embedded buffer data
      const buffer = gltfData.buffers[bufferView.buffer];
      const dataUri = buffer.uri;
      const base64Data = dataUri.split(',')[1];
      const binaryData = atob(base64Data);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < binaryData.length; i++) {
        view[i] = binaryData.charCodeAt(i);
      }
      
      const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
      const vertices = new Float32Array(arrayBuffer, start, accessor.count * 3);
      return vertices;
    } else {
      // For now, return empty array if we can't access buffer data
      console.warn('⚠️  Cannot access buffer data for vertex extraction');
      return new Float32Array([]);
    }
  }

  private extractIndices(gltfData: any, primitive: any): Uint16Array | Uint32Array | null {
    if (primitive.indices === undefined) {
      return null; // Non-indexed geometry
    }
    
    const accessor = gltfData.accessors[primitive.indices];
    const bufferView = gltfData.bufferViews[accessor.bufferView];
    
    // Similar buffer access logic as vertices
    if (gltfData.buffers[bufferView.buffer].uri?.startsWith('data:')) {
      const buffer = gltfData.buffers[bufferView.buffer];
      const dataUri = buffer.uri;
      const base64Data = dataUri.split(',')[1];
      const binaryData = atob(base64Data);
      const arrayBuffer = new ArrayBuffer(binaryData.length);
      const view = new Uint8Array(arrayBuffer);
      for (let i = 0; i < binaryData.length; i++) {
        view[i] = binaryData.charCodeAt(i);
      }
      
      const start = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
      
      // Choose appropriate array type based on component type
      if (accessor.componentType === 5123) { // UNSIGNED_SHORT
        return new Uint16Array(arrayBuffer, start, accessor.count);
      } else if (accessor.componentType === 5125) { // UNSIGNED_INT
        return new Uint32Array(arrayBuffer, start, accessor.count);
      }
    }
    
    console.warn('⚠️  Cannot access buffer data for index extraction');
    return null;
  }

  private calculateNormal(v1: number[], v2: number[], v3: number[]): number[] {
    // Calculate normal vector using cross product
    const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
    const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
    
    const normal = [
      edge1[1] * edge2[2] - edge1[2] * edge2[1],
      edge1[2] * edge2[0] - edge1[0] * edge2[2],
      edge1[0] * edge2[1] - edge1[1] * edge2[0]
    ];
    
    // Normalize
    const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
    if (length > 0) {
      normal[0] /= length;
      normal[1] /= length;
      normal[2] /= length;
    }
    
    return normal;
  }

  private formatSTLTriangle(normal: number[], v1: number[], v2: number[], v3: number[]): string {
    return `  facet normal ${normal[0].toFixed(6)} ${normal[1].toFixed(6)} ${normal[2].toFixed(6)}
    outer loop
      vertex ${v1[0].toFixed(6)} ${v1[1].toFixed(6)} ${v1[2].toFixed(6)}
      vertex ${v2[0].toFixed(6)} ${v2[1].toFixed(6)} ${v2[2].toFixed(6)}
      vertex ${v3[0].toFixed(6)} ${v3[1].toFixed(6)} ${v3[2].toFixed(6)}
    endloop
  endfacet
`;
  }

  async estimateManufacturingCost(model: CADModel, material: string = 'PLA'): Promise<{
    material: string;
    volume: number;
    cost: number;
    currency: string;
  }> {
    // Simplified cost estimation - in real implementation, this would use Zoo API or third-party service
    const volumeInCm3 = model.properties.volume / 1000; // Convert mm³ to cm³
    const materialCosts = {
      'PLA': 0.025, // USD per cm³
      'ABS': 0.03,
      'PETG': 0.035,
      'Aluminum': 0.15,
      'Steel': 0.12
    };
    
    const costPerCm3 = materialCosts[material as keyof typeof materialCosts] || materialCosts.PLA;
    const baseCost = volumeInCm3 * costPerCm3;
    
    // Add complexity multiplier
    const complexityMultiplier = model.properties.complexity === 'simple' ? 1.0 : 
                                model.properties.complexity === 'moderate' ? 1.2 : 1.5;
    
    return {
      material,
      volume: volumeInCm3,
      cost: Math.round(baseCost * complexityMultiplier * 100) / 100,
      currency: 'USD'
    };
  }

  // Get professional example prompts based on Zoo documentation
  getExamplePrompts(): string[] {
    return [
      "involute helical gear with 36 teeth, 50mm diameter, 10mm thickness",
      "rectangular plate with 4 holes near each corner and rounded corners, 200mm × 100mm × 5mm thick",
      "smartphone case with rounded corners, camera cutout 30mm diameter, 150mm × 75mm × 8mm thick",
      "desk pen holder with 3 compartments, 80mm diameter, 100mm tall, 2mm wall thickness",
      "wall mounting bracket with 2 bolt holes, 100mm wide, 50mm deep, 5mm thick",
      "simple bookend with L-shape, 150mm tall, 100mm deep, 10mm thick with rounded edges",
      "cable organizer tray with 5 slots, 200mm × 50mm × 30mm deep, 3mm wall thickness",
      "phone stand with adjustable angle, 100mm wide base, 80mm tall, with cable slot",
      "plant pot with drainage holes, 120mm diameter, 100mm tall, 3mm wall thickness",
      "laptop stand with ventilation slots, 300mm wide, 200mm deep, adjustable height"
    ];
  }

  // Get Zoo's VERIFIED working examples from their blog post (these should always work)
  getZooVerifiedExamples(): string[] {
    return [
      "involute helical gear with 36 teeth",
      "a 9 pointed star", 
      "create a plate with 4 holes near each corner and rounded corners",
      "a sketch of a christmas tree with a star on top"
    ];
  }

  /**
   * Test method to validate Zoo API with known working examples
   */
  async testWithZooExamples(): Promise<void> {
    console.log('🧪 Testing Zoo API with verified working examples...');
    
    const examples = this.getZooVerifiedExamples();
    
    for (const example of examples.slice(0, 1)) { // Test just the first one
      try {
        console.log(`🔍 Testing: "${example}"`);
        
        const request: CADGenerationRequest = {
          prompt: example,
          outputFormat: 'gltf',
          units: 'mm'
        };

        // Skip enhancement for verified examples to test Zoo API directly
        const result = await this.generateAndWaitForCAD(request, true);
        console.log(`✅ Test successful for: "${example}" - GLTF URL: ${result.gltfUrl}`);
        
        break; // Stop after first successful test
      } catch (error) {
        console.error(`❌ Test failed for: "${example}"`, error);
      }
    }
  }

  /**
   * Test prompt enhancement with various problematic prompts
   */
  async testPromptEnhancement(): Promise<void> {
    console.log('🧪 Testing prompt enhancement system...');
    
    const testPrompts = [
      "long board with long edges and ribbons",
      "phone case",
      "box for tools", 
      "gear",
      "plate with holes",
      "involute helical gear with 36 teeth", // Should stay unchanged
      "cutting board",
      "circuit board",
      "skateboard"
    ];

    for (const prompt of testPrompts) {
      try {
        console.log(`\n🔍 Testing prompt: "${prompt}"`);
        const enhancement = await this.enhancePromptForCAD(prompt);
        console.log(`   ✅ Enhanced to: "${enhancement.enhancedPrompt}"`);
        console.log(`   📊 Source: ${enhancement.source}, Confidence: ${enhancement.confidence}`);
        
                  // Check if enhanced prompt is AgenticadML-compatible
          const isCompatible = this.isAgenticadCompatiblePrompt(enhancement.enhancedPrompt.toLowerCase());
          console.log(`   🎯 AgenticadML-compatible: ${isCompatible ? '✅ Yes' : '❌ No'}`);
        
      } catch (error) {
        console.error(`   ❌ Enhancement failed:`, error);
      }
    }
    
    console.log('\n🏁 Prompt enhancement testing complete!');
  }

  /**
   * Debug utility to inspect GLTF data from Zoo API
   */
  debugGLTFData(base64Data: string): void {
    try {
      console.log('🔍 Debugging GLTF data...');
      console.log('Base64 data length:', base64Data.length);
      console.log('Base64 first 100 chars:', base64Data.substring(0, 100));
      
      // Decode the base64
      const jsonString = atob(base64Data);
      console.log('Decoded JSON length:', jsonString.length);
      console.log('Decoded JSON first 500 chars:', jsonString.substring(0, 500));
      
      // Try to parse as JSON
      const gltfObject = JSON.parse(jsonString);
      console.log('✅ Valid GLTF JSON structure:');
      console.log('- Asset:', gltfObject.asset);
      console.log('- Accessors:', gltfObject.accessors?.length || 0);
      console.log('- Buffers:', gltfObject.buffers?.length || 0);
      console.log('- BufferViews:', gltfObject.bufferViews?.length || 0);
      console.log('- Materials:', gltfObject.materials?.length || 0);
      console.log('- Meshes:', gltfObject.meshes?.length || 0);
      console.log('- Nodes:', gltfObject.nodes?.length || 0);
      console.log('- Scenes:', gltfObject.scenes?.length || 0);
      console.log('- Scene:', gltfObject.scene);
      
      // Check if it has embedded buffer data
      if (gltfObject.buffers) {
        gltfObject.buffers.forEach((buffer: any, index: number) => {
          console.log(`Buffer ${index}:`, {
            byteLength: buffer.byteLength,
            hasUri: !!buffer.uri,
            hasEmbeddedData: buffer.uri?.startsWith('data:')
          });
        });
      }
      
    } catch (error) {
      console.error('❌ Error debugging GLTF data:', error);
    }
  }

  // Enhanced prompt validation based on Zoo ML-ephant best practices
  validatePrompt(prompt: string): { valid: boolean; suggestions?: string[] } {
    const minLength = 15; // Increased for more detailed prompts
    const maxLength = 500;
    
    if (prompt.length < minLength) {
      return {
        valid: false,
        suggestions: [
          'Add specific dimensions (e.g., "200mm wide, 50mm thick")',
          'Include technical features (holes, chamfers, fillets, cuts)',
          'Specify the intended function or use case'
        ]
      };
    }
    
    if (prompt.length > maxLength) {
      return {
        valid: false,
        suggestions: [
          'Keep the description more concise',
          'Focus on the essential geometric features', 
          'Remove unnecessary narrative details'
        ]
      };
    }

    // Check for specific technical terms that work well with Zoo
    const technicalTerms = ['mm', 'cm', 'holes', 'diameter', 'thick', 'wide', 'long', 'chamfer', 'fillet', 'cut', 'bolt', 'screw', 'gear', 'teeth'];
    const hasTechnicalTerms = technicalTerms.some(term => 
      prompt.toLowerCase().includes(term)
    );

    // Check for vague nouns that Zoo says don't work well
    const vagueNouns = ['cover', 'case', 'box', 'thing', 'object', 'item', 'device'];
    const hasVagueTerms = vagueNouns.some(noun => 
      prompt.toLowerCase().includes(noun) && !prompt.includes('with') && !prompt.includes('holes')
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
  }

  private validateGLTFCompleteness(gltfObject: any): { isComplete: boolean; missingComponents: string[] } {
    const missingComponents: string[] = [];

    if (!gltfObject.asset) {
      missingComponents.push('asset');
    }
    if (!gltfObject.scenes || gltfObject.scenes.length === 0) {
      missingComponents.push('scenes');
    }
    if (!gltfObject.meshes || gltfObject.meshes.length === 0) {
      missingComponents.push('meshes');
    }
    if (!gltfObject.nodes || gltfObject.nodes.length === 0) {
      missingComponents.push('nodes');
    }
    if (!gltfObject.accessors || gltfObject.accessors.length === 0) {
      missingComponents.push('accessors');
    }
    if (!gltfObject.buffers || gltfObject.buffers.length === 0) {
      missingComponents.push('buffers');
    }
    
    // Materials are optional for simple models - only flag as missing if meshes reference materials that don't exist
    const needsMaterials = this.checkIfMaterialsNeeded(gltfObject);
    if (needsMaterials && (!gltfObject.materials || gltfObject.materials.length === 0)) {
      missingComponents.push('materials');
    }

    return {
      isComplete: missingComponents.length === 0,
      missingComponents
    };
  }

  private checkIfMaterialsNeeded(gltfObject: any): boolean {
    // Check if any mesh primitives reference materials
    if (!gltfObject.meshes) return false;
    
    for (const mesh of gltfObject.meshes) {
      if (mesh.primitives) {
        for (const primitive of mesh.primitives) {
          if (primitive.material !== undefined) {
            return true; // Mesh references a material, so we need materials array
          }
        }
      }
    }
    
    return false; // No material references found, materials not needed
  }

  private enhanceGLTFStructure(gltfObject: any): any {
    console.log('🔧 Enhancing GLTF structure...');
    
    // Create a copy to avoid modifying the original
    const enhanced = JSON.parse(JSON.stringify(gltfObject));
    
    // Ensure basic asset information exists
    if (!enhanced.asset) {
      enhanced.asset = {
        version: "2.0",
        generator: "AgentiCAD Zoo Integration"
      };
      console.log('✅ Added missing asset information');
    }
    
    // Ensure scenes array exists
    if (!enhanced.scenes || enhanced.scenes.length === 0) {
      enhanced.scenes = [{ nodes: [0] }];
      console.log('✅ Added default scene');
    }
    
    // Ensure scene property exists (points to default scene)
    if (enhanced.scene === undefined && enhanced.scenes.length > 0) {
      enhanced.scene = 0;
      console.log('✅ Set default scene index');
    }
    
    // Ensure nodes array exists
    if (!enhanced.nodes || enhanced.nodes.length === 0) {
      enhanced.nodes = [{ mesh: 0 }];
      console.log('✅ Added default node');
    }
    
    // Add basic material if missing or needed
    const needsMaterials = this.checkIfMaterialsNeeded(enhanced);
    const hasMaterials = enhanced.materials && enhanced.materials.length > 0;
    
    if (needsMaterials && !hasMaterials) {
      console.log('🎨 Adding materials because mesh primitives reference them...');
      enhanced.materials = [{
        name: "Default Material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.8, 0.8, 0.8, 1.0],
          metallicFactor: 0.0,
          roughnessFactor: 0.9
        }
      }];
      console.log('✅ Added default material');
    } else if (!needsMaterials && !hasMaterials) {
      console.log('ℹ️  No materials needed - mesh primitives don\'t reference any materials');
      
      // Optionally add a basic material anyway for better rendering
      enhanced.materials = [{
        name: "Basic Material",
        pbrMetallicRoughness: {
          baseColorFactor: [0.7, 0.7, 0.7, 1.0],
          metallicFactor: 0.1,
          roughnessFactor: 0.8
        }
      }];
      
      // Update mesh primitives to use the material for better rendering
      if (enhanced.meshes) {
        enhanced.meshes.forEach((mesh: any, meshIndex: number) => {
          if (mesh.primitives) {
            mesh.primitives.forEach((primitive: any, primIndex: number) => {
              if (primitive.material === undefined) {
                primitive.material = 0;
                console.log(`✅ Added material reference to mesh ${meshIndex}, primitive ${primIndex}`);
              }
            });
          }
        });
      }
    } else if (hasMaterials) {
      console.log('✅ Materials already present, validating mesh references...');
      
      // Validate that material references are valid
      if (enhanced.meshes) {
        enhanced.meshes.forEach((mesh: any, meshIndex: number) => {
          if (mesh.primitives) {
            mesh.primitives.forEach((primitive: any, primIndex: number) => {
              if (primitive.material !== undefined) {
                if (primitive.material >= enhanced.materials.length) {
                  console.warn(`⚠️  Mesh ${meshIndex}, primitive ${primIndex} references invalid material ${primitive.material}`);
                  primitive.material = 0; // Use first material as fallback
                }
              }
            });
          }
        });
      }
    }
    
    // Update mesh primitives to use the material (legacy code - keeping for compatibility)
    if (enhanced.meshes && enhanced.materials && enhanced.materials.length > 0) {
      enhanced.meshes.forEach((mesh: any) => {
        if (mesh.primitives) {
          mesh.primitives.forEach((primitive: any) => {
            if (primitive.material === undefined) {
              primitive.material = 0;
            }
          });
        }
      });
    }
    
    // Validate buffer references
    if (enhanced.buffers && enhanced.buffers.length > 0) {
      enhanced.buffers.forEach((buffer: any, index: number) => {
        if (!buffer.byteLength || buffer.byteLength <= 0) {
          console.warn(`⚠️  Buffer ${index} has invalid or missing byteLength`);
          // Try to calculate from buffer views if possible
          if (enhanced.bufferViews) {
            const maxOffset = enhanced.bufferViews
              .filter((bv: any) => bv.buffer === index)
              .reduce((max: number, bv: any) => Math.max(max, (bv.byteOffset || 0) + bv.byteLength), 0);
            if (maxOffset > 0) {
              buffer.byteLength = maxOffset;
              console.log(`✅ Calculated buffer ${index} byteLength: ${maxOffset}`);
            }
          }
        }
        
        // If buffer has no URI and no embedded data, it might be external
        if (!buffer.uri) {
          console.warn(`⚠️  Buffer ${index} has no URI - may be missing binary data`);
        }
      });
    }
    
    // Validate accessor bounds
    if (enhanced.accessors) {
      enhanced.accessors.forEach((accessor: any, index: number) => {
        if (!accessor.componentType || !accessor.type || accessor.count === undefined) {
          console.warn(`⚠️  Accessor ${index} is missing required properties`);
        }
        
        // Add bounds if missing (helps with rendering optimization)
        if (!accessor.min || !accessor.max) {
          // For now, just add placeholder bounds - a full implementation would calculate these
          if (accessor.type === 'VEC3') {
            accessor.min = accessor.min || [-1, -1, -1];
            accessor.max = accessor.max || [1, 1, 1];
          } else if (accessor.type === 'VEC2') {
            accessor.min = accessor.min || [0, 0];
            accessor.max = accessor.max || [1, 1];
          }
        }
      });
    }
    
    console.log('🔧 GLTF structure enhancement complete');
    return enhanced;
  }

  // NEW FIX: Helper methods for viewer scale transformations  
  private calculateGLTFBounds(gltfData: any): { width: number; height: number; depth: number; center: number[] } {
    console.log('📏 Calculating GLTF bounds for viewer scaling...');
    
    let minX = Infinity, minY = Infinity, minZ = Infinity;
    let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
    let hasValidBounds = false;
    
    // IMPROVED: Consider node transforms and mesh hierarchy
    const processNode = (nodeIndex: number, parentTransform: number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) => {
      if (!gltfData.nodes || nodeIndex >= gltfData.nodes.length) return;
      
      const node = gltfData.nodes[nodeIndex];
      
      // Apply node transform if present
      let nodeTransform = parentTransform;
      if (node.matrix) {
        nodeTransform = this.multiplyMatrices(parentTransform, node.matrix);
      } else if (node.translation || node.rotation || node.scale) {
        // Build transform from TRS components
        const transform = this.buildTRSMatrix(
          node.translation || [0, 0, 0],
          node.rotation || [0, 0, 0, 1],
          node.scale || [1, 1, 1]
        );
        nodeTransform = this.multiplyMatrices(parentTransform, transform);
      }
      
      // Process mesh if node has one
      if (node.mesh !== undefined && gltfData.meshes) {
        const mesh = gltfData.meshes[node.mesh];
        if (mesh && mesh.primitives) {
          for (const primitive of mesh.primitives) {
            try {
              const vertices = this.extractVertices(gltfData, primitive);
              
              // Apply node transforms to vertices
              for (let i = 0; i < vertices.length; i += 3) {
                const transformedVertex = this.transformVertex(
                  [vertices[i], vertices[i + 1], vertices[i + 2]],
                  nodeTransform
                );
                
                minX = Math.min(minX, transformedVertex[0]);
                minY = Math.min(minY, transformedVertex[1]);
                minZ = Math.min(minZ, transformedVertex[2]);
                maxX = Math.max(maxX, transformedVertex[0]);
                maxY = Math.max(maxY, transformedVertex[1]);
                maxZ = Math.max(maxZ, transformedVertex[2]);
                hasValidBounds = true;
              }
            } catch (error) {
              console.warn('⚠️  Failed to extract vertices from mesh:', error);
            }
          }
        }
      }
      
      // Process child nodes
      if (node.children) {
        for (const childIndex of node.children) {
          processNode(childIndex, nodeTransform);
        }
      }
    };
    
    // Start processing from scene root nodes
    if (gltfData.scenes && gltfData.scenes.length > 0) {
      const scene = gltfData.scenes[gltfData.scene || 0];
      if (scene.nodes) {
        for (const nodeIndex of scene.nodes) {
          processNode(nodeIndex);
        }
      }
    } else {
      // Fallback: process all meshes without transforms (old approach)
      console.log('⚠️  No scene found, falling back to direct mesh processing');
      if (gltfData.meshes) {
        for (const mesh of gltfData.meshes) {
          for (const primitive of mesh.primitives) {
            try {
              const vertices = this.extractVertices(gltfData, primitive);
              for (let i = 0; i < vertices.length; i += 3) {
                minX = Math.min(minX, vertices[i]);
                minY = Math.min(minY, vertices[i + 1]);
                minZ = Math.min(minZ, vertices[i + 2]);
                maxX = Math.max(maxX, vertices[i]);
                maxY = Math.max(maxY, vertices[i + 1]);
                maxZ = Math.max(maxZ, vertices[i + 2]);
                hasValidBounds = true;
              }
            } catch (error) {
              console.warn('⚠️  Failed to extract vertices for bounds calculation:', error);
            }
          }
        }
      }
    }
    
    if (!hasValidBounds) {
      console.warn('⚠️  No valid bounds found, using default values');
      return { width: 1, height: 1, depth: 1, center: [0, 0, 0] };
    }
    
    // Calculate dimensions and center
    const width = Math.abs(maxX - minX);
    const height = Math.abs(maxY - minY);
    const depth = Math.abs(maxZ - minZ);
    const center = [
      (minX + maxX) / 2,
      (minY + maxY) / 2,
      (minZ + maxZ) / 2
    ];
    
    console.log('📐 GLTF bounds calculated:', { 
      bounds: { minX, minY, minZ, maxX, maxY, maxZ },
      dimensions: { width, height, depth }, 
      center 
    });
    return { width, height, depth, center };
  }

  private applyViewerTransform(vertex: number[], scale: number, centerOffset: number[]): number[] {
    return [
      (vertex[0] * scale) + centerOffset[0],
      (vertex[1] * scale) + centerOffset[1],
      (vertex[2] * scale) + centerOffset[2]
    ];
  }

  // Matrix math helpers for GLTF node transforms
  private multiplyMatrices(a: number[], b: number[]): number[] {
    const result = new Array(16);
    
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 4; j++) {
        result[i * 4 + j] = 
          a[i * 4 + 0] * b[0 * 4 + j] +
          a[i * 4 + 1] * b[1 * 4 + j] +
          a[i * 4 + 2] * b[2 * 4 + j] +
          a[i * 4 + 3] * b[3 * 4 + j];
      }
    }
    
    return result;
  }

  private buildTRSMatrix(translation: number[], rotation: number[], scale: number[]): number[] {
    const [x, y, z] = translation;
    const [qx, qy, qz, qw] = rotation;
    const [sx, sy, sz] = scale;
    
    // Build rotation matrix from quaternion
    const x2 = qx * 2, y2 = qy * 2, z2 = qz * 2;
    const xx = qx * x2, xy = qx * y2, xz = qx * z2;
    const yy = qy * y2, yz = qy * z2, zz = qz * z2;
    const wx = qw * x2, wy = qw * y2, wz = qw * z2;
    
    return [
      sx * (1 - (yy + zz)), sx * (xy + wz),       sx * (xz - wy),       x,
      sy * (xy - wz),       sy * (1 - (xx + zz)), sy * (yz + wx),       y,
      sz * (xz + wy),       sz * (yz - wx),       sz * (1 - (xx + yy)), z,
      0,                    0,                    0,                    1
    ];
  }

  private transformVertex(vertex: number[], matrix: number[]): number[] {
    const [x, y, z] = vertex;
    
    return [
      matrix[0] * x + matrix[4] * y + matrix[8]  * z + matrix[12],
      matrix[1] * x + matrix[5] * y + matrix[9]  * z + matrix[13],
      matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
    ];
  }

  /**
   * Validate if a prompt follows Zoo API best practices
   */
  private validateZooCompliance(prompt: string): boolean {
    const cleaned = prompt.toLowerCase().trim();
    
    // Must start with "design"
    if (!cleaned.startsWith('design')) {
      console.log('🚫 Zoo validation failed: Must start with "design"');
      return false;
    }
    
    // Must be short (under 80 characters)
    if (cleaned.length > 80) {
      console.log('🚫 Zoo validation failed: Too long (', cleaned.length, 'chars)');
      return false;
    }
    
    // Should not contain materials or manufacturing terms
    const invalidTerms = [
      'injection', 'molded', 'ABS', 'plastic', 'steel', 'aluminum', 
      'manufactured', 'machined', 'printed', '3d-printed', 'material',
      'construction', 'made of', 'with ABS', 'injection-molded'
    ];
    
    const hasInvalidTerms = invalidTerms.some(term => cleaned.includes(term));
    if (hasInvalidTerms) {
      console.log('🚫 Zoo validation failed: Contains invalid terms');
      return false;
    }
    
    // Should contain traditional mechanical terms
    const validTerms = [
      'bracket', 'bearing', 'connector', 'fastener', 'housing', 
      'plate', 'tube', 'bolt', 'rectangular', 'cylindrical', 
      'hexagonal', 'l-shaped', 'mounting', 'holes'
    ];
    
    const hasValidTerms = validTerms.some(term => cleaned.includes(term));
    if (!hasValidTerms) {
      console.log('🚫 Zoo validation failed: Missing traditional mechanical terms');
      return false;
    }
    
    console.log('✅ Zoo validation passed:', prompt);
    return true;
  }

  /**
   * Convert any prompt to a Zoo-compliant pattern based on user intent
   */
  private convertToZooPattern(originalPrompt: string): string {
    const cleaned = originalPrompt.toLowerCase().trim();
    
    console.log('🔄 Converting to Zoo pattern:', originalPrompt);
    
    // Map to simple Zoo patterns based on intent
    if (/phone|mobile|smartphone/.test(cleaned)) {
      if (/stand|holder|mount/.test(cleaned)) {
        return 'design a L-shaped bracket'; // Phone stands work best as L-brackets
      } else if (/case|cover/.test(cleaned)) {
        return 'design a rectangular housing';
      }
    }
    
    if (/bracket|mount|clamp/.test(cleaned)) {
      return 'design a L-shaped bracket';
    }
    
    if (/plate|board|panel/.test(cleaned)) {
      return 'design a rectangular plate with 4 holes';
    }
    
    if (/box|container|housing|case/.test(cleaned)) {
      return 'design a rectangular housing';
    }
    
    if (/tube|pipe|cylinder/.test(cleaned)) {
      return 'design a cylindrical tube';
    }
    
    if (/bolt|screw|fastener/.test(cleaned)) {
      return 'design a hexagonal bolt';
    }
    
    if (/bearing|housing/.test(cleaned)) {
      return 'design a cylindrical bearing housing';
    }
    
    if (/connector|coupler/.test(cleaned)) {
      return 'design a cylindrical connector';
    }
    
    if (/gear|wheel/.test(cleaned)) {
      return 'design a gear with teeth';
    }
    
    // Default to most reliable Zoo pattern
    console.log('🔧 Using default Zoo pattern for:', originalPrompt);
    return 'design a rectangular bracket';
  }
}

export const cadAI = new CADAIService(); 