'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import JSZip from 'jszip';
import styles from './page.module.css';

// Dynamic import to avoid SSR issues with Three.js
const ThreeDViewer = dynamic(() => import('@/components/ThreeDViewer'), {
  ssr: false,
  loading: () => <p>Loading 3D viewer...</p>
});

export default function Home() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files).filter(
        file => file.name.endsWith('.glb') || file.name.endsWith('.gltf')
      );

      if (fileList.length === 0) {
        setError('Please upload .glb or .gltf files');
        return;
      }

      setFiles(fileList);
      setError(null);
      setProcessing(true);
      setCurrentIndex(0);
      setResults([]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files).filter(
        file => file.name.endsWith('.glb') || file.name.endsWith('.gltf')
      );

      if (fileList.length === 0) {
        setError('Please upload .glb or .gltf files');
        return;
      }

      setFiles(fileList);
      setError(null);
      setProcessing(true);
      setCurrentIndex(0);
      setResults([]);
    }
  };

  const handleComplete = (blob, isAnimated, fileName) => {
    const newResults = [...results, { blob, fileName, isAnimated }];
    setResults(newResults);

    // Move to next file
    if (currentIndex + 1 < files.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All files processed, download
      downloadResults(newResults);
    }
  };

  const downloadResults = async (resultsList) => {
    if (resultsList.length === 1) {
      // Single file - direct download
      const { blob, fileName } = resultsList[0];
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = fileName.replace(/\.(glb|gltf)$/, '.png');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      // Multiple files - create ZIP
      const zip = new JSZip();

      for (const { blob, fileName } of resultsList) {
        const pngFileName = fileName.replace(/\.(glb|gltf)$/, '.png');
        zip.file(pngFileName, blob);
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
    }

    // Reset after download
    setTimeout(() => {
      setFiles([]);
      setProcessing(false);
      setCurrentIndex(0);
      setResults([]);
    }, 1000);
  };

  const handleError = (err) => {
    setError('Failed to process 3D model: ' + err.message);
    setFiles([]);
    setProcessing(false);
    setCurrentIndex(0);
    setResults([]);
  };

  const handleReset = () => {
    setFiles([]);
    setProcessing(false);
    setCurrentIndex(0);
    setResults([]);
    setError(null);
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>
          3D Thumbnail Generator
        </h1>

        <p className={styles.description}>
          Upload your 3D models (.glb or .gltf) to generate thumbnails
        </p>

        {!processing ? (
          <div className={styles.form}>
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
                accept=".glb,.gltf"
                multiple
                onChange={handleFileChange}
                className={styles.fileInput}
              />
              <label htmlFor="file-input" className={styles.dropZoneLabel}>
                <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Drag and drop your 3D files here</span>
                <span className={styles.or}>or</span>
                <span className={styles.browse}>Browse files</span>
                <span className={styles.multipleNote}>You can select multiple files</span>
              </label>
            </div>

            {error && (
              <div className={styles.error}>
                {error}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.result}>
            <div className={styles.progressInfo}>
              <h3>Processing Files</h3>
              <p className={styles.progressText}>
                File {currentIndex + 1} of {files.length}: {files[currentIndex]?.name}
              </p>
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${((currentIndex + 1) / files.length) * 100}%` }}
                />
              </div>
            </div>

            <ThreeDViewer
              key={currentIndex}
              file={files[currentIndex]}
              onComplete={handleComplete}
              onError={handleError}
            />

            <button
              onClick={handleReset}
              className={styles.resetButton}
              style={{ marginTop: '2rem' }}
            >
              Cancel
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
