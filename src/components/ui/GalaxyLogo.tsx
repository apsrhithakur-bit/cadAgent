import React, { useEffect, useRef } from 'react';

interface GalaxyLogoProps {
  onClick: () => void;
}

const GalaxyLogo: React.FC<GalaxyLogoProps> = ({ onClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const particlesRef = useRef<Array<{
    x: number;
    y: number;
    angle: number;
    radius: number;
    speed: number;
    size: number;
    opacity: number;
    color: string;
    life: number;
    maxLife: number;
  }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const centerX = 50;
    const centerY = 50;
    const maxRadius = 45;

    // Initialize particles
    const initParticles = () => {
      const particles = [];
      for (let i = 0; i < 60; i++) {
        const angle = Math.random() * Math.PI * 2;
        const radius = Math.random() * maxRadius + 5;
        particles.push({
          x: centerX + Math.cos(angle) * radius,
          y: centerY + Math.sin(angle) * radius,
          angle: angle,
          radius: radius,
          speed: 0.02 + Math.random() * 0.03,
          size: Math.random() * 2 + 0.5,
          opacity: Math.random() * 0.8 + 0.2,
          color: ['#60a5fa', '#3b82f6', '#e0e7ff', '#ffffff'][Math.floor(Math.random() * 4)],
          life: 0,
          maxLife: 200 + Math.random() * 200
        });
      }
      particlesRef.current = particles;
    };

    const updateParticles = () => {
      particlesRef.current.forEach((particle, index) => {
        // Spiral inward
        particle.angle += particle.speed;
        particle.radius *= 0.995; // Gradual inward spiral
        
        // Convert to cartesian coordinates
        particle.x = centerX + Math.cos(particle.angle) * particle.radius;
        particle.y = centerY + Math.sin(particle.angle) * particle.radius;
        
        // Age the particle
        particle.life++;
        
        // Fade as it approaches center
        const distanceToCenter = Math.sqrt(
          (particle.x - centerX) ** 2 + (particle.y - centerY) ** 2
        );
        particle.opacity = Math.min(0.8, distanceToCenter / 20);
        
        // Remove and respawn particle when it reaches center or dies
        if (particle.radius < 3 || particle.life > particle.maxLife) {
          // Respawn at outer edge
          const newAngle = Math.random() * Math.PI * 2;
          const newRadius = maxRadius + Math.random() * 10;
          particle.angle = newAngle;
          particle.radius = newRadius;
          particle.x = centerX + Math.cos(newAngle) * newRadius;
          particle.y = centerY + Math.sin(newAngle) * newRadius;
          particle.speed = 0.02 + Math.random() * 0.03;
          particle.size = Math.random() * 2 + 0.5;
          particle.opacity = Math.random() * 0.8 + 0.2;
          particle.color = ['#60a5fa', '#3b82f6', '#e0e7ff', '#ffffff'][Math.floor(Math.random() * 4)];
          particle.life = 0;
          particle.maxLife = 200 + Math.random() * 200;
        }
      });
    };

    const drawParticles = () => {
      ctx.clearRect(0, 0, 100, 100);
      
      // Draw spiral arms
      ctx.strokeStyle = 'rgba(96, 165, 250, 0.1)';
      ctx.lineWidth = 1;
      for (let arm = 0; arm < 3; arm++) {
        ctx.beginPath();
        for (let r = 5; r < maxRadius; r += 2) {
          const angle = (r * 0.3) + (arm * (Math.PI * 2 / 3)) + (Date.now() * 0.001);
          const x = centerX + Math.cos(angle) * r;
          const y = centerY + Math.sin(angle) * r;
          if (r === 5) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();
      }

      // Draw particles
      particlesRef.current.forEach(particle => {
        ctx.save();
        ctx.globalAlpha = particle.opacity;
        
        // Draw particle with glow effect
        ctx.shadowColor = particle.color;
        ctx.shadowBlur = 4;
        ctx.fillStyle = particle.color;
        
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Add inner bright core
        ctx.shadowBlur = 0;
        ctx.globalAlpha = particle.opacity * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(particle.x, particle.y, particle.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
        
        ctx.restore();
      });

      // Draw center accretion disk glow
      const pulseIntensity = 0.3 + 0.2 * Math.sin(Date.now() * 0.005);
      ctx.save();
      ctx.globalAlpha = pulseIntensity;
      ctx.shadowColor = '#60a5fa';
      ctx.shadowBlur = 15;
      ctx.fillStyle = 'rgba(96, 165, 250, 0.2)';
      ctx.beginPath();
      ctx.arc(centerX, centerY, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const animate = () => {
      updateParticles();
      drawParticles();
      animationRef.current = requestAnimationFrame(animate);
    };

    // Initialize and start animation
    canvas.width = 100;
    canvas.height = 100;
    initParticles();
    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, []);

  return (
    <button
      onClick={onClick}
      className="group relative transition-all duration-500 hover:scale-110"
    >
      {/* Animated spiral halo canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-20 h-20 pointer-events-none opacity-70 group-hover:opacity-100 transition-opacity duration-300"
        style={{ filter: 'blur(0.5px)' }}
      />
      
      {/* Main logo - minimal effects for dark space integration */}
      <img
        src="/agenticad-logo.png"
        alt="AgentiCAD Logo"
        className="relative w-20 h-20 object-cover rounded-full transition-all duration-500 group-hover:brightness-110 z-10"
        style={{
          filter: 'drop-shadow(0 0 8px rgba(96, 165, 250, 0.2))',
        }}
      />
    </button>
  );
};

export default GalaxyLogo;