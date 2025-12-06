import React, { useEffect, useRef, useState } from 'react';

interface CosmicGalaxyLogoProps {
  onClick: () => void;
}

const CosmicGalaxyLogo: React.FC<CosmicGalaxyLogoProps> = ({ onClick }) => {
  const [scrollProgress, setScrollProgress] = useState(0);
  const [logoOpacity, setLogoOpacity] = useState(0);
  const [logoTransform, setLogoTransform] = useState({
    x: window.innerWidth / 2 - 40, // Start at center
    y: window.innerHeight / 2 - 40,
    scale: 0.3,
    rotation: 0
  });

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const progress = Math.min(scrollY / (windowHeight * 0.5), 1); // Complete transition in half viewport
      
      setScrollProgress(progress);
      
      // Calculate logo position and transformation based on scroll
      if (progress < 0.1) {
        // Initial state - hidden
        setLogoOpacity(0);
        setLogoTransform({
          x: window.innerWidth / 2 - 40,
          y: window.innerHeight / 2 - 40,
          scale: 0.3,
          rotation: 0
        });
      } else if (progress < 0.8) {
        // Emerging and moving phase
        const adjustedProgress = (progress - 0.1) / 0.7;
        const opacity = adjustedProgress;
        
        // Spiral path from center to top-left
        const startX = window.innerWidth / 2 - 40;
        const startY = window.innerHeight / 2 - 40;
        const endX = 24; // Final position (left-6 = 24px)
        const endY = 24; // Final position (top-6 = 24px)
        
        // Create spiral movement
        const spiralRadius = (1 - adjustedProgress) * 200;
        const spiralAngle = adjustedProgress * Math.PI * 3;
        
        const baseX = startX + (endX - startX) * adjustedProgress;
        const baseY = startY + (endY - startY) * adjustedProgress;
        
        const x = baseX + Math.cos(spiralAngle) * spiralRadius * (1 - adjustedProgress);
        const y = baseY + Math.sin(spiralAngle) * spiralRadius * (1 - adjustedProgress);
        
        setLogoOpacity(opacity);
        setLogoTransform({
          x,
          y,
          scale: 0.3 + (0.7 * adjustedProgress), // Scale from 0.3 to 1
          rotation: adjustedProgress * 720 // Two full rotations during journey
        });
      } else {
        // Final state - locked in position
        setLogoOpacity(1);
        setLogoTransform({
          x: 24,
          y: 24,
          scale: 1,
          rotation: 720
        });
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial call
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      {/* Cosmic trail effect */}
      {scrollProgress > 0.1 && scrollProgress < 0.8 && (
        <div 
          className="fixed pointer-events-none"
          style={{
            left: `${logoTransform.x + 40}px`,
            top: `${logoTransform.y + 40}px`,
            width: '2px',
            height: '2px',
            opacity: logoOpacity * 0.5,
            zIndex: 3
          }}
        >
          {/* Trail particles */}
          {[...Array(5)].map((_, i) => (
            <div
              key={i}
              className="absolute"
              style={{
                left: `${-i * 10}px`,
                top: `${-i * 10}px`,
                width: `${(5 - i) * 2}px`,
                height: `${(5 - i) * 2}px`,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(96, 165, 250, ${0.5 - i * 0.1}) 0%, transparent 70%)`,
                animation: `pulse ${1 + i * 0.2}s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`
              }}
            />
          ))}
        </div>
      )}
      
      {/* Main logo */}
      <button
        onClick={onClick}
        className="fixed group"
        style={{
          left: `${logoTransform.x}px`,
          top: `${logoTransform.y}px`,
          transform: `scale(${logoTransform.scale}) rotate(${logoTransform.rotation}deg)`,
          opacity: logoOpacity,
          transition: scrollProgress > 0.8 ? 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
          zIndex: 5,
          transformOrigin: 'center center'
        }}
      >
        {/* Glowing aura during journey */}
        {scrollProgress > 0.1 && scrollProgress < 0.8 && (
          <div 
            className="absolute inset-0 rounded-full"
            style={{
              width: '80px',
              height: '80px',
              background: `radial-gradient(circle, 
                rgba(96, 165, 250, ${0.3 * (1 - scrollProgress)}) 0%, 
                rgba(59, 130, 246, ${0.2 * (1 - scrollProgress)}) 30%, 
                transparent 70%)`,
              filter: 'blur(10px)',
              animation: 'pulse 2s ease-in-out infinite'
            }}
          />
        )}
        
        {/* Logo image */}
        <img
          src="/agenticad-logo.png"
          alt="AgentiCAD Logo"
          className="relative w-20 h-20 object-cover rounded-full"
          style={{
            filter: scrollProgress < 0.8 
              ? `brightness(${1 + (1 - scrollProgress) * 0.5}) contrast(${1 + (1 - scrollProgress) * 0.3})` 
              : 'brightness(1)',
            boxShadow: scrollProgress < 0.8
              ? `0 0 ${40 * (1 - scrollProgress)}px rgba(96, 165, 250, 0.6)`
              : 'none'
          }}
        />
        
      </button>
    </>
  );
};

export default CosmicGalaxyLogo;