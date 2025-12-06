// Remove the old import and use built-in Deno.serve
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

interface PatentSearchRequest {
  action: 'search_patents'
  params: {
    query: string
    country?: string
    limit?: number
    source?: 'serpapi' | 'google' | 'uspto' | 'all'
  }
}

console.log('🚀 Google Patent Search function starting...')

Deno.serve(async (req) => {
  console.log(`📡 ${req.method} request received`)
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('✅ Handling CORS preflight request')
    return new Response('ok', { 
      headers: corsHeaders,
      status: 200
    })
  }

  try {
    console.log('📥 Processing patent search request...')
    
    const { action, params }: PatentSearchRequest = await req.json()
    
    console.log('🔍 Patent search request:', { action, params })

    // Get API keys from environment
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY')
    const USPTO_API_KEY = Deno.env.get('USPTO_API_KEY')
    const SERPAPI_KEY = Deno.env.get('SERPAPI_KEY') || 'f68ea543f1c383b603344460317a7e16f39405806efa9bbbcc584514872ef2fc'
    
    console.log('🔑 API Key Status:')
    console.log('  - GOOGLE_API_KEY:', GOOGLE_API_KEY ? '✅ Present' : '❌ Missing')
    console.log('  - USPTO_API_KEY:', USPTO_API_KEY ? '✅ Present' : '❌ Missing')  
    console.log('  - SERPAPI_KEY:', SERPAPI_KEY ? `✅ Present (${SERPAPI_KEY.length} chars)` : '❌ Missing')

    let result

    switch (action) {
      case 'search_patents':
        result = await searchAllPatents(params, GOOGLE_API_KEY, USPTO_API_KEY, SERPAPI_KEY)
        break
      default:
        throw new Error(`Unsupported action: ${action}`)
    }

    console.log('✅ Patent search completed, returning results')
    
    return new Response(
      JSON.stringify(result),
      { 
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        },
        status: 200
      }
    )

  } catch (error) {
    console.error('❌ Patent search error:', error)
    
    return new Response(
      JSON.stringify({ 
        error: error.message,
        results: [] 
      }),
      { 
        status: 500,
        headers: { 
          ...corsHeaders, 
          'Content-Type': 'application/json' 
        }
      }
    )
  }
})

// Combined patent search using SerpApi, Google Patents, and USPTO
async function searchAllPatents(params: any, googleApiKey?: string, usptoApiKey?: string, serpApiKey?: string) {
  try {
    console.log('🔍 Searching all patent sources...', params)
    
    const searchPromises = []
    
    // Prioritize SerpApi as primary source if available
    if (serpApiKey && (params.source === 'serpapi' || params.source === 'all' || !params.source)) {
      console.log('🎯 Using SerpApi as primary search...')
      searchPromises.push(searchSerpApiPatents(params, serpApiKey))
    }
    
    // If USPTO is specifically requested or preferred, try it
    if (params.source === 'uspto' || params.source === 'all' || (!serpApiKey && !googleApiKey)) {
      console.log('🎯 Adding USPTO search...')
      searchPromises.push(searchUSPTOPatents(params, usptoApiKey))
    }
    
    // Add Google Patents search if API key available and not specifically requesting other sources only
    if (googleApiKey && (params.source === 'google' || params.source === 'all' || (!serpApiKey && params.source !== 'uspto'))) {
      console.log('🎯 Adding Google Patents search...')
      searchPromises.push(searchGooglePatents(params, googleApiKey))
    }
    
    // Search all sources in parallel
    const results = await Promise.allSettled(searchPromises)
    
    let allPatents = []
    let sources = []
    
    // Combine results from all successful searches
    results.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.results) {
        allPatents.push(...result.value.results)
        sources.push(result.value.source)
      }
    })
    
    // If no real results found, return empty results with clear message
    if (allPatents.length === 0) {
      console.log('⚠️ No real patent results found from any API source')
      console.log('🔍 This could be due to:')
      console.log('  - Invalid or rate-limited API keys')
      console.log('  - Query returning no matches')
      console.log('  - API service issues')
      
      return {
        results: [],
        source: sources.join('+') || 'none',
        message: `No patents found for query: "${params.query}". Try different search terms.`,
        count: 0
      }
    }
    
    // Remove duplicates and limit results
    const uniquePatents = removeDuplicates(allPatents)
    const limitedResults = uniquePatents.slice(0, params.limit || 20)
    
    console.log('✅ Combined search completed:', limitedResults.length, 'results from', sources.join(', '))
    
    return {
      results: limitedResults,
      source: sources.join('+'),
      count: limitedResults.length
    }
    
  } catch (error) {
    console.error('❌ Error in combined patent search:', error)
    
    return {
      results: [],
      source: 'error',
      error: error.message,
      message: 'Patent search failed. Please try again with different search terms.'
    }
  }
}

async function searchGooglePatents(params: any, apiKey: string) {
  try {
    console.log('🔍 Searching Google Patents with:', params)
    
    // Use the specific Google Patents Custom Search Engine
    const query = encodeURIComponent(params.query)
    const patentsCseId = '712d659ab48694b0d' // From the provided HTML code
    const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${patentsCseId}&q=${query}&num=${params.limit || 10}`
    
    const response = await fetch(searchUrl)
    
    if (!response.ok) {
      console.error('❌ Google API error:', response.status, response.statusText)
      
      // Fallback: Try USPTO API or return mock data
      return {
        results: [],
        source: 'mock',
        message: 'Using mock data due to API limitations'
      }
    }

    const data = await response.json()
    
    if (!data.items) {
      console.log('⚠️ No Google search results found')
      return {
        results: [],
        source: 'mock',
        message: 'No results found, using mock data'
      }
    }

    // Parse Google search results to extract patent information
    const patents = data.items.map((item: any, index: number) => {
      const url = item.link
      const patentMatch = url.match(/patent\/([A-Z]{2}\d+[A-Z]?\d*)/)
      const patentNumber = patentMatch ? patentMatch[1] : `UNKNOWN-${index}`
      
      return {
        publication_number: patentNumber,
        title: item.title?.replace(' - Google Patents', '') || 'Unknown Title',
        abstract: item.snippet || 'No abstract available',
        assignee: extractAssigneeFromSnippet(item.snippet),
        filing_date: extractDateFromSnippet(item.snippet, 'filed'),
        publication_date: extractDateFromSnippet(item.snippet, 'published'),
        grant_date: extractDateFromSnippet(item.snippet, 'granted'),
        country_code: patentNumber.match(/^([A-Z]{2})/)?.[1] || 'US',
        legal_status: 'active', // Default status
        classification_cpc: [],
        pdf_url: url
      }
    })

    console.log('✅ Found', patents.length, 'patents from Google search')
    return {
      results: patents,
      source: 'google_search'
    }

  } catch (error) {
    console.error('❌ Error searching Google Patents:', error)
    
    // Return mock data as fallback
    return {
      results: [],
      source: 'mock',
      error: error.message
    }
  }
}

// SerpApi Google Patents search
async function searchSerpApiPatents(params: any, apiKey: string) {
  try {
    console.log('🔍 Searching patents via SerpApi...', params)
    console.log('🔑 API Key Status:', apiKey ? `✅ Present (${apiKey.length} chars)` : '❌ Missing')
    
    // Ensure num parameter is within SerpApi's required range (10-100)
    const numResults = Math.max(10, Math.min(100, params.limit || 20))
    
    // Build SerpApi search parameters with better defaults
    const searchParams = new URLSearchParams({
      engine: 'google_patents',
      api_key: apiKey,
      q: params.query,
      num: numResults.toString(), // Must be string and between 10-100
      sort: 'new', // Fixed: use 'new' instead of 'date'
      hl: 'en',
      gl: 'us'
    })
    
    // Add country filter if specified
    if (params.country && params.country !== 'ALL' && params.country !== 'US') {
      searchParams.append('country', params.country.toLowerCase())
    }
    
    const searchUrl = `https://serpapi.com/search?${searchParams.toString()}`
    console.log('📡 SerpApi request URL:', searchUrl.replace(apiKey, '[API_KEY_REDACTED]'))
    console.log('📊 Using num parameter:', numResults, '(within required 10-100 range)')
    
    const response = await fetch(searchUrl, {
      method: 'GET',
      headers: {
        'User-Agent': 'AgentiCAD-Patent-Search/1.0'
      }
    })
    
    console.log('📡 SerpApi response status:', response.status, response.statusText)
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ SerpApi HTTP Error:', response.status, errorText)
      throw new Error(`SerpApi HTTP Error: ${response.status} - ${errorText}`)
    }
    
    const data = await response.json()
    console.log('📡 SerpApi response keys:', Object.keys(data))
    
    // Check for API errors
    if (data.error) {
      console.error('❌ SerpApi API Error:', data.error)
      throw new Error(`SerpApi API Error: ${data.error}`)
    }
    
    // Debug the response structure
    console.log('🔍 SerpApi search info:', data.search_information)
    if (data.search_information?.organic_results_state) {
      console.log('🔍 Organic results state:', data.search_information.organic_results_state)
    }
    
    // Check multiple possible result fields
    const results = data.organic_results || data.patents_results || data.results || []
    console.log('📊 SerpApi found', results.length, 'results')
    
    if (results.length === 0) {
      console.log('⚠️ No patents found via SerpApi for query:', params.query)
      console.log('🔍 Full SerpApi response for debugging:', JSON.stringify(data, null, 2))
      return {
        results: [],
        source: 'serpapi',
        message: `No patents found for query: ${params.query}`
      }
    }
    
    console.log('✅ SerpApi returned', results.length, 'patent results')
    console.log('🔍 First result structure:', JSON.stringify(results[0], null, 2))
    
    // Enhanced data extraction from SerpApi results
    const patents = results.map((result: any, index: number) => {
      // Multiple attempts to extract patent number
      const patentNumber = result.publication_number || 
                          result.patent_number ||
                          result.result_id || 
                          result.link?.match(/patent\/([A-Z]{2}\d+[A-Z]?\d*)/)?.[1] || 
                          result.link?.match(/(\d{7,})/)?.[1] ||
                          `SERP-${Date.now()}-${index}`
      
      // Enhanced title extraction
      let title = result.title || result.invention_title || 'Patent Document'
      title = title.replace(/^Patent\s+/i, '').replace(/\s+-\s+Google Patents?$/, '').trim()
      
      // Enhanced inventor extraction - try multiple fields
      const inventor = result.inventor || 
                      result.inventors?.[0] || 
                      result.inventor_name ||
                      result.applicant ||
                      result.applicants?.[0] ||
                      extractInventorFromText(result.snippet || '') ||
                      'Not Listed'
      
      // Enhanced assignee extraction - try multiple fields  
      const assignee = result.assignee || 
                      result.assignees?.[0] ||
                      result.assignee_name ||
                      result.owner ||
                      result.applicant_name ||
                      extractAssigneeFromText(result.snippet || '') ||
                      'Not Listed'
      
      // Enhanced abstract/description
      let abstract = result.abstract || 
                    result.snippet || 
                    result.description ||
                    'Abstract not available'
      
      // Clean up abstract
      abstract = abstract.replace(/\s+/g, ' ').trim()
      if (abstract.length > 500) {
        abstract = abstract.substring(0, 500) + '...'
      }
      
      // Enhanced date extraction
      const filingDate = result.filing_date || 
                        result.priority_date ||
                        result.application_date ||
                        ''
      
      const publicationDate = result.publication_date || 
                             result.grant_date || 
                             ''
      
      const grantDate = result.grant_date || 
                       result.issue_date ||
                       ''
      
      // Enhanced status determination
      let legalStatus = 'pending'
      if (result.legal_status) {
        legalStatus = result.legal_status.toLowerCase()
      } else if (grantDate) {
        legalStatus = 'active'
      } else if (publicationDate) {
        legalStatus = 'pending'
      }
      
      // Enhanced classification
      const classification = result.classification_cpc || 
                           result.classifications ||
                           result.cpc_classes ||
                           []
      
      // Enhanced URL
      const pdfUrl = result.pdf_url || 
                    result.link ||
                    result.url ||
                    `https://patents.google.com/patent/${patentNumber}`
      
      const patent = {
        publication_number: patentNumber,
        title: title,
        abstract: abstract,
        inventor: inventor,
        assignee: assignee,
        filing_date: filingDate,
        publication_date: publicationDate,
        grant_date: grantDate,
        country_code: result.country_code || result.country || params.country || 'US',
        legal_status: legalStatus,
        classification_cpc: Array.isArray(classification) ? classification : [],
        pdf_url: pdfUrl
      }
      
      console.log(`📋 Patent ${index + 1}:`, {
        number: patent.publication_number,
        title: patent.title.substring(0, 50) + '...',
        inventor: patent.inventor,
        assignee: patent.assignee,
        status: patent.legal_status
      })
      
      return patent
    })
    
    console.log('✅ Successfully processed', patents.length, 'patents from SerpApi')
    return {
      results: patents,
      source: 'serpapi'
    }
    
  } catch (error) {
    console.error('❌ Error searching via SerpApi:', error)
    console.error('❌ Error stack:', error.stack)
    
    return {
      results: [],
      source: 'serpapi',
      error: error.message
    }
  }
}

// Enhanced text extraction functions
function extractInventorFromText(text: string): string {
  if (!text) return ''
  
  const patterns = [
    /inventor[s]?\s*:?\s*([A-Za-z\s,.-]+?)(?:\s*(?:assignee|filed|published|US\d+|$))/i,
    /(?:by|inventor)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/i,
    /([A-Z][a-z]+\s+[A-Z][a-z]+)(?:\s*-\s*inventor)/i
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const inventor = match[1].trim().replace(/[,;.]$/, '')
      if (inventor.length > 2 && inventor.length < 50) {
        return inventor.split(',')[0].trim() // Take first inventor if multiple
      }
    }
  }
  
  return ''
}

function extractAssigneeFromText(text: string): string {
  if (!text) return ''
  
  const patterns = [
    /assignee[s]?\s*:?\s*([A-Za-z\s&.,Inc]+?)(?:\s*(?:filed|published|inventor|US\d+|$))/i,
    /(?:assigned to|assignee)\s+([A-Z][A-Za-z\s&.,Inc]+)/i,
    /([A-Z][A-Za-z\s&.,]*(?:Inc|Corp|Corporation|Company|Ltd|Limited|LLC))/i
  ]
  
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      const assignee = match[1].trim().replace(/[,;.]$/, '')
      if (assignee.length > 2 && assignee.length < 80) {
        return assignee
      }
    }
  }
  
  return ''
}

function extractAssigneeFromSnippet(snippet: string): string {
  // Try to extract assignee from snippet text
  const assigneeMatch = snippet.match(/(?:by|assigned to|assignee:)\s+([^,.\n]+)/i)
  return assigneeMatch ? assigneeMatch[1].trim() : 'Not Listed'
}

function extractDateFromSnippet(snippet: string, type: 'filed' | 'published' | 'granted'): string {
  // Try to extract dates from snippet
  const datePattern = type === 'filed' ? /filed?\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4})/i :
                      type === 'published' ? /published?\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4})/i :
                      /granted?\s+(\d{4}-\d{2}-\d{2}|\w+\s+\d{1,2},?\s+\d{4})/i
  
  const dateMatch = snippet.match(datePattern)
  return dateMatch ? dateMatch[1] : ''
}

// USPTO search function with multiple API endpoints
async function searchUSPTOPatents(params: any, apiKey?: string) {
  try {
    console.log('🔍 Searching USPTO Open Data Portal...', params)
    
    const searchQuery = encodeURIComponent(params.query)
    
    // Try multiple USPTO API endpoints for better coverage
    const usptoEndpoints = [
      // USPTO Patent Examination Research Dataset (PatEx)
      `https://developer.uspto.gov/ptab-api/trials?q=${searchQuery}&rows=${params.limit || 10}`,
      // USPTO Open Data Portal
      `https://data.uspto.gov/apis/patent-file-wrapper/search?q=${searchQuery}&rows=${params.limit || 10}&sort=applnId+desc`,
      // USPTO Patent Grants
      `https://api.patents.uspto.gov/search?q=${searchQuery}&f=publication_number,title,inventor,assignee,filing_date,publication_date,abstract&o=publication_date+desc&s=${params.limit || 10}`
    ]
    
    for (const url of usptoEndpoints) {
      try {
        console.log(`🔍 Trying USPTO endpoint: ${url.split('?')[0]}...`)
        
        const headers: Record<string, string> = {
          'Accept': 'application/json',
          'User-Agent': 'AgentiCAD-PatentSearch/1.0',
          'Content-Type': 'application/json'
        }
        
        // Add API key if available
        if (apiKey) {
          headers['X-API-KEY'] = apiKey
          headers['Authorization'] = `Bearer ${apiKey}`
        }
        
        const response = await fetch(url, {
          method: 'GET',
          headers
        })
        
        if (!response.ok) {
          console.warn(`❌ USPTO endpoint error: ${response.status} ${response.statusText}`)
          continue // Try next endpoint
        }
        
        const data = await response.json()
        console.log('✅ USPTO API response received')
        
        // Handle different response formats from different USPTO APIs
        let patents = []
        
        if (data?.data?.docs) {
          // Patent File Wrapper API format
          patents = data.data.docs
        } else if (data?.results) {
          // Generic API format
          patents = data.results
        } else if (data?.patents) {
          // Alternative format
          patents = data.patents
        } else if (Array.isArray(data)) {
          // Direct array format
          patents = data
        }
        
        if (patents && patents.length > 0) {
          console.log(`✅ Found ${patents.length} USPTO patents`)
          
          // Convert to standard format
          const formattedPatents = patents.slice(0, params.limit || 10).map((doc: any) => ({
            publication_number: doc.patentNumber || doc.publication_number || doc.applnId || `USPTO-${Date.now()}`,
            title: doc.inventionTitle || doc.title || doc.patent_title || 'Patent Application',
            abstract: doc.abstractText || doc.abstract || doc.description || 'Abstract not available from USPTO',
            assignee: doc.assigneeEntityName || doc.assignee || doc.applicantName || doc.owner || 'Not Listed',
            inventor: doc.inventor || doc.inventorName || doc.applicant || 'Not Listed',
            filing_date: doc.appFilingDate || doc.filing_date || doc.filingDate || '',
            publication_date: doc.publicationDate || doc.publication_date || doc.pubDate || '',
            grant_date: doc.patentIssueDate || doc.grant_date || doc.issueDate || '',
            country_code: 'US',
            legal_status: doc.appStatusDesc || doc.status || doc.legal_status || 'active',
            classification_cpc: doc.classificationCpc || doc.classification || [],
            pdf_url: doc.patentNumber ? `https://patents.uspto.gov/patent/${doc.patentNumber}` : 
                     `https://patents.uspto.gov/application/${doc.applnId || doc.publication_number}`
          }))
          
          return {
            results: formattedPatents,
            source: 'uspto',
            message: `Found ${formattedPatents.length} patents from USPTO`
          }
        }
        
      } catch (endpointError) {
        console.warn(`🔄 USPTO endpoint failed: ${endpointError.message}`)
        continue // Try next endpoint
      }
    }
    
    // If all endpoints failed, return empty results
    console.log('⚠️ All USPTO endpoints failed or returned no results')
    return {
      results: [],
      source: 'uspto',
      message: 'USPTO search completed but no results found'
    }
    
  } catch (error) {
    console.error('❌ USPTO search error:', error)
    return {
      results: [],
      source: 'uspto',
      error: error.message
    }
  }
}

// Helper function to map USPTO status
function mapUSPTOStatus(status: string): string {
  const statusLower = status.toLowerCase()
  if (statusLower.includes('patented') || statusLower.includes('issued')) return 'active'
  if (statusLower.includes('pending') || statusLower.includes('docketed')) return 'pending'
  if (statusLower.includes('abandoned') || statusLower.includes('disposed')) return 'abandoned'
  if (statusLower.includes('expired')) return 'expired'
  return 'pending'
}

// Helper function to remove duplicate patents
function removeDuplicates(patents: any[]): any[] {
  const seen = new Set<string>()
  return patents.filter(patent => {
    const key = patent.publication_number?.toLowerCase().replace(/\s+/g, '') || patent.title?.toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}



/* Deno deploy configuration */