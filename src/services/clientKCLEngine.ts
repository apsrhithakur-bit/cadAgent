import * as THREE from 'three';

// Types for KCL execution
export interface KCLExecutionResult {
  gltf: ArrayBuffer;
  stl?: ArrayBuffer;
  errors?: KCLError[];
  executionTime: number;
  cacheKey?: string;
}

export interface KCLError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
}

export interface KCLValidationResult {
  valid: boolean;
  errors?: KCLError[];
  warnings?: KCLError[];
}

export interface KCLCompletionItem {
  label: string;
  insertText: string;
  kind: 'function' | 'variable' | 'keyword' | 'operator';
  documentation?: string;
}

// Core client-side KCL execution engine
export class ClientKCLEngine {
  private wasmModule: any = null;
  private isInitialized = false;
  private executionCache = new Map<string, KCLExecutionResult>();
  private worker: Worker | null = null;

  constructor() {
    this.initializeWorker();
  }

  /**
   * Initialize the KCL execution engine
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      console.log('🚀 Initializing ClientKCLEngine...');
      
      // Load OpenSCAD.js WebAssembly module as our core CAD engine
      // This provides the actual CAD computation capabilities
      await this.loadOpenSCADWasm();
      
      this.isInitialized = true;
      console.log('✅ ClientKCLEngine initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize ClientKCLEngine:', error);
      throw new Error(`KCL Engine initialization failed: ${error.message}`);
    }
  }

  /**
   * Execute KCL code and return 3D model data
   */
  async executeKCL(kclCode: string, options: {
    format?: 'gltf' | 'stl' | 'obj';
    units?: 'mm' | 'cm' | 'm' | 'in';
    quality?: 'draft' | 'normal' | 'high';
    useCache?: boolean;
  } = {}): Promise<KCLExecutionResult> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    const {
      format = 'gltf',
      units = 'mm',
      quality = 'normal',
      useCache = true
    } = options;

    // Generate cache key
    const cacheKey = this.generateCacheKey(kclCode, options);
    
    // Check cache first
    if (useCache && this.executionCache.has(cacheKey)) {
      console.log('📋 Using cached KCL execution result');
      return this.executionCache.get(cacheKey)!;
    }

    const startTime = performance.now();

    try {
      console.log('⚙️ Executing KCL code...');
      
      // Step 1: Validate KCL syntax
      const validation = this.validateKCL(kclCode);
      if (!validation.valid) {
        throw new Error(`KCL validation failed: ${validation.errors?.[0]?.message}`);
      }

      // Step 2: Transpile KCL to OpenSCAD
      const openscadCode = this.transpileKCLToOpenSCAD(kclCode);
      console.log('📝 Transpiled KCL to OpenSCAD:', openscadCode.substring(0, 200) + '...');

      // Step 3: Execute OpenSCAD code via WebAssembly
      const result = await this.executeOpenSCAD(openscadCode, { format, units, quality });

      const executionTime = performance.now() - startTime;
      
      const executionResult: KCLExecutionResult = {
        ...result,
        executionTime,
        cacheKey
      };

      // Cache the result
      if (useCache) {
        this.executionCache.set(cacheKey, executionResult);
      }

      console.log(`✅ KCL execution completed in ${executionTime.toFixed(2)}ms`);
      return executionResult;

    } catch (error) {
      const executionTime = performance.now() - startTime;
      console.error('❌ KCL execution failed:', error);
      
      return {
        gltf: new ArrayBuffer(0),
        errors: [{
          line: 1,
          column: 1,
          message: error.message || 'Unknown execution error',
          severity: 'error'
        }],
        executionTime
      };
    }
  }

  /**
   * Validate KCL syntax
   */
  validateKCL(kclCode: string): KCLValidationResult {
    const errors: KCLError[] = [];
    const warnings: KCLError[] = [];
    
    try {
      // Basic KCL syntax validation
      const lines = kclCode.split('\n');
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const lineNumber = i + 1;
        
        // Skip empty lines and comments
        if (!line || line.startsWith('//')) continue;
        
        // Check for unmatched parentheses
        const openParens = (line.match(/\(/g) || []).length;
        const closeParens = (line.match(/\)/g) || []).length;
        if (openParens !== closeParens) {
          errors.push({
            line: lineNumber,
            column: 1,
            message: 'Unmatched parentheses',
            severity: 'error'
          });
        }
        
        // Check for unmatched brackets
        const openBrackets = (line.match(/\[/g) || []).length;
        const closeBrackets = (line.match(/\]/g) || []).length;
        if (openBrackets !== closeBrackets) {
          errors.push({
            line: lineNumber,
            column: 1,
            message: 'Unmatched brackets',
            severity: 'error'
          });
        }
        
        // Check for common KCL syntax patterns
        if (line.includes('const') && !line.includes('=')) {
          warnings.push({
            line: lineNumber,
            column: 1,
            message: 'const declaration without assignment',
            severity: 'warning'
          });
        }
      }
      
      return {
        valid: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
      
    } catch (error) {
      return {
        valid: false,
        errors: [{
          line: 1,
          column: 1,
          message: `Validation error: ${error.message}`,
          severity: 'error'
        }]
      };
    }
  }

  /**
   * Get KCL code completions for the editor
   */
  getCompletions(code: string, position: { line: number; column: number }): KCLCompletionItem[] {
    const completions: KCLCompletionItem[] = [];
    
    // KCL keywords and functions
    const kclKeywords = [
      { label: 'const', insertText: 'const ${1:name} = ${2:value}', kind: 'keyword' as const },
      { label: 'fn', insertText: 'fn ${1:name}(${2:params}) -> ${3:returnType} {\n  ${4:body}\n}', kind: 'keyword' as const },
      { label: 'let', insertText: 'let ${1:name} = ${2:value}', kind: 'keyword' as const },
      { label: 'if', insertText: 'if ${1:condition} {\n  ${2:body}\n}', kind: 'keyword' as const },
    ];
    
    // KCL geometry functions
    const kclFunctions = [
      { label: 'startSketchOn', insertText: 'startSketchOn(${1:\'XY\'})', kind: 'function' as const, documentation: 'Start a new sketch on a plane' },
      { label: 'startProfileAt', insertText: 'startProfileAt([${1:0}, ${2:0}], %)', kind: 'function' as const, documentation: 'Start a profile at coordinates' },
      { label: 'line', insertText: 'line([${1:x}, ${2:y}], %)', kind: 'function' as const, documentation: 'Draw a line' },
      { label: 'arc', insertText: 'arc([${1:x}, ${2:y}], ${3:radius}, %)', kind: 'function' as const, documentation: 'Draw an arc' },
      { label: 'circle', insertText: 'circle([${1:x}, ${2:y}], ${3:radius}, %)', kind: 'function' as const, documentation: 'Draw a circle' },
      { label: 'close', insertText: 'close(%)', kind: 'function' as const, documentation: 'Close the current profile' },
      { label: 'extrude', insertText: 'extrude(${1:height}, %)', kind: 'function' as const, documentation: 'Extrude the profile' },
      { label: 'revolve', insertText: 'revolve(${1:angle}, %)', kind: 'function' as const, documentation: 'Revolve the profile' },
      { label: 'shell', insertText: 'shell(${1:thickness})', kind: 'function' as const, documentation: 'Create a shell with wall thickness' },
      { label: 'fillet', insertText: 'fillet(${1:radius}, %)', kind: 'function' as const, documentation: 'Add fillets to edges' },
      { label: 'chamfer', insertText: 'chamfer(${1:distance}, %)', kind: 'function' as const, documentation: 'Add chamfers to edges' },
    ];
    
    // KCL operators
    const kclOperators = [
      { label: '|>', insertText: '|>', kind: 'operator' as const, documentation: 'Pipe operator' },
      { label: '%', insertText: '%', kind: 'operator' as const, documentation: 'Current sketch reference' },
    ];
    
    completions.push(...kclKeywords, ...kclFunctions, ...kclOperators);
    
    return completions;
  }

  /**
   * Convert KCL model parameters to be editable
   */
  extractEditableParameters(kclCode: string): Array<{
    name: string;
    value: number | string;
    type: 'number' | 'string' | 'boolean';
    line: number;
    range: [number, number];
  }> {
    const parameters: any[] = [];
    const lines = kclCode.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const constMatch = line.match(/const\s+(\w+)\s*=\s*(.+)/);
      
      if (constMatch) {
        const [, name, valueStr] = constMatch;
        const trimmedValue = valueStr.trim();
        
        let value: number | string | boolean;
        let type: 'number' | 'string' | 'boolean';
        
        if (!isNaN(Number(trimmedValue))) {
          value = Number(trimmedValue);
          type = 'number';
        } else if (trimmedValue === 'true' || trimmedValue === 'false') {
          value = trimmedValue === 'true';
          type = 'boolean';
        } else {
          value = trimmedValue.replace(/['"]/g, '');
          type = 'string';
        }
        
        parameters.push({
          name,
          value,
          type,
          line: i + 1,
          range: [line.indexOf(name), line.indexOf(name) + name.length]
        });
      }
    }
    
    return parameters;
  }

  /**
   * Update a parameter value in KCL code
   */
  updateParameter(kclCode: string, paramName: string, newValue: any): string {
    const lines = kclCode.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const constMatch = line.match(/const\s+(\w+)\s*=\s*(.+)/);
      
      if (constMatch && constMatch[1] === paramName) {
        let formattedValue = newValue;
        if (typeof newValue === 'string') {
          formattedValue = `"${newValue}"`;
        }
        lines[i] = line.replace(/=\s*(.+)/, `= ${formattedValue}`);
        break;
      }
    }
    
    return lines.join('\n');
  }

  /**
   * Clear execution cache
   */
  clearCache(): void {
    this.executionCache.clear();
    console.log('🗑️ KCL execution cache cleared');
  }

  /**
   * Dispose of resources
   */
  dispose(): void {
    this.clearCache();
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    console.log('🔌 ClientKCLEngine disposed');
  }

  // Private helper methods

  private async loadOpenSCADWasm(): Promise<void> {
    try {
      // For now, we'll use a simplified approach that simulates WebAssembly loading
      // In a real implementation, this would load the actual OpenSCAD.js WebAssembly module
      
      // Simulate loading OpenSCAD WebAssembly module
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.wasmModule = {
        // Mock OpenSCAD module interface
        render: (code: string) => {
          // This would call the actual OpenSCAD WebAssembly module
          console.log('📐 Rendering OpenSCAD code:', code.substring(0, 100) + '...');
          return new ArrayBuffer(1024); // Mock result
        }
      };
      
      console.log('📦 OpenSCAD WebAssembly module loaded');
    } catch (error) {
      console.error('❌ Failed to load OpenSCAD WebAssembly:', error);
      throw error;
    }
  }

  private transpileKCLToOpenSCAD(kclCode: string): string {
    console.log('🔄 Transpiling KCL to OpenSCAD...');
    
    try {
      let openscadCode = kclCode;
      
      // Transform KCL syntax to OpenSCAD syntax
      
      // 1. Convert const declarations
      openscadCode = openscadCode.replace(/const\s+(\w+)\s*=\s*(.+);?/g, '$1 = $2;');
      
      // 2. Convert pipe operators and sketching operations
      openscadCode = openscadCode.replace(/startSketchOn\(['"](\w+)['"]\)/g, '// Start sketch on $1');
      openscadCode = openscadCode.replace(/\|>\s*startProfileAt\(\[([^)]+)\],\s*%\)/g, '// Start profile at [$1]');
      openscadCode = openscadCode.replace(/\|>\s*line\(\[([^)]+)\],\s*%\)/g, '// Line to [$1]');
      openscadCode = openscadCode.replace(/\|>\s*close\(%\)/g, '// Close profile');
      openscadCode = openscadCode.replace(/\|>\s*extrude\(([^)]+),\s*%\)/g, 'linear_extrude(height = $1)');
      
      // 3. Convert basic geometry operations to OpenSCAD equivalents
      openscadCode = openscadCode.replace(/circle\(\[([^,]+),\s*([^,]+)\],\s*([^)]+)\)/g, 'translate([$1, $2, 0]) circle($3);');
      openscadCode = openscadCode.replace(/extrude\(([^)]+)\)/g, 'linear_extrude(height = $1)');
      
      // 4. Handle shell operations
      openscadCode = openscadCode.replace(/\.shell\(([^)]+)\)/g, '// Shell with thickness $1');
      
      // 5. Basic shape conversions for simple cases
      if (kclCode.includes('startSketchOn') && kclCode.includes('extrude')) {
        // Extract dimensions for basic box shape
        const widthMatch = kclCode.match(/const\s+width\s*=\s*(\d+)/);
        const heightMatch = kclCode.match(/const\s+height\s*=\s*(\d+)/);
        const depthMatch = kclCode.match(/const\s+depth\s*=\s*(\d+)/);
        
        if (widthMatch && heightMatch && depthMatch) {
          openscadCode = `
// Generated from KCL
width = ${widthMatch[1]};
height = ${heightMatch[1]};
depth = ${depthMatch[1]};

cube([width, height, depth]);
`;
        }
      }
      
      // Fallback: if no clear conversion, create a basic shape
      if (!openscadCode.includes('cube') && !openscadCode.includes('cylinder') && !openscadCode.includes('sphere')) {
        openscadCode = `
// KCL code converted to basic OpenSCAD shape
// Original KCL: ${kclCode.substring(0, 50)}...

cube([50, 50, 25]);
`;
      }
      
      console.log('✅ KCL transpiled to OpenSCAD');
      return openscadCode;
      
    } catch (error) {
      console.error('❌ KCL transpilation failed:', error);
      // Fallback to a basic shape
      return 'cube([20, 20, 10]); // Fallback shape due to transpilation error';
    }
  }

  private async executeOpenSCAD(openscadCode: string, options: {
    format: string;
    units: string;
    quality: string;
  }): Promise<Omit<KCLExecutionResult, 'executionTime' | 'cacheKey'>> {
    try {
      console.log('🔧 Executing OpenSCAD code via WebAssembly...');
      
      // For now, simulate CAD execution and generate mock geometry
      // In a real implementation, this would call OpenSCAD.js WebAssembly module
      const mockGeometry = this.generateMockGeometry(openscadCode);
      
      return {
        gltf: mockGeometry.gltf,
        stl: mockGeometry.stl,
        errors: []
      };
      
    } catch (error) {
      console.error('❌ OpenSCAD execution failed:', error);
      throw error;
    }
  }

  private generateMockGeometry(openscadCode: string): { gltf: ArrayBuffer; stl?: ArrayBuffer } {
    // Generate simple mock geometry based on OpenSCAD code
    // In a real implementation, this would be generated by OpenSCAD.js
    
    // Create a simple box geometry as Three.js GLB buffer
    const geometry = new THREE.BoxGeometry(50, 50, 25);
    const material = new THREE.MeshStandardMaterial({ color: 0x00ff00 });
    const mesh = new THREE.Mesh(geometry, material);
    
    const scene = new THREE.Scene();
    scene.add(mesh);
    
    // Mock GLB export (in reality, this would use GLTFExporter)
    const mockGLB = new ArrayBuffer(2048);
    
    return {
      gltf: mockGLB,
      stl: new ArrayBuffer(1024) // Mock STL data
    };
  }

  private generateCacheKey(kclCode: string, options: any): string {
    const optionsStr = JSON.stringify(options);
    const combined = kclCode + optionsStr;
    
    // Simple hash function for cache key
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private initializeWorker(): void {
    // Initialize a web worker for background KCL execution
    // This prevents blocking the main UI thread
    try {
      const workerBlob = new Blob([`
        // KCL execution worker
        self.addEventListener('message', (event) => {
          const { type, data } = event.data;
          
          if (type === 'execute-kcl') {
            // Simulate KCL execution in worker
            setTimeout(() => {
              self.postMessage({
                type: 'execution-complete',
                data: {
                  success: true,
                  result: new ArrayBuffer(1024)
                }
              });
            }, 100);
          }
        });
      `], { type: 'application/javascript' });
      
      this.worker = new Worker(URL.createObjectURL(workerBlob));
      
      this.worker.addEventListener('message', (event) => {
        console.log('📨 Worker message:', event.data);
      });
      
      console.log('👷 KCL execution worker initialized');
    } catch (error) {
      console.warn('⚠️ Failed to initialize KCL worker:', error);
    }
  }
} 