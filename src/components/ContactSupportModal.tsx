import React, { useState } from 'react'
import { X, Mail, AlertCircle, Clock, CheckCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { UserProfile } from '../hooks/useAuth'
import type { User } from '@supabase/supabase-js'

interface ContactSupportModalProps {
  isOpen: boolean
  onClose: () => void
  user: User | null
  profile: UserProfile | null
  requestType: 'cancellation' | 'support' | 'billing'
  defaultMessage?: string
}

const ContactSupportModal: React.FC<ContactSupportModalProps> = ({
  isOpen,
  onClose,
  user,
  profile,
  requestType,
  defaultMessage = ''
}) => {
  const [message, setMessage] = useState(defaultMessage)
  const [urgency, setUrgency] = useState<'low' | 'normal' | 'high'>('normal')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!user || !message.trim()) {
      setError('Please provide a message')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      
      if (!session) {
        setError('Please sign in to submit a support request')
        setLoading(false)
        return
      }

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/contact-support`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          type: requestType,
          userEmail: user.email,
          userName: user.user_metadata?.full_name || '',
          message: message.trim(),
          subscriptionTier: profile?.subscription_tier,
          urgency
        })
      })

      const data = await response.json()

      if (!response.ok) {
        console.error('❌ Support request failed:', data)
        throw new Error(data.error || data.details || `Request failed: ${response.status}`)
      }

      console.log('✅ Support request successful:', data)
      setSuccess(true)
      setTimeout(() => {
        onClose()
        setSuccess(false)
        setMessage('')
        setUrgency('normal')
      }, 3000)

    } catch (error: any) {
      console.error('Support request error:', error)
      setError(error.message || 'Failed to send support request. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const getTitle = () => {
    switch (requestType) {
      case 'cancellation':
        return 'Cancel Subscription'
      case 'billing':
        return 'Billing Support'
      default:
        return 'Contact Support'
    }
  }

  const getDefaultMessage = () => {
    if (defaultMessage) return defaultMessage
    
    switch (requestType) {
      case 'cancellation':
        return `Hi,\n\nI would like to cancel my subscription (${profile?.subscription_tier || 'current plan'}).\n\nPlease cancel at the end of my billing period so I can keep access until then.\n\nThanks!`
      case 'billing':
        return 'Hi,\n\nI have a question about my billing...'
      default:
        return 'Hi,\n\nI need help with...'
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-700">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <Mail className="w-5 h-5" />
            {getTitle()}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {success ? (
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-white mb-2">Request Sent!</h3>
              <p className="text-gray-300 mb-4">
                We'll respond within 24 hours to your email address.
              </p>
              <p className="text-sm text-gray-400">
                This window will close automatically...
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Info */}
              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3">
                <p className="text-blue-200 text-sm flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  We'll respond to your email address within 24 hours. For cancellations, we'll process them at the end of your billing period.
                </p>
              </div>

              {/* Urgency */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Priority Level
                </label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as 'low' | 'normal' | 'high')}
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="low">Low - General inquiry</option>
                  <option value="normal">Normal - Standard request</option>
                  <option value="high">High - Urgent issue</option>
                </select>
              </div>

              {/* Message */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Message *
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={getDefaultMessage()}
                  rows={6}
                  required
                  className="w-full bg-gray-800 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-400 focus:outline-none focus:border-blue-500 resize-none"
                />
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3">
                  <p className="text-red-300 text-sm">{error}</p>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 px-4 bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors"
                  disabled={loading}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading || !message.trim()}
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {loading && <Clock className="w-4 h-4 animate-spin" />}
                  {loading ? 'Sending...' : 'Send Request'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default ContactSupportModal 