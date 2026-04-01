'use client';

import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';

function sphericalFromPosition(position) {
  const distance = position.length();
  if (distance === 0) return { horizontalAngle: 45, verticalAngle: 45, zoom: 1.0 };
  const verticalAngle = Math.asin(position.y / distance) * (180 / Math.PI);
  const horizontalAngle = Math.atan2(position.x, position.z) * (180 / Math.PI);
  return {
    horizontalAngle: ((horizontalAngle % 360) + 360) % 360,
    verticalAngle: Math.max(0, Math.min(90, verticalAngle)),
  };
}

export default function ModelPreview({
  file,
  backgroundColor = '#F2F6FF',
  cameraParams,
  onChange,
}) {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationIdRef = useRef(null);
  const baseDistanceRef = useRef(1);
  const onChangeRef = useRef(onChange);

  // Keep onChange ref up to date without triggering re-renders
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  // Set camera from external cameraParams
  const setCameraFromParams = useCallback((params) => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const { horizontalAngle = 45, verticalAngle = 45, zoom = 1.0 } = params;
    const hRad = (horizontalAngle * Math.PI) / 180;
    const vRad = (verticalAngle * Math.PI) / 180;
    const distance = baseDistanceRef.current;
    camera.position.set(
      distance * Math.cos(vRad) * Math.sin(hRad),
      distance * Math.sin(vRad),
      distance * Math.cos(vRad) * Math.cos(hRad)
    );
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0, 0);
    controls.update();
  }, []);

  // Update camera when cameraParams change externally
  useEffect(() => {
    if (cameraParams) {
      setCameraFromParams(cameraParams);
    }
  }, [cameraParams, setCameraFromParams]);

  useEffect(() => {
    if (!file || !containerRef.current) return;

    let isCancelled = false;

    const init = async () => {
      THREE.ColorManagement.legacyMode = false;
      THREE.ColorManagement.enabled = true;

      const canvasSize = 300;
      const canvas = document.createElement('canvas');
      canvas.width = canvasSize;
      canvas.height = canvasSize;

      // Scene
      const scene = new THREE.Scene();
      sceneRef.current = scene;
      const bgColor = new THREE.Color(backgroundColor);
      scene.background = bgColor;

      // Camera
      const camera = new THREE.OrthographicCamera(
        -canvasSize / 2, canvasSize / 2,
        canvasSize / 2, -canvasSize / 2,
        -1000, 1000
      );
      cameraRef.current = camera;

      // Renderer
      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(canvasSize, canvasSize);
      renderer.setPixelRatio(window.devicePixelRatio);
      renderer.setClearColor(bgColor);
      renderer.outputEncoding = THREE.LinearEncoding;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      rendererRef.current = renderer;

      // Mount canvas to DOM
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(canvas);

      // OrbitControls
      const controls = new OrbitControls(camera, canvas);
      controls.enableDamping = true;
      controls.dampingFactor = 0.1;
      controls.enablePan = false;
      controls.minZoom = 0.5;
      controls.maxZoom = 3.0;
      controlsRef.current = controls;

      // On camera change, notify parent
      controls.addEventListener('change', () => {
        const angles = sphericalFromPosition(camera.position);
        const clampedZoom = Math.max(0.5, Math.min(3.0, camera.zoom));
        onChangeRef.current?.({
          ...angles,
          zoom: Math.round(clampedZoom * 100) / 100,
        });
      });

      // HDR environment
      const rgbeLoader = new RGBELoader();
      await new Promise((resolve, reject) => {
        rgbeLoader.load('/environment.hdr', (texture) => {
          texture.mapping = THREE.EquirectangularReflectionMapping;
          texture.encoding = THREE.LinearEncoding;
          scene.environment = texture;
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
      URL.revokeObjectURL(fileUrl);

      if (isCancelled) return;

      const loadedModel = gltf.scene;
      modelGroup.add(loadedModel);

      let mixer = null;
      const hasAnimations = gltf.animations && gltf.animations.length > 0;

      loadedModel.traverse((child) => {
        if (child.isMesh) {
          child.geometry.computeBoundingBox();
          child.material.side = THREE.DoubleSide;
          child.material.needsUpdate = true;
        }
      });

      if (hasAnimations) {
        mixer = new THREE.AnimationMixer(modelGroup);
        mixer.clipAction(gltf.animations[0]).play();
      }

      // For animated models, force skeleton update to get actual pose bounding box
      const updateSkeletons = () => {
        modelGroup.traverse((child) => {
          if (child.isSkinnedMesh && child.skeleton) {
            child.skeleton.update();
          }
        });
      };

      const box = new THREE.Box3();
      if (hasAnimations && mixer) {
        const clip = gltf.animations[0];
        const sampleCount = 20;
        const dt = clip.duration / sampleCount;
        for (let i = 0; i <= sampleCount; i++) {
          mixer.setTime(i * dt);
          modelGroup.updateMatrixWorld(true);
          updateSkeletons();
          const frameBox = new THREE.Box3().setFromObject(modelGroup);
          if (i === 0) {
            box.copy(frameBox);
          } else {
            box.union(frameBox);
          }
        }
        mixer.setTime(0);
        modelGroup.updateMatrixWorld(true);
        updateSkeletons();
      } else {
        box.setFromObject(modelGroup);
      }
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

      // Base distance for zoom calculation
      baseDistanceRef.current = maxDimension * 1.5;

      // Set initial camera from params
      const initParams = cameraParams || { horizontalAngle: 45, verticalAngle: 45, zoom: 1.0 };
      const hRad = (initParams.horizontalAngle * Math.PI) / 180;
      const vRad = (initParams.verticalAngle * Math.PI) / 180;
      const initDistance = baseDistanceRef.current;
      camera.position.set(
        initDistance * Math.cos(vRad) * Math.sin(hRad),
        initDistance * Math.sin(vRad),
        initDistance * Math.cos(vRad) * Math.cos(hRad)
      );
      camera.lookAt(0, 0, 0);

      camera.zoom = initParams.zoom;
      camera.left = -canvasSize / 2;
      camera.right = canvasSize / 2;
      camera.top = canvasSize / 2;
      camera.bottom = -canvasSize / 2;
      camera.updateProjectionMatrix();

      controls.update();

      // Render loop
      const clock = new THREE.Clock();
      const animate = () => {
        if (isCancelled) return;
        animationIdRef.current = requestAnimationFrame(animate);
        const delta = clock.getDelta();
        if (mixer) {
          mixer.update(delta);
        }
        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    };

    init().catch(console.error);

    return () => {
      isCancelled = true;
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
      if (sceneRef.current) {
        sceneRef.current.traverse((object) => {
          if (object.geometry) object.geometry.dispose();
          if (object.material) {
            if (Array.isArray(object.material)) {
              object.material.forEach((m) => m.dispose());
            } else {
              object.material.dispose();
            }
          }
        });
      }
    };
  }, [file, backgroundColor]); // Only re-init on file/bg change, not cameraParams

  return (
    <div
      ref={containerRef}
      style={{ width: '300px', height: '300px', borderRadius: '8px', overflow: 'hidden' }}
    />
  );
}
