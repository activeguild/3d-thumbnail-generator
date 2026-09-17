'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import styles from './GLBAutoFix.module.css';

function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

function getSeverityLabel(severity) {
  switch (severity) {
    case 0: return 'Error';
    case 1: return 'Warning';
    case 2: return 'Info';
    case 3: return 'Hint';
    default: return 'Unknown';
  }
}

function getSeverityClass(severity) {
  switch (severity) {
    case 0: return styles.severityError;
    case 1: return styles.severityWarning;
    case 2: return styles.severityInfo;
    case 3: return styles.severityHint;
    default: return '';
  }
}

export default function GLBAutoFix() {
  const [file, setFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef(null);
  const validatorRef = useRef(null);

  useEffect(() => {
    import('gltf-validator').then((module) => {
      validatorRef.current = module;
    }).catch((err) => {
      console.error('Failed to load gltf-validator:', err);
    });
  }, []);

  const handleFile = useCallback((f) => {
    if (f && f.name.toLowerCase().endsWith('.glb')) {
      setFile(f);
      setResult(null);
      setValidationResult(null);
      setError(null);
      setExpanded(false);
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

  const validateBlob = useCallback(async (blob, fileName) => {
    if (!validatorRef.current) return null;
    try {
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const report = await validatorRef.current.validateBytes(uint8Array);
      return {
        fileName,
        fileSize: blob.size,
        issues: report.issues,
        info: report.info,
      };
    } catch (err) {
      return {
        fileName,
        error: err.message,
        issues: { numErrors: 1, numWarnings: 0, numInfos: 0, numHints: 0, messages: [{ message: err.message, severity: 0 }] }
      };
    }
  }, []);

  const downloadBlob = useCallback((blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  const handleFix = useCallback(async () => {
    if (!file) return;

    setProcessing(true);
    setError(null);
    setResult(null);
    setValidationResult(null);
    setExpanded(false);

    try {
      const { autoFixGLB } = await import('@/components/processors/glbAutoFix');

      const options = {
        applyTransforms: true,
        fixArmatureTransforms: true,
        normalizeNormals: true,
        removeUnused: true,
      };

      const blob = await autoFixGLB(file, options);
      const fixedResult = { blob, size: blob.size };
      setResult(fixedResult);

      // Auto-download
      const fixedName = file.name.replace('.glb', '_fixed.glb');
      downloadBlob(blob, fixedName);

      // Run validation
      setValidating(true);
      const vResult = await validateBlob(blob, fixedName);
      setValidationResult(vResult);
      setValidating(false);
    } catch (err) {
      console.error('Auto fix failed:', err);
      setError(`Processing failed: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  }, [file, downloadBlob, validateBlob]);

  const handleDownload = useCallback(() => {
    if (!result) return;
    downloadBlob(result.blob, file.name.replace('.glb', '_fixed.glb'));
  }, [result, file, downloadBlob]);

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
              onClick={() => { setFile(null); setResult(null); setValidationResult(null); setError(null); }}
            >
              ✕
            </button>
          </div>
        )}

        <button
          className={styles.fixButton}
          disabled={!file || processing}
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

            {validating && (
              <div className={styles.validating}>Validating...</div>
            )}

            {validationResult && (
              <div className={styles.validationSection}>
                <div
                  className={styles.validationHeader}
                  onClick={() => {
                    const hasMessages = validationResult.issues?.messages?.length > 0;
                    if (hasMessages) setExpanded(prev => !prev);
                  }}
                >
                  <div className={styles.validationTitle}>
                    Validation Result
                    {validationResult.issues?.messages?.length > 0 && (
                      <span className={styles.expandIcon}>{expanded ? '▼' : '▶'}</span>
                    )}
                  </div>
                  <div className={styles.badges}>
                    {validationResult.issues?.numErrors > 0 && (
                      <span className={`${styles.badge} ${styles.badgeError}`}>
                        {validationResult.issues.numErrors} Error{validationResult.issues.numErrors > 1 ? 's' : ''}
                      </span>
                    )}
                    {validationResult.issues?.numWarnings > 0 && (
                      <span className={`${styles.badge} ${styles.badgeWarning}`}>
                        {validationResult.issues.numWarnings} Warning{validationResult.issues.numWarnings > 1 ? 's' : ''}
                      </span>
                    )}
                    {validationResult.issues?.numInfos > 0 && (
                      <span className={`${styles.badge} ${styles.badgeInfo}`}>
                        {validationResult.issues.numInfos} Info{validationResult.issues.numInfos > 1 ? 's' : ''}
                      </span>
                    )}
                    {validationResult.issues?.numHints > 0 && (
                      <span className={`${styles.badge} ${styles.badgeHint}`}>
                        {validationResult.issues.numHints} Hint{validationResult.issues.numHints > 1 ? 's' : ''}
                      </span>
                    )}
                    {validationResult.issues?.numErrors === 0 && validationResult.issues?.numWarnings === 0 &&
                     validationResult.issues?.numInfos === 0 && validationResult.issues?.numHints === 0 && (
                      <span className={`${styles.badge} ${styles.badgeSuccess}`}>Valid</span>
                    )}
                  </div>
                </div>

                {validationResult.info && (
                  <div className={styles.modelInfo}>
                    <span>Generator: {validationResult.info.generator || 'Unknown'}</span>
                    {validationResult.info.version && <span>glTF {validationResult.info.version}</span>}
                  </div>
                )}

                {expanded && validationResult.issues?.messages?.length > 0 && (
                  <div className={styles.messageList}>
                    {validationResult.issues.messages.map((msg, idx) => (
                      <div key={idx} className={`${styles.message} ${getSeverityClass(msg.severity)}`}>
                        <span className={styles.messageLabel}>{getSeverityLabel(msg.severity)}</span>
                        <span className={styles.messageText}>{msg.message}</span>
                        {msg.pointer && (
                          <span className={styles.messagePointer}>{msg.pointer}</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
