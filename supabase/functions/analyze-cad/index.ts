const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CADAnalysisRequest {
  prompt: string
  volume?: number
  complexity?: string
  components?: any[]
  gltfUrl?: string
  gltfData?: any
}

interface CADAnalysisResponse {
  title: string
  description: string
  specifications: {
    weight: string
    volume: string
    style: string
    durability: string
  }
  manufacturing: {
    method: string
    materials: string[]
    complexity: string
    cost: string
  }
  components?: Array<{
    name: string
    material: string
    dimensions: {
      width: number
      length: number
      height: number
    }
    function: string
  }>
}

interface GLTFMeshInfo {
  name: string
  primitiveCount: number
  boundingBox?: {
    min: [number, number, number]
    max: [number, number, number]
  }
  materialIndex?: number
}

interface GLTFAnalysis {
  meshes: GLTFMeshInfo[]
  materials: string[]
  nodes: Array<{ name: string, mesh?: number }>
  boundingBox: {
    min: [number, number, number]
    max: [number, number, number]
  }
}

// Function to analyze GLTF structure from parsed JSON data with advanced component detection
function analyzeGLTFData(gltfData: any): GLTFAnalysis | null {
  try {
    console.log('🔍 Analyzing parsed GLTF data structure with advanced component detection...')
    
    // Extract detailed mesh information with spatial analysis
    const meshes: GLTFMeshInfo[] = (gltfData.meshes || []).map((mesh: any, index: number) => {
      const meshInfo: GLTFMeshInfo = {
        name: mesh.name || `Component_${index + 1}`,
        primitiveCount: mesh.primitives?.length || 1,
        materialIndex: mesh.primitives?.[0]?.material
      }
      
      // Try to get mesh bounding box from accessors
      if (mesh.primitives && mesh.primitives[0]?.attributes?.POSITION !== undefined) {
        const positionAccessorIndex = mesh.primitives[0].attributes.POSITION
        const accessor = gltfData.accessors?.[positionAccessorIndex]
        if (accessor?.min && accessor?.max) {
          meshInfo.boundingBox = {
            min: [accessor.min[0], accessor.min[1], accessor.min[2]],
            max: [accessor.max[0], accessor.max[1], accessor.max[2]]
          }
        }
      }
      
      return meshInfo
    })
    
    // Extract material names with better defaults
    const materials: string[] = (gltfData.materials || []).map((material: any, index: number) => {
      if (material.name) return material.name
      if (material.pbrMetallicRoughness) {
        const pbr = material.pbrMetallicRoughness
        if (pbr.baseColorFactor) {
          const color = pbr.baseColorFactor
          if (color[0] > 0.8 && color[1] > 0.8 && color[2] > 0.8) return 'White_Material'
          if (color[0] < 0.2 && color[1] < 0.2 && color[2] < 0.2) return 'Black_Material'
          if (color[0] > 0.7 && color[1] < 0.3 && color[2] < 0.3) return 'Red_Material'
          if (color[0] < 0.3 && color[1] > 0.7 && color[2] < 0.3) return 'Green_Material'
          if (color[0] < 0.3 && color[1] < 0.3 && color[2] > 0.7) return 'Blue_Material'
        }
        if (pbr.metallicFactor && pbr.metallicFactor > 0.5) return 'Metal_Material'
      }
      return `Material_${index + 1}`
    })
    
    // Extract node hierarchy with spatial relationships
    const nodes = (gltfData.nodes || []).map((node: any, index: number) => {
      const nodeInfo = {
        name: node.name || `Node_${index + 1}`,
        mesh: node.mesh,
        translation: node.translation || [0, 0, 0],
        rotation: node.rotation || [0, 0, 0, 1],
        scale: node.scale || [1, 1, 1],
        children: node.children || []
      }
      return nodeInfo
    })
    
    // Advanced component detection based on spatial separation
    const detectedComponents = detectSeparateComponents(meshes, nodes, gltfData)
    
    // Calculate overall bounding box from all meshes
    let globalMinX = Infinity, globalMinY = Infinity, globalMinZ = Infinity
    let globalMaxX = -Infinity, globalMaxY = -Infinity, globalMaxZ = -Infinity
    
    meshes.forEach(mesh => {
      if (mesh.boundingBox) {
        globalMinX = Math.min(globalMinX, mesh.boundingBox.min[0])
        globalMinY = Math.min(globalMinY, mesh.boundingBox.min[1])
        globalMinZ = Math.min(globalMinZ, mesh.boundingBox.min[2])
        globalMaxX = Math.max(globalMaxX, mesh.boundingBox.max[0])
        globalMaxY = Math.max(globalMaxY, mesh.boundingBox.max[1])
        globalMaxZ = Math.max(globalMaxZ, mesh.boundingBox.max[2])
      }
    })
    
    const boundingBox = {
      min: isFinite(globalMinX) ? [globalMinX, globalMinY, globalMinZ] as [number, number, number] : [-50, -50, -50] as [number, number, number],
      max: isFinite(globalMaxX) ? [globalMaxX, globalMaxY, globalMaxZ] as [number, number, number] : [50, 50, 50] as [number, number, number]
    }
    
    console.log('🎯 GLTF analysis completed:', {
      meshCount: meshes.length,
      materialCount: materials.length,
      nodeCount: nodes.length,
      detectedComponents: detectedComponents.length,
      boundingBox
    })
    
    return {
      meshes: detectedComponents.length > 0 ? detectedComponents : meshes, // Use detected components if available
      materials,
      nodes,
      boundingBox
    }
    
  } catch (error) {
    console.error('GLTF analysis failed:', error)
    return null
  }
}

// Advanced component detection function
function detectSeparateComponents(meshes: GLTFMeshInfo[], nodes: any[], gltfData: any): GLTFMeshInfo[] {
  const components: GLTFMeshInfo[] = []
  
  // Strategy 1: Analyze mesh spatial separation
  const meshesWithBounds = meshes.filter(mesh => mesh.boundingBox)
  
  if (meshesWithBounds.length >= 2) {
    // Group meshes by spatial proximity
    const spatialGroups = groupMeshesByProximity(meshesWithBounds)
    
    spatialGroups.forEach((group, index) => {
      const representative = group[0]
      components.push({
        ...representative,
        name: inferComponentName(representative, index, group.length)
      })
    })
  }
  
  // Strategy 2: Use node hierarchy to detect separate objects
  if (components.length === 0 && nodes.length > 1) {
    const rootNodes = nodes.filter(node => !isChildNode(node, nodes))
    
    rootNodes.forEach((node, index) => {
      if (node.mesh !== undefined) {
        const mesh = meshes[node.mesh]
        if (mesh) {
          components.push({
            ...mesh,
            name: node.name || inferComponentName(mesh, index, rootNodes.length)
          })
        }
      }
    })
  }
  
  // Strategy 3: Fallback - try to intelligently split based on mesh names
  if (components.length === 0 && meshes.length > 1) {
    meshes.forEach((mesh, index) => {
      components.push({
        ...mesh,
        name: inferComponentName(mesh, index, meshes.length)
      })
    })
  }
  
  return components
}

// Group meshes by spatial proximity
function groupMeshesByProximity(meshes: GLTFMeshInfo[]): GLTFMeshInfo[][] {
  const groups: GLTFMeshInfo[][] = []
  const processed = new Set<number>()
  
  meshes.forEach((mesh, index) => {
    if (processed.has(index)) return
    
    const group = [mesh]
    processed.add(index)
    
    // Find nearby meshes
    meshes.forEach((otherMesh, otherIndex) => {
      if (processed.has(otherIndex) || index === otherIndex) return
      
      if (mesh.boundingBox && otherMesh.boundingBox) {
        const distance = calculateBoundingBoxDistance(mesh.boundingBox, otherMesh.boundingBox)
        const meshSize = getBoundingBoxSize(mesh.boundingBox)
        
        // If meshes are close relative to their size, group them
        if (distance < meshSize * 0.5) {
          group.push(otherMesh)
          processed.add(otherIndex)
        }
      }
    })
    
    groups.push(group)
  })
  
  return groups
}

// Calculate distance between two bounding boxes
function calculateBoundingBoxDistance(box1: { min: [number, number, number], max: [number, number, number] }, box2: { min: [number, number, number], max: [number, number, number] }): number {
  const center1 = [
    (box1.min[0] + box1.max[0]) / 2,
    (box1.min[1] + box1.max[1]) / 2,
    (box1.min[2] + box1.max[2]) / 2
  ]
  const center2 = [
    (box2.min[0] + box2.max[0]) / 2,
    (box2.min[1] + box2.max[1]) / 2,
    (box2.min[2] + box2.max[2]) / 2
  ]
  
  return Math.sqrt(
    Math.pow(center1[0] - center2[0], 2) +
    Math.pow(center1[1] - center2[1], 2) +
    Math.pow(center1[2] - center2[2], 2)
  )
}

// Get bounding box size
function getBoundingBoxSize(box: { min: [number, number, number], max: [number, number, number] }): number {
  return Math.max(
    box.max[0] - box.min[0],
    box.max[1] - box.min[1],
    box.max[2] - box.min[2]
  )
}

// Check if a node is a child of another node
function isChildNode(node: any, allNodes: any[]): boolean {
  return allNodes.some(parentNode => 
    parentNode.children && parentNode.children.includes(allNodes.indexOf(node))
  )
}

// Infer component name based on geometry and context
function inferComponentName(mesh: GLTFMeshInfo, index: number, totalCount: number): string {
  const name = mesh.name.toLowerCase()
  
  // If it already has a descriptive name, use it
  if (name && !name.includes('component') && !name.includes('mesh') && !name.includes('node')) {
    return mesh.name
  }
  
  // Infer based on bounding box if available
  if (mesh.boundingBox) {
    const width = mesh.boundingBox.max[0] - mesh.boundingBox.min[0]
    const height = mesh.boundingBox.max[1] - mesh.boundingBox.min[1]
    const depth = mesh.boundingBox.max[2] - mesh.boundingBox.min[2]
    
    const aspectRatio = Math.max(width, depth) / height
    
    // Tall and thin (like a rod, pole, handle)
    if (height > Math.max(width, depth) * 2) {
      return index === 0 ? 'vertical_rod' : `support_element_${index + 1}`
    }
    
    // Wide and flat (like a base, platform)
    if (height < Math.max(width, depth) * 0.3) {
      return index === 0 ? 'base_platform' : `flat_component_${index + 1}`
    }
    
    // Roughly spherical or cubic
    if (aspectRatio < 1.5 && height / Math.max(width, depth) > 0.5) {
      if (width > height) return index === 0 ? 'main_body' : `housing_${index + 1}`
      return index === 0 ? 'container' : `chamber_${index + 1}`
    }
  }
  
  // Fallback naming based on position in array
  const names = ['primary_component', 'secondary_component', 'tertiary_component', 'auxiliary_component']
  return names[index] || `component_${index + 1}`
}

// Legacy function for backward compatibility (kept for fallback)
async function analyzeGLTFFile(gltfUrl: string): Promise<GLTFAnalysis | null> {
  try {
    console.log('Downloading GLTF file from:', gltfUrl)
    
    const response = await fetch(gltfUrl)
    if (!response.ok) {
      console.error('Failed to download GLTF:', response.status)
      return null
    }
    
    const gltfData = await response.json()
    return analyzeGLTFData(gltfData)
    
  } catch (error) {
    console.error('GLTF file analysis failed:', error)
    return null
  }
}

console.info('analyze-cad edge function started')

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Processing CAD analysis request...')
    
    const { prompt, volume, complexity, components, gltfUrl, gltfData }: CADAnalysisRequest = await req.json()
    console.log('Request data:', { 
      prompt, 
      volume, 
      complexity, 
      components: components?.length, 
      gltfUrl: !!gltfUrl,
      hasGltfData: !!gltfData
    })

    // Get Gemini API key from environment (using PICA naming convention)
    const geminiApiKey = Deno.env.get('PICA_GEMINI_CONNECTION_KEY')
    console.log('Gemini API key exists:', !!geminiApiKey)
    
    if (!geminiApiKey) {
      console.error('PICA_GEMINI_CONNECTION_KEY not configured')
      throw new Error('PICA_GEMINI_CONNECTION_KEY not configured')
    }

    // Analyze GLTF data - prefer parsed data over URL
    let gltfAnalysis: GLTFAnalysis | null = null
    if (gltfData) {
      console.log('Using provided parsed GLTF data')
      gltfAnalysis = analyzeGLTFData(gltfData)
    } else if (gltfUrl) {
      console.log('Falling back to downloading GLTF from URL')
      gltfAnalysis = await analyzeGLTFFile(gltfUrl)
    }

    // Prepare fallback response in case Gemini fails
    const fallbackAnalysis: CADAnalysisResponse = {
      title: `${prompt}`,
      description: `CAD model generated from prompt: ${prompt}. Professional 3D design ready for manufacturing.`,
      specifications: {
        weight: volume ? `${Math.round(volume * 0.001)} g` : '150 g',
        volume: volume ? `${Math.round(volume / 1000)} cm³` : '50 cm³',
        style: 'modern',
        durability: 'High'
      },
      manufacturing: {
        method: '3D Printing',
        materials: ['PLA', 'ABS Plastic'],
        complexity: complexity || 'moderate',
        cost: '15-25 USD'
      },
      components: gltfAnalysis ? gltfAnalysis.meshes.map((mesh, index) => {
        const dims = gltfAnalysis!.boundingBox
        const width = Math.abs(dims.max[0] - dims.min[0]) / Math.max(1, gltfAnalysis!.meshes.length)
        const length = Math.abs(dims.max[1] - dims.min[1]) / Math.max(1, gltfAnalysis!.meshes.length)  
        const height = Math.abs(dims.max[2] - dims.min[2]) / Math.max(1, gltfAnalysis!.meshes.length)
        
        return {
          name: mesh.name,
          material: gltfAnalysis!.materials[mesh.materialIndex || 0] || 'Engineering Plastic',
          dimensions: {
            width: Math.max(1, Math.round(width * 10)),
            length: Math.max(1, Math.round(length * 10)),
            height: Math.max(1, Math.round(height * 10))
          },
          function: index === 0 ? 'Primary structural component' : `Secondary component ${index + 1}`
        }
      }) : undefined
    }

    try {
      // Try Gemini API call with GLTF data
      console.log('Calling Gemini API with GLTF analysis...')
      
      let gltfDataDescription = ''
      if (gltfAnalysis) {
        // Generate detailed component descriptions
        const componentDescriptions = gltfAnalysis.meshes.map((mesh, index) => {
          let description = `Component ${index + 1}: "${mesh.name}"`
          
          if (mesh.boundingBox) {
            const width = Math.abs(mesh.boundingBox.max[0] - mesh.boundingBox.min[0])
            const height = Math.abs(mesh.boundingBox.max[1] - mesh.boundingBox.min[1])
            const depth = Math.abs(mesh.boundingBox.max[2] - mesh.boundingBox.min[2])
            
            description += ` - Dimensions: ${width.toFixed(1)}×${height.toFixed(1)}×${depth.toFixed(1)} units`
            
            // Add shape characteristics
            if (height > Math.max(width, depth) * 2) {
              description += ` (tall/vertical element, likely a rod, pole, or support)`
            } else if (height < Math.max(width, depth) * 0.3) {
              description += ` (flat/horizontal element, likely a base, platform, or disc)`
            } else if (width > height && depth > height) {
              description += ` (wide element, possibly a container, housing, or body)`
            } else {
              description += ` (balanced proportions, likely main structural component)`
            }
          }
          
          description += ` - Geometry complexity: ${mesh.primitiveCount} primitive${mesh.primitiveCount > 1 ? 's' : ''}`
          
          if (mesh.materialIndex !== undefined && gltfAnalysis.materials[mesh.materialIndex]) {
            description += ` - Material: ${gltfAnalysis.materials[mesh.materialIndex]}`
          }
          
          return description
        }).join('\n  ')
        
        gltfDataDescription = `
DETAILED 3D MODEL ANALYSIS (from ${gltfData ? 'parsed GLTF data' : 'downloaded file'}):

COMPONENT BREAKDOWN:
  ${componentDescriptions}

OVERALL STRUCTURE:
- Total Detected Components: ${gltfAnalysis.meshes.length}
- Materials Available: ${gltfAnalysis.materials.join(', ') || 'Default materials'}
- Overall Model Dimensions: ${Math.abs(gltfAnalysis.boundingBox.max[0] - gltfAnalysis.boundingBox.min[0]).toFixed(1)} × ${Math.abs(gltfAnalysis.boundingBox.max[1] - gltfAnalysis.boundingBox.min[1]).toFixed(1)} × ${Math.abs(gltfAnalysis.boundingBox.max[2] - gltfAnalysis.boundingBox.min[2]).toFixed(1)} units
- Node Hierarchy: ${gltfAnalysis.nodes.map(n => n.name).join(', ')}

SPATIAL RELATIONSHIPS:
${gltfAnalysis.meshes.length > 1 ? 
  `This model contains ${gltfAnalysis.meshes.length} distinct components that are spatially separated. Each component should be analyzed individually for materials, function, and manufacturing requirements.` : 
  'This model contains a single unified component.'
}
`
      }
      
      const analysisPrompt = `
Analyze this CAD model and provide accurate technical specifications based on the actual 3D data:

Original Prompt: "${prompt}"
${volume ? `Volume: ${volume} mm³` : ''}
${complexity ? `Current Complexity: ${complexity}` : ''}
${gltfDataDescription}

Based on the prompt, volume data, and actual GLTF 3D model structure above, generate realistic and accurate specifications. Use the real component names and structure from the GLTF data.

Respond in JSON format with:
{
  "title": "Clear, descriptive title based on the prompt",
  "description": "Detailed description of the part, its function, and features based on actual geometry",
  "specifications": {
    "weight": "Realistic weight estimate with units (e.g., '145 g')",
    "volume": "Volume in cm³ format (e.g., '8.2 cm³')",
    "style": "Design style (modern, industrial, ergonomic, etc.)",
    "durability": "High/Medium/Low based on use case and materials"
  },
  "manufacturing": {
    "method": "Best manufacturing method for this part",
    "materials": ["List", "of", "suitable", "materials"],
    "complexity": "simple/moderate/complex based on actual geometry",
    "cost": "Realistic cost estimate in USD range (e.g., '5-15 USD')"
  },
  "components": [
    {
      "name": "Component name from GLTF or descriptive name",
      "material": "Appropriate material for this component",
      "dimensions": {
        "width": 25,
        "length": 30,
        "height": 15
      },
      "function": "Specific function of this component"
    }
  ]
}

Make all estimates realistic and based on the actual 3D geometry, component count, and materials from the GLTF analysis. Ensure component dimensions are realistic for the actual parts.`

      // Call Gemini Flash API for cost-effective analysis
      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: analysisPrompt
              }]
            }],
            generationConfig: {
              temperature: 0.3,
              topK: 40,
              topP: 0.95,
              maxOutputTokens: 2048,
            }
          })
        }
      )

      if (!geminiResponse.ok) {
        const errorText = await geminiResponse.text()
        console.error('Gemini API error:', geminiResponse.status, errorText)
        throw new Error(`Gemini API failed: ${geminiResponse.status} - ${errorText}`)
      }

      const geminiData = await geminiResponse.json()
      console.log('Gemini response received:', !!geminiData)
      
      const generatedText = geminiData.candidates[0]?.content?.parts[0]?.text

      if (!generatedText) {
        console.error('No generated text from Gemini:', geminiData)
        throw new Error('No response from Gemini API')
      }

      // Parse JSON response from Gemini
      let analysis: CADAnalysisResponse
      try {
        // Clean up the response (remove markdown code blocks if present)
        const cleanedText = generatedText.replace(/```json\n?|\n?```/g, '').trim()
        console.log('Parsing Gemini response...')
        analysis = JSON.parse(cleanedText)
      } catch (parseError) {
        console.error('Failed to parse Gemini response:', generatedText, parseError)
        throw new Error('Invalid JSON response from AI')
      }

      // Validate and enhance the response
      const validatedAnalysis: CADAnalysisResponse = {
        title: analysis.title || prompt,
        description: analysis.description || `CAD model based on: ${prompt}`,
        specifications: {
          weight: analysis.specifications?.weight || fallbackAnalysis.specifications.weight,
          volume: analysis.specifications?.volume || (volume ? `${Math.round(volume / 1000)} cm³` : fallbackAnalysis.specifications.volume),
          style: analysis.specifications?.style || 'modern',
          durability: analysis.specifications?.durability || 'High'
        },
        manufacturing: {
          method: analysis.manufacturing?.method || '3D Printing',
          materials: analysis.manufacturing?.materials || ['PLA', 'ABS Plastic'],
          complexity: analysis.manufacturing?.complexity || complexity || 'moderate',
          cost: analysis.manufacturing?.cost || fallbackAnalysis.manufacturing.cost
        },
        components: analysis.components || fallbackAnalysis.components
      }

      console.log('✅ CAD analysis completed with Gemini API and GLTF data')
      
      return new Response(
        JSON.stringify(validatedAnalysis),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          status: 200,
        }
      )

    } catch (geminiError) {
      console.warn('Gemini API failed, using fallback response with GLTF data:', geminiError.message)
      
      return new Response(
        JSON.stringify(fallbackAnalysis),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
          status: 200,
        }
      )
    }

  } catch (error) {
    console.error('CAD analysis error:', error)
    
    return new Response(
      JSON.stringify({
        error: 'Failed to analyze CAD model',
        details: error.message,
        debug: {
          message: error.message,
          stack: error.stack
        }
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
        status: 500,
      }
    )
  }
}) 