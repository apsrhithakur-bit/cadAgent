import React, { useState, useEffect } from 'react';
import { Search, FileText, ExternalLink, Shield, AlertTriangle, CheckCircle, Crown, Lock } from 'lucide-react';
import { ArchitecturalModel } from '../../types/architectural';
import { searchPatents, analyzePatentRisk, PatentResult, PatentAnalysis, clearAllPatentCache, debugSerpApiResponse } from '../../services/patentSearch';
import { useUsage } from '../../hooks/useUsage';
import { useAuth } from '../../hooks/useAuth';
import { getModelProductName, extractProductName } from '../../utils/productNameExtractor';
import UpgradePrompt from '../UpgradePrompt';
import { supabase } from '../../lib/supabase';

interface PatentSearchProps {
  model: ArchitecturalModel | null;
  onNext: () => void;
  onPrevious: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

const PatentSearch: React.FC<PatentSearchProps> = ({ model, onNext }) => {
  const { profile, refreshProfile } = useAuth();
  const { usage, canUsePatentSearch, incrementPatentSearchUsage, getUsageLimits, refreshUsage } = useUsage();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PatentResult[]>([]);
  const [analysis, setAnalysis] = useState<PatentAnalysis | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);

  // Generate unique cache key for this model's patent search
  const getCacheKey = () => {
    const modelId = model?.id || model?.name || model?.cadModel?.id || 'default';
    return `patent_search_${modelId.replace(/[^a-zA-Z0-9]/g, '_')}`;
  };

  // Save search results to localStorage
  const saveSearchResults = (query: string, results: PatentResult[], analysis: PatentAnalysis | null) => {
    try {
      const cacheData = {
        searchQuery: query,
        searchResults: results,
        analysis: analysis,
        hasSearched: true,
        timestamp: Date.now(),
        modelContext: {
          name: model?.name,
          productName: model?.productSpecs?.name,
          cadPrompt: model?.cadModel?.prompt || model?.cadModel?.originalPrompt
        }
      };
      
      localStorage.setItem(getCacheKey(), JSON.stringify(cacheData));
      console.log('💾 Patent search results saved to cache');
    } catch (error) {
      console.warn('⚠️ Failed to save patent search results:', error);
    }
  };

  // Load search results from localStorage
  const loadSearchResults = () => {
    try {
      const cached = localStorage.getItem(getCacheKey());
      if (cached) {
        const cacheData = JSON.parse(cached);
        
        // Check if cache is not too old (24 hours)
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours
        if (Date.now() - cacheData.timestamp < maxAge) {
          console.log('📂 Restoring patent search results from cache');
          
          setSearchQuery(cacheData.searchQuery || '');
          setSearchResults(cacheData.searchResults || []);
          setAnalysis(cacheData.analysis);
          setHasSearched(cacheData.hasSearched || false);
          
          return true;
        } else {
          console.log('🗑️ Patent search cache expired, clearing...');
          localStorage.removeItem(getCacheKey());
        }
      }
    } catch (error) {
      console.warn('⚠️ Failed to load patent search results:', error);
      localStorage.removeItem(getCacheKey());
    }
    return false;
  };

  // Load cached results on component mount
  useEffect(() => {
    if (model) {
      loadSearchResults();
    }
  }, [model]);

  // Handle successful purchase return from Stripe
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const purchaseStatus = urlParams.get('purchase');
    
    if (purchaseStatus === 'success') {
      console.log('🎉 Purchase successful! Refreshing profile and usage data...');
      setPurchaseSuccess(true);
      
      // Refresh both profile data (for extra_patent_searches) and usage data
      const refreshData = async () => {
        await refreshProfile(); // Get updated profile with extra_patent_searches
        await refreshUsage();   // Get latest usage data
        console.log('✅ Profile and usage data refreshed after purchase');
      };
      
      refreshData();
      
      // Clear the URL parameter
      const newUrl = window.location.pathname + window.location.search.replace(/[?&]purchase=success/, '');
      window.history.replaceState(null, '', newUrl);
      
      // Hide success message after 5 seconds
      setTimeout(() => {
        setPurchaseSuccess(false);
      }, 5000);
    } else if (purchaseStatus === 'cancelled') {
      console.log('❌ Purchase was cancelled');
      // Clear the URL parameter
      const newUrl = window.location.pathname + window.location.search.replace(/[?&]purchase=cancelled/, '');
      window.history.replaceState(null, '', newUrl);
    }
  }, [refreshProfile, refreshUsage]);

  // Clear patent search cache utility
  const clearPatentCache = async () => {
    try {
      console.log('🗑️ Clearing all patent caches...');
      await clearAllPatentCache();
      console.log('✅ All patent search caches cleared');
    } catch (error) {
      console.error('❌ Error clearing cache:', error);
    }
  };

  // Clear all caches including model data
  const clearAllPatentCache = () => {
    try {
      // Clear all types of caches
      Object.keys(localStorage).forEach(key => {
        if (key.includes('cache') || key.includes('patent') || key.includes('model')) {
          localStorage.removeItem(key);
          console.log('🗑️ Cleared cache key:', key);
        }
      });
      console.log('✅ All patent caches cleared');
    } catch (error) {
      console.error('❌ Error clearing all caches:', error);
    }
  };

  // Force fresh model generation by clearing all caches
  const forceResetModel = () => {
    try {
      // Clear all localStorage caches
      Object.keys(localStorage).forEach(key => {
        if (key.includes('cache') || key.includes('patent') || key.includes('model') || key.includes('cad')) {
          localStorage.removeItem(key);
          console.log('🗑️ Cleared cache key:', key);
        }
      });
      
      // Force refresh by reloading the page
      console.log('🔄 Forcing page refresh to clear all state...');
      window.location.reload();
    } catch (error) {
      console.error('❌ Error during reset:', error);
    }
  };

  // Handle purchasing extra patent searches
  const handlePurchaseExtraSearches = async () => {
    setIsPurchasing(true);
    try {
      console.log('💳 Initiating purchase of 10 extra patent searches...');
      
      // Check if user is authenticated
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.error('❌ User not authenticated');
        alert('Please log in to purchase additional searches.');
        return;
      }
      
      console.log('✅ User authenticated:', user.id);
      
      // Call Supabase function to create Stripe checkout session
      const { data, error } = await supabase.functions.invoke('stripe-checkout', {
        body: {
          type: 'extra_patent_searches',
          quantity: 10,
          priceId: 'price_1RkpSlHo63JmGM47wMp16yTw', // LIVE: 10 extra patent searches for $10
        }
      });

      console.log('📝 Stripe checkout response:', { data, error });

      if (error) {
        console.error('❌ Error creating checkout session:', error);
        console.error('❌ Error details:', error.message, error.details);
        alert(`Unable to process payment: ${error.message || 'Please try again.'}`);
        return;
      }

      if (data?.url) {
        console.log('✅ Redirecting to Stripe checkout:', data.url);
        window.location.href = data.url;
      } else {
        console.error('❌ No checkout URL received:', data);
        alert('Unable to process payment. Please try again.');
      }
    } catch (error) {
      console.error('❌ Purchase error:', error);
      alert('Unable to process payment. Please try again.');
    } finally {
      setIsPurchasing(false);
    }
  };

  // Set initial search query based on the actual product data
  useEffect(() => {
    console.log('🔍 PatentSearch useEffect triggered with model:', model?.name);
    
    if (model) {
      // COMPREHENSIVE: Use actual product name + key technical differentiators
      
      // 1. Get the original user input (the actual thing they asked for)
      const originalUserInput = model.cadModel?.originalPrompt || model.cadModel?.prompt || model.description;
      
      console.log('🎯 Original user input:', originalUserInput);
      
      // 2. Extract the ACTUAL product name from the original prompt - keep it simple and clean
      let actualProductName = '';
      
      if (originalUserInput) {
        // Try to extract the product name after common prefixes like "design a", "create a", etc.
        const productMatches = [
          // "design a robot arm gripper" → "robot arm gripper"
          /(?:design|create|make|build)\s+(?:a|an)?\s*([^,.\n\r]+?)(?:\s+(?:that|with|for|using|made|which)|$)/i,
          // "robot arm gripper" (if no prefix)
          /^([^,.\n\r]+?)(?:\s+(?:that|with|for|using|made|which)|$)/i
        ];
        
        for (const regex of productMatches) {
          const match = originalUserInput.match(regex);
          if (match && match[1]) {
            actualProductName = match[1].trim();
            // Clean up common noise words but keep the core product name intact
            actualProductName = actualProductName
              .replace(/^(the|an?|some|my)\s+/i, '') // Remove articles
              .replace(/\s+/g, ' ') // Normalize spaces
              .trim();
            
            if (actualProductName.length > 2) {
              break; // Found a good match
            }
          }
        }
      }
      
      // 3. Fallback to model name if extraction fails
      if (!actualProductName || actualProductName.length < 3) {
        // Try the model name but clean it up
        actualProductName = (model.name || model.productSpecs?.name || 'product')
          .replace(/^(design|create|make|build)\s+(?:a|an)?\s*/i, '')
          .replace(/^(the|an?|some|my)\s+/i, '')
          .trim();
      }
      
      console.log('🎯 Extracted actual product name:', actualProductName);
      
      // 4. Extract key technical differentiators that make this product unique
      const technicalKeywords = [];
      
      if (model.productSpecs) {
        // Add specific key features that differentiate this product
        if (model.productSpecs.keyFeatures) {
          technicalKeywords.push(...model.productSpecs.keyFeatures
            .filter(f => f.length > 5 && !f.toLowerCase().includes('general'))
            .slice(0, 2)); // Take top 2 specific features
        }
        
        // Add specific materials (these are key differentiators)
        if (model.productSpecs.manufacturing?.materials) {
          model.productSpecs.manufacturing.materials.forEach(material => {
            if (material && !['plastic', 'metal', 'material', 'resin'].includes(material.toLowerCase())) {
              technicalKeywords.push(material);
            }
          });
        }
        
        // Add specific manufacturing method (key differentiator)
        if (model.productSpecs.manufacturing?.method && 
            !['injection molding', '3d printing', 'machining', 'fabrication'].includes(model.productSpecs.manufacturing.method.toLowerCase())) {
          technicalKeywords.push(model.productSpecs.manufacturing.method);
        }
      }
      
      // 5. Build comprehensive search query: actual product name + technical differentiators
      let searchQuery = actualProductName;
      
      // Add technical differentiators that make this product unique
      if (technicalKeywords.length > 0) {
        const uniqueKeywords = [...new Set(technicalKeywords)]; // Remove duplicates
        searchQuery += ' ' + uniqueKeywords.join(' ');
      }
      
      // 6. Final cleanup - keep it natural and focused
      searchQuery = searchQuery
        .replace(/\s+/g, ' ') // Normalize spaces
        .replace(/['"]/g, '') // Remove quotes that confuse patent search
        .replace(/\//g, ' ') // Replace slashes with spaces for better matching
        .trim();
      
      // Ensure query isn't empty or too short
      if (searchQuery.length < 3) {
        searchQuery = actualProductName || 'invention device';
      }
      
      // Limit length for patent search efficiency
      if (searchQuery.length > 120) {
        searchQuery = searchQuery.substring(0, 120).trim();
      }
      
      console.log('🔍 COMPREHENSIVE patent search query (actual name + technical details):', {
        originalInput: originalUserInput,
        extractedProductName: actualProductName,
        technicalKeywords: technicalKeywords,
        finalSearchQuery: searchQuery,
        reasoning: 'Using actual product name + key technical differentiators for precise patent search'
      });
    
      setSearchQuery(searchQuery);
    }
  }, [model]);

  // Get usage limits for display
  const limits = profile ? getUsageLimits(profile) : null;
  const patentSearchesUsed = usage?.patent_searches_used || 0;

  const handleSearch = async () => {
    // Check usage limits first
    if (!canUsePatentSearch()) {
      setShowUpgradePrompt(true);
      return;
    }

    setIsSearching(true);
    setHasSearched(false);
    setSearchResults([]);
    setAnalysis(null);
    
    try {
      console.log('🔍 Starting patent search for:', searchQuery);
      
      // Increment usage
      const usageSuccess = await incrementPatentSearchUsage();
      if (!usageSuccess) {
        setShowUpgradePrompt(true);
        setIsSearching(false);
        return;
      }

      // Perform patent search
      const results = await searchPatents({
        query: searchQuery,
        country: 'US',
        limit: 10
      });

      console.log('✅ Patent search completed:', results.length, 'results');
      
      // Debug: Log first result to check inventor/assignee data
      if (results.length > 0) {
        console.log('🔍 Frontend received patent data:', {
          patentNumber: results[0].patentNumber,
          title: results[0].title,
          inventor: results[0].inventor,
          assignee: results[0].assignee,
          similarity: results[0].similarity
        });
      }
      
      setSearchResults(results);

      // Generate analysis if we have results
      let finalAnalysis = null;
      if (results.length > 0) {
        console.log('🤖 Analyzing patent risk...');
        const riskAnalysis = await analyzePatentRisk(results, searchQuery);
        setAnalysis(riskAnalysis);
        finalAnalysis = riskAnalysis;
      }

      setHasSearched(true);
      
      // Save results to cache after all processing is complete
      saveSearchResults(searchQuery, results, finalAnalysis);
    } catch (error) {
      console.error('❌ Error during patent search:', error);
      setSearchResults([]);
      setAnalysis(null);
      setHasSearched(true);
      
      // Save error state to cache so user doesn't lose the "searched" status
      saveSearchResults(searchQuery, [], null);
    } finally {
      setIsSearching(false);
    }
  };

  // Clear cached search results (for starting fresh)
  const clearSearchResults = () => {
    try {
      localStorage.removeItem(getCacheKey());
      setSearchQuery('');
      setSearchResults([]);
      setAnalysis(null);
      setHasSearched(false);
      console.log('🗑️ Patent search results cleared');
    } catch (error) {
      console.warn('⚠️ Failed to clear patent search results:', error);
    }
  };

  const handleUpgradeClose = () => {
    setShowUpgradePrompt(false);
  };

  const handleUpgradeClick = () => {
    setShowUpgradePrompt(false);
    window.dispatchEvent(new CustomEvent('openSubscriptionModal'));
  };

  const getSimilarityColor = (similarity: number) => {
    if (similarity >= 80) return 'text-red-400';
    if (similarity >= 60) return 'text-yellow-400';
    return 'text-green-400';
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Purchase Success Message */}
      {purchaseSuccess && (
        <div className="mb-6 p-4 bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-500/30 rounded-2xl">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-6 h-6 text-green-400" />
            <div>
              <h4 className="text-lg font-bold text-green-400">Purchase Successful! 🎉</h4>
              <p className="text-green-300">Your additional patent searches have been added to your account. You can now continue searching!</p>
            </div>
          </div>
        </div>
      )}

      {/* Search Header */}
      <div className="horizon-card rounded-2xl p-8 mb-8">
        <div className="flex items-center gap-3 mb-6">
          <Shield className="w-8 h-8 text-cyan-400" />
          <h3 className="text-2xl font-bold text-white">Patent Search & Analysis</h3>
        </div>
        
        <p className="text-gray-300 text-lg mb-4 leading-relaxed">
          Ensure your {model?.productSpecs?.name || model?.name || 'product'} design is unique and doesn't infringe on existing patents. 
          Our AI-powered search analyzes your design against millions of patents worldwide.
        </p>

        {/* Usage Indicator */}
        {limits && (
          <div className="flex items-center gap-4 mb-6 p-4 bg-white/10 rounded-lg">
            <div className="flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              <span className="text-white font-medium">Patent Searches:</span>
              <span className={`font-bold ${
                patentSearchesUsed >= limits.patent_searches ? 'text-red-400' : 'text-cyan-400'
              }`}>
                {patentSearchesUsed}/{limits.patent_searches}
              </span>
            </div>
            {patentSearchesUsed >= limits.patent_searches && (
              <div className="flex items-center gap-2 text-yellow-400">
                <Lock className="w-4 h-4" />
                <span className="text-sm">Limit reached - upgrade to continue</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Describe your invention for patent search..."
              className="w-full px-4 py-3 horizon-input rounded-xl text-white placeholder-gray-400 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/20 transition-all duration-300"
            />
          </div>
          
          {/* Show different UI based on whether user can search */}
          {canUsePatentSearch() ? (
          <button
            onClick={handleSearch}
              disabled={isSearching || !searchQuery.trim()}
            className={`px-8 py-3 rounded-xl font-semibold transition-all duration-300 ${
                searchQuery.trim() && !isSearching
                ? 'horizon-button-primary text-white'
                : 'bg-gray-600 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isSearching ? (
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Searching...
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Search className="w-5 h-5" />
                Search Patents
              </div>
            )}
          </button>
          ) : (
            /* User has hit their limit - show both upgrade options */
            <div className="flex flex-col gap-3 min-w-[280px]">
              <button
                onClick={handleUpgradeClick}
                className="px-6 py-3 bg-gradient-to-r from-yellow-500 to-orange-500 text-white font-semibold rounded-xl hover:from-yellow-600 hover:to-orange-600 transition-all duration-300 flex items-center justify-center gap-2"
              >
                <Crown className="w-5 h-5" />
                Upgrade Plan
              </button>
              
              <div className="text-center text-gray-400 text-sm">or</div>
              
              <button
                onClick={handlePurchaseExtraSearches}
                disabled={isPurchasing}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white font-semibold rounded-xl hover:from-green-600 hover:to-emerald-600 transition-all duration-300 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isPurchasing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    Processing...
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    Buy More Searches ($10 each)
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* Enhanced Debug Panel - Show source information */}
        {/* Temporarily commented out for production
        {import.meta.env.DEV && (
          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <h4 className="text-blue-400 font-bold mb-3">📊 Patent Source Information (Dev Only)</h4>
            <div className="space-y-2 text-sm text-gray-300">
              <div><strong>Search Query:</strong> {searchQuery}</div>
              <div><strong>Results Found:</strong> {searchResults.length}</div>
              {searchResults.length > 0 && (
                <div>
                  <strong>Sources Used:</strong>
                  <div className="ml-4 mt-1">
                    {Array.from(new Set(searchResults.map(r => r.source))).map(source => (
                      <div key={source} className="flex items-center gap-2">
                        <span className={`w-3 h-3 rounded-full ${
                          source === 'uspto' ? 'bg-green-400' : 
                          source === 'google' ? 'bg-blue-400' : 'bg-yellow-400'
                        }`}></span>
                        <span>{source.toUpperCase()}: {searchResults.filter(r => r.source === source).length} patents</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div><strong>Model Data:</strong></div>
              <div className="text-xs bg-black/20 p-2 rounded">
                <div>Original Input: {model?.cadModel?.originalPrompt || 'None'}</div>
                <div>Product Name: {model?.productSpecs?.name || 'None'}</div>
                <div>Generated Query: {searchQuery}</div>
              </div>
            </div>
          </div>
        )}
        */}

        {/* Debug Panel - Show in development */}
        {/* Temporarily commented out for production
        {import.meta.env.DEV && (
          <div className="mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <h4 className="text-red-400 font-bold mb-3">🐛 Debug Panel (Dev Only)</h4>
            <div className="space-y-2 text-sm">
              <div className="flex gap-2">
                <button
                  onClick={clearPatentCache}
                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                >
                  Clear Patent Cache
                </button>
                <button
                  onClick={clearAllPatentCache}
                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                >
                  Clear All Caches
                </button>
                <button
                  onClick={forceResetModel}
                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                >
                  Force Model Reset
                </button>
                <button
                  onClick={() => {
                    console.log('🔍 localStorage keys:', Object.keys(localStorage).filter(k => k.includes('patent') || k.includes('cache')));
                    console.log('🔍 Current search query:', searchQuery);
                  }}
                  className="px-3 py-1 bg-yellow-500/20 text-yellow-400 rounded hover:bg-yellow-500/30 transition-colors"
                >
                  Log Cache Keys
                </button>
                <button
                  onClick={async () => {
                    console.log('🔄 Refreshing profile and usage data...');
                    await refreshProfile();
                    await refreshUsage();
                    console.log('✅ Profile and usage data refreshed');
                  }}
                  className="px-3 py-1 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30 transition-colors"
                >
                  Refresh Profile Data
                </button>
                <button
                  onClick={async () => {
                    console.log('🔍 Checking profile in database...');
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        const { data: profile, error } = await supabase
                          .from('user_profiles')
                          .select('*')
                          .eq('id', user.id)
                          .single();
                        
                        console.log('📊 Database profile:', profile);
                        console.log('❌ Profile error:', error);
                        
                        if (profile) {
                          alert(`Profile Data:\nTier: ${profile.subscription_tier}\nExtra Searches: ${profile.extra_patent_searches}\nUpdated: ${profile.updated_at}`);
                        }
                      }
                    } catch (error) {
                      console.error('❌ Database check failed:', error);
                    }
                  }}
                  className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30 transition-colors"
                >
                  Check Database Profile
                </button>
                <button
                  onClick={async () => {
                    console.log('🔧 MANUALLY adding 10 extra patent searches...');
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        // Get current profile
                        const { data: currentProfile } = await supabase
                          .from('user_profiles')
                          .select('extra_patent_searches')
                          .eq('id', user.id)
                          .single();
                        
                        const currentExtra = currentProfile?.extra_patent_searches || 0;
                        const newExtra = currentExtra + 10;
                        
                        // Update with additional searches
                        const { data: updatedProfile, error } = await supabase
                          .from('user_profiles')
                          .update({
                            extra_patent_searches: newExtra,
                            updated_at: new Date().toISOString()
                          })
                          .eq('id', user.id)
                          .select()
                          .single();
                        
                        if (error) {
                          console.error('❌ Manual update failed:', error);
                          alert(`Update failed: ${error.message}`);
                        } else {
                          console.log('✅ Manual update successful:', updatedProfile);
                          alert(`✅ Added 10 extra searches!\nBefore: ${currentExtra}\nAfter: ${newExtra}`);
                          
                          // Force refresh the UI with multiple attempts
                          console.log('🔄 Forcing UI refresh...');
                          
                          // Refresh profile first
                          await refreshProfile();
                          console.log('✅ Profile refreshed');
                          
                          // Wait a bit then refresh usage
                          setTimeout(async () => {
                            await refreshUsage();
                            console.log('✅ Usage refreshed');
                            
                            // Force component re-render by triggering state update
                            console.log('✅ Data refreshed - check your limits above!');
                          }, 1000);
                        }
                      }
                    } catch (error: any) {
                      console.error('❌ Manual update error:', error);
                      alert(`Error: ${error.message || error}`);
                    }
                  }}
                  className="px-3 py-1 bg-orange-500/20 text-orange-400 rounded hover:bg-orange-500/30 transition-colors"
                >
                  🔧 Add 10 Extra Searches (Manual)
                </button>
                <button
                  onClick={async () => {
                    console.log('🚀 Using Edge Function with service role...');
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        // Call our manual Edge Function with service role permissions
                        const { data, error } = await supabase.functions.invoke('manual-add-patent-searches', {
                          body: {
                            userId: user.id,
                            extraSearches: 10
                          }
                        });
                        
                        if (error) {
                          console.error('❌ Edge Function failed:', error);
                          alert(`Edge Function Error: ${error.message}`);
                        } else {
                          console.log('✅ Edge Function success:', data);
                          alert(`✅ Edge Function Success!\n${JSON.stringify(data, null, 2)}`);
                          
                          // Refresh the UI
                          await refreshProfile();
                          await refreshUsage();
                        }
                      }
                    } catch (error: any) {
                      console.error('❌ Edge Function error:', error);
                      alert(`Error: ${error.message || error}`);
                    }
                  }}
                  className="px-3 py-1 bg-purple-500/20 text-purple-400 rounded hover:bg-purple-500/30 transition-colors"
                >
                  🚀 Service Role Update
                </button>
                <button
                  onClick={async () => {
                    console.log('🔍 COMPREHENSIVE DEBUG CHECK...');
                    try {
                      const { data: { user } } = await supabase.auth.getUser();
                      if (user) {
                        console.log('👤 User ID:', user.id);
                        
                        // Direct database query
                        const { data: dbProfile, error: dbError } = await supabase
                          .from('user_profiles')
                          .select('*')
                          .eq('id', user.id)
                          .single();
                        
                        console.log('📊 Database Profile:', dbProfile);
                        console.log('❌ Database Error:', dbError);
                        
                        // Current UI state
                        console.log('🖥️ UI Profile:', profile);
                        console.log('📈 UI Usage:', usage);
                        console.log('🎯 UI Limits:', limits);
                        
                        // Calculate what limits should be
                        if (dbProfile) {
                          const shouldBeLimits = getUsageLimits(dbProfile);
                          console.log('🧮 Calculated Limits:', shouldBeLimits);
                          
                          alert(`DEBUG COMPARISON:
DATABASE:
- Tier: ${dbProfile.subscription_tier}
- Extra Searches: ${dbProfile.extra_patent_searches}
- Updated: ${dbProfile.updated_at}

UI PROFILE:
- Tier: ${profile?.subscription_tier}
- Extra Searches: ${profile?.extra_patent_searches}

UI LIMITS:
- Current: ${limits?.patent_searches}
- Should Be: ${shouldBeLimits.patent_searches}

UI USAGE:
- Used: ${usage?.patent_searches_used}

MISMATCH: ${limits?.patent_searches !== shouldBeLimits.patent_searches ? 'YES - UI NOT UPDATED' : 'NO - UI IS CORRECT'}`);
                        }
                      }
                    } catch (error: any) {
                      console.error('❌ Debug check failed:', error);
                      alert(`Debug Error: ${error.message}`);
                    }
                  }}
                  className="px-3 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors"
                >
                  🔍 FULL DEBUG CHECK
                </button>
                <button
                  onClick={async () => {
                    console.log('🧪 Testing SerpApi directly...');
                    try {
                      // Test SerpApi directly with the API key
                      const apiKey = 'f68ea543f1c383b603344460317a7e16f39405806efa9bbbcc584514872ef2fc';
                      const query = 'car wheel';
                      
                      const searchParams = new URLSearchParams({
                        engine: 'google_patents',
                        api_key: apiKey,
                        q: query,
                        num: '5'
                      });
                      
                      const url = `https://serpapi.com/search?${searchParams.toString()}`;
                      console.log('🔗 Testing URL:', url.replace(apiKey, '[API_KEY]'));
                      
                      // This will fail due to CORS, but we can check the network tab
                      try {
                        const response = await fetch(url);
                        const data = await response.json();
                        console.log('✅ SerpApi Direct Test Success:', data);
                        alert('SerpApi works! Check console for results.');
                      } catch (corsError) {
                        console.log('❌ CORS Error (expected):', corsError);
                        alert('CORS error expected when calling SerpApi directly from browser.\n\nTo test properly:\n1. Open Network tab in DevTools\n2. Look for the request to serpapi.com\n3. Check if it returns 200 OK with real data\n\nOR test via Edge Function after deployment.');
                      }
                      
                    } catch (error: any) {
                      console.error('❌ Test failed:', error);
                      alert(`Test Error: ${error.message}`);
                    }
                  }}
                  className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 transition-colors"
                >
                  🧪 Test SerpApi Direct
                </button>
              </div>
              <div className="text-gray-400 text-xs mt-2">
                <div><strong>Current Query:</strong> {searchQuery}</div>
                <div><strong>Model Name:</strong> {model?.name || 'None'}</div>
                <div><strong>Product Name:</strong> {model?.productSpecs?.name || 'None'}</div>
                <div><strong>CAD Prompt:</strong> {model?.cadModel?.prompt || 'None'}</div>
                <div className="border-t border-gray-600 mt-2 pt-2">
                  <div><strong>Usage Debug:</strong></div>
                  <div>Patent Searches Used: {patentSearchesUsed}</div>
                  <div>Patent Search Limit: {limits?.patent_searches || 'Loading...'}</div>
                  <div>Profile Tier: {profile?.subscription_tier || 'None'}</div>
                  <div>Extra Patent Searches: {profile?.extra_patent_searches || 0}</div>
                  <div>Can Use Patent Search: {canUsePatentSearch() ? 'Yes' : 'No'}</div>
                  <div>Profile ID: {profile?.id || 'None'}</div>
                  <div className="border-t border-gray-500 mt-1 pt-1">
                    <div><strong>Calculation Breakdown:</strong></div>
                    <div>Base Limit (tier): {profile?.subscription_tier === 'pro' ? '30' : profile?.subscription_tier === 'plus' ? '5' : '2'}</div>
                    <div>Extra Purchased: {profile?.extra_patent_searches || 0}</div>
                    <div>Total Should Be: {(profile?.subscription_tier === 'pro' ? 30 : profile?.subscription_tier === 'plus' ? 5 : 2) + (profile?.extra_patent_searches || 0)}</div>
                    <div>Actual Limit: {limits?.patent_searches}</div>
                    <div>Usage Object: {JSON.stringify(usage)}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        */}
      </div>

      {/* Search Results */}
      {hasSearched && (
        <div className="space-y-6">
          {/* Cached Results Indicator */}
          {searchResults.length > 0 && (
            <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3">
              <div className="flex items-center gap-2 text-blue-400 text-sm">
                <CheckCircle className="w-4 h-4" />
                <span>Results preserved from your previous search - no additional search credits used</span>
              </div>
            </div>
          )}

          {/* Summary */}
          {analysis && (
            <div className="horizon-card rounded-2xl p-6">
              <h4 className="text-lg font-bold text-white mb-4">Search Summary</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-cyan-400 mb-2">{analysis.totalResults}</div>
                  <div className="text-gray-400">Similar Patents Found</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-400 mb-2">{analysis.highestSimilarity}%</div>
                  <div className="text-gray-400">Highest Similarity</div>
                </div>
                <div className="text-center">
                  <div className={`text-3xl font-bold mb-2 ${
                    analysis.riskLevel === 'high' ? 'text-red-400' :
                    analysis.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                  }`}>
                    {analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)}
                  </div>
                  <div className="text-gray-400">Risk Level</div>
                </div>
              </div>
            </div>
          )}

          {/* No Results Message */}
          {searchResults.length === 0 && (
            <div className="space-y-6">
            <div className="horizon-card rounded-2xl p-8 text-center">
              <div className="text-6xl mb-4">🎉</div>
              <h4 className="text-xl font-bold text-white mb-2">No Similar Patents Found!</h4>
                <p className="text-gray-300 mb-6">
                Great news! Our search didn't find any patents with significant similarity to your design. 
                This suggests your invention may be novel, but we recommend consulting with a patent attorney for professional analysis.
              </p>
              </div>

              {/* Recommendations for No Patents Found */}
              <div className="horizon-card rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <CheckCircle className="w-6 h-6 text-green-400" />
                  <h4 className="text-lg font-bold text-white">Patent Protection Recommendations</h4>
                </div>
                
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
                  <p className="text-green-400 mb-3">
                    <strong>Low Risk:</strong> No significant patent conflicts detected for your design.
                  </p>
                  
                  <div className="space-y-3 text-gray-300">
                    <div className="font-medium text-white mb-3 text-base">Recommended Actions:</div>
                    <div className="space-y-3">
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">
                          <strong>File a provisional patent application</strong> to establish an early filing date and secure a one-year grace period for further development and refinement.
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">
                          <strong>Conduct a professional patent search</strong> through a qualified patent attorney for comprehensive analysis beyond our initial screening.
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">
                          <strong>Document your invention process</strong> with detailed drawings, specifications, and development timeline for patent application support.
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">
                          <strong>Consider market research</strong> to validate commercial potential before investing in full patent protection.
                        </span>
                      </div>
                      <div className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">
                          <strong>Explore international filing</strong> if planning to market globally - consider PCT (Patent Cooperation Treaty) applications.
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Next Steps */}
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <h5 className="text-blue-400 font-medium text-sm mb-3 flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    Next Steps for Patent Protection
                  </h5>
                  <div className="text-blue-200 text-sm space-y-2">
                    <p><strong>Immediate (1-2 weeks):</strong> Consult with a patent attorney for professional search and patentability analysis</p>
                    <p><strong>Short-term (1-3 months):</strong> File provisional patent application if deemed patentable</p>
                    <p><strong>Long-term (within 12 months):</strong> File non-provisional patent application with detailed claims and specifications</p>
                  </div>
                </div>

                {/* Complete Prototype Journey Button */}
                <div className="mt-8 text-center">
                  <button 
                    onClick={onNext}
                    className="px-8 py-4 horizon-button-primary text-white font-semibold rounded-xl transition-all duration-300 shadow-lg transform hover:scale-105"
                  >
                    Complete Prototype Journey
                  </button>
                  <p className="text-gray-400 text-sm mt-3">
                    Congratulations! You've successfully completed all steps of the prototyping process.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Risk Assessment */}
          {analysis && (
            <div className="horizon-card rounded-2xl p-6">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className={`w-6 h-6 ${
                  analysis.riskLevel === 'high' ? 'text-red-400' :
                  analysis.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                }`} />
                <h4 className="text-lg font-bold text-white">Risk Assessment</h4>
              </div>
              <div className={`border rounded-lg p-4 ${
                analysis.riskLevel === 'high' ? 'bg-red-500/10 border-red-500/30' :
                analysis.riskLevel === 'medium' ? 'bg-yellow-500/10 border-yellow-500/30' :
                'bg-green-500/10 border-green-500/30'
              }`}>
                <p className={`mb-3 ${
                  analysis.riskLevel === 'high' ? 'text-red-400' :
                  analysis.riskLevel === 'medium' ? 'text-yellow-400' : 'text-green-400'
                }`}>
                  <strong>{analysis.riskLevel.charAt(0).toUpperCase() + analysis.riskLevel.slice(1)} Risk:</strong>{' '}
                  {analysis.riskLevel === 'high' 
                    ? 'High similarity found - significant patent conflicts possible'
                    : analysis.riskLevel === 'medium'
                    ? 'Some similarities found - moderate patent risk exists'
                    : 'Low risk - minimal patent conflicts detected'
                  }
                </p>
                
                {analysis.riskFactors.length > 0 && (
                  <div className="space-y-3 text-gray-300">
                    <div className="font-medium text-white mb-3 text-base">Risk Factors:</div>
                    {analysis.riskFactors.map((factor, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">{factor}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {analysis.recommendations.length > 0 && (
                <div className="mt-6">
                  <div className="font-medium text-white mb-3 text-base">Recommendations:</div>
                  <div className="space-y-3 text-gray-300">
                    {analysis.recommendations.map((rec, index) => (
                      <div key={index} className="flex items-start gap-3">
                        <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                        <span className="text-sm leading-relaxed">{rec}</span>
                      </div>
                    ))}
                  </div>
                  
                  {/* Complete Prototype Journey Button - Restored */}
                  <div className="mt-8 text-center">
                    <button 
                      onClick={onNext}
                      className="px-8 py-4 horizon-button-primary text-white font-semibold rounded-xl transition-all duration-300 shadow-lg transform hover:scale-105"
                    >
                      Complete Prototype Journey
                    </button>
                    <p className="text-gray-400 text-sm mt-3">
                      Congratulations! You've successfully completed all steps of the prototyping process.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Patent Results */}
          {searchResults.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xl font-bold text-white">Found Patents</h4>
              {searchResults.map((patent) => (
                <div
                  key={patent.id}
                  className="horizon-card rounded-2xl p-6"
                >
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h5 className="text-lg font-semibold text-white flex-1">{patent.title}</h5>
                        <div className="flex items-center gap-2">
                          {/* Source indicator - Removed Google tag */}
                          {patent.source === 'uspto' && (
                            <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30">
                              🏛️ USPTO
                            </span>
                          )}
                          {/* Similarity score */}
                        {patent.similarity !== undefined && (
                          <span className={`text-sm font-medium ${getSimilarityColor(patent.similarity)}`}>
                            {patent.similarity}% Similar
                          </span>
                        )}
                          {/* Risk level */}
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          patent.riskLevel === 'high' ? 'bg-red-500/20 text-red-400' :
                          patent.riskLevel === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-green-500/20 text-green-400'
                        }`}>
                          {patent.riskLevel} risk
                        </span>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-400 mb-3">
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4" />
                          {patent.patentNumber}
                        </div>
                        <div>Inventor: {patent.inventor || 'Not Listed'}</div>
                        <div>Assignee: {patent.assignee || 'Not Listed'}</div>
                        <div>Filed: {patent.filingDate}</div>
                        <div className={`px-2 py-1 rounded-full text-xs ${
                          patent.status === 'active' ? 'bg-green-500/20 text-green-400' : 
                          patent.status === 'pending' ? 'bg-yellow-500/20 text-yellow-400' :
                          'bg-gray-500/20 text-gray-400'
                        }`}>
                          {patent.status}
                        </div>
                      </div>
                      <p className="text-gray-300 text-sm leading-relaxed">{patent.abstract}</p>
                      
                      {patent.classification.length > 0 && (
                        <div className="mt-3">
                          <span className="text-xs text-gray-500">Classifications: </span>
                          <span className="text-xs text-gray-400">{patent.classification.join(', ')}</span>
                        </div>
                      )}
                    </div>
                    <a
                      href={patent.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-4 md:mt-0 md:ml-4 flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors"
                    >
                      View Full Patent
                      <ExternalLink className="w-4 h-4" />
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {showUpgradePrompt && (
        <UpgradePrompt
          type="patents"
          onClose={handleUpgradeClose}
          onUpgrade={handleUpgradeClick}
          usageData={{
            used: usage?.patent_searches_used || 0,
            limit: limits?.patent_searches || 0
          }}
          isModal={true}
        />
      )}
    </div>
  );
};

export default PatentSearch;