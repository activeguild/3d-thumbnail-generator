'use client';

import { useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import JSZip from 'jszip';
import styles from './ThumbnailGenerator.module.css';

const ThreeDViewer = dynamic(() => import('@/components/ThreeDViewer'), {
  ssr: false,
  loading: () => null,
});

const CameraDrawer = dynamic(() => import('@/components/CameraDrawer'), {
  ssr: false,
  loading: () => null,
});

const DEFAULT_CAMERA = { horizontalAngle: 45, verticalAngle: 45, zoom: 1.0, offsetX: 0, offsetY: 0 };

export default function ThumbnailGenerator() {
  // items: [{ file, fileName, blob, thumbnailUrl, cameraParams, isAnimated, processing }]
  const [items, setItems] = useState([]);
  const [processingQueue, setProcessingQueue] = useState([]);
  const [currentProcessingIndex, setCurrentProcessingIndex] = useState(-1);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [backgroundColor, setBackgroundColor] = useState('#F2F6FF');
  const [backgroundConfig, setBackgroundConfig] = useState({
    gradient: false,
    color1: '#F2F6FF',
    color2: '#667eea',
    angle: 180,
  });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [regenerating, setRegenerating] = useState(false);
  const [regenerateKey, setRegenerateKey] = useState(0);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const startProcessing = (fileList) => {
    const newItems = fileList.map((file) => ({
      file,
      fileName: file.name,
      blob: null,
      thumbnailUrl: null,
      cameraParams: { ...DEFAULT_CAMERA },
      isAnimated: false,
      processing: true,
    }));

    const startIdx = items.length;
    setItems((prev) => [...prev, ...newItems]);

    const indices = newItems.map((_, i) => startIdx + i);
    setProcessingQueue((prev) => {
      const updated = [...prev, ...indices];
      if (currentProcessingIndex === -1) {
        setCurrentProcessingIndex(updated[0]);
      }
      return updated;
    });
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files).filter(
        (file) => file.name.endsWith('.glb') || file.name.endsWith('.png')
      );
      if (fileList.length === 0) {
        setError('Please upload .glb or .png files');
        return;
      }
      setError(null);
      startProcessing(fileList);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files).filter(
        (file) => file.name.endsWith('.glb') || file.name.endsWith('.png')
      );
      if (fileList.length === 0) {
        setError('Please upload .glb or .png files');
        return;
      }
      setError(null);
      startProcessing(fileList);
    }
  };

  const handleComplete = useCallback(
    (blob, isAnimated, fileName) => {
      const url = URL.createObjectURL(blob);

      setItems((prev) => {
        const idx = prev.findIndex(
          (item) => item.fileName === fileName && item.processing
        );
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = {
          ...updated[idx],
          blob,
          thumbnailUrl: url,
          isAnimated,
          processing: false,
        };
        return updated;
      });

      setProcessingQueue((prev) => {
        const next = prev.slice(1);
        if (next.length > 0) {
          setCurrentProcessingIndex(next[0]);
        } else {
          setCurrentProcessingIndex(-1);
        }
        return next;
      });
    },
    []
  );

  const handleError = useCallback((err) => {
    setError('Failed to process 3D model: ' + err.message);
    setProcessingQueue((prev) => {
      const next = prev.slice(1);
      if (next.length > 0) {
        setCurrentProcessingIndex(next[0]);
      } else {
        setCurrentProcessingIndex(-1);
      }
      return next;
    });
  }, []);

  const handleItemClick = (index) => {
    setSelectedIndex(index);
    setDrawerOpen(true);
  };

  const handleRegenerate = useCallback(
    (newParams) => {
      if (selectedIndex < 0) return;
      setRegenerating(true);
      setItems((prev) => {
        const updated = [...prev];
        updated[selectedIndex] = {
          ...updated[selectedIndex],
          cameraParams: { ...newParams },
          processing: true,
        };
        return updated;
      });
      setRegenerateKey((k) => k + 1);
    },
    [selectedIndex]
  );

  const handleRegenerateComplete = useCallback(
    (blob, isAnimated, fileName) => {
      const url = URL.createObjectURL(blob);
      setItems((prev) => {
        const updated = [...prev];
        if (updated[selectedIndex]) {
          if (updated[selectedIndex].thumbnailUrl) {
            URL.revokeObjectURL(updated[selectedIndex].thumbnailUrl);
          }
          updated[selectedIndex] = {
            ...updated[selectedIndex],
            blob,
            thumbnailUrl: url,
            isAnimated,
            processing: false,
          };
        }
        return updated;
      });
      setRegenerating(false);
    },
    [selectedIndex]
  );

  const handleRegenerateError = useCallback((err) => {
    setError('Failed to regenerate: ' + err.message);
    setRegenerating(false);
  }, []);

  const downloadSingle = (e, index) => {
    e.stopPropagation();
    const item = items[index];
    if (!item?.blob) return;
    const link = document.createElement('a');
    const url = URL.createObjectURL(item.blob);
    link.href = url;
    link.download = item.fileName.replace(/\.(glb)$/, '.png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadAll = async () => {
    const completedItems = items.filter((item) => item.blob);
    if (completedItems.length === 0) return;

    if (completedItems.length === 1) {
      const { blob, fileName } = completedItems[0];
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = fileName.replace(/\.(glb)$/, '.png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return;
    }

    const zip = new JSZip();
    for (const { blob, fileName } of completedItems) {
      zip.file(fileName.replace(/\.(glb)$/, '.png'), blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(zipBlob);
    link.href = url;
    link.download = 'thumbnails.zip';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const allComplete = items.length > 0 && items.every((item) => !item.processing);
  const hasItems = items.length > 0;
  const currentItem = currentProcessingIndex >= 0 ? items[currentProcessingIndex] : null;
  const selectedItem = selectedIndex >= 0 ? items[selectedIndex] : null;

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>3D Thumbnail Generator</h1>
        <p className={styles.description}>
          Upload your 3D models .glb or PNG images to generate thumbnails
        </p>

        <div className={styles.form}>
          <div className={styles.settingsPanel}>
            <div className={styles.bgToggle}>
              <button
                className={`${styles.bgToggleButton} ${!backgroundConfig.gradient ? styles.bgToggleActive : ''}`}
                onClick={() => setBackgroundConfig(prev => ({ ...prev, gradient: false }))}
              >
                Solid
              </button>
              <button
                className={`${styles.bgToggleButton} ${backgroundConfig.gradient ? styles.bgToggleActive : ''}`}
                onClick={() => setBackgroundConfig(prev => ({ ...prev, gradient: true }))}
              >
                Gradient
              </button>
            </div>

            {!backgroundConfig.gradient ? (
              <label className={styles.colorLabel}>
                <span>Background Color:</span>
                <div className={styles.colorInputWrapper}>
                  <input
                    type="color"
                    value={backgroundColor}
                    onChange={(e) => {
                      setBackgroundColor(e.target.value);
                      setBackgroundConfig(prev => ({ ...prev, color1: e.target.value }));
                    }}
                    className={styles.colorInput}
                  />
                  <input
                    type="text"
                    value={backgroundColor}
                    onChange={(e) => {
                      setBackgroundColor(e.target.value);
                      setBackgroundConfig(prev => ({ ...prev, color1: e.target.value }));
                    }}
                    className={styles.colorTextInput}
                    placeholder="#F2F6FF"
                  />
                </div>
              </label>
            ) : (
              <>
                <div className={styles.gradientPreview} style={{
                  background: `linear-gradient(${backgroundConfig.angle}deg, ${backgroundConfig.color1}, ${backgroundConfig.color2})`,
                }} />
                <label className={styles.colorLabel}>
                  <span>Color 1:</span>
                  <div className={styles.colorInputWrapper}>
                    <input
                      type="color"
                      value={backgroundConfig.color1}
                      onChange={(e) => setBackgroundConfig(prev => ({ ...prev, color1: e.target.value }))}
                      className={styles.colorInput}
                    />
                    <input
                      type="text"
                      value={backgroundConfig.color1}
                      onChange={(e) => setBackgroundConfig(prev => ({ ...prev, color1: e.target.value }))}
                      className={styles.colorTextInput}
                    />
                  </div>
                </label>
                <label className={styles.colorLabel}>
                  <span>Color 2:</span>
                  <div className={styles.colorInputWrapper}>
                    <input
                      type="color"
                      value={backgroundConfig.color2}
                      onChange={(e) => setBackgroundConfig(prev => ({ ...prev, color2: e.target.value }))}
                      className={styles.colorInput}
                    />
                    <input
                      type="text"
                      value={backgroundConfig.color2}
                      onChange={(e) => setBackgroundConfig(prev => ({ ...prev, color2: e.target.value }))}
                      className={styles.colorTextInput}
                    />
                  </div>
                </label>
                <label className={styles.colorLabel}>
                  <span>Angle: {backgroundConfig.angle}°</span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    value={backgroundConfig.angle}
                    onChange={(e) => setBackgroundConfig(prev => ({ ...prev, angle: Number(e.target.value) }))}
                    className={styles.angleSlider}
                  />
                </label>
              </>
            )}
          </div>

          <div
            className={`${styles.dropZone} ${dragActive ? styles.dragActive : ''}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <input
              type="file"
              id="file-input"
              accept=".glb,.png"
              multiple
              onChange={handleFileChange}
              className={styles.fileInput}
            />
            <label htmlFor="file-input" className={styles.dropZoneLabel}>
              <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <span>Drag and drop your 3D files here</span>
              <span className={styles.or}>or</span>
              <span className={styles.browse}>Browse files</span>
              <span className={styles.multipleNote}>You can select multiple files</span>
            </label>
          </div>

          {error && <div className={styles.error}>{error}</div>}
        </div>

        {hasItems && (
          <div className={styles.fileList}>
            <div className={styles.fileListHeader}>
              <span className={styles.fileListTitle}>
                {items.length} file{items.length > 1 ? 's' : ''}
              </span>
              <button
                className={styles.downloadAllButton}
                onClick={downloadAll}
                disabled={!allComplete}
              >
                Download All (ZIP)
              </button>
            </div>
            {items.map((item, index) => (
              <div
                key={`${item.fileName}-${index}`}
                className={`${styles.fileItem} ${selectedIndex === index ? styles.fileItemSelected : ''}`}
                onClick={() => handleItemClick(index)}
              >
                <div className={styles.thumbnailWrapper}>
                  {item.thumbnailUrl ? (
                    <img
                      src={item.thumbnailUrl}
                      alt={item.fileName}
                      className={styles.thumbnailImage}
                    />
                  ) : (
                    <div className={styles.thumbnailSpinner} />
                  )}
                </div>
                <div className={styles.fileInfo}>
                  <div className={styles.fileName}>{item.fileName}</div>
                  <div className={styles.cameraInfo}>
                    H:{item.cameraParams.horizontalAngle}° V:{item.cameraParams.verticalAngle}° Z:{item.cameraParams.zoom.toFixed(1)}x X:{item.cameraParams.offsetX || 0} Y:{item.cameraParams.offsetY || 0}
                  </div>
                </div>
                <button
                  className={styles.downloadButton}
                  onClick={(e) => downloadSingle(e, index)}
                  disabled={!item.blob}
                >
                  DL
                </button>
              </div>
            ))}
          </div>
        )}

        {currentItem && (
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
            <ThreeDViewer
              key={`batch-${currentProcessingIndex}`}
              file={currentItem.file}
              backgroundColor={backgroundColor}
              backgroundConfig={backgroundConfig}
              cameraParams={currentItem.cameraParams}
              onComplete={handleComplete}
              onError={handleError}
            />
          </div>
        )}

        {regenerating && selectedItem && (
          <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
            <ThreeDViewer
              key={`regen-${regenerateKey}`}
              file={selectedItem.file}
              backgroundColor={backgroundColor}
              backgroundConfig={backgroundConfig}
              cameraParams={selectedItem.cameraParams}
              onComplete={handleRegenerateComplete}
              onError={handleRegenerateError}
            />
          </div>
        )}

        <CameraDrawer
          isOpen={drawerOpen}
          onClose={() => setDrawerOpen(false)}
          file={selectedItem?.file}
          backgroundColor={backgroundColor}
          cameraParams={selectedItem?.cameraParams || DEFAULT_CAMERA}
          onRegenerate={handleRegenerate}
          regenerating={regenerating}
        />
      </main>
    </div>
  );
}
