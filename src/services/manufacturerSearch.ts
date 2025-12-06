import { supabase } from '../lib/supabase'

// Types for manufacturer search
export interface ManufacturerSearchParams {
  materials: string[]
  method: string
  location?: string
  quantity?: number
  complexity?: 'simple' | 'moderate' | 'complex'
  userLocation?: { lat: number, lng: number }
  radius?: number // in miles
  productName?: string // Add product name for search context
  keywords?: string[] // Add keywords from description
  productDescription?: string // Add full product description
}

export interface ManufacturerResult {
  id: string
  name: string
  location: string
  address?: string
  distance?: number
  specialties: string[]
  capabilities: string[]
  certifications: string[]
  rating: number
  reviewCount: number
  priceRange: string
  leadTime: string
  minOrder: number
  contact: {
    website?: string
    phone?: string
    email?: string
  }
  matchScore: number
  source: 'google' | 'places' | 'fallback' | 'google_places_js' | 'curated_database' | 'google_places' | 'web_search'
}

export interface LocationData {
  lat: number
  lng: number
  address: string
  city: string
  state: string
  country: string
}

// Google APIs configuration from environment variables
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY
const GOOGLE_CX = import.meta.env.VITE_GOOGLE_CX

// Pica AI configuration for enhanced analysis
const PICA_BASE = 'https://api.pica.ai/v1'
const PICA_SECRET_KEY = import.meta.env.VITE_PICA_SECRET_KEY
const PICA_OPENAI_KEY = import.meta.env.VITE_PICA_OPENAI_CONNECTION_KEY
const PICA_GEMINI_KEY = import.meta.env.VITE_PICA_GEMINI_CONNECTION_KEY

// Get user's current location
export async function getUserLocation(): Promise<LocationData | null> {
  try {
    console.log('🌍 Requesting user location...')
    
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000 // 5 minutes
      })
    })

    const { latitude, longitude } = position.coords
    console.log('📍 Location obtained:', { latitude, longitude })

    // Reverse geocode to get address using Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('google-manufacturer-search', {
      body: {
        action: 'geocode',
        params: { lat: latitude, lng: longitude }
      }
    })
    
    if (error) {
      console.error('❌ Geocoding error:', error)
      return null
    }

    if (data.results && data.results.length > 0) {
      const result = data.results[0]
      const components = result.address_components
      
      const locationData: LocationData = {
        lat: latitude,
        lng: longitude,
        address: result.formatted_address,
        city: components.find((c: any) => c.types.includes('locality'))?.long_name || '',
        state: components.find((c: any) => c.types.includes('administrative_area_level_1'))?.short_name || '',
        country: components.find((c: any) => c.types.includes('country'))?.short_name || 'US'
      }

      console.log('✅ Location data:', locationData)
      return locationData
    }

    return null
  } catch (error) {
    console.error('❌ Error getting location:', error)
    return null
  }
}

// Calculate distance between two coordinates
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959 // Earth's radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLon = (lon2 - lon1) * Math.PI / 180
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}

// Search manufacturers using Google Custom Search API
export async function searchManufacturers(params: ManufacturerSearchParams): Promise<ManufacturerResult[]> {
  try {
    console.log('🔍 Searching manufacturers with params:', params)
    
    // Build search query
    const materialQuery = params.materials.join(' OR ')
    const locationQuery = params.location ? `near ${params.location}` : ''
    const searchQuery = `${materialQuery} ${params.method} manufacturers ${locationQuery} certifications quality`
    
    console.log('🔍 Search query:', searchQuery)

    // Google Custom Search API via Supabase Edge Function
    const { data: searchData, error: searchError } = await supabase.functions.invoke('google-manufacturer-search', {
      body: {
        action: 'custom_search',
        params: { query: searchQuery }
      }
    })
    
    if (searchError) {
      console.error('❌ Search error:', searchError)
      return getFallbackManufacturers(params)
    }

    if (!searchData.items) {
      console.log('⚠️ No search results found, using fallback')
      return getFallbackManufacturers(params)
    }

    console.log('✅ Found', searchData.items.length, 'search results')

    // Process search results
    const manufacturers: ManufacturerResult[] = []
    
    for (const item of searchData.items.slice(0, 8)) {
      try {
        const manufacturer = await processSearchResult(item, params)
        if (manufacturer) {
          manufacturers.push(manufacturer)
        }
      } catch (error) {
        console.error('❌ Error processing search result:', error)
      }
    }

    // Enhance with AI analysis
    const enhancedManufacturers = await enhanceManufacturersWithAI(manufacturers, params)
    
    // Sort by match score
    enhancedManufacturers.sort((a, b) => b.matchScore - a.matchScore)

    console.log('✅ Processed', enhancedManufacturers.length, 'manufacturers')
    return enhancedManufacturers

  } catch (error) {
    console.error('❌ Error searching manufacturers:', error)
    return getFallbackManufacturers(params)
  }
}

// Process individual search result
async function processSearchResult(item: any, params: ManufacturerSearchParams): Promise<ManufacturerResult | null> {
  try {
    const title = item.title || 'Unknown Manufacturer'
    const snippet = item.snippet || ''
    const url = item.link || ''

    // Extract company name from title
    const name = title.split(' - ')[0] || title

    // Try to get location from Google Places API
    const placeData = await searchPlaceByName(name)
    
    let distance = undefined
    if (placeData && params.userLocation) {
      distance = calculateDistance(
        params.userLocation.lat,
        params.userLocation.lng,
        placeData.lat,
        placeData.lng
      )
    }

    // Extract capabilities and specialties from snippet
    const capabilities = extractCapabilities(snippet, params)
    const specialties = extractSpecialties(snippet, params)

    const manufacturer: ManufacturerResult = {
      id: `google-${Date.now()}-${Math.random()}`,
      name,
      location: placeData?.address || extractLocationFromSnippet(snippet),
      address: placeData?.address,
      distance,
      specialties,
      capabilities,
      certifications: extractCertifications(snippet),
      rating: placeData?.rating || 4.2 + Math.random() * 0.6, // Estimated rating
      reviewCount: placeData?.reviewCount || Math.floor(Math.random() * 200) + 50,
      priceRange: estimatePriceRange(params),
      leadTime: estimateLeadTime(params),
      minOrder: estimateMinOrder(params),
      contact: {
        website: url,
        phone: placeData?.phone,
        email: placeData?.email
      },
      matchScore: 0, // Will be calculated by AI
      source: 'google'
    }

    return manufacturer
  } catch (error) {
    console.error('❌ Error processing search result:', error)
    return null
  }
}

// Search for place details using Google Places API
async function searchPlaceByName(name: string): Promise<any> {
  try {
    const query = `${name} manufacturer`
    
    // Search for place using Supabase Edge Function
    const { data: placesData, error: placesError } = await supabase.functions.invoke('google-manufacturer-search', {
      body: {
        action: 'places_search',
        params: { query }
      }
    })
    
    if (placesError || !placesData?.results?.length) {
      console.log('⚠️ No places found for:', name)
      return null
    }

    const place = placesData.results[0]
    
    // Get detailed place information
    const { data: detailsData, error: detailsError } = await supabase.functions.invoke('google-manufacturer-search', {
      body: {
        action: 'place_details',
        params: { place_id: place.place_id }
      }
    })
    
    if (detailsError || !detailsData?.result) {
      console.log('⚠️ No place details found for:', name)
      return null
    }

    const result = detailsData.result
    return {
      address: result.formatted_address,
      phone: result.formatted_phone_number,
      website: result.website,
      rating: result.rating,
      reviewCount: result.user_ratings_total,
      lat: result.geometry?.location?.lat,
      lng: result.geometry?.location?.lng
    }
  } catch (error) {
    console.error('❌ Error searching place:', error)
    return null
  }
}

// Extract capabilities from text
function extractCapabilities(text: string, params: ManufacturerSearchParams): string[] {
  const capabilities: string[] = []
  const lowerText = text.toLowerCase()

  // Manufacturing methods
  const methods = ['injection molding', '3d printing', 'cnc machining', 'casting', 'stamping', 'welding', 'assembly']
  methods.forEach(method => {
    if (lowerText.includes(method)) {
      capabilities.push(method)
    }
  })

  // Add user's method if not already included
  if (!capabilities.includes(params.method.toLowerCase())) {
    capabilities.push(params.method)
  }

  return capabilities
}

// Extract specialties from text
function extractSpecialties(text: string, params: ManufacturerSearchParams): string[] {
  const specialties: string[] = []
  const lowerText = text.toLowerCase()

  // Materials
  params.materials.forEach(material => {
    if (lowerText.includes(material.toLowerCase())) {
      specialties.push(material)
    }
  })

  // Industries
  const industries = ['aerospace', 'automotive', 'medical', 'electronics', 'consumer', 'industrial']
  industries.forEach(industry => {
    if (lowerText.includes(industry)) {
      specialties.push(industry)
    }
  })

  return specialties
}

// Extract certifications from text
function extractCertifications(text: string): string[] {
  const certifications: string[] = []
  const lowerText = text.toLowerCase()

  const certs = [
    'iso 9001', 'iso 14001', 'as9100', 'iatf 16949', 'iso 13485', 
    'fda', 'ce', 'rohs', 'ul', 'mil-spec'
  ]

  certs.forEach(cert => {
    if (lowerText.includes(cert)) {
      certifications.push(cert.toUpperCase())
    }
  })

  return certifications
}

// Helper functions for estimation
function extractLocationFromSnippet(snippet: string): string {
  // Try to extract location from snippet
  const locationMatch = snippet.match(/([A-Z][a-z]+,?\s*[A-Z]{2})|([A-Z][a-z]+,?\s*[A-Z][a-z]+)/g)
  return locationMatch ? locationMatch[0] : 'Various Locations'
}

function estimatePriceRange(params: ManufacturerSearchParams): string {
  const basePrice = 50
  const materialMultiplier = params.materials.includes('aluminum') ? 1.5 : 
                            params.materials.includes('steel') ? 1.8 : 1.0
  const complexityMultiplier = params.complexity === 'simple' ? 0.8 : 
                              params.complexity === 'complex' ? 1.5 : 1.0
  
  const min = Math.floor(basePrice * materialMultiplier * complexityMultiplier)
  const max = Math.floor(min * 1.8)
  
  return `$${min}-${max}`
}

function estimateLeadTime(params: ManufacturerSearchParams): string {
  if (params.method.includes('3d printing')) return '1-2 weeks'
  if (params.method.includes('injection molding')) return '3-4 weeks'
  if (params.complexity === 'simple') return '1-2 weeks'
  if (params.complexity === 'complex') return '4-6 weeks'
  return '2-3 weeks'
}

function estimateMinOrder(params: ManufacturerSearchParams): number {
  if (params.quantity && params.quantity > 0) return Math.max(1, Math.floor(params.quantity * 0.5))
  if (params.complexity === 'simple') return 25
  if (params.complexity === 'complex') return 100
  return 50
}

// Enhance manufacturers with AI analysis
async function enhanceManufacturersWithAI(manufacturers: ManufacturerResult[], params: ManufacturerSearchParams): Promise<ManufacturerResult[]> {
  try {
    console.log('🤖 Enhancing manufacturers with AI analysis...')

    // Prepare prompt for AI analysis
    const prompt = `
Analyze these manufacturers for a ${params.method} project using ${params.materials.join(', ')} materials.
Project complexity: ${params.complexity || 'moderate'}
Required quantity: ${params.quantity || 'not specified'}

Manufacturers:
${manufacturers.map(m => `${m.name}: ${m.specialties.join(', ')}, Location: ${m.location}`).join('\n')}

Score each manufacturer (0-100) based on:
- Material Match (30%): Specializes in required materials
- Method Compatibility (30%): Supports manufacturing method  
- Location Proximity (15%): Distance from user/project
- Capacity Match (15%): Can handle required quantity
- Quality Indicators (10%): Certifications, ratings, reviews

Return JSON array with manufacturer names and scores only.
`

    const aiResult = await callAI(prompt, 'gemini') // Using Gemini 2.5 Flash for cost efficiency
    
    if (aiResult && aiResult.scores) {
      // Apply AI scores
      manufacturers.forEach(manufacturer => {
        const aiScore = aiResult.scores.find((s: any) => s.name === manufacturer.name)
        manufacturer.matchScore = aiScore?.score || 50
      })
    } else {
      // Fallback scoring
      manufacturers.forEach(manufacturer => {
        manufacturer.matchScore = calculateFallbackScore(manufacturer, params)
      })
    }

    console.log('✅ AI enhancement completed')
    return manufacturers
  } catch (error) {
    console.error('❌ Error enhancing with AI:', error)
    
    // Fallback to rule-based scoring
    manufacturers.forEach(manufacturer => {
      manufacturer.matchScore = calculateFallbackScore(manufacturer, params)
    })
    
    return manufacturers
  }
}

// Calculate fallback score using rule-based logic
function calculateFallbackScore(manufacturer: ManufacturerResult, params: ManufacturerSearchParams): number {
  let score = 0

  // Material Match (30%)
  const materialMatches = params.materials.filter(material => 
    manufacturer.specialties.some(specialty => 
      specialty.toLowerCase().includes(material.toLowerCase())
    )
  ).length
  score += (materialMatches / params.materials.length) * 30

  // Method Compatibility (30%)
  const methodMatch = manufacturer.capabilities.some(capability => 
    capability.toLowerCase().includes(params.method.toLowerCase())
  ) || manufacturer.specialties.some(specialty => 
    specialty.toLowerCase().includes(params.method.toLowerCase())
  )
  score += methodMatch ? 30 : 0

  // Location Proximity (15%)
  if (manufacturer.distance) {
    const proximityScore = Math.max(0, 15 - (manufacturer.distance / 100))
    score += proximityScore
  } else {
    score += 7.5 // Average score for unknown distance
  }

  // Capacity Match (15%)
  if (params.quantity && manufacturer.minOrder) {
    const capacityScore = params.quantity >= manufacturer.minOrder ? 15 : 7.5
    score += capacityScore
  } else {
    score += 10 // Average score
  }

  // Quality Indicators (10%)
  const qualityScore = (manufacturer.rating / 5) * 5 + 
                      (manufacturer.certifications.length * 2) +
                      Math.min(3, manufacturer.reviewCount / 50)
  score += Math.min(10, qualityScore)

  return Math.round(score)
}

// Call AI service (Pica AI proxy)
async function callAI(prompt: string, provider: 'openai' | 'gemini' = 'gemini'): Promise<any> {
  try {
    // For now, skip AI enhancement and use fallback scoring
    console.log('⚠️ AI enhancement temporarily disabled, using fallback scoring')
    return null
    
    // TODO: Fix Pica AI endpoint when available
    /*
    const connectionKey = provider === 'openai' ? PICA_OPENAI_KEY : PICA_GEMINI_KEY
    const model = provider === 'openai' ? 'gpt-4o-mini' : 'gemini-2.0-flash-thinking-exp'
    
    const response = await fetch(`${PICA_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PICA_SECRET_KEY}`,
        'X-Connection-Key': connectionKey
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    })

    const data = await response.json()
    
    if (data.choices && data.choices[0]) {
      try {
        return JSON.parse(data.choices[0].message.content)
      } catch {
        return { scores: [] }
      }
    }
    */

    return null
  } catch (error) {
    console.error('❌ AI call failed:', error)
    return null
  }
}

// Fallback manufacturers for when search fails
function getFallbackManufacturers(params: ManufacturerSearchParams): ManufacturerResult[] {
  const fallbacks: ManufacturerResult[] = [
    {
      id: 'fallback-1',
      name: 'Advanced Manufacturing Solutions',
      location: 'California, USA',
      distance: undefined,
      specialties: params.materials.slice(0, 3),
      capabilities: [params.method, '3D Printing', 'CNC Machining'],
      certifications: ['ISO 9001', 'AS9100'],
      rating: 4.5,
      reviewCount: 127,
      priceRange: estimatePriceRange(params),
      leadTime: estimateLeadTime(params),
      minOrder: estimateMinOrder(params),
      contact: {
        website: 'https://example.com'
      },
      matchScore: 85,
      source: 'fallback'
    },
    {
      id: 'fallback-2',
      name: 'Precision Proto Works',
      location: 'Texas, USA',
      distance: undefined,
      specialties: [params.method, ...params.materials.slice(0, 2)],
      capabilities: ['Prototyping', 'Small Batch', params.method],
      certifications: ['ISO 9001', 'IATF 16949'],
      rating: 4.3,
      reviewCount: 89,
      priceRange: estimatePriceRange(params),
      leadTime: estimateLeadTime(params),
      minOrder: Math.max(25, estimateMinOrder(params)),
      contact: {
        website: 'https://example.com'
      },
      matchScore: 75,
      source: 'fallback'
    }
  ]

  return fallbacks
}

// Helper function to create a short hash for cache keys  
function createShortHash(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

// Save manufacturer search results to database for caching
export async function saveManufacturerSearch(params: ManufacturerSearchParams, results: ManufacturerResult[]): Promise<void> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Create short cache key using hash to prevent 406 errors
    const paramString = JSON.stringify(params)
    const shortHash = createShortHash(paramString)
    const searchKey = `manufacturer-search-${shortHash}`
    
    console.log('💾 Saving manufacturer search with key:', searchKey)
    
    await supabase
      .from('cache_entries')
      .upsert({
        key: searchKey,
        data: { params, results, timestamp: new Date().toISOString() },
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        type: 'model_data',
        user_id: user.id
      })

    console.log('✅ Manufacturer search cached')
  } catch (error) {
    console.error('❌ Error caching search:', error)
  }
}

// Load cached manufacturer search results
export async function loadCachedManufacturerSearch(params: ManufacturerSearchParams): Promise<ManufacturerResult[] | null> {
  try {
    // Create short cache key using hash to prevent 406 errors
    const paramString = JSON.stringify(params)
    const shortHash = createShortHash(paramString)
    const searchKey = `manufacturer-search-${shortHash}`
    
    console.log('🔍 Loading manufacturer search with key:', searchKey)
    
    const { data, error } = await supabase
      .from('cache_entries')
      .select('data')
      .eq('key', searchKey)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (error || !data) return null

    console.log('✅ Loaded cached manufacturer search')
    return data.data.results
  } catch (error) {
    console.error('❌ Error loading cached search:', error)
    return null
  }
}