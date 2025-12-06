import { supabase } from '../lib/supabase'

// Types
export interface ManufacturerSearchParams {
  materials: string[]
  method: string
  location?: string
  quantity?: number
  complexity?: 'simple' | 'moderate' | 'complex'
  userLocation?: { lat: number, lng: number }
  radius?: number
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
  source: 'google_places'
  description?: string
  image?: string
  placeId?: string
}

export interface LocationData {
  lat: number
  lng: number
  address: string
  city: string
  state: string
  country: string
}

// Google API key from environment variables
const GOOGLE_API_KEY = import.meta.env.VITE_GOOGLE_API_KEY

// Get user location
export async function getUserLocation(): Promise<LocationData | null> {
  try {
    console.log('🌍 Requesting user location...')
    
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000
      })
    })

    const { latitude, longitude } = position.coords
    console.log('📍 Location obtained:', { latitude, longitude })

    // Use Google Geocoding API to get address
    try {
      const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_API_KEY}`)
      const data = await response.json()
      
      if (data.results && data.results.length > 0) {
        const result = data.results[0]
        const components = result.address_components
        
        const locationData: LocationData = {
          lat: latitude,
          lng: longitude,
          address: result.formatted_address,
          city: components.find((c: any) => c.types.includes('locality'))?.long_name || 'Unknown City',
          state: components.find((c: any) => c.types.includes('administrative_area_level_1'))?.short_name || 'Unknown State',
          country: components.find((c: any) => c.types.includes('country'))?.short_name || 'US'
        }
        
        console.log('✅ Real location data from Google:', locationData)
        return locationData
      }
    } catch (geocodeError) {
      console.log('⚠️ Google geocoding failed, using fallback')
    }

    // Fallback to free service
    try {
      const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
      const data = await response.json()
      
      if (data.city && data.principalSubdivision) {
        return {
          lat: latitude,
          lng: longitude,
          address: data.locality || `${data.city}, ${data.principalSubdivision}`,
          city: data.city,
          state: data.principalSubdivisionCode || data.principalSubdivision,
          country: data.countryCode || 'US'
        }
      }
    } catch (fallbackError) {
      console.log('⚠️ Fallback geocoding also failed')
    }

    return {
      lat: latitude,
      lng: longitude,
      address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      city: 'Unknown City',
      state: 'Unknown State',
      country: 'US'
    }
  } catch (error) {
    console.error('❌ Error getting location:', error)
    return null
  }
}

// Calculate distance between coordinates
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

// Search manufacturers using Google Places API
export async function searchManufacturers(params: ManufacturerSearchParams): Promise<ManufacturerResult[]> {
  try {
    console.log('🔍 Searching LIVE manufacturers using Google Places API...')
    console.log('Search params:', params)
    
    const allResults: ManufacturerResult[] = []
    
    // Build search queries for different types of manufacturers
    const searchQueries = buildSearchQueries(params)
    
    console.log('🔍 Performing', searchQueries.length, 'Google Places searches...')
    
    // Perform multiple searches to get comprehensive results
    for (const query of searchQueries) {
      try {
        const results = await performPlacesSearch(query, params)
        allResults.push(...results)
        
        // Add delay between requests to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100))
      } catch (error) {
        console.error('❌ Error in search query:', query, error)
      }
    }
    
    // Remove duplicates based on place_id
    const uniqueResults = allResults.filter((result, index, self) => 
      index === self.findIndex(r => r.placeId === result.placeId)
    )
    
    // Calculate match scores
    uniqueResults.forEach(manufacturer => {
      manufacturer.matchScore = calculateMatchScore(manufacturer, params)
    })
    
    // Sort by match score and distance
    uniqueResults.sort((a, b) => {
      const scoreA = a.matchScore + (a.distance ? Math.max(0, 10 - a.distance/100) : 0)
      const scoreB = b.matchScore + (b.distance ? Math.max(0, 10 - b.distance/100) : 0)
      return scoreB - scoreA
    })
    
    console.log('✅ Found', uniqueResults.length, 'unique manufacturers from Google Places')
    console.log('🏆 Top matches:', uniqueResults.slice(0, 3).map(m => `${m.name} (${m.matchScore}% match)`))
    
    return uniqueResults.slice(0, 10) // Return top 10 results
    
  } catch (error) {
    console.error('❌ Error searching live manufacturers:', error)
    return []
  }
}

// Build search queries based on materials and methods
function buildSearchQueries(params: ManufacturerSearchParams): string[] {
  const queries: string[] = []
  const location = params.userLocation ? `` : '' // Can add location bias later
  
  // Method-based searches
  const methodQueries = [
    `${params.method} manufacturing services`,
    `${params.method} manufacturers`,
    `${params.method} custom manufacturing`,
    `${params.method} production services`
  ]
  
  // Material-based searches
  const materialQueries = params.materials.map(material => 
    `${material} ${params.method} manufacturing`
  )
  
  // Specialty searches
  const specialtyQueries = [
    `contract manufacturing services`,
    `precision manufacturing`,
    `industrial manufacturing`,
    `prototype manufacturing`
  ]
  
  queries.push(...methodQueries)
  queries.push(...materialQueries)
  queries.push(...specialtyQueries)
  
  return queries.slice(0, 5) // Limit to 5 queries to avoid rate limits
}

// Perform Google Places text search
async function performPlacesSearch(query: string, params: ManufacturerSearchParams): Promise<ManufacturerResult[]> {
  try {
    console.log('🔍 Google Places search:', query)
    
    // Build Places API URL
    let url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&key=${GOOGLE_API_KEY}`
    
    // Add location bias if available
    if (params.userLocation) {
      url += `&location=${params.userLocation.lat},${params.userLocation.lng}&radius=${params.radius || 50000}` // 50km radius
    }
    
    const response = await fetch(url)
    const data = await response.json()
    
    if (!data.results || data.results.length === 0) {
      console.log('⚠️ No results for query:', query)
      return []
    }
    
    console.log('✅ Found', data.results.length, 'places for query:', query)
    
    // Process results
    const manufacturers: ManufacturerResult[] = []
    
    for (const place of data.results.slice(0, 3)) { // Process top 3 results per query
      try {
        const manufacturer = await processPlaceResult(place, params)
        if (manufacturer) {
          manufacturers.push(manufacturer)
        }
      } catch (error) {
        console.error('❌ Error processing place:', place.name, error)
      }
    }
    
    return manufacturers
  } catch (error) {
    console.error('❌ Error in Places search:', error)
    return []
  }
}

// Process individual place result
async function processPlaceResult(place: any, params: ManufacturerSearchParams): Promise<ManufacturerResult | null> {
  try {
    const name = place.name || 'Unknown Manufacturer'
    const address = place.formatted_address || 'Address Unknown'
    const location = extractLocationFromAddress(address)
    
    // Calculate distance if user location available
    let distance = undefined
    if (params.userLocation && place.geometry?.location) {
      distance = Math.round(calculateDistance(
        params.userLocation.lat,
        params.userLocation.lng,
        place.geometry.location.lat,
        place.geometry.location.lng
      ))
    }
    
    // Get additional details using Place Details API
    const details = await getPlaceDetails(place.place_id)
    
    // Extract capabilities and specialties from place types and name
    const capabilities = extractCapabilities(place, params)
    const specialties = extractSpecialties(place, params)
    
    const manufacturer: ManufacturerResult = {
      id: place.place_id,
      name,
      location,
      address,
      distance,
      specialties,
      capabilities,
      certifications: [], // Would need additional API calls or manual mapping
      rating: place.rating || 4.0,
      reviewCount: place.user_ratings_total || 0,
      priceRange: estimatePriceRange(params),
      leadTime: estimateLeadTime(params),
      minOrder: estimateMinOrder(params),
      contact: {
        website: details?.website,
        phone: details?.international_phone_number || details?.formatted_phone_number,
        email: details?.website ? `info@${extractDomain(details.website)}` : undefined
      },
      matchScore: 0, // Will be calculated later
      source: 'google_places',
      description: details?.editorial_summary?.overview || `${name} - Manufacturing services`,
      image: place.photos?.[0] ? `https://maps.googleapis.com/maps/api/place/photo?maxwidth=400&photoreference=${place.photos[0].photo_reference}&key=${GOOGLE_API_KEY}` : undefined,
      placeId: place.place_id
    }
    
    console.log('✅ Processed manufacturer:', name, 'at', location)
    return manufacturer
  } catch (error) {
    console.error('❌ Error processing place result:', error)
    return null
  }
}

// Get additional place details
async function getPlaceDetails(placeId: string): Promise<any> {
  try {
    const fields = 'website,international_phone_number,formatted_phone_number,editorial_summary'
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=${fields}&key=${GOOGLE_API_KEY}`
    
    const response = await fetch(url)
    const data = await response.json()
    
    return data.result
  } catch (error) {
    console.error('❌ Error getting place details:', error)
    return null
  }
}

// Helper functions
function extractLocationFromAddress(address: string): string {
  // Extract city, state from address
  const parts = address.split(',')
  if (parts.length >= 2) {
    return parts.slice(-2).join(',').trim()
  }
  return address
}

function extractCapabilities(place: any, params: ManufacturerSearchParams): string[] {
  const capabilities: string[] = []
  const name = place.name.toLowerCase()
  
  // Add method if mentioned in name
  if (name.includes(params.method.toLowerCase())) {
    capabilities.push(params.method)
  }
  
  // Add common manufacturing capabilities
  const commonCapabilities = ['Manufacturing', 'Custom Production', 'Prototyping']
  capabilities.push(...commonCapabilities)
  
  return capabilities
}

function extractSpecialties(place: any, params: ManufacturerSearchParams): string[] {
  const specialties: string[] = []
  const name = place.name.toLowerCase()
  
  // Add materials if mentioned in name
  params.materials.forEach(material => {
    if (name.includes(material.toLowerCase())) {
      specialties.push(material)
    }
  })
  
  // Add default specialty
  if (specialties.length === 0) {
    specialties.push('General Manufacturing')
  }
  
  return specialties
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return 'company.com'
  }
}

function calculateMatchScore(manufacturer: ManufacturerResult, params: ManufacturerSearchParams): number {
  let score = 0

  // Material Match (30%)
  const materialMatches = params.materials.filter(material => 
    manufacturer.specialties.some(specialty => 
      specialty.toLowerCase().includes(material.toLowerCase())
    ) || manufacturer.name.toLowerCase().includes(material.toLowerCase())
  ).length
  score += (materialMatches / params.materials.length) * 30

  // Method Compatibility (30%)
  const methodMatch = manufacturer.capabilities.some(capability => 
    capability.toLowerCase().includes(params.method.toLowerCase())
  ) || manufacturer.name.toLowerCase().includes(params.method.toLowerCase())
  score += methodMatch ? 30 : 15

  // Location Proximity (15%)
  if (manufacturer.distance) {
    const proximityScore = Math.max(0, 15 - (manufacturer.distance / 200))
    score += proximityScore
  } else {
    score += 7.5
  }

  // Quality Indicators (10%)
  const qualityScore = (manufacturer.rating / 5) * 8 + 
                      (Math.min(manufacturer.reviewCount / 100, 1) * 2)
  score += qualityScore

  // Capacity Match (15%)
  if (params.quantity && manufacturer.minOrder) {
    const capacityScore = params.quantity >= manufacturer.minOrder ? 15 : 7.5
    score += capacityScore
  } else {
    score += 10
  }

  return Math.round(score)
}

function estimatePriceRange(params: ManufacturerSearchParams): string {
  const basePrice = 75
  const materialMultiplier = params.materials.some(m => m.toLowerCase().includes('aluminum')) ? 1.5 : 1.0
  const complexityMultiplier = params.complexity === 'simple' ? 0.8 : 
                              params.complexity === 'complex' ? 1.5 : 1.0
  
  const min = Math.floor(basePrice * materialMultiplier * complexityMultiplier)
  const max = Math.floor(min * 2.5)
  
  return `$${min}-${max}`
}

function estimateLeadTime(params: ManufacturerSearchParams): string {
  if (params.method.toLowerCase().includes('3d printing')) return '3-10 days'
  if (params.method.toLowerCase().includes('injection molding')) return '4-8 weeks'
  if (params.complexity === 'simple') return '1-3 weeks'
  if (params.complexity === 'complex') return '6-12 weeks'
  return '2-6 weeks'
}

function estimateMinOrder(params: ManufacturerSearchParams): number {
  if (params.quantity && params.quantity > 0) return Math.max(1, Math.floor(params.quantity * 0.3))
  if (params.complexity === 'simple') return 10
  if (params.complexity === 'complex') return 100
  return 25
}

// Cache functions
export async function saveManufacturerSearch(params: ManufacturerSearchParams, results: ManufacturerResult[]): Promise<void> {
  try {
    const searchKey = `manufacturer-search-live-${JSON.stringify(params)}`
    localStorage.setItem(searchKey, JSON.stringify({
      results,
      timestamp: new Date().toISOString(),
      expires: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString() // 6 hours
    }))
    console.log('✅ Live manufacturer search cached')
  } catch (error) {
    console.error('❌ Error caching search:', error)
  }
}

export async function loadCachedManufacturerSearch(params: ManufacturerSearchParams): Promise<ManufacturerResult[] | null> {
  try {
    const searchKey = `manufacturer-search-live-${JSON.stringify(params)}`
    const cached = localStorage.getItem(searchKey)
    
    if (cached) {
      const data = JSON.parse(cached)
      if (new Date(data.expires) > new Date()) {
        console.log('✅ Loaded cached live manufacturer search')
        return data.results
      }
    }
    
    return null
  } catch (error) {
    console.error('❌ Error loading cached search:', error)
    return null
  }
}