'use client';

import { useState } from 'react';
import JSZip from 'jszip';
import { removeAnimationsFromGLB } from '@/components/processors/glbAnimationRemover';
import styles from './GLBProcessor.module.css';

export default function GLBProcessor() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [processingOptions, setProcessingOptions] = useState({
    removeAnimations: true,
    // Future options:
    // optimizeGeometry: false,
    // removeTextures: false,
  });

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
        file => file.name.endsWith('.glb')
      );

      if (fileList.length === 0) {
        setError('Please upload .glb files only');
        return;
      }

      setFiles(fileList);
      setError(null);
      startProcessing(fileList);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files).filter(
        file => file.name.endsWith('.glb')
      );

      if (fileList.length === 0) {
        setError('Please upload .glb files only');
        return;
      }

      setFiles(fileList);
      setError(null);
      startProcessing(fileList);
    }
  };

  const startProcessing = async (fileList) => {
    setProcessing(true);
    setCurrentIndex(0);
    setResults([]);

    const processedResults = [];

    for (let i = 0; i < fileList.length; i++) {
      setCurrentIndex(i);
      try {
        const processedBlob = await removeAnimationsFromGLB(fileList[i]);
        processedResults.push({
          blob: processedBlob,
          fileName: fileList[i].name
        });
      } catch (err) {
        console.error('Error processing file:', fileList[i].name, err);
        setError(`Failed to process ${fileList[i].name}: ${err.message}`);
      }
    }

    setResults(processedResults);

    if (processedResults.length > 0) {
      await downloadResults(processedResults);
    }

    setTimeout(() => {
      setProcessing(false);
      setFiles([]);
      setCurrentIndex(0);
      setResults([]);
    }, 1000);
  };

  const downloadResults = async (resultsList) => {
    if (resultsList.length === 1) {
      const { blob, fileName } = resultsList[0];
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const zip = new JSZip();

      for (const { blob, fileName } of resultsList) {
        zip.file(fileName, blob);
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(zipBlob);
      link.href = url;
      link.download = 'processed-models.zip';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
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
          GLB Batch Processing
        </h1>

        <p className={styles.description}>
          Upload GLB files to remove animations and download processed models
        </p>

        {!processing ? (
          <div className={styles.form}>
            <div className={styles.optionsPanel}>
              <h3>Processing Options</h3>
              <label className={styles.optionLabel}>
                <input
                  type="checkbox"
                  checked={processingOptions.removeAnimations}
                  onChange={(e) => setProcessingOptions(prev => ({
                    ...prev,
                    removeAnimations: e.target.checked
                  }))}
                  className={styles.checkbox}
                />
                <span>Remove Animations</span>
              </label>
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
                id="glb-file-input"
                accept=".glb"
                multiple
                onChange={handleFileChange}
                className={styles.fileInput}
              />
              <label htmlFor="glb-file-input" className={styles.dropZoneLabel}>
                <svg className={styles.icon} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <span>Drag and drop your GLB files here</span>
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

              <div className={styles.processingStatus}>
                <div className={styles.spinner} />
                <p>Removing animations...</p>
              </div>
            </div>

            <button
              onClick={handleReset}
              className={styles.resetButton}
            >
              Cancel
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
