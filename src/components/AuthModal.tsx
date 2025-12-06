import React, { useState, useEffect } from 'react'
import { X, Mail, Lock, User, Loader2 } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  mode: 'signin' | 'signup'
  onModeChange: (mode: 'signin' | 'signup') => void
  onSuccess?: () => void
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, mode, onModeChange, onSuccess }) => {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const { signIn, signUp, signInWithGoogle, signInWithApple, signInWithMicrosoft } = useAuth()

  // Reset form when modal is closed
  useEffect(() => {
    if (!isOpen) {
      resetForm()
    }
  }, [isOpen])

  const parseSupabaseError = (error: any): string => {
    // Handle AuthApiError objects specifically
    if (error && error.__isAuthError && error.name === 'AuthApiError') {
      return handleAuthApiError(error)
    }

    // Handle errors with body property containing JSON
    if (error.body && typeof error.body === 'string') {
      try {
        const parsedBody = JSON.parse(error.body)
        if (parsedBody.code || parsedBody.message) {
          return handleErrorCode(parsedBody.code, parsedBody.message)
        }
      } catch (parseError) {
        // If body parsing fails, continue with other methods
        console.warn('Failed to parse error body:', parseError)
      }
    }

    // Handle errors with direct code property
    if (error.code) {
      return handleErrorCode(error.code, error.message)
    }

    // Handle errors with message property
    if (error.message) {
      return handleErrorMessage(error.message)
    }

    // Handle string errors
    if (typeof error === 'string') {
      return handleErrorMessage(error)
    }

    // Fallback for unknown error formats
    return 'An unexpected error occurred. Please try again.'
  }

  const handleAuthApiError = (error: any): string => {
    // Extract the core message from AuthApiError
    const message = error.message || ''
    
    // Check for specific patterns in the message
    if (message.toLowerCase().includes('user already registered')) {
      return 'An account with this email already exists. We\'ll switch you to sign-in mode automatically.'
    }
    
    if (message.toLowerCase().includes('invalid login credentials')) {
      return 'Invalid email or password. Please double-check your credentials and try again.'
    }
    
    if (message.toLowerCase().includes('email not confirmed')) {
      return 'Please check your email and click the confirmation link before signing in.'
    }
    
    // Check the status code for additional context
    if (error.status === 422) {
      return 'An account with this email already exists. We\'ll switch you to sign-in mode automatically.'
    }
    
    if (error.status === 400) {
      return 'Invalid request. Please check your email and password format.'
    }
    
    if (error.status === 401) {
      return 'Invalid email or password. Please double-check your credentials and try again.'
    }
    
    // Return the original message if no specific pattern matches
    return message || 'Authentication failed. Please try again.'
  }

  const handleErrorCode = (code: string, message?: string): string => {
    switch (code) {
      case 'user_already_exists':
        return 'An account with this email already exists. We\'ll switch you to sign-in mode automatically.'
      case 'invalid_credentials':
      case 'invalid_login_credentials':
        return 'Invalid email or password. Please double-check your credentials and try again.'
      case 'email_not_confirmed':
        return 'Please check your email and click the confirmation link before signing in.'
      case 'weak_password':
        return 'Password must be at least 6 characters long and contain a mix of letters and numbers.'
      case 'signup_disabled':
        return 'New account registration is currently disabled. Please contact support.'
      case 'email_rate_limit_exceeded':
        return 'Too many requests. Please wait a moment before trying again.'
      case 'invalid_email':
        return 'Please enter a valid email address.'
      case 'password_too_short':
        return 'Password must be at least 6 characters long.'
      default:
        return message || 'An error occurred during authentication. Please try again.'
    }
  }

  const handleErrorMessage = (message: string): string => {
    const lowerMessage = message.toLowerCase()
    
    // Handle "user already registered" variations
    if (lowerMessage.includes('user already registered') || 
        lowerMessage.includes('user_already_exists') ||
        lowerMessage.includes('user already exists')) {
      return 'An account with this email already exists. We\'ll switch you to sign-in mode automatically.'
    }
    
    // Handle invalid credentials variations
    if (lowerMessage.includes('invalid login credentials') || 
        lowerMessage.includes('invalid_credentials') ||
        lowerMessage.includes('invalid credentials')) {
      return 'Invalid email or password. Please double-check your credentials and try again.'
    }
    
    // Handle email confirmation
    if (lowerMessage.includes('email not confirmed') ||
        lowerMessage.includes('email_not_confirmed')) {
      return 'Please check your email and click the confirmation link before signing in.'
    }
    
    // Handle password requirements
    if (lowerMessage.includes('password should be at least') ||
        lowerMessage.includes('password must be at least')) {
      return 'Password must be at least 6 characters long.'
    }
    
    // Handle network/connection errors
    if (lowerMessage.includes('supabase request failed') ||
        lowerMessage.includes('failed to fetch') ||
        lowerMessage.includes('network error')) {
      return 'Unable to connect to our servers. Please check your internet connection and try again.'
    }
    
    // Handle timeout errors
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
      return 'Request timed out. Please try again.'
    }
    
    // Handle rate limiting
    if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
      return 'Too many requests. Please wait a moment before trying again.'
    }
    
    // Handle server errors
    if (lowerMessage.includes('internal server error') || lowerMessage.includes('500')) {
      return 'Server error. Please try again in a moment.'
    }
    
    // Return a cleaned version of the original message if no specific pattern is matched
    // Remove technical details but keep the core message
    if (message.length > 100) {
      return 'Authentication failed. Please check your credentials and try again.'
    }
    
    return message
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (loading) {
      console.log('⚠️ AuthModal: Form submission already in progress, ignoring...')
      return
    }
    
    console.log('🔑 AuthModal: Form submitted for', mode, 'with email:', email)
    
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      if (mode === 'signup') {
        console.log('📝 AuthModal: Attempting sign up...')
        const { error } = await signUp(email, password)
        if (error) throw error
        
        console.log('✅ AuthModal: Sign up successful!')
        setSuccess('Account created successfully! You can now sign in.')
        
        // Auto switch to signin mode after successful signup
        setTimeout(() => {
          onModeChange('signin')
          setSuccess('')
        }, 2000)
      } else {
        console.log('🔐 AuthModal: Attempting sign in...')
        const { error } = await signIn(email, password)
        if (error) {
          console.error('❌ AuthModal: Sign in failed:', error)
          throw error
        }
        
        console.log('✅ AuthModal: Sign in successful!')
        
        // Close modal and trigger success callback immediately
        console.log('🚪 AuthModal: Closing modal after sign-in success')
        onClose()
        
        if (onSuccess) {
          console.log('📞 AuthModal: Calling success callback')
          onSuccess()
        }
      }
    } catch (error: any) {
      console.error('❌ AuthModal: Authentication error:', error)
      
      // Use the enhanced error parsing
      const userFriendlyMessage = parseSupabaseError(error)
      setError(userFriendlyMessage)
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setEmail('')
    setPassword('')
    setError('')
    setSuccess('')
    setLoading(false)
  }

  const handleModeChange = (newMode: 'signin' | 'signup') => {
    resetForm()
    onModeChange(newMode)
  }

  const handleGoogleSignIn = async () => {
    if (loading) return
    
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log('🔐 AuthModal: Attempting Google sign in...')
      const { error } = await signInWithGoogle()
      if (error) throw error
      
      console.log('✅ AuthModal: Google OAuth initiated successfully')
      // Note: The actual auth completion happens via redirect, 
      // so we don't need to call onSuccess here
    } catch (error: any) {
      console.error('❌ AuthModal: Google OAuth error:', error)
      const userFriendlyMessage = parseSupabaseError(error)
      setError(userFriendlyMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleAppleSignIn = async () => {
    if (loading) return
    
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log('🔐 AuthModal: Attempting Apple sign in...')
      const { error } = await signInWithApple()
      if (error) throw error
      
      console.log('✅ AuthModal: Apple OAuth initiated successfully')
      // Note: The actual auth completion happens via redirect, 
      // so we don't need to call onSuccess here
    } catch (error: any) {
      console.error('❌ AuthModal: Apple OAuth error:', error)
      const userFriendlyMessage = parseSupabaseError(error)
      setError(userFriendlyMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleMicrosoftSignIn = async () => {
    if (loading) return
    
    setLoading(true)
    setError('')
    setSuccess('')

    try {
      console.log('🔐 AuthModal: Attempting Microsoft sign in...')
      const { error } = await signInWithMicrosoft()
      if (error) throw error
      
      console.log('✅ AuthModal: Microsoft OAuth initiated successfully')
      // Note: The actual auth completion happens via redirect, 
      // so we don't need to call onSuccess here
    } catch (error: any) {
      console.error('❌ AuthModal: Microsoft OAuth error:', error)
      const userFriendlyMessage = parseSupabaseError(error)
      setError(userFriendlyMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-50 flex items-center justify-center p-4">
      <div className="horizon-card w-full max-w-md relative p-6 sm:p-8 max-h-[90vh] overflow-y-auto">
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 text-gray-400 hover:text-white transition-colors p-1"
          disabled={loading}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-xl sm:text-2xl font-bold horizon-gradient-text mb-1">
            {mode === 'signup' ? 'Start Creating' : 'Welcome Back'}
          </h2>
          <p className="text-sm text-gray-400">
            {mode === 'signup'
              ? 'Turn ideas into CAD designs'
              : 'Continue your design journey'
            }
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 horizon-input text-sm disabled:opacity-50"
              placeholder="Email address"
              required
              disabled={loading}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 horizon-input text-sm disabled:opacity-50"
              placeholder="Password (min 6 characters)"
              required
              minLength={6}
              disabled={loading}
            />
          </div>

          {error && (
            <div className="p-2.5 bg-red-500/10 border border-red-500/30 rounded-lg">
              <p className="text-red-400 text-xs">{error}</p>
            </div>
          )}

          {success && (
            <div className="p-2.5 bg-green-500/10 border border-green-500/30 rounded-lg">
              <p className="text-green-400 text-xs">{success}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 horizon-button-primary text-sm font-semibold rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="hidden sm:inline">{mode === 'signup' ? 'Creating...' : 'Signing In...'}</span>
              </>
            ) : (
              mode === 'signup' ? 'Create Account' : 'Sign In'
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="my-4 flex items-center">
          <div className="flex-1 h-px bg-white/10"></div>
          <span className="px-3 text-gray-500 text-xs">or continue with</span>
          <div className="flex-1 h-px bg-white/10"></div>
        </div>

        {/* OAuth Buttons - Grid layout for mobile */}
        <div className="grid grid-cols-3 gap-2">
          {/* Google OAuth Button */}
          <button
            onClick={handleGoogleSignIn}
            disabled={loading}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 border border-white/10 hover:border-white/20"
            title="Continue with Google"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span className="text-xs text-gray-300">Google</span>
              </>
            )}
          </button>

          {/* Apple OAuth Button */}
          <button
            onClick={handleAppleSignIn}
            disabled={loading}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 border border-white/10 hover:border-white/20"
            title="Continue with Apple"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="white">
                  <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
                </svg>
                <span className="text-xs text-gray-300">Apple</span>
              </>
            )}
          </button>

          {/* Microsoft OAuth Button */}
          <button
            onClick={handleMicrosoftSignIn}
            disabled={loading}
            className="p-3 bg-white/10 hover:bg-white/20 rounded-lg transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed flex flex-col items-center justify-center gap-1 border border-white/10 hover:border-white/20"
            title="Continue with Microsoft"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="#00a4ef">
                  <path d="M0 0h11v11H0V0zm13 0h11v11H13V0zM0 13h11v11H0V13zm13 0h11v11H13V13z"/>
                </svg>
                <span className="text-xs text-gray-300">Microsoft</span>
              </>
            )}
          </button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-xs text-gray-400">
            {mode === 'signup' ? 'Already have an account?' : "Don't have an account?"}{' '}
            <button
              onClick={() => handleModeChange(mode === 'signup' ? 'signin' : 'signup')}
              className="text-cyan-400 hover:text-cyan-300 font-medium transition-colors disabled:opacity-50"
              disabled={loading}
            >
              {mode === 'signup' ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>

        {mode === 'signup' && (
          <div className="mt-4 p-3 bg-white/5 rounded-lg border border-white/10">
            <p className="text-xs text-gray-300 text-center">
              <span className="text-cyan-400 font-semibold">Free tier:</span> 2 designs/mo • 5 chats • Full features
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default AuthModal