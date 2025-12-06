import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface SearchParams {
  query: string
  userLocation?: { lat: number, lng: number }
  radius?: number
}

interface PlaceSearchParams {
  query: string
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { action, params } = await req.json()
    const GOOGLE_API_KEY = Deno.env.get('GOOGLE_API_KEY') || Deno.env.get('VITE_GOOGLE_API_KEY')
    const GOOGLE_CX = Deno.env.get('GOOGLE_CX') || Deno.env.get('VITE_GOOGLE_CX')

    console.log('Google API request:', { action, params })

    if (action === 'custom_search') {
      // Google Custom Search API
      const searchUrl = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CX}&q=${encodeURIComponent(params.query)}&num=10`
      
      const response = await fetch(searchUrl)
      const data = await response.json()
      
      console.log('Custom search results:', data.items?.length || 0)
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'places_search') {
      // Google Places Text Search API
      const placesUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(params.query)}&key=${GOOGLE_API_KEY}`
      
      const response = await fetch(placesUrl)
      const data = await response.json()
      
      console.log('Places search results:', data.results?.length || 0)
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'place_details') {
      // Google Places Details API
      const detailsUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${params.place_id}&fields=formatted_address,formatted_phone_number,website,rating,user_ratings_total,geometry&key=${GOOGLE_API_KEY}`
      
      const response = await fetch(detailsUrl)
      const data = await response.json()
      
      console.log('Place details result:', data.result ? 'found' : 'not found')
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    if (action === 'geocode') {
      // Google Geocoding API
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${params.lat},${params.lng}&key=${GOOGLE_API_KEY}`
      
      const response = await fetch(geocodeUrl)
      const data = await response.json()
      
      console.log('Geocoding result:', data.results?.length || 0)
      
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(
      JSON.stringify({ error: 'Invalid action' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400
      }
    )

  } catch (error) {
    console.error('Error in Google API function:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})