import React, { useState } from 'react';
import { 
  Building2, 
  Globe, 
  Phone, 
  Mail, 
  FileText, 
  Shield, 
  TrendingUp, 
  ArrowRight,
  CheckCircle,
  Star,
  Loader2
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getManufacturerUpgradePath } from '../hooks/useManufacturerAccess';
import { supabase } from '../lib/supabase';
import { getProductByTier } from '../stripe-config';

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const FeatureCard: React.FC<FeatureCardProps> = ({ icon, title, description }) => (
  <div className="horizon-card rounded-xl p-6 text-center">
    <div className="flex justify-center mb-4 text-3xl">
      {icon}
    </div>
    <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
    <p className="text-gray-300 text-sm">{description}</p>
  </div>
);

const CountryFlag: React.FC<{ country: string; flag: string }> = ({ country, flag }) => (
  <div className="flex items-center gap-2 text-sm text-gray-300">
    <span className="text-xl">{flag}</span>
    <span>{country}</span>
  </div>
);

export const ManufacturerPaywall: React.FC = () => {
  const { user, profile } = useAuth();
  const currentTier = profile?.subscription_tier || 'free';
  const upgradeInfo = getManufacturerUpgradePath(currentTier);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Check if user needs to upgrade their base plan first
  const needsBasePlanUpgrade = currentTier === 'free';

  const handleUpgrade = async () => {
    if (!user) {
      setError('Please sign in to upgrade your subscription');
      return;
    }

    if (loading) {
      return;
    }

    // If user needs to upgrade base plan first, direct them to subscription modal
    if (needsBasePlanUpgrade) {
      setError('Please upgrade to Plus or Pro first, then add Manufacturing Connect as an addon.');
      // Trigger opening subscription modal
      window.dispatchEvent(new CustomEvent('openSubscriptionModal'));
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Get the manufacturer product configuration
      const manufacturingAddon = getManufacturingAddon();
      if (!manufacturingAddon) {
        throw new Error('Manufacturing addon not available');
      }

      console.log('Starting manufacturing addon process for user:', user.email);

      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session?.access_token) {
        throw new Error('Authentication session expired. Please refresh the page and try again.');
      }

      // Determine the correct redirect URLs - fix for localhost development
      const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      const isProduction = window.location.hostname === 'agenticad.store' || window.location.hostname.includes('netlify.app');
      
      let baseUrl: string;
      if (isLocalhost) {
        // Force localhost for development
        baseUrl = window.location.origin;
      } else if (isProduction) {
        baseUrl = 'https://agenticad.store';
      } else {
        // Fallback to current origin for other environments
        baseUrl = window.location.origin;
      }
      
      console.log('🏭 Manufacturing addon checkout environment check:', { 
        hostname: window.location.hostname, 
        isLocalhost,
        isProduction, 
        envVar: import.meta.env.VITE_APP_URL,
        baseUrl,
        origin: window.location.origin
      });

      console.log('Creating Stripe checkout session for manufacturing addon...');

      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/stripe-checkout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          price_id: manufacturingAddon.priceId,
          mode: 'subscription',
          success_url: `${baseUrl}/success`,
          cancel_url: `${baseUrl}/cancel`,
        })
      });

      console.log('Stripe checkout response status:', response.status);

      if (!response.ok) {
        let errorMessage = `Request failed with status ${response.status}`;
        
        try {
          const errorData = await response.json();
          console.error('Stripe checkout error response:', errorData);
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          console.error('Failed to parse error response');
          errorMessage = response.statusText || errorMessage;
        }
        
        throw new Error(errorMessage);
      }

      const data = await response.json();
      console.log('Stripe checkout session created:', data);

      if (data.url) {
        console.log('Redirecting to Stripe checkout:', data.url);
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL returned from Stripe');
      }

    } catch (error) {
      console.error('Error starting manufacturing addon:', error);
      setError(error instanceof Error ? error.message : 'Failed to start upgrade process');
    } finally {
      setLoading(false);
    }
  };

  const handleSignIn = () => {
    // TODO: Trigger sign-in modal
    console.log('Sign in required...');
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Error Display */}
      {error && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400">
          {error}
        </div>
      )}

      {/* Hero Section */}
      <div className="text-center mb-12">
        <div className="horizon-card rounded-3xl p-12">
          <div className="flex justify-center mb-6">
            <div className="horizon-button-primary p-4 rounded-full">
              <Building2 className="w-12 h-12 text-white" />
            </div>
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-6">
            🏭 {needsBasePlanUpgrade ? 'Upgrade to Access' : 'Add'} Manufacturing Connect
          </h1>
          
          <p className="text-xl text-gray-300 mb-8 max-w-3xl mx-auto">
            {needsBasePlanUpgrade 
              ? 'Upgrade to Plus or Pro, then add Manufacturing Connect to access 21+ verified manufacturers worldwide.'
              : 'Add Manufacturing Connect to your subscription for direct access to global suppliers and professional quote requests.'
            }
          </p>
          
          {needsBasePlanUpgrade && (
            <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6 max-w-2xl mx-auto">
              <p className="text-orange-300 text-sm">
                <strong>Note:</strong> Manufacturing Connect requires Plus ($25/month) or Pro ($100/month) subscription. 
                Manufacturing addon costs an additional $100/month.
              </p>
            </div>
          )}

          <div className="flex items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-2 text-yellow-400">
              <Star className="w-5 h-5 fill-current" />
              <span className="font-semibold">Premium Addon</span>
            </div>
            <div className="text-gray-400">•</div>
            <div className="text-cyan-400 font-semibold">
              {needsBasePlanUpgrade ? 'Requires Plus/Pro + $100/month' : '+$100/month addon'}
            </div>
            <div className="text-gray-400">•</div>
            <div className="text-green-400 font-semibold">
              Professional Grade
            </div>
          </div>

          {user ? (
            <button
              onClick={handleUpgrade}
              disabled={loading}
              className={`px-8 py-4 rounded-xl font-bold text-lg transition-all duration-300 shadow-xl flex items-center gap-3 mx-auto disabled:opacity-50 disabled:cursor-not-allowed ${
                needsBasePlanUpgrade 
                  ? 'bg-gradient-to-r from-orange-600 to-red-600 text-white hover:from-orange-700 hover:to-red-700 shadow-orange-500/30'
                  : 'horizon-button-primary text-white shadow-lg'
              }`}
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Processing...
                </>
              ) : needsBasePlanUpgrade ? (
                <>
                  View Subscription Plans
                  <ArrowRight className="w-5 h-5" />
                </>
              ) : (
                <>
                  Add Manufacturing Connect
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>
          ) : (
            <button
              onClick={handleSignIn}
              className="bg-gradient-to-r from-gray-600 to-gray-700 text-white px-8 py-4 rounded-xl font-bold text-lg hover:from-gray-700 hover:to-gray-800 transition-all duration-300 flex items-center gap-3 mx-auto"
            >
              Sign In to Continue
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid md:grid-cols-3 gap-8 mb-12">
        <FeatureCard
          icon={<Globe className="w-8 h-8 text-cyan-400" />}
          title="Global Coverage"
          description="21+ manufacturers across Canada, Germany, China, Japan, UK, India, Korea, and Australia"
        />
        <FeatureCard
          icon={<div className="flex gap-1"><Phone className="w-6 h-6 text-green-400" /><Mail className="w-6 h-6 text-blue-400" /></div>}
          title="Direct Contact"
          description="Phone numbers, email addresses, and verified contact information for each supplier"
        />
        <FeatureCard
          icon={<FileText className="w-8 h-8 text-white" />}
          title="Quote System"
          description="Professional quote request system with automated notifications and tracking"
        />
      </div>

      {/* Global Suppliers Section */}
      <div className="horizon-card rounded-2xl p-8 mb-12">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          🌍 Global Manufacturing Partners
        </h2>
        
        <div className="grid md:grid-cols-4 gap-6">
          <div className="space-y-3">
            <h3 className="font-semibold text-cyan-400">North America</h3>
            <CountryFlag country="Canada" flag="🇨🇦" />
            <div className="text-xs text-gray-400">Magna International, Bombardier</div>
          </div>
          
          <div className="space-y-3">
            <h3 className="font-semibold text-cyan-400">Europe</h3>
            <CountryFlag country="Germany" flag="🇩🇪" />
            <CountryFlag country="United Kingdom" flag="🇬🇧" />
            <div className="text-xs text-gray-400">Bosch, Siemens, Rolls-Royce</div>
          </div>
          
          <div className="space-y-3">
            <h3 className="font-semibold text-cyan-400">Asia</h3>
            <CountryFlag country="China" flag="🇨🇳" />
            <CountryFlag country="Japan" flag="🇯🇵" />
            <CountryFlag country="South Korea" flag="🇰🇷" />
            <CountryFlag country="India" flag="🇮🇳" />
            <div className="text-xs text-gray-400">Foxconn, Toyota, Samsung, Tata</div>
          </div>
          
          <div className="space-y-3">
            <h3 className="font-semibold text-cyan-400">Oceania</h3>
            <CountryFlag country="Australia" flag="🇦🇺" />
            <div className="text-xs text-gray-400">BlueScope Steel</div>
          </div>
        </div>
      </div>

      {/* Features List */}
      <div className="horizon-card rounded-2xl p-8 mb-12">
        <h2 className="text-2xl font-bold text-white mb-6 text-center">
          What's Included in Manufacturer Connect
        </h2>
        
        <div className="grid md:grid-cols-2 gap-6">
          {upgradeInfo.features.map((feature, index) => (
            <div key={index} className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
              <span className="text-gray-300">{feature}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Value Proposition */}
      <div className="bg-gradient-to-r from-green-600/20 to-blue-600/20 backdrop-blur-sm border border-green-500/30 rounded-2xl p-8 text-center">
        <h2 className="text-2xl font-bold text-white mb-4">
          💰 ROI: Save Thousands on Your First Project
        </h2>
        <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
          One successful manufacturer connection can save you thousands in production costs and weeks in sourcing time. 
          The $100/month investment pays for itself with the first quote comparison.
        </p>
        
        <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">$5,000+</div>
            <div className="text-sm text-gray-400">Average savings per project</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">2-3 weeks</div>
            <div className="text-sm text-gray-400">Faster supplier sourcing</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-white">21+</div>
            <div className="text-sm text-gray-400">Verified global suppliers</div>
          </div>
        </div>
      </div>
    </div>
  );
}; 