'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import styles from './TemplateViewer.module.css';

export default function TemplateViewer() {
  const containerRef = useRef(null);
  const rendererRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const mixerRef = useRef(null);
  const clockRef = useRef(null);
  const currentModelRef = useRef(null);
  const ambientLightRef = useRef(null);
  const directionalLightRef = useRef(null);
  const animFrameRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const [exposure, setExposure] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [envIntensity, setEnvIntensity] = useState(1.0);
  const [isRecording, setIsRecording] = useState(false);
  const [glbFileName, setGlbFileName] = useState('');
  const [bgFileName, setBgFileName] = useState('');
  const [hdrFileName, setHdrFileName] = useState('');
  const [threeLoaded, setThreeLoaded] = useState(false);
  const [threeModules, setThreeModules] = useState(null);

  // Load Three.js modules
  useEffect(() => {
    let cancelled = false;
    async function loadThree() {
      const THREE = await import('three');
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js');
      const { RGBELoader } = await import('three/examples/jsm/loaders/RGBELoader.js');
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js');
      if (!cancelled) {
        setThreeModules({ THREE, GLTFLoader, RGBELoader, OrbitControls });
        setThreeLoaded(true);
      }
    }
    loadThree();
    return () => { cancelled = true; };
  }, []);

  // Initialize scene
  useEffect(() => {
    if (!threeLoaded || !threeModules || !containerRef.current) return;
    const { THREE, OrbitControls } = threeModules;

    const width = 480;
    const height = 640;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const renderer = new THREE.WebGLRenderer({ preserveDrawingBuffer: true, antialias: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    rendererRef.current = renderer;

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.set(0, 1, 5);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controlsRef.current = controls;

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(5, 10, 7);
    scene.add(directionalLight);
    directionalLightRef.current = directionalLight;

    const clock = new THREE.Clock();
    clockRef.current = clock;

    function animate() {
      animFrameRef.current = requestAnimationFrame(animate);
      const delta = clock.getDelta();
      if (mixerRef.current) mixerRef.current.update(delta);
      controls.update();
      renderer.render(scene, camera);
    }
    animate();

    // Load default HDR
    const rgbeLoader = new threeModules.RGBELoader();
    rgbeLoader.load('/environment.hdr', (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      scene.environment = texture;
      if (ambientLightRef.current) ambientLightRef.current.intensity = 0.5;
      if (directionalLightRef.current) directionalLightRef.current.intensity = 0.4;
    }, undefined, () => {
      // HDR load failed, continue without
    });

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      controls.dispose();
    };
  }, [threeLoaded, threeModules]);

  // Update exposure
  useEffect(() => {
    if (rendererRef.current) {
      rendererRef.current.toneMappingExposure = exposure;
    }
  }, [exposure]);

  // Update HDR rotation
  useEffect(() => {
    if (sceneRef.current?.environment) {
      sceneRef.current.environment.offset.x = rotation / 360;
    }
  }, [rotation]);

  // Update env map intensity
  useEffect(() => {
    if (currentModelRef.current) {
      currentModelRef.current.traverse((node) => {
        if (node.isMesh && node.material) {
          node.material.envMapIntensity = envIntensity;
          node.material.needsUpdate = true;
        }
      });
    }
  }, [envIntensity]);

  const handleBgChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file || !threeModules) return;
    const { THREE } = threeModules;
    setBgFileName(file.name);
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const bgCanvas = document.createElement('canvas');
      bgCanvas.width = 480;
      bgCanvas.height = 640;
      const ctx = bgCanvas.getContext('2d');
      const imgRatio = img.width / img.height;
      const canvasRatio = 480 / 640;
      let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
      if (imgRatio > canvasRatio) {
        drawHeight = 640;
        drawWidth = img.width * (640 / img.height);
        offsetX = (480 - drawWidth) / 2;
      } else {
        drawWidth = 480;
        drawHeight = img.height * (480 / img.width);
        offsetY = (640 - drawHeight) / 2;
      }
      ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
      const bgTexture = new THREE.CanvasTexture(bgCanvas);
      bgTexture.colorSpace = THREE.SRGBColorSpace;
      sceneRef.current.background = bgTexture;
      URL.revokeObjectURL(url);
    };
    img.src = url;
  }, [threeModules]);

  const handleHdrChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file || !threeModules) return;
    const { THREE, RGBELoader } = threeModules;
    setHdrFileName(file.name);
    const url = URL.createObjectURL(file);
    const loader = new RGBELoader();
    loader.load(url, (texture) => {
      texture.mapping = THREE.EquirectangularReflectionMapping;
      texture.offset.x = rotation / 360;
      sceneRef.current.environment = texture;
      if (ambientLightRef.current) ambientLightRef.current.intensity = 0.5;
      if (directionalLightRef.current) directionalLightRef.current.intensity = 0.4;
      URL.revokeObjectURL(url);
    });
  }, [threeModules, rotation]);

  const handleGlbChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file || !threeModules) return;
    const { THREE, GLTFLoader } = threeModules;
    setGlbFileName(file.name);
    const url = URL.createObjectURL(file);
    const loader = new GLTFLoader();
    loader.load(url, (gltf) => {
      if (currentModelRef.current) {
        sceneRef.current.remove(currentModelRef.current);
      }
      const model = gltf.scene;
      currentModelRef.current = model;

      const box = new THREE.Box3().setFromObject(model);
      const center = box.getCenter(new THREE.Vector3());
      model.position.sub(center);

      const initialEnvIntensity = envIntensity;
      model.traverse((node) => {
        if (node.isMesh && node.material) {
          if (node.material.map) {
            node.material.map.flipY = false;
            node.material.map.colorSpace = THREE.SRGBColorSpace;
          }
          node.material.envMapIntensity = initialEnvIntensity;
          node.material.needsUpdate = true;
        }
      });

      sceneRef.current.add(model);

      if (gltf.animations && gltf.animations.length > 0) {
        mixerRef.current = new THREE.AnimationMixer(model);
        const action = mixerRef.current.clipAction(gltf.animations[0]);
        action.play();
      } else {
        mixerRef.current = null;
      }
      URL.revokeObjectURL(url);
    });
  }, [threeModules, envIntensity]);

  const handleDownload = useCallback(() => {
    if (!rendererRef.current) return;
    const link = document.createElement('a');
    link.download = 'thumbnail.png';
    link.href = rendererRef.current.domElement.toDataURL('image/png');
    link.click();
  }, []);

  const handleRecord = useCallback(() => {
    if (!rendererRef.current) return;

    if (!isRecording) {
      recordedChunksRef.current = [];
      const stream = rendererRef.current.domElement.captureStream(30);
      const mimeType = 'video/mp4; codecs="avc1"';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) recordedChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'animation.mp4'
        link.click();
        URL.revokeObjectURL(url);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
    } else {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    }
  }, [isRecording]);

  if (!threeLoaded) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading 3D Engine...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>Template Viewer</h1>
        <p className={styles.description}>
          Load 3D models with custom background images and HDR lighting
        </p>

        <div className={styles.layout}>
          <div className={styles.controls}>
            <div className={styles.settingsPanel}>
              <label className={styles.controlLabel}>
                <span className={styles.stepLabel}>1. Background Image</span>
                <div className={styles.fileInputWrapper}>
                  <input
                    type="file"
                    accept="image/png, image/jpeg"
                    onChange={handleBgChange}
                    className={styles.hiddenInput}
                    id="bg-input"
                  />
                  <label htmlFor="bg-input" className={styles.fileButton}>
                    Choose File
                  </label>
                  <span className={styles.fileNameDisplay}>
                    {bgFileName || 'No file selected'}
                  </span>
                </div>
              </label>
            </div>

            <div className={styles.settingsPanel}>
              <label className={styles.controlLabel}>
                <span className={styles.stepLabel}>2. Environment Light (HDR)</span>
                <div className={styles.fileInputWrapper}>
                  <input
                    type="file"
                    accept=".hdr"
                    onChange={handleHdrChange}
                    className={styles.hiddenInput}
                    id="hdr-input"
                  />
                  <label htmlFor="hdr-input" className={styles.fileButton}>
                    Choose File
                  </label>
                  <span className={styles.fileNameDisplay}>
                    {hdrFileName || 'Default HDR'}
                  </span>
                </div>
              </label>

              <div className={styles.sliderGroup}>
                <div className={styles.sliderRow}>
                  <span className={styles.sliderLabel}>Exposure</span>
                  <input
                    type="range"
                    min="0"
                    max="5"
                    step="0.1"
                    value={exposure}
                    onChange={(e) => setExposure(parseFloat(e.target.value))}
                    className={styles.slider}
                  />
                  <span className={styles.sliderValue}>{exposure.toFixed(1)}</span>
                </div>
                <div className={styles.sliderRow}>
                  <span className={styles.sliderLabel}>Light Angle</span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="1"
                    value={rotation}
                    onChange={(e) => setRotation(parseInt(e.target.value))}
                    className={styles.slider}
                  />
                  <span className={styles.sliderValue}>{rotation}&deg;</span>
                </div>
                <div className={styles.sliderRow}>
                  <span className={styles.sliderLabel}>Reflection</span>
                  <input
                    type="range"
                    min="0"
                    max="2"
                    step="0.1"
                    value={envIntensity}
                    onChange={(e) => setEnvIntensity(parseFloat(e.target.value))}
                    className={styles.slider}
                  />
                  <span className={styles.sliderValue}>{envIntensity.toFixed(1)}</span>
                </div>
              </div>
            </div>

            <div className={styles.settingsPanel}>
              <label className={styles.controlLabel}>
                <span className={styles.stepLabel}>3. 3D Model (.glb)</span>
                <div className={styles.fileInputWrapper}>
                  <input
                    type="file"
                    accept=".glb"
                    onChange={handleGlbChange}
                    className={styles.hiddenInput}
                    id="glb-input"
                  />
                  <label htmlFor="glb-input" className={styles.fileButton}>
                    Choose File
                  </label>
                  <span className={styles.fileNameDisplay}>
                    {glbFileName || 'No file selected'}
                  </span>
                </div>
              </label>
            </div>

            <div className={styles.actionButtons}>
              <button className={styles.downloadBtn} onClick={handleDownload}>
                Save Image (PNG)
              </button>
              <button
                className={`${styles.recordBtn} ${isRecording ? styles.recording : ''}`}
                onClick={handleRecord}
              >
                {isRecording ? 'Stop Recording' : 'Record'}
              </button>
            </div>
          </div>

          <div className={styles.previewContainer} ref={containerRef} />
        </div>
      </main>
    </div>
  );
}
