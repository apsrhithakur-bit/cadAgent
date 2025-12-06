import React, { useState, useEffect, useCallback } from 'react';
import { MapPin, Star, Clock, DollarSign, Send, Filter, Navigation, Loader2, CheckCircle, ExternalLink, AlertTriangle, Mail, Wrench } from 'lucide-react';
import { ArchitecturalModel } from '../../types/architectural';
import { 
  searchManufacturers, 
  getUserLocation, 
  ManufacturerResult, 
  ManufacturerSearchParams,
  saveManufacturerSearch,
  loadCachedManufacturerSearch
} from '../../services/manufacturerSearchJS';
import { 
  createQuoteRequest, 
  QuoteFormData 
} from '../../services/quoteManagement';
import { useAuth } from '../../hooks/useAuth';
import { useManufacturerAccess } from '../../hooks/useManufacturerAccess';
import { ManufacturerPaywall } from '../ManufacturerPaywall';
import { trackManufacturerSearch, trackManufacturerQuote, canPerformManufacturerSearch, getManufacturerUsage } from '../../services/manufacturerUsage';
import { getModelProductName, extractProductName } from '../../utils/productNameExtractor';
import UpgradePrompt from '../UpgradePrompt';

interface ManufacturingConnectProps {
  model: ArchitecturalModel | null;
  onNext: () => void;
  onPrevious: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
}

const ManufacturingConnect: React.FC<ManufacturingConnectProps> = ({ model, onNext }) => {
  const { user } = useAuth();
  const { hasManufacturerAccess, isLoading: accessLoading, requiresUpgrade } = useManufacturerAccess();

  // Filter state (location filter removed)
  const [selectedMaterial, setSelectedMaterial] = useState('all');
  const [selectedMinOrder, setSelectedMinOrder] = useState('any');
  const [selectedManufacturer, setSelectedManufacturer] = useState<string | null>(null);
  const [allManufacturers, setAllManufacturers] = useState<ManufacturerResult[]>([]);
  const [filteredManufacturers, setFilteredManufacturers] = useState<ManufacturerResult[]>([]);
  const [isExpandingSearch, setIsExpandingSearch] = useState(false);
  const [expandSearchAttempts, setExpandSearchAttempts] = useState(0);
  const [lastFilterState, setLastFilterState] = useState<string>('');
  const [manufacturers, setManufacturers] = useState<ManufacturerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [userLocation, setUserLocation] = useState<any>(null);
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt'>('prompt');
  const [searchPerformed, setSearchPerformed] = useState(false);
  const [quoteSubmitting, setQuoteSubmitting] = useState(false);
  const [quoteSuccess, setQuoteSuccess] = useState(false);
  // Search limit tracking
  const [searchLimitReached, setSearchLimitReached] = useState(false);
  const [remainingSearches, setRemainingSearches] = useState(0);
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
  const [quoteFormData, setQuoteFormData] = useState<QuoteFormData>({
    quantity: 100,
    material_preference: '',
    timeline: 'Within 1 month',
    special_requirements: '',
    contact_email: user?.email || '',
    contact_phone: '',
    company_name: ''
  });

  // Add state for manual search control
  const [hasPerformedInitialSearch, setHasPerformedInitialSearch] = useState(false);
  const [showManualSearch, setShowManualSearch] = useState(false);

  // Enhanced cache checking with localStorage backup
  const getCachedResults = useCallback(async (searchParams: ManufacturerSearchParams) => {
    // Try Supabase cache first
    const supabaseResults = await loadCachedManufacturerSearch(searchParams);
    if (supabaseResults && supabaseResults.length > 0) {
      console.log('✅ Using Supabase cached manufacturer results');
      return supabaseResults;
    }

    // Fallback to localStorage cache
    try {
      const cacheKey = `manufacturer-search-${JSON.stringify(searchParams)}`;
      const localCache = localStorage.getItem(cacheKey);
      if (localCache) {
        const cached = JSON.parse(localCache);
        const expiry = new Date(cached.expires);
        if (expiry > new Date()) {
          console.log('✅ Using localStorage cached manufacturer results');
          return cached.results;
      } else {
          localStorage.removeItem(cacheKey);
        }
      }
    } catch (error) {
      console.warn('⚠️ Error reading localStorage cache:', error);
    }

    return null;
  }, []);

  // Filter manufacturers based on selected filters with dynamic radius expansion
  const applyFilters = useCallback(async () => {
    // Prevent infinite loops and race conditions
    if (isExpandingSearch) {
      console.log('🔍 Skipping filter application during expanded search');
      return;
    }

    // Check if this is the same filter state that caused an expansion before
    const currentFilterState = `all-${selectedMaterial}-${selectedMinOrder}`; // Location removed
    
    let filtered = [...allManufacturers];
    console.log(`🔍 Starting filter application with ${filtered.length} manufacturers`);
    console.log(`🔍 Active filters - Material: ${selectedMaterial}, MinOrder: ${selectedMinOrder}`); // Location removed

    // Apply material filter first (most restrictive)
    if (selectedMaterial !== 'all') {
      const beforeMaterial = filtered.length;
      filtered = filtered.filter(m => {
        const materialLower = selectedMaterial.toLowerCase();
        
        // Check specialties
        const specialtyMatch = m.specialties.some(specialty => 
          specialty.toLowerCase().includes(materialLower)
        );
        
        // Check capabilities
        const capabilityMatch = m.capabilities.some(capability => 
          capability.toLowerCase().includes(materialLower)
        );
        
        // Check name
        const nameMatch = m.name.toLowerCase().includes(materialLower);
        
        // Special material mappings for better matching
        const materialMappings: { [key: string]: string[] } = {
          'aluminum': ['aluminum', 'aluminium', 'al6061', '6061', 'cnc', 'machining'],
          'steel': ['steel', 'stainless', 'carbon steel', 'cnc', 'machining'],
          'stainless': ['stainless', 'steel', 'cnc', 'machining'],
          'plastic': ['plastic', 'injection', 'molding', '3d printing', 'abs', 'nylon'],
          'nylon': ['nylon', 'plastic', 'injection', '3d printing'],
          'titanium': ['titanium', 'ti', 'aerospace', 'cnc', 'machining'],
          'carbon-fiber': ['carbon', 'fiber', 'composite', 'aerospace']
        };
        
        // Enhanced matching using mappings
        const enhancedMatch = materialMappings[materialLower]?.some(mapping => 
          m.specialties.some(s => s.toLowerCase().includes(mapping)) ||
          m.capabilities.some(c => c.toLowerCase().includes(mapping)) ||
          m.name.toLowerCase().includes(mapping)
        ) || false;
        
        const materialMatch = specialtyMatch || capabilityMatch || nameMatch || enhancedMatch;
        
        if (materialMatch) {
          console.log(`✅ Material match found: ${m.name} (${m.specialties.join(', ')})`);
        }
        return materialMatch;
      });
      console.log(`🔍 Material filter: ${beforeMaterial} → ${filtered.length} manufacturers`);
    }

    // Apply min order filter
    if (selectedMinOrder !== 'any') {
      const beforeOrder = filtered.length;
      if (selectedMinOrder === '1-50') {
        filtered = filtered.filter(m => m.minOrder <= 50);
      } else if (selectedMinOrder === '50-100') {
        filtered = filtered.filter(m => m.minOrder <= 100 && m.minOrder > 50);
      } else if (selectedMinOrder === '100+') {
        filtered = filtered.filter(m => m.minOrder >= 100);
      }
      console.log(`🔍 Min order filter: ${beforeOrder} → ${filtered.length} manufacturers`);
    }
    // Location filter removed - showing all locations


    // Check if we should perform expanded search with strict limits
    const shouldExpandSearch = filtered.length < 3 && 
                              !isExpandingSearch && 
                              expandSearchAttempts < 2 && 
                              currentFilterState !== lastFilterState;

    if (shouldExpandSearch) {
      console.log(`🔍 Only ${filtered.length} manufacturers found after filtering, performing expanded search (attempt ${expandSearchAttempts + 1}/2)...`);
      setIsExpandingSearch(true);
      setLastFilterState(currentFilterState);
      setExpandSearchAttempts(prev => prev + 1);
      await performExpandedSearch();
      return;
    } else if (filtered.length < 3 && expandSearchAttempts >= 2) {
      console.log(`⚠️ Max expansion attempts reached. Showing ${filtered.length} manufacturers found.`);
      // Fallback: if min order filter is too restrictive, relax it
      if (selectedMinOrder === '100+' && filtered.length === 0) {
        console.log(`🔍 Relaxing min order filter to show manufacturers with 50+ units`);
        filtered = [...allManufacturers].filter(m => m.minOrder >= 50);
        if (filtered.length === 0) {
          console.log(`🔍 Still no results, showing all manufacturers`);
          filtered = [...allManufacturers];
        }
      }
    }

    console.log(`✅ Final filtered results: ${filtered.length} manufacturers`);
    setFilteredManufacturers(filtered);
    setManufacturers(filtered);
  }, [selectedMaterial, selectedMinOrder, allManufacturers, isExpandingSearch, expandSearchAttempts, lastFilterState]); // selectedLocation removed

  // Perform expanded search when filters result in too few manufacturers
  const performExpandedSearch = useCallback(async () => {
    if (!model?.productSpecs || loading) return;
    
    try {
      setLoading(true);
      console.log('🔍 Performing expanded search with larger radius...');
      
      const materials = model.productSpecs.manufacturing?.materials || ['plastic'];
      const method = model.productSpecs.manufacturing?.method || 'injection molding';
      const complexity = model.productSpecs.manufacturing?.complexity || 'moderate';
      
      // Create expanded search parameters with larger radius and adapted criteria
      let searchQuantity = 100;
      let searchMethod = method;
      
      // Adapt search criteria for min order filters
      if (selectedMinOrder === '100+') {
        searchQuantity = 500;
        searchMethod = `${method} production manufacturing`;
      } else if (selectedMinOrder === '50-100') {
        searchQuantity = 75;
        searchMethod = `${method} custom manufacturing`;
      } else if (selectedMinOrder === '1-50') {
        searchQuantity = 25;
        searchMethod = `${method} prototype manufacturing`;
      }
      
      const expandedParams: ManufacturerSearchParams = {
        materials: selectedMaterial !== 'all' ? [selectedMaterial] : materials,
        method: searchMethod,
        complexity: complexity as any,
        // location: selectedLocation, // Location filter removed
        userLocation: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined,
        // radius: selectedLocation === 'local' ? 1000 : undefined, // Location filter removed
        quantity: searchQuantity
      };
      
      console.log('🔍 Expanded search params:', expandedParams);
      
      const expandedResults = await searchManufacturers(expandedParams);
      console.log(`✅ Expanded search found ${expandedResults.length} additional manufacturers`);
      
      // Combine with existing results and remove duplicates
      const combinedResults = [...allManufacturers, ...expandedResults];
      const uniqueResults = combinedResults.filter((manufacturer, index, self) => 
        index === self.findIndex(m => m.id === manufacturer.id)
      );
      
      setAllManufacturers(uniqueResults);
      
      // Apply filters to the expanded result set
      let filtered = [...uniqueResults];
      
      if (selectedMaterial !== 'all') {
        filtered = filtered.filter(m => 
          m.specialties.some(specialty => 
            specialty.toLowerCase().includes(selectedMaterial.toLowerCase())
          ) ||
          m.capabilities.some(capability => 
            capability.toLowerCase().includes(selectedMaterial.toLowerCase())
          ) ||
          m.name.toLowerCase().includes(selectedMaterial.toLowerCase())
        );
      }

      if (selectedMinOrder !== 'any') {
        if (selectedMinOrder === '1-50') {
          filtered = filtered.filter(m => m.minOrder <= 50);
        } else if (selectedMinOrder === '50-100') {
          filtered = filtered.filter(m => m.minOrder <= 100 && m.minOrder > 50);
        } else if (selectedMinOrder === '100+') {
          filtered = filtered.filter(m => m.minOrder >= 100);
        }
      }
      
      console.log(`✅ Final filtered results: ${filtered.length} manufacturers`);
      setFilteredManufacturers(filtered);
      setManufacturers(filtered);
      
    } catch (error) {
      console.error('❌ Error in expanded search:', error);
      setFilteredManufacturers(allManufacturers);
      setManufacturers(allManufacturers);
    } finally {
      setLoading(false);
      setIsExpandingSearch(false);
    }
  }, [model, loading, selectedMaterial, selectedMinOrder, userLocation, allManufacturers]); // selectedLocation removed

  // Check search limits before performing search
  const checkSearchLimits = useCallback(async () => {
    if (!user) return { canSearch: false, remainingSearches: 0 };
    
    try {
      const result = await canPerformManufacturerSearch(user.id);
      if (result.success) {
        setSearchLimitReached(!result.canSearch);
        setRemainingSearches(result.remainingSearches || 0);
        return { canSearch: result.canSearch || false, remainingSearches: result.remainingSearches || 0 };
      }
    } catch (error) {
      console.error('Error checking search limits:', error);
    }
    return { canSearch: false, remainingSearches: 0 };
  }, [user]);

  // Handle location detection and manufacturer search
  const handleLocationAndSearch = useCallback(async () => {
    if (!model?.productSpecs || !user) return;
    
    // Check search limits first
    const { canSearch } = await checkSearchLimits();
    if (!canSearch) {
      console.log('🚫 Search limit reached for user');
      setShowUpgradePrompt(true);
      return;
    }
    
    try {
      setLoading(true);
      console.log('🌍 Getting user location...');
      
      const location = await getUserLocation();
      if (location) {
        setUserLocation(location);
        setLocationPermission('granted');
        console.log('✅ Location obtained:', location.city, location.state);
      } else {
        setLocationPermission('denied');
        console.log('⚠️ Location access denied or failed');
      }
      
      // Get the proper product name for manufacturing context
      const productName = getModelProductName(model);
      console.log('🔍 Using product name for manufacturing search:', productName);
      
      // Extract keywords from model description for search enhancement
      const modelDescription = model.description || model.productSpecs?.description || '';
      const descriptionKeywords = modelDescription
        .split(/\s+/)
        .filter(word => word.length > 3)
        .filter(word => !['that', 'this', 'with', 'and', 'for', 'the', 'but', 'are', 'can', 'will'].includes(word.toLowerCase()))
        .slice(0, 5); // Limit to 5 keywords
      
      // Prepare search parameters
      const materials = model.productSpecs.manufacturing?.materials || ['plastic'];
      const method = model.productSpecs.manufacturing?.method || 'injection molding';
      const complexity = model.productSpecs.manufacturing?.complexity || 'moderate';
      
      const searchParams: ManufacturerSearchParams = {
        materials,
        method,
        complexity: complexity as any,
        userLocation: location ? { lat: location.lat, lng: location.lng } : undefined,
        quantity: 100,
        productName: productName, // Add product name to search context
        keywords: [productName, ...descriptionKeywords], // Add description keywords for better matching
        productDescription: modelDescription // Add full description for context
      };
      
      console.log('🔍 Searching manufacturers with params:', searchParams);
      
      // Try to load cached results first
      const cachedResults = await getCachedResults(searchParams);
      if (cachedResults && cachedResults.length > 0) {
        console.log('✅ Using cached manufacturer results');
        setManufacturers(cachedResults);
        setSearchPerformed(true);
        setLoading(false);
        return;
      }
      
      // Perform fresh search
      const results = await searchManufacturers(searchParams);
      console.log('✅ Found', results.length, 'manufacturers');
      
      setAllManufacturers(results);
      setManufacturers(results);
      setFilteredManufacturers(results);
      setSearchPerformed(true);
      
      // Cache the results
      if (results.length > 0) {
        await saveManufacturerSearch(searchParams, results);
      }
      
      // Track manufacturer search usage
      if (user && results.length > 0) {
        try {
          await trackManufacturerSearch(user.id);
          console.log('✅ Tracked manufacturer search usage');
        } catch (error) {
          console.error('❌ Error tracking manufacturer search:', error);
        }
      }
      
    } catch (error) {
      console.error('❌ Error in location/search:', error);
    } finally {
      setLoading(false);
    }
  }, [model, user, getCachedResults, checkSearchLimits]);

  // Refresh search with current filters
  const refreshSearch = useCallback(async () => {
    if (!model?.productSpecs || !user) return;
    
    // Check search limits first
    const { canSearch } = await checkSearchLimits();
    if (!canSearch) {
      console.log('🚫 Search limit reached for user');
      setShowUpgradePrompt(true);
      return;
    }
    
    try {
      setLoading(true);
      setSearchPerformed(false);
      
      const materials = model.productSpecs.manufacturing?.materials || ['plastic'];
      const method = model.productSpecs.manufacturing?.method || 'injection molding';
      const complexity = model.productSpecs.manufacturing?.complexity || 'moderate';
      
      const searchParams: ManufacturerSearchParams = {
        materials,
        method,
        complexity: complexity as any,
        // location: selectedLocation, // Location filter removed
        userLocation: userLocation ? { lat: userLocation.lat, lng: userLocation.lng } : undefined,
        // radius: selectedLocation === 'local' ? 500 : undefined, // Location filter removed
        quantity: 100
      };
      
      const results = await searchManufacturers(searchParams);
      setAllManufacturers(results);
      setManufacturers(results);
      setFilteredManufacturers(results);
      setSearchPerformed(true);
      
      if (results.length > 0) {
        await saveManufacturerSearch(searchParams, results);
      }
      
    } catch (error) {
      console.error('❌ Error refreshing search:', error);
    } finally {
      setLoading(false);
    }
  }, [model, userLocation, checkSearchLimits]);

  // Check search limits on component mount
  useEffect(() => {
    if (user) {
      checkSearchLimits();
    }
  }, [user, checkSearchLimits]);

  // Get user location and search manufacturers
  useEffect(() => {
    handleLocationAndSearch();
  }, [handleLocationAndSearch]);

  // Apply filters when filter selections change
  useEffect(() => {
    if (allManufacturers.length > 0 && !isExpandingSearch) {
      applyFilters();
    }
  }, [applyFilters, allManufacturers, isExpandingSearch]);

  // Reset expanding search flag and attempts when filters change
  useEffect(() => {
    setIsExpandingSearch(false);
    setExpandSearchAttempts(0);
    setLastFilterState('');
  }, [selectedMaterial, selectedMinOrder]); // selectedLocation removed

  // Show paywall if user doesn't have manufacturer access (after all hooks)
  if (!accessLoading && requiresUpgrade) {
    return <ManufacturerPaywall />;
  }

  // Handle upgrade prompt actions
  const handleUpgradeClose = () => {
    setShowUpgradePrompt(false);
  };

  const handleUpgradeClick = () => {
    setShowUpgradePrompt(false);
    // Trigger subscription modal
    window.dispatchEvent(new CustomEvent('openSubscriptionModal'));
  };

  // If upgrade prompt should be shown
  if (showUpgradePrompt) {
    return (
      <UpgradePrompt
        type="manufacturers"
        onClose={handleUpgradeClose}
        onUpgrade={handleUpgradeClick}
        usageData={{
          used: 10 - (remainingSearches || 0),
          limit: 10
        }}
        isModal={false}
      />
    );
  }

  const handleRequestQuote = (manufacturerId: string) => {
    const manufacturer = manufacturers.find(m => m.id === manufacturerId);
    if (manufacturer) {
      setSelectedManufacturer(manufacturerId);
      // Pre-fill form with manufacturer and design data
      setQuoteFormData(prev => ({
        ...prev,
        material_preference: manufacturer.specialties[0] || prev.material_preference,
        contact_email: user?.email || prev.contact_email
      }));
    }
  };

  // Handle quote form submission
  const handleQuoteSubmit = async () => {
    if (!selectedManufacturer || !user) return;
    
    const manufacturer = manufacturers.find(m => m.id === selectedManufacturer);
    if (!manufacturer) return;
    
    try {
      setQuoteSubmitting(true);
      
      const designData = {
        id: model?.id,
        name: model?.name || 'Custom Design',
        materials: model?.productSpecs?.manufacturing?.materials || ['Unknown'],
        method: model?.productSpecs?.manufacturing?.method || 'Unknown',
        complexity: model?.productSpecs?.manufacturing?.complexity || 'moderate'
      };
      
      const result = await createQuoteRequest(manufacturer, quoteFormData, designData);
      
      if (result.success) {
        console.log('✅ Quote request created:', result.quoteId);
        setQuoteSuccess(true);
        
        // Track manufacturer quote usage
        if (user) {
          try {
            await trackManufacturerQuote(user.id);
            console.log('✅ Tracked manufacturer quote usage');
          } catch (error) {
            console.error('❌ Error tracking manufacturer quote:', error);
          }
        }
        
        // Auto-advance after showing success
        setTimeout(() => {
          onNext();
        }, 2000);
      } else {
        console.error('❌ Quote request failed:', result.error);
        alert('Failed to send quote request. Please try again.');
      }
      
    } catch (error) {
      console.error('❌ Error submitting quote:', error);
      alert('Error submitting quote request. Please try again.');
    } finally {
      setQuoteSubmitting(false);
    }
  };

  // Handle quote form changes
  const handleQuoteFormChange = (field: keyof QuoteFormData, value: any) => {
    setQuoteFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Helper function to format manufacturer location display
  const formatManufacturerLocation = (manufacturer: ManufacturerResult) => {
    let location = manufacturer.location || 'Location Unknown';
    
    // If we have a full address, try to extract better format
    if (manufacturer.address && manufacturer.address !== manufacturer.location) {
      location = manufacturer.address;
    }
    
    // Parse and reformat common location patterns
    // Handle patterns like "WI 53132, USA" or "CA 90210, USA"
    const stateZipPattern = /^([A-Z]{2})\s+(\d{5}),?\s*(.*)$/;
    const stateZipMatch = location.match(stateZipPattern);
    
    if (stateZipMatch) {
      const [, state, zipCode, country] = stateZipMatch;
      // Try to get city name from address if available
      if (manufacturer.address) {
        const addressParts = manufacturer.address.split(',');
        const cityPart = addressParts.find(part => 
          !part.match(/^\s*[A-Z]{2}\s+\d{5}/) && 
          !part.match(/^\s*(USA|US|United States)/i) &&
          part.trim().length > 0
        );
        if (cityPart) {
          location = `${cityPart.trim()}, ${state} ${zipCode}${country ? `, ${country}` : ''}`;
        } else {
          location = `${state} ${zipCode}${country ? `, ${country}` : ''}`;
        }
      }
    }
    
    // Handle partial addresses and improve formatting
    location = location
      .replace(/,\s*,/g, ',') // Remove double commas
      .replace(/^\s*,\s*/, '') // Remove leading comma
      .replace(/\s+/g, ' ') // Normalize spaces
      .trim();
    
    // Add distance if available
    if (manufacturer.distance !== undefined) {
      const distanceText = `${manufacturer.distance} ${manufacturer.distance === 1 ? 'mile' : 'miles'} away`;
      return `${location} • ${distanceText}`;
    }
    
    return location;
  };

  return (
    <div className="max-w-6xl mx-auto">
      {!selectedManufacturer ? (
        <>
          {/* Header with location status */}
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6 mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Filter className="w-6 h-6 text-cyan-400" />
                <h3 className="text-xl font-bold text-white">Find the Perfect Manufacturer</h3>
              </div>
              <div className="flex items-center gap-2 text-sm">
                {locationPermission === 'granted' && userLocation && (
                  <div className="flex items-center gap-1 text-green-400">
                    <Navigation className="w-4 h-4" />
                    <span>{userLocation.city}, {userLocation.state}</span>
                  </div>
                )}
                {locationPermission === 'denied' && (
                  <div className="flex items-center gap-1 text-yellow-400">
                    <MapPin className="w-4 h-4" />
                    <span>Location access denied</span>
                  </div>
                )}
                {remainingSearches !== null && (
                  <div className="flex items-center gap-1 text-blue-400">
                    <span>{remainingSearches} searches remaining this month</span>
                  </div>
                )}
                {!searchPerformed && !searchLimitReached && (
                  <button
                    onClick={refreshSearch}
                    className="px-3 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors"
                  >
                    Search Manufacturers
                  </button>
                )}
              </div>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Location filter removed */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Material</label>
                <select
                  value={selectedMaterial}
                  onChange={(e) => setSelectedMaterial(e.target.value)}
                  className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  style={{ color: 'white' }}
                >
                  <option value="all" style={{ backgroundColor: '#1f2937', color: 'white' }}>All Materials</option>
                  <option value="aluminum" style={{ backgroundColor: '#1f2937', color: 'white' }}>Aluminum</option>
                  <option value="steel" style={{ backgroundColor: '#1f2937', color: 'white' }}>Steel</option>
                  <option value="stainless" style={{ backgroundColor: '#1f2937', color: 'white' }}>Stainless Steel</option>
                  <option value="plastic" style={{ backgroundColor: '#1f2937', color: 'white' }}>Plastic</option>
                  <option value="nylon" style={{ backgroundColor: '#1f2937', color: 'white' }}>Nylon</option>
                  <option value="carbon-fiber" style={{ backgroundColor: '#1f2937', color: 'white' }}>Carbon Fiber</option>
                  <option value="titanium" style={{ backgroundColor: '#1f2937', color: 'white' }}>Titanium</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Min Order</label>
                <select 
                  value={selectedMinOrder}
                  onChange={(e) => setSelectedMinOrder(e.target.value)}
                  className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  style={{ color: 'white' }}
                >
                  <option value="any" style={{ backgroundColor: '#1f2937', color: 'white' }}>Any Quantity</option>
                  <option value="1-50" style={{ backgroundColor: '#1f2937', color: 'white' }}>1-50 units</option>
                  <option value="50-100" style={{ backgroundColor: '#1f2937', color: 'white' }}>50-100 units</option>
                  <option value="100+" style={{ backgroundColor: '#1f2937', color: 'white' }}>100+ units</option>
                </select>
              </div>
            </div>
            
            {/* Filter Status */}
            {(selectedMaterial !== 'all' || selectedMinOrder !== 'any') && (
              <div className="mt-4 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm text-cyan-400">
                    <Filter className="w-4 h-4" />
                    <span>Filters Active:</span>
                    {selectedMaterial !== 'all' && (
                      <span className="px-2 py-1 bg-cyan-500/20 rounded text-xs">
                        {selectedMaterial.charAt(0).toUpperCase() + selectedMaterial.slice(1)}
                      </span>
                    )}
                    {selectedMinOrder !== 'any' && (
                      <span className="px-2 py-1 bg-cyan-500/20 rounded text-xs">
                        {selectedMinOrder} units
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      setSelectedMaterial('all');
                      setSelectedMinOrder('any');
                    }}
                    className="text-xs text-gray-400 hover:text-white transition-colors"
                  >
                    Clear All
                  </button>
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Showing {filteredManufacturers.length} of {allManufacturers.length} manufacturers
                  {isExpandingSearch && (
                    <span className="text-yellow-400 ml-2">
                      • Expanding search to find more options...
                    </span>
                  )}
                  {expandSearchAttempts >= 2 && filteredManufacturers.length < 3 && !isExpandingSearch && (
                    <span className="text-orange-400 ml-2">
                      • Search expanded, showing best available matches
                    </span>
                  )}
                  {selectedMinOrder === '100+' && filteredManufacturers.length > 0 && filteredManufacturers.every(m => m.minOrder < 100) && (
                    <span className="text-blue-400 ml-2">
                      • Filter relaxed to show manufacturers with 50+ min order
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Search Limit Reached Message */}
          {searchLimitReached && (
            <div className="bg-gradient-to-r from-orange-500/10 to-red-500/10 border border-orange-500/20 rounded-2xl p-8 text-center mb-8">
              <div className="flex flex-col items-center gap-4">
                <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center">
                  <AlertTriangle className="w-8 h-8 text-orange-400" />
                </div>
                
                <div>
                  <h3 className="text-2xl font-bold text-white mb-2">Monthly Search Limit Reached</h3>
                  <p className="text-gray-300 text-lg mb-4">
                    You've used all 10 manufacturer searches for this month.
                  </p>
                  <p className="text-gray-400 mb-6">
                    Need more searches? Our team can help you find the perfect manufacturer for your project.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row gap-4">
                  <a
                    href="mailto:support@agenticad.store?subject=Additional Manufacturer Searches Request&body=Hi, I need additional manufacturer searches for my project. Please contact me to discuss options."
                    className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg transition-all duration-200 font-medium"
                  >
                    <Mail className="w-5 h-5" />
                    Contact Support
                  </a>
                  
                  <div className="flex flex-col items-center gap-2 px-6 py-3 bg-white/5 rounded-lg">
                    <span className="text-sm text-gray-400">Or call us:</span>
                    <a href="tel:+1-414-460-3285" className="text-cyan-400 font-medium hover:text-cyan-300">
                      +1 (414) 460-3285
                    </a>
                  </div>
                </div>

                <div className="mt-4 p-4 bg-white/5 rounded-lg">
                  <p className="text-sm text-gray-400">
                    Your searches will reset on the 1st of next month. 
                    {remainingSearches !== null && remainingSearches === 0 && (
                      <span className="text-blue-400 ml-1">Next reset: {new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString()}</span>
                    )}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-cyan-400">
                <Loader2 className="w-6 h-6 animate-spin" />
                <span>Searching manufacturers...</span>
              </div>
            </div>
          )}

          {/* Manufacturer List */}
          {!loading && manufacturers.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {manufacturers.map((manufacturer) => (
                <div key={manufacturer.id} className="bg-gradient-to-br from-white/10 to-white/5 backdrop-blur-sm border border-white/20 rounded-2xl overflow-hidden hover:from-white/15 hover:to-white/10 transition-all duration-300 shadow-lg">
                  {/* Header with Image */}
                  <div className="relative h-48 bg-gradient-to-r from-cyan-600/20 to-blue-600/20">
                    {manufacturer.image ? (
                  <img
                    src={manufacturer.image}
                    alt={manufacturer.name}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          // Fallback to gradient background
                          e.currentTarget.style.display = 'none';
                        }}
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-r from-cyan-600/20 to-blue-600/20 flex items-center justify-center">
                        <div className="text-4xl font-bold text-white/40">{manufacturer.name.charAt(0)}</div>
                      </div>
                    )}
                    
                    {/* Rating Badge */}
                    <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-1">
                      <Star className="w-4 h-4 text-yellow-400 fill-current" />
                      <span className="text-sm text-white font-medium">{manufacturer.rating}</span>
                      <span className="text-xs text-gray-300">({manufacturer.reviewCount || 0})</span>
                          </div>
                    
                    {/* Price Range Badge */}
                    <div className="absolute top-4 left-4 bg-green-600/80 backdrop-blur-sm rounded-lg px-3 py-1">
                      <span className="text-sm text-white font-medium">{manufacturer.priceRange}</span>
                          </div>
                        </div>

                  {/* Content */}
                  <div className="p-6">
                    {/* Title and Location */}
                    <div className="mb-4">
                      <h4 className="text-xl font-bold text-white mb-2">{manufacturer.name}</h4>
                      <div className="flex items-center gap-1 text-sm text-gray-400">
                        <MapPin className="w-4 h-4" />
                        <span>{formatManufacturerLocation(manufacturer)}</span>
                      </div>
                          </div>

                    {/* Key Info Grid */}
                    <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-white/5 rounded-lg">
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                          <Clock className="w-4 h-4" />
                          <span className="text-xs">Lead Time</span>
                          </div>
                        <div className="text-white font-medium">{manufacturer.leadTime}</div>
                      </div>
                      <div className="text-center">
                        <div className="flex items-center justify-center gap-1 text-gray-400 mb-1">
                          <DollarSign className="w-4 h-4" />
                          <span className="text-xs">Min Order</span>
                        </div>
                        <div className="text-white font-medium">{manufacturer.minOrder} units</div>
                      </div>
                    </div>

                    {/* Description */}
                    <p className="text-gray-300 text-sm mb-4 overflow-hidden" style={{
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical'
                    }}>{manufacturer.description}</p>
                    
                    {/* Specialties */}
                    <div className="mb-4">
                      <div className="flex flex-wrap gap-2">
                        {manufacturer.specialties.slice(0, 3).map((specialty, index) => (
                          <span key={index} className="px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded-lg text-xs font-medium">
                              {specialty}
                            </span>
                          ))}
                        {manufacturer.specialties.length > 3 && (
                          <span className="px-2 py-1 bg-gray-500/20 text-gray-400 rounded-lg text-xs">
                            +{manufacturer.specialties.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Certifications */}
                    {manufacturer.certifications && manufacturer.certifications.length > 0 && (
                      <div className="mb-4">
                        <div className="text-xs text-gray-400 mb-2">Certifications</div>
                        <div className="flex flex-wrap gap-1">
                          {manufacturer.certifications.slice(0, 3).map((cert, index) => (
                            <span key={index} className="px-2 py-1 horizon-card text-white rounded text-xs">
                              {cert}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleRequestQuote(manufacturer.id)}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white rounded-lg transition-all duration-200 font-medium"
                      >
                        <Send className="w-4 h-4" />
                        Get Quote
                      </button>
                        {manufacturer.contact?.website && (
                         <button
                           onClick={() => manufacturer.contact.website && window.open(manufacturer.contact.website, '_blank')}
                           disabled={!manufacturer.contact.website}
                           className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                             manufacturer.contact.website
                               ? 'bg-blue-600 text-white hover:bg-blue-700'
                               : 'bg-gray-600 text-gray-400 cursor-not-allowed'
                           }`}
                         >
                           <ExternalLink className="w-4 h-4 mr-2 inline" />
                           {manufacturer.contact.website ? 'Visit Website' : 'No Website'}
                         </button>
                        )}
                  </div>
                </div>
              </div>
            ))}
            </div>
          )}

          {/* No Results State */}
          {!loading && searchPerformed && manufacturers.length === 0 && (
            <div className="text-center py-12">
              <div className="text-gray-400 mb-4">
                <Filter className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg">No manufacturers found matching your criteria</p>
                <p className="text-sm mt-2">Try adjusting your filters or search parameters</p>
              </div>
              <button
                onClick={refreshSearch}
                className="px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors"
              >
                Search Again
              </button>
            </div>
          )}
          {!searchPerformed && !loading && (
            <div className="text-center py-12">
              <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 max-w-md mx-auto">
                <Wrench className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-white mb-2">
                  Find Manufacturers for {getModelProductName(model)}
                </h3>
                <p className="text-gray-400 mb-6">
                  Search for qualified manufacturers who can produce your design using {model?.productSpecs?.manufacturing?.method || 'advanced manufacturing'} techniques.
                </p>
                <button
                  onClick={handleLocationAndSearch}
                  className="bg-gradient-to-r from-cyan-500 to-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:from-cyan-600 hover:to-blue-700 transition-all"
                >
                  Search Manufacturers
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        /* Quote Form */
        <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-white">Request Quote</h3>
            <button
              onClick={() => setSelectedManufacturer(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ← Back to Manufacturers
            </button>
          </div>
          
          {quoteSuccess ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-400 mx-auto mb-4" />
              <h4 className="text-xl font-bold text-white mb-2">Quote Request Sent!</h4>
              <p className="text-gray-300 mb-4">
                Your quote request has been sent to the manufacturer. They will contact you soon with pricing and availability.
              </p>
              <p className="text-sm text-gray-400">
                Redirecting to next step...
              </p>
            </div>
          ) : (
            <form onSubmit={(e) => { e.preventDefault(); handleQuoteSubmit(); }} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Quantity</label>
                <input
                  type="number"
                  value={quoteFormData.quantity}
                    onChange={(e) => handleQuoteFormChange('quantity', parseInt(e.target.value))}
                    className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    min="1"
                    required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Material Preference</label>
                  <input
                    type="text"
                  value={quoteFormData.material_preference}
                  onChange={(e) => handleQuoteFormChange('material_preference', e.target.value)}
                    className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    placeholder="e.g., Aluminum 6061"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Timeline</label>
                <select 
                  value={quoteFormData.timeline}
                  onChange={(e) => handleQuoteFormChange('timeline', e.target.value)}
                    className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                  >
                    <option value="ASAP">ASAP</option>
                    <option value="Within 1 week">Within 1 week</option>
                    <option value="Within 1 month">Within 1 month</option>
                    <option value="Within 3 months">Within 3 months</option>
                    <option value="Flexible">Flexible</option>
                </select>
              </div>
              <div>
                  <label className="block text-sm text-gray-400 mb-2">Company Name</label>
                  <input
                    type="text"
                    value={quoteFormData.company_name}
                    onChange={(e) => handleQuoteFormChange('company_name', e.target.value)}
                    className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    placeholder="Your company name"
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                  <label className="block text-sm text-gray-400 mb-2">Email</label>
                <input
                  type="email"
                  value={quoteFormData.contact_email}
                  onChange={(e) => handleQuoteFormChange('contact_email', e.target.value)}
                    className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    required
                />
              </div>
              <div>
                  <label className="block text-sm text-gray-400 mb-2">Phone (Optional)</label>
                <input
                  type="tel"
                  value={quoteFormData.contact_phone}
                  onChange={(e) => handleQuoteFormChange('contact_phone', e.target.value)}
                    className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400"
                    placeholder="+1 (555) 123-4567"
                />
                </div>
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">Special Requirements</label>
                <textarea
                  value={quoteFormData.special_requirements}
                  onChange={(e) => handleQuoteFormChange('special_requirements', e.target.value)}
                  className="w-full px-3 py-2 horizon-input rounded-lg text-white focus:outline-none focus:border-cyan-400 h-24"
                  placeholder="Any special requirements, finishing, tolerances, etc."
                />
          </div>
          
              <div className="flex items-center justify-end gap-4">
            <button
                  type="button"
              onClick={() => setSelectedManufacturer(null)}
                  className="px-6 py-3 bg-gray-500/20 text-gray-400 rounded-lg hover:bg-gray-500/30 transition-colors"
            >
                  Cancel
            </button>
            <button
                  type="submit"
                  disabled={quoteSubmitting}
                  className="flex items-center gap-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg transition-colors disabled:opacity-50"
            >
              {quoteSubmitting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                    <Send className="w-4 h-4" />
              )}
                  {quoteSubmitting ? 'Sending...' : 'Send Quote Request'}
            </button>
          </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

export default ManufacturingConnect;