// Core architectural model types
export interface Room {
  id: string;
  name: string;
  dimensions: {
    width: number;
    length: number;
    height: number;
  };
  position: {
    x: number;
    y: number;
    z: number;
  };
  connections: string[];
  features: string[];
  materials?: {
    walls: string;
    floor: string;
    ceiling: string;
  };
}

export interface Door {
  id: string;
  from: string;
  to: string;
  position: {
    x: number;
    y: number;
    z: number;
  };
  size: {
    width: number;
    height: number;
  };
  type: 'single' | 'double' | 'sliding' | 'french';
}

export interface Window {
  id: string;
  room: string;
  wall: 'north' | 'south' | 'east' | 'west';
  position: number; // Position along the wall (0-1)
  size: {
    width: number;
    height: number;
  };
  type: 'standard' | 'bay' | 'skylight' | 'french';
}

export interface ArchitecturalModel {
  id: string;
  name: string;
  description: string;
  rooms: Room[];
  doors: Door[];
  windows: Window[];
  totalArea: number;
  style: string;
  created: Date;
  modified: Date;
  type?: 'product' | 'architectural' | 'cad';
  // Product-specific fields (optional for backward compatibility)
  productSpecs?: {
    name: string;
    description: string;
    style: string;
    components: any[];
    // AI-generated product information
    title?: string;
    category?: string;
    potentialUses?: string[];
    keyFeatures?: string[];
    totalVolume?: number;
    manufacturing?: {
      method: string;
      materials: string[];
      complexity: string;
      estimated_cost: string;
    };
    specifications?: {
      weight: string;
      dimensions: { length: number; width: number; height: number };
      color_options: string[];
      durability: string;
    };
  };
  manufacturing?: any;
  specifications?: any;
  // CAD-specific fields
  cadModel?: CADModelData;
}

// CAD-specific interfaces
export interface CADModelData {
  id: string;
  prompt: string;
  originalPrompt?: string; // Store the original user input for modifications
  gltfUrl: string;
  shareableGltfUrl?: string; // Cross-device shareable URL
  thumbnailUrl?: string;
  // NEW: Base64 data for cross-device reconstruction
  base64Data?: string;
  base64Format?: 'gltf' | 'glb' | null;
  formats: Record<string, string>;
  kclCode?: string; // KCL source code for the model
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
  manufacturingCost?: {
    material: string;
    volume: number;
    cost: number;
    currency: string;
  };
  exportOptions?: CADExportOptions;
}

export interface CADExportOptions {
  format: 'stl' | 'obj' | 'ply' | 'step' | 'fbx' | 'gltf';
  units: 'mm' | 'cm' | 'm' | 'in' | 'ft';
  quality: 'low' | 'medium' | 'high';
  scale?: number;
  // NEW FIX: Add viewer scale option
  useViewerScale?: boolean;
}

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
    thumbnail?: string;
  };
  error?: string;
  created_at: string;
  completed_at?: string;
}

// Input modality types
export interface TextInput {
  type: 'text';
  content: string;
  timestamp: Date;
}

export interface VoiceInput {
  type: 'voice';
  audioBlob: Blob;
  transcript: string;
  duration: number;
  timestamp: Date;
}

export interface SketchInput {
  type: 'sketch';
  imageData: string; // base64 encoded
  strokes: SketchStroke[];
  dimensions: {
    width: number;
    height: number;
  };
  timestamp: Date;
}

export interface SketchStroke {
  points: { x: number; y: number }[];
  color: string;
  width: number;
  tool: 'pen' | 'eraser' | 'line' | 'rectangle' | 'circle';
}

export interface PhotoInput {
  type: 'photo';
  imageData: string; // base64 encoded
  metadata: {
    width: number;
    height: number;
    device: string;
    location?: {
      latitude: number;
      longitude: number;
    };
  };
  timestamp: Date;
}

export interface MultimodalInput {
  text?: TextInput | TextInput[];
  voice?: VoiceInput | VoiceInput[];
  sketch?: SketchInput | SketchInput[];
  photo?: PhotoInput | PhotoInput[];
  video?: any | any[];
  combined: boolean;
}

// AR-specific types
export interface ARCapabilities {
  supported: boolean;
  features: {
    hitTest: boolean;
    planeDetection: boolean;
    handTracking: boolean;
    imageTracking: boolean;
  };
  device: {
    mobile: boolean;
    orientation: 'portrait' | 'landscape';
    camera: boolean;
    gyroscope: boolean;
    accelerometer: boolean;
  };
}

export interface ARPlacement {
  position: {
    x: number;
    y: number;
    z: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  scale: {
    x: number;
    y: number;
    z: number;
  };
}

export interface ARSession {
  active: boolean;
  modelPlaced: boolean;
  placement?: ARPlacement;
  measurements: ARMeasurement[];
}

export interface ARMeasurement {
  id: string;
  type: 'distance' | 'area' | 'volume';
  points: { x: number; y: number; z: number }[];
  value: number;
  unit: 'meters' | 'feet';
  label: string;
}

// Processing and generation types
export interface GenerationRequest {
  inputs: MultimodalInput;
  preferences: {
    style: 'modern' | 'traditional' | 'minimalist' | 'industrial';
    units: 'metric' | 'imperial';
    complexity: 'simple' | 'detailed' | 'complex';
  };
  constraints?: {
    maxRooms: number;
    budget?: number;
    area?: { min: number; max: number };
  };
}

export interface GenerationResponse {
  model: ArchitecturalModel;
  confidence: number;
  alternatives: ArchitecturalModel[];
  processing: {
    duration: number;
    steps: string[];
    warnings: string[];
  };
}

// Component state types
export interface InputPanelState {
  activeTab: 'text' | 'voice' | 'sketch' | 'camera';
  isRecording: boolean;
  isDrawing: boolean;
  isCameraActive: boolean;
  inputs: Partial<MultimodalInput>;
}

export interface ViewerState {
  mode: '2d' | '3d' | 'ar';
  model?: ArchitecturalModel;
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
  };
  lighting: {
    ambient: number;
    directional: number;
  };
  materials: {
    walls: string;
    floors: string;
    roofs: string;
  };
} 

// Subscription and access control types
export type SubscriptionTier = 'free' | 'plus' | 'pro';

export interface SubscriptionFeatures {
  designsPerMonth: number;
  cadExports: boolean;
  prioritySupport: boolean;
  arVisualization: boolean;
  customBranding: boolean;
}

export interface ManufacturerUsage {
  id: string;
  user_id: string;
  searches_used: number;
  quotes_sent: number;
  month_year: string; // 'YYYY-MM'
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  subscription_tier: SubscriptionTier;
  manufacturer_access: boolean;
  stripe_customer_id?: string;
  subscription_status?: 'active' | 'inactive' | 'cancelled' | 'past_due';
  created_at: string;
  updated_at: string;
}

export const SUBSCRIPTION_FEATURES: Record<SubscriptionTier, SubscriptionFeatures> = {
  free: {
    designsPerMonth: 3,
    cadExports: false,
    prioritySupport: false,
    arVisualization: true,
    customBranding: false,
  },
  plus: {
    designsPerMonth: 25,
    cadExports: true,
    prioritySupport: false,
    arVisualization: true,
    customBranding: false,
  },
  pro: {
    designsPerMonth: 100,
    cadExports: true,
    prioritySupport: true,
    arVisualization: true,
    customBranding: true,
  },
};