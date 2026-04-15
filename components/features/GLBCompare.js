'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import styles from './GLBCompare.module.css';

function createLoader() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

function getModelStats(gltf) {
  let triangles = 0;
  let vertices = 0;
  let meshCount = 0;
  let pointsCount = 0;
  let materialCount = new Set();
  let textureCount = new Set();

  gltf.scene.traverse((child) => {
    // Handle regular meshes
    if (child.isMesh) {
      meshCount++;
      const geometry = child.geometry;

      if (geometry.index) {
        triangles += geometry.index.count / 3;
      } else if (geometry.attributes.position) {
        triangles += geometry.attributes.position.count / 3;
      }

      if (geometry.attributes.position) {
        vertices += geometry.attributes.position.count;
      }

      if (child.material) {
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach(mat => {
          materialCount.add(mat.uuid);
          if (mat.map) textureCount.add(mat.map.uuid);
          if (mat.normalMap) textureCount.add(mat.normalMap.uuid);
          if (mat.roughnessMap) textureCount.add(mat.roughnessMap.uuid);
          if (mat.metalnessMap) textureCount.add(mat.metalnessMap.uuid);
        });
      }
    }

    // Handle particle systems (Points)
    if (child.isPoints) {
      pointsCount++;
      const geometry = child.geometry;
      if (geometry.attributes.position) {
        vertices += geometry.attributes.position.count;
      }
      if (child.material) {
        materialCount.add(child.material.uuid);
        if (child.material.map) textureCount.add(child.material.map.uuid);
      }
    }
  });

  const animationInfo = gltf.animations.map(clip => ({
    name: clip.name || 'Unnamed',
    duration: clip.duration.toFixed(2),
    tracks: clip.tracks.length,
    keyframes: clip.tracks.reduce((sum, track) => sum + track.times.length, 0)
  }));

  return {
    triangles: Math.round(triangles),
    vertices,
    meshCount,
    pointsCount,
    materialCount: materialCount.size,
    textureCount: textureCount.size,
    animationCount: gltf.animations.length,
    animations: animationInfo
  };
}

function GLBViewer({ file, label, stats, onStatsUpdate, canvasRef, mixerRef, clockRef, isPlaying, seekTime, onTimeUpdate, onControlsChange, syncData }) {
  const containerRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const animationIdRef = useRef(null);
  const modelRef = useRef(null);
  const isSyncingRef = useRef(false);
  const isPlayingRef = useRef(isPlaying);
  const onTimeUpdateRef = useRef(onTimeUpdate);

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { onTimeUpdateRef.current = onTimeUpdate; }, [onTimeUpdate]);

  // Apply sync data from other viewer
  useEffect(() => {
    if (!syncData || !cameraRef.current || !controlsRef.current) return;

    isSyncingRef.current = true;
    cameraRef.current.position.copy(syncData.position);
    controlsRef.current.target.copy(syncData.target);
    controlsRef.current.update();

    // Reset syncing flag after a short delay
    setTimeout(() => {
      isSyncingRef.current = false;
    }, 10);
  }, [syncData]);

  useEffect(() => {
    if (!containerRef.current || !file) return;

    const container = containerRef.current;
    let animationId = null;
    let renderer = null;
    let controls = null;

    // Delay initialization to ensure layout is complete
    const timeoutId = setTimeout(() => {
      const rect = container.getBoundingClientRect();
      const width = rect.width || 400;
      const height = rect.height || 400;

      // Scene
      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);
      sceneRef.current = scene;

      // Camera
      const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 10000);
      camera.position.set(0, 0.5, 3);
      cameraRef.current = camera;

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.5;
      container.appendChild(renderer.domElement);
      rendererRef.current = renderer;
      if (canvasRef) canvasRef.current = renderer;

      // Controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controlsRef.current = controls;

      // Sync controls between viewers
      controls.addEventListener('change', () => {
        if (!isSyncingRef.current && onControlsChange) {
          onControlsChange({
            position: camera.position.clone(),
            target: controls.target.clone()
          });
        }
      });

      // Add basic lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
      directionalLight.position.set(5, 10, 7);
      scene.add(directionalLight);

      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight2.position.set(-5, 5, -5);
      scene.add(directionalLight2);

      const directionalLight3 = new THREE.DirectionalLight(0xffffff, 0.5);
      directionalLight3.position.set(0, -5, 0);
      scene.add(directionalLight3);

      // Load model
      const loader = createLoader();
      const fileUrl = URL.createObjectURL(file);

      loader.load(
        fileUrl,
        (gltf) => {
          URL.revokeObjectURL(fileUrl);

          const model = gltf.scene;
          modelRef.current = model;

          // Place model at origin
          model.position.set(0, 0, 0);

          scene.add(model);

          // Setup animation mixer
          if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            mixerRef.current = mixer;

            gltf.animations.forEach(clip => {
              const action = mixer.clipAction(clip);
              action.play();
              action.paused = true;
            });
            mixer.setTime(0);
            // Consume any elapsed clock time so it doesn't jump on first play
            if (clockRef.current) clockRef.current.getDelta();
          }

          // Get stats
          const modelStats = getModelStats(gltf);
          modelStats.fileSize = file.size;
          onStatsUpdate(modelStats);
        },
        undefined,
        (error) => {
          console.error('Error loading GLB:', error);
          URL.revokeObjectURL(fileUrl);
        }
      );

      // Animation loop
      const animate = () => {
        animationId = requestAnimationFrame(animate);
        animationIdRef.current = animationId;

        if (mixerRef.current && clockRef.current) {
          const delta = clockRef.current.getDelta();
          if (isPlayingRef.current) {
            mixerRef.current.update(delta);
            if (onTimeUpdateRef.current) {
              const actions = mixerRef.current._actions;
              const duration = actions.length > 0 ? actions[0]._clip.duration : 0;
              const time = duration > 0 ? mixerRef.current.time % duration : 0;
              onTimeUpdateRef.current(time);
            }
          }
        }

        controls.update();
        renderer.render(scene, camera);
      };
      animate();
    }, 100);

    // Resize handler (outside setTimeout so it can be cleaned up)
    const handleResize = () => {
      if (!containerRef.current || !rendererRef.current || !cameraRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const newWidth = rect.width;
      const newHeight = rect.height;
      if (newWidth > 0 && newHeight > 0) {
        cameraRef.current.aspect = newWidth / newHeight;
        cameraRef.current.updateProjectionMatrix();
        rendererRef.current.setSize(newWidth, newHeight);
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener('resize', handleResize);
      if (animationIdRef.current) {
        cancelAnimationFrame(animationIdRef.current);
      }
      if (rendererRef.current) {
        rendererRef.current.dispose();
        if (container && container.contains(rendererRef.current.domElement)) {
          container.removeChild(rendererRef.current.domElement);
        }
      }
      if (controlsRef.current) {
        controlsRef.current.dispose();
      }
    };
  }, [file]);

  // Handle play/pause
  useEffect(() => {
    if (mixerRef.current) {
      mixerRef.current._actions.forEach(action => {
        action.paused = !isPlaying;
      });
    }
  }, [isPlaying]);

  // Handle seek
  useEffect(() => {
    if (seekTime && mixerRef.current) {
      const mixer = mixerRef.current;
      const t = seekTime.time;
      mixer._actions.forEach(action => {
        action.time = t;
        action.paused = true;
      });
      mixer.time = t;
      mixer.update(0);
    }
  }, [seekTime]);

  return (
    <div className={styles.viewerContainer}>
      <div className={styles.viewerLabel}>{label}</div>
      <div ref={containerRef} className={styles.canvas} />
      {stats && (
        <div className={styles.statsOverlay}>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>File Size</span>
            <span className={styles.statValue}>{formatFileSize(stats.fileSize)}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Triangles</span>
            <span className={styles.statValue}>{stats.triangles.toLocaleString()}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Vertices</span>
            <span className={styles.statValue}>{stats.vertices.toLocaleString()}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Meshes</span>
            <span className={styles.statValue}>{stats.meshCount}</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statLabel}>Animations</span>
            <span className={styles.statValue}>{stats.animationCount}</span>
          </div>
          {stats.animations.length > 0 && (
            <>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Duration</span>
                <span className={styles.statValue}>
                  {stats.animations[0].duration}s
                </span>
              </div>
              <div className={styles.statItem}>
                <span className={styles.statLabel}>Keyframes</span>
                <span className={styles.statValue}>
                  {stats.animations.reduce((sum, a) => sum + a.keyframes, 0).toLocaleString()}
                </span>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function GLBCompare() {
  const [file1, setFile1] = useState(null);
  const [file2, setFile2] = useState(null);
  const [stats1, setStats1] = useState(null);
  const [stats2, setStats2] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [seekTime, setSeekTime] = useState(null);
  const [dragActive1, setDragActive1] = useState(false);
  const [dragActive2, setDragActive2] = useState(false);
  const [syncData1, setSyncData1] = useState(null); // Data to sync viewer 1
  const [syncData2, setSyncData2] = useState(null); // Data to sync viewer 2

  const mixer1Ref = useRef(null);
  const mixer2Ref = useRef(null);
  const clock1Ref = useRef(null);
  const clock2Ref = useRef(null);
  const canvas1Ref = useRef(null);
  const canvas2Ref = useRef(null);

  useEffect(() => {
    clock1Ref.current = new THREE.Clock();
    clock2Ref.current = new THREE.Clock();
  }, []);

  // When viewer 1 changes, sync to viewer 2
  const handleControls1Change = useCallback((data) => {
    setSyncData2(data);
  }, []);

  // When viewer 2 changes, sync to viewer 1
  const handleControls2Change = useCallback((data) => {
    setSyncData1(data);
  }, []);

  const handleDrag = (e, setDragActive) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e, setFile, setDragActive, setStats) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.glb')) {
        setFile(file);
        setStats(null);
      }
    }
  };

  const handleFileChange = (e, setFile, setStats) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      if (file.name.endsWith('.glb')) {
        setFile(file);
        setStats(null);
      }
    }
  };

  const handleTimeUpdate = useCallback((time) => {
    setCurrentTime(time);
  }, []);

  const seekIdRef = useRef(0);
  const handleSeek = useCallback((e) => {
    const time = parseFloat(e.target.value);
    seekIdRef.current += 1;
    setSeekTime({ time, id: seekIdRef.current });
    setCurrentTime(time);
  }, []);

  const togglePlayPause = useCallback(() => {
    setIsPlaying(prev => !prev);

    // Sync clocks
    if (!isPlaying) {
      if (clock1Ref.current) clock1Ref.current.start();
      if (clock2Ref.current) clock2Ref.current.start();
    }
  }, [isPlaying]);

  const handleReset = () => {
    setFile1(null);
    setFile2(null);
    setStats1(null);
    setStats2(null);
    setIsPlaying(false);
    setCurrentTime(0);
    setSeekTime({ time: 0, id: -1 });
    mixer1Ref.current = null;
    mixer2Ref.current = null;
  };

  const renderDropZone = (fileNum, file, setFile, dragActive, setDragActive, setStats) => (
    <div
      className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''}`}
      onDragEnter={(e) => handleDrag(e, setDragActive)}
      onDragLeave={(e) => handleDrag(e, setDragActive)}
      onDragOver={(e) => handleDrag(e, setDragActive)}
      onDrop={(e) => handleDrop(e, setFile, setDragActive, setStats)}
    >
      <input
        type="file"
        id={`glb-file-${fileNum}`}
        accept=".glb"
        onChange={(e) => handleFileChange(e, setFile, setStats)}
        className={styles.fileInput}
      />
      <label htmlFor={`glb-file-${fileNum}`} className={styles.dropZoneLabel}>
        <svg className={styles.dropIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
        <span>Drag and drop GLB #{fileNum} here</span>
        <span className={styles.browseText}>or</span>
        <span className={styles.browseLinkText}>Browse files</span>
      </label>
    </div>
  );

  const renderComparison = () => {
    if (!stats1 || !stats2) return null;

    const comparisons = [
      { label: 'File Size', value1: stats1.fileSize, value2: stats2.fileSize, format: formatFileSize },
      { label: 'Triangles', value1: stats1.triangles, value2: stats2.triangles, format: (v) => v.toLocaleString() },
      { label: 'Vertices', value1: stats1.vertices, value2: stats2.vertices, format: (v) => v.toLocaleString() },
      { label: 'Meshes', value1: stats1.meshCount, value2: stats2.meshCount, format: (v) => v },
      { label: 'Materials', value1: stats1.materialCount, value2: stats2.materialCount, format: (v) => v },
      { label: 'Textures', value1: stats1.textureCount, value2: stats2.textureCount, format: (v) => v },
      { label: 'Animations', value1: stats1.animationCount, value2: stats2.animationCount, format: (v) => v },
      {
        label: 'Duration',
        value1: stats1.animations.length > 0 ? parseFloat(stats1.animations[0].duration) : 0,
        value2: stats2.animations.length > 0 ? parseFloat(stats2.animations[0].duration) : 0,
        format: (v) => v + 's'
      },
      {
        label: 'Keyframes',
        value1: stats1.animations.reduce((sum, a) => sum + a.keyframes, 0),
        value2: stats2.animations.reduce((sum, a) => sum + a.keyframes, 0),
        format: (v) => v.toLocaleString()
      },
    ];

    return (
      <div className={styles.comparisonTable}>
        <h3>Comparison</h3>
        <table>
          <thead>
            <tr>
              <th>Property</th>
              <th>File 1</th>
              <th>File 2</th>
              <th>Diff</th>
            </tr>
          </thead>
          <tbody>
            {comparisons.map(({ label, value1, value2, format }) => {
              const diff = value2 - value1;
              const diffPercent = value1 > 0 ? ((diff / value1) * 100).toFixed(1) : 0;
              const diffClass = diff < 0 ? styles.diffNegative : diff > 0 ? styles.diffPositive : '';

              return (
                <tr key={label}>
                  <td>{label}</td>
                  <td>{format(value1)}</td>
                  <td>{format(value2)}</td>
                  <td className={diffClass}>
                    {diff !== 0 && (
                      <>
                        {diff > 0 ? '+' : ''}{diffPercent}%
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>GLB Compare</h1>
        <p className={styles.description}>
          Compare two GLB files side by side - polygons, animations, and more
        </p>
      </div>

      {(file1 || file2) && (
        <div className={styles.controls}>
          <button
            onClick={togglePlayPause}
            className={styles.playButton}
            disabled={!stats1?.animationCount && !stats2?.animationCount}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play'} Animations
          </button>
          <button onClick={handleReset} className={styles.resetButton}>
            Reset
          </button>
        </div>
      )}

      {(stats1?.animationCount > 0 || stats2?.animationCount > 0) && (() => {
        const duration = Math.max(
          stats1?.animations?.[0] ? parseFloat(stats1.animations[0].duration) : 0,
          stats2?.animations?.[0] ? parseFloat(stats2.animations[0].duration) : 0
        );
        return duration > 0 ? (
          <div className={styles.seekBarContainer}>
            <span className={styles.seekTime}>{currentTime.toFixed(2)}s</span>
            <input
              type="range"
              min={0}
              max={duration}
              step={0.01}
              value={currentTime % (duration + 0.001)}
              onChange={handleSeek}
              className={styles.seekBar}
            />
            <span className={styles.seekTime}>{duration.toFixed(2)}s</span>
          </div>
        ) : null;
      })()}

      <div className={styles.viewersRow}>
        <div className={styles.viewerWrapper}>
          {!file1 ? (
            renderDropZone(1, file1, setFile1, dragActive1, setDragActive1, setStats1)
          ) : (
            <GLBViewer
              file={file1}
              label={file1.name}
              stats={stats1}
              onStatsUpdate={setStats1}
              canvasRef={canvas1Ref}
              mixerRef={mixer1Ref}
              clockRef={clock1Ref}
              isPlaying={isPlaying}
              seekTime={seekTime}
              onTimeUpdate={handleTimeUpdate}
              onControlsChange={handleControls1Change}
              syncData={syncData1}
            />
          )}
        </div>

        <div className={styles.viewerWrapper}>
          {!file2 ? (
            renderDropZone(2, file2, setFile2, dragActive2, setDragActive2, setStats2)
          ) : (
            <GLBViewer
              file={file2}
              label={file2.name}
              stats={stats2}
              onStatsUpdate={setStats2}
              canvasRef={canvas2Ref}
              mixerRef={mixer2Ref}
              clockRef={clock2Ref}
              isPlaying={isPlaying}
              seekTime={seekTime}
              onTimeUpdate={null}
              onControlsChange={handleControls2Change}
              syncData={syncData2}
            />
          )}
        </div>
      </div>

      {renderComparison()}
    </div>
  );
}
