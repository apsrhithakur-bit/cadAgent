import { ArchitecturalModel } from '../types/architectural';
import { ClientKCLEngine, KCLExecutionResult as ClientKCLExecutionResult } from './clientKCLEngine';

export interface KCLCompletionRequest {
  prompt: string;
  maxTokens?: number;
  temperature?: number;
  stopSequences?: string[];
}

export interface KCLCompletionResponse {
  completions: Array<{
    text: string;
    description?: string;
    confidence?: number;
  }>;
}

export interface KCLExecutionRequest {
  code: string;
  outputFormat?: 'gltf' | 'step' | 'obj' | 'stl';
  units?: 'mm' | 'cm' | 'm' | 'in' | 'ft';
}

export interface KCLExecutionResponse {
  status: 'completed' | 'failed' | 'processing';
  outputs?: {
    gltf_url?: string;
    thumbnail?: string;
    step_url?: string;
    obj_url?: string;
    stl_url?: string;
  };
  error?: string;
  executionTime?: number;
}

export interface KCLValidationResult {
  valid: boolean;
  errors?: Array<{
    line: number;
    column: number;
    message: string;
    severity: 'error' | 'warning';
  }>;
}

export interface KCLComponent {
  id: string;
  name: string;
  type: 'sketch' | 'extrude' | 'revolve' | 'loft' | 'sweep' | 'boolean' | 'fillet' | 'chamfer';
  startLine: number;
  endLine: number;
  parameters: Record<string, string | number | boolean>;
  children?: KCLComponent[];
}

class KCLService {
  private clientEngine: ClientKCLEngine | null = null;
  
  /**
   * Initialize the client-side KCL engine
   */
  private async getEngine(): Promise<ClientKCLEngine> {
    if (!this.clientEngine) {
      this.clientEngine = new ClientKCLEngine();
      await this.clientEngine.initialize();
    }
    return this.clientEngine;
  }
  
  /**
   * Get KCL code completions using client-side analysis
   */
  async getCompletions(request: KCLCompletionRequest): Promise<KCLCompletionResponse> {
    try {
      const engine = await this.getEngine();
      const completions = engine.getCompletions(request.prompt, { line: 1, column: 1 });
      
      return {
        completions: completions.map(comp => ({
          text: comp.insertText,
          description: comp.documentation,
          confidence: 0.8
        }))
      };
    } catch (error) {
      console.error('❌ KCL completion error:', error);
      // Return empty completions on error
      return { completions: [] };
    }
  }

  /**
   * Execute KCL code and generate 3D model using client-side engine
   */
  async executeKCL(request: KCLExecutionRequest): Promise<KCLExecutionResponse> {
    try {
      const engine = await this.getEngine();
      
             // Execute KCL code client-side
       const result = await engine.executeKCL(request.code, {
         format: (request.outputFormat === 'step' ? 'gltf' : request.outputFormat) as 'gltf' | 'stl' | 'obj',
         units: (request.units === 'ft' ? 'in' : request.units) as 'mm' | 'cm' | 'm' | 'in',
         quality: 'normal',
         useCache: true
      });

      if (result.errors && result.errors.length > 0) {
        return {
          status: 'failed',
          error: result.errors.map(e => e.message).join('; '),
          executionTime: result.executionTime
        };
      }

      // Convert result to expected format
      const outputs: any = {};
      if (result.gltf) {
        outputs.gltf_url = URL.createObjectURL(new Blob([result.gltf], { type: 'model/gltf-binary' }));
      }
      if (result.stl) {
        outputs.stl_url = URL.createObjectURL(new Blob([result.stl], { type: 'application/octet-stream' }));
      }

      return {
        status: 'completed',
        outputs,
        executionTime: result.executionTime
      };
    } catch (error) {
      console.error('❌ KCL execution error:', error);
      return {
        status: 'failed',
        error: (error as Error).message || 'Unknown execution error'
      };
    }
  }

  /**
   * Validate KCL code syntax
   */
  async validateKCL(code: string): Promise<KCLValidationResult> {
    // Basic client-side validation for now
    // In the future, this would call a Zoo API endpoint
    const errors: KCLValidationResult['errors'] = [];
    const lines = code.split('\n');

    // Check for common KCL syntax patterns
    const validationRules = [
      { pattern: /^\s*sketch\s*=/, message: 'Sketch assignment' },
      { pattern: /^\s*\/\//, message: 'Comment line' },
      { pattern: /^\s*const\s+\w+\s*=/, message: 'Constant declaration' },
      { pattern: /^\s*\.\w+\(/, message: 'Method call' },
      { pattern: /^\s*$/, message: 'Empty line' }
    ];

    lines.forEach((line, index) => {
      if (line.trim() && !validationRules.some(rule => rule.pattern.test(line))) {
        // Check for unmatched parentheses
        const openParens = (line.match(/\(/g) || []).length;
        const closeParens = (line.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          errors.push({
            line: index + 1,
            column: 1,
            message: 'Unmatched parentheses',
            severity: 'error'
          });
        }
      }
    });

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined
    };
  }

  /**
   * Parse KCL code into component tree
   */
  async parseKCL(code: string): Promise<KCLComponent[]> {
    const components: KCLComponent[] = [];
    const lines = code.split('\n');
    let currentComponent: KCLComponent | null = null;
    let componentId = 0;

    lines.forEach((line, index) => {
      // Detect sketch start
      if (line.includes('startSketchOn')) {
        currentComponent = {
          id: `component-${componentId++}`,
          name: `Sketch ${componentId}`,
          type: 'sketch',
          startLine: index,
          endLine: index,
          parameters: {},
          children: []
        };
        components.push(currentComponent);
      }
      
      // Detect extrude
      else if (line.includes('extrude(') && currentComponent) {
        const extrudeMatch = line.match(/extrude\(([^)]+)\)/);
        if (extrudeMatch) {
          const child: KCLComponent = {
            id: `component-${componentId++}`,
            name: `Extrude ${componentId}`,
            type: 'extrude',
            startLine: index,
            endLine: index,
            parameters: { depth: extrudeMatch[1] }
          };
          currentComponent.children?.push(child);
        }
      }
      
      // Update end line for current component
      if (currentComponent && line.trim()) {
        currentComponent.endLine = index;
      }
    });

    return components;
  }

  /**
   * Generate KCL code from natural language description
   */
  async generateKCLFromPrompt(prompt: string): Promise<string> {
    try {
      console.log('🔧 Generating KCL from prompt:', prompt);
      
      // FIXED: Direct template generation instead of completion system
      // The completion system returns VS Code snippets with placeholders
      const kclCode = this.generateKCLTemplate(prompt);
      
      console.log('✅ Generated KCL code:', kclCode.substring(0, 100) + '...');
      return kclCode;
    } catch (error) {
      console.error('❌ KCL generation error:', error);
      return this.generateKCLTemplate(prompt);
    }
  }

  /**
   * Modify existing KCL code based on instruction
   */
  async modifyKCL(originalCode: string, modification: string): Promise<string> {
    try {
      const prompt = `Given this KCL code:

${originalCode}

Apply this modification: ${modification}

Return the complete modified KCL code:`;

      const completions = await this.getCompletions({
        prompt,
        maxTokens: 800,
        temperature: 0.2
      });

      if (completions.completions.length > 0) {
        return completions.completions[0].text;
      }

      // Simple modification fallback
      return this.applySimpleModification(originalCode, modification);
    } catch (error) {
      console.error('❌ KCL modification error:', error);
      return originalCode;
    }
  }

  /**
   * Convert 3D model to KCL code (reverse engineering)
   */
  async modelToKCL(model: ArchitecturalModel): Promise<string> {
    // This is a placeholder - actual implementation would require
    // analyzing the 3D model geometry and generating appropriate KCL
    const description = model.description || model.name || 'Custom object';
    
    // Get dimensions from CAD model properties if available
    const dimensions = model.cadModel?.properties?.dimensions || { width: 100, height: 100, depth: 50 };
    
    return `// Reverse-engineered KCL for: ${description}
// Note: This is an approximation based on model properties

const width = ${dimensions.width}
const height = ${dimensions.height}
const depth = ${dimensions.depth}

// Main body
sketch = startSketchOn('XY')
  .startProfileAt([0, 0])
  .line([width, 0])
  .line([0, height])
  .line([-width, 0])
  .close()
  .extrude(depth)

// Add any detected features here
// This would require actual geometry analysis`;
  }

  /**
   * Get KCL snippets for common operations
   */
  getKCLSnippets(): Record<string, string> {
    return {
      box: `// Box
const width = 100
const height = 50
const depth = 30

sketch = startSketchOn('XY')
  .startProfileAt([0, 0])
  .line([width, 0])
  .line([0, height])
  .line([-width, 0])
  .close()
  .extrude(depth)`,

      cylinder: `// Cylinder
const radius = 50
const height = 100

sketch = startSketchOn('XY')
  .circle([0, 0], radius)
  .extrude(height)`,

      hollowBox: `// Hollow box with wall thickness
const outerWidth = 100
const outerHeight = 80
const outerDepth = 60
const wallThickness = 2

// Outer shell
outerSketch = startSketchOn('XY')
  .startProfileAt([0, 0])
  .line([outerWidth, 0])
  .line([0, outerHeight])
  .line([-outerWidth, 0])
  .close()

// Inner cavity
innerWidth = outerWidth - (wallThickness * 2)
innerHeight = outerHeight - (wallThickness * 2)
innerDepth = outerDepth - wallThickness

innerSketch = startSketchOn('XY')
  .startProfileAt([wallThickness, wallThickness])
  .line([innerWidth, 0])
  .line([0, innerHeight])
  .line([-innerWidth, 0])
  .close()

// Create hollow box
box = outerSketch.extrude(outerDepth)
  .subtract(innerSketch.extrude(innerDepth, { offset: wallThickness }))`,

      fillet: `// Add fillet to edges
const filletRadius = 2

model = model.fillet(filletRadius, model.edges())`,

      pattern: `// Linear pattern
const count = 5
const spacing = 20

model = model.linearPattern({
  direction: [1, 0, 0],
  count: count,
  distance: spacing
})`
    };
  }

  // Private helper methods

  // Polling is no longer needed with client-side execution

  private generateKCLTemplate(prompt: string): string {
    const lowercasePrompt = prompt.toLowerCase();
    
    console.log('🎯 Generating KCL template for:', lowercasePrompt);
    
    // Extract dimensions if present
    const dimensionMatch = prompt.match(/(\d+)\s*[×x]\s*(\d+)\s*[×x]\s*(\d+)\s*mm/i);
    const hasCustomDimensions = !!dimensionMatch;
    const [width, height, depth] = hasCustomDimensions 
      ? [dimensionMatch![1], dimensionMatch![2], dimensionMatch![3]]
      : ['100', '50', '20'];
    
    // Detect component type and features
    const isHollow = lowercasePrompt.includes('hollow') || lowercasePrompt.includes('cavit');
    const isComponent = lowercasePrompt.includes('component') || lowercasePrompt.includes('part');
    const isBox = lowercasePrompt.includes('box') || lowercasePrompt.includes('cube');
    const isCylinder = lowercasePrompt.includes('cylinder') || lowercasePrompt.includes('round');
    
    // Generate appropriate KCL based on prompt analysis
    if (isCylinder) {
      const radius = Math.min(Number(width), Number(height)) / 2;
      return `// ${prompt}
const radius = ${radius}
const height = ${depth}

sketch = startSketchOn('XY')
  .circle([0, 0], radius)
  .extrude(height)`;
    } else if (isHollow || prompt.includes('wall thickness')) {
      const wallThickness = lowercasePrompt.includes('2mm') ? '2' : 
                          lowercasePrompt.includes('3mm') ? '3' : '2';
      
      return `// ${prompt}
const outerWidth = ${width}
const outerHeight = ${height}
const outerDepth = ${depth}
const wallThickness = ${wallThickness}

// Create outer shell
outerSketch = startSketchOn('XY')
  .startProfileAt([0, 0])
  .line([outerWidth, 0])
  .line([0, outerHeight])
  .line([-outerWidth, 0])
  .close()

// Create inner cavity for hollowing
innerWidth = outerWidth - (wallThickness * 2)
innerHeight = outerHeight - (wallThickness * 2)
innerDepth = outerDepth - wallThickness

innerSketch = startSketchOn('XY')
  .startProfileAt([wallThickness, wallThickness])
  .line([innerWidth, 0])
  .line([0, innerHeight])
  .line([-innerWidth, 0])
  .close()

// Create hollow component
component = outerSketch.extrude(outerDepth)`;
    } else if (isBox || isComponent) {
      return `// ${prompt}
const width = ${width}
const height = ${height}
const depth = ${depth}

// Main component body
sketch = startSketchOn('XY')
  .startProfileAt([0, 0])
  .line([width, 0])
  .line([0, height])
  .line([-width, 0])
  .close()
  .extrude(depth)`;
    }
    
    // Default template for unknown types
    return `// ${prompt}
const width = ${width}
const height = ${height}
const depth = ${depth}

sketch = startSketchOn('XY')
  .startProfileAt([0, 0])
  .line([width, 0])
  .line([0, height])
  .line([-width, 0])
  .close()
  .extrude(depth)`;
  }

  private applySimpleModification(code: string, modification: string): string {
    let modifiedCode = code;
    const modLower = modification.toLowerCase();

    // Handle dimension changes
    const dimMatch = modLower.match(/(\w+)\s*=\s*(\d+)/);
    if (dimMatch) {
      const [, varName, newValue] = dimMatch;
      const regex = new RegExp(`const\\s+${varName}\\s*=\\s*\\d+`, 'g');
      modifiedCode = modifiedCode.replace(regex, `const ${varName} = ${newValue}`);
    }

    // Handle making hollow
    if (modLower.includes('hollow')) {
      modifiedCode += `\n\n// Make hollow with 2mm wall thickness
model = model.shell(2)`;
    }

    // Handle adding fillets
    if (modLower.includes('fillet') || modLower.includes('round')) {
      const radiusMatch = modLower.match(/(\d+)\s*mm/);
      const radius = radiusMatch ? radiusMatch[1] : '2';
      modifiedCode += `\n\n// Add fillets
model = model.fillet(${radius}, model.edges())`;
    }

    return modifiedCode;
  }
}

export const kclService = new KCLService();