import React from 'react';
import { AlertCircle, Crown, Lock, Zap, Star, ArrowRight, X } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

interface UpgradePromptProps {
  type: 'designs' | 'chats' | 'patents' | 'manufacturers' | 'modal';
  onClose: () => void;
  onUpgrade: () => void;
  usageData?: {
    used: number;
    limit: number;
  };
  isModal?: boolean;
}

export const UpgradePrompt: React.FC<UpgradePromptProps> = ({
  type,
  onClose,
  onUpgrade,
  usageData,
  isModal = false
}) => {
  const { profile } = useAuth();
  const currentTier = profile?.subscription_tier || 'free';

  const getPromptContent = () => {
    switch (type) {
      case 'designs':
        return {
          title: 'Design Limit Reached',
          description: 'You\'ve reached your monthly design limit. Upgrade your plan to create more designs and unlock additional features.',
          icon: <AlertCircle className="w-10 h-10 text-white" />,
          bgColor: 'from-yellow-400 to-orange-400',
          feature: 'design generations'
        };
      case 'chats':
        return {
          title: 'Refine Chat Limit Reached',
          description: 'You\'ve reached your monthly limit for design refinement chats. Upgrade your plan to continue refining your design.',
          icon: <AlertCircle className="w-10 h-10 text-white" />,
          bgColor: 'from-yellow-400 to-orange-400',
          feature: 'refinement chats'
        };
      case 'patents':
        return {
          title: 'Patent Search Limit Reached',
          description: 'You\'ve reached your patent search limit for this month. Upgrade to continue searching patents and analyzing your IP risk.',
          icon: <Crown className="w-10 h-10 text-white" />,
          bgColor: 'from-purple-400 to-pink-400',
          feature: 'patent searches'
        };
      case 'manufacturers':
        return {
          title: 'Manufacturer Search Limit Reached',
          description: 'You\'ve reached your manufacturer search limit. Upgrade to continue finding suppliers and manufacturers for your products.',
          icon: <Lock className="w-10 h-10 text-white" />,
          bgColor: 'from-blue-400 to-cyan-400',
          feature: 'manufacturer searches'
        };
      default:
        return {
          title: 'Upgrade Required',
          description: 'You\'ve reached your usage limit. Upgrade your plan to continue using this feature.',
          icon: <Star className="w-10 h-10 text-white" />,
          bgColor: 'from-cyan-400 to-purple-400',
          feature: 'features'
        };
    }
  };

  const getUpgradeOptions = () => {
    const isFreeTier = currentTier === 'free';
    const isPlusTier = currentTier === 'plus';
    const isProTier = currentTier === 'pro';

    if (isFreeTier) {
      return {
        recommended: 'Plus',
        options: [
          { name: 'Plus', price: '$29/month', features: ['10 designs', '100 chats', '5 patents', '10 manufacturers'] },
          { name: 'Pro', price: '$99/month', features: ['100 designs', '1000 chats', '20 patents', '10 manufacturers'] }
        ]
      };
    } else if (isPlusTier) {
      return {
        recommended: 'Pro',
        options: [
          { name: 'Pro', price: '$99/month', features: ['100 designs', '1000 chats', '20 patents', '10 manufacturers'] }
        ]
      };
    } else {
      return {
        recommended: 'Pro',
        options: [
          { name: 'Pro', price: '$99/month', features: ['Already at highest tier'] }
        ]
      };
    }
  };

  const content = getPromptContent();
  const upgradeOptions = getUpgradeOptions();

  const PromptContent = () => (
    <div className="text-center">
      <div className={`w-20 h-20 mx-auto mb-6 rounded-full bg-gradient-to-r ${content.bgColor} flex items-center justify-center`}>
        {content.icon}
      </div>
      <h3 className="text-2xl font-bold text-white mb-4">{content.title}</h3>
      <p className="text-gray-300 text-lg mb-6 leading-relaxed max-w-2xl mx-auto">
        {content.description}
      </p>
      
      {usageData && (
        <div className="bg-white/10 rounded-lg p-4 mb-6 inline-block">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Current Plan:</span>
              <span className="text-white font-medium capitalize">{currentTier}</span>
            </div>
            <div className="text-gray-400">•</div>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Used:</span>
              <span className="text-white font-medium">{usageData.used}/{usageData.limit}</span>
            </div>
          </div>
        </div>
      )}

      <div className="mb-8">
        <h4 className="text-lg font-semibold text-white mb-4">Upgrade Options</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {upgradeOptions.options.map((option, index) => (
            <div key={index} className={`bg-white/5 border rounded-lg p-4 ${
              option.name === upgradeOptions.recommended ? 'border-cyan-400 bg-cyan-500/10' : 'border-white/10'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-semibold text-white">{option.name}</h5>
                {option.name === upgradeOptions.recommended && (
                  <span className="text-xs bg-cyan-500 text-white px-2 py-1 rounded-full">Recommended</span>
                )}
              </div>
              <p className="text-cyan-400 font-bold mb-2">{option.price}</p>
              <ul className="text-sm text-gray-300 space-y-1">
                {option.features.map((feature, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-cyan-400 rounded-full"></div>
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 justify-center">
        <button
          onClick={onClose}
          className="px-6 py-3 border border-white/20 text-white rounded-lg hover:bg-white/10 transition-colors"
        >
          {isModal ? 'Cancel' : 'Go Back'}
        </button>
        <button
          onClick={onUpgrade}
          className="px-8 py-3 horizon-button-primary text-white font-semibold rounded-lg transition-all duration-300 flex items-center gap-2"
        >
          <Zap className="w-5 h-5" />
          Upgrade Plan
          <ArrowRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-gray-900 border border-white/10 rounded-2xl p-8 max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <PromptContent />
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
        <PromptContent />
      </div>
    </div>
  );
};

export default UpgradePrompt; 