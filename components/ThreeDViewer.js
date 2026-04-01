'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import UPNG from 'upng-js';

function calcCameraPosition(maxDimension, cameraParams) {
  const { horizontalAngle = 45, verticalAngle = 45, zoom = 1.0 } = cameraParams || {};
  const hRad = (horizontalAngle * Math.PI) / 180;
  const vRad = (verticalAngle * Math.PI) / 180;
  const distance = (maxDimension * 1.5) / zoom;
  const x = distance * Math.cos(vRad) * Math.sin(hRad);
  const y = distance * Math.sin(vRad);
  const z = distance * Math.cos(vRad) * Math.cos(hRad);
  return new THREE.Vector3(x, y, z);
}

export default function ThreeDViewer({ file, backgroundColor = '#F2F6FF', onComplete, onError, cameraParams }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('initializing');
  const [mounted, setMounted] = useState(false);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const mixerRef = useRef(null);
  const animationIdRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!file) return;

    let isCancelled = false;

    const processPNG = async () => {
      try {
        setStatus('loading');

        // Enable color management (Three.js r160)
        THREE.ColorManagement.legacyMode = false;
        THREE.ColorManagement.enabled = true;

        // Create off-screen canvas
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        canvasRef.current = canvas;

        // Scene setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Camera setup - front view for PNG
        const canvasSize = 512;
        const camera = new THREE.OrthographicCamera(
          -canvasSize / 2,
          canvasSize / 2,
          canvasSize / 2,
          -canvasSize / 2,
          -1000,
          1000
        );
        camera.position.set(0, 0, 5);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Renderer setup - same background as GLB
        const renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
          preserveDrawingBuffer: true,
        });
        renderer.setSize(canvasSize, canvasSize);
        renderer.setPixelRatio(1); // Fixed pixel ratio to avoid zoom issues
        // Convert hex color to THREE.Color
        const bgColor = new THREE.Color(backgroundColor);
        renderer.setClearColor(bgColor);
        scene.background = bgColor;
        renderer.outputEncoding = THREE.LinearEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        rendererRef.current = renderer;

        // Load HDR environment map - same as GLB (only for lighting, not background)
        const rgbeLoader = new RGBELoader();
        await new Promise((resolve, reject) => {
          rgbeLoader.load('/environment.hdr', function(texture) {
              texture.mapping = THREE.EquirectangularReflectionMapping;
              texture.encoding = THREE.LinearEncoding;
              scene.environment = texture;
              // Don't set scene.background here - use user's backgroundColor instead
              resolve();
            }, undefined, reject);
        });

        if (isCancelled) return;

        // Load PNG texture
        const textureLoader = new THREE.TextureLoader();
        const imageUrl = URL.createObjectURL(file);

        const texture = await new Promise((resolve, reject) => {
          textureLoader.load(imageUrl, resolve, undefined, reject);
        });

        URL.revokeObjectURL(imageUrl);

        if (isCancelled) return;

        // Calculate aspect ratio and plane size
        const imageWidth = texture.image.width;
        const imageHeight = texture.image.height;
        const aspectRatio = imageWidth / imageHeight;

        let planeWidth, planeHeight;
        const maxSize = canvasSize * 0.8;

        if (aspectRatio > 1) {
          // Landscape: width is larger
          planeWidth = maxSize;
          planeHeight = maxSize / aspectRatio;
        } else {
          // Portrait or square: height is larger or equal
          planeHeight = maxSize;
          planeWidth = maxSize * aspectRatio;
        }

        // Create plane geometry with correct aspect ratio
        const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);

        // Create material with transparency support
        const material = new THREE.MeshBasicMaterial({
          map: texture,
          transparent: true,
                  opacity:1,
          side: THREE.DoubleSide,
          alphaTest: 0.01,
          toneMapped: false,
                  metalness:0.42
        });

        const plane = new THREE.Mesh(geometry, material);
        scene.add(plane);

        // Wait for initial render
        await new Promise(resolve => setTimeout(resolve, 100));

        if (isCancelled) return;

        // Generate thumbnail
        setStatus('rendering');

        renderer.render(scene, camera);

        // Create a temporary 2D canvas for extracting pixel data
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = 512;
        tempCanvas.height = 512;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(canvas, 0, 0);

        tempCanvas.toBlob((blob) => {
          if (!isCancelled) {
            setStatus('complete');
            onComplete?.(blob, false, file.name);
          }
        }, 'image/png');

        // Cleanup
        if (renderer) {
          renderer.dispose();
        }
        if (scene) {
          scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(material => material.dispose());
              } else {
                object.material.dispose();
              }
            }
          });
        }
        if (texture) {
          texture.dispose();
        }

      } catch (error) {
        if (!isCancelled) {
          console.error('Error processing PNG:', error);
          onError?.(error);
        }
      }
    };

    const processModel = async () => {
      try {
        setStatus('loading');

        // Enable color management (Three.js r160)
        THREE.ColorManagement.legacyMode = false;
        THREE.ColorManagement.enabled = true;

        // Create off-screen canvas
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        canvasRef.current = canvas;

        // Scene setup
        const scene = new THREE.Scene();
        sceneRef.current = scene;

        // Camera setup
        const canvasSize = 512;
        const camera = new THREE.OrthographicCamera(
          -canvasSize / 2,
          canvasSize / 2,
          canvasSize / 2,
          -canvasSize / 2,
          -1000,
          1000
        );
        camera.position.set(5, 5, 5);
        camera.lookAt(0, 0, 0);
        cameraRef.current = camera;

        // Renderer setup
        const renderer = new THREE.WebGLRenderer({
          canvas: canvas,
          antialias: true,
          preserveDrawingBuffer: true,
        });
        renderer.setSize(canvasSize, canvasSize);
        renderer.setPixelRatio(1); // Fixed pixel ratio to avoid zoom issues
        // Convert hex color to THREE.Color
        const bgColor = new THREE.Color(backgroundColor);
        renderer.setClearColor(bgColor);
        scene.background = bgColor;
        renderer.outputEncoding = THREE.LinearEncoding;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        rendererRef.current = renderer;

        // Load HDR environment map (only for lighting, not background)
        const rgbeLoader = new RGBELoader();
        await new Promise((resolve, reject) => {
          rgbeLoader.load('/environment.hdr', function(texture) {
              texture.mapping = THREE.EquirectangularReflectionMapping;
              texture.encoding = THREE.LinearEncoding;
              scene.environment = texture;
              // Don't set scene.background here - use user's backgroundColor instead
              resolve();
            }, undefined, reject);
        });

        if (isCancelled) return;

        // Load model
        const modelGroup = new THREE.Group();
        scene.add(modelGroup);

        const loader = new GLTFLoader();
        const dracoLoader = new DRACOLoader();
        dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
        loader.setDRACOLoader(dracoLoader);

        const fileUrl = URL.createObjectURL(file);

        const gltf = await new Promise((resolve, reject) => {
          loader.load(fileUrl, resolve, undefined, reject);
        });

        if (isCancelled) return;

        URL.revokeObjectURL(fileUrl);

        const loadedModel = gltf.scene;
        modelGroup.add(loadedModel);

        // Process materials
        loadedModel.traverse((child) => {
          if (child.isMesh) {
            child.geometry.computeBoundingBox();
            child.material.side = THREE.DoubleSide;
            child.material.needsUpdate = true;

            if (child.material.map) {
              child.material.needsUpdate = true;
            }

            ['normalMap', 'metalnessMap', 'roughnessMap', 'emissiveMap'].forEach((map) => {
              if (child.material[map]) {
                child.material.needsUpdate = true;
              }
            });
          }
        });

        // Setup animations if present
        let mixer = null;
        const hasAnimations = gltf.animations && gltf.animations.length > 0;

        if (hasAnimations) {
          mixer = new THREE.AnimationMixer(modelGroup);
          mixer.clipAction(gltf.animations[0]).play();
          mixerRef.current = mixer;
        }

        // Center and scale model (matching reference implementation)
        const box = new THREE.Box3().setFromObject(modelGroup);
        const size = new THREE.Vector3();
        box.getSize(size);

        const maxDimension = Math.max(size.x, size.y, size.z);
        const targetSize = 0.7 * canvasSize;
        const scaleFactor = targetSize / maxDimension;
        modelGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);

        const center = new THREE.Vector3();
        box.getCenter(center);

        loadedModel.position.sub(center);
        modelGroup.position.x -= center.x;
        modelGroup.position.z -= center.z;

        modelGroup.position.y -= center.y / 2;

        const scaledBox = new THREE.Box3().setFromObject(modelGroup);
        const scaledSize = new THREE.Vector3();
        scaledBox.getSize(scaledSize);
        const yCorrection = (scaledSize.y - size.y * scaleFactor) / 2;

        modelGroup.position.y += yCorrection;

        const camPos = calcCameraPosition(maxDimension, cameraParams);
        camera.position.copy(camPos);
        camera.lookAt(0, 0, 0);

        camera.left = -canvasSize / 2;
        camera.right = canvasSize / 2;
        camera.top = canvasSize / 2;
        camera.bottom = -canvasSize / 2;
        camera.updateProjectionMatrix();

        // Reset animation if present
        if (mixer) {
          mixer.clipAction(gltf.animations[0]).reset();
        }

        // Wait for initial render
        await new Promise(resolve => setTimeout(resolve, 100));

        if (isCancelled) return;

        // Generate thumbnail
        setStatus('rendering');

        if (hasAnimations) {
          // Generate APNG
          const totalFrames = 30;
          const fps = 30;
          const frameDelay = 1000 / fps;

          mixer.setTime(0);

          const frames = [];
          const delays = [];

          // Create a temporary 2D canvas for extracting pixel data
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 512;
          tempCanvas.height = 512;
          const tempCtx = tempCanvas.getContext('2d');

          for (let i = 0; i < totalFrames; i++) {
            if (mixer) {
              mixer.update(1 / fps);
            }

            renderer.render(scene, camera);

            // Copy WebGL canvas to 2D canvas
            tempCtx.drawImage(canvas, 0, 0);

            // Get image data from 2D canvas
            const imageData = tempCtx.getImageData(0, 0, 512, 512);
            const rgbaBuffer = new Uint8Array(imageData.data);
            frames.push(rgbaBuffer.buffer);
            delays.push(frameDelay);

            await new Promise(resolve => setTimeout(resolve, 10));
          }

          if (isCancelled) return;

          setStatus('encoding');
          const apngData = UPNG.encode(frames, 512, 512, 0, delays);
          const blob = new Blob([apngData], { type: 'image/png' });

          setStatus('complete');
          onComplete?.(blob, true, file.name);
        } else {
          // Generate static PNG
          renderer.render(scene, camera);

          // Create a temporary 2D canvas for extracting pixel data
          const tempCanvas = document.createElement('canvas');
          tempCanvas.width = 512;
          tempCanvas.height = 512;
          const tempCtx = tempCanvas.getContext('2d');
          tempCtx.drawImage(canvas, 0, 0);

          tempCanvas.toBlob((blob) => {
            if (!isCancelled) {
              setStatus('complete');
              onComplete?.(blob, false, file.name);
            }
          }, 'image/png');
        }

        // Cleanup
        if (renderer) {
          renderer.dispose();
        }
        if (scene) {
          scene.traverse((object) => {
            if (object.geometry) object.geometry.dispose();
            if (object.material) {
              if (Array.isArray(object.material)) {
                object.material.forEach(material => material.dispose());
              } else {
                object.material.dispose();
              }
            }
          });
        }

      } catch (error) {
        if (!isCancelled) {
          console.error('Error processing model:', error);
          onError?.(error);
        }
      }
    };

    // Check file type and process accordingly
    if (file.name.endsWith('.png')) {
      processPNG();
    } else {
      processModel();
    }

    return () => {
      isCancelled = true;
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [file, backgroundColor, onComplete, onError, cameraParams?.horizontalAngle, cameraParams?.verticalAngle, cameraParams?.zoom]);

  const getStatusMessage = () => {
    switch (status) {
      case 'initializing':
        return 'Initializing...';
      case 'loading':
        return 'Loading 3D model...';
      case 'rendering':
        return 'Rendering frames...';
      case 'encoding':
        return 'Encoding animated PNG...';
      case 'complete':
        return 'Complete! Download starting...';
      default:
        return 'Processing...';
    }
  };

  if (!mounted) {
    return null;
  }

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: '1rem',
      padding: '2rem',
      background: 'white',
      borderRadius: '8px',
      minHeight: '200px',
      justifyContent: 'center'
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '4px solid #667eea',
        borderTopColor: 'transparent',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite'
      }} />
      <p style={{ fontSize: '1.1rem', color: '#2d3748', fontWeight: 500 }}>
        {getStatusMessage()}
      </p>
      <style jsx>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
