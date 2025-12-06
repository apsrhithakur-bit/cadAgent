import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './useAuth'
import { getManufacturerUsage } from '../services/manufacturerUsage'

export interface UsageData {
  id: string
  designs_used: number
  refine_chats_used: number
  manufacturer_searches_used: number
  patent_searches_used?: number
  period_start: string
  period_end: string
}

export interface UsageLimits {
  designs: number
  refine_chats: number
  manufacturer_searches: number
  patent_searches: number
}

export function useUsage() {
  const { user, profile } = useAuth()
  const [usage, setUsage] = useState<UsageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasInitialized, setHasInitialized] = useState(false)

  // Development mode detection - enhanced for network IPs
  const isDevMode = React.useMemo(() => {
    const hostname = window.location.hostname;
    const port = window.location.port;
    const href = window.location.href;
    
    // Detect development patterns
    const isIPAddress = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
    const isPrivateNetwork = /^(192\.168\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|10\.|127\.)/.test(hostname);
    const isDevPort = port === '5173' || port === '3000' || port === '8080'; // Common dev ports
    
    // Enhanced development detection
    const isDevelopment = (isIPAddress || isLocalhost || isPrivateNetwork) && 
                         (isDevPort || !href.includes('agenticad.store'));
    
    console.log('🔧 useUsage: Development mode analysis:', {
      hostname,
      port,
      isIPAddress,
      isLocalhost,
      isPrivateNetwork,
      isDevPort,
      isDevelopment,
      href: href.substring(0, 50) + '...'
    });
    
    if (isDevelopment) {
      console.log('🔧 useUsage: Development mode detected, usage limits disabled');
    }
    
    return isDevelopment;
  }, []);

  // Helper function to combine usage data with manufacturer search data
  const setUsageWithManufacturerData = async (baseUsage: any) => {
    try {
      // Fetch manufacturer search usage
      const manufacturerUsage = await getManufacturerUsage(user!.id)
      const manufacturerSearchesUsed = manufacturerUsage.success ? 
        manufacturerUsage.usage?.searches_used || 0 : 0

      // Combine the data
      const combinedUsage: UsageData = {
        ...baseUsage,
        manufacturer_searches_used: manufacturerSearchesUsed,
        patent_searches_used: baseUsage.patent_searches_used || 0
      }
      
      setUsage(combinedUsage)
    } catch (error) {
      console.error('❌ Error fetching manufacturer usage:', error)
      // Fallback: set usage without manufacturer data
      setUsage({ ...baseUsage, manufacturer_searches_used: 0 })
    }
  }

  const getUsageLimits = (profile: any): UsageLimits => {
    // In development mode, return unlimited usage
    if (isDevMode) {
      console.log('🔧 Development mode: Returning unlimited usage limits');
      return { 
        designs: 999999, 
        refine_chats: 999999, 
        manufacturer_searches: 999999, 
        patent_searches: 999999 
      };
    }

    const tier = profile?.subscription_tier || 'free';
    let baseLimits: UsageLimits;

    switch (tier) {
      case 'plus':
        baseLimits = { designs: 10, refine_chats: 100, manufacturer_searches: 10, patent_searches: 5 };
        break;
      case 'pro':
        baseLimits = { designs: 100, refine_chats: 1000, manufacturer_searches: 10, patent_searches: 30 };
        break;
      default:
        baseLimits = { designs: 2, refine_chats: 5, manufacturer_searches: 10, patent_searches: 2 };
        break;
    }
    
    // Add any purchased searches to the base limit
    const extraSearches = profile?.extra_patent_searches || 0;
    baseLimits.patent_searches += extraSearches;
    
    console.log('📊 Usage limits calculation:', {
      tier,
      basePatentSearches: baseLimits.patent_searches - extraSearches,
      extraPatentSearches: extraSearches,
      totalPatentSearches: baseLimits.patent_searches,
      profileExtraSearches: profile?.extra_patent_searches
    });
    
    return baseLimits;
  }

  useEffect(() => {
    // Only fetch ONCE when we have both user AND profile AND haven't initialized yet
    if (user && profile && !hasInitialized) {
      console.log('📊 UseUsage: Fetching usage for first time')
      setHasInitialized(true)
      fetchCurrentUsage()
    } else if (!user || !profile) {
      // Clear usage when no user/profile but don't reset hasInitialized
      setUsage(null)
      setLoading(false)
    } else if (user && profile && hasInitialized && !loading) {
      // We have data and have already initialized, so we're good
      console.log('📊 UseUsage: Already initialized, no fetch needed')
    }
  }, [user?.id, profile?.id, hasInitialized]) // Removed usage and loading from dependencies

  const fetchCurrentUsage = async () => {
    if (!user) {
      console.log('📊 UseUsage: No user, skipping fetch')
      setLoading(false)
      return
    }

    try {
      console.log('📊 UseUsage: Starting usage fetch for user:', user.id)
      setLoading(true)
      
      // Get current month period to match database records
      const now = new Date()
      const year = now.getFullYear()
      const month = now.getMonth() // 0-based month
      
      // Create month boundaries to match how database creates records
      // Database uses: DATE_TRUNC('month', NOW()) for period_start
      const currentMonthStart = new Date(Date.UTC(year, month, 1))
      const currentMonthEnd = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999))
      
      console.log('🔍 Looking for usage record for month starting:', currentMonthStart.toISOString())

      // Look for usage record where current date falls within the period range
      const { data, error } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', user.id)
        .lte('period_start', now.toISOString()) // period_start <= now
        .gte('period_end', now.toISOString())   // period_end >= now
        .order('period_start', { ascending: false })
        .limit(1)
        .maybeSingle() // Use maybeSingle instead of single to avoid errors when no data

      if (error) {
        console.error('❌ Usage tracking table error:', error)
        
        // If table doesn't exist or access is denied, create a default usage object
        if (error.code === 'PGRST301' || error.message?.includes('relation') || error.code === '42P01') {
          console.log('📊 Usage tracking table not available, using default limits')
          setUsage({
            id: 'default',
            designs_used: 0,
            refine_chats_used: 0,
            manufacturer_searches_used: 0,
            patent_searches_used: 0,
            period_start: currentMonthStart.toISOString(),
            period_end: currentMonthEnd.toISOString(),
          })
          return
        }
        
        throw error
      }

      if (!data) {
        console.log('📊 No usage record found, creating new one')
        // Create new usage record for this period
        const newUsage = {
          user_id: user.id,
          designs_used: 0,
          refine_chats_used: 0,
          period_start: currentMonthStart.toISOString(),
          period_end: currentMonthEnd.toISOString(),
        }

        const { data: created, error: createError } = await supabase
          .from('usage_tracking')
          .insert(newUsage)
          .select()
          .single()

        if (createError) {
          console.error('❌ Error creating usage record:', createError)
          // Fall back to default usage object
          setUsage({
            id: 'default',
            designs_used: 0,
            refine_chats_used: 0,
            manufacturer_searches_used: 0,
            period_start: currentMonthStart.toISOString(),
            period_end: currentMonthEnd.toISOString(),
          })
          return
        }
        
        console.log('✅ Created new usage record:', created)
        await setUsageWithManufacturerData(created)
      } else {
        console.log('✅ Found existing usage record:', data)
        await setUsageWithManufacturerData(data)
      }
    } catch (error) {
      console.error('❌ Error fetching usage:', error)
      
      // Provide default usage limits as fallback
      const nowFallback = new Date()
      const fallbackStart = new Date(Date.UTC(nowFallback.getFullYear(), nowFallback.getMonth(), 1))
      const fallbackEnd = new Date(Date.UTC(nowFallback.getFullYear(), nowFallback.getMonth() + 1, 0, 23, 59, 59, 999))
      
      setUsage({
        id: 'default',
        designs_used: 0,
        refine_chats_used: 0,
        manufacturer_searches_used: 0,
        period_start: fallbackStart.toISOString(),
        period_end: fallbackEnd.toISOString(),
      })
    } finally {
      setLoading(false)
    }
  }

  const incrementDesignUsage = async () => {
    // In development mode, always allow usage (check this FIRST, before auth checks)
    if (isDevMode) {
      console.log('🔧 Development mode: Bypassing design usage limits');
      // Create default usage if it doesn't exist in dev mode
      if (!usage) {
        const now = new Date();
        const fallbackStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const fallbackEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
        setUsage({
          id: 'dev-default',
          designs_used: 1,
          refine_chats_used: 0,
          manufacturer_searches_used: 0,
          patent_searches_used: 0,
          period_start: fallbackStart.toISOString(),
          period_end: fallbackEnd.toISOString(),
        });
      } else {
        setUsage(prev => prev ? { ...prev, designs_used: prev.designs_used + 1 } : null);
      }
      return true;
    }

    if (!user || !usage || !profile) return false

    const limits = getUsageLimits(profile)
    
    if (usage.designs_used >= limits.designs) {
      return false // Usage limit exceeded
    }

    // If using default usage (table not available), just update local state
    if (usage.id === 'default') {
      console.log('📊 Using default usage tracking, updating locally')
      setUsage(prev => prev ? { ...prev, designs_used: prev.designs_used + 1 } : null)
      return true
    }

    try {
      const { error } = await supabase
        .from('usage_tracking')
        .update({ 
          designs_used: usage.designs_used + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', usage.id)

      if (error) {
        console.error('❌ Error incrementing design usage:', error)
        // Still increment locally if database fails
        setUsage(prev => prev ? { ...prev, designs_used: prev.designs_used + 1 } : null)
        return true
      }

      setUsage(prev => prev ? { ...prev, designs_used: prev.designs_used + 1 } : null)
      return true
    } catch (error) {
      console.error('❌ Error incrementing design usage:', error)
      // Still increment locally if database fails
      setUsage(prev => prev ? { ...prev, designs_used: prev.designs_used + 1 } : null)
      return true
    }
  }

  const incrementRefineUsage = async () => {
    // In development mode, always allow usage (check this FIRST, before auth checks)
    if (isDevMode) {
      console.log('🔧 Development mode: Bypassing refine chat usage limits');
      // Create default usage if it doesn't exist in dev mode
      if (!usage) {
        const now = new Date();
        const fallbackStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const fallbackEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
        setUsage({
          id: 'dev-default',
          designs_used: 0,
          refine_chats_used: 1,
          manufacturer_searches_used: 0,
          patent_searches_used: 0,
          period_start: fallbackStart.toISOString(),
          period_end: fallbackEnd.toISOString(),
        });
      } else {
        setUsage(prev => prev ? { ...prev, refine_chats_used: prev.refine_chats_used + 1 } : null);
      }
      return true;
    }

    if (!user || !usage || !profile) return false

    const limits = getUsageLimits(profile)
    
    if (usage.refine_chats_used >= limits.refine_chats) {
      return false // Usage limit exceeded
    }

    // If using default usage (table not available), just update local state
    if (usage.id === 'default') {
      console.log('📊 Using default usage tracking, updating locally')
      setUsage(prev => prev ? { ...prev, refine_chats_used: prev.refine_chats_used + 1 } : null)
      return true
    }

    try {
      const { error } = await supabase
        .from('usage_tracking')
        .update({ 
          refine_chats_used: usage.refine_chats_used + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', usage.id)

      if (error) {
        console.error('❌ Error incrementing refine usage:', error)
        // Still increment locally if database fails
        setUsage(prev => prev ? { ...prev, refine_chats_used: prev.refine_chats_used + 1 } : null)
        return true
      }

      setUsage(prev => prev ? { ...prev, refine_chats_used: prev.refine_chats_used + 1 } : null)
      return true
    } catch (error) {
      console.error('❌ Error incrementing refine usage:', error)
      // Still increment locally if database fails
      setUsage(prev => prev ? { ...prev, refine_chats_used: prev.refine_chats_used + 1 } : null)
      return true
    }
  }

  const canUseDesign = () => {
    // In development mode, always allow usage
    if (isDevMode) {
      console.log('🔧 canUseDesign: Bypassing limits (dev mode)');
      return true;
    }
    
    if (!usage || !profile) {
      console.log('📊 canUseDesign: false (missing usage or profile)');
      return false;
    }
    
    const limits = getUsageLimits(profile);
    const canUse = usage.designs_used < limits.designs;
    console.log('📊 canUseDesign:', {
      used: usage.designs_used,
      limit: limits.designs,
      canUse,
      tier: profile?.subscription_tier || 'free'
    });
    
    return canUse;
  }

  const canUseRefine = () => {
    // In development mode, always allow usage
    if (isDevMode) {
      return true;
    }
    
    if (!usage || !profile) return false
    const limits = getUsageLimits(profile)
    return usage.refine_chats_used < limits.refine_chats
  }

  const incrementPatentSearchUsage = async () => {
    // In development mode, always allow usage (check this FIRST, before auth checks)
    if (isDevMode) {
      console.log('🔧 Development mode: Bypassing patent search usage limits');
      // Create default usage if it doesn't exist in dev mode
      if (!usage) {
        const now = new Date();
        const fallbackStart = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
        const fallbackEnd = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));
        setUsage({
          id: 'dev-default',
          designs_used: 0,
          refine_chats_used: 0,
          manufacturer_searches_used: 0,
          patent_searches_used: 1,
          period_start: fallbackStart.toISOString(),
          period_end: fallbackEnd.toISOString(),
        });
      } else {
        setUsage(prev => prev ? { ...prev, patent_searches_used: (prev.patent_searches_used || 0) + 1 } : null);
      }
      return true;
    }

    if (!user || !usage || !profile) return false

    const limits = getUsageLimits(profile)
    const currentUsage = usage.patent_searches_used || 0
    
    if (currentUsage >= limits.patent_searches) {
      return false // Usage limit exceeded
    }

    // If using default usage (table not available), just update local state
    if (usage.id === 'default') {
      console.log('📊 Using default usage tracking, updating patent searches locally')
      setUsage(prev => prev ? { ...prev, patent_searches_used: (prev.patent_searches_used || 0) + 1 } : null)
      return true
    }

    try {
      const { error } = await supabase
        .from('usage_tracking')
        .update({ 
          patent_searches_used: currentUsage + 1,
          updated_at: new Date().toISOString()
        })
        .eq('id', usage.id)

      if (error) {
        console.error('❌ Error incrementing patent search usage:', error)
        // Still increment locally if database fails
        setUsage(prev => prev ? { ...prev, patent_searches_used: (prev.patent_searches_used || 0) + 1 } : null)
        return true
      }

      setUsage(prev => prev ? { ...prev, patent_searches_used: (prev.patent_searches_used || 0) + 1 } : null)
      return true
    } catch (error) {
      console.error('❌ Error incrementing patent search usage:', error)
      // Still increment locally if database fails
      setUsage(prev => prev ? { ...prev, patent_searches_used: (prev.patent_searches_used || 0) + 1 } : null)
      return true
    }
  }

  const canUsePatentSearch = () => {
    // In development mode, always allow usage
    if (isDevMode) {
      console.log('🔧 canUsePatentSearch: true (development mode)');
      return true;
    }
    
    if (!usage || !profile) {
      console.log('📊 canUsePatentSearch: false (missing usage or profile)');
      return false;
    }
    
    const limits = getUsageLimits(profile); // Pass the whole profile object
    const currentUsage = usage.patent_searches_used || 0;
    const canUse = currentUsage < limits.patent_searches;
    
    console.log('📊 canUsePatentSearch:', {
      currentUsage,
      limit: limits.patent_searches,
      canUse,
      extraSearches: profile?.extra_patent_searches || 0
    });
    
    return canUse;
  }

  return {
    usage,
    loading,
    getUsageLimits,
    incrementDesignUsage,
    incrementRefineUsage,
    incrementPatentSearchUsage,
    canUseDesign,
    canUseRefine,
    canUsePatentSearch,
    refreshUsage: fetchCurrentUsage,
  }
}