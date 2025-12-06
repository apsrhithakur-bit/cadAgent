import { ArchitecturalModel, ModelProperties } from '../types/architectural';
import { cadAI } from './cadAI';
import { kclService } from './kclService';
import { ClientKCLEngine } from './clientKCLEngine';

export interface OptimizationObjective {
  type: 'reduce_weight' | 'reduce_cost' | 'improve_strength' | 'improve_manufacturability' | 'enhance_aesthetics';
  priority: 'high' | 'medium' | 'low';
  target?: number;
}

export interface OptimizationConstraint {
  type: 'max_dimensions' | 'min_wall_thickness' | 'material_type' | 'manufacturing_method';
  value: string | number | { width: number; height: number; depth: number };
}

export interface OptimizationContext {
  useCase?: string;
  environment?: string;
  budget?: number;
  timeline?: string;
  manufacturingMethod?: 'fdm_3d_printing' | 'sla_3d_printing' | 'cnc_machining' | 'injection_molding' | 'sheet_metal';
}

export interface OptimizationSuggestion {
  id: string;
  title: string;
  description: string;
  category: 'weight' | 'cost' | 'strength' | 'manufacturing' | 'aesthetics';
  expectedImpact: {
    weightReduction?: number;
    costSavings?: number;
    strengthIncrease?: number;
    timeReduction?: number;
  };
  confidence: number;
  kclModification?: string;
  prompt: string;
}

export interface OptimizationResult {
  originalModel: ArchitecturalModel;
  optimizedModel: ArchitecturalModel;
  improvements: {
    weightReduction: number;
    costSavings: number;
    strengthChange: number;
    manufacturabilityScore: number;
  };
  appliedSuggestions: OptimizationSuggestion[];
}

export interface QuickOptimizationAction {
  id: string;
  label: string;
  icon: string;
  category: 'performance' | 'manufacturing' | 'cost' | 'ergonomics' | 'thermal' | 'strength';
  prompt: string;
  kclModification?: string;
  description: string;
}

// Quick optimization actions based on the plan
export const QUICK_OPTIMIZATIONS: QuickOptimizationAction[] = [
  {
    id: 'reduce_weight',
    label: 'Reduce Weight by 20%',
    icon: '⚖️',
    category: 'performance',
    prompt: 'hollow out internal structure while maintaining structural integrity, create internal cavities with 2-3mm wall thickness',
    description: 'Creates hollow internal structures to reduce weight while maintaining strength'
  },
  {
    id: '3d_print_ready',
    label: '3D Print Ready',
    icon: '🖨️',
    category: 'manufacturing',
    prompt: 'optimize for FDM 3D printing: remove overhangs greater than 45 degrees, add support structures where needed, ensure all walls are at least 1.2mm thick, add slight chamfers to bottom edges',
    description: 'Optimizes model for FDM 3D printing with proper supports and angles'
  },
  {
    id: 'cut_costs',
    label: 'Cut Costs in Half',
    icon: '💰',
    category: 'cost',
    prompt: 'reduce material usage by simplifying geometry, use standard stock sizes, minimize complex features, consolidate parts where possible',
    description: 'Simplifies design to reduce material and manufacturing costs'
  },
  {
    id: 'improve_grip',
    label: 'Improve Grip',
    icon: '✋',
    category: 'ergonomics',
    prompt: 'add ergonomic grip features: finger grooves spaced 20mm apart, textured surface with 0.5mm deep diamond pattern, slight palm swell, rounded edges for comfort',
    description: 'Adds ergonomic features for better handling and comfort'
  },
  {
    id: 'add_ventilation',
    label: 'Add Ventilation',
    icon: '🌬️',
    category: 'thermal',
    prompt: 'add cooling ventilation: hexagonal vent pattern with 5mm holes, maintain structural integrity, position vents for optimal airflow, add internal channels for heat dissipation',
    description: 'Adds ventilation holes and cooling channels for thermal management'
  },
  {
    id: 'strengthen_structure',
    label: 'Strengthen Structure',
    icon: '💪',
    category: 'strength',
    prompt: 'reinforce structure: add 2mm ribs at stress points, increase wall thickness at joints to 4mm, add gussets at 90-degree angles, use triangulation for load distribution',
    description: 'Reinforces structure with ribs and increased wall thickness'
  },
  {
    id: 'snap_fit_assembly',
    label: 'Snap-Fit Assembly',
    icon: '🔧',
    category: 'manufacturing',
    prompt: 'convert to snap-fit assembly: replace screws with cantilever snaps, add alignment features, design for one-way assembly, include slight draft angles for easy insertion',
    description: 'Converts design to use snap-fit connections instead of fasteners'
  },
  {
    id: 'reduce_assembly_time',
    label: 'Quick Assembly',
    icon: '⚡',
    category: 'manufacturing',
    prompt: 'optimize for quick assembly: add clear alignment markers, design parts to only fit one way, minimize number of unique parts, add visual assembly guides',
    description: 'Optimizes design for faster and easier assembly'
  }
];

class OptimizationService {
  private modelCache = new Map<string, ArchitecturalModel>();
  private clientEngine: ClientKCLEngine | null = null;
  
  private async getEngine(): Promise<ClientKCLEngine> {
    if (!this.clientEngine) {
      this.clientEngine = new ClientKCLEngine();
      await this.clientEngine.initialize();
    }
    return this.clientEngine;
  }

  async analyzeModelForOptimization(model: ArchitecturalModel): Promise<{
    properties: ModelProperties;
    optimizationOpportunities: OptimizationSuggestion[];
    manufacturingReadiness: {
      fdm3dPrinting: number;
      cncMachining: number;
      injectionMolding: number;
    };
  }> {
    console.log('🔍 Analyzing model for optimization opportunities...');

    // Calculate current properties if not available
    const properties = model.properties || await this.calculateModelProperties(model);

    // Generate optimization suggestions based on model analysis
    const opportunities = await this.identifyOptimizationOpportunities(model, properties);

    // Assess manufacturing readiness
    const manufacturingReadiness = this.assessManufacturingReadiness(model, properties);

    return {
      properties,
      optimizationOpportunities: opportunities,
      manufacturingReadiness
    };
  }

  async applyQuickOptimization(
    model: ArchitecturalModel,
    optimization: QuickOptimizationAction,
    context?: OptimizationContext
  ): Promise<OptimizationResult> {
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

      // Since direct KCL execution isn't available, we'll generate a new model with the optimization applied
      console.log('🔄 Generating optimized model with modifications...');
      
      // Create a descriptive prompt that includes the optimization
      const optimizedPrompt = await this.generateOptimizedPrompt(model, optimization, context);
      
      // Generate the optimized model using Zoo API
      const optimizedModelData = await cadAI.generateAndWaitForCAD({
        prompt: optimizedPrompt,
        outputFormat: 'gltf',
        units: 'mm'
      });

      if (!optimizedModelData || optimizedModelData.status === 'failed') {
        throw new Error('Failed to generate optimized model');
      }

      // Create optimized model with new KCL code and generated model
      const optimizedModel: ArchitecturalModel = {
        ...model,
        id: `${model.id}-optimized-${Date.now()}`,
        title: `${model.title} (${optimization.label})`,
        description: `${model.description || ''} - Optimized: ${optimization.description}`,
        cadModel: {
          ...model.cadModel!,
          id: optimizedModelData.id,
          prompt: optimizedPrompt,
          kclCode: modifiedKCL, // Store the modified KCL for reference
          gltfUrl: optimizedModelData.gltfUrl || optimizedModelData.outputs?.gltf_url || '',
          thumbnailUrl: optimizedModelData.thumbnailUrl || optimizedModelData.outputs?.thumbnail || '',
          formats: optimizedModelData.formats || {},
          properties: optimizedModelData.properties || model.cadModel?.properties || {
            dimensions: { width: 100, height: 100, depth: 100 },
            volume: 100000,
            surfaceArea: 60000,
            complexity: 'moderate'
          }
        },
        imageUrl: optimizedModelData.thumbnailUrl || optimizedModelData.outputs?.thumbnail || model.imageUrl,
        gltfUrl: optimizedModelData.gltfUrl || optimizedModelData.outputs?.gltf_url || ''
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
          category: optimization.category as any,
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

  async generateOptimizationSuggestions(
    model: ArchitecturalModel,
    objectives: OptimizationObjective[],
    constraints: OptimizationConstraint[]
  ): Promise<OptimizationSuggestion[]> {
    console.log('🤖 Generating AI-powered optimization suggestions...');

    const analysis = await this.analyzeModelForOptimization(model);
    const suggestions: OptimizationSuggestion[] = [];

    // Sort objectives by priority
    const sortedObjectives = objectives.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });

    // Generate suggestions for each objective
    for (const objective of sortedObjectives) {
      const objectiveSuggestions = await this.generateSuggestionsForObjective(
        model,
        analysis,
        objective,
        constraints
      );
      suggestions.push(...objectiveSuggestions);
    }

    // Filter and rank suggestions
    return this.rankSuggestions(suggestions, objectives);
  }

  private async generateOptimizedPrompt(
    model: ArchitecturalModel,
    optimization: QuickOptimizationAction,
    context?: OptimizationContext
  ): Promise<string> {
    // Construct base prompt from model
    const basePrompt = model.description || model.title || 'A CAD model';

    // Add optimization instructions
    let optimizationPrompt = `${basePrompt}. ${optimization.prompt}`;

    // Add context-specific requirements
    if (context?.manufacturingMethod) {
      const manufacturingRequirements = this.getManufacturingRequirements(context.manufacturingMethod);
      optimizationPrompt += `. ${manufacturingRequirements}`;
    }

    // Add material specifications if available
    if (model.components?.[0]?.material) {
      optimizationPrompt += `. Use ${model.components[0].material.name} material properties`;
    }

    // Add dimension constraints if available
    if (model.properties?.dimensions) {
      const { width, height, depth } = model.properties.dimensions;
      optimizationPrompt += `. Maintain approximate dimensions of ${width}mm x ${height}mm x ${depth}mm`;
    }

    return optimizationPrompt;
  }

  private async calculateModelProperties(model: ArchitecturalModel): Promise<ModelProperties> {
    // Basic property calculation - in real implementation would analyze the 3D model
    return {
      dimensions: model.properties?.dimensions || { width: 100, height: 100, depth: 100, unit: 'mm' },
      volume: model.properties?.volume || 100000,
      surfaceArea: model.properties?.surfaceArea || 60000,
      weight: model.properties?.weight || 100,
      centerOfGravity: model.properties?.centerOfGravity || { x: 50, y: 50, z: 50 },
      momentOfInertia: model.properties?.momentOfInertia || { x: 1000, y: 1000, z: 1000 },
      boundingBox: model.properties?.boundingBox || {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 100, y: 100, z: 100 }
      },
      complexity: model.properties?.complexity || 'moderate'
    };
  }

  private async identifyOptimizationOpportunities(
    model: ArchitecturalModel,
    properties: ModelProperties
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Weight optimization opportunities
    if (properties.volume > 50000) {
      suggestions.push({
        id: 'weight-opt-1',
        title: 'Hollow Structure Opportunity',
        description: 'Large solid volume detected. Consider hollowing to reduce weight by up to 60%',
        category: 'weight',
        expectedImpact: { weightReduction: 60 },
        confidence: 0.9,
        prompt: 'Create hollow internal structure with 2-3mm wall thickness'
      });
    }

    // Manufacturing optimization
    if (properties.complexity === 'complex') {
      suggestions.push({
        id: 'mfg-opt-1',
        title: 'Simplify for Manufacturing',
        description: 'Complex geometry detected. Simplification could reduce costs by 40%',
        category: 'manufacturing',
        expectedImpact: { costSavings: 40 },
        confidence: 0.8,
        prompt: 'Simplify geometry for easier manufacturing, reduce feature count'
      });
    }

    // Cost optimization based on material volume
    const materialCost = (properties.volume / 1000) * 0.05; // Rough estimate
    if (materialCost > 10) {
      suggestions.push({
        id: 'cost-opt-1',
        title: 'Material Usage Optimization',
        description: `High material usage detected ($${materialCost.toFixed(2)}). Optimization could save 30%`,
        category: 'cost',
        expectedImpact: { costSavings: 30 },
        confidence: 0.85,
        prompt: 'Optimize material usage while maintaining functionality'
      });
    }

    return suggestions;
  }

  private assessManufacturingReadiness(
    model: ArchitecturalModel,
    properties: ModelProperties
  ): { fdm3dPrinting: number; cncMachining: number; injectionMolding: number } {
    // Simple scoring based on model properties
    const scores = {
      fdm3dPrinting: 0.7,
      cncMachining: 0.6,
      injectionMolding: 0.5
    };

    // Adjust scores based on complexity
    if (properties.complexity === 'simple') {
      scores.fdm3dPrinting += 0.2;
      scores.cncMachining += 0.2;
      scores.injectionMolding += 0.3;
    } else if (properties.complexity === 'complex') {
      scores.fdm3dPrinting -= 0.2;
      scores.injectionMolding -= 0.3;
    }

    // Normalize scores
    return {
      fdm3dPrinting: Math.max(0, Math.min(1, scores.fdm3dPrinting)),
      cncMachining: Math.max(0, Math.min(1, scores.cncMachining)),
      injectionMolding: Math.max(0, Math.min(1, scores.injectionMolding))
    };
  }

  private async convertToArchitecturalModel(
    cadData: { outputs?: { thumbnail?: string; gltf_url?: string }; gltfUrl?: string },
    originalModel: ArchitecturalModel,
    optimization: QuickOptimizationAction
  ): Promise<ArchitecturalModel> {
    // Preserve original model data with updates
    return {
      ...originalModel,
      id: `${originalModel.id}-optimized-${Date.now()}`,
      title: `${originalModel.title} (${optimization.label})`,
      description: `${originalModel.description || ''} - Optimized: ${optimization.description}`,
      imageUrl: cadData.outputs?.thumbnail || originalModel.imageUrl,
      gltfUrl: cadData.outputs?.gltf_url || cadData.gltfUrl,
      status: 'optimized' as any,
      optimization: {
        type: optimization.id,
        timestamp: new Date().toISOString(),
        improvements: {}
      }
    };
  }

  private async calculateImprovements(
    original: ArchitecturalModel,
    optimized: ArchitecturalModel
  ): Promise<{
    weightReduction: number;
    costSavings: number;
    strengthChange: number;
    manufacturabilityScore: number;
  }> {
    const originalProps = original.properties || await this.calculateModelProperties(original);
    const optimizedProps = optimized.properties || await this.calculateModelProperties(optimized);

    const weightReduction = originalProps.weight > 0
      ? ((originalProps.weight - optimizedProps.weight) / originalProps.weight) * 100
      : 0;

    const volumeReduction = originalProps.volume > 0
      ? ((originalProps.volume - optimizedProps.volume) / originalProps.volume) * 100
      : 0;

    // Estimate cost savings based on volume reduction
    const costSavings = volumeReduction * 0.8; // Rough estimate

    return {
      weightReduction: Math.max(0, weightReduction),
      costSavings: Math.max(0, costSavings),
      strengthChange: 0, // Would need FEA analysis
      manufacturabilityScore: 0.85 // Placeholder
    };
  }

  private async generateSuggestionsForObjective(
    model: ArchitecturalModel,
    analysis: any,
    objective: OptimizationObjective,
    constraints: OptimizationConstraint[]
  ): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    switch (objective.type) {
      case 'reduce_weight':
        if (analysis.properties.volume > 10000) {
          suggestions.push({
            id: `weight-${Date.now()}`,
            title: 'Advanced Lattice Structure',
            description: 'Replace solid sections with optimized lattice structures',
            category: 'weight',
            expectedImpact: { weightReduction: 70 },
            confidence: 0.85,
            prompt: 'Create gyroid lattice infill with 20% density in thick sections'
          });
        }
        break;

      case 'reduce_cost':
        suggestions.push({
          id: `cost-${Date.now()}`,
          title: 'Part Consolidation',
          description: 'Combine multiple parts into single piece',
          category: 'cost',
          expectedImpact: { costSavings: 35 },
          confidence: 0.75,
          prompt: 'Consolidate assembly into single part with living hinges'
        });
        break;

      case 'improve_manufacturability':
        const mfgMethod = constraints.find(c => c.type === 'manufacturing_method')?.value;
        if (mfgMethod === 'injection_molding') {
          suggestions.push({
            id: `mfg-${Date.now()}`,
            title: 'Add Draft Angles',
            description: 'Add 2-degree draft angles for easy part ejection',
            category: 'manufacturing',
            expectedImpact: { costSavings: 20 },
            confidence: 0.9,
            prompt: 'Add 2-degree draft angles to all vertical walls for injection molding'
          });
        }
        break;
    }

    return suggestions;
  }

  private rankSuggestions(
    suggestions: OptimizationSuggestion[],
    objectives: OptimizationObjective[]
  ): OptimizationSuggestion[] {
    // Create priority map
    const priorityWeights = { high: 3, medium: 2, low: 1 };
    const objectivePriorities = new Map(
      objectives.map(obj => [obj.type, priorityWeights[obj.priority]])
    );

    // Score each suggestion
    const scoredSuggestions = suggestions.map(suggestion => {
      let score = suggestion.confidence;

      // Weight by objective priority
      const relatedObjective = objectives.find(obj => {
        if (obj.type === 'reduce_weight' && suggestion.category === 'weight') return true;
        if (obj.type === 'reduce_cost' && suggestion.category === 'cost') return true;
        if (obj.type === 'improve_manufacturability' && suggestion.category === 'manufacturing') return true;
        return false;
      });

      if (relatedObjective) {
        score *= priorityWeights[relatedObjective.priority];
      }

      return { suggestion, score };
    });

    // Sort by score and return
    return scoredSuggestions
      .sort((a, b) => b.score - a.score)
      .map(item => item.suggestion);
  }

  private getManufacturingRequirements(method: string): string {
    const requirements = {
      fdm_3d_printing: 'Ensure minimum wall thickness of 1.2mm, avoid overhangs greater than 45 degrees, add support structures where needed',
      sla_3d_printing: 'Ensure minimum feature size of 0.5mm, add drain holes for resin, avoid trapped volumes',
      cnc_machining: 'Add tool clearance, avoid undercuts, use standard tool radii, add fixturing points',
      injection_molding: 'Add 1-2 degree draft angles, maintain uniform wall thickness, avoid undercuts, add ejector pin locations',
      sheet_metal: 'Use standard bend radii, maintain minimum flange lengths, avoid features too close to bends'
    };

    return requirements[method] || 'Optimize for general manufacturing';
  }

  // KCL modification helper methods
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

export const optimizationService = new OptimizationService();