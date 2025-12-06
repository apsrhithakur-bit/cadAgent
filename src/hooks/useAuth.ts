import React, { useState, useEffect, useCallback, useRef } from 'react'
import { User, Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export interface UserProfile {
  id: string
  email: string
  subscription_tier: 'free' | 'plus' | 'pro'
  manufacturer_access: boolean
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  subscription_status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing' | null
  current_period_start: string | null
  current_period_end: string | null
  extra_patent_searches: number
  optimization_beta_access: boolean
  beta_access_granted_at: string | null
  beta_access_reason: string | null
  beta_features: string[] | null
  created_at: string | null
  updated_at: string | null
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  
  const mountedRef = useRef(true)
  const profileFetchingRef = useRef(false)
  const lastUserId = useRef<string | null>(null)
  const lastAuthEvent = useRef<string | null>(null)
  const authSubscriptionRef = useRef<any>(null)

  // Simple profile fetch - no complex fallbacks
  const fetchProfile = useCallback(async (userId: string) => {
    // Prevent rapid duplicate fetches for the same user
    if (profileFetchingRef.current && lastUserId.current === userId) {
      console.log('🔄 Profile fetch skipped - already fetching same user:', userId)
      return
    }

    profileFetchingRef.current = true
    lastUserId.current = userId

    try {
      console.log('🔄 Fetching profile for user:', userId)
      
      const { data, error } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle()

      if (error && error.code !== 'PGRST116') {
        console.error('❌ Error fetching profile:', error)
        throw error
      }

      if (data) {
        console.log('✅ Profile found:', data.email, data.subscription_tier)
        setProfile(data)
      } else {
        console.log('📝 No profile found, creating one')
        await createProfile(userId)
      }
    } catch (error) {
      console.error('❌ Profile fetch failed:', error)
    } finally {
      profileFetchingRef.current = false
    }
  }, [])

  // Create profile for new users - simple implementation
  const createProfile = useCallback(async (userId: string) => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser()
      if (!authUser?.email) return

      console.log('📝 Creating profile for:', authUser.email)

      const newProfile = {
            id: userId,
        email: authUser.email,
            subscription_tier: 'free' as const,
        manufacturer_access: false,
        subscription_status: 'active' as const,
            stripe_customer_id: null,
            stripe_subscription_id: null,
            current_period_start: null,
            current_period_end: null,
            extra_patent_searches: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }
      
      const { data, error } = await supabase
        .from('user_profiles')
        .insert(newProfile)
        .select()
        .single()

      if (error) {
        console.error('❌ Error creating profile:', error)
        // Set basic profile in state anyway
        setProfile(newProfile)
        return
      }

      console.log('✅ Profile created successfully')
        setProfile(data)
    } catch (error) {
      console.error('❌ Error in createProfile:', error)
          }
  }, [])

  // Force refresh profile
  const forceRefreshProfile = useCallback(async () => {
    if (!user?.id) return
    
    // Reset flags to allow fresh fetch
    profileFetchingRef.current = false
    lastUserId.current = null
    await fetchProfile(user.id)
  }, [user?.id, fetchProfile])

  // Simple auth initialization - run only once
  useEffect(() => {
    const initAuth = async () => {
      try {
        console.log('🚀 Initializing auth...')
        
        // Cleanup any existing subscription first
        if (authSubscriptionRef.current) {
          console.log('🧹 Cleaning up existing auth subscription')
          authSubscriptionRef.current.data?.subscription?.unsubscribe()
          authSubscriptionRef.current = null
        }
        
        // Get current session
        const { data: { session }, error } = await supabase.auth.getSession()
        
        if (error) {
          console.error('❌ Error getting session:', error)
        } else if (session?.user) {
          console.log('✅ Found existing session for:', session.user.email)
          setSession(session)
          setUser(session.user)
          lastUserId.current = session.user.id
          await fetchProfile(session.user.id)
        } else {
          console.log('ℹ️ No existing session')
        }

        // Set up auth state listener with deduplication
        authSubscriptionRef.current = supabase.auth.onAuthStateChange(async (event, session) => {
          const eventKey = `${event}-${session?.user?.id || 'no-user'}`
          
          // Deduplicate rapid-fire events
          if (lastAuthEvent.current === eventKey) {
      return
    }
    
          lastAuthEvent.current = eventKey
          
          setSession(session)
          setUser(session?.user ?? null)
          
          if (session?.user) {
            // Only fetch profile if it's a different user
            if (lastUserId.current !== session.user.id) {
            await fetchProfile(session.user.id)
            }
          } else {
            setProfile(null)
            // Reset tracking when user signs out
            lastUserId.current = null
            profileFetchingRef.current = false
            lastAuthEvent.current = null
          }
          
          setLoading(false)
        })
          
          setLoading(false)
          setInitialized(true)
          console.log('✅ Auth initialization completed')
      } catch (error) {
        console.error('❌ Auth initialization failed:', error)
          setLoading(false)
          setInitialized(true)
        }
    }

    // Only run once
    if (!initialized) {
      initAuth()
    }

    return () => {
      mountedRef.current = false
        if (authSubscriptionRef.current) {
        authSubscriptionRef.current.data?.subscription?.unsubscribe()
          authSubscriptionRef.current = null
      }
    }
  }, []) // Empty dependency array - run only once

  // Auth methods - simple implementations
  const signIn = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true)
      console.log('🔐 Signing in user:', email)
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })
      
      if (error) throw error
      
      console.log('✅ Sign in successful')
      return { data, error: null }
    } catch (error) {
      console.error('❌ Sign in failed:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      setLoading(true)
      console.log('📝 Signing up user:', email)
      
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      })
      
      if (error) throw error
      
      console.log('✅ Sign up successful')
      return { data, error: null }
    } catch (error) {
      console.error('❌ Sign up failed:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }, [])

  const signOut = useCallback(async () => {
    try {
      setLoading(true)
      console.log('🚪 Signing out...')
      
      // Clear local state first
      setSession(null)
      setUser(null)
      setProfile(null)
      lastUserId.current = null
      profileFetchingRef.current = false
      lastAuthEvent.current = null
      
      const { error } = await supabase.auth.signOut()
      
      if (error) throw error
      
      console.log('✅ Sign out successful')
      return { error: null }
    } catch (error) {
      console.error('❌ Sign out failed:', error)
      return { error }
    } finally {
      setLoading(false)
    }
  }, [])

  const signInWithGoogle = useCallback(async () => {
    try {
      setLoading(true)
      console.log('🔐 Starting Google OAuth...')
      
      // Determine the correct redirect URL - Enhanced development detection
      const hostname = window.location.hostname
      const port = window.location.port
      
      // Detect development environment (localhost, 127.0.0.1, local network IPs on dev port)
      const isDevelopment = hostname === 'localhost' || 
                           hostname === '127.0.0.1' ||
                           (port === '5173' && (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.'))) ||
                           hostname.includes('.local')
                           
      const isProduction = hostname === 'agenticad.store' || hostname.includes('netlify.app')
      
      // Always use current origin for development (including network IPs), production URL for production
      const baseUrl = isDevelopment ? window.location.origin :
                      isProduction ? 'https://agenticad.store' :
                      window.location.origin // Default to current origin for safety

      // Add step=input parameter to redirect to wizard step 1 after authentication
      const redirectUrl = `${baseUrl}/?step=input`

      console.log('🌐 Enhanced Environment check:', {
        hostname: hostname,
        port: port,
        isDevelopment: isDevelopment,
        isProduction: isProduction,
        envVar: import.meta.env.VITE_APP_URL,
        currentOrigin: window.location.origin,
        redirectUrl: redirectUrl
      })

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        }
      })
      
      if (error) throw error
      
      console.log('✅ Google OAuth initiated')
      return { data, error: null }
    } catch (error) {
      console.error('❌ Google OAuth failed:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }, [])

  const signInWithApple = useCallback(async () => {
    try {
      setLoading(true)
      console.log('🍎 Starting Apple OAuth...')
      
      // Determine the correct redirect URL - Enhanced development detection
      const hostname = window.location.hostname
      const port = window.location.port
      
      // Detect development environment (localhost, 127.0.0.1, local network IPs on dev port)
      const isDevelopment = hostname === 'localhost' || 
                           hostname === '127.0.0.1' ||
                           (port === '5173' && (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.'))) ||
                           hostname.includes('.local')
                           
      const isProduction = hostname === 'agenticad.store' || hostname.includes('netlify.app')
      
      // Always use current origin for development (including network IPs), production URL for production
      const baseUrl = isDevelopment ? window.location.origin :
                      isProduction ? 'https://agenticad.store' :
                      window.location.origin // Default to current origin for safety

      // Add step=input parameter to redirect to wizard step 1 after authentication
      const redirectUrl = `${baseUrl}/?step=input`

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo: redirectUrl,
        }
      })
      
      if (error) throw error
      
      console.log('✅ Apple OAuth initiated')
      return { data, error: null }
    } catch (error) {
      console.error('❌ Apple OAuth failed:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }, [])

  const signInWithMicrosoft = useCallback(async () => {
    try {
      setLoading(true)
      console.log('🪟 Starting Microsoft OAuth...')
      
      // Determine the correct redirect URL - Enhanced development detection
      const hostname = window.location.hostname
      const port = window.location.port
      
      // Detect development environment (localhost, 127.0.0.1, local network IPs on dev port)
      const isDevelopment = hostname === 'localhost' || 
                           hostname === '127.0.0.1' ||
                           (port === '5173' && (hostname.startsWith('192.168.') || hostname.startsWith('10.') || hostname.startsWith('172.'))) ||
                           hostname.includes('.local')
                           
      const isProduction = hostname === 'agenticad.store' || hostname.includes('netlify.app')
      
      // Always use current origin for development (including network IPs), production URL for production
      const baseUrl = isDevelopment ? window.location.origin :
                      isProduction ? 'https://agenticad.store' :
                      window.location.origin // Default to current origin for safety

      // Add step=input parameter to redirect to wizard step 1 after authentication
      const redirectUrl = `${baseUrl}/?step=input`

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'azure',
        options: {
          redirectTo: redirectUrl,
          scopes: 'email',
        }
      })
      
      if (error) throw error
      
      console.log('✅ Microsoft OAuth initiated')
      return { data, error: null }
    } catch (error) {
      console.error('❌ Microsoft OAuth failed:', error)
      return { data: null, error }
    } finally {
      setLoading(false)
    }
  }, [])

  const getFreshSession = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error) throw error
      return session
    } catch (error) {
      console.error('❌ Error getting fresh session:', error)
      return null
    }
  }, [])

  const resetPassword = useCallback(async (email: string) => {
    try {
      setLoading(true)
      console.log('🔄 Sending password reset email to:', email)
      
      // Determine the correct redirect URL
      const isProduction = window.location.hostname === 'agenticad.store' || window.location.hostname.includes('netlify.app')
      const baseUrl = isProduction ? 'https://agenticad.store' : (import.meta.env.VITE_APP_URL || window.location.origin)
      // Redirect to wizard step 1 after password reset
      const redirectUrl = `${baseUrl}/?step=input`
      
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      })
      
      if (error) throw error
      
      console.log('✅ Password reset email sent')
      return { error: null }
    } catch (error) {
      console.error('❌ Password reset failed:', error)
      return { error }
    } finally {
      setLoading(false)
    }
  }, [])

  return {
    user,
    profile,
    session,
    loading,
    initialized,
    signIn,
    signUp,
    signOut,
    signInWithGoogle,
    signInWithApple,
    signInWithMicrosoft,
    resetPassword,
    getFreshSession,
    forceRefreshProfile,
    refreshProfile: forceRefreshProfile,
    ensureFreshAuth: getFreshSession,
    isReady: initialized && !loading,
    isAuthenticated: !!user,
  }
}