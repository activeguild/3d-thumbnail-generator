'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import styles from './CameraDrawer.module.css';

const ModelPreview = dynamic(() => import('@/components/ModelPreview'), {
  ssr: false,
  loading: () => (
    <div style={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#1a1a2e', borderRadius: '8px', color: '#94a3b8' }}>
      Loading preview...
    </div>
  ),
});

export default function CameraDrawer({
  isOpen,
  onClose,
  file,
  backgroundColor,
  cameraParams,
  onRegenerate,
  regenerating,
}) {
  const [localParams, setLocalParams] = useState(cameraParams);
  const prevIsOpenRef = useRef(false);
  const ignorePreviewRef = useRef(false);

  // Sync localParams when drawer opens with new params
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setLocalParams({ ...cameraParams });
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close drawer when regeneration completes
  const prevRegeneratingRef = useRef(false);
  useEffect(() => {
    if (prevRegeneratingRef.current && !regenerating) {
      onClose();
    }
    prevRegeneratingRef.current = regenerating;
  }, [regenerating, onClose]);

  const handlePreviewChange = useCallback((params) => {
    if (ignorePreviewRef.current) return;
    setLocalParams((prev) => ({
      ...prev,
      horizontalAngle: params.horizontalAngle,
      verticalAngle: params.verticalAngle,
      zoom: params.zoom,
    }));
  }, []);

  const handleSliderChange = useCallback((key, value) => {
    ignorePreviewRef.current = true;
    setLocalParams((prev) => ({ ...prev, [key]: value }));
    setTimeout(() => { ignorePreviewRef.current = false; }, 100);
  }, []);

  const handleRegenerate = () => {
    onRegenerate(localParams);
  };

  return (
    <>
      <div
        className={`${styles.overlay} ${isOpen ? styles.open : ''}`}
        onClick={onClose}
      />
      <div className={`${styles.drawer} ${isOpen ? styles.open : ''}`}>
        <div className={styles.header}>
          <span className={styles.headerTitle}>Camera Settings</span>
          <button className={styles.closeButton} onClick={onClose}>
            &times;
          </button>
        </div>
        <div className={styles.body}>
          {isOpen && file && file.name?.endsWith('.glb') && (
            <div className={styles.previewContainer}>
              <ModelPreview
                file={file}
                backgroundColor={backgroundColor}
                cameraParams={localParams}
                onChange={handlePreviewChange}
              />
            </div>
          )}

          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Horizontal Angle
              <span className={styles.sliderValue}>{localParams.horizontalAngle}°</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="0"
              max="360"
              step="1"
              value={localParams.horizontalAngle}
              onChange={(e) => handleSliderChange('horizontalAngle', Number(e.target.value))}
            />
          </div>

          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Vertical Angle
              <span className={styles.sliderValue}>{localParams.verticalAngle}°</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="0"
              max="90"
              step="1"
              value={localParams.verticalAngle}
              onChange={(e) => handleSliderChange('verticalAngle', Number(e.target.value))}
            />
          </div>

          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Offset X
              <span className={styles.sliderValue}>{localParams.offsetX || 0}</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="-200"
              max="200"
              step="1"
              value={localParams.offsetX || 0}
              onChange={(e) => handleSliderChange('offsetX', Number(e.target.value))}
            />
          </div>

          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Offset Y
              <span className={styles.sliderValue}>{localParams.offsetY || 0}</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="-200"
              max="200"
              step="1"
              value={localParams.offsetY || 0}
              onChange={(e) => handleSliderChange('offsetY', Number(e.target.value))}
            />
          </div>

          <div className={styles.sliderGroup}>
            <label className={styles.sliderLabel}>
              Zoom
              <span className={styles.sliderValue}>{localParams.zoom.toFixed(1)}x</span>
            </label>
            <input
              type="range"
              className={styles.slider}
              min="0.5"
              max="3.0"
              step="0.1"
              value={localParams.zoom}
              onChange={(e) => handleSliderChange('zoom', Number(e.target.value))}
            />
          </div>

          <button
            className={styles.regenerateButton}
            onClick={handleRegenerate}
            disabled={regenerating}
          >
            {regenerating ? (
              <span className={styles.regeneratingContent}>
                <span className={styles.regeneratingSpinner} />
                Regenerating...
              </span>
            ) : (
              'Regenerate with this angle'
            )}
          </button>
        </div>
      </div>
    </>
  );
}
