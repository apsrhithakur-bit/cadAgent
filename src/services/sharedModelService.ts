import { supabase } from '../lib/supabase'

export interface SharedModelData {
  // ProcessWizard state data that we want to preserve
  currentStep?: number
  generatedResults?: any
  modelData?: any
  gltfUrl?: string
  modelViewerUrl?: string
  originalPrompt?: string
  refinementHistory?: any[]
  cadData?: any
  architecturalModel?: any
  designSession?: any
}

export interface SharedModel {
  id: string
  model_data: SharedModelData
  created_at: string
  expires_at: string
}

class SharedModelService {
  private baseUrl: string

  constructor() {
    // Get Supabase URL from environment variable
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    if (!supabaseUrl) {
      throw new Error('VITE_SUPABASE_URL is not configured')
    }
    
    // Construct the functions URL from the Supabase URL
    this.baseUrl = `${supabaseUrl}/functions/v1`
  }

  /**
   * Create a shared model for cross-device AR access
   */
  async createSharedModel(modelData: SharedModelData, expiresInDays: number = 7): Promise<SharedModel> {
    try {
      // Check if we're in development mode
      const hostname = window.location.hostname
      const isDevMode = hostname === 'localhost' || 
                       hostname.includes('127.0.0.1') ||
                       hostname.includes('192.168.') ||
                       window.location.port === '5173' ||
                       window.location.port === '5174' ||
                       window.location.port === '5175'

      const { data: { session } } = await supabase.auth.getSession()
      
      // In production, require authentication  
      if (!isDevMode && !session?.access_token) {
        throw new Error('Authentication required to create shared model')
      }

      // Prepare headers (include auth token if available, otherwise use anon key in dev mode)
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      } else if (isDevMode) {
        // In development mode without session, create a temporary test user session
        try {
          const { data: { session: tempSession }, error: tempError } = await supabase.auth.signUp({
            email: `test-${Date.now()}@agenticad.dev`,
            password: 'temp123456'
          })
          if (tempSession?.access_token) {
            headers['Authorization'] = `Bearer ${tempSession.access_token}`
            console.log('✅ Created temporary session for dev mode')
          } else {
            console.warn('⚠️ Could not create temporary session, proceeding without auth')
          }
        } catch (tempError) {
          console.warn('⚠️ Temporary auth failed, proceeding without auth:', tempError)
        }
      }

      const response = await fetch(`${this.baseUrl}/create-shared-model`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model_data: modelData,
          expires_in_days: expiresInDays
        })
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to create shared model')
      }

      const result = await response.json()
      
      return {
        id: result.id,
        model_data: modelData,
        created_at: result.created_at,
        expires_at: result.expires_at
      }
    } catch (error) {
      console.error('Error creating shared model:', error)
      throw error
    }
  }

  /**
   * Get a shared model by ID
   */
  async getSharedModel(modelId: string): Promise<SharedModel> {
    try {
      // Prepare headers with authentication if available
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      
      // Check for existing session first
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`
      } else {
        // If no session, try to create temporary one for dev mode
        const hostname = window.location.hostname
        const isDevMode = hostname === 'localhost' || 
                         hostname.includes('127.0.0.1') ||
                         hostname.includes('192.168.') ||
                         window.location.port === '5173' ||
                         window.location.port === '5174' ||
                         window.location.port === '5175'
        
        if (isDevMode) {
          try {
            const { data: { session: tempSession }, error: tempError } = await supabase.auth.signUp({
              email: `test-read-${Date.now()}@agenticad.dev`,
              password: 'temp123456'
            })
            if (tempSession?.access_token) {
              headers['Authorization'] = `Bearer ${tempSession.access_token}`
              console.log('✅ Created temporary session for shared model retrieval')
            }
          } catch (tempError) {
            console.warn('⚠️ Could not create temporary session for reading:', tempError)
          }
        }
      }
      
      const response = await fetch(`${this.baseUrl}/get-shared-model?id=${modelId}`, {
        method: 'GET',
        headers
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Shared model not found')
        } else if (response.status === 410) {
          throw new Error('This shared model has expired')
        } else {
          const error = await response.json()
          throw new Error(error.error || 'Failed to retrieve shared model')
        }
      }

      const result = await response.json()
      return {
        id: result.id,
        model_data: result.model_data,
        created_at: result.created_at,
        expires_at: result.expires_at
      }
    } catch (error) {
      console.error('Error retrieving shared model:', error)
      throw error
    }
  }

  /**
   * Generate a share URL for the current app domain
   */
  generateShareUrl(modelId: string): string {
    const currentOrigin = window.location.origin
    return `${currentOrigin}/model/${modelId}`
  }

  /**
   * Check if a model ID is in the current URL
   */
  getCurrentModelId(): string | null {
    const url = new URL(window.location.href)
    
    // Check for /model/:id URL pattern
    const pathMatch = url.pathname.match(/^\/model\/([a-f0-9-]+)$/)
    if (pathMatch) {
      return pathMatch[1]
    }
    
    // Check for ?model_id= query parameter (fallback)
    return url.searchParams.get('model_id')
  }
}

export const sharedModelService = new SharedModelService()