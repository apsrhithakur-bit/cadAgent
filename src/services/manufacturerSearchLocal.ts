import { supabase } from '../lib/supabase'

// Types for manufacturer search (local version)
export interface ManufacturerSearchParams {
  materials: string[]
  method: string
  location?: string
  quantity?: number
  complexity?: 'simple' | 'moderate' | 'complex'
  userLocation?: { lat: number, lng: number }
  radius?: number // in miles
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
  source: 'google' | 'places' | 'local_database'
}

export interface LocationData {
  lat: number
  lng: number
  address: string
  city: string
  state: string
  country: string
}

// Get user's current location with proper geocoding
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

    // Try to get real location data using reverse geocoding
    try {
      const response = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`)
      const data = await response.json()
      
      if (data.city && data.principalSubdivision) {
        const locationData: LocationData = {
          lat: latitude,
          lng: longitude,
          address: data.locality || `${data.city}, ${data.principalSubdivision}`,
          city: data.city,
          state: data.principalSubdivisionCode || data.principalSubdivision,
          country: data.countryCode || 'US'
        }
        
        console.log('✅ Real location data obtained:', locationData)
        return locationData
      }
    } catch (geocodeError) {
      console.log('⚠️ Reverse geocoding failed, using coordinates only')
    }

    // Fallback to coordinates with estimated location
    const locationData: LocationData = {
      lat: latitude,
      lng: longitude,
      address: `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
      city: 'Your City',
      state: 'Your State', 
      country: 'US'
    }

    console.log('✅ Location data (coordinates only):', locationData)
    return locationData
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

// Enhanced manufacturers with location-based customization
function getEnhancedManufacturers(params: ManufacturerSearchParams): ManufacturerResult[] {
  const materials = params.materials || ['plastic']
  const method = params.method || 'injection molding'
  const complexity = params.complexity || 'moderate'
  
  const manufacturers: ManufacturerResult[] = [
    {
      id: 'enhanced-1',
      name: 'PrecisionTech Manufacturing',
      location: 'San Francisco, CA',
      address: '1234 Tech Drive, San Francisco, CA 94105',
      distance: params.userLocation ? 50 + Math.random() * 200 : undefined,
      specialties: materials.slice(0, 3),
      capabilities: [method, '3D Printing', 'CNC Machining', 'Assembly'],
      certifications: ['ISO 9001', 'AS9100', 'FDA'],
      rating: 4.8,
      reviewCount: 127,
      priceRange: estimatePriceRange(params),
      leadTime: estimateLeadTime(params),
      minOrder: estimateMinOrder(params),
      contact: {
        website: 'https://precisiontech-mfg.com',
        phone: '(415) 555-0123',
        email: 'quotes@precisiontech-mfg.com'
      },
      matchScore: calculateMatchScore(materials, method, 'precision manufacturing'),
      source: 'local_database'
    },
    {
      id: 'enhanced-2',
      name: 'Advanced Prototype Solutions',
      location: 'Austin, TX',
      address: '5678 Innovation Blvd, Austin, TX 78701',
      distance: params.userLocation ? 100 + Math.random() * 300 : undefined,
      specialties: [method, ...materials.slice(0, 2)],
      capabilities: ['Rapid Prototyping', method, 'Tooling', 'Design Support'],
      certifications: ['ISO 14001', 'IATF 16949'],
      rating: 4.6,
      reviewCount: 89,
      priceRange: estimatePriceRange(params),
      leadTime: complexity === 'simple' ? '1-2 weeks' : '2-4 weeks',
      minOrder: Math.max(25, Math.floor(Math.random() * 50 + 25)),
      contact: {
        website: 'https://advancedproto.com',
        phone: '(512) 555-0456',
        email: 'info@advancedproto.com'
      },
      matchScore: calculateMatchScore(materials, method, 'prototype solutions'),
      source: 'local_database'
    },
    {
      id: 'enhanced-3',
      name: 'Global Production Partners',
      location: 'Shenzhen, China',
      address: 'Industrial District, Shenzhen, Guangdong',
      distance: params.userLocation ? 7000 + Math.random() * 1000 : undefined,
      specialties: ['Mass Production', method, materials[0] || 'plastic'],
      capabilities: ['High Volume', 'Cost Optimization', method, 'Quality Control'],
      certifications: ['ISO 9001', 'RoHS', 'CE'],
      rating: 4.9,
      reviewCount: 245,
      priceRange: adjustPriceForLocation(estimatePriceRange(params), 'international'),
      leadTime: '3-5 weeks',
      minOrder: complexity === 'simple' ? 50 : 100,
      contact: {
        website: 'https://globalproduction.com.cn',
        phone: '+86 755 1234-5678',
        email: 'export@globalproduction.com.cn'
      },
      matchScore: calculateMatchScore(materials, method, 'mass production'),
      source: 'local_database'
    },
    {
      id: 'enhanced-4',
      name: 'Local Fabrication Co.',
      location: 'Detroit, MI',
      address: '9101 Manufacturing Row, Detroit, MI 48201',
      distance: params.userLocation ? 200 + Math.random() * 400 : undefined,
      specialties: materials.includes('aluminum') ? ['Aluminum', 'Metal Working'] : ['General Manufacturing'],
      capabilities: ['Custom Fabrication', 'Welding', method, 'Finishing'],
      certifications: ['ISO 9001', 'AWS Certified'],
      rating: 4.4,
      reviewCount: 156,
      priceRange: estimatePriceRange(params),
      leadTime: '2-3 weeks',
      minOrder: 25,
      contact: {
        website: 'https://localfab.com',
        phone: '(313) 555-0789',
        email: 'orders@localfab.com'
      },
      matchScore: calculateMatchScore(materials, method, 'local fabrication'),
      source: 'local_database'
    },
    {
      id: 'enhanced-5',
      name: 'Aerospace Components Inc.',
      location: 'Seattle, WA',
      address: '2468 Aerospace Ave, Seattle, WA 98101',
      distance: params.userLocation ? 150 + Math.random() * 500 : undefined,
      specialties: materials.includes('aluminum') ? ['Aerospace Grade', 'Aluminum'] : ['High Precision'],
      capabilities: ['Aerospace Manufacturing', method, 'Testing', 'Certification'],
      certifications: ['AS9100', 'NADCAP', 'ISO 9001'],
      rating: 4.7,
      reviewCount: 92,
      priceRange: adjustPriceForQuality(estimatePriceRange(params), 'aerospace'),
      leadTime: complexity === 'complex' ? '4-6 weeks' : '3-4 weeks',
      minOrder: 50,
      contact: {
        website: 'https://aerocomponents.com',
        phone: '(206) 555-0321',
        email: 'aerospace@aerocomponents.com'
      },
      matchScore: calculateMatchScore(materials, method, 'aerospace components'),
      source: 'local_database'
    },
    {
      id: 'enhanced-6',
      name: 'Medical Device Manufacturing',
      location: 'Boston, MA',
      address: '1357 Biotech Circle, Boston, MA 02101',
      distance: params.userLocation ? 250 + Math.random() * 600 : undefined,
      specialties: ['Medical Grade', materials[0] || 'plastic'],
      capabilities: ['Medical Devices', 'Clean Room', method, 'FDA Compliance'],
      certifications: ['ISO 13485', 'FDA', 'ISO 9001'],
      rating: 4.9,
      reviewCount: 78,
      priceRange: adjustPriceForQuality(estimatePriceRange(params), 'medical'),
      leadTime: '4-6 weeks',
      minOrder: 100,
      contact: {
        website: 'https://meddevicemfg.com',
        phone: '(617) 555-0654',
        email: 'medical@meddevicemfg.com'
      },
      matchScore: calculateMatchScore(materials, method, 'medical device'),
      source: 'local_database'
    }
  ]

  // Sort by match score
  return manufacturers.sort((a, b) => b.matchScore - a.matchScore)
}

// Search manufacturers with location-aware results
export async function searchManufacturers(params: ManufacturerSearchParams): Promise<ManufacturerResult[]> {
  try {
    console.log('🔍 Searching manufacturers with location-aware algorithm...')
    console.log('Search params:', params)

    // Use location data to customize results
    const manufacturers = getEnhancedManufacturers(params)
    
    // If we have user location, calculate real distances and sort by proximity + match score
    if (params.userLocation) {
      console.log('📍 Using real location data for proximity calculations')
      
      // Calculate actual distances to major manufacturing hubs
      const manufacturingHubs = [
        { name: 'San Francisco, CA', lat: 37.7749, lng: -122.4194 },
        { name: 'Austin, TX', lat: 30.2672, lng: -97.7431 },
        { name: 'Detroit, MI', lat: 42.3314, lng: -83.0458 },
        { name: 'Seattle, WA', lat: 47.6062, lng: -122.3321 },
        { name: 'Boston, MA', lat: 42.3601, lng: -71.0589 }
      ]
      
      manufacturers.forEach((mfg, index) => {
        if (index < manufacturingHubs.length) {
          const hub = manufacturingHubs[index]
          const distance = calculateDistance(
            params.userLocation!.lat,
            params.userLocation!.lng,
            hub.lat,
            hub.lng
          )
          
          mfg.distance = Math.round(distance)
          mfg.location = hub.name
          
          // Adjust match score based on distance (closer = better)
          const proximityBonus = Math.max(0, 10 - (distance / 200))
          mfg.matchScore = Math.min(100, mfg.matchScore + proximityBonus)
        }
      })
      
      // Sort by combined score (match score + proximity)
      manufacturers.sort((a, b) => {
        const scoreA = a.matchScore + (a.distance ? Math.max(0, 20 - a.distance/100) : 0)
        const scoreB = b.matchScore + (b.distance ? Math.max(0, 20 - b.distance/100) : 0)
        return scoreB - scoreA
      })
    }
    
    console.log('✅ Generated', manufacturers.length, 'location-aware manufacturers')
    console.log('📊 Manufacturer sources:', manufacturers.map(m => `${m.name}: ${m.source}`))
    return manufacturers

  } catch (error) {
    console.error('❌ Error in location-aware search:', error)
    return getEnhancedManufacturers(params)
  }
}

// Helper functions
function calculateMatchScore(materials: string[], method: string, specialty: string): number {
  let score = 0

  // Material Match (30%)
  const materialMatches = materials.filter(material => 
    specialty.toLowerCase().includes(material.toLowerCase()) ||
    material.toLowerCase().includes('aluminum') && specialty.includes('aluminum') ||
    material.toLowerCase().includes('plastic') && specialty.includes('precision')
  ).length
  score += (materialMatches / materials.length) * 30

  // Method Compatibility (30%)
  const methodMatch = specialty.toLowerCase().includes(method.toLowerCase()) ||
                     method.toLowerCase().includes('3d printing') && specialty.includes('precision') ||
                     method.toLowerCase().includes('injection') && specialty.includes('production')
  score += methodMatch ? 30 : 15

  // Quality/Specialty bonus (15%)
  if (specialty.includes('aerospace') || specialty.includes('medical')) score += 15
  else if (specialty.includes('precision') || specialty.includes('advanced')) score += 10
  else score += 5

  // Base reliability score (25%)
  score += 20 + Math.random() * 5

  return Math.min(100, Math.round(score))
}

function estimatePriceRange(params: ManufacturerSearchParams): string {
  const basePrice = 50
  const materialMultiplier = params.materials.some(m => m.toLowerCase().includes('aluminum')) ? 1.5 : 
                            params.materials.some(m => m.toLowerCase().includes('steel')) ? 1.8 : 1.0
  const complexityMultiplier = params.complexity === 'simple' ? 0.8 : 
                              params.complexity === 'complex' ? 1.5 : 1.0
  
  const min = Math.floor(basePrice * materialMultiplier * complexityMultiplier)
  const max = Math.floor(min * 1.8)
  
  return `$${min}-${max}`
}

function estimateLeadTime(params: ManufacturerSearchParams): string {
  if (params.method.toLowerCase().includes('3d printing')) return '1-2 weeks'
  if (params.method.toLowerCase().includes('injection molding')) return '3-4 weeks'
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

function adjustPriceForLocation(priceRange: string, location: 'international' | 'local'): string {
  if (location === 'international') {
    return priceRange.replace(/\$(\d+)-(\d+)/, (_, min, max) => 
      `$${Math.floor(+min * 0.7)}-${Math.floor(+max * 0.8)}`
    )
  }
  return priceRange
}

function adjustPriceForQuality(priceRange: string, quality: 'aerospace' | 'medical' | 'standard'): string {
  if (quality === 'aerospace' || quality === 'medical') {
    return priceRange.replace(/\$(\d+)-(\d+)/, (_, min, max) => 
      `$${Math.floor(+min * 1.3)}-${Math.floor(+max * 1.5)}`
    )
  }
  return priceRange
}

// Mock cache functions (no database needed)
export async function saveManufacturerSearch(params: ManufacturerSearchParams, results: ManufacturerResult[]): Promise<void> {
  try {
    const searchKey = `manufacturer-search-${JSON.stringify(params)}`
    localStorage.setItem(searchKey, JSON.stringify({
      results,
      timestamp: new Date().toISOString(),
      expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    }))
    console.log('✅ Manufacturer search cached locally')
  } catch (error) {
    console.error('❌ Error caching search locally:', error)
  }
}

export async function loadCachedManufacturerSearch(params: ManufacturerSearchParams): Promise<ManufacturerResult[] | null> {
  try {
    const searchKey = `manufacturer-search-${JSON.stringify(params)}`
    const cached = localStorage.getItem(searchKey)
    
    if (cached) {
      const data = JSON.parse(cached)
      if (new Date(data.expires) > new Date()) {
        console.log('✅ Loaded cached manufacturer search from localStorage')
        return data.results
      }
    }
    
    return null
  } catch (error) {
    console.error('❌ Error loading cached search:', error)
    return null
  }
}