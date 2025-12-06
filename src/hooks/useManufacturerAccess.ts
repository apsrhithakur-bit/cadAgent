import { useMemo } from 'react';
import { useAuth } from './useAuth';
import { SubscriptionTier, SUBSCRIPTION_FEATURES } from '../types/architectural';

export interface ManufacturerAccessResult {
  hasManufacturerAccess: boolean;
  subscriptionTier: SubscriptionTier;
  isLoading: boolean;
  canAccessManufacturers: () => boolean;
  requiresUpgrade: boolean;
  upgradeMessage: string;
}

export const useManufacturerAccess = (): ManufacturerAccessResult => {
  const { user, profile, loading } = useAuth();

  const result = useMemo(() => {
    // Default to free tier if no profile
    const tier: SubscriptionTier = profile?.subscription_tier || 'free';
    
    // Check if user has manufacturer access - now only from manufacturer_access boolean
    const hasAccess = Boolean(profile?.manufacturer_access);

    const requiresUpgrade = !hasAccess;
    
    let upgradeMessage = '';
    if (requiresUpgrade) {
      if (!user) {
        upgradeMessage = 'Please sign in to access manufacturer search';
      } else {
        upgradeMessage = 'Add Manufacturer Connect ($100/month) to access our global network of verified suppliers';
      }
    }

    return {
      hasManufacturerAccess: hasAccess,
      subscriptionTier: tier,
      isLoading: loading,
      requiresUpgrade,
      upgradeMessage,
      canAccessManufacturers: () => {
        if (loading) {
          throw new Error('LOADING');
        }
        if (!user) {
          throw new Error('AUTHENTICATION_REQUIRED');
        }
        if (!hasAccess) {
          throw new Error('MANUFACTURER_ACCESS_REQUIRED');
        }
        return true;
      }
    };
  }, [user, profile, loading]);

  return result;
};

// Helper function to check if a subscription tier includes manufacturer access
export const tierHasManufacturerAccess = (tier: SubscriptionTier): boolean => {
  // Manufacturer access is now a separate addon, not tier-based
  return false;
};

// Helper function to get upgrade path for manufacturer access
export const getManufacturerUpgradePath = (currentTier: SubscriptionTier): {
  price: number;
  features: string[];
} => {
  return {
    price: 100,
    features: [
      'Global manufacturer network (1000s of verified suppliers & manufacturers)',
      'Direct contact information (phone & email)',
      'Professional quote request system',
      'International manufacturer search',
      'Suppliers in Canada, Germany, China, Japan, UK, India, Korea, Australia',
      'Priority customer support',
      'Usage analytics dashboard'
    ]
  };
}; 