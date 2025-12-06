import React, { useEffect } from 'react';
import { Lightbulb, Zap, Eye, Users, Search, ArrowRight, Cpu, Wrench, Hand } from 'lucide-react';
import HorizonHeroSection from './ui/horizon-hero-section';
import CosmicGalaxyLogo from './ui/CosmicGalaxyLogo';

interface LandingPageProps {
  onGetStarted: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted }) => {
  const features = [
    {
      icon: <Lightbulb className="w-8 h-8" />,
      title: "Natural Input",
      description: "Describe your idea using text, voice, sketches, or photos"
    },
    {
      icon: <Cpu className="w-8 h-8" />,
      title: "Instant CAD Generation",
      description: "AI creates professional 3D models in seconds, not hours"
    },
    {
      icon: <Hand className="w-8 h-8" />,
      title: "AR Preview",
      description: "See your design in the real world before manufacturing"
    },
    {
      icon: <Wrench className="w-8 h-8" />,
      title: "Smart Refinement",
      description: "Chat with AI to perfect dimensions, materials, and features"
    },
    {
      icon: <Users className="w-8 h-8" />,
      title: "Manufacturing Ready",
      description: "Export to STL, OBJ, or connect with production partners"
    },
    {
      icon: <Search className="w-8 h-8" />,
      title: "Patent Check",
      description: "Automated IP research ensures your design is unique"
    }
  ];

  // Handle scroll-triggered transitions for AGENTICAD branding
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const maxScroll = documentHeight - windowHeight;
      const progress = Math.min(scrollY / maxScroll, 1);
      
      // AGENTICAD transition appears after CREATION section (around the end of the hero)
      // Hero takes up 250vh, content starts after that at marginTop: 250vh
      const heroHeight = window.innerHeight * 2.5; // 250vh
      const contentStartY = heroHeight; // Content section starts at 250vh
      
      let transitionOpacity = 0;
      let transitionY = 50;
      
      // Calculate when we're in the transition zone
      const transitionStart = heroHeight * 0.95; // Start showing much later - at 95% of hero height
      const transitionPeak = contentStartY; // Fully visible when content section starts (250vh)
      
      // Find when "The Complete Creation Ecosystem" section appears at bottom of screen
      // Need to calculate the actual position of the features header text
      // Content starts at 250vh, features section has py-32 padding (128px), then text-center mb-20 (~80px), then the h2 title
      const featuresHeaderTextY = contentStartY + 128 + 80 + 50; // More precise position of the actual header text
      const transitionEnd = featuresHeaderTextY + windowHeight * 2; // Hide much later - when header is well past bottom
      
      if (scrollY >= transitionStart && scrollY <= transitionEnd) {
        if (scrollY <= transitionPeak) {
          // Fade in phase
          const fadeInProgress = (scrollY - transitionStart) / (transitionPeak - transitionStart);
          transitionOpacity = Math.min(1, fadeInProgress);
          transitionY = 50 - (fadeInProgress * 50);
        } else if (scrollY <= contentStartY) {
          // Stay visible phase (peak visibility)
          transitionOpacity = 1;
          transitionY = 0;
        } else {
          // Fade out phase - once content sections are reached
          const fadeOutProgress = (scrollY - contentStartY) / (transitionEnd - contentStartY);
          transitionOpacity = Math.max(0, 1 - fadeOutProgress);
          transitionY = -(fadeOutProgress * 30);
        }
      }
      
      // Apply CSS custom properties
      document.documentElement.style.setProperty('--transition-opacity', transitionOpacity.toString());
      document.documentElement.style.setProperty('--transition-y', `${transitionY}px`);
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll(); // Initial call
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-horizon-dark text-horizon-light">
      {/* Cosmic Galaxy Logo - Animated journey from space to corner */}
      <CosmicGalaxyLogo onClick={() => window.location.reload()} />

      {/* Hero Section */}
      <HorizonHeroSection onGetStarted={onGetStarted} />
      

      {/* Transition section - AGENTICAD branding */}
      <div className="fixed inset-0 flex items-center justify-center z-20 pointer-events-none"
           style={{
             opacity: 'var(--transition-opacity, 0)',
             transform: 'translateY(var(--transition-y, 50px))',
             transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
           }}>
        <button
          onClick={onGetStarted}
          className="text-center pointer-events-auto bg-transparent border-none cursor-pointer p-0 transition-all duration-300 hover:scale-105 hover:brightness-125"
        >
          <h1 className="hero-title font-black mb-6 cosmic-text-shadow">
            {'AGENTICAD'.split('').map((char, i) => (
              <span key={i} className="title-char inline-block" style={{ animationDelay: `${i * 0.1}s` }}>
                {char}
              </span>
            ))}
          </h1>
          <div className="hero-subtitle cosmic-text-shadow">
            <p className="subtitle-line mb-2">
              AI-Powered CAD Design Platform
            </p>
            <p className="subtitle-line">
              Transform ideas into manufacturing-ready models
            </p>
          </div>
        </button>
      </div>

      {/* Content section - positioned after hero */}
      <div className="relative z-10" style={{ marginTop: '250vh' }}>
        {/* Features Section */}
        <section className="px-6 py-32">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-20">
              <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 cosmic-text-shadow">
                Everything You Need to
                <span className="horizon-gradient-text cosmic-glow-text"> Design & Build</span>
              </h2>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto cosmic-text-shadow">
                Professional CAD design made simple. From idea to manufactured product in hours, not weeks.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className="horizon-card p-8 hover:shadow-glow transition-all duration-300 group"
                >
                  <div className="text-horizon-accent mb-6 group-hover:text-horizon-glow transition-colors">
                    {feature.icon}
                  </div>
                  <h3 className="text-xl font-display font-semibold text-white mb-3 cosmic-text-shadow">
                    {feature.title}
                  </h3>
                  <p className="text-gray-300 leading-relaxed cosmic-text-shadow">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Process Section */}
        <section className="px-6 py-20">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 cosmic-text-shadow">
                How It
                <span className="horizon-gradient-text cosmic-glow-text"> Works</span>
              </h2>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto cosmic-text-shadow">
                Six simple steps to turn your idea into a real product
              </p>
            </div>

            <div className="space-y-8">
              {[
                { step: 1, title: "Describe Your Idea", desc: "Tell us what you want to build using any input method" },
                { step: 2, title: "AI Creates CAD", desc: "Get professional 3D models generated in seconds" },
                { step: 3, title: "Preview in AR", desc: "See your design in real-world scale on your device" },
                { step: 4, title: "Refine Design", desc: "Chat with AI to adjust dimensions and features" },
                { step: 5, title: "Export or Manufacture", desc: "Download files or connect with production partners" },
                { step: 6, title: "Patent Research", desc: "Verify your design is unique and protectable" }
              ].map((item, index) => (
                <div key={index} className="horizon-card p-8 flex items-center gap-8 hover:shadow-glow transition-all duration-300 group">
                  <div className="flex-shrink-0 w-16 h-16 rounded-2xl bg-gradient-to-br from-horizon-accent to-horizon-glow flex items-center justify-center text-white font-display font-bold text-xl">
                    {item.step}
                  </div>
                  <div>
                    <h3 className="text-xl font-display font-semibold text-white mb-2 group-hover:horizon-gradient-text transition-all cosmic-text-shadow">
                      {item.title}
                    </h3>
                    <p className="text-gray-300 cosmic-text-shadow">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="px-6 py-20">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl md:text-5xl font-display font-bold text-white mb-6 cosmic-text-shadow">
              Start Creating
              <span className="horizon-gradient-text cosmic-glow-text"> Today</span>
            </h2>
            <p className="text-xl text-gray-300 mb-12 max-w-2xl mx-auto cosmic-text-shadow">
              No CAD experience needed. Turn your ideas into professional designs in minutes.
            </p>

            <div className="flex justify-center items-center">
              <button
                onClick={onGetStarted}
                className="horizon-button-primary px-12 py-4 text-lg"
              >
                Start Free
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default LandingPage;