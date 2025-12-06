import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  optimizationService, 
  OptimizationObjective, 
  OptimizationSuggestion,
  OptimizationResult,
  QUICK_OPTIMIZATIONS,
  QuickOptimizationAction,
  OptimizationContext
} from '../services/optimizationService';
import { ArchitecturalModel } from '../types/architectural';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Loader2, Zap, Package, DollarSign, Shield, Thermometer, Hand, Mail, MessageCircle, X, CheckCircle } from 'lucide-react';
import { useToast } from './ui/use-toast';
import ModelViewer3D from './ModelViewer3D';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';

interface OptimizationPanelProps {
  model: ArchitecturalModel;
  onOptimizationComplete: (result: OptimizationResult) => void;
  onModelUpdate: (model: ArchitecturalModel) => void;
}


const OptimizationPanel: React.FC<OptimizationPanelProps> = ({
  model,
  onOptimizationComplete,
  onModelUpdate
}) => {
  const { toast } = useToast();
  const { user, profile } = useAuth();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [showBetaAccess, setShowBetaAccess] = useState(false);
  const [betaEmail, setBetaEmail] = useState('');
  const [betaReason, setBetaReason] = useState('');
  const [isSubmittingBeta, setIsSubmittingBeta] = useState(false);
  const [betaRequestStatus, setBetaRequestStatus] = useState<'none' | 'pending' | 'approved' | 'rejected'>('none');
  const [analysis, setAnalysis] = useState<{
    properties: any;
    optimizationOpportunities: OptimizationSuggestion[];
    manufacturingReadiness: { fdm3dPrinting: number; cncMachining: number; injectionMolding: number };
  } | null>(null);
  const [suggestions, setSuggestions] = useState<OptimizationSuggestion[]>([]);
  const [optimizationResult, setOptimizationResult] = useState<OptimizationResult | null>(null);
  const [showComparison, setShowComparison] = useState(false);
  
  // Optimization objectives with sliders
  const [objectives, setObjectives] = useState<OptimizationObjective[]>([
    { type: 'reduce_weight', priority: 'medium' },
    { type: 'reduce_cost', priority: 'medium' },
    { type: 'improve_manufacturability', priority: 'medium' }
  ]);

  // Manufacturing context
  const [context, setContext] = useState<OptimizationContext>({
    manufacturingMethod: 'fdm_3d_printing'
  });

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

  useEffect(() => {
    if (model && !showBetaAccess) {
      analyzeModel();
    }
  }, [model, showBetaAccess]);

  const analyzeModel = async () => {
    setIsAnalyzing(true);
    try {
      const analysisResult = await optimizationService.analyzeModelForOptimization(model);
      setAnalysis(analysisResult);
      
      // Generate initial suggestions
      const suggestionsResult = await optimizationService.generateOptimizationSuggestions(
        model,
        objectives,
        [{ type: 'manufacturing_method', value: context.manufacturingMethod }]
      );
      setSuggestions(suggestionsResult);
    } catch (error) {
      console.error('Analysis failed:', error);
      toast({
        title: 'Analysis Failed',
        description: 'Could not analyze model for optimization',
        variant: 'destructive'
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyQuickOptimization = async (optimization: QuickOptimizationAction) => {
    setIsOptimizing(true);
    try {
      const result = await optimizationService.applyQuickOptimization(
        model,
        optimization,
        context
      );
      
      setOptimizationResult(result);
      setShowComparison(true);
      onOptimizationComplete(result);
      
      toast({
        title: 'Optimization Applied',
        description: `Successfully applied: ${optimization.label}`,
      });
    } catch (error) {
      console.error('Optimization failed:', error);
      toast({
        title: 'Optimization Failed',
        description: error.message || 'Could not apply optimization',
        variant: 'destructive'
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const applySuggestion = async (suggestion: OptimizationSuggestion) => {
    setIsOptimizing(true);
    try {
      // Create a quick optimization from the suggestion
      const quickOpt: QuickOptimizationAction = {
        id: suggestion.id,
        label: suggestion.title,
        icon: '🚀',
        category: suggestion.category as any,
        prompt: suggestion.prompt,
        description: suggestion.description
      };
      
      const result = await optimizationService.applyQuickOptimization(
        model,
        quickOpt,
        context
      );
      
      setOptimizationResult(result);
      setShowComparison(true);
      onOptimizationComplete(result);
      
      toast({
        title: 'Suggestion Applied',
        description: `Successfully applied: ${suggestion.title}`,
      });
    } catch (error) {
      console.error('Suggestion application failed:', error);
      toast({
        title: 'Application Failed',
        description: 'Could not apply suggestion',
        variant: 'destructive'
      });
    } finally {
      setIsOptimizing(false);
    }
  };

  const updateObjectivePriority = (type: OptimizationObjective['type'], priority: number) => {
    const priorityMap = ['low', 'medium', 'high'] as const;
    setObjectives(prev => prev.map(obj => 
      obj.type === type 
        ? { ...obj, priority: priorityMap[Math.floor(priority)] }
        : obj
    ));
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'performance': return <Zap className="w-4 h-4" />;
      case 'manufacturing': return <Package className="w-4 h-4" />;
      case 'cost': return <DollarSign className="w-4 h-4" />;
      case 'strength': return <Shield className="w-4 h-4" />;
      case 'thermal': return <Thermometer className="w-4 h-4" />;
      case 'ergonomics': return <Hand className="w-4 h-4" />;
      default: return <Zap className="w-4 h-4" />;
    }
  };

  const getImpactColor = (value: number) => {
    if (value >= 50) return 'text-green-600';
    if (value >= 25) return 'text-yellow-600';
    return 'text-gray-600';
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
      
      // Don't auto-approve - admin must approve in Supabase
      // setShowBetaAccess(false);
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
    <div className="relative space-y-6">
      {/* Beta Access Overlay */}
      {showBetaAccess && (
        <div className="absolute inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="cosmic-panel max-w-md w-full mx-4 p-8 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-r from-purple-400 to-pink-400 rounded-full flex items-center justify-center">
              <Zap className="w-10 h-10 text-white" />
            </div>
            
            <h2 className="text-2xl font-bold text-white mb-4">
              {betaRequestStatus === 'pending' ? '⏳ Beta Access Pending' : '🚀 Optimization Panel - Beta Access'}
            </h2>
            
            {betaRequestStatus === 'pending' ? (
              <div className="text-gray-300 mb-6">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <span className="text-lg">Request Submitted Successfully!</span>
                </div>
                <p className="leading-relaxed">
                  Your beta access request is under review. We'll notify you at <strong>{betaEmail}</strong> once your access is approved.
                </p>
                <p className="text-sm text-gray-400 mt-3">
                  Typical review time: 24-48 hours
                </p>
              </div>
            ) : (
              <p className="text-gray-300 mb-6 leading-relaxed">
                Advanced AI-powered model optimization is currently in beta. Request access to unlock powerful features like weight reduction, cost optimization, and manufacturing improvements.
              </p>
            )}
            
            {betaRequestStatus !== 'pending' && (
              <div className="space-y-4 text-left">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <Mail className="w-4 h-4 inline mr-2" />
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={betaEmail}
                    onChange={(e) => setBetaEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    className="horizon-input w-full"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <MessageCircle className="w-4 h-4 inline mr-2" />
                    Why do you need optimization features?
                  </label>
                  <textarea
                    value={betaReason}
                    onChange={(e) => setBetaReason(e.target.value)}
                    placeholder="Tell us about your use case, project requirements, or specific optimization goals..."
                    className="horizon-input w-full h-24 resize-none"
                    required
                  />
                </div>
              </div>
            )}
            
            <div className="flex gap-3 mt-6">
              {betaRequestStatus === 'pending' ? (
                <button
                  onClick={() => window.location.reload()}
                  className="w-full px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Check Status
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setShowBetaAccess(false)}
                    className="flex-1 px-4 py-2 border border-gray-600 text-gray-300 rounded-lg hover:bg-gray-800 transition-colors"
                  >
                    <X className="w-4 h-4 inline mr-2" />
                    Cancel
                  </button>
                  <button
                    onClick={handleBetaAccessRequest}
                    disabled={isSubmittingBeta || !betaEmail.trim() || !betaReason.trim()}
                    className="flex-1 horizon-button-primary px-4 py-2 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSubmittingBeta ? (
                      <>
                        <Loader2 className="w-4 h-4 inline mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      'Request Beta Access'
                    )}
                  </button>
                </>
              )}
            </div>
            
            <p className="text-xs text-gray-400 mt-4">
              We'll review your request and notify you once beta access is granted.
            </p>
          </div>
        </div>
      )}
      
      {/* Main Content - Made translucent when beta overlay is showing */}
      <div className={`transition-all duration-300 ${showBetaAccess ? 'opacity-30 pointer-events-none' : 'opacity-100'}`}>
      {/* Manufacturing Context Selector */}
      <Card className="p-4">
        <h3 className="text-lg font-semibold mb-3">Manufacturing Method</h3>
        <select
          value={context.manufacturingMethod}
          onChange={(e) => setContext({ ...context, manufacturingMethod: e.target.value as any })}
          className="w-full p-2 border rounded-md"
        >
          <option value="fdm_3d_printing">FDM 3D Printing</option>
          <option value="sla_3d_printing">SLA 3D Printing</option>
          <option value="cnc_machining">CNC Machining</option>
          <option value="injection_molding">Injection Molding</option>
          <option value="sheet_metal">Sheet Metal</option>
        </select>
      </Card>

      <Tabs defaultValue="quick" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="quick">Quick Actions</TabsTrigger>
          <TabsTrigger value="objectives">Multi-Objective</TabsTrigger>
          <TabsTrigger value="suggestions">AI Suggestions</TabsTrigger>
        </TabsList>

        {/* Quick Actions Tab */}
        <TabsContent value="quick" className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            {QUICK_OPTIMIZATIONS.map((optimization) => (
              <motion.div
                key={optimization.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <Card
                  className="p-4 cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => !isOptimizing && applyQuickOptimization(optimization)}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">{optimization.icon}</div>
                    <div className="flex-1">
                      <h4 className="font-semibold flex items-center gap-2">
                        {optimization.label}
                        {getCategoryIcon(optimization.category)}
                      </h4>
                      <p className="text-sm text-gray-600 mt-1">
                        {optimization.description}
                      </p>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </TabsContent>

        {/* Multi-Objective Optimization Tab */}
        <TabsContent value="objectives" className="space-y-4">
          <Card className="p-4">
            <h3 className="text-lg font-semibold mb-4">Optimization Priorities</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">Weight Reduction</label>
                  <span className="text-sm text-gray-600">
                    {objectives.find(o => o.type === 'reduce_weight')?.priority}
                  </span>
                </div>
                <Slider
                  value={[objectives.find(o => o.type === 'reduce_weight')?.priority === 'high' ? 2 : 
                         objectives.find(o => o.type === 'reduce_weight')?.priority === 'medium' ? 1 : 0]}
                  onValueChange={(value) => updateObjectivePriority('reduce_weight', value[0])}
                  max={2}
                  step={1}
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">Cost Reduction</label>
                  <span className="text-sm text-gray-600">
                    {objectives.find(o => o.type === 'reduce_cost')?.priority}
                  </span>
                </div>
                <Slider
                  value={[objectives.find(o => o.type === 'reduce_cost')?.priority === 'high' ? 2 : 
                         objectives.find(o => o.type === 'reduce_cost')?.priority === 'medium' ? 1 : 0]}
                  onValueChange={(value) => updateObjectivePriority('reduce_cost', value[0])}
                  max={2}
                  step={1}
                />
              </div>

              <div>
                <div className="flex justify-between mb-2">
                  <label className="text-sm font-medium">Manufacturability</label>
                  <span className="text-sm text-gray-600">
                    {objectives.find(o => o.type === 'improve_manufacturability')?.priority}
                  </span>
                </div>
                <Slider
                  value={[objectives.find(o => o.type === 'improve_manufacturability')?.priority === 'high' ? 2 : 
                         objectives.find(o => o.type === 'improve_manufacturability')?.priority === 'medium' ? 1 : 0]}
                  onValueChange={(value) => updateObjectivePriority('improve_manufacturability', value[0])}
                  max={2}
                  step={1}
                />
              </div>
            </div>

            <Button
              className="w-full mt-4"
              onClick={analyzeModel}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                'Generate Optimized Design'
              )}
            </Button>
          </Card>
        </TabsContent>

        {/* AI Suggestions Tab */}
        <TabsContent value="suggestions" className="space-y-4">
          {isAnalyzing ? (
            <div className="flex items-center justify-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : suggestions.length > 0 ? (
            <div className="space-y-3">
              {suggestions.map((suggestion) => (
                <Card key={suggestion.id} className="p-4">
                  <div className="flex justify-between items-start mb-2">
                    <h4 className="font-semibold">{suggestion.title}</h4>
                    <Badge variant="outline">
                      {Math.round(suggestion.confidence * 100)}% confidence
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mb-3">{suggestion.description}</p>
                  
                  {/* Expected Impact */}
                  <div className="flex gap-4 mb-3">
                    {suggestion.expectedImpact.weightReduction && (
                      <div className={`text-sm ${getImpactColor(suggestion.expectedImpact.weightReduction)}`}>
                        ↓ {suggestion.expectedImpact.weightReduction}% weight
                      </div>
                    )}
                    {suggestion.expectedImpact.costSavings && (
                      <div className={`text-sm ${getImpactColor(suggestion.expectedImpact.costSavings)}`}>
                        ↓ {suggestion.expectedImpact.costSavings}% cost
                      </div>
                    )}
                  </div>

                  <Button
                    size="sm"
                    onClick={() => applySuggestion(suggestion)}
                    disabled={isOptimizing}
                  >
                    Apply Suggestion
                  </Button>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center text-gray-500">
              <p>No suggestions available. Try adjusting your optimization priorities.</p>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* Optimization Result Comparison */}
      {showComparison && optimizationResult && (
        <Card className="p-6">
          <h3 className="text-lg font-semibold mb-4">Optimization Results</h3>
          
          {/* Metrics Comparison */}
          <div className="grid grid-cols-4 gap-4 mb-6">
            <div className="text-center">
              <p className="text-sm text-gray-600">Weight Reduction</p>
              <p className="text-2xl font-bold text-green-600">
                {optimizationResult.improvements.weightReduction.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Cost Savings</p>
              <p className="text-2xl font-bold text-green-600">
                {optimizationResult.improvements.costSavings.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Strength</p>
              <p className="text-2xl font-bold text-blue-600">
                {optimizationResult.improvements.strengthChange >= 0 ? '+' : ''}
                {optimizationResult.improvements.strengthChange.toFixed(1)}%
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-600">Manufacturability</p>
              <p className="text-2xl font-bold text-purple-600">
                {(optimizationResult.improvements.manufacturabilityScore * 100).toFixed(0)}%
              </p>
            </div>
          </div>

          {/* Visual Comparison */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Original Model</h4>
              <div className="h-64 bg-gray-100 rounded-lg overflow-hidden">
                <ModelViewer3D model={optimizationResult.originalModel} />
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-2">Optimized Model</h4>
              <div className="h-64 bg-gray-100 rounded-lg overflow-hidden">
                <ModelViewer3D model={optimizationResult.optimizedModel} />
              </div>
            </div>
          </div>

          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => onModelUpdate(optimizationResult.optimizedModel)}
              className="flex-1"
            >
              Use Optimized Model
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowComparison(false)}
              className="flex-1"
            >
              Continue Optimizing
            </Button>
          </div>
        </Card>
      )}

      {/* Loading Overlay */}
      {isOptimizing && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="p-6 max-w-sm">
            <div className="flex flex-col items-center">
              <Loader2 className="h-12 w-12 animate-spin mb-4" />
              <p className="text-lg font-semibold">Optimizing your design...</p>
              <p className="text-sm text-gray-600 mt-2">This may take a few moments</p>
            </div>
          </Card>
        </div>
      )}
      </div>
    </div>
  );
};

export default OptimizationPanel;