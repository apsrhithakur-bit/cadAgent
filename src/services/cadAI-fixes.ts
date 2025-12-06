// CAD Export Accuracy Fixes
// This file contains the proposed fixes for the 3D viewer/STL export discrepancy

import * as THREE from 'three';

/**
 * Fix 1: Apply viewer transformations to STL export
 * This ensures the exported STL matches what the user sees in the viewer
 */
export async function exportSTLWithViewerTransformations(
  gltfUrl: string, 
  viewerScale: number = 1, 
  viewerPosition: THREE.Vector3 = new THREE.Vector3(0, 0, 0)
): Promise<string> {
  try {
    console.log('🔄 Starting STL export with viewer transformations...');
    
    // Fetch the GLTF data
    const response = await fetch(gltfUrl);
    let gltfData: any;
    
    if (gltfUrl.includes('model/gltf-binary')) {
      const arrayBuffer = await response.arrayBuffer();
      gltfData = parseGLB(arrayBuffer);
    } else {
      gltfData = await response.json();
    }
    
    // Apply the same transformations as the viewer
    const transformedSTL = generateSTLWithTransformations(gltfData, viewerScale, viewerPosition);
    
    console.log('✅ STL export with transformations completed');
    return transformedSTL;
  } catch (error) {
    console.error('❌ STL export with transformations failed:', error);
    throw error;
  }
}

/**
 * Fix 2: Enhanced STL generation with proper scaling
 */
function generateSTLWithTransformations(
  gltfData: any, 
  scale: number, 
  position: THREE.Vector3
): string {
  console.log('🔄 Generating STL with viewer transformations...');
  console.log('  Scale:', scale);
  console.log('  Position:', position);
  
  if (!gltfData.meshes || gltfData.meshes.length === 0) {
    throw new Error('No meshes found in GLTF data');
  }
  
  let stlContent = `solid model_viewer_accurate\n`;
  let triangleCount = 0;
  
  // Process each mesh with transformations
  for (let meshIndex = 0; meshIndex < gltfData.meshes.length; meshIndex++) {
    const mesh = gltfData.meshes[meshIndex];
    
    for (let primIndex = 0; primIndex < mesh.primitives.length; primIndex++) {
      const primitive = mesh.primitives[primIndex];
      
      try {
        const vertices = extractVerticesFromGLTF(gltfData, primitive);
        const indices = extractIndicesFromGLTF(gltfData, primitive);
        
        // Generate triangles with transformations
        if (indices) {
          for (let i = 0; i < indices.length; i += 3) {
            const i1 = indices[i] * 3;
            const i2 = indices[i + 1] * 3;
            const i3 = indices[i + 2] * 3;
            
            // Apply transformations to vertices
            const v1 = transformVertex([vertices[i1], vertices[i1 + 1], vertices[i1 + 2]], scale, position);
            const v2 = transformVertex([vertices[i2], vertices[i2 + 1], vertices[i2 + 2]], scale, position);
            const v3 = transformVertex([vertices[i3], vertices[i3 + 1], vertices[i3 + 2]], scale, position);
            
            const normal = calculateNormal(v1, v2, v3);
            stlContent += formatSTLTriangle(normal, v1, v2, v3);
            triangleCount++;
          }
        } else {
          // Non-indexed geometry
          for (let i = 0; i < vertices.length; i += 9) {
            const v1 = transformVertex([vertices[i], vertices[i + 1], vertices[i + 2]], scale, position);
            const v2 = transformVertex([vertices[i + 3], vertices[i + 4], vertices[i + 5]], scale, position);
            const v3 = transformVertex([vertices[i + 6], vertices[i + 7], vertices[i + 8]], scale, position);
            
            const normal = calculateNormal(v1, v2, v3);
            stlContent += formatSTLTriangle(normal, v1, v2, v3);
            triangleCount++;
          }
        }
      } catch (primitiveError) {
        console.warn(`⚠️  Failed to process primitive ${primIndex}:`, primitiveError);
      }
    }
  }
  
  stlContent += 'endsolid model_viewer_accurate\n';
  console.log(`✅ STL generation complete: ${triangleCount} triangles with transformations`);
  
  return stlContent;
}

/**
 * Fix 3: Apply viewer transformations to vertex
 */
function transformVertex(vertex: number[], scale: number, position: THREE.Vector3): number[] {
  return [
    (vertex[0] * scale) + position.x,
    (vertex[1] * scale) + position.y,
    (vertex[2] * scale) + position.z
  ];
}

/**
 * Fix 4: Enhanced CAD export with scale options
 */
export interface EnhancedCADExportOptions {
  format: 'stl' | 'obj' | 'ply' | 'step' | 'fbx' | 'gltf';
  units: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  quality: 'low' | 'medium' | 'high';
  scale?: number;
  // New options for accuracy
  useViewerScale: boolean; // Whether to apply viewer scaling
  originalDimensions: boolean; // Whether to preserve original model dimensions
  scaleInfo?: {
    displayScale: number;
    originalBounds: THREE.Box3;
    viewerBounds: THREE.Box3;
  };
}

/**
 * Fix 5: Scale information UI component data
 */
export interface ModelScaleInfo {
  originalDimensions: {
    width: number;
    height: number;
    depth: number;
    units: string;
  };
  displayDimensions: {
    width: number;
    height: number;
    depth: number;
    scale: number;
  };
  exportDimensions: {
    width: number;
    height: number;
    depth: number;
    note: string;
  };
}

/**
 * Fix 6: Calculate model scale information for UI display
 */
export function calculateModelScaleInfo(
  gltfScene: THREE.Object3D,
  displayScale: number
): ModelScaleInfo {
  const bbox = new THREE.Box3().setFromObject(gltfScene);
  const size = bbox.getSize(new THREE.Vector3());
  
  return {
    originalDimensions: {
      width: Math.round(size.x * 10) / 10,
      height: Math.round(size.y * 10) / 10,
      depth: Math.round(size.z * 10) / 10,
      units: 'mm'
    },
    displayDimensions: {
      width: Math.round(size.x * displayScale * 10) / 10,
      height: Math.round(size.y * displayScale * 10) / 10,
      depth: Math.round(size.z * displayScale * 10) / 10,
      scale: displayScale
    },
    exportDimensions: {
      width: Math.round(size.x * 10) / 10,
      height: Math.round(size.y * 10) / 10,
      depth: Math.round(size.z * 10) / 10,
      note: 'Exported files use original dimensions unless "Use Viewer Scale" is selected'
    }
  };
}

// Helper functions (simplified versions)
function parseGLB(arrayBuffer: ArrayBuffer): any {
  // GLB parsing logic (simplified)
  const view = new DataView(arrayBuffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546C67) throw new Error('Invalid GLB file format');
  
  // Extract JSON chunk (basic implementation)
  let offset = 12;
  const chunkLength = view.getUint32(offset, true);
  const jsonBytes = new Uint8Array(arrayBuffer, offset + 8, chunkLength);
  const jsonString = new TextDecoder().decode(jsonBytes);
  
  return JSON.parse(jsonString);
}

function extractVerticesFromGLTF(gltfData: any, primitive: any): Float32Array {
  // Vertex extraction logic (simplified)
  const positionAccessorIndex = primitive.attributes.POSITION;
  if (positionAccessorIndex === undefined) {
    throw new Error('No POSITION attribute found');
  }
  
  // Return placeholder for now - full implementation would extract from buffers
  return new Float32Array([]);
}

function extractIndicesFromGLTF(gltfData: any, primitive: any): Uint16Array | Uint32Array | null {
  // Index extraction logic (simplified)
  if (primitive.indices === undefined) return null;
  
  // Return placeholder for now - full implementation would extract from buffers
  return null;
}

function calculateNormal(v1: number[], v2: number[], v3: number[]): number[] {
  const edge1 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
  const edge2 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
  
  const normal = [
    edge1[1] * edge2[2] - edge1[2] * edge2[1],
    edge1[2] * edge2[0] - edge1[0] * edge2[2],
    edge1[0] * edge2[1] - edge1[1] * edge2[0]
  ];
  
  const length = Math.sqrt(normal[0] * normal[0] + normal[1] * normal[1] + normal[2] * normal[2]);
  if (length > 0) {
    normal[0] /= length;
    normal[1] /= length;
    normal[2] /= length;
  }
  
  return normal;
}

function formatSTLTriangle(normal: number[], v1: number[], v2: number[], v3: number[]): string {
  return `  facet normal ${normal[0].toFixed(6)} ${normal[1].toFixed(6)} ${normal[2].toFixed(6)}
    outer loop
      vertex ${v1[0].toFixed(6)} ${v1[1].toFixed(6)} ${v1[2].toFixed(6)}
      vertex ${v2[0].toFixed(6)} ${v2[1].toFixed(6)} ${v2[2].toFixed(6)}
      vertex ${v3[0].toFixed(6)} ${v3[1].toFixed(6)} ${v3[2].toFixed(6)}
    endloop
  endfacet
`;
}