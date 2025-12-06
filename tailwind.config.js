/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Refined minimal cosmic palette
        horizon: {
          dark: '#000000',        // Pure black
          void: '#0a0a0f',        // Near black with blue hint
          midnight: '#0f0f1a',    // Deep midnight blue
          dusk: '#1a1a2e',        // Dark blue-gray
          twilight: '#16213e',    // Twilight blue
          nebula: '#0f3460',      // Deep nebula blue
          accent: '#3b82f6',      // Clean blue accent
          glow: '#60a5fa',        // Soft blue glow
          light: '#e0e7ff',       // Light blue-white
        },
        // Glass morphism colors
        glass: {
          white: 'rgba(255, 255, 255, 0.05)',
          light: 'rgba(255, 255, 255, 0.02)',
          dark: 'rgba(0, 0, 0, 0.5)',
          border: 'rgba(255, 255, 255, 0.08)',
        },
      },
      backgroundImage: {
        // Subtle gradients
        'horizon-gradient': 'linear-gradient(180deg, #000000 0%, #0a0a0f 50%, #1a1a2e 100%)',
        'nebula-gradient': 'radial-gradient(ellipse at center, rgba(59, 130, 246, 0.1) 0%, transparent 70%)',
        'glow-gradient': 'radial-gradient(circle at center, rgba(96, 165, 250, 0.15) 0%, transparent 50%)',
      },
      animation: {
        // Subtle animations
        'float': 'float 20s ease-in-out infinite',
        'glow': 'glow 4s ease-in-out infinite',
        'fade-in': 'fade-in 1s ease-out',
        'slide-up': 'slide-up 0.8s ease-out',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glow: {
          '0%, 100%': { opacity: '0.5' },
          '50%': { opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'slide-up': {
          '0%': { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
      },
      boxShadow: {
        'glow': '0 0 40px rgba(96, 165, 250, 0.1)',
        'glass': '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
      },
      fontFamily: {
        'display': ['Inter', 'system-ui', 'sans-serif'],
        'body': ['Inter', 'system-ui', 'sans-serif'],
      },
      backdropBlur: {
        'xs': '2px',
        '4xl': '80px',
      },
    },
  },
  plugins: [],
};
