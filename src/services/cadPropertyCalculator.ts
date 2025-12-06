import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Cache for property calculations to prevent redundant processing
const CALCULATION_CACHE = new Map<string, CalculatedProperties>();
const GLTF_CACHE = new Map<string, any>();

// Material property database for cost estimation
interface MaterialProperties {
  density: number; // kg/m³
  costPerKg: number; // USD per kg
  name: string;
  type: 'plastic' | 'metal' | 'ceramic' | 'composite' | 'other';
  manufacturingMethods: string[];
}

const MATERIAL_DATABASE: Record<string, MaterialProperties> = {
  pla: {
    density: 1240, // kg/m³ (standard engineering value)
    costPerKg: 25,
    name: 'PLA Plastic',
    type: 'plastic',
    manufacturingMethods: ['3D Printing', 'FDM']
  },
  abs: {
    density: 1040, // kg/m³ (ASTM D792)
    costPerKg: 30,
    name: 'ABS Plastic',
    type: 'plastic',
    manufacturingMethods: ['3D Printing', 'Injection Molding']
  },
  aluminum: {
    density: 2700, // kg/m³ (Aluminum 6061-T6 standard)
    costPerKg: 15,
    name: 'Aluminum 6061',
    type: 'metal',
    manufacturingMethods: ['CNC Machining', 'Die Casting']
  },
  steel: {
    density: 7850, // kg/m³ (AISI 1020 mild steel)
    costPerKg: 8,
    name: 'Mild Steel',
    type: 'metal',
    manufacturingMethods: ['CNC Machining', 'Welding', 'Forging']
  },
  titanium: {
    density: 4430, // kg/m³ (Ti-6Al-4V standard)
    costPerKg: 150,
    name: 'Titanium Ti-6Al-4V',
    type: 'metal',
    manufacturingMethods: ['CNC Machining', 'Additive Manufacturing']
  },
  nylon: {
    density: 1150, // kg/m³ (Nylon 6/6 standard)
    costPerKg: 40,
    name: 'Nylon 6/6',
    type: 'plastic',
    manufacturingMethods: ['3D Printing', 'Injection Molding']
  }
};

export interface CalculatedProperties {
  volume: {
    total: number; // cm³
    displayValue: string; // Auto-formatted with appropriate units
    byComponent: Array<{
      name: string;
      volume: number;
    }>;
  };
  dimensions: {
    overall: {
      length: number; // mm
      width: number; // mm  
      height: number; // mm
    };
    displayValue: string; // Auto-formatted dimensions string
    boundingBox: {
      min: THREE.Vector3;
      max: THREE.Vector3;
    };
  };
  specifications: {
    weight: number; // grams
    weightDisplay: string; // Auto-formatted with appropriate units
    surfaceArea: number; // cm²
    surfaceAreaDisplay: string; // Auto-formatted with appropriate units
    complexity: 'simple' | 'moderate' | 'complex';
    materialVolume: number; // cm³
    estimatedPrintTime?: number; // hours (for 3D printing)
    printTimeDisplay?: string; // Formatted print time
  };
  manufacturing: {
    recommendedMethod: string;
    materialsUsed?: string; // All materials from components
    materialCost: number; // USD
    laborCost: number; // USD
    totalCost: number; // USD
    costDisplay: string; // Formatted cost range
    complexity: 'simple' | 'moderate' | 'complex';
    estimatedLeadTime: number; // days
    leadTimeDisplay: string; // Formatted lead time
    reasoning?: string; // Explanation of why this method was chosen
  };
  productDescription?: {
    title: string; // AI-generated product name
    description: string; // Detailed product description
    potentialUses: string[]; // Array of potential use cases
    keyFeatures: string[]; // Notable design features
    category: string; // Product category classification
  };
}

export class CADPropertyCalculator {
  private loader: GLTFLoader;

  constructor() {
    this.loader = new GLTFLoader();
  }

  /**
   * Format volume with appropriate units (mm³, mL, L)
   * Input volume is expected to be in cm³ (already corrected)
   * 1 cm³ = 1 mL = 1000 mm³
   */
  private formatVolume(volumeCm3: number): string {
    console.log('🔍 formatVolume called with:', volumeCm3, 'cm³');
    
    // Volume should already be corrected at this point, but add safety check
    if (volumeCm3 > 200) {
      console.warn('⚠️ Very large volume detected in format function:', volumeCm3, 'cm³');
      volumeCm3 = Math.min(volumeCm3, 200); // Cap unrealistic volumes
    }
    
    // Convert cm³ to mm³ for very small volume display
    const volumeMm3 = volumeCm3 * 1000;
    
    if (volumeCm3 < 0.001) {
      // Extremely small volumes: show in mm³
      return `${volumeMm3.toFixed(1)} mm³`;
    } else if (volumeCm3 < 0.1) {
      // Very small volumes: show in mL with more precision (since 1 cm³ = 1 mL)
      return `${volumeCm3.toFixed(3)} mL`;
    } else if (volumeCm3 < 10) {
      // Small to medium volumes: show in mL (since 1 cm³ = 1 mL)
      return `${volumeCm3.toFixed(1)} mL`;
    } else if (volumeCm3 < 1000) {
      // Large volumes: show in mL
      return `${volumeCm3.toFixed(1)} mL`;
    } else {
      // Very large volumes: show in liters
      return `${(volumeCm3 / 1000).toFixed(2)} L`;
    }
  }

  /**
   * Format weight with appropriate units (mg, g, kg)
   */
  private formatWeight(grams: number): string {
    if (grams < 1) {
      return `${(grams * 1000).toFixed(0)} mg`;
    } else if (grams < 1000) {
      return `${grams.toFixed(1)} g`;
    } else {
      return `${(grams / 1000).toFixed(2)} kg`;
    }
  }

  /**
   * Format dimensions with appropriate units (mm, cm, m)
   * Auto-detects scale based on size
   */
  private formatDimensions(length: number, width: number, height: number): string {
    const maxDim = Math.max(length, width, height);
    
    console.log('🔍 Formatting dimensions:', { length, width, height, maxDim });
    
    // Auto-detect units based on the scale of the model
    if (maxDim < 0.1) {
      // Very small model, probably in meters but representing mm-scale object
      const mmLength = length * 1000;
      const mmWidth = width * 1000;
      const mmHeight = height * 1000;
      return `${mmLength.toFixed(1)} × ${mmWidth.toFixed(1)} × ${mmHeight.toFixed(1)} mm`;
    } else if (maxDim < 1) {
      // Small model, likely in cm or representing cm-scale object
      const cmLength = length * 100;
      const cmWidth = width * 100;
      const cmHeight = height * 100;
      return `${cmLength.toFixed(1)} × ${cmWidth.toFixed(1)} × ${cmHeight.toFixed(1)} cm`;
    } else if (maxDim < 100) {
      // Medium model, treat as cm
      return `${length.toFixed(1)} × ${width.toFixed(1)} × ${height.toFixed(1)} cm`;
    } else if (maxDim < 10000) {
      // Large model, likely in mm
      return `${length.toFixed(0)} × ${width.toFixed(0)} × ${height.toFixed(0)} mm`;
    } else {
      // Very large, convert to meters
      return `${(length / 1000).toFixed(2)} × ${(width / 1000).toFixed(2)} × ${(height / 1000).toFixed(2)} m`;
    }
  }

  /**
   * Format surface area with appropriate units
   */
  private formatSurfaceArea(areaCm2: number): string {
    if (areaCm2 < 1) {
      return `${(areaCm2 * 100).toFixed(1)} mm²`;
    } else if (areaCm2 < 10000) {
      return `${areaCm2.toFixed(1)} cm²`;
    } else {
      return `${(areaCm2 / 10000).toFixed(2)} m²`;
    }
  }

  /**
   * Format print time with appropriate units
   */
  private formatPrintTime(hours: number): string {
    if (hours < 1) {
      return `${Math.round(hours * 60)} min`;
    } else if (hours < 24) {
      const h = Math.floor(hours);
      const m = Math.round((hours - h) * 60);
      return m > 0 ? `${h}h ${m}m` : `${h}h`;
    } else {
      const days = Math.floor(hours / 24);
      const remainingHours = Math.round(hours % 24);
      return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`;
    }
  }

  /**
   * Format cost range
   */
  private formatCost(totalCost: number): string {
    const minCost = Math.round(totalCost);
    const maxCost = Math.round(totalCost * 1.5);
    return `$${minCost}-${maxCost}`;
  }

  /**
   * Format lead time
   */
  private formatLeadTime(days: number): string {
    if (days < 1) {
      return 'Same day';
    } else if (days === 1) {
      return '1 day';
    } else if (days < 7) {
      return `${days} days`;
    } else if (days < 30) {
      const weeks = Math.round(days / 7);
      return weeks === 1 ? '1 week' : `${weeks} weeks`;
    } else {
      const months = Math.round(days / 30);
      return months === 1 ? '1 month' : `${months} months`;
    }
  }

  /**
   * Calculate comprehensive properties from GLTF URL
   */
  async calculatePropertiesFromGLTF(gltfUrl: string, materialHint?: string): Promise<CalculatedProperties> {
    // Create cache key from URL and material hint
    const cacheKey = `${gltfUrl}-${materialHint || 'default'}`;
    
    // Check if we already calculated properties for this GLTF
    if (CALCULATION_CACHE.has(cacheKey)) {
      console.log('📦 Using cached properties for:', gltfUrl);
      return CALCULATION_CACHE.get(cacheKey)!;
    }
    
    console.log('🔧 Calculating properties for GLTF:', gltfUrl);
    
    try {
      const gltf = await this.loadGLTF(gltfUrl);
      const properties = this.calculatePropertiesFromScene(gltf.scene, materialHint);
      
      // Generate AI-powered product description
      console.log('🤖 Generating AI product description...');
      const productDescription = await this.generateProductDescription(properties, gltf.scene);
      
      const finalProperties = {
        ...properties,
        productDescription
      };
      
      // Cache the result
      CALCULATION_CACHE.set(cacheKey, finalProperties);
      
      return finalProperties;
    } catch (error) {
      console.error('Failed to load GLTF for property calculation:', error);
      throw new Error('Unable to calculate properties from CAD model');
    }
  }

  /**
   * Calculate properties from a Three.js scene
   */
  calculatePropertiesFromScene(scene: THREE.Object3D, materialHint?: string): CalculatedProperties {
    // First, infer the primary material that will be used consistently
    const boundingBox = new THREE.Box3().setFromObject(scene);
    const size = boundingBox.getSize(new THREE.Vector3());
    const estimatedVolume = size.x * size.y * size.z * 0.5; // Rough estimate for material inference
    
    const primaryMaterial = this.inferMaterial(materialHint, estimatedVolume, undefined);
    console.log('🔍 Using consistent material for all components:', primaryMaterial.name);
    
    const meshes = this.extractMeshes(scene);
    const components = this.analyzeMeshComponents(meshes, primaryMaterial); // Pass primary material
    
    // Calculate overall bounding box
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('🔍 Raw Three.js dimensions:', { x: size.x, y: size.y, z: size.z, maxDim });
    
    // Apply proper unit conversion to get dimensions in mm
    const dimensionsInMm = this.convertDimensionsToMm(size.x, size.z, size.y, maxDim);
    
    const dimensions = {
      overall: {
        length: Math.round(dimensionsInMm.length * 1000) / 1000, // Preserve precision
        width: Math.round(dimensionsInMm.width * 1000) / 1000,  
        height: Math.round(dimensionsInMm.height * 1000) / 1000  
      },
      boundingBox: {
        min: boundingBox.min,
        max: boundingBox.max
      }
    };

    console.log('🔍 Converted dimensions (mm):', dimensions.overall);

    // Calculate total volume
    const rawTotalVolume = this.calculateTotalVolume(meshes);
    
    // CRITICAL: Detect and fix unit mismatches early before calculations
    let correctedTotalVolume = rawTotalVolume;
    if (rawTotalVolume > 50) { // Anything over 50cm³ is suspicious for typical small parts
      console.log('⚠️ Large volume detected, checking for unit mismatch:', rawTotalVolume);
      // Check if this might be in mm³ instead of cm³
      const volumeRatio = rawTotalVolume / (size.x * size.y * size.z);
      if (volumeRatio > 0.1) { // If calculated volume is significant portion of bounding box
        console.log('🔍 Likely unit mismatch - converting from mm³ to cm³');
        correctedTotalVolume = rawTotalVolume / 1000; // Convert mm³ to cm³
      }
    }
    
    // Validate volume against AI estimates if available
    // Try to get AI estimated volume from scene userData or other sources
    const aiEstimatedVolume = (scene as any).userData?.aiEstimatedVolume || 
                              (scene as any).userData?.totalArea ||
                              undefined;
    
    const totalVolume = this.validateVolumeConstraints(correctedTotalVolume, aiEstimatedVolume);
    const volumeByComponent = components.map(comp => ({
      name: comp.name,
      volume: comp.volume,
      material: primaryMaterial.name, // Use consistent material for all components
      dimensions: comp.dimensions,
      // Ensure component material matches manufacturing material
      manufacturingCompatibleMaterial: primaryMaterial.name
    }));

    // Use only the primary material for all calculations
    const uniqueMaterials = [primaryMaterial];
    
    console.log('🔍 Material analysis (consistent):', {
      primaryMaterial: primaryMaterial.name,
      allComponentsUseMaterial: primaryMaterial.name
    });
    
    // Calculate specifications using primary material
    const specifications = this.calculateSpecifications(totalVolume, dimensions, primaryMaterial, meshes);
    
    // Calculate manufacturing costs and recommendations with consistent material
    const manufacturing = this.calculateManufacturing(
      totalVolume, 
      specifications, 
      primaryMaterial, 
      dimensions, 
      uniqueMaterials // Use consistent material list
    );

    return {
      volume: {
        total: totalVolume,
        displayValue: this.formatVolume(totalVolume),
        byComponent: volumeByComponent
      },
      dimensions: {
        ...dimensions,
        displayValue: this.formatDimensions(dimensions.overall.length, dimensions.overall.width, dimensions.overall.height)
      },
      specifications: {
        ...specifications,
        weightDisplay: this.formatWeight(specifications.weight),
        surfaceAreaDisplay: this.formatSurfaceArea(specifications.surfaceArea),
        printTimeDisplay: specifications.estimatedPrintTime ? this.formatPrintTime(specifications.estimatedPrintTime) : undefined
      },
      manufacturing: {
        ...manufacturing,
        costDisplay: this.formatCost(manufacturing.totalCost),
        leadTimeDisplay: this.formatLeadTime(manufacturing.estimatedLeadTime)
      }
    };
  }

  /**
   * Load GLTF file
   */
  private loadGLTF(url: string): Promise<any> {
    // Check GLTF cache first
    if (GLTF_CACHE.has(url)) {
      console.log('📦 Using cached GLTF for:', url);
      return Promise.resolve(GLTF_CACHE.get(url));
    }
    
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          // Cache the GLTF
          GLTF_CACHE.set(url, gltf);
          resolve(gltf);
        },
        undefined,
        (error) => reject(error)
      );
    });
  }

  /**
   * Extract all meshes from scene
   */
  private extractMeshes(scene: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    
    scene.traverse((child) => {
      if (child instanceof THREE.Mesh && child.geometry) {
        meshes.push(child);
      }
    });
    
    return meshes;
  }

  /**
   * Analyze individual mesh components with enhanced accuracy
   */
  private analyzeMeshComponents(meshes: THREE.Mesh[], consistentMaterial: MaterialProperties) {
    return meshes.map((mesh, index) => {
      const bbox = new THREE.Box3().setFromObject(mesh);
      const size = bbox.getSize(new THREE.Vector3());
      const volume = this.calculateMeshVolume(mesh);
      const maxDim = Math.max(size.x, size.y, size.z);
      
      // Apply proper unit conversion based on model scale
      const dimensionsInMm = this.convertDimensionsToMm(size.x, size.z, size.y, maxDim);
      
      // Analyze geometry complexity for realistic shape determination
      const shapeAnalysis = this.analyzeComponentShape(mesh);
      
      // Use the consistent material for all components to avoid mixing
      console.log('🔍 Component', index + 1, 'using consistent material:', consistentMaterial.name);
      
      return {
        name: mesh.name || `Component ${index + 1}`,
        volume: volume,
        dimensions: {
          // Ensure realistic dimensions with proper scaling
          width: Math.max(0.1, Math.round(dimensionsInMm.width * 100) / 100),   // Minimum 0.1mm
          length: Math.max(0.1, Math.round(dimensionsInMm.length * 100) / 100), // Minimum 0.1mm  
          height: Math.max(0.1, Math.round(dimensionsInMm.height * 100) / 100)  // Minimum 0.1mm
        },
        // Use consistent material for all components
        material: consistentMaterial,
        // Add shape analysis for realistic rendering
        shapeAnalysis: shapeAnalysis,
        // Store original mesh for advanced analysis
        mesh: mesh,
        // Precise bounding box
        boundingBox: {
          min: bbox.min.clone(),
          max: bbox.max.clone(),
          center: bbox.getCenter(new THREE.Vector3()),
          size: size.clone()
        }
      };
    });
  }

  /**
   * Analyze component shape characteristics for realistic rendering
   */
  private analyzeComponentShape(mesh: THREE.Mesh): {
    type: string;
    aspectRatio: number;
    complexity: 'simple' | 'moderate' | 'complex';
    features: string[];
  } {
    const geometry = mesh.geometry;
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    
    // Calculate aspect ratios
    const xyRatio = size.x / size.y;
    const xzRatio = size.x / size.z;
    const yzRatio = size.y / size.z;
    const maxRatio = Math.max(xyRatio, xzRatio, yzRatio);
    
    // Analyze vertex count and distribution
    const positions = geometry.getAttribute('position');
    const vertexCount = positions ? positions.count : 0;
    
    // Determine shape type based on proportions
    let shapeType = 'box';
    const features: string[] = [];
    
    if (maxRatio > 10) {
      shapeType = 'rod';
      features.push('elongated');
    } else if (maxRatio > 5) {
      shapeType = 'beam';
      features.push('rectangular');
    } else if (Math.abs(xyRatio - 1) < 0.2 && Math.abs(xzRatio - 1) < 0.2) {
      shapeType = 'cube';
      features.push('cubic');
    } else if (size.y < Math.min(size.x, size.z) * 0.3) {
      shapeType = 'plate';
      features.push('flat');
    } else {
      features.push('rectangular');
    }
    
    // Determine complexity based on vertex density
    const volume = size.x * size.y * size.z;
    const vertexDensity = vertexCount / volume;
    
    let complexity: 'simple' | 'moderate' | 'complex' = 'simple';
    if (vertexDensity > 1000) {
      complexity = 'complex';
      features.push('detailed_surface');
    } else if (vertexDensity > 100) {
      complexity = 'moderate';
      features.push('moderate_detail');
    } else {
      features.push('smooth_surface');
    }
    
    return {
      type: shapeType,
      aspectRatio: maxRatio,
      complexity,
      features
    };
  }

  /**
   * Calculate volume of a single mesh using proper geometric calculation
   */
  private calculateMeshVolume(mesh: THREE.Mesh): number {
    const geometry = mesh.geometry;
    
    if (!geometry.isBufferGeometry) {
      console.warn('Geometry is not BufferGeometry, using bounding box approximation');
      return this.calculateBoundingBoxVolume(mesh);
    }

    // Get mesh scale to determine units
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('🔍 Mesh dimensions for volume calculation:', { x: size.x, y: size.y, z: size.z, maxDim });

    // Try to calculate using triangle-based volume calculation
    try {
      const rawVolume = this.calculateTriangleBasedVolume(geometry);
      console.log('🔍 Raw triangle-based volume:', rawVolume);
      
      if (rawVolume > 0) {
        // Apply scale-aware unit conversion
        const scaledVolume = this.applyVolumeScaling(rawVolume, maxDim);
        console.log('🔍 Scaled volume (cm³):', scaledVolume);
        return scaledVolume;
      }
    } catch (error) {
      console.warn('Triangle-based volume calculation failed, using bounding box');
    }

    return this.calculateBoundingBoxVolume(mesh);
  }

  /**
   * Calculate volume using triangle-based method (more accurate for closed meshes)
   */
  private calculateTriangleBasedVolume(geometry: THREE.BufferGeometry): number {
    const positions = geometry.getAttribute('position');
    if (!positions) return 0;

    const vertices = positions.array;
    let volume = 0;

    // For indexed geometry
    const index = geometry.getIndex();
    if (index) {
      for (let i = 0; i < index.count; i += 3) {
        const a = index.getX(i) * 3;
        const b = index.getX(i + 1) * 3;
        const c = index.getX(i + 2) * 3;
        
        volume += this.tetrahedronVolume(
          vertices[a], vertices[a + 1], vertices[a + 2],
          vertices[b], vertices[b + 1], vertices[b + 2],
          vertices[c], vertices[c + 1], vertices[c + 2]
        );
      }
    } else {
      // For non-indexed geometry
      for (let i = 0; i < vertices.length; i += 9) {
        volume += this.tetrahedronVolume(
          vertices[i], vertices[i + 1], vertices[i + 2],
          vertices[i + 3], vertices[i + 4], vertices[i + 5],
          vertices[i + 6], vertices[i + 7], vertices[i + 8]
        );
      }
    }

    return Math.abs(volume);
  }

  /**
   * Calculate tetrahedron volume formed by triangle and origin
   */
  private tetrahedronVolume(x1: number, y1: number, z1: number,
                           x2: number, y2: number, z2: number,
                           x3: number, y3: number, z3: number): number {
    return (x1 * (y2 * z3 - y3 * z2) + 
            x2 * (y3 * z1 - y1 * z3) + 
            x3 * (y1 * z2 - y2 * z1)) / 6;
  }

  /**
   * Convert dimensions to millimeters based on model scale
   */
  /**
   * Unified scale detection for both dimensions and volume
   * Returns scale factors that are mathematically consistent
   */
  private detectModelScale(maxDimension: number): { 
    dimensionScale: number; 
    volumeScale: number; 
    detectedUnit: string;
    targetDimensionUnit: string;
    targetVolumeUnit: string;
  } {
    console.log('🔍 Unified scale detection - maxDim:', maxDimension);
    
    let dimensionScale = 1;
    let volumeScale = 1;
    let detectedUnit = 'unknown';
    
    // Unified thresholds ensure consistent unit interpretation
    if (maxDimension < 0.001) {
      // Extremely small - likely in meters representing micro-scale (sub-mm)
      detectedUnit = 'meters (micro-scale)';
      dimensionScale = 1000; // m to mm
      volumeScale = 1000000; // m³ to cm³ (1000³ ÷ 1000)
    } else if (maxDimension < 0.1) {
      // Small model - likely in meters representing mm-scale objects
      detectedUnit = 'meters (mm-scale)';
      dimensionScale = 1000; // m to mm
      volumeScale = 1000000; // m³ to cm³ (1000³ ÷ 1000)
    } else if (maxDimension < 1) {
      // Medium-small - likely in meters representing cm-scale objects
      detectedUnit = 'meters (cm-scale)';
      dimensionScale = 1000; // m to mm
      volumeScale = 1000000; // m³ to cm³ (1000³ ÷ 1000)
    } else if (maxDimension < 100) {
      // Medium model - likely in cm units
      detectedUnit = 'centimeters';
      dimensionScale = 10; // cm to mm
      volumeScale = 1; // cm³ to cm³ (no conversion needed)
    } else if (maxDimension < 10000) {
      // Large model - likely already in mm
      detectedUnit = 'millimeters';
      dimensionScale = 1; // mm to mm
      volumeScale = 0.001; // mm³ to cm³ (÷ 1000)
    } else {
      // Very large - likely in mm representing very large objects
      detectedUnit = 'millimeters (large)';
      dimensionScale = 1; // mm to mm
      volumeScale = 0.001; // mm³ to cm³ (÷ 1000)
    }
    
    console.log('🔍 Scale detection result:', {
      detectedUnit,
      dimensionScale,
      volumeScale,
      targetDimensionUnit: 'mm',
      targetVolumeUnit: 'cm³'
    });
    
    return {
      dimensionScale,
      volumeScale,
      detectedUnit,
      targetDimensionUnit: 'mm',
      targetVolumeUnit: 'cm³'
    };
  }

  private convertDimensionsToMm(x: number, z: number, y: number, maxDimension: number): { length: number; width: number; height: number } {
    console.log('🔍 Converting dimensions to mm - raw:', { x, z, y, maxDimension });
    
    const scaleInfo = this.detectModelScale(maxDimension);
    const scaleFactor = scaleInfo.dimensionScale;
    
    console.log('🔍 Using unified scale detection:', scaleInfo.detectedUnit, '→', scaleInfo.targetDimensionUnit, 'scale:', scaleFactor);
    
    const result = {
      length: x * scaleFactor,
      width: z * scaleFactor,
      height: y * scaleFactor
    };
    
    console.log('🔍 Converted dimensions (mm):', result);
    return result;
  }

  /**
   * Apply proper volume scaling based on model dimensions
   */
  private applyVolumeScaling(rawVolume: number, maxDimension: number): number {
    console.log('🔍 Applying volume scaling - rawVolume:', rawVolume, 'maxDim:', maxDimension);
    
    // Calculate volume scale factor (cube of linear scale factor)
    let volumeScaleFactor = 1;
    
    // More conservative unit detection - assume most models are in appropriate scale
    if (maxDimension < 0.01) {
      // Very small model - likely in meters but representing tiny objects
      console.log('🔍 Volume: Detected very small scale (m³ to cm³)');
      volumeScaleFactor = 1000000; // m³ to cm³
    } else if (maxDimension < 0.5) {
      // Small model - likely in meters representing small objects (5-50cm)
      console.log('🔍 Volume: Detected small scale (m³ to cm³)');
      volumeScaleFactor = 1000000; // m³ to cm³
    } else if (maxDimension < 10) {
      // Medium model - likely in meters/decimeters or centimeters
      // Be more conservative - only apply limited scaling
      console.log('🔍 Volume: Detected medium scale (limited scaling)');
      volumeScaleFactor = 1000; // Conservative scaling
    } else if (maxDimension < 1000) {
      // Large model - likely in cm or mm
      console.log('🔍 Volume: Detected large scale (minimal scaling)');
      volumeScaleFactor = 1; // Minimal scaling
    } else {
      // Very large - likely in mm but representing very large objects
      console.log('🔍 Volume: Detected very large scale (mm³ to cm³)');
      volumeScaleFactor = 0.001; // mm³ to cm³
    }
    
    const scaledVolume = Math.abs(rawVolume * volumeScaleFactor);
    
    // Strict bounds for realistic consumer products
    const maxRealisticVolume = 500; // 500cm³ max for typical 3D printed parts
    const minRealisticVolume = 0.1; // 0.1cm³ min
    
    if (scaledVolume > maxRealisticVolume) {
      console.log('⚠️ Volume exceeds realistic bounds, capping at', maxRealisticVolume, 'cm³');
      return maxRealisticVolume;
    }
    
    if (scaledVolume < minRealisticVolume) {
      console.log('⚠️ Volume below realistic bounds, setting to', minRealisticVolume, 'cm³');
      return minRealisticVolume;
    }
    
    console.log('🔍 Volume scaling factor:', volumeScaleFactor, 'final volume (cm³):', scaledVolume);
    
    return scaledVolume;
  }

  /**
   * Validate calculated volume against AI estimates and apply constraints
   */
  private validateVolumeConstraints(calculatedVolume: number, aiEstimatedVolume?: number): number {
    console.log('🔍 Validating volume constraints - calculated:', calculatedVolume, 'cm³, AI estimate:', aiEstimatedVolume, 'cm³');
    
    let validatedVolume = calculatedVolume;
    
    // If we have an AI estimate, use it as the primary constraint
    if (aiEstimatedVolume && aiEstimatedVolume > 0) {
      const ratio = calculatedVolume / aiEstimatedVolume;
      
      console.log('🔍 Volume ratio (calculated/AI):', ratio);
      
      // If the calculated volume deviates significantly from AI estimate, prefer AI estimate with tolerance
      if (ratio > 3) {
        console.log('⚠️ Calculated volume significantly larger than AI estimate, using constrained value');
        validatedVolume = aiEstimatedVolume * 2; // Allow 2x max deviation
      } else if (ratio < 0.3) {
        console.log('⚠️ Calculated volume significantly smaller than AI estimate, adjusting upward');
        validatedVolume = aiEstimatedVolume * 0.5; // Allow 0.5x min deviation
      } else {
        console.log('✅ Calculated volume is within reasonable range of AI estimate');
        // Volume is reasonable, keep calculated value
      }
    }
    
    // Apply strict realistic bounds for consumer 3D printed products
    const minVolume = 0.1; // 0.1 cm³ minimum (tiny parts)
    const maxVolume = 200; // 200 cm³ maximum (typical consumer 3D printing limit)
    
    // Additional constraint: if we don't have AI estimate, apply conservative bounds
    if (!aiEstimatedVolume) {
      if (validatedVolume > 100) {
        console.log('⚠️ No AI estimate available, applying conservative volume cap');
        validatedVolume = Math.min(validatedVolume, 100); // Conservative cap
      }
    }
    
    validatedVolume = Math.max(minVolume, Math.min(maxVolume, validatedVolume));
    
    if (validatedVolume !== calculatedVolume) {
      console.log('✅ Volume validated and constrained:', calculatedVolume, '→', validatedVolume, 'cm³');
    }
    
    return validatedVolume;
  }

  /**
   * Validate and bound manufacturing cost estimates to realistic ranges
   */
  private validateCostEstimates(cost: number, volume: number, complexity: string, method: string): number {
    console.log('🔍 Validating cost estimates - cost:', cost, 'volume:', volume, 'complexity:', complexity, 'method:', method);
    
    let validatedCost = cost;
    
    // Define realistic cost ranges based on volume and complexity
    const baseRates = {
      '3D Printing': { 
        simple: { min: 2, max: 0.5 }, // $2 base + $0.5/cm³
        moderate: { min: 3, max: 0.8 },
        complex: { min: 5, max: 1.2 }
      },
      'CNC Machining': {
        simple: { min: 10, max: 2.0 },
        moderate: { min: 15, max: 3.0 },
        complex: { min: 25, max: 5.0 }
      },
      'Injection Molding': {
        simple: { min: 50, max: 0.1 }, // High setup, low per-unit
        moderate: { min: 75, max: 0.2 },
        complex: { min: 120, max: 0.3 }
      }
    };
    
    // Determine manufacturing method type
    let methodType = '3D Printing'; // Default
    if (method.includes('CNC') || method.includes('Machining')) {
      methodType = 'CNC Machining';
    } else if (method.includes('Injection') || method.includes('Molding')) {
      methodType = 'Injection Molding';
    }
    
    const rates = baseRates[methodType] || baseRates['3D Printing'];
    const complexityRates = rates[complexity.toLowerCase()] || rates['simple'];
    
    // Calculate expected cost range
    const expectedMin = complexityRates.min + (volume * complexityRates.max * 0.5);
    const expectedMax = complexityRates.min + (volume * complexityRates.max * 2.0);
    
    // Apply bounds with some tolerance
    const minAllowable = Math.max(1, expectedMin * 0.5); // 50% below expected
    const maxAllowable = Math.min(500, expectedMax * 2.0); // 200% above expected, capped at $500
    
    validatedCost = Math.max(minAllowable, Math.min(maxAllowable, cost));
    
    if (validatedCost !== cost) {
      console.log('✅ Cost validated and bounded:', cost, '→', validatedCost, 'USD');
    }
    
    return Math.round(validatedCost * 100) / 100; // Round to cents
  }

  /**
   * Fallback: Calculate volume using bounding box
   */
  private calculateBoundingBoxVolume(mesh: THREE.Mesh): number {
    const bbox = new THREE.Box3().setFromObject(mesh);
    const size = bbox.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    
    console.log('🔍 Bounding box volume calculation (fallback):', { x: size.x, y: size.y, z: size.z, maxDim });
    
    // Calculate raw volume (in model's native units)
    // Use more conservative fill factor for bounding box approximation
    const rawVolume = size.x * size.y * size.z * 0.5; // 50% fill factor (more conservative)
    
    // Apply proper scaling
    const scaledVolume = this.applyVolumeScaling(rawVolume, maxDim);
    console.log('🔍 Bounding box scaled volume (cm³):', scaledVolume);
    
    // Apply additional constraint for bounding box volumes
    const constrainedVolume = Math.min(scaledVolume, 100); // Cap bounding box estimates at 100cm³
    
    if (constrainedVolume !== scaledVolume) {
      console.log('🔍 Bounding box volume constrained:', scaledVolume, '→', constrainedVolume, 'cm³');
    }
    
    return constrainedVolume;
  }

  /**
   * Calculate total volume from all meshes
   */
  private calculateTotalVolume(meshes: THREE.Mesh[]): number {
    return meshes.reduce((total, mesh) => {
      return total + this.calculateMeshVolume(mesh);
    }, 0);
  }

  /**
   * Infer material from hints and model characteristics
   */
  private inferMaterial(materialHint?: string, volume?: number, dimensions?: any): MaterialProperties {
    if (materialHint) {
      const normalizedHint = materialHint.toLowerCase();
      for (const [key, material] of Object.entries(MATERIAL_DATABASE)) {
        if (normalizedHint.includes(key) || normalizedHint.includes(material.name.toLowerCase())) {
          return material;
        }
      }
    }

    // Check if volume is in mm³ instead of cm³ for material selection
    if (volume && volume > 10000) {
      console.warn('⚠️ Volume for material inference seems too large for cm³, might be in mm³. Converting...');
      volume = volume / 1000; // Convert mm³ to cm³
      console.log('🔍 Converted volume for material inference:', volume, 'cm³');
    }

    // Prefer plastic materials for smaller parts (better for 3D printing)
    if (volume && volume < 200) { // Small to medium parts - perfect for 3D printing
      return MATERIAL_DATABASE.pla; // Cost-effective and easy to print
    } else if (volume && volume < 1000) { // Medium parts  
      return MATERIAL_DATABASE.abs; // More durable plastic
    } else { // Large parts
      return MATERIAL_DATABASE.aluminum; // Better strength-to-weight for large parts
    }
  }

  /**
   * Calculate detailed specifications
   */
  private calculateSpecifications(volume: number, dimensions: any, material: MaterialProperties, meshes: THREE.Mesh[]) {
    console.log('🔍 Calculating specifications with volume:', volume, 'cm³, material:', material.name);
    
    // Check if volume is in mm³ instead of cm³ (same logic as formatVolume)
    if (volume > 10000) {
      console.log('🔍 Volume for specifications seems large for cm³, might be in mm³. Converting...');
      volume = volume / 1000; // Convert mm³ to cm³
      console.log('🔍 Converted volume for specifications:', volume, 'cm³');
    }
    
    // Ensure we have a valid volume
    if (!volume || volume <= 0) {
      console.warn('⚠️ Invalid volume for specifications:', volume);
      // Use bounding box as fallback with conservative estimate
      const { length, width, height } = dimensions.overall;
      volume = (length * width * height * 0.3) / 1000; // mm³ to cm³ with 30% fill factor
      volume = Math.max(0.1, Math.min(50, volume)); // Constrain fallback volume
      console.log('🔍 Using constrained fallback volume from dimensions:', volume, 'cm³');
    }

    // Weight calculation (volume in cm³, density in kg/m³)
    // Standard formula: Weight = Volume × Density
    const volumeInM3 = volume / 1000000; // cm³ to m³
    const weightInKg = volumeInM3 * material.density;
    const weightInGrams = weightInKg * 1000;
    
    console.log('🔍 Weight calculation:', {
      volumeCm3: volume,
      volumeM3: volumeInM3,
      density: material.density,
      weightKg: weightInKg,
      weightGrams: weightInGrams
    });

    // Surface area approximation using standard geometric formulas
    const surfaceArea = this.estimateSurfaceArea(dimensions, meshes);

    // Complexity based on engineering standards
    const complexity = this.assessComplexity(meshes, dimensions);

    // Print time estimation using industry standards
    const estimatedPrintTime = this.estimatePrintTime(volume, complexity);

    const specs = {
      weight: Math.max(0.1, Math.round(weightInGrams * 10) / 10), // Minimum 0.1g
      surfaceArea: Math.max(0.1, Math.round(surfaceArea * 100) / 100), // Minimum 0.1cm²
      complexity,
      materialVolume: volume,
      estimatedPrintTime: Math.round(estimatedPrintTime * 10) / 10
    };

    console.log('✅ Final specifications:', specs);
    return specs;
  }

  /**
   * Estimate surface area
   */
  private estimateSurfaceArea(dimensions: any, meshes: THREE.Mesh[]): number {
    // Simple approximation based on bounding box
    const { length, width, height } = dimensions.overall;
    const boxSurfaceArea = 2 * (length * width + width * height + height * length) / 100; // Convert mm² to cm²
    
    // Apply complexity factor based on mesh count
    const complexityFactor = 1 + (meshes.length - 1) * 0.2;
    return boxSurfaceArea * complexityFactor;
  }

  /**
   * Assess model complexity using engineering standards
   */
  private assessComplexity(meshes: THREE.Mesh[], dimensions: any): 'simple' | 'moderate' | 'complex' {
    const meshCount = meshes.length;
    const totalVertices = meshes.reduce((total, mesh) => {
      const positions = mesh.geometry.getAttribute('position');
      return total + (positions ? positions.count : 0);
    }, 0);

    const { length, width, height } = dimensions.overall;
    const maxDim = Math.max(length, width, height);
    const minDim = Math.min(length, width, height);
    const aspectRatio = maxDim / Math.max(minDim, 0.1); // Prevent division by zero

    // Calculate feature density (vertices per cm³ of bounding volume)
    const boundingVolume = (length * width * height) / 1000; // mm³ to cm³
    const featureDensity = totalVertices / Math.max(boundingVolume, 1);

    console.log('🔍 Complexity assessment:', {
      meshCount,
      totalVertices,
      aspectRatio,
      featureDensity,
      boundingVolume
    });

    // More lenient complexity standards for small parts (favor 3D printing)
    // Simple: Basic geometric shapes, even with moderate vertex count for small volumes
    if (boundingVolume < 200 && meshCount <= 3 && aspectRatio < 5) {
      // Small parts are generally simpler to manufacture regardless of vertex count
      return 'simple';
    } else if (meshCount <= 2 && totalVertices < 2000 && aspectRatio < 4 && featureDensity < 200) {
      return 'simple';
    } 
    // Moderate: Some geometric complexity, moderate feature count
    else if (meshCount <= 5 && totalVertices < 15000 && aspectRatio < 10 && featureDensity < 800) {
      return 'moderate';
    } 
    // Complex: High geometric complexity, many features
    else {
      return 'complex';
    }
  }

  /**
   * Estimate 3D print time using industry standards
   */
  private estimatePrintTime(volume: number, complexity: string): number {
    // Check if volume is in mm³ instead of cm³ for print time estimation
    if (volume > 10000) {
      console.warn('⚠️ Volume for print time seems too large for cm³, might be in mm³. Converting...');
      volume = volume / 1000; // Convert mm³ to cm³
      console.log('🔍 Converted volume for print time:', volume, 'cm³');
    }
    
    // Industry standard FDM printing rates (based on 0.2mm layer height, 20mm/s print speed)
    // Time includes: printing, infill, supports, and finishing
    const baseTimePerCm3 = {
      'simple': 0.8,    // Simple geometry: ~48 min per cm³
      'moderate': 1.5,  // Moderate complexity: ~90 min per cm³  
      'complex': 2.5    // Complex geometry: ~150 min per cm³
    }[complexity] || 1.5;

    // Add base setup time (heating, bed leveling, etc.)
    const setupTime = 0.25; // 15 minutes base setup
    
    const totalTime = (volume * baseTimePerCm3) + setupTime;
    
    console.log('🔍 Print time calculation:', {
      volume,
      complexity,
      baseTimePerCm3,
      setupTime,
      totalTime
    });

    return Math.max(0.25, totalTime); // Minimum 15 minutes
  }

  /**
   * Calculate manufacturing costs and recommendations
   */
  private calculateManufacturing(volume: number, specifications: any, material: MaterialProperties, dimensions: any, allMaterials?: MaterialProperties[]) {
    console.log('🔍 Manufacturing cost calculation - input volume:', volume, 'cm³');
    
    // More aggressive volume sanity checking and correction
    let correctedVolume = volume;
    
    // First, check if volume is obviously in wrong units
    if (volume > 100000) {
      // Volume is way too large, likely in mm³ for a small part
      console.log('🔍 Volume appears to be in mm³, converting to cm³');
      correctedVolume = volume / 1000; // mm³ to cm³
    } else if (volume > 10000) {
      // Still very large, apply more aggressive correction
      console.log('🔍 Volume seems large for cm³, applying correction');
      correctedVolume = volume / 1000; // Convert to cm³
    }
    
    // Apply realistic bounds for small consumer parts
    if (correctedVolume > 1000) {
      // Even 1L is huge for most 3D printed parts
      console.log('🔍 Volume still large after conversion, capping for realistic cost');
      correctedVolume = Math.min(correctedVolume, 500); // Cap at 500cm³ (0.5L)
    }
    
    // Additional safety: only use dimensional fallback if volume calculation completely failed
    if (correctedVolume > 1000) { // Only for extremely large volumes that are clearly wrong
      const { length, width, height } = dimensions.overall;
      const dimensionalVolume = (length * width * height) / 1000; // mm³ to cm³
      
      // Only use dimensional fallback if it's significantly smaller and reasonable
      if (dimensionalVolume < correctedVolume * 0.1 && dimensionalVolume > 0.1 && dimensionalVolume < 200) {
        console.warn('⚠️ Volume calculation seems severely wrong, using dimensional fallback');
        correctedVolume = dimensionalVolume * 0.7; // Apply 70% fill factor
      }
    }
    
    // Final sanity bounds - typical consumer parts are 1-200 cm³
    correctedVolume = Math.max(1, Math.min(200, correctedVolume));
    
    console.log('🔍 Final corrected volume for cost calculation:', correctedVolume, 'cm³');
    
    // For 3D printing, use realistic material consumption rates
    let materialCost = 0;
    let laborCost = 0;
    
    const recommendedMethod = this.selectManufacturingMethod(correctedVolume, specifications.complexity, material);
    
    if (recommendedMethod.includes('3D Printing') || recommendedMethod.includes('FDM')) {
      // 3D Printing cost calculation - based on material usage and time
      const materialVolumeInCm3 = correctedVolume;
      const fillPercentage = 0.15; // 15% infill typical for prototypes
      const actualMaterialUsed = materialVolumeInCm3 * fillPercentage;
      
      // Use the actual material properties instead of hardcoded PLA
      const materialDensityGcm3 = material.density / 1000; // Convert kg/m³ to g/cm³
      const materialWeightGrams = actualMaterialUsed * materialDensityGcm3;
      const costPerGram = material.costPerKg / 1000; // Convert $/kg to $/g
      materialCost = materialWeightGrams * costPerGram;
      
      // 3D printing labor/machine time cost
      const printTimeHours = specifications.estimatedPrintTime || Math.max(0.5, correctedVolume * 0.05); // Realistic time estimate
      const machineRatePerHour = correctedVolume < 50 ? 2 : (correctedVolume < 150 ? 3 : 5); // Scale with part size
      laborCost = printTimeHours * machineRatePerHour;
      
      console.log('🔍 3D Printing cost breakdown:', {
        volumeCm3: correctedVolume,
        actualMaterialCm3: actualMaterialUsed,
        materialWeightGrams: materialWeightGrams,
        materialCost: materialCost,
        printTimeHours: printTimeHours,
        machineRatePerHour: machineRatePerHour,
        laborCost: laborCost
      });
      
    } else {
      // Traditional manufacturing (CNC, Injection Molding, etc.)
      const volumeInM3 = correctedVolume / 1000000;
      const materialWeight = volumeInM3 * material.density;
      materialCost = materialWeight * material.costPerKg;
      laborCost = this.estimateLaborCost(specifications.complexity, recommendedMethod);
    }
    
    // Add setup and overhead costs
    const setupCost = recommendedMethod.includes('3D Printing') ? 2 : 10; // Realistic setup costs
    const rawTotalCost = materialCost + laborCost + setupCost;

    // Validate cost estimates against realistic bounds
    const validatedCost = this.validateCostEstimates(rawTotalCost, correctedVolume, specifications.complexity, recommendedMethod);
    
    // Apply realistic bounds for consumer parts based on volume
    let minCost = validatedCost;
    if (correctedVolume < 5) {
      // Very small parts should be very cheap to manufacture
      minCost = Math.max(2, Math.min(validatedCost, 15)); // $2-15 range for tiny parts
    } else if (correctedVolume < 20) {
      // Small parts 
      minCost = Math.max(3, Math.min(validatedCost, 30)); // $3-30 range for small parts
    } else {
      // Larger parts
      minCost = Math.max(5, Math.min(validatedCost, 50)); // $5-50 range for larger parts
    }
    
    console.log('🔍 Final manufacturing cost:', {
      materialCost: materialCost,
      laborCost: laborCost,
      setupCost: setupCost,
      rawTotalCost: rawTotalCost,
      validatedCost: validatedCost,
      boundedCost: minCost
    });

    // Lead time estimation
    const estimatedLeadTime = this.estimateLeadTime(specifications.complexity, recommendedMethod);
    
    // Use consistent material for manufacturing display - ensure all components show same material
    const materialsUsed = material.name; // Always use the primary material for consistency across all sections

    // Generate reasoning for the selected method
    const methodReasoning = this.generateMethodReasoning(
      recommendedMethod, 
      correctedVolume, 
      specifications.complexity, 
      material,
      materialsUsed,
      Math.round(minCost * 100) / 100
    );

    return {
      recommendedMethod,
      materialsUsed, // Include all materials from components
      materialCost: Math.round(materialCost * 100) / 100,
      laborCost: Math.round(laborCost * 100) / 100,
      totalCost: Math.round(minCost * 100) / 100,
      complexity: specifications.complexity,
      estimatedLeadTime,
      reasoning: methodReasoning // Add reasoning explanation
    };
  }

  /**
   * Estimate labor costs
   */
  private estimateLaborCost(complexity: string, method: string): number {
    // More realistic labor costs for different manufacturing methods
    const baseCost = method.includes('3D Printing') ? 3 :  // $3 for 3D printing setup/finishing
                    method.includes('CNC') ? 25 : 
                    method.includes('Injection') ? 50 : 20;

    const complexityMultiplier = complexity === 'simple' ? 1 : 
                                complexity === 'moderate' ? 1.3 : 1.8; // Reduced multipliers

    return baseCost * complexityMultiplier;
  }

  /**
   * Select optimal manufacturing method based on material type and properties
   */
  private selectManufacturingMethod(volume: number, complexity: string, material: MaterialProperties): string {
    // Check if volume is in mm³ instead of cm³ for manufacturing method selection
    if (volume > 10000) {
      console.warn('⚠️ Volume for manufacturing method seems too large for cm³, might be in mm³. Converting...');
      volume = volume / 1000; // Convert mm³ to cm³
      console.log('🔍 Converted volume for manufacturing method:', volume, 'cm³');
    }
    
    console.log('🔍 Manufacturing method selection:', { volume, complexity, materialType: material.type, materialName: material.name });
    
    // Material-type-first approach for consistency
    if (material.type === 'metal') {
      // Metal parts ALWAYS require machining or metal-specific processes
      if (material.name.includes('Steel') || material.name.includes('Aluminum') || material.name.includes('Titanium')) {
        return 'CNC Machining'; // Primary method for metals
      }
      return material.manufacturingMethods[0]; // Fallback to first metal method
    } else if (material.type === 'plastic') {
      // Plastic parts can use various methods based on volume and complexity
      if (volume < 100 || (volume < 300 && complexity !== 'complex')) {
        return '3D Printing (FDM)'; // Best for small-medium plastic parts
      } else if (volume >= 300 && volume < 2000) {
        return 'Injection Molding'; // Better for larger plastic parts
      } else {
        return '3D Printing (FDM)'; // Fallback for very large parts
      }
    } else {
      // Other materials (ceramic, composite, etc.)
      return material.manufacturingMethods[0]; // Use first available method
    }
  }

  /**
   * Estimate manufacturing lead time
   */
  private estimateLeadTime(complexity: string, method: string): number {
    const baseTime = method.includes('3D Printing') ? 2 : 
                    method.includes('CNC') ? 5 : 
                    method.includes('Injection') ? 14 : 7;

    const complexityMultiplier = complexity === 'simple' ? 1 : 
                                complexity === 'moderate' ? 1.5 : 2;

    return Math.ceil(baseTime * complexityMultiplier);
  }

  /**
   * Generate reasoning for the selected manufacturing method
   */
  private generateMethodReasoning(
    method: string, 
    volume: number, 
    complexity: string, 
    material: MaterialProperties,
    materialsUsed: string,
    totalCost: number
  ): string {
    const methodLower = method.toLowerCase();
    
    if (methodLower.includes('3d printing') || methodLower.includes('fdm')) {
      if (volume < 100) {
        return `Small ${complexity} parts (${volume.toFixed(1)} cm³) are ideal for cost-effective 3D printing. Using ${materialsUsed} provides excellent detail resolution at low cost (~$${totalCost})`;
      } else if (volume < 300) {
        return `Medium-sized ${complexity} ${material.type} parts (${volume.toFixed(1)} cm³) are perfect for FDM printing. ${materialsUsed} offers good strength-to-weight ratio with reasonable cost (~$${totalCost})`;
      } else {
        return `Larger ${complexity} parts (${volume.toFixed(1)} cm³) benefit from 3D printing's design freedom. ${materialsUsed} provides efficient material usage at moderate cost (~$${totalCost})`;
      }
    } else if (methodLower.includes('injection')) {
      return `Large ${complexity} plastic parts (${volume.toFixed(1)} cm³) require injection molding for production efficiency. ${materialsUsed} ensures consistent quality with higher initial cost (~$${totalCost}) but lower per-unit cost at scale`;
    } else if (methodLower.includes('cnc')) {
      if (material.type === 'metal') {
        return `${complexity.charAt(0).toUpperCase() + complexity.slice(1)} metal components (${volume.toFixed(1)} cm³) require CNC machining for precision tolerances. ${materialsUsed} provides superior mechanical properties, justifying higher cost (~$${totalCost})`;
      } else {
        return `${complexity.charAt(0).toUpperCase() + complexity.slice(1)} geometry (${volume.toFixed(1)} cm³) demands precision machining for tight tolerances. ${materialsUsed} achieves superior surface finish at premium cost (~$${totalCost})`;
      }
    } else {
      return `Manufacturing method optimized for ${complexity} ${material.type} parts (${volume.toFixed(1)} cm³) using ${materialsUsed} at estimated cost of $${totalCost}`;
    }
  }

  /**
   * Generate AI-powered product description using Pica API
   */
  private async generateProductDescription(properties: Omit<CalculatedProperties, 'productDescription'>, scene: THREE.Object3D): Promise<{
    title: string;
    description: string;
    potentialUses: string[];
    keyFeatures: string[];
    category: string;
  }> {
    try {
      // Analyze the 3D model for geometric features
      const geometricAnalysis = this.analyzeGeometricFeatures(scene);
      
      // Create detailed prompt for AI analysis
      const analysisPrompt = `Analyze this CAD model and generate a comprehensive product description:

SPECIFICATIONS:
- Dimensions: ${properties.dimensions.displayValue}
- Volume: ${properties.volume.displayValue}
- Weight: ${properties.specifications.weightDisplay}
- Material: ${this.inferMaterialName(properties.manufacturing.recommendedMethod)}
- Complexity: ${properties.specifications.complexity}
- Manufacturing: ${properties.manufacturing.recommendedMethod}
- Estimated Cost: ${properties.manufacturing.costDisplay}

GEOMETRIC ANALYSIS:
- Component Count: ${geometricAnalysis.componentCount}
- Feature Types: ${geometricAnalysis.features.join(', ')}
- Aspect Ratio: ${geometricAnalysis.aspectRatio.toFixed(2)}
- Surface Complexity: ${geometricAnalysis.surfaceComplexity}

Please generate:
1. A concise product title (2-4 words)
2. A detailed description (2-3 sentences explaining what it is and its design)
3. 3-5 potential use cases
4. 3-4 key design features
5. A product category classification

Focus on practical applications based on the size, material properties, and geometric features. Be specific and technical but accessible.

Respond in JSON format:
{
  "title": "Product Name",
  "description": "Detailed description...",
  "potentialUses": ["Use 1", "Use 2", "Use 3"],
  "keyFeatures": ["Feature 1", "Feature 2", "Feature 3"],
  "category": "Category Name"
}`;

      // Call Pica API for AI analysis
      const aiResponse = await this.callPicaAI(analysisPrompt);
      
      if (aiResponse && aiResponse.title) {
        return aiResponse;
      } else {
        throw new Error('Invalid AI response format');
      }
      
    } catch (error) {
      console.warn('🤖 AI product description failed, using fallback:', error);
      return this.generateFallbackDescription(properties);
    }
  }

  /**
   * Analyze geometric features of the 3D model
   */
  private analyzeGeometricFeatures(scene: THREE.Object3D): {
    componentCount: number;
    features: string[];
    aspectRatio: number;
    surfaceComplexity: string;
  } {
    const meshes = this.extractMeshes(scene);
    const bbox = new THREE.Box3().setFromObject(scene);
    const size = bbox.getSize(new THREE.Vector3());
    
    const aspectRatio = Math.max(size.x, size.y, size.z) / Math.min(size.x, size.y, size.z);
    
    // Analyze geometric features
    const features: string[] = [];
    
    if (aspectRatio > 5) features.push('elongated geometry');
    if (aspectRatio < 1.5) features.push('compact geometry');
    if (meshes.length > 1) features.push('multi-component assembly');
    if (meshes.length === 1) features.push('monolithic design');
    
    // Analyze vertex density for surface complexity
    const totalVertices = meshes.reduce((total, mesh) => {
      const positions = mesh.geometry.getAttribute('position');
      return total + (positions ? positions.count : 0);
    }, 0);
    
    const volume = size.x * size.y * size.z;
    const vertexDensity = totalVertices / volume;
    
    let surfaceComplexity = 'simple';
    if (vertexDensity > 1000) {
      surfaceComplexity = 'complex';
      features.push('detailed surface features');
    } else if (vertexDensity > 100) {
      surfaceComplexity = 'moderate';
      features.push('moderate surface detail');
    } else {
      features.push('smooth surfaces');
    }
    
    return {
      componentCount: meshes.length,
      features,
      aspectRatio,
      surfaceComplexity
    };
  }

  /**
   * Call Pica AI service for product description generation
   */
  private async callPicaAI(prompt: string): Promise<any> {
    const PICA_SECRET_KEY = import.meta.env.VITE_PICA_SECRET_KEY;
    const PICA_OPENAI_CONNECTION = import.meta.env.VITE_PICA_OPENAI_CONNECTION_KEY;
    
    if (!PICA_SECRET_KEY || !PICA_OPENAI_CONNECTION) {
      throw new Error('Pica AI credentials not configured');
    }

    const response = await fetch('https://api.picaos.com/v1/passthrough/chat/completions', {
      method: 'POST',
      headers: {
        'x-pica-secret': PICA_SECRET_KEY,
        'x-pica-connection-key': PICA_OPENAI_CONNECTION,
        'x-pica-action-id': 'conn_mod_def::GDzgi1QfvM4::4OjsWvZhRxmAVuLAuWgfVA',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are a product design analyst specializing in CAD model evaluation. Generate accurate, technical product descriptions based on engineering specifications and geometric analysis.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 800,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Pica AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content in AI response');
    }

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    return JSON.parse(jsonMatch[0]);
  }

  /**
   * Generate fallback description when AI fails
   */
  private generateFallbackDescription(properties: Omit<CalculatedProperties, 'productDescription'>): {
    title: string;
    description: string;
    potentialUses: string[];
    keyFeatures: string[];
    category: string;
  } {
    const material = this.inferMaterialName(properties.manufacturing.recommendedMethod);
    const { length, width, height } = properties.dimensions.overall;
    const maxDim = Math.max(length, width, height);
    
    // Basic categorization based on size and material
    let category = 'Component';
    let title = 'Custom Component';
    let potentialUses = ['Prototyping', 'Testing', 'Assembly'];
    
    if (maxDim < 50) {
      category = 'Small Part';
      title = 'Precision Part';
      potentialUses = ['Electronics housing', 'Mechanical component', 'Fastener'];
    } else if (maxDim < 200) {
      category = 'Medium Component';
      title = 'Functional Component';
      potentialUses = ['Mechanical assembly', 'Housing', 'Bracket'];
    } else {
      category = 'Large Assembly';
      title = 'Structural Component';
      potentialUses = ['Structural support', 'Housing', 'Framework'];
    }

    const description = `A ${properties.specifications.complexity} ${material.toLowerCase()} component with ${properties.dimensions.displayValue} dimensions. Manufactured using ${properties.manufacturing.recommendedMethod.toLowerCase()} for optimal quality and cost-effectiveness.`;

    const keyFeatures = [
      `${material} construction`,
      `${properties.specifications.complexity} geometry`,
      `${properties.volume.displayValue} volume`,
      `${properties.specifications.weightDisplay} weight`
    ];

    return {
      title,
      description,
      potentialUses,
      keyFeatures,
      category
    };
  }

  /**
   * Infer material name from manufacturing method
   */
  private inferMaterialName(method: string): string {
    const methodLower = method.toLowerCase();
    if (methodLower.includes('3d printing') || methodLower.includes('fdm')) return 'PLA Plastic';
    if (methodLower.includes('cnc') && methodLower.includes('aluminum')) return 'Aluminum';
    if (methodLower.includes('cnc') && methodLower.includes('steel')) return 'Steel';
    if (methodLower.includes('injection')) return 'ABS Plastic';
    return 'Engineered Plastic';
  }
}

// Singleton instance
export const cadPropertyCalculator = new CADPropertyCalculator();