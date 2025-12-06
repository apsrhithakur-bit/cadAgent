import type { 
  MultimodalInput, 
  GenerationRequest, 
  GenerationResponse, 
  ArchitecturalModel, 
  Room, 
  Door, 
  Window 
} from '../types/architectural';

interface PicaConfig {
  secretKey: string;
  openaiConnectionKey: string;
  geminiConnectionKey: string;
  elevenlabsConnectionKey: string;
}

class ProductDesignAIService {
  private config: PicaConfig;
  private baseUrl = 'https://api.picaos.com/v1/passthrough';
  private activeRequests: Map<string, Promise<any>> = new Map();
  private requestDebounce: Map<string, NodeJS.Timeout> = new Map();

  constructor() {
    this.config = {
      secretKey: import.meta.env.VITE_PICA_SECRET_KEY || '',
      openaiConnectionKey: import.meta.env.VITE_PICA_OPENAI_CONNECTION_KEY || '',
      geminiConnectionKey: import.meta.env.VITE_PICA_GEMINI_CONNECTION_KEY || '',
      elevenlabsConnectionKey: import.meta.env.VITE_PICA_ELEVENLABS_CONNECTION_KEY || ''
    };

    if (!this.config.secretKey) {
      console.warn('VITE_PICA_SECRET_KEY not found, AI functionality will be limited');
    }
  }

  /**
   * Prevent race conditions by deduplicating identical requests
   */
  private async deduplicateRequest<T>(
    requestKey: string,
    requestFn: () => Promise<T>,
    debounceMs: number = 100
  ): Promise<T> {
    // Check if there's already an active request for this key
    if (this.activeRequests.has(requestKey)) {
      console.log(`🔄 Deduplicating request: ${requestKey}`);
      return this.activeRequests.get(requestKey) as Promise<T>;
    }

    // Clear any existing debounce timer
    if (this.requestDebounce.has(requestKey)) {
      clearTimeout(this.requestDebounce.get(requestKey)!);
    }

    // Create the request promise
    const requestPromise = new Promise<T>((resolve, reject) => {
      const timer = setTimeout(async () => {
        this.requestDebounce.delete(requestKey);
        try {
          const result = await requestFn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          this.activeRequests.delete(requestKey);
        }
      }, debounceMs);

      this.requestDebounce.set(requestKey, timer);
    });

    // Store the active request
    this.activeRequests.set(requestKey, requestPromise);
    
    return requestPromise;
  }

  /**
   * Main method to process multimodal inputs and generate product design model
   */
  async generateModel(request: GenerationRequest): Promise<GenerationResponse> {
    const startTime = Date.now();
    const steps: string[] = [];

    try {
      steps.push('Processing inputs...');
      
      // Process different input modalities
      const processedInputs = await this.processInputs(request.inputs);
      steps.push('Inputs processed successfully');

      // Generate the product model using AI
      steps.push('Generating product model...');
      const model = await this.createProductModel(processedInputs, request.preferences, request.inputs);
      steps.push('Model generated successfully');

      // Generate alternatives
      steps.push('Creating alternative designs...');
      const alternatives = await this.generateAlternatives(model, 2);
      steps.push('Alternatives created');

      const processingTime = Date.now() - startTime;

      return {
        model,
        confidence: this.calculateConfidence(processedInputs),
        alternatives,
        processing: {
          duration: processingTime,
          steps,
          warnings: []
        }
      };

    } catch (error) {
      console.error('Error generating product model:', error);
      throw new Error('Failed to generate product model: ' + (error as Error).message);
    }
  }

  /**
   * Process multimodal inputs into structured data using AI
   */
  private async processInputs(inputs: MultimodalInput): Promise<any> {
    console.log('🔍 processInputs called with:', inputs);
    
    const processed: any = {
      requirements: [] as string[],
      constraints: [] as string[],
      style: 'modern',
      components: [] as string[],
      features: [] as string[],
      materials: [] as string[],
      dimensions: {} as any,
      manufacturing: {} as any,
      use_case: '' as string
    };

    // Process text input(s) with AI
    if (inputs.text) {
      const textInputs = Array.isArray(inputs.text) ? inputs.text : [inputs.text];
      
      for (const textInput of textInputs) {
        try {
          console.log('🔍 Analyzing text with AI:', textInput.content);
          const textAnalysis = await this.analyzeTextWithAI(textInput.content);
          console.log('📊 Text analysis result:', textAnalysis);
          
          processed.requirements.push(...(textAnalysis.requirements || []));
          processed.constraints.push(...(textAnalysis.constraints || []));
          processed.style = textAnalysis.style || 'modern';
          processed.components.push(...(textAnalysis.components || []));
          processed.features.push(...(textAnalysis.features || []));
          processed.materials.push(...(textAnalysis.materials || []));
          processed.dimensions = { ...processed.dimensions, ...(textAnalysis.dimensions || {}) };
          processed.manufacturing = { ...processed.manufacturing, ...(textAnalysis.manufacturing || {}) };
          processed.use_case = textAnalysis.use_case || processed.use_case || '';
        } catch (error) {
          console.warn('Text analysis failed, using fallback:', error);
          // Fallback to rule-based analysis
          const fallbackAnalysis = await this.analyzeTextFallback(textInput.content);
          Object.assign(processed, fallbackAnalysis);
        }
      }
    }

    // Process voice input(s) (convert to text then analyze)
    if (inputs.voice) {
      const voiceInputs = Array.isArray(inputs.voice) ? inputs.voice : [inputs.voice];
      
      for (const voiceInput of voiceInputs) {
        if (voiceInput.transcript) {
          try {
            const voiceAnalysis = await this.analyzeTextWithAI(voiceInput.transcript);
            processed.requirements.push(...(voiceAnalysis.requirements || []));
            processed.components.push(...(voiceAnalysis.components || []));
            processed.features.push(...(voiceAnalysis.features || []));
            processed.materials.push(...(voiceAnalysis.materials || []));
            if (voiceAnalysis.use_case) processed.use_case = voiceAnalysis.use_case;
          } catch (error) {
            console.warn('Voice analysis failed:', error);
            // Fallback to basic transcript parsing
            const fallbackAnalysis = await this.analyzeTextFallback(voiceInput.transcript);
            Object.assign(processed, fallbackAnalysis);
          }
        }
      }
    }

    // Process sketch input(s) with computer vision
    if (inputs.sketch) {
      const sketchInputs = Array.isArray(inputs.sketch) ? inputs.sketch : [inputs.sketch];
      
      for (const sketchInput of sketchInputs) {
        try {
          console.log('🔍 Analyzing sketch for product identification...');
          const sketchAnalysis = await this.analyzeImageWithAI(
            sketchInput.imageData, 
            'analyze_sketch',
            'Analyze this product design sketch and extract component information, dimensions, and assembly relationships.'
          );
          
          console.log('📊 Sketch analysis result:', sketchAnalysis);
          
          // Enhanced processing for visual-only inputs
          if (sketchAnalysis.mainObject) {
            processed.product_name = sketchAnalysis.mainObject;
          }
          if (sketchAnalysis.function) {
            processed.requirements.push(sketchAnalysis.function);
          }
          if (sketchAnalysis.technicalPrompt) {
            processed.visual_technical_prompt = sketchAnalysis.technicalPrompt;
          }
          
          processed.layout = sketchAnalysis.layout || processed.layout;
          processed.components.push(...(sketchAnalysis.components || []));
          processed.features.push(...(sketchAnalysis.features || []));
          processed.materials.push(...(sketchAnalysis.materials || []));
          processed.requirements.push(...(sketchAnalysis.requirements || []));
          processed.use_case = sketchAnalysis.use_case || processed.use_case;
          processed.style = sketchAnalysis.style || processed.style;
          
          if (sketchAnalysis.dimensions) processed.dimensions = { ...processed.dimensions, ...sketchAnalysis.dimensions };
          if (sketchAnalysis.manufacturing) processed.manufacturing = { ...processed.manufacturing, ...sketchAnalysis.manufacturing };
        } catch (error) {
          console.warn('Sketch analysis failed:', error);
          // Add fallback sketch analysis
          processed.components.push('sketch_derived_component');
          processed.features.push('visual_design');
          processed.use_case = 'sketch_based_product';
          processed.requirements.push('recreate_sketch_design');
          processed.visual_technical_prompt = 'design sketch based product';
        }
      }
    }

    // Process photo input(s) with computer vision
    if (inputs.photo) {
      const photoInputs = Array.isArray(inputs.photo) ? inputs.photo : [inputs.photo];
      
      for (const photoInput of photoInputs) {
        try {
          console.log('🔍 Analyzing photo for product identification...');
          const photoAnalysis = await this.analyzeImageWithAI(
            photoInput.imageData,
            'analyze_photo', 
            'Analyze this product photo and identify style, materials, and design features that should be incorporated into a new product design.'
          );
          
          console.log('📊 Photo analysis result:', photoAnalysis);
          
          // Enhanced processing for visual-only inputs
          if (photoAnalysis.mainObject) {
            processed.product_name = photoAnalysis.mainObject;
          }
          if (photoAnalysis.function) {
            processed.requirements.push(photoAnalysis.function);
          }
          if (photoAnalysis.technicalPrompt) {
            processed.visual_technical_prompt = photoAnalysis.technicalPrompt;
          }
          
          processed.style = photoAnalysis.style || processed.style;
          processed.features.push(...(photoAnalysis.features || []));
          processed.materials.push(...(photoAnalysis.materials || []));
          processed.components.push(...(photoAnalysis.components || []));
          processed.requirements.push(...(photoAnalysis.requirements || []));
          processed.use_case = photoAnalysis.use_case || processed.use_case;
          
          if (photoAnalysis.dimensions) processed.dimensions = { ...processed.dimensions, ...photoAnalysis.dimensions };
          if (photoAnalysis.manufacturing) processed.manufacturing = { ...processed.manufacturing, ...photoAnalysis.manufacturing };
        } catch (error) {
          console.warn('Photo analysis failed:', error);
          // Add fallback photo analysis
          processed.components.push('photo_derived_component');
          processed.features.push('visual_reference');
          processed.use_case = 'photo_based_product';
          processed.requirements.push('recreate_photo_design');
          processed.visual_technical_prompt = 'design photo based product';
        }
      }
    }

    // Process video input(s) with computer vision
    if (inputs.video) {
      const videoInputs = Array.isArray(inputs.video) ? inputs.video : [inputs.video];
      
      for (const videoInput of videoInputs) {
        try {
          // For now, treat video as a visual input with description
          // In a full implementation, you would extract key frames from the video
          const videoAnalysis = {
            components: ['demonstration_based'],
            features: ['motion_shown', 'usage_demonstrated'],
            style: 'demonstrated',
            requirements: ['functional_demonstration']
          };
          
          processed.components.push(...(videoAnalysis.components || []));
          processed.features.push(...(videoAnalysis.features || []));
          processed.requirements.push(...(videoAnalysis.requirements || []));
        } catch (error) {
          console.warn('Video analysis failed:', error);
        }
      }
    }

    // Remove duplicates and ensure we have some basic data
    processed.components = [...new Set(processed.components)];
    processed.features = [...new Set(processed.features)];
    processed.materials = [...new Set(processed.materials)];
    processed.requirements = [...new Set(processed.requirements)];
    
    // Check if we have visual-only inputs (no text or voice)
    const hasTextInput = inputs.text && (Array.isArray(inputs.text) ? inputs.text.length > 0 : true);
    const hasVoiceInput = inputs.voice && (Array.isArray(inputs.voice) ? inputs.voice.length > 0 : true);
    const hasVisualInput = (inputs.sketch && (Array.isArray(inputs.sketch) ? inputs.sketch.length > 0 : true)) || 
                          (inputs.photo && (Array.isArray(inputs.photo) ? inputs.photo.length > 0 : true));
    const isVisualOnly = hasVisualInput && !hasTextInput && !hasVoiceInput;
    
    console.log('📊 Input analysis:', {
      hasTextInput,
      hasVoiceInput, 
      hasVisualInput,
      isVisualOnly
    });
    
    // For visual-only inputs, use the technical prompt from image analysis
    if (isVisualOnly && processed.visual_technical_prompt) {
      processed.primary_technical_prompt = processed.visual_technical_prompt;
      console.log('✅ Using visual-derived technical prompt:', processed.primary_technical_prompt);
    }
    
    // Ensure we have at least some basic components if none were detected
    if (processed.components.length === 0) {
      if (processed.product_name) {
        processed.components = ['main_body', processed.product_name.toLowerCase().replace(/\s+/g, '_')];
      } else {
        processed.components = ['body', 'interface'];
      }
    }
    
    // Ensure we have at least a basic use case
    if (!processed.use_case) {
      if (processed.product_name) {
        processed.use_case = `${processed.product_name.toLowerCase()} functionality`;
      } else {
        processed.use_case = 'general';
      }
    }
    
    // For visual-only inputs, ensure we have meaningful requirements
    if (isVisualOnly && processed.requirements.length === 0) {
      processed.requirements = ['recreate visual design', 'maintain proportions', 'functional equivalent'];
    }

    console.log('📊 Final processed data:', processed);
    return processed;
  }

  /**
   * Analyze text using OpenAI GPT-4 via Pica with caching and fallback
   */
  private async analyzeTextWithAI(text: string): Promise<any> {
    // First check cache
    const { cacheService } = await import('./cacheService');
    const cached = await cacheService.getCachedTextAnalysis(text);
    if (cached) {
      return cached;
    }

    const prompt = `
You are an expert product design AI assistant. Analyze the following text and extract structured information for physical product design.

Text to analyze: "${text}"

Extract and return a JSON response with the following structure:
{
  "requirements": ["list of explicit requirements"],
  "constraints": ["list of constraints or limitations"],
  "style": "design style (modern, retro, industrial, minimalist, ergonomic, etc.)",
  "components": ["list of product components mentioned"],
  "features": ["list of specific features requested"],
  "materials": ["suggested materials"],
  "dimensions": {
    "length": "estimated length in cm",
    "width": "estimated width in cm", 
    "height": "estimated height in cm"
  },
  "manufacturing": {
    "method": "3D printing, injection molding, machining, etc.",
    "complexity": "simple, moderate, complex"
  },
  "use_case": "primary use case or function"
}

Instructions:
- If the text mentions "image" or "photo", focus on the product being described regardless of the image reference
- For vague requests like "make the fork in image", interpret this as a request to make a fork utensil
- Always provide at least one component, feature, or use case based on the text
- If the text is unclear, make reasonable assumptions about the product being described
- Never return empty arrays for all fields - always extract something meaningful

Focus on extracting actionable product design information that can be used to generate a 3D prototype.
`;

    try {
      console.log('🤖 Calling Gemini for text analysis (primary)...');
      const geminiResult = await this.callGemini(prompt);
      const content = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      let result;
      try {
        const cleanedContent = this.cleanJsonResponse(content);
        result = JSON.parse(cleanedContent);
        result.source = 'gemini_analysis';
        result.confidence = 0.8;
      } catch (parseError) {
        result = this.extractInfoFromText(content, text);
        result.source = 'gemini_fallback';
        result.confidence = 0.6;
      }

      // Cache the Gemini result (shorter TTL for more variation)
      await cacheService.cacheTextAnalysis(text, result, {
        ttl: 10 * 60 * 1000, // 10 minutes for generation requests
        syncToCloud: true
      });

      return result;
    } catch (geminiError) {
      console.warn('⚠️ Gemini failed for text analysis, trying OpenAI fallback:', geminiError);
      
      try {
        console.log('🤖 Calling OpenAI for text analysis (fallback)...');
        const response = await this.callOpenAI([
          {
            role: 'system',
            content: 'You are an expert product design analyst specializing in physical product development and manufacturing. Return only valid JSON responses focused on product specifications.'
          },
          {
            role: 'user', 
            content: prompt
          }
        ]);

        // Try to parse JSON response
        const content = response.choices[0]?.message?.content || '{}';
        let result;
        try {
          const cleanedContent = this.cleanJsonResponse(content);
          result = JSON.parse(cleanedContent);
          result.source = 'ai_analysis';
          result.confidence = 0.9;
        } catch (parseError) {
          // If JSON parsing fails, extract information using regex
          result = this.extractInfoFromText(content, text);
          result.source = 'ai_fallback';
          result.confidence = 0.7;
        }

        // Cache the successful result (shorter TTL for more variation)
        await cacheService.cacheTextAnalysis(text, result, {
          ttl: 5 * 60 * 1000, // 5 minutes for generation requests
          syncToCloud: true
        });

        return result;
      } catch (openaiError) {
        console.warn('⚠️ OpenAI fallback also failed:', openaiError);
        
        // Final fallback to rule-based analysis
        const fallbackResult = cacheService.getFallbackData('text_analysis', { input: text });
        
        // Cache the fallback result for a very short time to allow variation
        await cacheService.cacheTextAnalysis(text, fallbackResult, {
          ttl: 1 * 60 * 1000, // 1 minute only for fallback 
          syncToCloud: false // Don't sync fallback data to cloud
        });

        return fallbackResult;
      }
    }
  }

  /**
   * Analyze images using OpenAI GPT-4V via Pica with caching and fallback
   */
  private async analyzeImageWithAI(imageData: string, analysisType: string, prompt: string): Promise<any> {
    // Generate image hash for caching
    const imageHash = this.simpleHash(imageData.substring(0, 1000)); // Use first 1000 chars for hash
    
    // Check cache first
    const { cacheService } = await import('./cacheService');
    const cached = await cacheService.getCachedImageAnalysis(imageHash, analysisType);
    if (cached) {
      return cached;
    }

    // Enhanced prompt for product analysis
    const enhancedPrompt = analysisType === 'analyze_sketch' 
      ? `Analyze this sketch/drawing and extract detailed MECHANICAL COMPONENT design information:

1. IDENTIFY the main mechanical component/tool in the image
2. DETERMINE its primary mechanical function and use case
3. EXTRACT key mechanical features, dimensions, and design elements
4. INFER manufacturing requirements and materials
5. GENERATE technical specifications for CAD recreation

${prompt}

IMPORTANT: The Zoo API can only generate mechanical components, tools, and manufactured objects. Describe everything as a mechanical component, tool, or manufactured object that can be 3D printed or machined.

For example:
- Human hand → "articulated mechanical gripper with 5 fingers"
- Organic objects → "mechanical component mimicking [object] shape"
- Abstract concepts → "mechanical tool for [function]"

Return a JSON response with:
{
  "mainObject": "Mechanical component/tool identified (e.g., 'articulated gripper', 'mounting bracket', 'mechanical holder')",
  "function": "Mechanical function (e.g., 'gripping', 'holding', 'mounting', 'supporting')",
  "components": ["list of mechanical components and parts"],
  "features": ["mechanical design features, joints, surfaces"],
  "materials": ["manufacturing materials like aluminum, plastic, steel"],
  "dimensions": {"width": estimated_width, "height": estimated_height, "depth": estimated_depth},
  "manufacturing": {"method": "3D printing, CNC machining, injection molding, etc.", "complexity": "simple/moderate/complex"},
  "use_case": "mechanical use case",
  "requirements": ["mechanical requirements for function"],
  "technicalPrompt": "5-word technical CAD prompt (e.g., 'design mechanical gripper articulated fingers')",
  "style": "mechanical design style (industrial, precision, ergonomic, etc.)",
  "confidence": number_between_0_and_1
}`
      : `Analyze this image and extract detailed MECHANICAL COMPONENT design information:

1. IDENTIFY the main mechanical component/tool in the image
2. ANALYZE its mechanical design, materials, and construction
3. DETERMINE its mechanical function and intended use
4. EXTRACT key mechanical design elements and features
5. INFER manufacturing and material requirements

${prompt}

IMPORTANT: The Zoo API can only generate mechanical components, tools, and manufactured objects. Describe everything as a mechanical component, tool, or manufactured object that can be 3D printed or machined.

For example:
- Human hand → "articulated mechanical gripper with 5 fingers"
- Organic objects → "mechanical component mimicking [object] shape"
- Abstract concepts → "mechanical tool for [function]"

Return a JSON response with:
{
  "mainObject": "Mechanical component/tool identified (e.g., 'articulated gripper', 'mounting bracket', 'mechanical holder')",
  "function": "Mechanical function (e.g., 'gripping', 'holding', 'mounting', 'supporting')",
  "components": ["list of mechanical components and parts"],
  "features": ["mechanical design features, joints, surfaces"],
  "materials": ["manufacturing materials like aluminum, plastic, steel"],
  "dimensions": {"width": estimated_width, "height": estimated_height, "depth": estimated_depth},
  "manufacturing": {"method": "3D printing, CNC machining, injection molding, etc.", "complexity": "simple/moderate/complex"},
  "use_case": "mechanical use case",
  "requirements": ["mechanical requirements for function"],
  "technicalPrompt": "5-word technical CAD prompt (e.g., 'design mechanical gripper articulated fingers')",
  "style": "mechanical design style (industrial, precision, ergonomic, etc.)",
  "confidence": number_between_0_and_1
}`;

    try {
      console.log('🔍 Analyzing image with Gemini first for product identification...');
      
      // Try Gemini first for image analysis
      const geminiResult = await this.callGeminiVision(enhancedPrompt, imageData);
      const content = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      console.log('📝 Raw Gemini image analysis response:', content.substring(0, 300) + '...');
      
      let result;
      try {
        const cleanedContent = this.cleanJsonResponse(content);
        result = JSON.parse(cleanedContent);
        result.source = 'ai_vision_analysis';
        result.confidence = result.confidence || 0.85;
        
        result.source = 'gemini_vision_analysis';
        result.confidence = result.confidence || 0.85;
        
        console.log('✅ Enhanced Gemini image analysis result:', result);
        
        // Ensure we have the required fields for product analysis
        if (!result.mainObject && !result.components) {
          result.mainObject = 'unidentified_product';
        }
        if (!result.technicalPrompt) {
          result.technicalPrompt = `design ${result.mainObject || 'product'} prototype`;
        }
        
      } catch (parseError) {
        console.warn('⚠️ Gemini image analysis failed, trying OpenAI fallback');
        
        // Fallback to OpenAI if Gemini fails
        try {
          const openaiResponse = await this.callOpenAI([
            {
              role: 'system',
              content: 'You are an expert product designer and mechanical engineer. Analyze images to identify products and generate precise technical specifications for CAD recreation. Focus on the main object/product in the image.'
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: enhancedPrompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: imageData
                  }
                }
              ]
            }
          ]);

          const openaiContent = openaiResponse.choices[0]?.message?.content || '{}';
          console.log('📝 OpenAI fallback response:', openaiContent.substring(0, 300) + '...');
          
          const cleanedOpenaiContent = this.cleanJsonResponse(openaiContent);
          result = JSON.parse(cleanedOpenaiContent);
          result.source = 'openai_vision_fallback';
          result.confidence = result.confidence || 0.8;
          
          console.log('✅ OpenAI fallback image analysis result:', result);
          
          // Ensure we have the required fields for product analysis
          if (!result.mainObject && !result.components) {
            result.mainObject = 'unidentified_product';
          }
          if (!result.technicalPrompt) {
            result.technicalPrompt = `design ${result.mainObject || 'product'} prototype`;
          }
          
        } catch (openaiError) {
          console.warn('⚠️ OpenAI fallback also failed, using text extraction');
          
          // If AI returned plain text instead of JSON, try to extract information
          if (content.toLowerCase().includes('unable to identify') || 
              content.toLowerCase().includes('no product') ||
              content.toLowerCase().includes('person') ||
              content.toLowerCase().includes('hand')) {
            // AI couldn't identify a product in the image
            result = {
              mainObject: 'unclear_object',
              function: 'unknown_function',
              components: ['main_body'],
              features: ['unclear_features'],
              materials: ['unknown_material'],
              use_case: 'general_purpose',
              requirements: ['analyze_further'],
              technicalPrompt: 'design generic product',
              style: 'modern',
              source: 'ai_vision_unclear',
              confidence: 0.3
            };
          } else {
            // Try to extract some information from the text response
            const lowerContent = content.toLowerCase();
            let extractedObject = 'product';
            
            // Basic keyword extraction
            if (lowerContent.includes('hand')) extractedObject = 'hand_tool';
            else if (lowerContent.includes('grip')) extractedObject = 'grip_device';
            else if (lowerContent.includes('hold')) extractedObject = 'holder';
            else if (lowerContent.includes('container')) extractedObject = 'container';
            else if (lowerContent.includes('tool')) extractedObject = 'tool';
            
            result = {
              mainObject: extractedObject,
              function: 'extracted_from_description',
              components: ['main_body', 'functional_element'],
              features: ['basic_functionality'],
              materials: ['standard_material'],
              use_case: 'general_purpose',
              requirements: ['functional_design'],
              technicalPrompt: `design ${extractedObject} component`,
              style: 'modern',
              source: 'ai_vision_extraction',
              confidence: 0.5
            };
          }
        }
      }

      // Cache the successful result
      await cacheService.cacheImageAnalysis(imageHash, analysisType, result, {
        ttl: 7 * 24 * 60 * 60 * 1000, // 7 days
        syncToCloud: true
      });

      return result;
    } catch (error) {
      console.error('OpenAI image analysis failed:', error);
      
      // Try Gemini Vision as fallback
      try {
        console.log('Trying Gemini Vision fallback for image analysis');
        
        // For Gemini, we need to convert the image format
        const geminiPrompt = `${prompt}\n\nAnalyze this architectural image and return a JSON response with relevant information including layout, rooms, style, and features.`;
        
        const geminiResult = await this.callGemini(geminiPrompt);
        const content = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        
        let result;
        try {
          result = JSON.parse(content);
          result.source = 'gemini_vision_analysis';
          result.confidence = 0.75;
        } catch (parseError) {
          result = {
            layout: 'rectangular',
            rooms: ['space'],
            style: 'modern',
            features: ['analyzed_from_image'],
            source: 'gemini_vision_fallback',
            confidence: 0.5
          };
        }

        // Cache the Gemini result
        await cacheService.cacheImageAnalysis(imageHash, analysisType, result, {
          ttl: 3 * 24 * 60 * 60 * 1000, // 3 days (shorter for fallback)
          syncToCloud: true
        });

        return result;
      } catch (geminiError) {
        console.warn('Gemini Vision fallback also failed:', geminiError);
        
        // Final fallback to basic image analysis
        const fallbackResult = cacheService.getFallbackData('image_analysis', { imageHash, analysisType });
        
        // Cache the fallback result
        await cacheService.cacheImageAnalysis(imageHash, analysisType, fallbackResult, {
          ttl: 1 * 60 * 60 * 1000, // 1 hour
          syncToCloud: false
        });

        return fallbackResult;
      }
    }
  }

  /**
   * Simple hash function for image data
   */
  private simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Clean JSON response by removing markdown code blocks and other formatting
   */
  private cleanJsonResponse(content: string): string {
    console.log('🧹 Starting JSON cleaning process...');
    console.log('📏 Content length:', content.length);
    console.log('🔍 First 300 chars:', content.substring(0, 300));
    
    try {
      // Step 1: Extract and clean the JSON content
      const extractedJson = this.extractJsonFromContent(content);
      if (!extractedJson) {
        throw new Error('No JSON content found');
      }
      
      console.log('📦 Extracted JSON length:', extractedJson.length);
      console.log('🔍 First 200 chars of extracted:', extractedJson.substring(0, 200));
      
      // Step 2: Apply progressive cleaning strategies
      const cleaningStrategies = [
        this.basicJsonCleaning.bind(this),
        this.advancedJsonCleaning.bind(this),
        this.aiValueFixingCleaning.bind(this), // New strategy for AI incomplete values
        this.aggressiveJsonCleaning.bind(this),
        this.lastResortJsonCleaning.bind(this)
      ];
      
      for (let i = 0; i < cleaningStrategies.length; i++) {
        try {
          console.log(`🔧 Trying cleaning strategy ${i + 1}/${cleaningStrategies.length}...`);
          const cleaned = cleaningStrategies[i](extractedJson);
          
          // Test if it's valid JSON with detailed error reporting
          try {
            const parsed = JSON.parse(cleaned);
            console.log('✅ JSON cleaning successful with strategy', i + 1);
            return cleaned;
          } catch (parseError) {
            console.warn(`❌ Strategy ${i + 1} produced invalid JSON:`, parseError.message);
            console.log('🔍 Cleaned content sample:', cleaned.substring(0, 500));
            
            // Try to fix the specific error position with enhanced recovery
            if (parseError.message.includes('position')) {
              console.log('🔧 Attempting enhanced position-specific fix...');
              const positionMatch = parseError.message.match(/position (\d+)/);
              if (positionMatch) {
                const errorPos = parseInt(positionMatch[1]);
                console.log(`🎯 Error at position ${errorPos}`);
                const errorContext = cleaned.substring(Math.max(0, errorPos - 50), errorPos + 50);
                console.log(`🔍 Context around error:`, errorContext);
                
                // Multiple position fix strategies
                const positionFixStrategies = [
                  // Strategy 1: Remove problematic character and continue
                  () => {
                    const before = cleaned.substring(0, errorPos);
                    const after = cleaned.substring(errorPos + 1);
                    return before + after;
                  },
                  
                  // Strategy 2: Fix common JSON syntax errors at position
                  () => {
                    let fixed = cleaned;
                    const problemChar = cleaned[errorPos];
                    console.log(`🔍 Problem character: "${problemChar}" (${problemChar?.charCodeAt(0)})`);
                    
                    // Get context around error for better analysis
                    const contextBefore = cleaned.substring(Math.max(0, errorPos - 20), errorPos);
                    const contextAfter = cleaned.substring(errorPos, errorPos + 20);
                    console.log(`🔍 Context: "${contextBefore}[${problemChar}]${contextAfter}"`);
                    
                    // Fix common character issues
                    if (problemChar === ',') {
                      // Remove trailing comma in object/array
                      const before = cleaned.substring(0, errorPos);
                      const after = cleaned.substring(errorPos + 1);
                      return before + after;
                    } else if (problemChar === '"') {
                      // Fix unescaped quote
                      const before = cleaned.substring(0, errorPos);
                      const after = cleaned.substring(errorPos + 1);
                      return before + '\\"' + after;
                    } else if (problemChar === '/') {
                      // Fix forward slash issues (comments, unescaped slashes)
                      const before = cleaned.substring(0, errorPos);
                      const after = cleaned.substring(errorPos + 1);
                      
                      // Check if it's part of a comment
                      if (after.startsWith('/') || after.startsWith('*')) {
                        // Remove comment starting at this position
                        const commentEnd = after.indexOf('\n') > -1 ? after.indexOf('\n') : after.length;
                        return before + after.substring(commentEnd);
                      } else {
                        // Escape the forward slash
                        return before + '\\/' + after;
                      }
                    } else if (problemChar === '\n' || problemChar === '\r') {
                      // Remove newlines in strings
                      const before = cleaned.substring(0, errorPos);
                      const after = cleaned.substring(errorPos + 1);
                      return before + ' ' + after;
                    } else if (!problemChar || problemChar === undefined) {
                      // Handle truncated content
                      console.log('🔧 Character is undefined, truncating at error position');
                      return cleaned.substring(0, errorPos);
                    } else {
                      // For any other problematic character, try removing it
                      console.log(`🔧 Removing unknown problematic character: "${problemChar}"`);
                      const before = cleaned.substring(0, errorPos);
                      const after = cleaned.substring(errorPos + 1);
                      return before + after;
                    }
                    return fixed;
                  },
                  
                  // Strategy 3: Truncate and properly close
                  () => {
                    const truncated = cleaned.substring(0, errorPos);
                    return this.forceCloseJson(truncated);
                  },
                  
                  // Strategy 4: Find previous valid JSON boundary
                  () => {
                    // Find the last complete JSON object before error
                    let searchPos = errorPos;
                    let braceCount = 0;
                    
                    for (let i = searchPos - 1; i >= 0; i--) {
                      const char = cleaned[i];
                      if (char === '}') braceCount++;
                      else if (char === '{') braceCount--;
                      
                      if (braceCount === 0 && char === '}') {
                        console.log(`🔍 Found valid JSON boundary at position ${i + 1}`);
                        return cleaned.substring(0, i + 1);
                      }
                    }
                    
                    return this.forceCloseJson(cleaned.substring(0, errorPos));
                  }
                ];
                
                for (let strategyIndex = 0; strategyIndex < positionFixStrategies.length; strategyIndex++) {
                  try {
                    console.log(`🔧 Trying position fix strategy ${strategyIndex + 1}/${positionFixStrategies.length}...`);
                    const fixedContent = positionFixStrategies[strategyIndex]();
                    JSON.parse(fixedContent);
                    console.log(`✅ Position-specific fix successful with strategy ${strategyIndex + 1}!`);
                    return fixedContent;
                  } catch (fixError) {
                    console.log(`❌ Position fix strategy ${strategyIndex + 1} failed:`, fixError.message);
                  }
                }
              }
            }
            
            throw parseError;
          }
        } catch (error) {
          console.warn(`❌ Strategy ${i + 1} failed:`, error.message);
          continue;
        }
      }
      
      // If all strategies fail, return a basic fallback
      console.warn('🚨 All cleaning strategies failed, using fallback');
      return this.createFallbackJson(extractedJson);
      
    } catch (error) {
      console.error('❌ JSON cleaning completely failed:', error);
      console.log('🆘 Returning minimal fallback JSON');
      return JSON.stringify({
        name: 'Generated Product',
        description: 'AI-generated product design',
        style: 'Modern',
        technicalPrompt: 'design basic mechanical component',
        components: [],
        specifications: { complexity: 'Simple', materials: ['ABS'], dimensions: { width: 10, height: 10, depth: 10 } },
        manufacturing: { recommendedMethod: 'ABS', cost: 10, time: 60 },
        error: 'JSON parsing failed, using fallback'
      });
    }
  }

  /**
   * Extract JSON content from mixed content
   */
  private extractJsonFromContent(content: string): string | null {
    // Remove markdown code blocks
    let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
    
    // Find JSON boundaries using multiple strategies
    const strategies = [
      // Strategy 1: Look for complete JSON object
      () => {
        const start = cleaned.indexOf('{');
        if (start === -1) return null;
        
        let braceCount = 0;
        let inString = false;
        let escapeNext = false;
        
        for (let i = start; i < cleaned.length; i++) {
          const char = cleaned[i];
          
          if (escapeNext) {
            escapeNext = false;
            continue;
          }
          
          if (char === '\\' && inString) {
            escapeNext = true;
            continue;
          }
          
          if (char === '"' && !escapeNext) {
            inString = !inString;
            continue;
          }
          
          if (!inString) {
            if (char === '{') braceCount++;
            if (char === '}') braceCount--;
            if (braceCount === 0) {
              return cleaned.substring(start, i + 1);
            }
          }
        }
        return null;
      },
      
      // Strategy 2: Use regex to find JSON-like content
      () => {
        const match = cleaned.match(/\{[\s\S]*\}/g);
        return match ? match[0] : null;
      },
      
      // Strategy 3: Extract everything between first { and last }
      () => {
        const start = cleaned.indexOf('{');
        const end = cleaned.lastIndexOf('}');
        if (start !== -1 && end !== -1 && end > start) {
          return cleaned.substring(start, end + 1);
        }
        return null;
      }
    ];
    
    for (const strategy of strategies) {
      try {
        const result = strategy();
        if (result) {
          console.log('✅ JSON extraction successful');
          return result;
        }
      } catch (error) {
        console.warn('⚠️ JSON extraction strategy failed:', error);
        continue;
      }
    }
    
    return null;
  }
  
  /**
   * Basic JSON cleaning - fixes common issues
   */
  private basicJsonCleaning(jsonString: string): string {
    return jsonString
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remove control characters
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove /* */ style comments
      .replace(/\/\/.*$/gm, '') // Remove // style comments
      .replace(/\/(?!["\s])/g, '\\/') // Escape forward slashes that aren't in strings
      .replace(/\r\n/g, ' ') // Replace CRLF with spaces
      .replace(/\n/g, ' ') // Replace newlines with spaces
      .replace(/\r/g, ' ') // Replace carriage returns with spaces
      .replace(/\t/g, ' ') // Replace tabs with spaces
      .replace(/\s+/g, ' ') // Collapse multiple spaces
      .replace(/,\s*([}\]])/g, '$1') // Remove trailing commas
      .trim();
  }
  
  /**
   * Advanced JSON cleaning - fixes quote and key issues
   */
  private advancedJsonCleaning(jsonString: string): string {
    let cleaned = this.basicJsonCleaning(jsonString);
    
    // Fix unquoted keys first
    cleaned = cleaned.replace(/([{,]\s*)([a-zA-Z_$][a-zA-Z0-9_$]*)\s*:/g, '$1"$2":');
    
    // Fix single quotes to double quotes for strings - more careful pattern
    cleaned = cleaned.replace(/:+('([^'\\]|\\.)*')/g, ': "$2"');
    
    // Fix cases where there's a backslash before the closing quote of a key
    cleaned = cleaned.replace(/"([^"\\]+)\\"\s*:/g, '"$1":');
    
    // Fix dangling commas before closing braces/brackets
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    
    // Fix multiple consecutive commas
    cleaned = cleaned.replace(/,+/g, ',');
    
    // Fix broken strings - be more conservative to avoid breaking valid JSON
    // Only fix cases where there are clearly broken quotes
    cleaned = cleaned.replace(/"\s*\+\s*"/g, ''); // Remove string concatenation
    cleaned = cleaned.replace(/\\"/g, '"'); // Fix escaped quotes at end of values
    
    return cleaned;
  }
  
  /**
   * Aggressive JSON cleaning - handles complex malformed JSON
   */
  private aggressiveJsonCleaning(jsonString: string): string {
    let cleaned = this.advancedJsonCleaning(jsonString);
    
    // Remove invalid characters that break JSON
    cleaned = cleaned.replace(/[\u0000-\u0008\u000B-\u000C\u000E-\u001F\u007F-\u009F]/g, '');
    
    // Fix multiple commas
    cleaned = cleaned.replace(/,\s*,+/g, ',');
    
    // Fix leading commas
    cleaned = cleaned.replace(/([{,])\s*,/g, '$1');
    
    // Fix malformed arrays
    cleaned = cleaned.replace(/\[\s*,/g, '[');
    cleaned = cleaned.replace(/,\s*\]/g, ']');
    
    // Fix malformed objects
    cleaned = cleaned.replace(/\{\s*,/g, '{');
    cleaned = cleaned.replace(/,\s*\}/g, '}');
    
    // More conservative string fixes to avoid breaking valid JSON
    // Fix broken string concatenation
    cleaned = cleaned.replace(/"\s*\+\s*"/g, '');
    
    // Fix common escape sequence issues
    cleaned = cleaned.replace(/\\"/g, '"'); // Fix escaped quotes
    
    // Only fix obviously broken unquoted values (not already quoted strings)
    cleaned = cleaned.replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*([,}\]])/g, ': "$1"$2');
    
    return cleaned;
  }
  
  /**
   * Last resort JSON cleaning - very aggressive fixes
   */
  private lastResortJsonCleaning(jsonString: string): string {
    let cleaned = this.aggressiveJsonCleaning(jsonString);
    
    // Try to salvage what we can by parsing line by line
    const lines = cleaned.split('\n');
    const validLines = [];
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) {
        validLines.push(trimmed);
      }
    }
    
    cleaned = validLines.join(' ');
    
    // Very aggressive character replacement
    cleaned = cleaned.replace(/[^\x20-\x7E]/g, ' '); // Remove non-printable chars
    cleaned = cleaned.replace(/\s+/g, ' '); // Collapse spaces
    
    return cleaned;
  }
  
  /**
   * Create a fallback JSON when all else fails
   */
  private createFallbackJson(originalContent: string): string {
    console.log('🆘 Creating fallback JSON from salvaged content');
    
    // Try to extract basic information
    const nameMatch = originalContent.match(/["']?name["']?\s*:\s*["']([^"']+)["']?/i);
    const descMatch = originalContent.match(/["']?description["']?\s*:\s*["']([^"']+)["']?/i);
    const styleMatch = originalContent.match(/["']?style["']?\s*:\s*["']([^"']+)["']?/i);
    const techPromptMatch = originalContent.match(/["']?technicalPrompt["']?\s*:\s*["']([^"']+)["']?/i);
    
    // Try to preserve any technical prompt that was found
    let technicalPrompt = 'design basic mechanical component';
    if (techPromptMatch) {
      technicalPrompt = techPromptMatch[1];
    } else if (nameMatch) {
      // Generate a reasonable technical prompt based on the name
      const name = nameMatch[1].toLowerCase();
      if (name.includes('gripper') || name.includes('manipulator')) {
        technicalPrompt = 'design mechanical gripper tool';
      } else if (name.includes('bracket') || name.includes('mount')) {
        technicalPrompt = 'design mounting bracket';
      } else if (name.includes('housing') || name.includes('case')) {
        technicalPrompt = 'design protective housing';
      }
    }
    
    return JSON.stringify({
      name: nameMatch ? nameMatch[1] : 'Generated Product',
      description: descMatch ? descMatch[1] : 'AI-generated product design',
      style: styleMatch ? styleMatch[1] : 'Modern',
      technicalPrompt: technicalPrompt,
      components: [],
      specifications: {
        complexity: 'Simple',
        materials: ['ABS'],
        dimensions: { width: 10, height: 10, depth: 10 }
      },
      manufacturing: {
        recommendedMethod: 'ABS',
        cost: 10,
        time: 60
      },
      fallback: true
    });
  }

  /**
   * More robust JSON parser that handles complex nested structures
   */
  private parseComplexJSON(content: string): any {
    try {
      // Remove markdown code blocks
      let cleaned = content.replace(/```json\s*/gi, '').replace(/```\s*/gi, '');
      
      // Find the JSON boundaries using brace counting
      const startIndex = cleaned.indexOf('{');
      if (startIndex === -1) {
        throw new Error('No JSON start found');
      }
      
      let braceCount = 0;
      let endIndex = startIndex;
      let inString = false;
      let escapeNext = false;
      
      for (let i = startIndex; i < cleaned.length; i++) {
        const char = cleaned[i];
        
        if (escapeNext) {
          escapeNext = false;
          continue;
        }
        
        if (char === '\\') {
          escapeNext = true;
          continue;
        }
        
        if (char === '"') {
          inString = !inString;
          continue;
        }
        
        if (!inString) {
          if (char === '{') {
            braceCount++;
          } else if (char === '}') {
            braceCount--;
            if (braceCount === 0) {
              endIndex = i;
              break;
            }
          }
        }
      }
      
      if (braceCount !== 0) {
        throw new Error('Unmatched braces in JSON');
      }
      
      const jsonString = cleaned.substring(startIndex, endIndex + 1);
      
      // Clean the extracted JSON
      const finalCleaned = jsonString
        .replace(/[\x00-\x1F\x7F-\x9F]/g, '')  // Remove control characters
        .replace(/\r\n/g, ' ')  // Replace CRLF with spaces
        .replace(/\n/g, ' ')  // Replace newlines with spaces
        .replace(/\r/g, ' ')  // Replace carriage returns with spaces
        .replace(/\t/g, ' ')  // Replace tabs with spaces
        .replace(/\s+/g, ' ')  // Collapse multiple spaces
        .replace(/,\s*([}\]])/g, '$1');  // Remove trailing commas
      
      return JSON.parse(finalCleaned);
    } catch (error) {
      console.warn('❌ Complex JSON parsing failed:', error);
      throw error;
    }
  }

  /**
   * Call OpenAI API via Pica passthrough
   */
  private async callOpenAI(messages: any[]): Promise<any> {
    if (!this.config.secretKey || !this.config.openaiConnectionKey) {
      throw new Error('OpenAI configuration missing');
    }

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pica-secret': this.config.secretKey,
        'x-pica-connection-key': this.config.openaiConnectionKey,
        'x-pica-action-id': 'conn_mod_def::GDzgi1QfvM4::4OjsWvZhRxmAVuLAuWgfVA'
      },
      body: JSON.stringify({
        messages,
        model: 'gpt-4o',
        temperature: 0.3,
        max_completion_tokens: 2000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Call Gemini API via Pica as fallback
   */
  private async callGemini(prompt: string): Promise<any> {
    if (!this.config.secretKey || !this.config.geminiConnectionKey) {
      throw new Error('Gemini configuration missing');
    }

    const response = await fetch(`${this.baseUrl}/models/gemini-1.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pica-secret': this.config.secretKey,
        'x-pica-connection-key': this.config.geminiConnectionKey,
        'x-pica-action-id': 'conn_mod_def::GCmd5BQE388::PISTzTbvRSqXx0N0rMa-Lw'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Call Gemini Vision API via Pica for image analysis
   */
  private async callGeminiVision(prompt: string, imageData: string): Promise<any> {
    if (!this.config.secretKey || !this.config.geminiConnectionKey) {
      throw new Error('Gemini configuration missing');
    }

    // Extract base64 data from data URL
    const base64Data = imageData.includes('base64,') ? imageData.split('base64,')[1] : imageData;
    const mimeType = imageData.includes('data:') ? imageData.split(';')[0].split(':')[1] : 'image/jpeg';

    const response = await fetch(`${this.baseUrl}/models/gemini-1.5-flash:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pica-secret': this.config.secretKey,
        'x-pica-connection-key': this.config.geminiConnectionKey,
        'x-pica-action-id': 'conn_mod_def::GCmd5BQE388::PISTzTbvRSqXx0N0rMa-Lw'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: prompt },
            {
              inlineData: {
                mimeType: mimeType,
                data: base64Data
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini Vision API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  /**
   * Text-to-speech using ElevenLabs via Pica with caching
   */
  async synthesizeSpeech(text: string, voiceId?: string): Promise<string> {
    const defaultVoiceId = voiceId || import.meta.env.VITE_ELEVENLABS_DEFAULT_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL';

    // Check cache first
    const { cacheService } = await import('./cacheService');
    const cached = await cacheService.getCachedVoiceSynthesis(text, defaultVoiceId);
    if (cached) {
      return cached;
    }

    if (!this.config.secretKey || !this.config.elevenlabsConnectionKey) {
      throw new Error('ElevenLabs configuration missing');
    }

    const response = await fetch(`${this.baseUrl}/v1/text-to-speech/${defaultVoiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-pica-secret': this.config.secretKey,
        'x-pica-connection-key': this.config.elevenlabsConnectionKey,
        'x-pica-action-id': 'conn_mod_def::GCccCs7_t7Q::QpqEyuj2S4W481S8S1asbA'
      },
      body: JSON.stringify({
        text: text.slice(0, 1000), // Limit text length
        voice_id: defaultVoiceId,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const audioData = result.audio; // Base64 encoded audio

    // Cache the result
    await cacheService.cacheVoiceSynthesis(text, defaultVoiceId, audioData, {
      ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
      syncToCloud: true
    });

    return audioData;
  }

  /**
   * Fallback text analysis using regex patterns
   */
  private async analyzeTextFallback(text: string): Promise<any> {
    const lowercaseText = text.toLowerCase();
    const analysis = {
      requirements: [] as string[],
      constraints: [] as string[],
      style: 'modern',
      components: [] as string[],
      features: [] as string[],
      materials: [] as string[],
      dimensions: {} as any,
      manufacturing: {} as any,
      use_case: '' as string
    };

    // Extract product components - enhanced for kitchen utensils
    const componentPatterns = {
      'holder_body': /holder|container|organizer|rack|caddy|stand/gi,
      'handle': /handle|grip|hold/gi,
      'body': /body|main|core|base/gi,
      'compartments': /compartment|slot|divider|section|pocket/gi,
      'base': /base|bottom|foundation|platform/gi,
      'interface': /button|screen|display|control/gi,
      'cover': /cover|lid|top|cap/gi,
      'stand': /stand|support|leg|mount/gi,
      'connector': /connector|plug|port|cable/gi,
      'sensor': /sensor|detector|monitor/gi,
      'battery': /battery|power|energy/gi,
      'speaker': /speaker|audio|sound/gi,
      'slots': /slot|opening|hole|space/gi
    };

    Object.entries(componentPatterns).forEach(([componentType, pattern]) => {
      if (pattern.test(text)) {
        analysis.components.push(componentType);
      }
    });

    // Extract style preferences
    const stylePatterns = {
      'modern': /modern|contemporary|minimalist|clean|sleek/gi,
      'retro': /retro|vintage|classic|old.school/gi,
      'industrial': /industrial|rugged|metal|steel/gi,
      'ergonomic': /ergonomic|comfortable|user.friendly/gi,
      'compact': /compact|small|portable|mini/gi
    };

    Object.entries(stylePatterns).forEach(([style, pattern]) => {
      if (pattern.test(text)) {
        analysis.style = style;
      }
    });

    // Extract materials
    const materialPatterns = {
      'plastic': /plastic|polymer|ABS|PLA/gi,
      'metal': /metal|aluminum|steel|titanium/gi,
      'wood': /wood|bamboo|timber/gi,
      'glass': /glass|crystal|transparent/gi,
      'rubber': /rubber|silicone|flexible/gi,
      'fabric': /fabric|textile|cloth/gi
    };

    Object.entries(materialPatterns).forEach(([material, pattern]) => {
      if (pattern.test(text)) {
        analysis.materials.push(material);
      }
    });

    // Extract product features - enhanced for kitchen products
    const featurePatterns = {
      'organizing': /organiz|stor|hold|contain|arrang/gi,
      'kitchen_safe': /food.safe|bpa.free|dishwasher|kitchen/gi,
      'stable': /stable|steady|secure|firm|non.slip/gi,
      'modular': /modular|customizable|expandable|adjustable/gi,
      'easy_clean': /easy.clean|washable|wipe|maintenance/gi,
      'space_saving': /space.saving|compact|efficient|countertop/gi,
      'utensil_specific': /utensil|spoon|fork|knife|spatula|whisk|tool/gi,
      'wireless': /wireless|bluetooth|wifi/gi,
      'waterproof': /waterproof|water.resistant|sealed/gi,
      'portable': /portable|mobile|carry|travel/gi,
      'rechargeable': /rechargeable|battery|usb.charge/gi,
      'durable': /durable|sturdy|strong|robust/gi,
      'lightweight': /lightweight|light|portable/gi,
      'foldable': /foldable|collapsible|compact/gi,
      'adjustable': /adjustable|customizable|variable/gi
    };

    Object.entries(featurePatterns).forEach(([feature, pattern]) => {
      if (pattern.test(text)) {
        analysis.features.push(feature);
      }
    });

    // Extract use case - more specific detection
    if (/kitchen|cook|food|culinary|utensil|spoon|fork|knife|spatula|whisk|cutting|chef/gi.test(text)) {
      analysis.use_case = 'kitchen organization';
    } else if (/office|work|desk|business|pen|pencil|document/gi.test(text)) {
      analysis.use_case = 'office organization';
    } else if (/home|household|domestic|living|bedroom|bathroom/gi.test(text)) {
      analysis.use_case = 'home organization';
    } else if (/tech|electronic|digital|smart|phone|tablet|computer/gi.test(text)) {
      analysis.use_case = 'technology accessory';
    } else if (/outdoor|garden|yard|exterior|camping|hiking/gi.test(text)) {
      analysis.use_case = 'outdoor equipment';
    } else if (/tool|workshop|garage|repair|maintenance/gi.test(text)) {
      analysis.use_case = 'tool organization';
    } else {
      analysis.use_case = 'general organization';
    }

    // Enhanced fallback logic for specific product types
    if (/utensil.*holder|kitchen.*organizer|cutlery.*stand/gi.test(text)) {
      // Specific detection for kitchen utensil holders
      analysis.components = ['holder_body', 'compartments', 'base'];
      analysis.features = ['organizing', 'kitchen_safe', 'stable', 'easy_clean'];
      analysis.materials = ['stainless steel', 'bamboo', 'plastic'];
      analysis.requirements = ['organize utensils', 'stable base', 'easy to clean'];
      analysis.style = 'modern';
    }
    
    // Ensure we have at least some basic data
    if (analysis.components.length === 0) {
      analysis.components = ['body', 'interface'];
    }
    if (analysis.features.length === 0) {
      analysis.features = ['functional'];
    }
    if (analysis.materials.length === 0) {
      analysis.materials = ['plastic'];
    }
    if (analysis.requirements.length === 0) {
      analysis.requirements = ['durable', 'functional'];
    }

    return analysis;
  }

  /**
   * Extract information from AI response text when JSON parsing fails
   */
  private extractInfoFromText(aiResponse: string, originalText: string): any {
    // Try to extract JSON from the response
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]);
      } catch (e) {
        // Continue with fallback
      }
    }

    // Fallback to pattern matching
    return this.analyzeTextFallback(originalText);
  }

  /**
   * Create product model from processed inputs using real AI generation
   */
  private async createProductModel(
    processedInputs: any, 
    preferences: GenerationRequest['preferences'],
    originalInputs?: MultimodalInput
  ): Promise<ArchitecturalModel> {
    const modelId = `product_${Date.now()}`;
    
    let productSpecs;
    if (this.config.secretKey && (this.config.geminiConnectionKey || this.config.openaiConnectionKey)) {
      try {
        productSpecs = await this.generateProductSpecsWithAI(processedInputs, preferences, originalInputs);
      } catch (error) {
        console.warn('AI product generation failed, using fallback:', error);
        productSpecs = this.generateFallbackProductSpecs(processedInputs, preferences);
      }
    } else {
      console.log('No API keys found, using fallback product specs');
      productSpecs = this.generateFallbackProductSpecs(processedInputs, preferences);
    }

    // Ensure productSpecs has required structure
    if (!productSpecs || !productSpecs.components || !Array.isArray(productSpecs.components)) {
      console.warn('Invalid product specs, creating default structure');
      productSpecs = {
        name: `${preferences.style || 'Modern'} Product`,
        description: 'A custom designed product',
        style: preferences.style || 'modern',
        components: [
          {
            name: "main_body",
            dimensions: { width: 10, length: 15, height: 5 },
            material: "Plastic",
            function: "Primary structure",
            features: ["functional"],
            connections: []
          }
        ],
        totalVolume: 750,
        manufacturing: {
          method: "3D printing",
          materials: ["PLA plastic"],
          complexity: "simple",
          estimated_cost: "$25-50"
        }
      };
    }

    // Convert product specs to architectural model format (for compatibility)
    const components = productSpecs.components.map((comp: any, index: number) => {
      // Get realistic dimensions from AI specs or use defaults
      const aiDimensions = comp.dimensions || productSpecs.specifications?.dimensions || {};
      
      // Convert dimensions to realistic scale (AI provides in cm, we need mm for consistent scaling)
      const dimensions = {
        width: (aiDimensions.width || 5) * 10,   // Convert cm to mm
        length: (aiDimensions.length || 5) * 10, // Convert cm to mm
        height: (aiDimensions.height || 5) * 10  // Convert cm to mm
      };
      
      return {
        id: `component_${index}`,
        name: comp.name || `component_${index}`,
        dimensions,
        position: { x: index * 3, y: 0, z: 0 },
        connections: comp.connections || [],
        features: comp.features || [],
        materials: comp.materials || { walls: '#cccccc', floor: '#999999', ceiling: '#ffffff' },
        // Store original AI dimensions for reference
        aiDimensions: aiDimensions
      };
    });

    const model: ArchitecturalModel = {
      id: modelId,
      name: productSpecs.name || `${preferences?.style || 'Modern'} Product Design`,
      description: productSpecs.description || `A ${preferences?.style || 'modern'} product with ${components.length} components`,
      rooms: components, // Using 'rooms' field for components for compatibility
      doors: [], // Products don't have doors  
      windows: [], // Products don't have windows
      totalArea: this.calculateRealisticVolume(components, productSpecs), // Calculate realistic volume based on AI dimensions
      style: productSpecs.style || preferences?.style || 'modern',
      created: new Date(),
      modified: new Date(),
      // Add product-specific data to the model for better display
      productSpecs: productSpecs, // Store the full AI-generated specifications
      manufacturing: productSpecs.manufacturing,
      specifications: productSpecs.specifications
    };

    return model;
  }

  /**
   * Generate realistic product specifications using OpenAI
   */
  async generateProductSpecsWithAI(processedInputs: any, preferences: any, originalInputs?: MultimodalInput): Promise<any> {
    console.log('🔍 generateProductSpecsWithAI called with:', {
      processedInputs,
      preferences,
      hasOriginalInputs: !!originalInputs
    });
    
    // Create a request key for deduplication
    const requestKey = `productSpecs_${JSON.stringify(processedInputs)}_${JSON.stringify(preferences)}`;
    
    return this.deduplicateRequest(requestKey, async () => {
      // Collect all user inputs for better context
      const userInputs = [];
      if (originalInputs) {
        // Add text inputs
        if (originalInputs.text) {
          const textInputs = Array.isArray(originalInputs.text) ? originalInputs.text : [originalInputs.text];
          textInputs.forEach(textInput => {
            userInputs.push(`Text: "${textInput.content}"`);
          });
        }
        
        // Add voice transcripts
        if (originalInputs.voice) {
          const voiceInputs = Array.isArray(originalInputs.voice) ? originalInputs.voice : [originalInputs.voice];
          voiceInputs.forEach(voiceInput => {
            if (voiceInput.transcript) {
              userInputs.push(`Voice: "${voiceInput.transcript}"`);
            }
          });
        }
        
        // Add other modalities
        if (originalInputs.sketch) {
          userInputs.push(`Sketch: User provided a sketch/drawing`);
        }
        if (originalInputs.photo) {
          userInputs.push(`Photo: User provided a reference photo`);
        }
        if (originalInputs.video) {
          userInputs.push(`Video: User provided a video demonstration`);
        }
      }
    
      const prompt = `You are an expert product designer and engineer. Create detailed specifications for a physical product based on these requirements:

${userInputs.length > 0 ? `ORIGINAL USER INPUTS:
${userInputs.join('\n')}

PROCESSED ANALYSIS:` : ''}
Requirements: ${processedInputs.requirements?.join(', ') || 'None'}
Components needed: ${processedInputs.components?.join(', ') || 'None'}
Style: ${processedInputs.style || 'None'}
Features: ${processedInputs.features?.join(', ') || 'None'}
Materials: ${processedInputs.materials?.join(', ') || 'None'}
Use case: ${processedInputs.use_case || 'None'}
Constraints: ${processedInputs.constraints?.join(', ') || 'None'}

Create a realistic, manufacturable product design. Return a JSON response with:
{
  "name": "Product name",
  "description": "Detailed product description",
  "style": "Design style",
  "technicalPrompt": "5-word technical CAD prompt that accurately reflects the user's ORIGINAL inputs (e.g., 'design aluminum mounting bracket machined')",
  "components": [
    {
      "name": "Component name",
      "dimensions": {"width": number_in_cm, "length": number_in_cm, "height": number_in_cm},
      "material": "Material type",
      "function": "Component purpose",
      "features": ["list of features"],
      "connections": ["list of connected components"]
    }
  ],
  "totalVolume": number, // in cubic cm
  "manufacturing": {
    "method": "3D printing, injection molding, CNC machining, etc.",
    "materials": ["list of materials needed"],
    "complexity": "simple, moderate, complex",
    "estimated_cost": "cost range in USD"
  },
  "specifications": {
    "weight": "estimated weight in grams",
    "dimensions": {"length": number_in_cm, "width": number_in_cm, "height": number_in_cm},
    "color_options": ["available colors"],
    "durability": "durability rating"
  }
}

Focus on creating a realistic, manufacturable product that fulfills the requirements and can be easily prototyped.

IMPORTANT SIZING GUIDELINES:
- Use realistic dimensions in centimeters - small objects like dental floss threaders should be 1-5cm in length
- Large objects like kitchen utensil holders should be 10-30cm
- Thickness/width should be proportional to function (e.g., 0.1-0.5cm for thin items, 1-5cm for sturdy items)
- Consider ergonomics and real-world manufacturing constraints

IMPORTANT: The technicalPrompt field is critical - it must reflect the user's actual inputs, not generic terms. If the user specified a particular product (e.g., "kitchen utensil holder"), material (e.g., "bamboo"), or manufacturing method (e.g., "3D printed"), include these in the technicalPrompt.`;

      try {
        console.log('🤖 Calling Gemini for product specs generation (primary)...');
        const response = await this.callGemini(prompt);
        
        console.log('✅ Gemini response received');
        const content = response.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
        console.log('📝 Raw Gemini response:', content.substring(0, 200) + '...');
        
        const cleanedContent = this.cleanJsonResponse(content);
        const productSpecs = JSON.parse(cleanedContent);
        
        console.log('📊 Parsed product specs from Gemini:', productSpecs);
        
        // Validate and enhance the specs
        if (!productSpecs.components || productSpecs.components.length === 0) {
          console.log('⚠️ No components found, adding default');
          productSpecs.components = [{
            name: "main_body",
            dimensions: { width: 1, length: 1, height: 0.5 }, // Small realistic default in cm
            material: "ABS plastic",
            function: "Primary structure",
            features: ["durable", "lightweight"],
            connections: []
          }];
        }

        // Ensure technicalPrompt is present
        if (!productSpecs.technicalPrompt) {
          console.log('⚠️ No technicalPrompt from AI, checking for visual-derived prompt');
          
          // Check if we have a visual-derived technical prompt
          if (processedInputs.primary_technical_prompt) {
            productSpecs.technicalPrompt = processedInputs.primary_technical_prompt;
            console.log('✅ Using visual-derived technical prompt:', productSpecs.technicalPrompt);
          } else {
            console.log('⚠️ No visual prompt available, using fallback');
            productSpecs.technicalPrompt = "design mechanical component molded";
          }
        } else {
          console.log('✅ Gemini generated technicalPrompt:', productSpecs.technicalPrompt);
        }

        // Add comprehensive validation logging
        console.log('🔍 Final product specs validation:', {
          hasComponents: !!productSpecs.components,
          componentCount: productSpecs.components?.length || 0,
          hasTechnicalPrompt: !!productSpecs.technicalPrompt,
          technicalPrompt: productSpecs.technicalPrompt,
          hasSpecifications: !!productSpecs.specifications,
          dimensions: productSpecs.specifications?.dimensions || 'Not specified'
        });

        return productSpecs;
      } catch (geminiError) {
        console.warn('⚠️ Gemini failed for product specs generation, trying OpenAI fallback:', geminiError);
        
        try {
          console.log('🤖 Calling OpenAI for product specs generation (fallback)...');
          const openaiResponse = await this.callOpenAI([
            {
              role: 'system',
              content: 'You are an expert product designer and engineer. Generate detailed product specifications in JSON format.'
            },
            {
              role: 'user',
              content: prompt
            }
          ]);
          
          console.log('✅ OpenAI response received');
          const content = openaiResponse.choices[0]?.message?.content || '{}';
          console.log('📝 Raw OpenAI response:', content.substring(0, 200) + '...');
          
          const cleanedContent = this.cleanJsonResponse(content);
          const productSpecs = JSON.parse(cleanedContent);
          
          console.log('📊 Parsed product specs from OpenAI fallback:', productSpecs);
          
          // Validate and enhance the specs
          if (!productSpecs.components || productSpecs.components.length === 0) {
            console.log('⚠️ No components found, adding default');
            productSpecs.components = [{
              name: "main_body",
              dimensions: { width: 1, length: 1, height: 0.5 }, // Small realistic default in cm
              material: "ABS plastic",
              function: "Primary structure",
              features: ["durable", "lightweight"],
              connections: []
            }];
          }

          // Ensure technicalPrompt is present
          if (!productSpecs.technicalPrompt) {
            console.log('⚠️ No technicalPrompt from AI, checking for visual-derived prompt');
            
            // Check if we have a visual-derived technical prompt
            if (processedInputs.primary_technical_prompt) {
              productSpecs.technicalPrompt = processedInputs.primary_technical_prompt;
              console.log('✅ Using visual-derived technical prompt:', productSpecs.technicalPrompt);
            } else {
              console.log('⚠️ No visual prompt available, using fallback');
              productSpecs.technicalPrompt = "design mechanical component molded";
            }
          } else {
            console.log('✅ OpenAI generated technicalPrompt:', productSpecs.technicalPrompt);
          }

          // Add comprehensive validation logging
          console.log('🔍 Final product specs validation (OpenAI fallback):', {
            hasComponents: !!productSpecs.components,
            componentCount: productSpecs.components?.length || 0,
            hasTechnicalPrompt: !!productSpecs.technicalPrompt,
            technicalPrompt: productSpecs.technicalPrompt,
            hasSpecifications: !!productSpecs.specifications,
            dimensions: productSpecs.specifications?.dimensions || 'Not specified'
          });

          return productSpecs;
        } catch (openaiError) {
          console.error('❌ Both AI services failed for product specs generation:', openaiError);
          throw openaiError;
        }
      }
    }, 200); // 200ms debounce for product specs generation
  }

  /**
   * Calculate realistic volume based on AI-determined dimensions
   */
  private calculateRealisticVolume(components: any[], productSpecs: any): number {
    let totalVolume = 0;
    
    // Calculate volume from individual components
    components.forEach(component => {
      const dims = component.dimensions;
      if (dims && dims.width && dims.length && dims.height) {
        // Convert mm to cm for volume calculation (mm³ to cm³)
        const volumeCm3 = (dims.width * dims.length * dims.height) / 1000;
        totalVolume += volumeCm3;
      }
    });
    
    // Fallback to AI-provided volume if available
    if (totalVolume === 0 && productSpecs.totalVolume) {
      totalVolume = productSpecs.totalVolume;
    }
    
    // Final fallback to reasonable default
    if (totalVolume === 0) {
      totalVolume = 100; // 100 cm³ default
    }
    
    console.log(`📐 Calculated realistic volume: ${totalVolume} cm³`);
    return totalVolume;
  }

  /**
   * Generate fallback product specs when AI is unavailable
   */
  private generateFallbackProductSpecs(processedInputs: any, preferences: any): any {
    const productType = this.inferProductType(processedInputs);
    
    // Add randomization to prevent identical responses
    const random = Math.random();
    const timeVariation = Date.now() % 1000;
    
    // Ensure we have at least some components
    const components = [];
    
    // Add main body component with some randomization
    const baseWidth = 10 + (random * 8); // 10-18
    const baseLength = 15 + (random * 10); // 15-25  
    const baseHeight = 4 + (random * 4); // 4-8
    
    components.push({
      name: "main_body",
      dimensions: { 
        width: Math.round(baseWidth * 10) / 10, 
        length: Math.round(baseLength * 10) / 10, 
        height: Math.round(baseHeight * 10) / 10 
      },
      material: processedInputs.materials?.[0] || this.getRandomMaterial(),
      function: "Primary structure",
      features: processedInputs.features?.slice(0, 2) || this.getRandomFeatures(2),
      connections: []
    });
    
    // Add interface component if needed
    if (processedInputs.components?.includes('interface') || processedInputs.features?.includes('interactive')) {
      components.push({
        name: "interface",
        dimensions: { width: 8, length: 12, height: 2 },
        material: "Metal",
        function: "User interaction",
        features: ["ergonomic"],
        connections: ["main_body"]
      });
    }
    
    // Add handle if mentioned
    if (processedInputs.components?.includes('handle') || processedInputs.features?.includes('portable')) {
      components.push({
        name: "handle",
        dimensions: { width: 3, length: 15, height: 2 },
        material: processedInputs.materials?.includes('rubber') ? "Rubber" : "Plastic",
        function: "Grip and portability",
        features: ["ergonomic", "non-slip"],
        connections: ["main_body"]
      });
    }
    
    // Add variation to names and descriptions
    const styleVariations = ['sleek', 'innovative', 'premium', 'compact', 'professional'];
    const descriptiveWords = ['versatile', 'robust', 'efficient', 'elegant', 'practical'];
    
    const randomStyle = styleVariations[Math.floor(random * styleVariations.length)];
    const randomDesc = descriptiveWords[Math.floor(random * descriptiveWords.length)];
    
    const fallbackSpecs = {
      name: `${randomStyle} ${productType} v${timeVariation}`,
      description: `A ${randomDesc} ${productType} designed for ${processedInputs.use_case || 'general use'} with ${preferences?.style || 'modern'} styling`,
      style: preferences?.style || 'modern',
      technicalPrompt: this.generateTechnicalPrompt(processedInputs, preferences),
      components: components,
      totalVolume: components.reduce((vol, comp) => 
        vol + (comp.dimensions.width * comp.dimensions.length * comp.dimensions.height), 0
      ),
      manufacturing: {
        method: processedInputs.features?.includes('3d_print') ? "3D printing" : "Injection molding",
        materials: processedInputs.materials?.length > 0 ? processedInputs.materials : ["PLA plastic"],
        complexity: components.length > 2 ? "moderate" : "simple",
        estimated_cost: components.length > 2 ? "$75-150" : "$25-75"
      },
      specifications: {
        weight: `${Math.round(components.length * 150)}g`,
        dimensions: { 
          length: Math.max(...components.map(c => c.dimensions.length)), 
          width: Math.max(...components.map(c => c.dimensions.width)), 
          height: Math.max(...components.map(c => c.dimensions.height))
        },
        color_options: ["black", "white", "gray"],
        durability: processedInputs.features?.includes('durable') ? "high" : "medium"
      }
    };
    
    return fallbackSpecs;
  }

  /**
   * Generate technical prompt using AI analysis of original multimodal inputs
   */
  async generateTechnicalPromptWithAI(originalInputs: MultimodalInput, processedData: any): Promise<{ technicalPrompt: string }> {
    // Collect all user inputs
    const userInputs = [];
    
    // Add text inputs
    if (originalInputs.text) {
      const textInputs = Array.isArray(originalInputs.text) ? originalInputs.text : [originalInputs.text];
      textInputs.forEach(textInput => {
        userInputs.push(`Text: "${textInput.content}"`);
      });
    }
    
    // Add voice transcripts
    if (originalInputs.voice) {
      const voiceInputs = Array.isArray(originalInputs.voice) ? originalInputs.voice : [originalInputs.voice];
      voiceInputs.forEach(voiceInput => {
        if (voiceInput.transcript) {
          userInputs.push(`Voice: "${voiceInput.transcript}"`);
        }
      });
    }
    
    // Add image descriptions
    if (originalInputs.sketch) {
      const sketchInputs = Array.isArray(originalInputs.sketch) ? originalInputs.sketch : [originalInputs.sketch];
      sketchInputs.forEach((sketchInput, index) => {
        userInputs.push(`Sketch ${index + 1}: User provided a sketch/drawing`);
      });
    }
    
    if (originalInputs.photo) {
      const photoInputs = Array.isArray(originalInputs.photo) ? originalInputs.photo : [originalInputs.photo];
      photoInputs.forEach((photoInput, index) => {
        userInputs.push(`Photo ${index + 1}: User provided a reference photo`);
      });
    }
    
    // Add video descriptions
    if (originalInputs.video) {
      const videoInputs = Array.isArray(originalInputs.video) ? originalInputs.video : [originalInputs.video];
      videoInputs.forEach((videoInput, index) => {
        userInputs.push(`Video ${index + 1}: User provided a video demonstration`);
      });
    }
    
    const prompt = `
You are an expert mechanical engineer and CAD specialist. The user has provided multimodal inputs for a product they want to create. Analyze ALL the user inputs and generate a precise 5-word technical CAD prompt that will produce the exact product they want.

USER INPUTS:
${userInputs.join('\n')}

PROCESSED ANALYSIS:
- Requirements: ${processedData.requirements?.join(', ') || 'None'}
- Components: ${processedData.components?.join(', ') || 'None'}
- Features: ${processedData.features?.join(', ') || 'None'}
- Materials: ${processedData.materials?.join(', ') || 'None'}
- Use case: ${processedData.use_case || 'None'}
- Style: ${processedData.style || 'None'}

TASK: Create a technical CAD prompt that accurately reflects the user's intent from their multimodal inputs.

REQUIREMENTS:
- Exactly 5 words maximum
- Use mechanical/engineering terminology
- Start with "design" or "create"
- Include material if specified (aluminum, steel, plastic, etc.)
- Include manufacturing method if implied (machined, molded, printed, etc.)
- Focus on the PRIMARY function/component the user described

EXAMPLES:
- "design aluminum mounting bracket machined"
- "create plastic housing injection molded"
- "design steel shaft bearing assembly"

Return ONLY a JSON response:
{
  "technicalPrompt": "your 5-word technical prompt here"
}

Focus on capturing the user's ACTUAL intent from their inputs, not generic terms.
`;

    try {
      console.log('🤖 Calling Gemini for technical prompt generation (primary)...');
      const geminiResult = await this.callGemini(prompt);
      const content = geminiResult.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      
      let result;
      try {
        const cleanedContent = this.cleanJsonResponse(content);
        result = JSON.parse(cleanedContent);
      } catch (parseError) {
        result = { technicalPrompt: content.trim().split(' ').slice(0, 5).join(' ') };
      }
      
      // Validate and clean
      if (!result.technicalPrompt) {
        throw new Error('No technical prompt from Gemini');
      }
      
      const words = result.technicalPrompt.trim().split(' ').filter(w => w.length > 0);
      if (words.length > 5) {
        result.technicalPrompt = words.slice(0, 5).join(' ');
      }
      
      console.log('✅ Gemini generated technical prompt:', result.technicalPrompt);
      return result;
    } catch (geminiError) {
      console.warn('⚠️ Gemini failed for technical prompt generation, trying OpenAI fallback:', geminiError);
      
      try {
        console.log('🤖 Calling OpenAI for technical prompt generation (fallback)...');
        const response = await this.callOpenAI([
          {
            role: 'system',
            content: 'You are an expert mechanical engineer and CAD specialist. Generate precise technical prompts that capture user intent from multimodal inputs.'
          },
          {
            role: 'user',
            content: prompt
          }
        ]);

        const content = response.choices[0]?.message?.content || '{}';
        const cleanedContent = this.cleanJsonResponse(content);
        const result = JSON.parse(cleanedContent);
        
        // Validate the response
        if (!result.technicalPrompt || result.technicalPrompt.trim().length === 0) {
          throw new Error('No technical prompt generated');
        }
        
        // Ensure it's within 5 words
        const words = result.technicalPrompt.trim().split(' ').filter(w => w.length > 0);
        if (words.length > 5) {
          result.technicalPrompt = words.slice(0, 5).join(' ');
        }
        
        console.log('✅ OpenAI generated technical prompt:', result.technicalPrompt);
        return result;
      } catch (openaiError) {
        console.warn('⚠️ OpenAI fallback also failed:', openaiError);
        
        // Final fallback using simple keyword-based approach
        return {
          technicalPrompt: this.generateTechnicalPrompt(processedData, { style: 'modern' })
        };
      }
    }
  }

  /**
   * Generate technical prompt for CAD generation (fallback method)
   */
  private generateTechnicalPrompt(processedInputs: any, preferences: any): string {
    const components = processedInputs.components || [];
    const materials = processedInputs.materials || [];
    const features = processedInputs.features || [];
    const useCase = processedInputs.use_case || '';
    
    // Start with 'design'
    let prompt = 'design';
    
    // Add component type
    let componentType = 'component';
    if (components.includes('holder_body') || useCase.includes('kitchen')) {
      componentType = 'utensil holder';
    } else if (components.includes('handle')) {
      componentType = 'handled tool';
    } else if (components.includes('bracket')) {
      componentType = 'mounting bracket';
    } else if (components.includes('base')) {
      componentType = 'base platform';
    } else if (components.includes('housing')) {
      componentType = 'housing';
    }
    
    // Add material
    let material = '';
    if (materials.includes('aluminum') || materials.includes('metal')) {
      material = 'aluminum';
    } else if (materials.includes('steel')) {
      material = 'steel';
    } else if (materials.includes('plastic')) {
      material = 'plastic';
    }
    
    // Add manufacturing method
    let method = '';
    if (features.includes('3d_print') || features.includes('printed')) {
      method = 'printed';
    } else if (features.includes('machined')) {
      method = 'machined';
    } else if (features.includes('molded')) {
      method = 'molded';
    }
    
    // Build prompt (max 5 words)
    const parts = [prompt, componentType, material, method].filter(p => p.length > 0);
    const finalPrompt = parts.slice(0, 5).join(' ');
    
    return finalPrompt || 'design mechanical component';
  }

  /**
   * Get random material for fallback generation
   */
  private getRandomMaterial(): string {
    const materials = ['ABS Plastic', 'PLA Plastic', 'Aluminum', 'Stainless Steel', 'Silicone', 'Wood', 'Carbon Fiber', 'TPU'];
    return materials[Math.floor(Math.random() * materials.length)];
  }

  /**
   * Get random features for fallback generation
   */
  private getRandomFeatures(count: number): string[] {
    const features = ['durable', 'lightweight', 'ergonomic', 'waterproof', 'portable', 'eco-friendly', 'modular', 'wireless'];
    const shuffled = features.sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Infer product type from processed inputs
   */
  private inferProductType(processedInputs: any): string {
    const useCase = processedInputs.use_case?.toLowerCase() || '';
    const requirements = (processedInputs.requirements || []).join(' ').toLowerCase();
    const features = (processedInputs.features || []).join(' ').toLowerCase();
    const components = (processedInputs.components || []).join(' ').toLowerCase();
    
    if (useCase.includes('kitchen') || requirements.includes('utensil') || features.includes('kitchen') || components.includes('holder_body')) {
      return 'Kitchen Utensil Holder';
    }
    if (useCase.includes('office') || requirements.includes('work') || features.includes('desk')) {
      return 'Office Organizer';
    }
    if (useCase.includes('tool') || requirements.includes('workshop') || features.includes('garage')) {
      return 'Tool Organizer';
    }
    if (useCase.includes('home') || requirements.includes('household')) {
      return 'Home Storage';
    }
    if (useCase.includes('tech') || requirements.includes('electronic') || features.includes('digital')) {
      return 'Tech Accessory';
    }
    if (features.includes('portable') || features.includes('carry')) {
      return 'Portable Organizer';
    }
    
    return 'Custom Organizer';
  }

  /**
   * Use AI to enhance room planning and layout
   */
  private async enhanceRoomPlanning(processedInputs: any, preferences: any): Promise<any> {
    const prompt = `
As an expert architect, create an optimized room layout based on these requirements:

Requirements: ${processedInputs.requirements.join(', ')}
Rooms needed: ${processedInputs.rooms.join(', ')}
Style: ${processedInputs.style}
Features: ${processedInputs.features.join(', ')}
Constraints: ${processedInputs.constraints.join(', ')}

Return a JSON response with:
{
  "rooms": ["optimized list of room names"],
  "layout_strategy": "description of layout approach",
  "connections": [{"from": "room1", "to": "room2", "relationship": "adjacent/connected/separated"}]
}

Consider traffic flow, natural light, privacy, and functional relationships between spaces.
`;

    try {
      const response = await this.callOpenAI([
        {
          role: 'system',
          content: 'You are an expert architect specializing in residential design and space planning.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      const content = response.choices[0]?.message?.content || '{}';
      return JSON.parse(content);
    } catch (error) {
      // Return default planning if AI fails
      return {
        rooms: processedInputs.rooms,
        layout_strategy: 'basic_linear',
        connections: []
      };
    }
  }

  /**
   * Generate realistic room dimensions based on room type and AI insights
   */
  private generateRoomDimensions(roomName: string, preferences: any, processedInputs: any): { width: number; length: number; height: number } {
    const baseDimensions = {
      'living room': { width: 5, length: 6, height: 3 },
      'kitchen': { width: 4, length: 4, height: 3 },
      'bedroom': { width: 4, length: 4.5, height: 3 },
      'bathroom': { width: 2.5, length: 3, height: 3 },
      'dining room': { width: 4, length: 5, height: 3 },
      'office': { width: 3, length: 4, height: 3 },
      'garage': { width: 6, length: 7, height: 3 },
      'basement': { width: 8, length: 10, height: 2.5 },
      'attic': { width: 6, length: 8, height: 2.2 }
    };

    const base = baseDimensions[roomName as keyof typeof baseDimensions] || baseDimensions['bedroom'];
    
    // Apply complexity scaling
    const complexityMultiplier = preferences.complexity === 'simple' ? 0.8 : 
                                 preferences.complexity === 'complex' ? 1.3 : 1.0;

    // Apply feature-based adjustments
    let sizeMultiplier = 1.0;
    if (processedInputs.features.includes('spacious') || processedInputs.features.includes('large')) {
      sizeMultiplier = 1.2;
    }
    if (processedInputs.features.includes('compact') || processedInputs.features.includes('small')) {
      sizeMultiplier = 0.8;
    }

    return {
      width: Math.round(base.width * complexityMultiplier * sizeMultiplier * 10) / 10,
      length: Math.round(base.length * complexityMultiplier * sizeMultiplier * 10) / 10,
      height: base.height
    };
  }

  /**
   * Select appropriate materials based on style and room type
   */
  private selectRoomMaterials(roomName: string, style: string): { walls: string; floor: string; ceiling: string } {
    const materialPalettes = {
      modern: {
        walls: '#f5f5f5',
        floor: '#e8e8e8', 
        ceiling: '#ffffff'
      },
      industrial: {
        walls: '#8B7355',
        floor: '#555555',
        ceiling: '#666666'
      },
      traditional: {
        walls: '#f0f0f0',
        floor: '#d4a574',
        ceiling: '#f8f8f8'
      },
      minimalist: {
        walls: '#ffffff',
        floor: '#f9f9f9',
        ceiling: '#ffffff'
      }
    };

    const palette = materialPalettes[style as keyof typeof materialPalettes] || materialPalettes.modern;

    // Bathroom-specific materials
    if (roomName === 'bathroom') {
      return {
        walls: '#e6f3ff',
        floor: '#B0C4DE',
        ceiling: palette.ceiling
      };
    }

    return palette;
  }

  /**
   * Determine if a room should have windows
   */
  private shouldAddWindow(roomName: string, features: string[]): boolean {
    // Bathrooms typically don't have windows unless specifically requested
    if (roomName === 'bathroom' && !features.includes('bathroom_window')) {
      return false;
    }

    // Storage spaces typically don't need windows
    if (roomName === 'closet' || roomName === 'pantry') {
      return false;
    }

    // Most other rooms benefit from natural light
    return Math.random() > 0.2; // 80% chance of windows
  }

  /**
   * Get appropriate features for a room type
   */
  private getRoomFeatures(roomName: string, requestedFeatures: string[]): string[] {
    const roomFeatures: Record<string, string[]> = {
      'living room': ['seating_area', 'entertainment_center'],
      'kitchen': ['countertops', 'appliances', 'storage'],
      'bedroom': ['bed_space', 'closet'],
      'bathroom': ['shower', 'sink', 'toilet'],
      'dining room': ['dining_table', 'storage'],
      'office': ['desk_space', 'storage', 'lighting']
    };

    const baseFeatures = roomFeatures[roomName] || [];
    
    // Add requested features if relevant
    const relevantFeatures = requestedFeatures.filter(feature => {
      if (roomName === 'living room' && feature === 'fireplace') return true;
      if (roomName === 'kitchen' && feature === 'island_kitchen') return true;
      if (roomName === 'bedroom' && feature === 'walk_in_closet') return true;
      return false;
    });

    return [...baseFeatures, ...relevantFeatures];
  }

  /**
   * Generate alternative designs
   */
  private async generateAlternatives(baseModel: ArchitecturalModel, count: number): Promise<ArchitecturalModel[]> {
    const alternatives: ArchitecturalModel[] = [];

    for (let i = 0; i < count; i++) {
      const alternative: ArchitecturalModel = {
        ...baseModel,
        id: `${baseModel.id}_alt_${i}`,
        name: `${baseModel.name} - Alternative ${i + 1}`,
        rooms: baseModel.rooms.map(room => ({
          ...room,
          dimensions: {
            ...room.dimensions,
            width: room.dimensions.width * (0.8 + Math.random() * 0.4),
            length: room.dimensions.length * (0.8 + Math.random() * 0.4)
          }
        }))
      };

      alternatives.push(alternative);
    }

    return alternatives;
  }

  /**
   * Calculate confidence score based on input quality and AI analysis
   */
  private calculateConfidence(processedInputs: any): number {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on input completeness (product design focused)
    if (processedInputs.components && processedInputs.components.length > 0) confidence += 0.2;
    if (processedInputs.features && processedInputs.features.length > 0) confidence += 0.1;
    if (processedInputs.style) confidence += 0.1;
    if (processedInputs.requirements && processedInputs.requirements.length > 0) confidence += 0.1;
    if (processedInputs.materials && processedInputs.materials.length > 0) confidence += 0.05;
    if (processedInputs.use_case) confidence += 0.05;

    // AI analysis adds confidence
    if (this.config.secretKey && (this.config.geminiConnectionKey || this.config.openaiConnectionKey)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 0.95);
  }

  /**
   * Process design iteration requests using AI
   */
  async processDesignIteration(
    currentModel: ArchitecturalModel,
    userFeedback: string
  ): Promise<{ updatedModel: ArchitecturalModel; explanation: string; confidence: number }> {
    try {
      const prompt = `
You are an expert architect helping to refine a building design based on user feedback.

Current design:
- Rooms: ${currentModel.rooms.map(r => r.name).join(', ')}
- Style: ${currentModel.style}
- Total area: ${currentModel.totalArea}m²

User feedback: "${userFeedback}"

Analyze the feedback and suggest specific modifications. Return a JSON response with:
{
  "modifications": [
    {
      "type": "room_resize|room_add|room_remove|style_change|feature_add",
      "target": "room_id or general",
      "details": "specific change description",
      "new_dimensions": {"width": number, "length": number, "height": number} // if applicable
    }
  ],
  "explanation": "User-friendly explanation of changes",
  "reasoning": "Why these changes address the feedback"
}
`;

      const response = await this.callOpenAI([
        {
          role: 'system',
          content: 'You are an expert architect specializing in design iteration and client feedback integration.'
        },
        {
          role: 'user',
          content: prompt
        }
      ]);

      const content = response.choices[0]?.message?.content || '{}';
      const analysis = JSON.parse(content);

      // Apply modifications to create updated model
      const updatedModel = this.applyModifications(currentModel, analysis.modifications);

      return {
        updatedModel,
        explanation: analysis.explanation || 'Design updated based on your feedback.',
        confidence: 0.85
      };

    } catch (error) {
      console.error('Design iteration failed:', error);
      throw new Error('Failed to process design feedback: ' + (error as Error).message);
    }
  }

  /**
   * Apply modifications to architectural model
   */
  private applyModifications(model: ArchitecturalModel, modifications: any[]): ArchitecturalModel {
    const updatedModel = JSON.parse(JSON.stringify(model)); // Deep clone

    modifications.forEach(mod => {
      switch (mod.type) {
        case 'room_resize':
          const room = updatedModel.rooms.find((r: Room) => r.id === mod.target);
          if (room && mod.new_dimensions) {
            room.dimensions = mod.new_dimensions;
          }
          break;
        case 'room_add':
          // Add new room logic
          break;
        case 'style_change':
          updatedModel.style = mod.details;
          break;
        // Add more modification types as needed
      }
    });

    updatedModel.modified = new Date();
    return updatedModel;
  }

  /**
   * AI Value Fixing Cleaning - handles incomplete AI-generated values safely
   */
  private aiValueFixingCleaning(jsonString: string): string {
    let cleaned = this.advancedJsonCleaning(jsonString);
    
    // Simple and safe fixes only
    try {
      // First, handle the specific error pattern "lVolume": approximat
      cleaned = cleaned.replace(/"lVolume":\s*approximat(?:[^",}]*)(?=[,}])/g, '"lVolume": "approximately"');
      
      // Fix incomplete values that might be at position 1944 or similar
      cleaned = cleaned.replace(/:\s*variable\b/g, ': "variable"');
      cleaned = cleaned.replace(/:\s*approximat(?:e|ely)?(?:[^"]|$)/g, ': "approximately"');
      cleaned = cleaned.replace(/:\s*determin(?:ed?)?(?:[^"]|$)/g, ': "determined"');
      cleaned = cleaned.replace(/:\s*depend(?:s|ent)?(?:[^"]|$)/g, ': "depends"');
      cleaned = cleaned.replace(/:\s*calcul(?:ated?)?(?:[^"]|$)/g, ': "calculated"');
      cleaned = cleaned.replace(/:\s*estim(?:ated?)?(?:[^"]|$)/g, ': "estimated"');
      
      // Handle more specific truncated words that can appear in the JSON
      cleaned = cleaned.replace(/:\s*"?approximat[^"]*"?(?=([,}]))/g, ': "approximately"');
      cleaned = cleaned.replace(/:\s*manufactur[^"]*(?=([,}]))/g, ': "manufacturing"');
      cleaned = cleaned.replace(/:\s*implement[^"]*(?=([,}]))/g, ': "implementation"');
      cleaned = cleaned.replace(/:\s*recommend[^"]*(?=([,}]))/g, ': "recommended"');
      
      // Fix any unquoted truncated values followed by commas or closing braces
      cleaned = cleaned.replace(/:\s*([a-zA-Z]+[^"',}]*?)(?=[,}])/g, ': "$1"');
      
      // Additional safety: remove any invalid characters that might break JSON parsing
      cleaned = cleaned.replace(/[\x00-\x1F\x7F-\x9F]/g, ''); // Remove control characters
      
      // Ensure all string values are properly quoted
      cleaned = cleaned.replace(/:\s*([^"{\[\]0-9\-][^,}]*?)(?=[,}])/g, (match, value) => {
        // Only quote if it's not already a valid JSON value
        const trimmedValue = value.trim();
        if (!trimmedValue.startsWith('"') && 
            !trimmedValue.startsWith('{') && 
            !trimmedValue.startsWith('[') && 
            isNaN(Number(trimmedValue)) && 
            trimmedValue !== 'true' && 
            trimmedValue !== 'false' && 
            trimmedValue !== 'null') {
          return `: "${trimmedValue}"`;
        }
        return match;
      });
      
      // Fix common AI incomplete patterns that cause position-specific errors
      cleaned = cleaned.replace(/:\s*"[^"]*$/g, ': "incomplete"'); // Unclosed quotes at end
      cleaned = cleaned.replace(/,\s*$/g, ''); // Remove trailing commas
      cleaned = cleaned.replace(/\{[^}]*$/g, '{}'); // Close incomplete objects
      cleaned = cleaned.replace(/\[[^\]]*$/g, '[]'); // Close incomplete arrays
      
      // Remove any trailing incomplete content after the last complete property
      const lastCompleteProperty = cleaned.lastIndexOf('"}');
      const lastCompleteBrace = cleaned.lastIndexOf('}');
      
      if (lastCompleteProperty > 0 && lastCompleteProperty < lastCompleteBrace) {
        // Find the position after the last complete property
        const cutoffPoint = lastCompleteProperty + 2;
        cleaned = cleaned.substring(0, cutoffPoint) + '}';
      }
      
      // Ensure proper closing braces
      const openBraces = (cleaned.match(/\{/g) || []).length;
      const closeBraces = (cleaned.match(/\}/g) || []).length;
      
      if (openBraces > closeBraces) {
        cleaned += '}';
      }
      
      return cleaned;
    } catch (error) {
      console.warn('🔧 AI value fixing failed, returning basic cleaned version');
      return this.basicJsonCleaning(jsonString);
    }
  }
  
  /**
   * Force close malformed JSON by adding missing closing brackets
   */
  private forceCloseJson(jsonString: string): string {
    console.log('🔧 Force closing malformed JSON...');
    
    let fixed = jsonString.trim();
    
    // Count opening vs closing brackets
    const openBraces = (fixed.match(/\{/g) || []).length;
    const closeBraces = (fixed.match(/\}/g) || []).length;
    const openBrackets = (fixed.match(/\[/g) || []).length;
    const closeBrackets = (fixed.match(/\]/g) || []).length;
    
    console.log(`🔧 Brackets: { ${openBraces}/${closeBraces}, [ ${openBrackets}/${closeBrackets}`);
    
    // Remove any trailing incomplete content that might cause issues
    fixed = fixed.replace(/,\s*$/, ''); // Remove trailing comma
    fixed = fixed.replace(/:\s*$/, ': "incomplete"'); // Complete incomplete key-value
    fixed = fixed.replace(/"[^"]*$/, '"incomplete"'); // Close incomplete string
    
    // Add missing closing brackets
    const missingBraces = openBraces - closeBraces;
    const missingBrackets = openBrackets - closeBrackets;
    
    for (let i = 0; i < missingBrackets; i++) {
      fixed += ']';
    }
    for (let i = 0; i < missingBraces; i++) {
      fixed += '}';
    }
    
    console.log('🔧 Force close result length:', fixed.length);
    return fixed;
  }
}

// Export singleton instance
export const architecturalAI = new ProductDesignAIService(); 