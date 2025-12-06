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