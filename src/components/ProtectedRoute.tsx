import React, { useEffect, useRef, useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { Loader2 } from 'lucide-react'

interface ProtectedRouteProps {
  children: React.ReactNode
  onAuthRequired: () => void
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, onAuthRequired }) => {
  const { user, loading } = useAuth()
  const hasTriggeredAuth = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [showAuthRequired, setShowAuthRequired] = useState(false)

  // Development bypass: Check if we're on a development URL
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
    
    if (isDevelopment) {
      console.log('🔧 ProtectedRoute: Development mode detected, bypassing authentication');
      console.log('🔧 Details:', { hostname, port, isIPAddress, isLocalhost, isPrivateNetwork, isDevPort });
    }
    
    return isDevelopment;
  }, [])

  useEffect(() => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }

    // Reset states when user becomes available
    if (user) {
      hasTriggeredAuth.current = false
      setShowAuthRequired(false)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      return
    }

    // Only trigger auth required when we're not loading, there's no user, and NOT in dev mode
    if (!loading && !user && !hasTriggeredAuth.current && !isDevMode) {
      // Add a delay to prevent race conditions and allow auth state to settle
      timeoutRef.current = setTimeout(() => {
        if (!user && !hasTriggeredAuth.current && !loading && !isDevMode) {
          console.log('ProtectedRoute: Triggering auth required')
          hasTriggeredAuth.current = true
          setShowAuthRequired(true)
          onAuthRequired()
        }
      }, 500) // Increased delay to allow auth state to settle
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [loading, user, onAuthRequired, isDevMode])

  // Show loading state while auth is initializing
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--destiny-gradient)' }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Loading...</p>
          <p className="text-gray-500 text-sm mt-2">Verifying authentication...</p>
        </div>
      </div>
    )
  }

  // If user is authenticated OR we're in development mode, render children
  if (user || isDevMode) {
    return <>{children}</>
  }

  // Show auth required state only after we've triggered the auth modal
  if (showAuthRequired) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--destiny-gradient)' }}>
        <div className="text-center">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
          <p className="text-gray-300">Authentication required</p>
          <p className="text-gray-500 text-sm mt-2">Please sign in to continue...</p>
        </div>
      </div>
    )
  }

  // Default loading state while waiting for auth check
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--destiny-gradient)' }}>
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin mx-auto mb-4" />
        <p className="text-gray-300">Checking authentication...</p>
      </div>
    </div>
  )
}

export default ProtectedRoute