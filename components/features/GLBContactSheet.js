'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
import styles from './GLBContactSheet.module.css';

// --- utilities ---

function fmt(n) {
  return Number(n).toLocaleString('ja-JP');
}

function createLoader() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

// --- stats helpers ---

function geoStats(root) {
  let tri = 0, vert = 0, meshes = 0, bones = 0, morphs = 0;
  let skinned = 0, jointCount = 0;
  const jointSeen = new Set();

  root.traverse((o) => {
    if (o.isBone) bones++;
    if (o.isMesh && o.geometry) {
      meshes++;
      const pos = o.geometry.attributes?.position;
      const n = pos ? pos.count : 0;
      vert += n;
      tri += o.geometry.index ? o.geometry.index.count / 3 : n / 3;
      if (o.morphTargetInfluences) morphs += o.morphTargetInfluences.length;
    }
    if (o.isSkinnedMesh && o.skeleton) {
      skinned++;
      o.skeleton.bones.forEach((b) => {
        if (b && !jointSeen.has(b.uuid)) {
          jointSeen.add(b.uuid);
          jointCount++;
        }
      });
    }
  });

  return {
    tri: Math.round(tri), vert, meshes,
    bones, joints: jointCount, skinned, morphs,
  };
}

function clipStats(clip) {
  let total = 0;
  const times = new Set();
  clip.tracks.forEach((tr) => {
    total += tr.times.length;
    for (let i = 0; i < tr.times.length; i++) {
      times.add(Math.round(tr.times[i] * 1000));
    }
  });
  const uniq = times.size;
  return {
    tracks: clip.tracks.length,
    total,
    uniq,
    duration: clip.duration,
    fps: clip.duration > 0 ? (uniq - 1) / clip.duration : 0,
  };
}

// --- threshold check ---

function overList(geo, cs, clipIndex, limits) {
  const out = [];
  if (!geo) return out;
  const stat = cs?.[clipIndex];
  if (limits.tri > 0 && geo.tri >= limits.tri) out.push('ポリゴン');
  if (limits.bones > 0 && geo.bones >= limits.bones) out.push('ボーン');
  if (stat && limits.keys > 0) {
    const kv = limits.keyMode === 'total' ? stat.total : stat.uniq;
    if (kv >= limits.keys) out.push('キーフレーム');
  }
  return out;
}

// --- CSV export ---

function exportCSV(tiles) {
  const ready = tiles.filter((t) => t.geo);
  if (!ready.length) return;
  const rows = [
    ['ファイル', 'ポリゴン', '頂点', 'メッシュ', 'ボーン', 'スキンジョイント',
      'クリップ', '長さ(秒)', 'キー(ユニーク)', 'キー総数', 'チャンネル', '推定fps', 'しきい値超過'],
  ];
  ready.forEach((t) => {
    const cs = t.clipStats?.[t.clipIndex];
    const clip = t.clips?.[t.clipIndex];
    rows.push([
      t.name, t.geo.tri, t.geo.vert, t.geo.meshes, t.geo.bones, t.geo.joints,
      clip?.name ?? '', cs ? cs.duration.toFixed(3) : '',
      cs ? cs.uniq : '', cs ? cs.total : '', cs ? cs.tracks : '',
      cs ? cs.fps.toFixed(2) : '', '',
    ]);
  });
  const csv = '\ufeff' + rows.map((r) =>
    r.map((v) => {
      const s = String(v);
      return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }).join(',')
  ).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'glb_stats.csv';
  a.click();
  URL.revokeObjectURL(url);
}

// ============================================================
// TileCard: individual GLB viewer card
// ============================================================

function TileCard({
  tile, limits, onRemove, onSolo, onStatsReady,
}) {
  const stageRef = useRef(null);
  const sceneRef = useRef(null);
  const cameraRef = useRef(null);
  const controlsRef = useRef(null);
  const rootRef = useRef(null);
  const mixerRef = useRef(null);
  const actionRef = useRef(null);
  const skelRef = useRef(null);
  const gridHelperRef = useRef(null);
  const readyRef = useRef(false);

  // DOM refs for direct update from render loop (no setState per frame)
  const timeLabelRef = useRef(null);
  const progFillRef = useRef(null);

  const [geo, setGeo] = useState(null);
  const [cs, setCs] = useState(null); // clipStats[]
  const [clips, setClips] = useState([]);
  const [clipIndex, setClipIndex] = useState(0);
  const [dur, setDur] = useState(0);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // expose data to parent
  useEffect(() => {
    tile.geo = geo;
    tile.clipStats = cs;
    tile.clips = clips;
    tile.clipIndex = clipIndex;
    tile.dur = dur;
    if (geo) onStatsReady();
  }, [geo, cs, clips, clipIndex, dur, tile, onStatsReady]);

  // init scene & load model
  useEffect(() => {
    if (!stageRef.current || !tile.file) return;

    const stage = stageRef.current;
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x666a72, 0.85);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.45);
    fill.position.set(-3, 1.5, -2.5);
    scene.add(fill);

    const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 1000);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, stage);
    controls.enableDamping = true;
    controls.dampingFactor = 0.12;
    controlsRef.current = controls;

    // load
    const loader = createLoader();
    const fileUrl = URL.createObjectURL(tile.file);

    loader.load(
      fileUrl,
      (gltf) => {
        URL.revokeObjectURL(fileUrl);
        const root = gltf.scene || gltf.scenes?.[0];
        if (!root) {
          setError('シーンが入っていません');
          setLoading(false);
          return;
        }

        rootRef.current = root;
        scene.add(root);

        // frame camera
        const box = new THREE.Box3().setFromObject(root);
        if (!isFinite(box.min.x)) box.setFromCenterAndSize(new THREE.Vector3(), new THREE.Vector3(1, 1, 1));
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z) || 1;
        const fov = camera.fov * Math.PI / 180;
        const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.6;

        tile.radius = dist;
        camera.near = Math.max(dist / 500, 0.001);
        camera.far = dist * 100;
        camera.updateProjectionMatrix();
        controls.target.copy(center);
        camera.position.copy(center).add(new THREE.Vector3(0.55, 0.32, 1).normalize().multiplyScalar(dist));
        controls.update();

        // grid helper
        const gh = new THREE.GridHelper(maxDim * 4, 16, 0x8b9099, 0x8b9099);
        gh.material.opacity = 0.28;
        gh.material.transparent = true;
        gh.position.y = box.min.y;
        gridHelperRef.current = gh;
        scene.add(gh);

        // skeleton helper
        const skel = new THREE.SkeletonHelper(root);
        skel.visible = false;
        skelRef.current = skel;
        scene.add(skel);

        // stats
        const g = geoStats(root);
        setGeo(g);

        const animClips = gltf.animations || [];
        setClips(animClips);
        const csArr = animClips.map(clipStats);
        setCs(csArr);

        if (animClips.length > 0) {
          const mixer = new THREE.AnimationMixer(root);
          mixerRef.current = mixer;
          const action = mixer.clipAction(animClips[0]);
          action.setLoop(THREE.LoopRepeat, Infinity);
          action.clampWhenFinished = false;
          action.play();
          action.paused = true;
          actionRef.current = action;
          setDur(animClips[0].duration);
          setClipIndex(0);
        }

        readyRef.current = true;
        setLoading(false);
      },
      undefined,
      (err) => {
        URL.revokeObjectURL(fileUrl);
        const raw = String(err?.message || err || '不明なエラー');
        let msg;
        if (/draco/i.test(raw)) msg = 'Draco圧縮のGLBは開けません';
        else if (/meshopt/i.test(raw)) msg = 'Meshopt圧縮のGLBは開けません';
        else msg = '読み込めませんでした\n' + raw;
        setError(msg);
        setLoading(false);
      },
    );

    return () => {
      controlsRef.current?.dispose();
      if (rootRef.current) {
        rootRef.current.traverse((o) => {
          if (o.geometry) o.geometry.dispose();
          if (o.material) {
            const ms = Array.isArray(o.material) ? o.material : [o.material];
            ms.forEach((m) => {
              for (const k in m) { const v = m[k]; if (v?.isTexture) v.dispose(); }
              m.dispose();
            });
          }
        });
      }
    };
  }, [tile]);

  // expose refs for render loop
  useEffect(() => {
    tile.sceneRef = sceneRef;
    tile.cameraRef = cameraRef;
    tile.controlsRef = controlsRef;
    tile.stageRef = stageRef;
    tile.mixerRef = mixerRef;
    tile.actionRef = actionRef;
    tile.readyRef = readyRef;
    tile.timeLabelRef = timeLabelRef;
    tile.progFillRef = progFillRef;
  }, [tile]);

  // clip selection
  const handleClipChange = useCallback((e) => {
    const idx = parseInt(e.target.value, 10);
    if (!mixerRef.current || !clips[idx]) return;
    if (actionRef.current) actionRef.current.stop();
    const clip = clips[idx];
    const action = mixerRef.current.clipAction(clip);
    action.setLoop(THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = false;
    action.play();
    action.paused = true;
    actionRef.current = action;
    setDur(clip.duration);
    setClipIndex(idx);
  }, [clips]);

  const handleFit = useCallback(() => {
    if (!rootRef.current || !cameraRef.current || !controlsRef.current) return;
    const box = new THREE.Box3().setFromObject(rootRef.current);
    if (!isFinite(box.min.x)) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    const fov = cameraRef.current.fov * Math.PI / 180;
    const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.6;
    controlsRef.current.target.copy(center);
    cameraRef.current.position.copy(center).add(new THREE.Vector3(0.55, 0.32, 1).normalize().multiplyScalar(dist));
    controlsRef.current.update();
  }, []);

  // compute over
  const over = overList(geo, cs, clipIndex, limits);
  const isOver = over.length > 0;

  const currentCs = cs?.[clipIndex];
  const keyValue = currentCs
    ? (limits.keyMode === 'total' ? currentCs.total : currentCs.uniq)
    : 0;

  return (
    <section
      className={`${styles.card} ${isOver ? styles.cardOver : ''}`}
      title={isOver ? 'しきい値超過: ' + over.join('・') : ''}
    >
      <div className={styles.cardHead}>
        <span className={styles.cardName} title={tile.name}>{tile.name}</span>
        <button className={styles.cardBtn} onClick={handleFit} title="カメラを初期位置へ">画角</button>
        <button className={styles.cardBtn} onClick={() => onSolo(tile)} title="大きく見る">拡大</button>
        <button className={styles.cardBtn} onClick={() => onRemove(tile)} title="外す">×</button>
      </div>

      <div className={styles.stage} ref={stageRef}>
        {loading && <div className={styles.stageStatus}>読み込み中…</div>}
        {error && <div className={`${styles.stageStatus} ${styles.stageStatusError}`}>{error}</div>}
      </div>

      <div className={styles.cardFoot}>
        <div className={styles.footRow}>
          <select
            className={styles.clipSelect}
            value={clipIndex}
            onChange={handleClipChange}
            disabled={clips.length === 0}
          >
            {clips.length === 0 && <option>アニメーションなし</option>}
            {clips.map((c, i) => (
              <option key={i} value={i}>
                {(c.name || `クリップ ${i + 1}`)}  {c.duration.toFixed(2)}秒
              </option>
            ))}
          </select>
          <span className={styles.timeLabel} ref={timeLabelRef}>
            {dur > 0 ? `0.00 / ${dur.toFixed(2)}秒` : '静止'}
          </span>
        </div>

        <div className={styles.progBar}>
          <span className={styles.progFill} ref={progFillRef} />
        </div>

        {geo && (
          <div className={styles.stats}>
            <span
              className={over.includes('ポリゴン') ? styles.statOver : undefined}
              title={`三角ポリゴン数（メッシュ ${fmt(geo.meshes)} 個 / 頂点 ${fmt(geo.vert)}${geo.morphs ? ` / モーフ ${fmt(geo.morphs)}` : ''}）`}
            >
              ポリゴン <b>{fmt(geo.tri)}</b>
            </span>
            <span
              className={over.includes('ボーン') ? styles.statOver : undefined}
              title={`ボーン総数（スキンジョイント ${fmt(geo.joints)} / スキンメッシュ ${fmt(geo.skinned)} 個）`}
            >
              ボーン <b>{fmt(geo.bones)}</b>
            </span>
            <span
              className={over.includes('キーフレーム') ? styles.statOver : undefined}
              title={currentCs
                ? `チャンネル ${fmt(currentCs.tracks)} 本 / キー総数 ${fmt(currentCs.total)} / 長さ ${currentCs.duration.toFixed(2)} 秒`
                : 'アニメーションなし'
              }
            >
              キー <b>{currentCs ? fmt(keyValue) : 'なし'}</b>
              {currentCs && currentCs.fps > 0.5 && `（${currentCs.fps.toFixed(currentCs.fps < 10 ? 1 : 0)}fps相当）`}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

// ============================================================
// Main: GLBContactSheet
// ============================================================

export default function GLBContactSheet() {
  const [tiles, setTiles] = useState([]);
  const [limits, setLimits] = useState({ tri: 30000, bones: 60, keys: 3000, keyMode: 'uniq' });
  const [showLimits, setShowLimits] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mode, setMode] = useState('sec'); // sec | norm
  const [cardSize, setCardSize] = useState('360');
  const [soloTile, setSoloTile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [maxDur, setMaxDur] = useState(0);
  const [statsVersion, setStatsVersion] = useState(0);

  const canvasRef = useRef(null);
  const rendererRef = useRef(null);
  const clockRef = useRef(null);
  const tilesRef = useRef(tiles);
  const playRef = useRef({ playing, speed, mode, time: 0, u: 0, maxDur: 0 });
  const fileInputRef = useRef(null);
  const animIdRef = useRef(null);
  const soloRef = useRef(null);

  // DOM refs for global seek bar (direct update, no setState per frame)
  const scrubRef = useRef(null);
  const clockLabelRef = useRef(null);

  useEffect(() => { tilesRef.current = tiles; }, [tiles]);
  useEffect(() => {
    playRef.current.playing = playing;
    playRef.current.speed = speed;
    playRef.current.mode = mode;
  }, [playing, speed, mode]);
  useEffect(() => { soloRef.current = soloTile; }, [soloTile]);

  // recalc maxDur
  useEffect(() => {
    let m = 0;
    tiles.forEach((t) => { if (t.dur > m) m = t.dur; });
    setMaxDur(m);
    playRef.current.maxDur = m;
  }, [tiles.map((t) => t.dur).join(',')]);

  // init renderer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0);
    renderer.autoClear = true;
    rendererRef.current = renderer;

    const clock = new THREE.Clock();
    clockRef.current = clock;

    const resize = () => {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    };
    resize();
    window.addEventListener('resize', resize);

    let uiTick = 0;

    // render loop
    const frame = () => {
      animIdRef.current = requestAnimationFrame(frame);
      const dt = clock.getDelta();
      const ps = playRef.current;

      // advance time
      if (ps.playing && ps.maxDur > 0) {
        if (ps.mode === 'sec') {
          ps.time = (ps.time + dt * ps.speed) % ps.maxDur;
          ps.u = ps.time / ps.maxDur;
        } else {
          ps.u = (ps.u + (dt * ps.speed) / ps.maxDur) % 1;
          ps.time = ps.u * ps.maxDur;
        }
      }

      // apply times to all tiles & update their DOM directly
      const currentTiles = tilesRef.current;
      for (let i = 0; i < currentTiles.length; i++) {
        const t = currentTiles[i];
        if (!t.readyRef?.current || !t.mixerRef?.current || !t.actionRef?.current || t.dur <= 0) continue;
        const local = ps.mode === 'norm'
          ? ps.u * t.dur
          : (ps.time % t.dur);
        t.actionRef.current.time = local;
        t.mixerRef.current.update(0);
        t.localTime = local;
      }

      // render all visible tiles
      const w = window.innerWidth, h = window.innerHeight;
      renderer.setScissorTest(false);
      renderer.clear();

      const list = soloRef.current ? [soloRef.current] : currentTiles;
      for (let i = 0; i < list.length; i++) {
        const t = list[i];
        if (!t.readyRef?.current || !t.sceneRef?.current || !t.stageRef?.current) continue;
        const r = t.stageRef.current.getBoundingClientRect();
        if (r.bottom < 0 || r.top > h || r.right < 0 || r.left > w || r.width < 4 || r.height < 4) continue;

        t.controlsRef.current?.update();

        const left = r.left, bottom = h - r.bottom;
        renderer.setScissorTest(true);
        renderer.setViewport(left, bottom, r.width, r.height);
        renderer.setScissor(left, bottom, r.width, r.height);
        t.cameraRef.current.aspect = r.width / r.height;
        t.cameraRef.current.updateProjectionMatrix();
        renderer.render(t.sceneRef.current, t.cameraRef.current);
      }
      renderer.setScissorTest(false);

      // update UI labels via direct DOM manipulation (~12fps, not every frame)
      uiTick += dt;
      if (uiTick > 0.08) {
        uiTick = 0;

        // global seek bar
        if (scrubRef.current) {
          scrubRef.current.value = String(Math.round(ps.u * 1000));
        }
        if (clockLabelRef.current) {
          clockLabelRef.current.textContent = ps.mode === 'sec'
            ? `${ps.time.toFixed(2)} / ${ps.maxDur.toFixed(2)} 秒`
            : `${(ps.u * 100).toFixed(1)} %`;
        }

        // per-tile time label & progress bar
        for (let i = 0; i < currentTiles.length; i++) {
          const t = currentTiles[i];
          if (t.dur <= 0) continue;
          const lt = t.localTime || 0;
          if (t.timeLabelRef?.current) {
            t.timeLabelRef.current.textContent = `${lt.toFixed(2)} / ${t.dur.toFixed(2)}秒`;
          }
          if (t.progFillRef?.current) {
            t.progFillRef.current.style.width = `${(lt / t.dur) * 100}%`;
          }
        }
      }
    };
    requestAnimationFrame(frame);

    return () => {
      window.removeEventListener('resize', resize);
      if (animIdRef.current) cancelAnimationFrame(animIdRef.current);
      renderer.dispose();
    };
  }, []);

  // add files
  const addFiles = useCallback((fileList) => {
    const files = Array.from(fileList).filter((f) => /\.(glb|gltf)$/i.test(f.name));
    if (!files.length) return;
    files.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    const newTiles = files.map((f) => ({
      id: Date.now() + Math.random(),
      name: f.name,
      file: f,
      geo: null,
      clipStats: null,
      clips: [],
      clipIndex: 0,
      dur: 0,
      radius: 1,
      localTime: 0,
    }));

    setTiles((prev) => [...prev, ...newTiles]);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (e.dataTransfer?.files) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleFileInput = useCallback((e) => {
    if (e.target.files) addFiles(e.target.files);
    e.target.value = '';
  }, [addFiles]);

  const removeTile = useCallback((tile) => {
    if (soloTile === tile) setSoloTile(null);
    setTiles((prev) => prev.filter((t) => t !== tile));
  }, [soloTile]);

  const toggleSolo = useCallback((tile) => {
    setSoloTile((prev) => prev === tile ? null : tile);
  }, []);

  const clearAll = useCallback(() => {
    setSoloTile(null);
    setTiles([]);
    playRef.current.time = 0;
    playRef.current.u = 0;
  }, []);

  const handleScrub = useCallback((e) => {
    const u = parseInt(e.target.value, 10) / 1000;
    playRef.current.u = u;
    playRef.current.time = u * playRef.current.maxDur;
  }, []);

  const handleRewind = useCallback(() => {
    playRef.current.time = 0;
    playRef.current.u = 0;
  }, []);

  const handleLimitChange = useCallback((field, value) => {
    setLimits((prev) => ({ ...prev, [field]: value }));
  }, []);

  // called by each TileCard when its stats finish loading
  const handleStatsReady = useCallback(() => {
    setStatsVersion((v) => v + 1);
  }, []);

  // over count — recalculated when tiles/limits change or any tile finishes loading (statsVersion bumps re-render)
  void statsVersion; // ensure statsVersion triggers recalculation
  const overCount = tiles.filter((t) => t.geo && overList(t.geo, t.clipStats, t.clipIndex, limits).length > 0).length;

  return (
    <div
      className={styles.container}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
    >
      {/* shared WebGL canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'fixed', inset: 0, width: '100%', height: '100%',
          pointerEvents: 'none', zIndex: soloTile ? 25 : 5,
        }}
      />

      <div className={styles.header}>
        <h1 className={styles.title}>GLB一括プレビュー</h1>
        <p className={styles.description}>GLBファイルをまとめて表示・比較 — しきい値超過は赤枠で警告</p>
      </div>

      {/* toolbar */}
      <div className={styles.toolbar}>
        <button className={styles.btnPrimary} onClick={() => fileInputRef.current?.click()}>
          ファイルを追加
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".glb,.gltf"
          multiple
          className={styles.fileInput}
          onChange={handleFileInput}
        />

        <button
          className={styles.btn}
          onClick={() => setPlaying((p) => !p)}
          style={{ minWidth: 80 }}
        >
          {playing ? '■ 停止' : '▶ 再生'}
        </button>
        <button className={styles.btn} onClick={handleRewind}>⏮ 先頭</button>

        <span className={styles.fieldLabel}>速度</span>
        <select className={styles.select} value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}>
          <option value="0.25">0.25×</option>
          <option value="0.5">0.5×</option>
          <option value="1">1×</option>
          <option value="2">2×</option>
        </select>

        <span className={styles.fieldLabel}>モード</span>
        <select className={styles.select} value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="sec">秒数</option>
          <option value="norm">進行率</option>
        </select>

        <span className={styles.fieldLabel}>サイズ</span>
        <select className={styles.select} value={cardSize} onChange={(e) => setCardSize(e.target.value)}>
          <option value="240">S</option>
          <option value="360">M</option>
          <option value="480">L</option>
          <option value="640">XL</option>
        </select>

        <div className={styles.toolbarSpacer} />

        <button
          className={`${styles.btn} ${showLimits ? styles.btnActive : ''}`}
          onClick={() => setShowLimits((v) => !v)}
        >
          しきい値
        </button>

        {overCount > 0 && (
          <span className={styles.overCount}>しきい値超過 {overCount} 件</span>
        )}

        {tiles.length > 0 && (
          <>
            <button className={styles.btn} onClick={() => exportCSV(tiles)}>CSV</button>
            <button className={styles.btn} onClick={clearAll}>全削除</button>
          </>
        )}
      </div>

      {/* limits panel */}
      {showLimits && (
        <div className={styles.limitsPanel}>
          <div className={styles.limitField}>
            <span className={styles.fieldLabel}>ポリゴン上限</span>
            <input
              type="number"
              className={styles.limitInput}
              value={limits.tri}
              onChange={(e) => handleLimitChange('tri', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className={styles.limitField}>
            <span className={styles.fieldLabel}>ボーン上限</span>
            <input
              type="number"
              className={styles.limitInput}
              value={limits.bones}
              onChange={(e) => handleLimitChange('bones', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className={styles.limitField}>
            <span className={styles.fieldLabel}>キー上限</span>
            <input
              type="number"
              className={styles.limitInput}
              value={limits.keys}
              onChange={(e) => handleLimitChange('keys', parseFloat(e.target.value) || 0)}
            />
          </div>
          <div className={styles.limitField}>
            <span className={styles.fieldLabel}>キー計算</span>
            <select
              className={styles.select}
              value={limits.keyMode}
              onChange={(e) => handleLimitChange('keyMode', e.target.value)}
            >
              <option value="uniq">ユニーク時刻</option>
              <option value="total">総数</option>
            </select>
          </div>
        </div>
      )}

      {/* seek bar — value is updated directly via ref from render loop */}
      {maxDur > 0 && (
        <div className={styles.seekBar}>
          <input
            type="range"
            className={styles.scrub}
            ref={scrubRef}
            min={0}
            max={1000}
            defaultValue={0}
            onChange={handleScrub}
          />
          <span className={styles.clock} ref={clockLabelRef}>
            0.00 / {maxDur.toFixed(2)} 秒
          </span>
        </div>
      )}

      {/* empty state drop zone */}
      {tiles.length === 0 && (
        <div
          className={`${styles.emptyDrop} ${dragOver ? styles.dragging : ''}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <svg className={styles.dropIcon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <span>GLBファイルをドラッグ＆ドロップ</span>
          <span style={{ fontSize: '0.85rem', color: '#64748b' }}>またはクリックして選択</span>
        </div>
      )}

      {/* grid */}
      <div
        className={styles.grid}
        style={{ '--card-min': cardSize + 'px' }}
      >
        {tiles.map((tile) => (
          <TileCard
            key={tile.id}
            tile={tile}
            limits={limits}
            onRemove={removeTile}
            onSolo={toggleSolo}
            onStatsReady={handleStatsReady}
          />
        ))}
      </div>
    </div>
  );
}
