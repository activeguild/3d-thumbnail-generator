'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import styles from './CameraDrawer.module.css';

const ModelPreview = dynamic(() => import('@/components/ModelPreview'), {
  ssr: false,
  loading: () => (
    <div style={{ width: 300, height: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f7fafc', borderRadius: '8px' }}>
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

  // Sync localParams when drawer opens with new params
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setLocalParams({
        horizontalAngle: cameraParams.horizontalAngle,
        verticalAngle: cameraParams.verticalAngle,
        zoom: cameraParams.zoom,
      });
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, cameraParams.horizontalAngle, cameraParams.verticalAngle, cameraParams.zoom]);

  const handlePreviewChange = useCallback((params) => {
    setLocalParams(params);
  }, []);

  const handleSliderChange = useCallback((key, value) => {
    setLocalParams((prev) => ({ ...prev, [key]: value }));
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
              <span className={styles.sliderValue}>{(localParams.offsetX || 0).toFixed(0)}</span>
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
              <span className={styles.sliderValue}>{(localParams.offsetY || 0).toFixed(0)}</span>
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
            {regenerating ? 'Regenerating...' : 'Regenerate with this angle'}
          </button>
        </div>
      </div>
    </>
  );
}
