/**
 * Auto-Show QR Generator Wrapper
 * 
 * This wrapper automatically triggers QR code display when used in AR viewers
 * to solve the issue where users have to click "Generate QR Code" twice.
 */

import React, { useRef, useEffect } from 'react';
import SharedModelQRGenerator from './SharedModelQRGenerator';
import { SharedModelData } from '../services/sharedModelService';

interface AutoShowQRGeneratorProps {
  modelData: SharedModelData;
  className?: string;
  style?: React.CSSProperties;
  fallbackUrl?: string;
}

const AutoShowQRGenerator: React.FC<AutoShowQRGeneratorProps> = ({
  modelData,
  className,
  style,
  fallbackUrl
}) => {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  // Auto-click the generate button when component mounts
  useEffect(() => {
    const autoTrigger = () => {
      // Look for the Generate QR Code button and click it automatically
      const container = buttonRef.current?.closest('div');
      if (container) {
        const generateButton = container.querySelector('button') as HTMLButtonElement;
        if (generateButton && generateButton.textContent?.includes('Generate QR Code')) {
          console.log('🔄 Auto-triggering QR code generation for immediate display');
          generateButton.click();
        }
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(autoTrigger, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div ref={(el) => { if (el) buttonRef.current = el.querySelector('button'); }}>
      <SharedModelQRGenerator
        modelData={modelData}
        className={className}
        style={style}
        fallbackUrl={fallbackUrl}
      />
    </div>
  );
};

export default AutoShowQRGenerator;