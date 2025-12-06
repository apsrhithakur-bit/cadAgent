import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

gsap.registerPlugin(ScrollTrigger);

interface HorizonHeroSectionProps {
  onGetStarted?: () => void;
}

export const HorizonHeroSection: React.FC<HorizonHeroSectionProps> = ({ onGetStarted }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const smoothCameraPos = useRef({ x: 0, y: 30, z: 100 });
  
  const [scrollProgress, setScrollProgress] = useState(0);
  const [currentSection, setCurrentSection] = useState(1);
  const [isReady, setIsReady] = useState(false);
  const totalSections = 3;
  
  const threeRefs = useRef<any>({
    scene: null,
    camera: null,
    renderer: null,
    composer: null,
    stars: [],
    nebula: null,
    mountains: [],
    leftHand: null,
    rightHand: null,
    handParticles: [],
    animationId: null,
    targetCameraX: 0,
    targetCameraY: 30,
    targetCameraZ: 100,
    locations: []
  });

  // Initialize Three.js
  useEffect(() => {
    const initThree = () => {
      const { current: refs } = threeRefs;
      
      // Scene setup
      refs.scene = new THREE.Scene();
      refs.scene.fog = new THREE.FogExp2(0x000000, 0.00025);

      // Camera
      refs.camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        2000
      );
      refs.camera.position.z = 100;
      refs.camera.position.y = 20;

      // Renderer
      refs.renderer = new THREE.WebGLRenderer({
        canvas: canvasRef.current!,
        antialias: true,
        alpha: true
      });
      refs.renderer.setSize(window.innerWidth, window.innerHeight);
      refs.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      refs.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      refs.renderer.toneMappingExposure = 0.5;

      // Post-processing
      refs.composer = new EffectComposer(refs.renderer);
      const renderPass = new RenderPass(refs.scene, refs.camera);
      refs.composer.addPass(renderPass);

      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        0.8,
        0.4,
        0.85
      );
      refs.composer.addPass(bloomPass);

      // Create scene elements
      createStarField();
      createNebula();
      createMountains();
      createLighting(); // Add proper lighting for 3D models
      createAtmosphere();
      createCosmicHands(); // New cosmic hands that hold mountains and create nebula
      getLocation();

      // Start animation
      animate();
      
      // Mark as ready after Three.js is initialized
      setIsReady(true);
    };

    const createStarField = () => {
      const { current: refs } = threeRefs;
      const starCount = 5000;
      
      for (let i = 0; i < 3; i++) {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(starCount * 3);
        const colors = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);

        for (let j = 0; j < starCount; j++) {
          const radius = 200 + Math.random() * 800;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);

          positions[j * 3] = radius * Math.sin(phi) * Math.cos(theta);
          positions[j * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
          positions[j * 3 + 2] = radius * Math.cos(phi);

          // Color variation - match original
          const color = new THREE.Color();
          const colorChoice = Math.random();
          if (colorChoice < 0.7) {
            color.setHSL(0, 0, 0.8 + Math.random() * 0.2);
          } else if (colorChoice < 0.9) {
            color.setHSL(0.08, 0.5, 0.8); // Orange stars
          } else {
            color.setHSL(0.6, 0.5, 0.8); // Blue stars
          }
          
          colors[j * 3] = color.r;
          colors[j * 3 + 1] = color.g;
          colors[j * 3 + 2] = color.b;

          sizes[j] = Math.random() * 2 + 0.5;
        }

        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

        const material = new THREE.ShaderMaterial({
          uniforms: {
            time: { value: 0 },
            depth: { value: i }
          },
          vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            uniform float time;
            uniform float depth;
            
            void main() {
              vColor = color;
              vec3 pos = position;
              
              // Slow rotation based on depth
              float angle = time * 0.05 * (1.0 - depth * 0.3);
              mat2 rot = mat2(cos(angle), -sin(angle), sin(angle), cos(angle));
              pos.xy = rot * pos.xy;
              
              vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
              gl_PointSize = size * (300.0 / -mvPosition.z);
              gl_Position = projectionMatrix * mvPosition;
            }
          `,
          fragmentShader: `
            varying vec3 vColor;
            
            void main() {
              float dist = length(gl_PointCoord - vec2(0.5));
              if (dist > 0.5) discard;
              
              float opacity = 1.0 - smoothstep(0.0, 0.5, dist);
              gl_FragColor = vec4(vColor, opacity);
            }
          `,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        });

        const stars = new THREE.Points(geometry, material);
        refs.scene.add(stars);
        refs.stars.push(stars);
      }
    };

    const createNebula = () => {
      const { current: refs } = threeRefs;
      
      const geometry = new THREE.PlaneGeometry(8000, 4000, 100, 100);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          color1: { value: new THREE.Color(0x0033ff) },
          color2: { value: new THREE.Color(0xff0066) }, // Pink like original
          opacity: { value: 0.3 } // Higher opacity
        },
        vertexShader: `
          varying vec2 vUv;
          varying float vElevation;
          uniform float time;
          
          void main() {
            vUv = uv;
            vec3 pos = position;
            
            float elevation = sin(pos.x * 0.01 + time) * cos(pos.y * 0.01 + time) * 20.0;
            pos.z += elevation;
            vElevation = elevation;
            
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 color1;
          uniform vec3 color2;
          uniform float opacity;
          uniform float time;
          varying vec2 vUv;
          varying float vElevation;
          
          void main() {
            float mixFactor = sin(vUv.x * 10.0 + time) * cos(vUv.y * 10.0 + time);
            vec3 color = mix(color1, color2, mixFactor * 0.5 + 0.5);
            
            float alpha = opacity * (1.0 - length(vUv - 0.5) * 2.0);
            alpha *= 1.0 + vElevation * 0.01;
            
            gl_FragColor = vec4(color, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        depthWrite: false
      });

      const nebula = new THREE.Mesh(geometry, material);
      nebula.position.z = -1050;
      nebula.rotation.x = 0;
      nebula.userData = { baseZ: -1050 }; // Store base position
      refs.scene.add(nebula);
      refs.nebula = nebula;
    };

    const createMountains = () => {
      const { current: refs } = threeRefs;
      
      const layers = [
        { distance: -50, height: 130, color: 0x1a1a2e, opacity: 1 },
        { distance: -150, height: 170, color: 0x16213e, opacity: 0.8 },
        { distance: -280, height: 210, color: 0x0f3460, opacity: 0.6 },
        { distance: -450, height: 260, color: 0x0a4668, opacity: 0.4 }
      ];

      layers.forEach((layer, index) => {
        const points = [];
        const segments = 50;
        
        for (let i = 0; i <= segments; i++) {
          const x = (i / segments - 0.5) * 1000;
          const y = Math.sin(i * 0.1) * layer.height + 
                   Math.sin(i * 0.05) * layer.height * 0.5 +
                   Math.random() * layer.height * 0.2 - 100;
          points.push(new THREE.Vector2(x, y));
        }
        
        points.push(new THREE.Vector2(5000, -500));
        points.push(new THREE.Vector2(-5000, -500)); // Much wider and deeper base to go off screen

        const shape = new THREE.Shape(points);
        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
          color: layer.color,
          transparent: true,
          opacity: layer.opacity,
          side: THREE.DoubleSide
        });

        const mountain = new THREE.Mesh(geometry, material);
        mountain.position.x = -50; // Shift mountains left
        mountain.position.z = layer.distance;
        mountain.position.y = layer.distance;
        mountain.userData = { baseX: -50, baseZ: layer.distance, index };
        refs.scene.add(mountain);
        refs.mountains.push(mountain);
      });
    };

    const createLighting = () => {
      const { current: refs } = threeRefs;
      
      // Add ambient light for overall illumination
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      refs.scene.add(ambientLight);
      
      // Add directional light for 3D model definition
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(100, 200, 100);
      directionalLight.castShadow = false; // Keep performance good
      refs.scene.add(directionalLight);
      
      // Add point light for hands specifically
      const handLight = new THREE.PointLight(0xffddcc, 1.0, 1000);
      handLight.position.set(0, 0, 200); // In front of hands
      refs.scene.add(handLight);
    };

    const createAtmosphere = () => {
      const { current: refs } = threeRefs;
      
      const geometry = new THREE.SphereGeometry(600, 32, 32);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 }
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          uniform float time;
          
          void main() {
            float intensity = pow(0.7 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            vec3 atmosphere = vec3(0.3, 0.6, 1.0) * intensity;
            
            float pulse = sin(time * 2.0) * 0.1 + 0.9;
            atmosphere *= pulse;
            
            gl_FragColor = vec4(atmosphere, intensity * 0.25); // Higher opacity
          }
        `,
        side: THREE.BackSide,
        blending: THREE.AdditiveBlending,
        transparent: true
      });

      const atmosphere = new THREE.Mesh(geometry, material);
      refs.scene.add(atmosphere);
    };

    const createCosmicHands = () => {
      const { current: refs } = threeRefs;
      const loader = new GLTFLoader();
      
      // Load 3D hand model
      loader.load('/models/hands/scene.gltf', (gltf) => {
        console.log('Hand model loaded successfully');
        console.log('Model structure:', gltf.scene);
        
        // Create left hand
        const leftHand = gltf.scene.clone();
        
        // Keep original realistic materials from GLTF - Phase 1 only
        leftHand.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            console.log('Found mesh in left hand:', child.name, 'with material:', child.material?.name);

            // Keep the original material from GLTF for realistic look
            if (child.material) {
              // Store original material properties for restoration
              child.userData.originalMaterial = child.material.clone();
              // Ensure proper rendering
              child.material.side = THREE.FrontSide;
              child.material.depthWrite = true;
              child.material.depthTest = true;
              child.material.transparent = false;
              child.material.opacity = 1.0;
              child.material.needsUpdate = true;
            }

            // Ensure geometry is valid
            if (child.geometry) {
              child.geometry.computeVertexNormals();
            }
            
            // Make sure it's visible
            child.visible = true;
            child.frustumCulled = false; // Disable frustum culling for debugging
          }
        });
        
        // Position left hand - increased size for better visibility, moved further out to avoid mountain
        leftHand.position.set(-220, -160, 110); // Moved down slightly
        leftHand.scale.set(60, 60, 60); // Increased size for better visibility
        leftHand.rotation.set(-Math.PI * 0.15, -0.3 + Math.PI * 0.25 - Math.PI/6 - Math.PI/6 + Math.PI * 25/180 - Math.PI * 5/180 + Math.PI * 0.1, 0.001 + Math.PI * 0.05); // Rotated further leftward
        leftHand.userData = {
          baseX: -220,
          baseY: -160,
          baseZ: 110,
          baseScale: 60,
          type: 'left'
        };
        leftHand.visible = true;
        refs.scene.add(leftHand);
        refs.leftHand = leftHand;
        console.log('Left hand added to scene at:', leftHand.position);

        // Create right hand
        const rightHand = gltf.scene.clone();

        // Keep original realistic materials from GLTF - Phase 1 only
        rightHand.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            console.log('Found mesh in right hand:', child.name, 'with material:', child.material?.name);

            // Keep the original material from GLTF for realistic look
            if (child.material) {
              // Store original material properties for restoration
              child.userData.originalMaterial = child.material.clone();
              // Ensure proper rendering
              child.material.side = THREE.FrontSide;
              child.material.depthWrite = true;
              child.material.depthTest = true;
              child.material.transparent = false;
              child.material.opacity = 1.0;
              child.material.needsUpdate = true;
            }

            // Ensure geometry is valid
            if (child.geometry) {
              child.geometry.computeVertexNormals();
            }

            // Make sure it's visible
            child.visible = true;
            child.frustumCulled = false; // Disable frustum culling for debugging
          }
        });

        // Position right hand - increased size for better visibility
        rightHand.position.set(250, -200, 90); // Moved slightly right and forward
        rightHand.scale.set(60, 60, 60); // Increased size for better visibility
        rightHand.rotation.set(-Math.PI * 0.15, -Math.PI * 0.25 + Math.PI/6 + Math.PI/6 - Math.PI * 25/180 + Math.PI * 5/180, -Math.PI * 0.05); // Cupping gesture (mirrored) + 60° - 25° + 5° = 40° net clockwise on Y-axis
        rightHand.userData = {
          baseX: 250,
          baseY: -200,
          baseZ: 90,
          baseScale: 60,
          type: 'right'
        };
        rightHand.visible = true;
        refs.scene.add(rightHand);
        refs.rightHand = rightHand;
        console.log('Right hand added to scene at:', rightHand.position);
        
        // During nebula creation phase, we'll change these mountain hands to cosmic materials
        // But keep them as realistic skin for mountain holding
        
      },
      // Loading progress
      (xhr) => {
        console.log('Hands model ' + (xhr.loaded / xhr.total * 100) + '% loaded');
      },
      // Error handling
      (error) => {
        console.error('Error loading hand model:', error);
        console.log('Falling back to simple hand shapes');
        createSimpleHandFallback();
      });
      
      // Fallback function for simple hand shapes if GLTF fails
      const createSimpleHandFallback = () => {
        console.log('Creating fallback hand shapes');
        // Create simple visible boxes as fallback
        const leftHandGeometry = new THREE.BoxGeometry(50, 30, 10);
        const leftHandMaterial = new THREE.MeshLambertMaterial({ color: 0xfdbcb4 });
        const leftHand = new THREE.Mesh(leftHandGeometry, leftHandMaterial);
        leftHand.position.set(-340, -170, 50);
        leftHand.userData = { baseX: -340, baseY: -170, baseZ: 50, type: 'left' };
        refs.scene.add(leftHand);
        refs.leftHand = leftHand;
        
        const rightHandGeometry = new THREE.BoxGeometry(50, 30, 10);
        const rightHandMaterial = new THREE.MeshLambertMaterial({ color: 0xfdbcb4 });
        const rightHand = new THREE.Mesh(rightHandGeometry, rightHandMaterial);
        rightHand.position.set(340, -200, 50);
        rightHand.userData = { baseX: 340, baseY: -200, baseZ: 50, type: 'right' };
        refs.scene.add(rightHand);
        refs.rightHand = rightHand;
      };
      
      // Create particle emitters for hands (for nebula creation effect)
      const particleCount = 50;
      const particleGeometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);
      
      for (let i = 0; i < particleCount; i++) {
        positions[i * 3] = (Math.random() - 0.5) * 100;
        positions[i * 3 + 1] = (Math.random() - 0.5) * 50;
        positions[i * 3 + 2] = (Math.random() - 0.5) * 20;
        
        const color = new THREE.Color();
        color.setHSL(0.6, 0.7, 0.5 + Math.random() * 0.3);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
        
        sizes[i] = Math.random() * 3 + 1;
      }
      
      particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
      
      const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          opacity: { value: 0 }
        },
        vertexShader: `
          attribute float size;
          attribute vec3 color;
          varying vec3 vColor;
          uniform float time;
          
          void main() {
            vColor = color;
            vec3 pos = position;
            pos.y += sin(time + position.x * 0.1) * 2.0;
            pos.x += cos(time + position.y * 0.1) * 2.0;
            
            vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
            gl_PointSize = size * (300.0 / -mvPosition.z);
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        fragmentShader: `
          varying vec3 vColor;
          uniform float opacity;
          
          void main() {
            float dist = length(gl_PointCoord - vec2(0.5));
            if (dist > 0.5) discard;
            
            float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * opacity;
            gl_FragColor = vec4(vColor, alpha);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });
      
      const handParticles = new THREE.Points(particleGeometry, particleMaterial);
      handParticles.visible = false;
      refs.scene.add(handParticles);
      refs.handParticles = handParticles;
    };

    const createHand = () => {
      const { current: refs } = threeRefs;
      
      // Create hand silhouette using curves
      const handShape = new THREE.Shape();
      
      // Draw hand outline (simplified)
      handShape.moveTo(-50, -100);
      handShape.lineTo(-30, -80);
      handShape.lineTo(-20, -60);
      handShape.lineTo(-10, -40);
      handShape.lineTo(0, -30);
      handShape.lineTo(10, -40);
      handShape.lineTo(20, -60);
      handShape.lineTo(30, -80);
      handShape.lineTo(50, -100);
      handShape.lineTo(40, -120);
      handShape.lineTo(20, -130);
      handShape.lineTo(0, -125);
      handShape.lineTo(-20, -130);
      handShape.lineTo(-40, -120);
      handShape.lineTo(-50, -100);

      const handGeometry = new THREE.ShapeGeometry(handShape);
      const handMaterial = new THREE.MeshBasicMaterial({
        color: 0x1a1a2e,
        transparent: true,
        opacity: 0.8
      });

      const hand = new THREE.Mesh(handGeometry, handMaterial);
      hand.position.set(0, -200, -100);
      hand.scale.set(2, 2, 1);
      hand.visible = false; // Initially hidden
      refs.scene.add(hand);
      refs.hand = hand;

      // Create glowing orb above hand
      const orbGeometry = new THREE.SphereGeometry(15, 32, 32);
      const orbMaterial = new THREE.ShaderMaterial({
        uniforms: {
          time: { value: 0 },
          intensity: { value: 0.0 }
        },
        vertexShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          
          void main() {
            vNormal = normalize(normalMatrix * normal);
            vPosition = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          varying vec3 vNormal;
          varying vec3 vPosition;
          uniform float time;
          uniform float intensity;
          
          void main() {
            float glow = pow(0.8 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
            vec3 color = vec3(0.3, 0.6, 1.0) * glow;
            
            float pulse = sin(time * 3.0) * 0.2 + 0.8;
            color *= pulse * intensity;
            
            gl_FragColor = vec4(color, glow * intensity);
          }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide
      });

      const orb = new THREE.Mesh(orbGeometry, orbMaterial);
      orb.position.set(0, -100, -100);
      orb.visible = false; // Initially hidden
      refs.scene.add(orb);
      refs.orb = orb;
    };

    const animate = () => {
      const { current: refs } = threeRefs;
      refs.animationId = requestAnimationFrame(animate);
      
      const time = Date.now() * 0.001;

      // Update stars
      refs.stars.forEach((starField: any, i: number) => {
        if (starField.material.uniforms) {
          starField.material.uniforms.time.value = time;
        }
      });

      // Update nebula
      if (refs.nebula && refs.nebula.material.uniforms) {
        refs.nebula.material.uniforms.time.value = time * 0.5;
      }

      // Update orb
      if (refs.orb && refs.orb.material.uniforms) {
        refs.orb.material.uniforms.time.value = time;
      }
      
      // Update hand particles
      if (refs.handParticles && refs.handParticles.material.uniforms) {
        refs.handParticles.material.uniforms.time.value = time;
      }

      // Smooth camera movement with easing
      if (refs.camera && refs.targetCameraX !== undefined) {
        const smoothingFactor = 0.05;
        
        smoothCameraPos.current.x += (refs.targetCameraX - smoothCameraPos.current.x) * smoothingFactor;
        smoothCameraPos.current.y += (refs.targetCameraY - smoothCameraPos.current.y) * smoothingFactor;
        smoothCameraPos.current.z += (refs.targetCameraZ - smoothCameraPos.current.z) * smoothingFactor;
        
        // Add subtle floating motion
        const floatX = Math.sin(time * 0.1) * 2;
        const floatY = Math.cos(time * 0.15) * 1;
        
        // Apply final position
        refs.camera.position.x = smoothCameraPos.current.x + floatX;
        refs.camera.position.y = smoothCameraPos.current.y + floatY;
        refs.camera.position.z = smoothCameraPos.current.z;
        refs.camera.lookAt(0, 10, -600);
      }

      // Parallax mountains with subtle animation
      refs.mountains.forEach((mountain: any, i: number) => {
        const parallaxFactor = 1 + i * 0.5;
        mountain.position.x = Math.sin(time * 0.1) * 2 * parallaxFactor;
        mountain.position.y = 50 + (Math.cos(time * 0.15) * 1 * parallaxFactor);
      });

      if (refs.composer) {
        refs.composer.render();
      }
    };

    const getLocation = () => {
      const { current: refs } = threeRefs;
      const locations: number[] = [];
      refs.mountains.forEach((mountain: any, i: number) => {
        locations[i] = mountain.position.z;
      });
      refs.locations = locations;
    };

    initThree();

    // Handle resize
    const handleResize = () => {
      const { current: refs } = threeRefs;
      if (refs.camera && refs.renderer && refs.composer) {
        refs.camera.aspect = window.innerWidth / window.innerHeight;
        refs.camera.updateProjectionMatrix();
        refs.renderer.setSize(window.innerWidth, window.innerHeight);
        refs.composer.setSize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      const { current: refs } = threeRefs;
      
      if (refs.animationId) {
        cancelAnimationFrame(refs.animationId);
      }

      window.removeEventListener('resize', handleResize);

      // Dispose Three.js resources
      refs.stars.forEach((starField: any) => {
        starField.geometry.dispose();
        starField.material.dispose();
      });

      refs.mountains.forEach((mountain: any) => {
        mountain.geometry.dispose();
        mountain.material.dispose();
      });

      if (refs.nebula) {
        refs.nebula.geometry.dispose();
        refs.nebula.material.dispose();
      }

      if (refs.hand) {
        refs.hand.geometry.dispose();
        refs.hand.material.dispose();
      }

      if (refs.orb) {
        refs.orb.geometry.dispose();
        refs.orb.material.dispose();
      }

      if (refs.leftHand) {
        refs.leftHand.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }

      if (refs.rightHand) {
        refs.rightHand.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(material => material.dispose());
              } else {
                child.material.dispose();
              }
            }
          }
        });
      }

      if (refs.handParticles) {
        refs.handParticles.geometry.dispose();
        refs.handParticles.material.dispose();
      }

      if (refs.renderer) {
        refs.renderer.dispose();
      }
    };
  }, []);

  // Component is ready after Three.js initialization
  // No GSAP animations needed since we removed all text overlays

  // Scroll handling
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const windowHeight = window.innerHeight;
      const documentHeight = document.documentElement.scrollHeight;
      const maxScroll = documentHeight - windowHeight;
      const progress = Math.min(scrollY / maxScroll, 1);
      
      setScrollProgress(progress);
      const newSection = Math.floor(progress * totalSections);
      setCurrentSection(newSection);

      const { current: refs } = threeRefs;
      
      const totalProgress = progress * totalSections;
      const sectionProgress = totalProgress % 1;
      
      // Original camera positions - more dramatic movement
      const cameraPositions = [
        { x: 0, y: 30, z: 300 },    // Section 0 - HORIZON
        { x: 0, y: 40, z: -50 },    // Section 1 - COSMOS  
        { x: 0, y: 50, z: -700 }    // Section 2 - DESTINY
      ];
      
      const currentPos = cameraPositions[newSection] || cameraPositions[0];
      const nextPos = cameraPositions[newSection + 1] || currentPos;
      
      refs.targetCameraX = currentPos.x + (nextPos.x - currentPos.x) * sectionProgress;
      refs.targetCameraY = currentPos.y + (nextPos.y - currentPos.y) * sectionProgress;
      refs.targetCameraZ = currentPos.z + (nextPos.z - currentPos.z) * sectionProgress;

      // Original mountain logic - much simpler and cleaner
      refs.mountains.forEach((mountain: any, i: number) => {
        const speed = 1 + i * 0.9;
        const targetZ = mountain.userData.baseZ + scrollY * speed * 0.5;
        
        // Simple visibility logic like original
        if (progress > 0.7) {
          mountain.position.z = 600000; // Hide far away
        } else {
          mountain.position.z = targetZ; // Normal parallax movement
        }
      });
      
      // Original nebula movement - follows the mountain pattern
      if (refs.nebula) {
        const speed = 1 + 3 * 0.9; // Similar to mountain calculation
        const targetZ = refs.nebula.userData.baseZ + scrollY * speed * 0.01;
        
        if (progress > 0.7) {
          refs.nebula.position.z = 600000; // Hide like mountains
        } else {
          refs.nebula.position.z = targetZ; // Follow parallax movement
        }
      }

      // Animate cosmic hands based on scroll
      if (refs.leftHand && refs.rightHand) {
        // Phase 1 (0-32%): Hands hold mountains at edges - PRESERVE PERFECT POSITIONING with smooth exit
        if (progress <= 0.32) {
          refs.leftHand.visible = true;
          refs.rightHand.visible = true;

          // Keep hands at their perfectly positioned locations - NO MOVEMENT OVERRIDE
          refs.leftHand.position.x = refs.leftHand.userData.baseX;
          refs.leftHand.position.y = refs.leftHand.userData.baseY;
          refs.leftHand.position.z = refs.leftHand.userData.baseZ;
          refs.rightHand.position.x = refs.rightHand.userData.baseX;
          refs.rightHand.position.y = refs.rightHand.userData.baseY;
          refs.rightHand.position.z = refs.rightHand.userData.baseZ;

          // Preserve scale - IMPORTANT: maintain consistent size
          refs.leftHand.scale.set(refs.leftHand.userData.baseScale, refs.leftHand.userData.baseScale, refs.leftHand.userData.baseScale);
          refs.rightHand.scale.set(refs.rightHand.userData.baseScale, refs.rightHand.userData.baseScale, refs.rightHand.userData.baseScale);

          // Preserve original rotations - NO ROTATION OVERRIDE
          // Left hand: mirrored cupping gesture
          refs.leftHand.rotation.set(
            -Math.PI * 0.15,
            Math.PI * 0.25 - Math.PI/6 - Math.PI/6 + Math.PI * 25/180 - Math.PI * 5/180 + Math.PI * 0.1,
            Math.PI * 0.05
          );
          // Right hand: +40° Y rotation
          refs.rightHand.rotation.set(
            -Math.PI * 0.15,
            -Math.PI * 0.25 + Math.PI/6 + Math.PI/6 - Math.PI * 25/180 + Math.PI * 5/180,
            -Math.PI * 0.05
          );

          // Reset any material changes from other phases - restore original GLTF materials
          refs.leftHand.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              // If we have the original material stored, restore it completely
              if (child.userData.originalMaterial) {
                child.material = child.userData.originalMaterial.clone();
              } else {
                // Otherwise restore key properties
                child.material.transparent = false;
                child.material.opacity = 1.0;
                child.material.side = THREE.FrontSide;
                child.material.depthWrite = true;
                child.material.depthTest = true;
              }
              child.material.needsUpdate = true;
              // Ensure visible
              child.visible = true;
            }
          });
          refs.rightHand.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              // If we have the original material stored, restore it completely
              if (child.userData.originalMaterial) {
                child.material = child.userData.originalMaterial.clone();
              } else {
                // Otherwise restore key properties
                child.material.transparent = false;
                child.material.opacity = 1.0;
                child.material.side = THREE.FrontSide;
                child.material.depthWrite = true;
                child.material.depthTest = true;
              }
              child.material.needsUpdate = true;
              // Ensure visible
              child.visible = true;
            }
          });

          // Hide particles in this phase
          refs.handParticles.visible = false;
        }
        // Phase 2 (30-50%): Hands move away from mountains - RESTORED with smooth transition
        else if (progress > 0.30 && progress <= 0.5) {
          const transitionProgress = (progress - 0.30) / 0.2;
          
          // RESTORED - Smooth fade out logic
          const fadeOpacity = Math.max(0.6, 1.0 * (1 - transitionProgress * 0.4)); // Gentler fade
          refs.leftHand.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              // Only update properties, don't recreate material
              if (!child.material.transparent) {
                child.material.transparent = true;
              }
              child.material.opacity = fadeOpacity;
              child.material.needsUpdate = true;
            }
          });
          refs.rightHand.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              // Only update properties, don't recreate material
              if (!child.material.transparent) {
                child.material.transparent = true;
              }
              child.material.opacity = fadeOpacity;
              child.material.needsUpdate = true;
            }
          });
          
          // Maintain scale throughout transition
          refs.leftHand.scale.set(refs.leftHand.userData.baseScale, refs.leftHand.userData.baseScale, refs.leftHand.userData.baseScale);
          refs.rightHand.scale.set(refs.rightHand.userData.baseScale, refs.rightHand.userData.baseScale, refs.rightHand.userData.baseScale);

          // Smooth position transition with easing
          const positionEase = transitionProgress * transitionProgress * (3 - 2 * transitionProgress); // Smooth cubic ease

          // Start from actual perfect positions, move away from mountains smoothly
          const startLeftX = refs.leftHand.userData.baseX; // -340
          const startLeftY = refs.leftHand.userData.baseY; // -170
          const startRightX = refs.rightHand.userData.baseX; // 340
          const startRightY = refs.rightHand.userData.baseY; // -200

          // Smooth withdrawal movement with easing
          refs.leftHand.position.x = startLeftX - (positionEase * 150); // Move further left
          refs.leftHand.position.y = startLeftY - (positionEase * 100); // Move down
          refs.leftHand.position.z = refs.leftHand.userData.baseZ - (positionEase * 200); // Move back
          refs.rightHand.position.x = startRightX + (positionEase * 150); // Move further right
          refs.rightHand.position.y = startRightY - (positionEase * 100); // Move down
          refs.rightHand.position.z = refs.rightHand.userData.baseZ - (positionEase * 200); // Move back
          
          // Smooth rotation transition from Phase 1 to neutral
          const rotationEase = transitionProgress * transitionProgress * (3 - 2 * transitionProgress); // Smooth cubic ease
          
          // Phase 1 rotations (starting values)
          const leftStartRotX = -Math.PI * 0.15;
          const leftStartRotY = Math.PI * 0.25 - Math.PI/6 - Math.PI/6 + Math.PI * 25/180 - Math.PI * 5/180 + Math.PI * 0.1;
          const leftStartRotZ = Math.PI * 0.05; // Mirrored Z rotation
          
          const rightStartRotX = -Math.PI * 0.15;
          const rightStartRotY = -Math.PI * 0.25 + Math.PI/6 + Math.PI/6 - Math.PI * 25/180 + Math.PI * 5/180;
          const rightStartRotZ = -Math.PI * 0.05;
          
          // Interpolate smoothly to neutral position (0, 0, 0)
          refs.leftHand.rotation.set(
            leftStartRotX * (1 - rotationEase),
            leftStartRotY * (1 - rotationEase),
            leftStartRotZ * (1 - rotationEase)
          );
          refs.rightHand.rotation.set(
            rightStartRotX * (1 - rotationEase),
            rightStartRotY * (1 - rotationEase),
            rightStartRotZ * (1 - rotationEase)
          );
          
          refs.handParticles.visible = false;
        }
        // Phase 3 (50-70%): Hands return to create nebula - RESTORED
        else if (progress > 0.5 && progress <= 0.7) {
          const creationProgress = (progress - 0.5) / 0.2;

          refs.leftHand.visible = true;
          refs.rightHand.visible = true;

          // Maintain consistent scale
          refs.leftHand.scale.set(refs.leftHand.userData.baseScale, refs.leftHand.userData.baseScale, refs.leftHand.userData.baseScale);
          refs.rightHand.scale.set(refs.rightHand.userData.baseScale, refs.rightHand.userData.baseScale, refs.rightHand.userData.baseScale);

          // Keep realistic skin textures - no cosmic transformation
          // Commented out to preserve lifelike appearance
          /*
          refs.leftHand.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              // Change to cosmic material during nebula creation
              child.material = new THREE.MeshLambertMaterial({
                color: 0x4a5d8a, // Cosmic blue-gray
                transparent: true,
                opacity: 0.7,
                emissive: 0x1a4d8a,
                emissiveIntensity: creationProgress * 0.3,
              });
            }
          });
          refs.rightHand.traverse((child) => {
            if (child instanceof THREE.Mesh && child.material) {
              // Change to cosmic material during nebula creation
              child.material = new THREE.MeshLambertMaterial({
                color: 0x4a5d8a, // Cosmic blue-gray
                transparent: true,
                opacity: 0.7,
                emissive: 0x1a4d8a,
                emissiveIntensity: creationProgress * 0.3,
              });
            }
          });
          */

          // Move hands from actual withdrawn position (end of Phase 2) to nebula
          const startLeftX = refs.leftHand.userData.baseX - 150; // Actual Phase 2 end position
          const startLeftY = refs.leftHand.userData.baseY - 100; // Actual Phase 2 end position  
          const startLeftZ = refs.leftHand.userData.baseZ - 200; // Actual Phase 2 end position
          const startRightX = refs.rightHand.userData.baseX + 150; // Actual Phase 2 end position
          const startRightY = refs.rightHand.userData.baseY - 100; // Actual Phase 2 end position
          const startRightZ = refs.rightHand.userData.baseZ - 200; // Actual Phase 2 end position
          
          // Target positions around nebula for cupping
          const targetLeftX = -100;
          const targetLeftY = 50;
          const targetLeftZ = -800;
          const targetRightX = 100;
          const targetRightY = 50;
          const targetRightZ = -800;
          
          refs.leftHand.position.x = startLeftX + (creationProgress * (targetLeftX - startLeftX));
          refs.leftHand.position.y = startLeftY + (creationProgress * (targetLeftY - startLeftY));
          refs.leftHand.position.z = startLeftZ + (creationProgress * (targetLeftZ - startLeftZ));
          
          refs.rightHand.position.x = startRightX + (creationProgress * (targetRightX - startRightX));
          refs.rightHand.position.y = startRightY + (creationProgress * (targetRightY - startRightY));
          refs.rightHand.position.z = startRightZ + (creationProgress * (targetRightZ - startRightZ));
          
          // Rotate hands into cosmic nebula-cupping position
          refs.leftHand.rotation.set(
            -Math.PI * 0.1 * creationProgress, // Slight downward tilt
            creationProgress * 0.5, // Turn toward nebula
            -0.05 - (creationProgress * 0.3) // Cup gesture
          );
          refs.rightHand.rotation.set(
            -Math.PI * 0.1 * creationProgress, // Slight downward tilt
            -creationProgress * 0.5, // Turn toward nebula
            0.05 + (creationProgress * 0.3) // Cup gesture
          );
          
          // Start showing particles
          refs.handParticles.visible = true;
          refs.handParticles.material.uniforms.opacity.value = creationProgress * 0.6;
          refs.handParticles.position.copy(refs.nebula.position);
        }
        // Phase 4: After 70% - hands fade out completely
        else if (progress > 0.7) {
          refs.leftHand.visible = false;
          refs.rightHand.visible = false;
          refs.handParticles.visible = false;
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    handleScroll();
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, [totalSections]);

  return (
    <div ref={containerRef} className="hero-container">
      <canvas ref={canvasRef} className="hero-canvas" />
      
      <div className="scroll-sections">
        {[...Array(3)].map((_, i) => {
          const titles = ['DESIGN', 'CREATE', 'BUILD'];
          const subtitles = [
            { line1: 'Turn your ideas into', line2: 'real physical products that sell & scale' },
            { line1: 'Clarify your design with', line2: 'multimodal input and legal review' },
            { line1: 'Ready for manufacturing', line2: 'with real-world AR preview' }
          ];

          return (
            <section key={i} className="content-section">
              <button
                onClick={onGetStarted}
                className="hero-title-button"
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.05)';
                  e.currentTarget.style.filter = 'brightness(1.2)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                  e.currentTarget.style.filter = 'brightness(1)';
                }}
              >
                <h1 className="hero-title">
                  {titles[i]}
                </h1>
              </button>
              <div className="hero-subtitle">
                <p className="subtitle-line">{subtitles[i]?.line1}</p>
                <p className="subtitle-line">{subtitles[i]?.line2}</p>
              </div>
            </section>
          );
        })}
      </div>

    </div>
  );
};

export default HorizonHeroSection;