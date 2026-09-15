'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './GLBAutoFix.module.css';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

export default function GLBAutoFix() {
  const [file, setFile] = useState(null);
  const [options, setOptions] = useState({
    applyTransforms: true,
    fixArmatureTransforms: true,
    generateTangents: true,
    removeUnused: true,
  });
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleFile = useCallback((f) => {
    if (f && f.name.toLowerCase().endsWith('.glb')) {
      setFile(f);
      setResult(null);
      setError(null);
    }
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files[0];
    handleFile(f);
  }, [handleFile]);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragActive(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragActive(false);
  }, []);

  const handleFix = useCallback(async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setResult(null);

    try {
      const { autoFixGLB } = await import('@/components/processors/glbAutoFix');

      const hasOption = options.applyTransforms || options.fixArmatureTransforms || options.generateTangents || options.removeUnused;
      if (!hasOption) {
        setError('No fix options selected.');
        return;
      }

      const blob = await autoFixGLB(file, options);
      setResult({ blob, size: blob.size });
    } catch (err) {
      console.error('Auto fix failed:', err);
      setError(`Processing failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [file, options]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name.replace('.glb', '_fixed.glb');
    a.click();
    URL.revokeObjectURL(url);
  }, [result, file]);

  const hasAnyOption = options.applyTransforms || options.fixArmatureTransforms || options.generateTangents || options.removeUnused;

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h1 className={styles.title}>3D Auto Fix</h1>
        <p className={styles.description}>
          Automatically fix common issues in GLB files
        </p>
      </div>

      <div className={styles.content}>
        {!file ? (
          <div
            className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".glb"
              className={styles.fileInput}
              onChange={(e) => handleFile(e.target.files[0])}
            />
            <div className={styles.dropZoneLabel}>
              <svg className={styles.dropIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Drop a GLB file here</span>
              <span className={styles.browseText}>
                or <span className={styles.browseLinkText}>browse</span>
              </span>
            </div>
          </div>
        ) : (
          <div className={styles.fileInfo}>
            <div>
              <div className={styles.fileName}>{file.name}</div>
              <div className={styles.fileSize}>{formatFileSize(file.size)}</div>
            </div>
            <button
              className={styles.removeButton}
              onClick={() => { setFile(null); setResult(null); setError(null); }}
            >
              ✕
            </button>
          </div>
        )}

        <div className={styles.optionsSection}>
          <h3 className={styles.optionsTitle}>Fix Options</h3>
          <div className={styles.optionItem}>
            <input
              type="checkbox"
              id="fixArmatureTransforms"
              checked={options.fixArmatureTransforms}
              onChange={(e) => setOptions(prev => ({ ...prev, fixArmatureTransforms: e.target.checked }))}
            />
            <label htmlFor="fixArmatureTransforms" className={styles.optionLabel}>
              <span className={styles.optionName}>Fix Armature Transforms</span>
              <span className={styles.optionDesc}>
                Push non-identity transforms from skinned mesh ancestors down to children,
                and re-parent skinned meshes to scene root.
                Fixes USD/UsdSkel double-apply issues.
              </span>
            </label>
          </div>
          <div className={styles.optionItem}>
            <input
              type="checkbox"
              id="applyTransforms"
              checked={options.applyTransforms}
              onChange={(e) => setOptions(prev => ({ ...prev, applyTransforms: e.target.checked }))}
            />
            <label htmlFor="applyTransforms" className={styles.optionLabel}>
              <span className={styles.optionName}>Apply Transforms</span>
              <span className={styles.optionDesc}>
                Bake all node transforms into mesh vertices and reset TRS to identity.
                Fixes parent-child transform misalignment issues. Supports skinned meshes.
              </span>
            </label>
          </div>
          <div className={styles.optionItem}>
            <input
              type="checkbox"
              id="generateTangents"
              checked={options.generateTangents}
              onChange={(e) => setOptions(prev => ({ ...prev, generateTangents: e.target.checked }))}
            />
            <label htmlFor="generateTangents" className={styles.optionLabel}>
              <span className={styles.optionName}>Generate Tangents</span>
              <span className={styles.optionDesc}>
                Generate missing tangent vectors for meshes with normal maps (MikkTSpace).
                Ensures portable tangent space across renderers.
              </span>
            </label>
          </div>
          <div className={styles.optionItem}>
            <input
              type="checkbox"
              id="removeUnused"
              checked={options.removeUnused}
              onChange={(e) => setOptions(prev => ({ ...prev, removeUnused: e.target.checked }))}
            />
            <label htmlFor="removeUnused" className={styles.optionLabel}>
              <span className={styles.optionName}>Remove Unused Objects</span>
              <span className={styles.optionDesc}>
                Remove unreferenced nodes, meshes, materials, textures, and accessors.
              </span>
            </label>
          </div>
        </div>

        <button
          className={styles.fixButton}
          disabled={!file || !hasAnyOption || processing}
          onClick={handleFix}
        >
          {processing ? 'Processing...' : 'Fix'}
        </button>

        {processing && (
          <div className={styles.processing}>Processing GLB file...</div>
        )}

        {error && (
          <div className={styles.errorSection}>{error}</div>
        )}

        {result && (
          <div className={styles.resultSection}>
            <h3 className={styles.resultTitle}>Fix Complete</h3>
            <div className={styles.resultInfo}>
              {formatFileSize(file.size)} → {formatFileSize(result.size)}
            </div>
            <button className={styles.downloadButton} onClick={handleDownload}>
              Download Fixed GLB
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
