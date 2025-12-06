import React, { useState, useEffect } from 'react'
import { X, Check, Zap, Crown, Loader2, Star } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { stripeProducts, getProductByTier, getManufacturingAddon } from '../stripe-config'
import ContactSupportModal from './ContactSupportModal'
import type { UserProfile } from '../hooks/useAuth'
import type { User } from '@supabase/supabase-js'

interface SubscriptionModalProps {
  isOpen: boolean
  onClose: () => void
  user: User | null
  profile: UserProfile | null
  ensureFreshAuth: () => Promise<any>
}

const SubscriptionModal: React.FC<SubscriptionModalProps> = ({ 
  isOpen, 
  onClose, 
  user, 
  profile, 
  ensureFreshAuth 
}) => {
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showContactSupport, setShowContactSupport] = useState(false)

  // Safety mechanism: Clear loading state after 60 seconds to prevent infinite loading
  useEffect(() => {
    if (loading) {
      const timeoutId = setTimeout(() => {
        console.warn('Loading state stuck, clearing after timeout')
        setLoading(null)
        setError('Request timed out. Please try again.')
      }, 60000) // 60 seconds

      return () => clearTimeout(timeoutId)
    }
  }, [loading])

  // Clean subscription logic without legacy handling
  const currentTier = profile?.subscription_tier || 'free'
  const isPaidUser = currentTier !== 'free'
  const hasManufacturerAccess = profile?.manufacturer_access || false

  // Get product info for manufacturing addon
  const manufacturingAddon = getProductByTier('manufacturer')
  const manufacturingEnabled = manufacturingAddon && currentTier === 'pro'

  const plans = [
    {
      id: 'free',
      name: 'Free',
      price: '$0',
      period: 'forever',
      icon: <Zap className="w-6 h-6" />,
      priceId: null,
      features: [
        '2 design generations per month',
        '5 design refinement chats',
        'Full access to all features',
        'Community support'
      ],
      current: currentTier === 'free',
      buttonText: currentTier === 'free' ? 'Current Plan' : 'Cancel Subscription',
      disabled: currentTier === 'free',
      isUpgrade: false,
      isDowngrade: isPaidUser,
      greyedOut: isPaidUser, // New property to grey out for paid users
      isCancel: isPaidUser // This is a cancellation for paid users
    },
    // Plus Plan - Fixed to prevent duplication
    {
      id: 'plus',
      name: 'Plus',
      price: '$25',
      period: 'per month',
      icon: <Star className="w-6 h-6" />,
      priceId: stripeProducts.find(p => p.name.includes('Plus'))?.priceId || '',
      features: [
        '10 design generations per month',
        '100 design refinement chats',
        'Priority processing',
        'Email support',
        'Advanced export options'
      ],
      current: currentTier === 'plus',
      buttonText: currentTier === 'plus' ? 'Current Plan' : currentTier === 'pro' ? 'Downgrade to Plus' : 'Upgrade to Plus',
      disabled: currentTier === 'plus',
      isUpgrade: currentTier === 'free',
      isDowngrade: currentTier === 'pro',
      greyedOut: isPaidUser && currentTier !== 'plus',
      isCancel: false
    },
    // Pro Plan - Fixed to prevent duplication
    {
      id: 'pro',
      name: 'Pro',
      price: '$100',
      period: 'per month',
      icon: <Crown className="w-6 h-6" />,
      priceId: stripeProducts.find(p => p.name.includes('Pro'))?.priceId || '',
      features: [
        '100 design generations per month',
        '1000 design refinement chats',
        'Fastest processing',
        'Priority support',
        'Advanced analytics',
        'API access',
        'Custom integrations'
      ],
      current: currentTier === 'pro',
      buttonText: currentTier === 'pro' ? 'Current Plan' : 'Upgrade to Pro',
      disabled: currentTier === 'pro',
      isUpgrade: currentTier === 'free' || currentTier === 'plus',
      isDowngrade: false,
      greyedOut: false,
      isCancel: false
    }
  ]

  const handleManufacturerAction = async () => {
    if (!user) {
      setError('Please sign in to manage your subscription')
      return
    }

    if (loading) {
      return
    }

    setLoading('manufacturer')
    setError(null)

    try {
      if (hasManufacturerAccess) {
        // Handle cancellation by opening contact support modal
        console.log('Opening contact support for manufacturer addon cancellation')
        setShowContactSupport(true)
        setLoading(null)
        return
      } else {
        // Handle adding the manufacturer addon
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session?.access_token) {
          throw new Error('Authentication session expired. Please refresh the page and try again.')
        }

        // Determine the correct redirect URLs - fix for localhost development
        const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        const isProduction = window.location.hostname === 'agenticad.store' || window.location.hostname.includes('netlify.app')
        
        let baseUrl: string
        if (isLocalhost) {
          // Force localhost for development
          baseUrl = window.location.origin
        } else if (isProduction) {
          baseUrl = 'https://agenticad.store'
        } else {
          // Fallback to current origin for other environments
          baseUrl = window.location.origin
        }
        
        const manufacturingAddon = getManufacturingAddon()
        if (!manufacturingAddon) {
          throw new Error('Manufacturing Connect addon not available')
        }

        const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session?.access_token}`,
          },
          body: JSON.stringify({
            price_id: manufacturingAddon.priceId,
            mode: 'subscription',
            success_url: `${baseUrl}/success`,
            cancel_url: `${baseUrl}/cancel`,
          })
        })

        if (!response.ok) {
          let errorMessage = `Request failed with status ${response.status}`
          
          try {
            const errorData = await response.json()
            errorMessage = errorData.error || errorMessage
          } catch (e) {
            errorMessage = response.statusText || errorMessage
          }
          
          throw new Error(errorMessage)
        }

        const data = await response.json()
        
        if (data.url) {
          onClose()
          window.location.href = data.url
        } else {
          throw new Error('No checkout URL received')
        }
      }
    } catch (error: any) {
      console.error('Manufacturer action error:', error)
      setError(error.message || 'An error occurred. Please try again.')
    } finally {
      setLoading(null)
    }
  }

  const handleSubscribe = async (plan: any) => {
    // Don't allow subscribing to current plan
    if (plan.disabled && plan.current) {
      console.log('Cannot subscribe to current plan')
      return
    }

    // Handle cancellation for paid users wanting to go to free
    if (plan.isCancel && plan.id === 'free') {
      console.log('Opening contact support for subscription cancellation')
      
      // Open contact support modal instead of trying customer portal
      setShowContactSupport(true)
      setLoading(null)
      return
    }

    // Don't allow subscribing to free plan for non-cancellation cases
    if (plan.id === 'free' || !plan.priceId) {
      console.log('Subscription blocked:', { 
        isFree: plan.id === 'free', 
        hasPriceId: !!plan.priceId,
        planId: plan.id,
        planName: plan.name
      })
      return
    }

    // Check if user is authenticated
    if (!user) {
      console.error('User not authenticated when trying to subscribe')
      setError('Please sign in to upgrade your subscription')
      return
    }

    // Prevent multiple simultaneous requests
    if (loading) {
      console.log('Already processing a subscription request')
      return
    }

    console.log('=== Starting subscription process ===')
    console.log('Plan:', plan.name, plan.priceId)
    console.log('User:', user.email)

    setLoading(plan.id)
    setError(null)
    
    try {
      // Simple session check - get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError || !session?.access_token) {
        throw new Error('Authentication session expired. Please refresh the page and try again.')
      }

      console.log('Creating checkout session...')

      // Determine the correct redirect URLs - fix for localhost development
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      const isProduction = window.location.hostname === 'agenticad.store' || window.location.hostname.includes('netlify.app')
      
      let baseUrl: string
      if (isLocalhost) {
        // Force localhost for development
        baseUrl = window.location.origin
      } else if (isProduction) {
        baseUrl = 'https://agenticad.store'
      } else {
        // Fallback to current origin for other environments
        baseUrl = window.location.origin
      }
      
      console.log('💳 Stripe checkout environment check:', { 
        hostname: window.location.hostname, 
        isLocalhost,
        isProduction, 
        envVar: import.meta.env.VITE_APP_URL,
        baseUrl,
        origin: window.location.origin
      })

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({
          price_id: plan.priceId,
          mode: 'subscription',
          success_url: `${baseUrl}/success`,
          cancel_url: `${baseUrl}/cancel`,
        })
      })

      console.log('Response status:', response.status)

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`
        
        try {
          const errorData = await response.json()
          console.error('Error response:', errorData)
          errorMessage = errorData.error || errorMessage
        } catch (e) {
          console.error('Failed to parse error response')
          errorMessage = response.statusText || errorMessage
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('Checkout session created:', data)
      
      if (data.url) {
        console.log('Redirecting to checkout...')
        // Close modal and redirect
        onClose()
        window.location.href = data.url
      } else {
        throw new Error('No checkout URL received')
      }
      
    } catch (error: any) {
      console.error('Subscription error:', error)
      
      // Set user-friendly error message
      let errorMessage = error.message
      
      if (errorMessage.includes('fetch') || errorMessage.includes('network')) {
        errorMessage = 'Connection failed. Please check your internet and try again.'
      } else if (errorMessage.includes('session') || errorMessage.includes('auth')) {
        errorMessage = 'Session expired. Please refresh the page and try again.'
      } else if (errorMessage.includes('500')) {
        errorMessage = 'Server error. Please try again in a moment.'
      }
      
      setError(errorMessage)
    } finally {
      // Always clear loading state
      console.log('Clearing loading state')
      setLoading(null)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-white/10 rounded-2xl p-8 w-full max-w-4xl relative max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          disabled={!!loading}
        >
          <X className="w-6 h-6" />
        </button>

        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-white mb-2">Choose Your Plan</h2>
          <p className="text-gray-400">
            Unlock more designs and refinements to bring your ideas to life
          </p>
          {profile && (
            <p className="text-cyan-400 text-sm mt-2">
              Current plan: {(() => {
                const tierName = profile.subscription_tier.charAt(0).toUpperCase() + profile.subscription_tier.slice(1)
                if (profile.subscription_tier === 'free') {
                  return 'Free'
                }
                
                return tierName + (profile.manufacturer_access ? ' + Manufacturing Connect' : ' without manufacturing')
              })()}
            </p>
              )}
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
            <p className="text-red-400 text-sm text-center">{error}</p>
            <button
              onClick={() => setError(null)}
              className="mt-2 text-red-300 hover:text-red-200 text-xs underline block mx-auto"
            >
              Dismiss
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plans.map((plan) => (
            <div
              key={plan.id}
              className={`relative p-6 rounded-2xl border transition-all duration-300 ${
                plan.current
                  ? plan.name.includes('Pro')
                    ? 'border-yellow-400 bg-yellow-500/10 ring-2 ring-yellow-400/20' // Pro plan highlighting
                    : plan.name.includes('Plus')
                    ? 'border-green-400 bg-green-500/10 ring-2 ring-green-400/20' // Plus plan highlighting
                    : 'border-cyan-400 bg-cyan-500/10 ring-2 ring-cyan-400/20' // Free plan highlighting
                  : plan.greyedOut
                  ? 'border-gray-600 cosmic-panel/20 opacity-60 cursor-not-allowed' // Greyed out for paid users
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              {plan.current && (
                <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
                  <span className={`px-3 py-1 text-white text-sm font-medium rounded-full ${
                    plan.name.includes('Pro')
                      ? 'bg-gradient-to-r from-yellow-500 to-orange-500'
                      : plan.name.includes('Plus')
                      ? 'bg-gradient-to-r from-green-500 to-emerald-500'
                      : 'bg-cyan-500'
                  }`}>
                    {plan.name.includes('Pro') ? '👑 Current Plan' : 'Current Plan'}
                  </span>
                </div>
              )}

              <div className="text-center mb-6">
                <div className={`w-12 h-12 mx-auto mb-4 rounded-full flex items-center justify-center ${
                  plan.name.includes('Pro') 
                    ? 'bg-gradient-to-r from-yellow-400 to-orange-400' 
                    : plan.name.includes('Plus')
                    ? 'bg-gradient-to-r from-green-400 to-emerald-400' 
                    : 'horizon-button-primary'
                }`}>
                  {plan.icon}
                </div>
                <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                <div className="mb-4">
                  <span className="text-3xl font-bold text-white">{plan.price}</span>
                  <span className="text-gray-400 ml-1">/{plan.period}</span>
                </div>
              </div>

              <ul className="space-y-3 mb-6">
                {plan.features.map((feature, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <Check className={`w-5 h-5 flex-shrink-0 mt-0.5 ${
                      plan.greyedOut ? 'text-gray-500' : 'text-green-400'
                    }`} />
                    <span className={`text-sm ${
                      plan.greyedOut ? 'text-gray-500' : 'text-gray-300'
                    }`}>{feature}</span>
                  </li>
                ))}
              </ul>

              {plan.greyedOut && (
                <div className="mb-4 p-2 bg-gray-700/30 border border-gray-600 rounded-lg">
                  <p className="text-gray-400 text-xs text-center">
                    Cancel your current subscription to return to this plan
                  </p>
                </div>
              )}

              <button
                onClick={() => handleSubscribe(plan)}
                disabled={plan.disabled || loading === plan.id}
                className={`w-full py-3 rounded-lg font-semibold transition-all duration-300 flex items-center justify-center gap-2 ${
                  plan.disabled && plan.current
                    ? plan.name.includes('Pro')
                      ? 'bg-gradient-to-r from-yellow-500/50 to-orange-500/50 text-yellow-200 cursor-not-allowed'
                      : plan.name.includes('Plus')
                      ? 'bg-gradient-to-r from-green-500/50 to-emerald-500/50 text-green-200 cursor-not-allowed'
                      : 'bg-cyan-500/50 text-cyan-200 cursor-not-allowed'
                    : plan.isCancel
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700'
                    : plan.isDowngrade && !plan.isCancel
                    ? 'bg-gradient-to-r from-gray-500 to-gray-600 text-white hover:from-gray-600 hover:to-gray-700'
                    : plan.greyedOut
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed opacity-50'
                    : plan.name.includes('Pro')
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-white hover:from-yellow-600 hover:to-orange-600'
                    : plan.name.includes('Plus')
                    ? 'bg-gradient-to-r from-green-500 to-emerald-500 text-white hover:from-green-600 hover:to-emerald-600'
                    : 'horizon-button-primary'
                }`}
              >
                {loading === plan.id ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Processing...
                  </>
                ) : (
                  plan.buttonText
                )}
              </button>
            </div>
          ))}
        </div>

        {/* Manufacturer Addon Section */}
        <div className="mt-12 border-t border-white/10 pt-8">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold text-white mb-2">Manufacturing Connect Add-on</h3>
            <p className="text-gray-400">
              Access our global network of verified suppliers and manufacturers
            </p>
          </div>

          <div className="horizon-card rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 horizon-button-primary rounded-full flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-4m-5 0H3m2 0h3M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-lg font-semibold text-white">Manufacturing Connect</h4>
                  <p className="text-sm text-gray-300">Global supplier network access</p>
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-white">$100</div>
                <div className="text-sm text-gray-400">per month</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">1000s of verified suppliers & manufacturers across the world</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">Direct contact information</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">Professional quote request system</span>
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">International manufacturer search</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">Priority customer support</span>
                </div>
                <div className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-gray-300">Usage analytics dashboard</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-gray-400">
                {hasManufacturerAccess ? (
                  <span className="text-green-400 font-medium">✓ Currently active</span>
                ) : currentTier === 'free' ? (
                  <span className="text-orange-400">Requires Plus or Pro subscription</span>
                ) : (
                  <span>Available as addon to your {currentTier.charAt(0).toUpperCase() + currentTier.slice(1)} plan</span>
                )}
              </div>
              <button
                onClick={() => handleManufacturerAction()}
                disabled={loading === 'manufacturer' || (currentTier === 'free' && !hasManufacturerAccess)}
                className={`px-6 py-3 rounded-lg font-semibold transition-all duration-300 flex items-center gap-2 ${
                  loading === 'manufacturer' || (currentTier === 'free' && !hasManufacturerAccess)
                    ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                    : hasManufacturerAccess
                    ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700'
                    : 'horizon-button-primary text-white hover:opacity-90'
                }`}
              >
                {loading === 'manufacturer' ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processing...
                  </>
                ) : (currentTier === 'free' && !hasManufacturerAccess) ? (
                  'Upgrade to Plus or Pro first'
                ) : hasManufacturerAccess ? (
                  'Cancel Manufacturing Connect'
                ) : (
                  'Add Manufacturing Connect'
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-8 text-center">
          <p className="text-gray-400 text-sm">
            All plans include access to our full feature set. Cancel anytime.
          </p>
          <p className="text-gray-500 text-xs mt-2">
            Secure payments powered by Stripe
          </p>
        </div>
      </div>
      {showContactSupport && (
        <ContactSupportModal
          isOpen={showContactSupport}
          onClose={() => setShowContactSupport(false)}
          user={user}
          profile={profile}
          requestType="cancellation"
        />
      )}
    </div>
  )
}

export default SubscriptionModal