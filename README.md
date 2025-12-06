# 🎨 AgentiCAD

**Professional AI-Powered CAD Design Platform**

> **⚠️ CONFIDENTIAL AND PROPRIETARY SOFTWARE**
> **© 2024-2025 AgentiCAD. All Rights Reserved.**
> This software contains valuable trade secrets and confidential information.
> Unauthorized access, use, copying, or distribution is strictly prohibited.
> See [LICENSE.md](LICENSE.md) for complete terms and conditions.

Transform your ideas into professional 3D CAD models using advanced AI and multimodal input processing. AgentiCAD combines the power of modern AI with professional CAD design tools to make 3D modeling accessible to everyone.

> **🔐 Security Notice**: This application requires API keys and environment variables. See `.env.production.template` for configuration details. Never commit `.env` files to version control.

![AgentiCAD Banner](public/agenticad-long-logo.png)

## ✨ Features

### 🤖 **AI-Powered CAD Generation**
- **Text-to-CAD**: Describe your idea and get professional 3D models
- **Voice Input**: Speak your design concepts naturally
- **Sketch-to-CAD**: Upload sketches and convert them to 3D models
- **Image-to-CAD**: Transform photos into CAD designs

### 🛠️ **Professional Tools**
- **Real-time 3D Viewer**: Interactive 360° model visualization
- **Multi-format Export**: STL, OBJ, PLY, GLTF support
- **Component Analysis**: AI-powered material and specification detection
- **Editable Specifications**: Modify materials, dimensions, and properties

### 🔧 **Advanced Capabilities**
- **AR Visualization**: View models in augmented reality
- **Manufacturing Integration**: Cost estimation and material optimization
- **Subscription Management**: Tiered access with Stripe integration
- **Component Detection**: Automatic identification of separate parts

### 🎯 **User Experience**
- **Multimodal Input**: Text, voice, sketches, and photos
- **Progress Tracking**: Real-time generation status
- **Professional UI**: Modern, responsive design
- **Cross-platform**: Works on desktop and mobile

## 🚀 Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/yourusername/agenticad.git
cd agenticad
```

2. **Run initial setup**
```bash
npm run setup
# This will:
# - Install dependencies
# - Generate SSL certificates for local HTTPS
# - Provide environment setup instructions
```

3. **Configure environment variables**
```bash
cp .env.development.example .env.development
cp .env.example .env
# Edit both files with your API keys
# See .env.development.example for detailed instructions on obtaining keys
```

4. **Start development server**
```bash
npm run dev
# Server runs at https://localhost:5173 (HTTPS for AR features)
```

5. **Accept SSL certificate**
   - Browser will show security warning (expected for self-signed cert)
   - Click "Advanced" → "Proceed to localhost"
   - This enables camera access for AR features

## 📚 Documentation

- **[Setup Guide](SETUP.md)** - Complete installation and configuration
- **[API Documentation](README_API_SETUP.md)** - Backend API reference
- **[Architecture Guide](ARCHITECTURAL_SYSTEM_GUIDE.md)** - System design overview

## 🏗️ Tech Stack

### Frontend
- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** for styling
- **Three.js** for 3D visualization
- **React Query** for state management

### Backend
- **Supabase** (PostgreSQL + Auth + Edge Functions)
- **Stripe** for payment processing
- **Deno** for serverless functions

### AI Services
- **Zoo.dev** for CAD generation
- **Pica AI** for multimodal processing
- **Gemini Flash** for component analysis

### 3D & Graphics
- **WebGL** + **Three.js** for rendering
- **WebXR** for AR capabilities
- **GLB/GLTF** for 3D model format

## 🛡️ Security & Privacy

- ✅ **Environment-based configuration** - No hardcoded secrets
- ✅ **Secure authentication** - Supabase Auth with JWT
- ✅ **Payment security** - PCI-compliant Stripe integration
- ✅ **API key protection** - Proper environment variable usage
- ✅ **CORS protection** - Configured for production security

## 🔄 Development Workflow

### Branch Strategy
```bash
main          # Production-ready code
develop       # Integration branch
feature/*     # Feature development
hotfix/*      # Critical fixes
```

### Code Standards
- **TypeScript** for type safety
- **ESLint** + **Prettier** for code formatting
- **Conventional Commits** for commit messages
- **Component-based architecture**

### Testing
```bash
npm run test        # Run tests
npm run test:watch  # Watch mode
npm run test:ci     # CI mode
```

## 🚀 Deployment

### Environment Setup
1. Configure environment variables in your hosting platform
2. Set up Supabase project and deploy Edge Functions
3. Configure Stripe webhooks
4. Deploy frontend to your preferred platform

### Supported Platforms
- **Vercel** (recommended for frontend)
- **Netlify**
- **AWS Amplify**
- **Docker** (containerized deployment)

## 🤝 Contributing

We welcome contributions! Please follow these steps:

1. **Fork the repository**
2. **Create feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes** with proper TypeScript types
4. **Add tests** for new functionality
5. **Commit changes**: `git commit -m 'feat: add amazing feature'`
6. **Push to branch**: `git push origin feature/amazing-feature`
7. **Open Pull Request**

### Contribution Guidelines
- Follow existing code style and patterns
- Add tests for new features
- Update documentation as needed
- Use conventional commit messages
- Ensure TypeScript compliance

## 📊 Project Stats

- **Language**: TypeScript/JavaScript
- **Framework**: React + Vite
- **Database**: PostgreSQL (Supabase)
- **Authentication**: Supabase Auth
- **Payments**: Stripe
- **3D Rendering**: Three.js + WebGL
- **AI Services**: Multiple providers

## 🐛 Issue Reporting

Found a bug? Please create an issue with:

- **Clear description** of the problem
- **Steps to reproduce** the issue
- **Expected behavior** vs actual behavior
- **Environment details** (OS, browser, Node version)
- **Screenshots** if applicable

**Note**: Never include API keys or sensitive information in issues!

## 📝 License

**PROPRIETARY AND CONFIDENTIAL**

This software is proprietary to AgentiCAD and is protected by copyright, trade secret, and other intellectual property laws. This is NOT open source software.

**All Rights Reserved. No license is granted for any use without explicit written authorization from AgentiCAD.**

See [LICENSE](LICENSE) and [LICENSE.md](LICENSE.md) for complete legal terms.
See [EULA.md](EULA.md) for end user license agreement.

## 👥 Contributors

This project is maintained by:
- **AgentiCAD Developer** - Core development and architecture
- **Dally101** - Project oversight and management

## 🙏 Acknowledgments
- **Supabase** for backend infrastructure
- **Three.js** community for 3D rendering capabilities
- **React** ecosystem for frontend framework

## 📞 Support

- **GitHub Issues**: For bug reports and feature requests
- **Documentation**: Check our comprehensive guides
- **Community**: Join discussions in GitHub Discussions

## Environment Variables

For production deployment, make sure to set the following environment variables:

```bash
# App Configuration - CRITICAL for production redirects
VITE_APP_URL=https://agenticad.store

# Supabase Configuration
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# Stripe Configuration  
STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
STRIPE_SECRET_KEY=your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=your_stripe_webhook_secret

# Other required variables...
```

**Important**: The `VITE_APP_URL` variable is essential for production deployments to ensure Stripe checkout success/cancel redirects go to `https://agenticad.store` instead of `localhost:5173`.

## Production Deployment Checklist

Before deploying to production, ensure:

- [ ] `VITE_APP_URL=https://agenticad.store` is set in production environment
- [ ] All Supabase environment variables are configured
- [ ] Stripe production keys are set (not test keys)
- [ ] Stripe webhook endpoints are configured for production domain
- [ ] Build command: `npm run build`
- [ ] Test Stripe checkout flow redirects to correct domain
- [ ] Test OAuth redirects (Google, Apple, Microsoft) work correctly

## Getting Started

---

**Made with ❤️ by the AgentiCAD Team**

Transform your ideas into reality with AI-powered CAD design. 
