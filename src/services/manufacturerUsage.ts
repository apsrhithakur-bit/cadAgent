import { supabase } from '../lib/supabase'

export interface ManufacturerUsageStats {
  searches_used: number
  quotes_sent: number
  month_year: string
  has_access: boolean
}

export interface ManufacturerUsageResponse {
  success: boolean
  usage?: ManufacturerUsageStats
  error?: string
}

/**
 * Get current month in YYYY-MM format
 */
function getCurrentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

/**
 * Get manufacturer usage statistics for the current user
 * @param userId - The user ID to get stats for
 * @param monthYear - Optional month year (defaults to current month)
 * @returns Promise with usage statistics
 */
export async function getManufacturerUsage(
  userId: string,
  monthYear?: string
): Promise<ManufacturerUsageResponse> {
  try {
    const targetMonth = monthYear || getCurrentMonth()
    
    const { data, error } = await supabase.rpc('get_manufacturer_usage_stats', {
      target_user_id: userId,
      target_month_year: targetMonth
    })

    if (error) {
      console.error('Error fetching manufacturer usage:', error)
      return { success: false, error: error.message }
    }

    if (!data || data.length === 0) {
      return {
        success: true,
        usage: {
          searches_used: 0,
          quotes_sent: 0,
          month_year: targetMonth,
          has_access: false
        }
      }
    }

    return {
      success: true,
      usage: data[0]
    }
  } catch (error) {
    console.error('Error in getManufacturerUsage:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Track a manufacturer search
 * @param userId - The user ID
 * @returns Promise with success status
 */
export async function trackManufacturerSearch(userId: string): Promise<ManufacturerUsageResponse> {
  try {
    const currentMonth = getCurrentMonth()
    
    const { error } = await supabase.rpc('increment_manufacturer_usage', {
      p_user_id: userId,
      p_month_year: currentMonth,
      p_search_increment: 1,
      p_quote_increment: 0
    })

    if (error) {
      console.error('Error tracking manufacturer search:', error)
      return { success: false, error: error.message }
    }

    // Get updated usage stats
    const updatedStats = await getManufacturerUsage(userId)
    return updatedStats
  } catch (error) {
    console.error('Error in trackManufacturerSearch:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Track a quote sent to manufacturer
 * @param userId - The user ID
 * @returns Promise with success status
 */
export async function trackManufacturerQuote(userId: string): Promise<ManufacturerUsageResponse> {
  try {
    const currentMonth = getCurrentMonth()
    
    const { error } = await supabase.rpc('increment_manufacturer_usage', {
      p_user_id: userId,
      p_month_year: currentMonth,
      p_search_increment: 0,
      p_quote_increment: 1
    })

    if (error) {
      console.error('Error tracking manufacturer quote:', error)
      return { success: false, error: error.message }
    }

    // Get updated usage stats
    const updatedStats = await getManufacturerUsage(userId)
    return updatedStats
  } catch (error) {
    console.error('Error in trackManufacturerQuote:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check if user has manufacturer access
 * @param userId - The user ID
 * @returns Promise with access status
 */
export async function checkManufacturerAccess(userId: string): Promise<{
  success: boolean
  hasAccess?: boolean
  error?: string
}> {
  try {
    const { data, error } = await supabase.rpc('has_manufacturer_access', {
      user_id: userId
    })

    if (error) {
      console.error('Error checking manufacturer access:', error)
      return { success: false, error: error.message }
    }

    return {
      success: true,
      hasAccess: data
    }
  } catch (error) {
    console.error('Error in checkManufacturerAccess:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
}

/**
 * Check if user can perform more manufacturer searches (10 per month limit)
 * @param userId - The user ID
 * @returns Promise with search availability status
 */
export async function canPerformManufacturerSearch(userId: string): Promise<{
  success: boolean
  canSearch?: boolean
  remainingSearches?: number
  error?: string
}> {
  try {
    const usageResult = await getManufacturerUsage(userId)
    
    if (!usageResult.success || !usageResult.usage) {
      return { success: false, error: usageResult.error || 'Failed to get usage data' }
    }

    const MONTHLY_SEARCH_LIMIT = 10
    const searchesUsed = usageResult.usage.searches_used
    const remainingSearches = Math.max(0, MONTHLY_SEARCH_LIMIT - searchesUsed)
    const canSearch = remainingSearches > 0

    return {
      success: true,
      canSearch,
      remainingSearches
    }
  } catch (error) {
    console.error('Error in canPerformManufacturerSearch:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }
  }
} 