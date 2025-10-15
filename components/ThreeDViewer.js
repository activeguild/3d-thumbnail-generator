'use client';

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import UPNG from 'upng-js';

export default function ThreeDViewer({ file, backgroundColor = '#F2F6FF', onComplete, onError }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState('initializing');
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const mixerRef = useRef(null);
  const animationIdRef = useRef(null);

  useEffect(() => {
    if (!file) return;

    let isCancelled = false;

    const processModel = async () => {
      try {
        setStatus('loading');

        // Create off-screen canvas
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        canvasRef.current = canvas;

        // Scene setup
        const scene = new THREE.Scene();
        scene.background = new THREE.Color(backgroundColor);
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
        renderer.setPixelRatio(1);
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        rendererRef.current = renderer;

        // Lighting
        const ambientLight = new THREE.AmbientLight(0xffffff, 1);
        scene.add(ambientLight);

        const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
        directionalLight.position.set(5, 5, 5);
        scene.add(directionalLight);

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

        // Center and scale model
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

        camera.position.set(maxDimension * 1.5, maxDimension * 1.5, maxDimension * 1.5);
        camera.lookAt(0, 0, 0);
        camera.updateProjectionMatrix();

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

    processModel();

    return () => {
      isCancelled = true;
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
    };
  }, [file, backgroundColor, onComplete, onError]);

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
