import React, { useState, useEffect, Suspense } from 'react';
import { User, LogOut, ChevronDown, Crown } from 'lucide-react';
import LandingPage from './components/LandingPage';
const ProcessWizard = React.lazy(() => import('./components/ProcessWizard'));
const AuthModal = React.lazy(() => import('./components/AuthModal'));
const SubscriptionModal = React.lazy(() => import('./components/SubscriptionModal'));
const SuccessPage = React.lazy(() => import('./components/SuccessPage'));
const CancelPage = React.lazy(() => import('./components/CancelPage'));
import UsageIndicator from './components/UsageIndicator';
const ProtectedRoute = React.lazy(() => import('./components/ProtectedRoute'));
const SharedModelLoader = React.lazy(() => import('./components/SharedModelLoader'));

import { useAuth } from './hooks/useAuth';
import { getProductByTier } from './stripe-config';
import { supabase } from './lib/supabase';
import { webglDiagnostics } from './utils/webglDiagnostics';
import { sharedModelService, SharedModelData } from './services/sharedModelService';

function App() {
  // Check for pending navigation immediately to prevent flash
  const hasPendingNavigation = React.useMemo(() => {
    if (typeof window === 'undefined') return false;
    return !!(
      sessionStorage.getItem('agenticad_pending_step') ||
      sessionStorage.getItem('agenticad_pending_shared_model') ||
      new URL(window.location.href).searchParams.get('step')
    );
  }, []);

  const [currentView, setCurrentView] = useState<'landing' | 'wizard' | 'success' | 'cancel' | 'shared-model'>('landing');
  const [authModal, setAuthModal] = useState<{ isOpen: boolean; mode: 'signin' | 'signup' }>({
    isOpen: false,
    mode: 'signin'
  });
  const [subscriptionModal, setSubscriptionModal] = useState(false);
  const [authRequested, setAuthRequested] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [showUsageDropdown, setShowUsageDropdown] = useState(false);
  const [sessionRestoring, setSessionRestoring] = useState(false);
  const [checkingPendingNav, setCheckingPendingNav] = useState(hasPendingNavigation); // Prevent flash during navigation
  const [initialStep, setInitialStep] = useState<number | null>(null); // For deep linking to specific steps
  const [sharedModelId, setSharedModelId] = useState<string | null>(null);
  const [sharedModelData, setSharedModelData] = useState<SharedModelData | null>(null);

  const { user, profile, signOut, refreshProfile, forceRefreshProfile, ensureFreshAuth, initialized } = useAuth();

  // Simplified WebGL monitoring (no context creation)
  React.useEffect(() => {
    if (import.meta.env.DEV) {
      console.log('🔍 WebGL monitoring disabled to prevent context exhaustion');
    }
    // Disabled to prevent creating too many WebGL contexts
  }, []);

  // Disable console logs in production for security and cleanliness
  React.useEffect(() => {
    if (!import.meta.env.DEV) {
      // Override console methods in production
      console.log = () => {};
      console.debug = () => {};
      console.info = () => {};
      // Keep console.error and console.warn for critical production debugging
    }
  }, []);

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
      console.log('🔧 App: Development mode detected, auth bypass enabled');
      console.log('🔧 Details:', { hostname, port, isIPAddress, isLocalhost, isPrivateNetwork, isDevPort });
    }
    
    return isDevelopment;
  }, []);

  // Debug: Track user state changes to ensure UI updates
  useEffect(() => {
    console.log('🎯 App: User state changed:', user ? `✅ ${user.email}` : '❌ null');
  }, [user]);

  // Debug: Track profile state changes  
  useEffect(() => {
    console.log('👤 App: Profile state changed:', profile ? `✅ ${profile.email} (${profile.subscription_tier})` : '❌ null');
  }, [profile]);

  // Memoize callback to prevent re-renders
  const handleUpgradeClick = React.useCallback(() => {
    setSubscriptionModal(true);
    setShowUsageDropdown(false); // Close dropdown when upgrade is clicked
  }, []);

  // Navigation logic with session restoration for success/cancel pages and shared models
  useEffect(() => {
    if (isNavigating) return;

    const handleURLNavigation = async () => {
      const url = new URL(window.location.href);
      const isSuccessPage = url.searchParams.get('success') === 'true';
      const isCancelPage = url.searchParams.get('canceled') === 'true';
      const stepParam = url.searchParams.get('step');
      const purchaseStatus = url.searchParams.get('purchase');
      const sharedModelIdParam = url.searchParams.get('model') || url.searchParams.get('id');
      
      // Handle shared model URLs - preserve model ID through auth
      if (sharedModelIdParam) {
        console.log('🔗 Shared model detected in URL:', sharedModelIdParam);
        
        // Store the shared model ID for after authentication
        sessionStorage.setItem('agenticad_pending_shared_model', sharedModelIdParam);
        sessionStorage.setItem('agenticad_return_path', window.location.pathname + window.location.search);
        
        setSharedModelId(sharedModelIdParam);
        
        // If user is not authenticated in production, show auth modal first
        if (!isDevMode && !user && initialized) {
          console.log('🔐 Shared model requires authentication');
          setAuthModal({ isOpen: true, mode: 'signin' });
          setAuthRequested(true);
          return;
        }
        
        // If authenticated or in dev mode, load the shared model immediately
        if ((user && initialized) || isDevMode) {
          console.log('✅ Loading shared model:', sharedModelIdParam);
          setCurrentView('shared-model');
          return;
        }
      }
      
      // Handle old Stripe redirect format: /patent-search?purchase=success
      if (window.location.pathname === '/patent-search' && purchaseStatus) {
        console.log(`🔗 Old Stripe redirect detected: ${purchaseStatus}`);
        // Redirect to wizard with patent step
        setInitialStep(5); // Patent search is step 5
        
        if (user || isDevMode) {
          console.log('✅ User authenticated or dev mode, navigating to patent search step');
          setCurrentView('wizard');
        } else {
          console.log('⚠️ User not authenticated, showing auth modal first');
          setAuthRequested(true);
          setAuthModal({ isOpen: true, mode: 'signin' });
        }
        
        // Clean up URL - redirect to proper format
        const newUrl = `${window.location.origin}/?step=patent&purchase=${purchaseStatus}`;
        window.history.replaceState({}, '', newUrl);
        return;
      }
      
      // Handle step-based navigation (e.g., /app?step=patent&purchase=success)
      if (stepParam && !isSuccessPage && !isCancelPage) {
        console.log(`🔗 Deep link detected: step=${stepParam}, purchase=${purchaseStatus}`);

        // Map step names to indices
        const stepMap: Record<string, number> = {
          'input': 0,
          'model': 1,
          'ar': 2,
          'iterate': 3,
          'manufacture': 4,
          'patent': 5
        };

        const stepIndex = stepMap[stepParam];
        if (stepIndex !== undefined) {
          setInitialStep(stepIndex);

          // If user is authenticated OR in dev mode, go to wizard
          if (user || isDevMode) {
            console.log(`✅ Navigating to wizard step ${stepIndex} (${stepParam})`);
            setCurrentView('wizard');

            // Clear stored step since we're navigating now
            sessionStorage.removeItem('agenticad_pending_step');
          } else {
            console.log('⚠️ User not authenticated yet, storing step for post-auth navigation');

            // Store the step parameter for after OAuth completes
            sessionStorage.setItem('agenticad_pending_step', stepIndex.toString());
            sessionStorage.setItem('agenticad_auth_requested', 'true');
            setAuthRequested(true);
          }

          // Clean up URL parameters after handling
          url.searchParams.delete('step');
          if (purchaseStatus) {
            url.searchParams.delete('purchase');
          }
          window.history.replaceState({}, '', url.toString());
          return;
        }
      }
      
      // Handle shared model URLs (e.g., /model/abc-123-def)
      const modelMatch = window.location.pathname.match(/^\/model\/([a-f0-9-]+)$/);
      if (modelMatch && !isSuccessPage && !isCancelPage) {
        const modelId = modelMatch[1];
        console.log(`🔗 Shared model URL detected: ${modelId}`);
        
        setSharedModelId(modelId);
        setCurrentView('shared-model');
        return;
      }
      
      if (isSuccessPage || isCancelPage) {
        console.log(`🔄 Landing on ${isSuccessPage ? 'success' : 'cancel'} page, ensuring session is restored...`);
        
        // Set session restoring state
        setSessionRestoring(true);
        
        // Wait for auth to be initialized first
        if (!initialized) {
          console.log('⏳ Waiting for auth initialization...');
          const waitForInit = setInterval(() => {
            if (initialized) {
              clearInterval(waitForInit);
              handleURLNavigation(); // Recursively call once initialized
            }
          }, 100);
          return;
        }
        
        // Ensure we have a valid session before showing success/cancel page
        try {
          const { data: { session }, error } = await supabase.auth.getSession();
          
          if (error) {
            console.error('❌ Error restoring session on success/cancel page:', error);
          } else if (session?.user) {
            console.log('✅ Session restored for success/cancel page:', session.user.email);
            // Session is valid, proceed with navigation
            if (isSuccessPage) {
              setCurrentView('success');
            } else {
              setCurrentView('cancel');
            }
          } else {
            console.log('⚠️ No session found on success/cancel page, redirecting to landing');
            // No session, redirect to landing page but keep URL params for later processing
            setCurrentView('landing');
            
            // Show auth modal if on success page (user needs to sign in to see their upgrade)
            if (isSuccessPage) {
              setAuthModal({ isOpen: true, mode: 'signin' });
            }
          }
        } catch (error) {
          console.error('❌ Error checking session:', error);
          setCurrentView('landing');
        } finally {
          setSessionRestoring(false);
        }
      }
    };

    handleURLNavigation();
  }, [isNavigating, user, initialized]);

  // Handle post-authentication navigation (shared models and pending steps)
  useEffect(() => {
    if (user && initialized && !isDevMode) {
      const pendingSharedModel = sessionStorage.getItem('agenticad_pending_shared_model');
      const returnPath = sessionStorage.getItem('agenticad_return_path');
      const pendingStep = sessionStorage.getItem('agenticad_pending_step');
      const authWasRequested = sessionStorage.getItem('agenticad_auth_requested');

      // Priority 1: Restore shared model if pending
      if (pendingSharedModel) {
        console.log('🔄 Restoring shared model after authentication:', pendingSharedModel);

        // Clear the pending shared model to prevent loops
        sessionStorage.removeItem('agenticad_pending_shared_model');
        sessionStorage.removeItem('agenticad_return_path');

        // Set the shared model and view
        setSharedModelId(pendingSharedModel);
        setCurrentView('shared-model');
        setCheckingPendingNav(false); // Clear loading state

        // Update the URL to match
        if (returnPath) {
          window.history.replaceState({}, '', returnPath);
        }

        // Close any open auth modals
        setAuthModal({ isOpen: false, mode: 'signin' });
        setAuthRequested(false);

        return;
      }

      // Priority 2: Restore pending step after OAuth completes
      if (pendingStep && authWasRequested) {
        console.log('🔄 Restoring wizard step after authentication:', pendingStep);

        // Clear the pending step to prevent loops
        sessionStorage.removeItem('agenticad_pending_step');
        sessionStorage.removeItem('agenticad_auth_requested');

        // Navigate to wizard with the stored step
        const stepIndex = parseInt(pendingStep, 10);
        setInitialStep(stepIndex);
        setCurrentView('wizard');
        setAuthRequested(false);
        setCheckingPendingNav(false); // Clear loading state

        // Close any open auth modals
        setAuthModal({ isOpen: false, mode: 'signin' });

        return;
      }
    }

    // Clear checking state if no pending navigation found
    if (initialized && checkingPendingNav) {
      setCheckingPendingNav(false);
    }
  }, [user, initialized, isDevMode, checkingPendingNav]);

  // Handle successful authentication when user was on success page without session
  useEffect(() => {
    const url = new URL(window.location.href);
    const isSuccessPage = url.searchParams.get('success') === 'true';
    
    // If user just authenticated and we're on a success page, show it
    if (user && isSuccessPage && currentView === 'landing') {
      console.log('✅ User authenticated on success page, showing success view');
      setCurrentView('success');
      setAuthModal({ isOpen: false, mode: 'signin' });
    }
  }, [user, currentView]);

  // Handle OAuth callback (Google, Apple, Microsoft sign-in redirect)
  useEffect(() => {
    const handleOAuthCallback = async () => {
      const url = new URL(window.location.href);
      
      // Check for OAuth hash fragments or query parameters (all providers)
      const hasOAuthCallback = url.hash.includes('access_token') || 
                              url.hash.includes('id_token') ||
                              url.searchParams.get('code') ||
                              url.searchParams.get('state');
      
      if (hasOAuthCallback) {
        console.log('🔐 OAuth callback detected (Google/Apple/Microsoft), processing...');
        
        // Close any open auth modal since OAuth is completing
        setAuthModal({ isOpen: false, mode: 'signin' });
        
        // Enhanced session detection with longer retry period for all OAuth providers
        let sessionCheckAttempts = 0;
        const maxAttempts = 15; // Increased for slower providers
        
        const checkForSession = async (): Promise<boolean> => {
          try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
              console.log('✅ OAuth session established:', session.user.email, 'Provider:', session.user.app_metadata?.provider);
              return true;
            }
            return false;
          } catch (error) {
            console.error('Error checking session:', error);
            return false;
          }
        };
        
        const waitForSession = async () => {
          // First, wait a bit for Supabase to process the OAuth callback
          await new Promise(resolve => setTimeout(resolve, 1000));
          
          while (sessionCheckAttempts < maxAttempts) {
            sessionCheckAttempts++;
            console.log(`🔍 Checking for OAuth session (attempt ${sessionCheckAttempts}/${maxAttempts})...`);
            
            const hasSession = await checkForSession();
            if (hasSession) {
              // Session established successfully
              console.log('🎉 OAuth session confirmed, proceeding...');
              break;
            }
            
            // Progressive delay - start fast, then slow down
            const delay = sessionCheckAttempts < 5 ? 500 : 1000;
            await new Promise(resolve => setTimeout(resolve, delay));
          }
          
          // Clean up URL regardless of session status
          const cleanUrl = new URL(window.location.href);
          cleanUrl.hash = '';
          cleanUrl.searchParams.delete('code');
          cleanUrl.searchParams.delete('state');
          cleanUrl.searchParams.delete('session_state'); // For Microsoft
          window.history.replaceState({}, '', cleanUrl.toString());
          
          // If user was trying to access the wizard, navigate them there after OAuth completes
          if (authRequested) {
            console.log('🚀 OAuth completed, user requested wizard access, navigating...');
            setIsNavigating(true);
            setCurrentView('wizard');
            setAuthRequested(false);
          }
        };
        
        waitForSession();
      }
    };

    handleOAuthCallback();
  }, [authRequested]);

  // Simplified auth state change handler - only handle navigation logic
  useEffect(() => {
    if (authRequested && user) {
      console.log('✅ Auth request fulfilled, clearing request and closing modal');
      setAuthRequested(false);
      setAuthModal({ isOpen: false, mode: 'signin' });
    }
  }, [user, authRequested]);

  // Handle custom events for opening modals
  useEffect(() => {
    const handleOpenSubscriptionModal = () => {
      setSubscriptionModal(true);
    };

    window.addEventListener('openSubscriptionModal', handleOpenSubscriptionModal);
    return () => {
      window.removeEventListener('openSubscriptionModal', handleOpenSubscriptionModal);
    };
  }, []);

  const handleGetStarted = () => {
    if (!user && !isDevMode) {
      setAuthRequested(true);
      // Store intention to go to wizard step 0 after auth
      sessionStorage.setItem('agenticad_pending_step', '0');
      sessionStorage.setItem('agenticad_auth_requested', 'true');
      setAuthModal({ isOpen: true, mode: 'signup' });
    } else {
      setIsNavigating(true);
      setCurrentView('wizard');
    }
  };

  const handleSignIn = () => {
    setAuthRequested(true); // Set authRequested so user goes to wizard after signin
    // Store intention to go to wizard step 0 after auth
    sessionStorage.setItem('agenticad_pending_step', '0');
    sessionStorage.setItem('agenticad_auth_requested', 'true');
    setAuthModal({ isOpen: true, mode: 'signin' });
  };

  const handleSignUp = () => {
    setAuthRequested(true); // Set authRequested so user goes to wizard after signup
    // Store intention to go to wizard step 0 after auth
    sessionStorage.setItem('agenticad_pending_step', '0');
    sessionStorage.setItem('agenticad_auth_requested', 'true');
    setAuthModal({ isOpen: true, mode: 'signup' });
  };

  const handleAuthSuccess = async () => {
    console.log('✅ App: Auth success callback triggered');

    // Close modal immediately
    setAuthModal({ isOpen: false, mode: 'signin' });

    // Check for pending step in sessionStorage
    const pendingStep = sessionStorage.getItem('agenticad_pending_step');

    // Handle navigation if user requested auth
    if (authRequested || pendingStep) {
      console.log('🚀 App: User requested auth, navigating to wizard');

      // Set initial step if we have a pending step
      if (pendingStep) {
        const stepIndex = parseInt(pendingStep, 10);
        setInitialStep(stepIndex);
        console.log('📍 Setting initial step to:', stepIndex);

        // Clear the pending step
        sessionStorage.removeItem('agenticad_pending_step');
        sessionStorage.removeItem('agenticad_auth_requested');
      }

      setIsNavigating(true);
      setCurrentView('wizard');
      setAuthRequested(false);
    }
  };

  const handleAuthClose = () => {
    console.log('🚪 App: Closing auth modal via handleAuthClose');
    setAuthModal({ isOpen: false, mode: 'signin' });
    setAuthRequested(false);

    // Clear pending step if user cancels authentication
    sessionStorage.removeItem('agenticad_pending_step');
    sessionStorage.removeItem('agenticad_auth_requested');
  };

  // Handle shared model loading (wrapped in useCallback to prevent infinite loops)
  const handleSharedModelLoaded = React.useCallback((modelData) => {
    console.log('✅ Shared model loaded:', modelData);
    setSharedModelData(modelData);
    setCurrentView('wizard');
    
    // Restore the original step from shared model data, default to AR step (2) if not specified
    const originalStep = modelData.currentStep || 2;
    console.log('🔄 Restoring to original step:', originalStep);
    setInitialStep(originalStep);
    
    // Clear shared model state since it's now loaded into wizard
    setSharedModelId(null);
  }, []);

  const handleSharedModelError = React.useCallback((error) => {
    console.error('❌ Failed to load shared model:', error);
    setCurrentView('landing');
  }, []);

  const handleBackToLanding = () => {
    setIsNavigating(true);
      setCurrentView('landing');
      
    // Clear URL parameters
    const url = new URL(window.location.href);
    url.searchParams.delete('success');
    url.searchParams.delete('canceled');
    window.history.replaceState({}, '', url.toString());
  };

  const handleSignOut = async () => {
    if (isSigningOut) {
      console.log('⚠️ Sign out already in progress, ignoring...');
      return;
    }
    
    try {
      setIsSigningOut(true);
      setShowUsageDropdown(false); // Close dropdown immediately
      
      await signOut();
      
      // Ensure we navigate back to landing page
      setCurrentView('landing');
      setIsNavigating(false);
      
      // Clear any URL parameters
      const url = new URL(window.location.href);
      url.searchParams.delete('success');
      url.searchParams.delete('canceled');
      window.history.replaceState({}, '', url.toString());
      
    } catch (error) {
      console.error('❌ App: Error signing out:', error);
      // Even if sign out fails, clear local state
      setCurrentView('landing');
    }
    
    // Always clear the signing out state, regardless of success/failure
    setIsSigningOut(false);
  };

  const handleSubscriptionModalClose = async () => {
    setSubscriptionModal(false);
    console.log('🔄 SubscriptionModal closed, forcing profile refresh...');
    await forceRefreshProfile();
  };

  const getSubscriptionDisplayName = (tier: string, hasManufacturerAccess: boolean = false) => {
    const product = getProductByTier(tier);
    const tierName = product ? product.name.split(' ')[0] : 'Free';
    
    if (tier === 'free') {
      return 'Free';
    }
    
    // Show "Pro" or "Plus" if they have manufacturer access, otherwise "Pro without manufacturing"
    return hasManufacturerAccess ? tierName : `${tierName} without manufacturing`;
  };

  // Reset sign out state when user changes (fix stuck spinner)
  useEffect(() => {
    if (user) {
      setIsSigningOut(false); // Clear sign out state when user is present
    }
  }, [user]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('.user-profile-dropdown')) {
        setShowUsageDropdown(false);
      }
    };

    if (showUsageDropdown) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
  }
  }, [showUsageDropdown]);

  return (
    <div className="min-h-screen relative">
      {/* Cosmic Destiny Background */}
      <div className="absolute inset-0" style={{ background: 'var(--destiny-gradient)' }}></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(59,130,246,0.1),transparent_50%)] animate-pulse"></div>
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(147,51,234,0.1),transparent_50%)] animate-pulse" style={{ animationDelay: '2s' }}></div>
      {/* Development Mode Indicator */}
      {isDevMode && (
        <div className="fixed top-2 left-2 z-50 bg-orange-500/90 text-white px-3 py-1 rounded-lg text-xs font-medium">
          🔧 DEV MODE - Auth Bypassed
        </div>
      )}
      
      {/* Header with Auth - Only show on landing page */}
      {currentView === 'landing' && (
        <div className="fixed top-20 right-6 z-50 flex items-center gap-4">
          {user ? (
            <div 
              className="relative user-profile-dropdown"
              onMouseLeave={() => {
                // Delay closing to allow moving to dropdown
                setTimeout(() => {
                  const profileHover = document.querySelector('.user-profile-dropdown:hover');
                  if (!profileHover) {
                    setShowUsageDropdown(false);
                  }
                }, 200);
              }}
            >
              <div 
                className="flex items-center gap-3 bg-white/10 backdrop-blur-sm border border-white/20 rounded-xl px-4 py-2 cursor-pointer hover:bg-white/15 transition-all duration-300"
                                 onClick={(e) => {
                   e.stopPropagation();
                   setShowUsageDropdown(!showUsageDropdown);
                 }}
                 onMouseEnter={() => setShowUsageDropdown(true)}
              >
                <div className="flex items-center gap-2">
                  <User className="w-5 h-5 text-cyan-400" />
                  <span className="text-white text-sm max-w-32 truncate">{user?.email}</span>
                  {profile && profile.subscription_tier !== 'pro' && (
                    <span className="px-2 py-1 bg-cyan-500/20 text-cyan-400 text-xs rounded-full capitalize">
                      {getSubscriptionDisplayName(profile.subscription_tier, profile.manufacturer_access)}
                    </span>
                  )}
                  {!profile && (
                    <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">
                      Loading...
                    </span>
                  )}
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${showUsageDropdown ? 'rotate-180' : ''}`} />
                {profile?.subscription_tier === 'pro' ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSubscriptionModal(true);
                    }}
                    className="flex items-center gap-1 px-3 py-1 bg-gradient-to-r from-yellow-500/20 to-amber-500/20 border border-yellow-500/30 rounded-full hover:from-yellow-500/30 hover:to-amber-500/30 hover:border-yellow-500/40 transition-all duration-300"
                    title="Manage subscription"
                  >
                    <Crown className="w-3 h-3 text-yellow-400" />
                    <span className="text-xs text-yellow-400 font-medium">
                      {getSubscriptionDisplayName(profile.subscription_tier, profile.manufacturer_access)}
                    </span>
                  </button>
                ) : (
                <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSubscriptionModal(true);
                    }}
                  className="text-xs horizon-button-primary px-3 py-1 rounded-full"
                >
                  {profile ? 'Upgrade' : 'Loading...'}
                </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isSigningOut) {
                      handleSignOut();
                    }
                  }}
                  disabled={isSigningOut}
                  className={`text-gray-400 hover:text-white transition-colors p-1 rounded hover:bg-white/10 ${isSigningOut ? 'opacity-50 cursor-not-allowed' : ''}`}
                  title={isSigningOut ? "Signing out..." : "Sign Out"}
                >
                  <LogOut className={`w-5 h-5 ${isSigningOut ? 'animate-spin' : ''}`} />
                </button>
              </div>

              {/* Usage Dropdown */}
              {showUsageDropdown && (
                <div 
                  className="absolute top-full right-0 mt-2 w-80 z-[100]"
                  onMouseEnter={() => setShowUsageDropdown(true)}
                  onMouseLeave={() => setShowUsageDropdown(false)}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="transform transition-all duration-300 ease-out animate-in slide-in-from-top-2 fade-in">
                    <UsageIndicator onUpgradeClick={handleUpgradeClick} />
                    {/* Debug content - can be removed once everything works perfectly */}
                    {/* 
                    <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-xl p-4 mt-2">
                      <div className="text-white text-sm">
                        🔍 Debug: Dropdown is visible
                        <br />
                        showUsageDropdown: {showUsageDropdown.toString()}
                      </div>
                    </div>
                    */}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <button
                onClick={handleSignIn}
                className="text-white hover:text-cyan-400 transition-colors px-4 py-2 rounded-lg hover:bg-white/10"
              >
                Sign In
              </button>
              <button
                onClick={handleSignUp}
                className="horizon-button-primary px-6 py-2 font-semibold"
              >
                Get Started
              </button>
            </div>
          )}
        </div>
      )}

      {/* Main Content */}
      {sessionRestoring && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Restoring Session</h2>
            <p className="text-gray-300">Please wait while we restore your login session...</p>
          </div>
        </div>
      )}

      {checkingPendingNav && !sessionRestoring && (
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
            <div className="w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Loading</h2>
            <p className="text-gray-300">Taking you to your workspace...</p>
          </div>
        </div>
      )}

      {!sessionRestoring && !checkingPendingNav && currentView === 'landing' && (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
          <LandingPage onGetStarted={handleGetStarted} />
        </Suspense>
      )}

      {!sessionRestoring && currentView === 'wizard' && (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
          <ProtectedRoute onAuthRequired={() => setAuthModal({ isOpen: true, mode: 'signin' })}>
            <ProcessWizard onBack={handleBackToLanding} initialStep={initialStep || undefined} sharedModelData={sharedModelData} />
          </ProtectedRoute>
        </Suspense>
      )}

      {!sessionRestoring && currentView === 'success' && (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
          <SuccessPage 
            user={user}
            profile={profile}
            refreshProfile={refreshProfile}
            forceRefreshProfile={forceRefreshProfile}
          />
        </Suspense>
      )}

      {!sessionRestoring && currentView === 'shared-model' && sharedModelId && (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
          <SharedModelLoader
            modelId={sharedModelId}
            onModelLoaded={handleSharedModelLoaded}
            onError={handleSharedModelError}
          />
        </Suspense>
      )}

      {!sessionRestoring && currentView === 'cancel' && (
        <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-white">Loading…</div>}>
          <CancelPage />
        </Suspense>
      )}

      {/* Modals */}
      <Suspense fallback={null}>
        <AuthModal
          isOpen={authModal.isOpen}
          mode={authModal.mode}
          onClose={handleAuthClose}
          onSuccess={handleAuthSuccess}
          onModeChange={(mode) => setAuthModal(prev => ({ ...prev, mode }))}
        />
      </Suspense>

      <Suspense fallback={null}>
        <SubscriptionModal
          isOpen={subscriptionModal}
          onClose={handleSubscriptionModalClose}
          user={user}
          profile={profile}
          ensureFreshAuth={ensureFreshAuth}
        />
      </Suspense>



    </div>
  );
}

export default App;
