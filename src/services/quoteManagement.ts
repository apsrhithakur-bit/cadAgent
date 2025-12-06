import { supabase } from '../lib/supabase'
import { ManufacturerResult } from './manufacturerSearch'

// Quote management types
export interface QuoteRequest {
  id: string
  user_id: string
  manufacturer_id: string
  manufacturer_name: string
  manufacturer_contact: any
  design_id?: string
  design_name?: string
  project_details: {
    materials: string[]
    method: string
    quantity: number
    complexity: string
    timeline: string
    special_requirements?: string
  }
  contact_info: {
    email: string
    phone?: string
    company?: string
  }
  status: 'pending' | 'sent' | 'responded' | 'accepted' | 'declined'
  quote_response?: {
    price_per_unit: number
    total_price: number
    lead_time: string
    minimum_order: number
    notes?: string
    valid_until?: string
  }
  created_at: string
  updated_at: string
}

export interface QuoteFormData {
  quantity: number
  material_preference: string
  timeline: string
  special_requirements: string
  contact_email: string
  contact_phone?: string
  company_name?: string
}

// Create quote request
export async function createQuoteRequest(
  manufacturer: ManufacturerResult,
  formData: QuoteFormData,
  designData?: any
): Promise<{ success: boolean; quoteId?: string; error?: string }> {
  try {
    console.log('📋 Creating quote request...')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return { success: false, error: 'User not authenticated' }
    }

    const quoteRequest: Omit<QuoteRequest, 'id' | 'created_at' | 'updated_at'> = {
      user_id: user.id,
      manufacturer_id: manufacturer.id,
      manufacturer_name: manufacturer.name,
      manufacturer_contact: manufacturer.contact,
      design_id: designData?.id,
      design_name: designData?.name || designData?.title || 'Custom Design',
      project_details: {
        materials: designData?.materials || ['Unknown'],
        method: designData?.method || 'Unknown',
        quantity: formData.quantity,
        complexity: designData?.complexity || 'moderate',
        timeline: formData.timeline,
        special_requirements: formData.special_requirements
      },
      contact_info: {
        email: formData.contact_email,
        phone: formData.contact_phone,
        company: formData.company_name
      },
      status: 'pending'
    }

    const { data, error } = await supabase
      .from('quote_requests')
      .insert([quoteRequest])
      .select()
      .single()

    if (error) {
      console.error('❌ Error creating quote request:', error)
      return { success: false, error: error.message }
    }

    console.log('✅ Quote request created:', data.id)

    // Try to send notification email (non-blocking)
    try {
      await sendQuoteNotification(data)
    } catch (emailError) {
      console.error('⚠️ Email notification failed:', emailError)
      // Don't fail the quote creation if email fails
    }

    return { success: true, quoteId: data.id }
  } catch (error) {
    console.error('❌ Error creating quote request:', error)
    return { success: false, error: 'Failed to create quote request' }
  }
}

// Send quote notification email
async function sendQuoteNotification(quoteRequest: QuoteRequest): Promise<void> {
  try {
    // Call Supabase Edge Function to send email
    const { error } = await supabase.functions.invoke('send-quote-notification', {
      body: {
        quoteRequest,
        type: 'new_quote_request'
      }
    })

    if (error) {
      console.error('❌ Error sending quote notification:', error)
    } else {
      console.log('✅ Quote notification sent')
    }
  } catch (error) {
    console.error('❌ Error in quote notification:', error)
  }
}

// Get quote requests for user
export async function getUserQuoteRequests(userId: string): Promise<QuoteRequest[]> {
  try {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('❌ Error fetching quote requests:', error)
      return []
    }

    return data || []
  } catch (error) {
    console.error('❌ Error in getUserQuoteRequests:', error)
    return []
  }
}

// Update quote request status
export async function updateQuoteStatus(
  quoteId: string,
  status: QuoteRequest['status'],
  quoteResponse?: QuoteRequest['quote_response']
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: any = { status, updated_at: new Date().toISOString() }
    
    if (quoteResponse) {
      updateData.quote_response = quoteResponse
    }

    const { error } = await supabase
      .from('quote_requests')
      .update(updateData)
      .eq('id', quoteId)

    if (error) {
      console.error('❌ Error updating quote status:', error)
      return { success: false, error: error.message }
    }

    console.log('✅ Quote status updated:', quoteId, status)
    return { success: true }
  } catch (error) {
    console.error('❌ Error in updateQuoteStatus:', error)
    return { success: false, error: 'Failed to update quote status' }
  }
}

// Get quote request by ID
export async function getQuoteRequest(quoteId: string): Promise<QuoteRequest | null> {
  try {
    const { data, error } = await supabase
      .from('quote_requests')
      .select('*')
      .eq('id', quoteId)
      .single()

    if (error) {
      console.error('❌ Error fetching quote request:', error)
      return null
    }

    return data
  } catch (error) {
    console.error('❌ Error in getQuoteRequest:', error)
    return null
  }
}

// Delete quote request
export async function deleteQuoteRequest(quoteId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('quote_requests')
      .delete()
      .eq('id', quoteId)

    if (error) {
      console.error('❌ Error deleting quote request:', error)
      return { success: false, error: error.message }
    }

    console.log('✅ Quote request deleted:', quoteId)
    return { success: true }
  } catch (error) {
    console.error('❌ Error in deleteQuoteRequest:', error)
    return { success: false, error: 'Failed to delete quote request' }
  }
}

// Get quote statistics for user
export async function getQuoteStatistics(userId: string): Promise<{
  total: number
  pending: number
  responded: number
  accepted: number
  declined: number
}> {
  try {
    const quotes = await getUserQuoteRequests(userId)
    
    const stats = {
      total: quotes.length,
      pending: quotes.filter(q => q.status === 'pending' || q.status === 'sent').length,
      responded: quotes.filter(q => q.status === 'responded').length,
      accepted: quotes.filter(q => q.status === 'accepted').length,
      declined: quotes.filter(q => q.status === 'declined').length
    }

    return stats
  } catch (error) {
    console.error('❌ Error getting quote statistics:', error)
    return { total: 0, pending: 0, responded: 0, accepted: 0, declined: 0 }
  }
}

// Format quote for display
export function formatQuoteRequest(quote: QuoteRequest): {
  displayName: string
  statusColor: string
  statusText: string
  priceDisplay: string
  timeAgo: string
} {
  const now = new Date()
  const created = new Date(quote.created_at)
  const diffMs = now.getTime() - created.getTime()
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
  const diffDays = Math.floor(diffHours / 24)

  let timeAgo = ''
  if (diffDays > 0) {
    timeAgo = `${diffDays} day${diffDays > 1 ? 's' : ''} ago`
  } else if (diffHours > 0) {
    timeAgo = `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`
  } else {
    timeAgo = 'Just now'
  }

  const statusColors = {
    pending: 'text-yellow-400',
    sent: 'text-blue-400',
    responded: 'text-green-400',
    accepted: 'text-green-500',
    declined: 'text-red-400'
  }

  const statusTexts = {
    pending: 'Pending',
    sent: 'Sent',
    responded: 'Quote Received',
    accepted: 'Accepted',
    declined: 'Declined'
  }

  let priceDisplay = 'Quote pending'
  if (quote.quote_response) {
    priceDisplay = `$${quote.quote_response.price_per_unit}/unit ($${quote.quote_response.total_price} total)`
  }

  return {
    displayName: `${quote.manufacturer_name} - ${quote.design_name}`,
    statusColor: statusColors[quote.status] || 'text-gray-400',
    statusText: statusTexts[quote.status] || 'Unknown',
    priceDisplay,
    timeAgo
  }
}