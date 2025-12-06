import { ArchitecturalModel, ModelProperties } from '../types/architectural';
import { cadAI } from './cadAI';
import { kclService } from './kclService';

// This is a new implementation that modifies KCL code instead of regenerating models

export class KCLOptimizationService {
  async applyQuickOptimization(
    model: ArchitecturalModel,
    optimization: any,
    context?: any
  ): Promise<any> {
    console.log(`🚀 Applying KCL-based optimization: ${optimization.label}`);

    try {
      // Check if model has KCL code
      let kclCode = model.cadModel?.kclCode;
      
      if (!kclCode) {
        console.log('⚠️ No KCL code found, generating from model description...');
        kclCode = await kclService.generateKCLFromPrompt(model.description || model.title || 'CAD model');
      }

      console.log('📝 Original KCL code:', kclCode.substring(0, 200) + '...');

      // Apply KCL modifications based on optimization type
      let modifiedKCL = kclCode;
      
      switch (optimization.id) {
        case 'reduce_weight':
          modifiedKCL = await this.applyHollowingModification(kclCode);
          break;
        case '3d_print_ready':
          modifiedKCL = await this.apply3DPrintOptimization(kclCode);
          break;
        case 'add_ventilation':
          modifiedKCL = await this.applyVentilationModification(kclCode);
          break;
        case 'strengthen_structure':
          modifiedKCL = await this.applyStrengtheningModification(kclCode);
          break;
        case 'improve_grip':
          modifiedKCL = await this.applyGripModification(kclCode);
          break;
        case 'cut_costs':
          modifiedKCL = await this.applyCostReductionModification(kclCode);
          break;
        default:
          // For other optimizations, use KCL service to modify based on description
          modifiedKCL = await kclService.modifyKCL(kclCode, optimization.prompt);
      }

      console.log('✨ Modified KCL code:', modifiedKCL.substring(0, 200) + '...');

      // Execute the modified KCL to generate new model
      const executionResult = await kclService.executeKCL({
        code: modifiedKCL,
        outputFormat: 'gltf',
        units: context?.manufacturingMethod?.includes('3d_printing') ? 'mm' : 'mm'
      });

      if (executionResult.status === 'failed') {
        throw new Error(`KCL execution failed: ${executionResult.error}`);
      }

      // Create optimized model with new KCL code
      const optimizedModel: ArchitecturalModel = {
        ...model,
        id: `${model.id}-optimized-${Date.now()}`,
        title: `${model.title} (${optimization.label})`,
        description: `${model.description || ''} - Optimized: ${optimization.description}`,
        cadModel: {
          ...model.cadModel!,
          kclCode: modifiedKCL,
          gltfUrl: executionResult.outputs?.gltf_url || model.cadModel?.gltfUrl || '',
          thumbnailUrl: executionResult.outputs?.thumbnail || model.cadModel?.thumbnailUrl
        },
        imageUrl: executionResult.outputs?.thumbnail || model.imageUrl
      };

      // Calculate improvements (placeholder for now)
      const improvements = {
        weightReduction: optimization.id === 'reduce_weight' ? 20 : 0,
        costSavings: optimization.id === 'cut_costs' ? 30 : 5,
        strengthChange: optimization.id === 'strengthen_structure' ? 15 : 0,
        manufacturabilityScore: 0.85
      };

      return {
        originalModel: model,
        optimizedModel,
        improvements,
        appliedSuggestions: [{
          id: optimization.id,
          title: optimization.label,
          description: optimization.description,
          category: optimization.category,
          expectedImpact: improvements,
          confidence: 0.85,
          kclModification: modifiedKCL,
          prompt: optimization.prompt
        }]
      };
    } catch (error) {
      console.error('❌ KCL optimization failed:', error);
      throw new Error(`Failed to apply KCL optimization: ${error.message}`);
    }
  }

  // KCL modification methods
  private async applyHollowingModification(kclCode: string): Promise<string> {
    // Add shell operation to make model hollow
    const wallThickness = 2; // mm
    
    // Check if model already has shell operation
    if (kclCode.includes('.shell(') || kclCode.includes('shell(')) {
      // Update existing shell thickness
      return kclCode.replace(/\.shell\(\s*\d+(\.\d+)?\s*\)/g, `.shell(${wallThickness})`);
    }
    
    // Add shell operation before the final close or at the end
    const lines = kclCode.split('\n');
    const modifiedLines: string[] = [];
    let lastExtrudeIndex = -1;
    
    for (let i = 0; i < lines.length; i++) {
      modifiedLines.push(lines[i]);
      if (lines[i].includes('extrude(')) {
        lastExtrudeIndex = i;
      }
    }
    
    // Insert shell operation after the last extrude
    if (lastExtrudeIndex >= 0) {
      modifiedLines.splice(lastExtrudeIndex + 1, 0, `  |> shell(${wallThickness}) // Make hollow with ${wallThickness}mm wall thickness`);
    } else {
      // If no extrude found, add at the end
      modifiedLines.push(`\n// Make hollow\nmodel = model.shell(${wallThickness})`);
    }
    
    return modifiedLines.join('\n');
  }

  private async apply3DPrintOptimization(kclCode: string): Promise<string> {
    let modified = kclCode;
    
    // Add comments about 3D printing optimization
    modified = `// Optimized for 3D printing\n${modified}`;
    
    // Ensure minimum wall thickness
    modified = modified.replace(/thickness\s*=\s*(\d+(\.\d+)?)/g, (match, value) => {
      const thickness = parseFloat(value);
      return thickness < 1.2 ? 'thickness = 1.2' : match;
    });
    
    // Update any wall thickness constants
    modified = modified.replace(/const\s+wallThickness\s*=\s*(\d+(\.\d+)?)/g, (match, value) => {
      const thickness = parseFloat(value);
      return thickness < 1.2 ? 'const wallThickness = 1.2' : match;
    });
    
    // Add chamfers to bottom edges if not already present
    if (!modified.includes('chamfer')) {
      const lines = modified.split('\n');
      const lastLineIndex = lines.length - 1;
      lines.splice(lastLineIndex, 0, '\n// Add chamfer for better bed adhesion\nmodel = model.chamfer(0.5, model.edges())');
      modified = lines.join('\n');
    }
    
    return modified;
  }

  private async applyVentilationModification(kclCode: string): Promise<string> {
    // Add ventilation holes pattern
    const ventHoleSize = 5; // mm
    const spacing = 15; // mm
    
    // Check if model has width/height constants
    const hasWidth = kclCode.includes('const width') || kclCode.includes('const boxWidth');
    const hasHeight = kclCode.includes('const height') || kclCode.includes('const boxHeight');
    
    let ventPattern = '\n// Add ventilation holes\n';
    
    if (hasWidth && hasHeight) {
      // Use existing dimensions
      ventPattern += `const ventHoles = []
const ventRadius = ${ventHoleSize / 2}
const ventSpacing = ${spacing}

// Create hexagonal vent pattern
for (let x = ventSpacing; x < width - ventSpacing; x += ventSpacing) {
  for (let y = ventSpacing; y < height - ventSpacing; y += ventSpacing) {
    ventHoles.push(
      startSketchOn('XY')
        |> circle([x, y], ventRadius)
    )
  }
}

// Subtract vent holes from model
if (ventHoles.length > 0) {
  model = model.subtract(ventHoles.map(hole => hole.extrude(thickness * 2)))
}`;
    } else {
      // Use fixed pattern
      ventPattern += `// Add top ventilation pattern
const ventRadius = ${ventHoleSize / 2}
const ventPattern = startSketchOn('XY')
  |> circle([20, 20], ventRadius)
  |> circle([40, 20], ventRadius)
  |> circle([60, 20], ventRadius)
  |> circle([20, 40], ventRadius)
  |> circle([40, 40], ventRadius)
  |> circle([60, 40], ventRadius)

model = model.subtract(ventPattern.extrude(50))`;
    }
    
    return kclCode + ventPattern;
  }

  private async applyStrengtheningModification(kclCode: string): Promise<string> {
    // Add ribs for strengthening
    const ribThickness = 2; // mm
    const ribHeight = 4; // mm
    
    // Check if model has dimensions
    const hasWidth = kclCode.includes('const width') || kclCode.includes('const boxWidth');
    const hasHeight = kclCode.includes('const height') || kclCode.includes('const boxHeight');
    
    let ribPattern = '\n// Add strengthening ribs\n';
    
    if (hasWidth && hasHeight) {
      ribPattern += `const ribs = []

// Cross-pattern ribs
ribs.push(
  startSketchOn('XY')
    |> startProfileAt([0, height/2 - ${ribThickness}/2])
    |> line([width, 0])
    |> line([0, ${ribThickness}])
    |> line([-width, 0])
    |> close()
    |> extrude(${ribHeight})
)

ribs.push(
  startSketchOn('XY')
    |> startProfileAt([width/2 - ${ribThickness}/2, 0])
    |> line([${ribThickness}, 0])
    |> line([0, height])
    |> line([-${ribThickness}, 0])
    |> close()
    |> extrude(${ribHeight})
)

// Add ribs to model
model = model.union(ribs)`;
    } else {
      // Add simple reinforcement
      ribPattern += `// Add reinforcement ribs
const rib1 = startSketchOn('XY')
  |> startProfileAt([10, 40])
  |> line([80, 0])
  |> line([0, ${ribThickness}])
  |> line([-80, 0])
  |> close()
  |> extrude(${ribHeight})

const rib2 = startSketchOn('XY')
  |> startProfileAt([45, 10])
  |> line([${ribThickness}, 0])
  |> line([0, 60])
  |> line([-${ribThickness}, 0])
  |> close()
  |> extrude(${ribHeight})

model = model.union([rib1, rib2])`;
    }
    
    return kclCode + ribPattern;
  }

  private async applyGripModification(kclCode: string): Promise<string> {
    // Add grip features
    const grooveDepth = 1; // mm
    const grooveWidth = 3; // mm
    const grooveSpacing = 20; // mm
    
    const gripPattern = `\n// Add ergonomic grip features
const gripGrooves = []
const grooveCount = 4

// Create finger grooves
for (let i = 0; i < grooveCount; i++) {
  const yPos = 20 + (i * ${grooveSpacing})
  gripGrooves.push(
    startSketchOn('XZ')
      |> startProfileAt([0, yPos])
      |> arc([${grooveWidth}, yPos + ${grooveWidth}/2], [0, yPos + ${grooveWidth}])
      |> line([0, yPos])
      |> close()
      |> extrude(${grooveDepth})
  )
}

// Subtract grooves from model
if (gripGrooves.length > 0) {
  model = model.subtract(gripGrooves)
}

// Add textured surface (represented as comment for actual manufacturing)
// Note: Apply 0.5mm deep diamond knurl pattern during manufacturing`;
    
    return kclCode + gripPattern;
  }

  private async applyCostReductionModification(kclCode: string): Promise<string> {
    let modified = kclCode;
    
    // Reduce material by decreasing thickness where possible
    modified = modified.replace(/const\s+thickness\s*=\s*(\d+(\.\d+)?)/g, (match, value) => {
      const thickness = parseFloat(value);
      const reducedThickness = Math.max(thickness * 0.8, 1.5); // Reduce by 20% but keep minimum 1.5mm
      return `const thickness = ${reducedThickness} // Reduced for cost savings`;
    });
    
    // Reduce wall thickness
    modified = modified.replace(/const\s+wallThickness\s*=\s*(\d+(\.\d+)?)/g, (match, value) => {
      const thickness = parseFloat(value);
      const reducedThickness = Math.max(thickness * 0.8, 1.2); // Reduce by 20% but keep minimum 1.2mm
      return `const wallThickness = ${reducedThickness} // Reduced for cost savings`;
    });
    
    // Add comment about material optimization
    modified = `// Optimized for reduced material cost\n// Wall and material thickness reduced by up to 20%\n${modified}`;
    
    // If no thickness constants found, add shell operation to hollow out
    if (!modified.includes('thickness =') && !modified.includes('shell(')) {
      modified += '\n\n// Hollow out to save material\nmodel = model.shell(2)';
    }
    
    return modified;
  }
}

export const kclOptimizationService = new KCLOptimizationService();