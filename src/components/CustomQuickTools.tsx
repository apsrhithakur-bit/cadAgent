import React, { useState, useEffect, useRef } from 'react';
import { 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X, 
  Settings,
  Zap,
  AlertCircle,
  Check,
  Download,
  ChevronDown,
  AlertTriangle,
  Loader2,
  Mail,
  MessageCircle,
  CheckCircle
} from 'lucide-react';
import { ArchitecturalModel } from '../types/architectural';
import { CADAIService } from '../services/cadAI';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { useToast } from './ui/use-toast';

export interface CustomQuickTool {
  id: string;
  name: string;
  description: string;
  prompt: string;
  icon: string;
  color: string;
  createdAt: Date;
  isDefault?: boolean;
}

interface CustomQuickToolsProps {
  model: ArchitecturalModel | null;
  onApplyTool: (tool: CustomQuickTool) => Promise<void>;
  isProcessing: boolean;
  className?: string;
}

const DEFAULT_TOOLS: CustomQuickTool[] = [
  {
    id: 'reduce_weight',
    name: 'Reduce Weight',
    description: 'Make the model lighter with hollow interior',
    prompt: 'lighter with hollow interior and thin walls',
    icon: '⚖️',
    color: 'bg-blue-600',
    createdAt: new Date(),
    isDefault: true
  },
  {
    id: 'cut_costs',
    name: 'Lower Cost',
    description: 'Simplify design to reduce manufacturing costs',
    prompt: 'simplified with reduced material usage and easier manufacturing',
    icon: '💰',
    color: 'bg-green-600',
    createdAt: new Date(),
    isDefault: true
  },
  {
    id: '3d_print_ready',
    name: '3D Print Ready',
    description: 'Optimize geometry for 3D printing',
    prompt: 'optimized for 3D printing with proper support angles and no overhangs',
    icon: '🖨️',
    color: 'bg-purple-600',
    createdAt: new Date(),
    isDefault: true
  }
];

const ICON_OPTIONS = ['🔧', '⚡', '🎯', '🚀', '💎', '🔥', '⭐', '🛠️', '🎨', '🔬', '💡', '🎪', '🌟', '🎭'];
const COLOR_OPTIONS = [
  'bg-blue-600',
  'bg-green-600', 
  'bg-purple-600',
  'bg-red-600',
  'bg-yellow-600',
  'bg-indigo-600',
  'bg-pink-600',
  'bg-gray-600',
  'bg-cyan-600',
  'bg-emerald-600'
];

export const CustomQuickTools: React.FC<CustomQuickToolsProps> = ({
  model,
  onApplyTool,
  isProcessing,
  className = ''
}) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [tools, setTools] = useState<CustomQuickTool[]>(DEFAULT_TOOLS);
  const [showBetaAccess, setShowBetaAccess] = useState(false);
  const [betaEmail, setBetaEmail] = useState('');
  const [betaReason, setBetaReason] = useState('');
  const [isSubmittingBeta, setIsSubmittingBeta] = useState(false);
  const [betaRequestStatus, setBetaRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');

  // Check beta access on mount and when profile changes
  useEffect(() => {
    const checkBetaAccess = async () => {
      // Check if user has beta access in their profile
      if (profile?.optimization_beta_access === true) {
        setShowBetaAccess(false);
        setBetaRequestStatus('approved');
      } else {
        setShowBetaAccess(true);
        
        // Check if there's a pending request
        if (user) {
          const { data: requests } = await supabase
            .from('beta_access_requests')
            .select('status')
            .eq('user_id', user.id)
            .eq('feature_requested', 'optimization')
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (requests && requests.length > 0) {
            setBetaRequestStatus(requests[0].status as any);
          }
        }
      }
      
      // Pre-fill email if user is logged in
      if (user?.email && !betaEmail) {
        setBetaEmail(user.email);
      }
    };
    
    checkBetaAccess();
  }, [profile, user]);

  // Ensure no grip tools are in the current state
  useEffect(() => {
    setTools(prev => prev.filter(tool => 
      !['improve_grip', 'add_grip', 'grip_texture'].includes(tool.id)
    ));
  }, []);
  const [isEditing, setIsEditing] = useState(false);
  const [editingTool, setEditingTool] = useState<CustomQuickTool | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    prompt: '',
    icon: '🔧',
    color: 'bg-blue-600'
  });

  // Export functionality state
  const [currentFormat, setCurrentFormat] = useState<'gltf' | 'stl' | 'obj' | 'ply'>('stl');
  const [exportStatus, setExportStatus] = useState<'ready' | 'loading' | 'failed'>('ready');
  const [cachedFormats, setCachedFormats] = useState<Partial<Record<string, string>>>({});
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const downloadLinkRef = useRef<HTMLAnchorElement>(null);

  // Export functionality constants and functions
  const CADFormats = {
    gltf: { name: 'GLTF', extension: '.gltf', description: '3D Graphics' },
    stl: { name: 'STL', extension: '.stl', description: '3D Printing' },
    obj: { name: 'OBJ', extension: '.obj', description: 'Wavefront OBJ' },
    ply: { name: 'PLY', extension: '.ply', description: 'Polygon Format' }
  };

  // Convert GLTF to other formats using Three.js exporters
  const convertToSTL = async (gltfUrl: string): Promise<string> => {
    const { STLExporter } = await import('three/examples/jsm/exporters/STLExporter.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(gltfUrl);
    
    const exporter = new STLExporter();
    const stlString = exporter.parse(gltf.scene);
    
    const blob = new Blob([stlString], { type: 'application/vnd.ms-pki.stl' });
    return URL.createObjectURL(blob);
  };

  const convertToOBJ = async (gltfUrl: string): Promise<string> => {
    const { OBJExporter } = await import('three/examples/jsm/exporters/OBJExporter.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(gltfUrl);
    
    const exporter = new OBJExporter();
    const objString = exporter.parse(gltf.scene);
    
    const blob = new Blob([objString], { type: 'text/plain' });
    return URL.createObjectURL(blob);
  };

  const convertToPLY = async (gltfUrl: string): Promise<string> => {
    const { PLYExporter } = await import('three/examples/jsm/exporters/PLYExporter.js');
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
    
    const loader = new GLTFLoader();
    const gltf = await loader.loadAsync(gltfUrl);
    
    const exporter = new PLYExporter();
    
    return new Promise<string>((resolve, reject) => {
      try {
        exporter.parse(gltf.scene, (result: string) => {
          const blob = new Blob([result], { type: 'application/octet-stream' });
          resolve(URL.createObjectURL(blob));
        }, { binary: false });
      } catch (error) {
        reject(error);
      }
    });
  };

  const convertFormat = async (targetFormat: typeof currentFormat): Promise<string> => {
    if (cachedFormats[targetFormat]) {
      return cachedFormats[targetFormat];
    }

    if (!model?.cadModel?.gltfUrl) {
      throw new Error('No CAD model available for export');
    }

    setExportStatus('loading');
    
    try {
      let convertedUrl: string;
      const gltfUrl = model.cadModel.gltfUrl;
      
      switch (targetFormat) {
        case 'gltf':
          convertedUrl = gltfUrl;
          break;
        case 'stl':
          convertedUrl = await convertToSTL(gltfUrl);
          break;
        case 'obj':
          convertedUrl = await convertToOBJ(gltfUrl);
          break;
        case 'ply':
          convertedUrl = await convertToPLY(gltfUrl);
          break;
        default:
          throw new Error(`Unsupported format: ${targetFormat}`);
      }
      
      setCachedFormats(prev => ({
        ...prev,
        [targetFormat]: convertedUrl
      }));
      
      setExportStatus('ready');
      return convertedUrl;
    } catch (error) {
      console.error('Format conversion failed:', error);
      setExportStatus('failed');
      throw error;
    }
  };

  const handleExportDownload = async (format: typeof currentFormat) => {
    try {
      const downloadUrl = await convertFormat(format);
      
      if (downloadLinkRef.current && model) {
        const modelPrompt = model.cadModel?.prompt || model.description || model.name || 'cad-model';
        const cleanModelName = CADAIService.cleanProductName(modelPrompt);
        downloadLinkRef.current.href = downloadUrl;
        downloadLinkRef.current.download = `${cleanModelName.replace(/\.[^/.]+$/, '')}${CADFormats[format].extension}`;
        downloadLinkRef.current.click();
      }
    } catch (error) {
      console.error('Export failed:', error);
      setExportStatus('failed');
      setTimeout(() => setExportStatus('ready'), 3000);
    }
  };

  const handleFormatChange = async (format: typeof currentFormat) => {
    setCurrentFormat(format);
    setDropdownOpen(false);
    await handleExportDownload(format);
  };

  // Load custom tools from localStorage on component mount
  useEffect(() => {
    const savedTools = localStorage.getItem('customQuickTools');
    if (savedTools) {
      try {
        const parsedTools = JSON.parse(savedTools).map((tool: any) => ({
          ...tool,
          createdAt: new Date(tool.createdAt)
        }))
        // Filter out deprecated tools (like improve_grip)
        .filter((tool: CustomQuickTool) => 
          !['improve_grip', 'add_grip', 'grip_texture'].includes(tool.id)
        );
        
        // Merge with defaults, keeping user customizations
        const mergedTools = [...DEFAULT_TOOLS];
        parsedTools.forEach((savedTool: CustomQuickTool) => {
          const existingIndex = mergedTools.findIndex(t => t.id === savedTool.id);
          if (existingIndex >= 0) {
            mergedTools[existingIndex] = savedTool;
          } else {
            mergedTools.push(savedTool);
          }
        });
        setTools(mergedTools);
      } catch (error) {
        console.error('Failed to load custom tools:', error);
      }
    }
  }, []);

  // Save tools to localStorage whenever tools change (filter out grip tools)
  useEffect(() => {
    const filteredTools = tools.filter(tool => 
      !['improve_grip', 'add_grip', 'grip_texture'].includes(tool.id)
    );
    localStorage.setItem('customQuickTools', JSON.stringify(filteredTools));
  }, [tools]);

  // Cleanup any grip-related tools immediately on component mount
  useEffect(() => {
    const savedTools = localStorage.getItem('customQuickTools');
    if (savedTools) {
      try {
        const parsedTools = JSON.parse(savedTools);
        const hasGripTools = parsedTools.some((tool: any) => 
          ['improve_grip', 'add_grip', 'grip_texture'].includes(tool.id)
        );
        
        if (hasGripTools) {
          const cleanedTools = parsedTools.filter((tool: any) => 
            !['improve_grip', 'add_grip', 'grip_texture'].includes(tool.id)
          );
          localStorage.setItem('customQuickTools', JSON.stringify(cleanedTools));
          console.log('🧹 Cleaned up deprecated grip tools from localStorage');
        }
      } catch (error) {
        console.error('Failed to cleanup tools:', error);
      }
    }
  }, []);

  const handleCreateTool = () => {
    if (!formData.name.trim() || !formData.prompt.trim()) return;

    const newTool: CustomQuickTool = {
      id: `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: formData.name.trim(),
      description: formData.description.trim() || formData.name.trim(),
      prompt: formData.prompt.trim(),
      icon: formData.icon,
      color: formData.color,
      createdAt: new Date(),
      isDefault: false
    };

    setTools(prev => [...prev, newTool]);
    setFormData({ name: '', description: '', prompt: '', icon: '🔧', color: 'bg-blue-600' });
    setShowCreateForm(false);
  };

  const handleEditTool = (tool: CustomQuickTool) => {
    setEditingTool(tool);
    setFormData({
      name: tool.name,
      description: tool.description,
      prompt: tool.prompt,
      icon: tool.icon,
      color: tool.color
    });
    setShowCreateForm(true);
  };

  const handleUpdateTool = () => {
    if (!editingTool || !formData.name.trim() || !formData.prompt.trim()) return;

    const updatedTool: CustomQuickTool = {
      ...editingTool,
      name: formData.name.trim(),
      description: formData.description.trim() || formData.name.trim(),
      prompt: formData.prompt.trim(),
      icon: formData.icon,
      color: formData.color
    };

    setTools(prev => prev.map(tool => tool.id === editingTool.id ? updatedTool : tool));
    setEditingTool(null);
    setFormData({ name: '', description: '', prompt: '', icon: '🔧', color: 'bg-blue-600' });
    setShowCreateForm(false);
  };

  const handleDeleteTool = (toolId: string) => {
    const tool = tools.find(t => t.id === toolId);
    if (tool?.isDefault) {
      alert('Cannot delete default tools. You can edit them instead.');
      return;
    }

    if (confirm('Are you sure you want to delete this tool?')) {
      setTools(prev => prev.filter(tool => tool.id !== toolId));
    }
  };

  const handleCancelEdit = () => {
    setEditingTool(null);
    setFormData({ name: '', description: '', prompt: '', icon: '🔧', color: 'bg-blue-600' });
    setShowCreateForm(false);
  };

  const resetToDefaults = () => {
    if (confirm('Reset all tools to defaults? This will remove your custom tools.')) {
      setTools(DEFAULT_TOOLS);
      localStorage.removeItem('customQuickTools');
    }
  };

  const handleBetaAccessRequest = async () => {
    if (!betaEmail.trim() || !betaReason.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please provide both email and reason for beta access.',
        variant: 'destructive'
      });
      return;
    }

    if (!user) {
      toast({
        title: 'Authentication Required',
        description: 'Please sign in to request beta access.',
        variant: 'destructive'
      });
      return;
    }

    setIsSubmittingBeta(true);
    try {
      // Save the beta access request to Supabase
      const { error } = await supabase
        .from('beta_access_requests')
        .insert({
          user_id: user.id,
          email: betaEmail,
          reason: betaReason,
          feature_requested: 'optimization',
          status: 'pending'
        });

      if (error) throw error;
      
      setBetaRequestStatus('pending');
      
      toast({
        title: 'Request Submitted!',
        description: 'Thank you for your interest. We\'ll review your request and notify you once approved.',
      });
      
    } catch (error) {
      console.error('Beta request error:', error);
      toast({
        title: 'Request Failed',
        description: 'Please try again later.',
        variant: 'destructive'
      });
    } finally {
      setIsSubmittingBeta(false);
    }
  };

  return (
    <div className={`relative ${className}`}>
      {/* Beta Access Overlay */}
      {showBetaAccess && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center rounded-lg">
          <div className="cosmic-panel max-w-md w-full mx-4 p-6 text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
              <Zap className="w-8 h-8 text-white" />
            </div>
            
            <h3 className="text-xl font-bold text-white mb-3">
              {betaRequestStatus === 'pending' ? '⏳ Beta Access Pending' : '🚀 Optimization Tools - Beta Access'}
            </h3>
            
            {betaRequestStatus === 'pending' ? (
              <div className="text-gray-300 mb-4">
                <div className="flex items-center justify-center gap-2 mb-3">
                  <CheckCircle className="w-5 h-5 text-green-400" />
                  <span>Request Submitted!</span>
                </div>
                <p className="text-sm leading-relaxed">
                  Your beta access request is under review. We'll notify you at <strong>{betaEmail}</strong> once approved.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Typical review time: 24-48 hours
                </p>
              </div>
            ) : (
              <p className="text-gray-300 mb-4 text-sm leading-relaxed">
                Quick optimization tools are in beta. Request access to unlock instant model optimizations.
              </p>
            )}
            
            {betaRequestStatus !== 'pending' && (
              <div className="space-y-3 text-left">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    <Mail className="w-3 h-3 inline mr-1" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={betaEmail}
                    onChange={(e) => setBetaEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="horizon-input w-full text-sm"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">
                    <MessageCircle className="w-3 h-3 inline mr-1" />
                    Why do you need optimization tools?
                  </label>
                  <textarea
                    value={betaReason}
                    onChange={(e) => setBetaReason(e.target.value)}
                    placeholder="Tell us about your use case..."
                    className="horizon-input w-full h-16 resize-none text-sm"
                    required
                  />
                </div>
              </div>
            )}
            
            <div className="flex gap-2 mt-4">
              {betaRequestStatus === 'pending' ? (
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-3 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm"
                >
                  Check Status
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowBetaAccess(false)}
                    className="flex-1 px-3 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors text-sm"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleBetaAccessRequest}
                    disabled={isSubmittingBeta || !betaEmail.trim() || !betaReason.trim()}
                    className="flex-1 horizon-button-primary px-3 py-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                  >
                    {isSubmittingBeta ? (
                      <>
                        <Loader2 className="w-3 h-3 inline mr-1 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Request Access'
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Main Content - Made translucent when beta overlay is showing */}
      <div className={`space-y-4 transition-all duration-300 ${showBetaAccess ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
      {/* Header with management toggle */}
      <div className="flex items-center justify-between">
        <p className="text-gray-300 text-sm">
          {isEditing ? 'Manage your quick tools:' : 'Apply instant optimizations:'}
        </p>
        <button
          onClick={() => setIsEditing(!isEditing)}
          className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:cosmic-panel"
          title={isEditing ? 'Done editing' : 'Manage tools'}
        >
          {isEditing ? <Check className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
        </button>
      </div>

      {/* Tools Grid */}
      <div className="grid grid-cols-2 gap-3">
        {tools.map((tool) => (
          <div key={tool.id} className="relative group">
            <button
              onClick={() => !isEditing && onApplyTool(tool)}
              disabled={isProcessing || isEditing}
              className={`w-full px-4 py-3 ${tool.color} text-white rounded-lg hover:opacity-90 transition-all text-sm font-medium flex items-center gap-2 ${
                isProcessing || isEditing ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <span className="text-base">{tool.icon}</span>
              <span className="flex-1 text-left truncate">{tool.name}</span>
            </button>

            {/* Edit/Delete controls */}
            {isEditing && (
              <div className="absolute top-1 right-1 flex gap-1">
                <button
                  onClick={() => handleEditTool(tool)}
                  className="p-1 cosmic-panel text-gray-300 hover:text-white rounded transition-colors"
                  title="Edit tool"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
                {!tool.isDefault && (
                  <button
                    onClick={() => handleDeleteTool(tool.id)}
                    className="p-1 cosmic-panel text-red-400 hover:text-red-300 rounded transition-colors"
                    title="Delete tool"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Add new tool button */}
        {isEditing && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="px-4 py-3 border-2 border-dashed border-gray-600 text-gray-400 hover:text-white hover:border-gray-500 rounded-lg transition-all text-sm font-medium flex items-center gap-2 justify-center"
          >
            <Plus className="w-4 h-4" />
            Add Tool
          </button>
        )}
      </div>

      {/* Reset to defaults button */}
      {isEditing && (
        <button
          onClick={resetToDefaults}
          className="w-full px-4 py-2 cosmic-panel text-gray-400 hover:text-white rounded-lg transition-colors text-sm"
        >
          Reset to Defaults
        </button>
      )}

      {/* Export Section */}
      {!isEditing && model?.cadModel?.gltfUrl && (
        <div className="pt-4 border-t border-gray-600">
          <div className="flex items-center justify-between mb-3">
            <span className="text-gray-300 text-sm font-medium">Export Latest Model</span>
          </div>
          
          <div className="relative">
            <div className={`flex items-center horizon-button-primary rounded-lg overflow-hidden shadow-sm ${
              exportStatus === 'loading' ? 'animate-pulse' : ''
            } ${exportStatus === 'failed' ? 'from-red-500 to-red-600' : ''}`}>
              
              {/* Download Button */}
              <button
                disabled={exportStatus === 'loading'}
                className={`flex items-center gap-2 px-4 py-3 text-white text-sm font-medium transition-all flex-grow ${
                  exportStatus === 'loading' ? 'cursor-not-allowed opacity-70' : 'hover:bg-white/10'
                }`}
                onClick={() => handleExportDownload(currentFormat)}
              >
                {exportStatus === 'loading' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : exportStatus === 'failed' ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                
                <span>
                  {exportStatus === 'loading' 
                    ? 'Converting...' 
                    : exportStatus === 'failed' 
                    ? 'Try Again' 
                    : `${CADFormats[currentFormat].name}`}
                </span>
              </button>

              {/* Format Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setDropdownOpen(!dropdownOpen)}
                  disabled={exportStatus === 'loading'}
                  className={`flex items-center gap-1 px-3 py-3 text-white border-l border-white/20 transition-all ${
                    exportStatus === 'loading' ? 'cursor-not-allowed opacity-70' : 'hover:bg-white/10'
                  }`}
                >
                  <ChevronDown className={`w-4 h-4 transition-transform ${
                    dropdownOpen ? 'rotate-180' : ''
                  }`} />
                </button>
              </div>
            </div>

            {/* Hidden download link */}
            <a
              ref={downloadLinkRef}
              className="hidden"
              href="#"
              download=""
            >
              Download
            </a>

            {/* Click outside to close dropdown */}
            {dropdownOpen && (
              <div 
                className="fixed inset-0 z-[9998]" 
                onClick={() => setDropdownOpen(false)}
              />
            )}

            {/* Dropdown Menu */}
            {dropdownOpen && (
              <div className="absolute top-full right-0 mt-1 w-44 cosmic-panel border border-gray-600 rounded-lg shadow-xl z-[99999]">
                <div className="py-1">
                  {(Object.keys(CADFormats) as Array<keyof typeof CADFormats>).map((format) => (
                    <button
                      key={format}
                      onClick={() => handleFormatChange(format)}
                      className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                        currentFormat === format 
                          ? 'bg-cyan-500/20 text-cyan-300' 
                          : 'text-gray-300 hover:bg-white/10 hover:text-white'
                      }`}
                    >
                      <div className="font-medium">{CADFormats[format].name}</div>
                      <div className="text-xs text-gray-400">{CADFormats[format].description}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Create/Edit Tool Form */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-semibold">
                {editingTool ? 'Edit Tool' : 'Create New Tool'}
              </h3>
              <button
                onClick={handleCancelEdit}
                className="text-gray-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              {/* Tool Name */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Tool Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Make Lighter"
                  className="w-full p-3 cosmic-panel border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of what this tool does"
                  className="w-full p-3 cosmic-panel border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400"
                />
              </div>

              {/* Modification Prompt */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Modification Prompt *
                </label>
                <textarea
                  value={formData.prompt}
                  onChange={(e) => setFormData(prev => ({ ...prev, prompt: e.target.value }))}
                  placeholder="e.g., 'lighter with hollow interior and 2mm wall thickness'"
                  className="w-full h-20 p-3 cosmic-panel border border-gray-600 rounded-lg text-white placeholder-gray-400 resize-none focus:outline-none focus:border-cyan-400"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will be added to: "Design a [product] that is [your prompt]"
                </p>
              </div>

              {/* Icon Selection */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Icon
                </label>
                <div className="flex flex-wrap gap-2">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      onClick={() => setFormData(prev => ({ ...prev, icon }))}
                      className={`p-2 rounded-lg border-2 transition-colors ${
                        formData.icon === icon
                          ? 'border-cyan-400 bg-cyan-400/20'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    >
                      <span className="text-lg">{icon}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Color Selection */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-2">
                  Color
                </label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setFormData(prev => ({ ...prev, color }))}
                      className={`w-8 h-8 rounded-lg border-2 transition-colors ${color} ${
                        formData.color === color
                          ? 'border-white'
                          : 'border-gray-600 hover:border-gray-500'
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>

            {/* Form Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCancelEdit}
                className="flex-1 px-4 py-2 cosmic-panel text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={editingTool ? handleUpdateTool : handleCreateTool}
                disabled={!formData.name.trim() || !formData.prompt.trim()}
                className="flex-1 px-4 py-2 bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2 justify-center"
              >
                <Save className="w-4 h-4" />
                {editingTool ? 'Update' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}; 