import React from 'react'
import { XCircle, ArrowLeft, RefreshCw, Home } from 'lucide-react'

const CancelPage: React.FC = () => {
  const handleBackToApp = () => {
    // Clear the URL and navigate to home
    window.history.replaceState({}, '', '/')
    // Force a page reload to ensure clean state
    window.location.reload()
  }

  const handleTryAgain = () => {
    // Clear the URL and navigate to home, then open subscription modal
    window.history.replaceState({}, '', '/')
    // Use a small delay to ensure URL is updated before opening modal
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openSubscriptionModal'))
    }, 100)
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4">
      {/* Cosmic Destiny Background */}
      <div className="absolute inset-0" style={{ background: 'var(--destiny-gradient)' }}></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(239,68,68,0.1),transparent_50%)] animate-pulse"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(220,38,38,0.1),transparent_50%)] animate-pulse" style={{ animationDelay: '2s' }}></div>
      {/* Persistent Logo Navigation */}
      <button
        onClick={handleBackToApp}
        className="fixed top-6 left-6 z-50 group hover:scale-110 transition-transform duration-300"
      >
        <img
          src="/agenticad-logo.png"
          alt="AgentiCAD Logo"
          className="w-16 h-16 object-cover rounded-full shadow-lg hover:shadow-xl transition-shadow duration-300"
          style={{
            boxShadow: '0 4px 20px rgba(96, 165, 250, 0.3)'
          }}
        />
        {/* Hover tooltip */}
        <div className="absolute -bottom-12 left-1/2 transform -translate-x-1/2 bg-black/90 text-white px-3 py-1 rounded text-sm whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          Back to Home
        </div>
      </button>
      
      
      <div className="cosmic-panel w-full max-w-lg text-center relative z-10">
        <div className="relative w-24 h-24 mx-auto mb-8">
          <div className="absolute inset-0 bg-gradient-to-r from-red-400 via-orange-500 to-red-500 rounded-full animate-pulse"></div>
          <div className="absolute inset-2 bg-gradient-to-r from-red-600 to-orange-600 rounded-full flex items-center justify-center">
          <XCircle className="w-12 h-12 text-white cosmic-glow-text" />
          </div>
          <div className="absolute -inset-4 bg-gradient-to-r from-red-400/30 to-orange-400/30 rounded-full blur-xl animate-pulse" style={{ animationDelay: '1s' }}></div>
        </div>

        <h1 className="text-3xl font-bold text-white mb-4">Payment Cancelled</h1>
        
        <div className="mb-8">
          <p className="text-gray-300 mb-4">
            Your payment was cancelled. No charges were made to your account.
          </p>
          <p className="text-gray-400 text-sm">
            You can try again anytime or continue using the free plan with 2 design generations and 5 refinement chats per month.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={handleTryAgain}
            className="horizon-button-primary flex items-center justify-center gap-2 w-full px-8 py-4 font-semibold"
          >
            <RefreshCw className="w-5 h-5" />
            Try Again
          </button>
          
          <button
            onClick={handleBackToApp}
            className="flex items-center justify-center gap-2 w-full px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <Home className="w-5 h-5" />
            Continue with Free Plan
          </button>
        </div>
      </div>
    </div>
  )
}

export default CancelPage