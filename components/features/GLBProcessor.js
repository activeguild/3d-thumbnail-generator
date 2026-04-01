'use client';

import { useState, useEffect } from 'react';
import JSZip from 'jszip';
import { processGLB } from '@/components/processors/glbAnimationRemover';
import styles from './GLBProcessor.module.css';

export default function GLBProcessor() {
  const [files, setFiles] = useState([]);
  const [processing, setProcessing] = useState(false);
  const [validating, setValidating] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState([]);
  const [validationResults, setValidationResults] = useState([]);
  const [showValidationResults, setShowValidationResults] = useState(false);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const [validator, setValidator] = useState(null);
  const [processingOptions, setProcessingOptions] = useState({
    validateFiles: true,
    removeAnimations: true,
    decimateKeyframes: false,
    decimateRatio: 0.5,
  });
  const [expandedItems, setExpandedItems] = useState({});

  useEffect(() => {
    import('gltf-validator').then((module) => {
      setValidator(module);
    }).catch((err) => {
      console.error('Failed to load gltf-validator:', err);
    });
  }, []);

  const validateGLBFile = async (file) => {
    if (!validator) {
      return {
        fileName: file.name,
        error: 'Validator not loaded',
        issues: { numErrors: 0, numWarnings: 0, numInfos: 0, numHints: 0, messages: [] }
      };
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      const report = await validator.validateBytes(uint8Array);

      return {
        fileName: file.name,
        fileSize: file.size,
        mimeType: report.mimeType,
        validatorVersion: report.validatorVersion,
        issues: report.issues,
        info: report.info
      };
    } catch (err) {
      return {
        fileName: file.name,
        error: err.message,
        issues: { numErrors: 1, numWarnings: 0, numInfos: 0, numHints: 0, messages: [{ message: err.message, severity: 0 }] }
      };
    }
  };

  const validateAllFiles = async (fileList) => {
    setValidating(true);
    setShowValidationResults(false);
    setValidationResults([]);

    const results = [];
    for (let i = 0; i < fileList.length; i++) {
      setCurrentIndex(i);
      const result = await validateGLBFile(fileList[i]);
      results.push(result);
    }

    setValidationResults(results);
    setShowValidationResults(true);
    setValidating(false);
    setCurrentIndex(0);
  };

  const getSeverityLabel = (severity) => {
    switch (severity) {
      case 0: return 'Error';
      case 1: return 'Warning';
      case 2: return 'Info';
      case 3: return 'Hint';
      default: return 'Unknown';
    }
  };

  const getSeverityClass = (severity) => {
    switch (severity) {
      case 0: return styles.severityError;
      case 1: return styles.severityWarning;
      case 2: return styles.severityInfo;
      case 3: return styles.severityHint;
      default: return '';
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleFilesSelected = (fileList) => {
    setFiles(fileList);
    setError(null);
    setShowValidationResults(false);
    setValidationResults([]);
    setExpandedItems({});

    if (processingOptions.validateFiles) {
      validateAllFiles(fileList);
    } else {
      setShowValidationResults(true);
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

      handleFilesSelected(fileList);
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

      handleFilesSelected(fileList);
    }
  };

  const toggleExpanded = (fileName) => {
    setExpandedItems(prev => ({
      ...prev,
      [fileName]: !prev[fileName]
    }));
  };

  const startProcessing = async (fileList) => {
    setProcessing(true);
    setCurrentIndex(0);
    setResults([]);

    const processedResults = [];

    for (let i = 0; i < fileList.length; i++) {
      setCurrentIndex(i);
      try {
        const processedBlob = await processGLB(fileList[i], {
          removeAnimations: processingOptions.removeAnimations,
          decimateKeyframes: processingOptions.decimateKeyframes,
          decimateRatio: processingOptions.decimateRatio,
        });
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
    setValidating(false);
    setCurrentIndex(0);
    setResults([]);
    setValidationResults([]);
    setShowValidationResults(false);
    setExpandedItems({});
    setError(null);
  };

  const renderContent = () => {
    if (validating) {
      return (
        <div className={styles.result}>
          <div className={styles.progressInfo}>
            <h3>Validating Files</h3>
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
              <p>Validating GLB file...</p>
            </div>
          </div>
          <button onClick={handleReset} className={styles.resetButton}>
            Cancel
          </button>
        </div>
      );
    }

    if (showValidationResults && files.length > 0) {
      const hasValidationResults = validationResults.length > 0;
      const totalErrors = validationResults.reduce((sum, r) => sum + (r.issues?.numErrors || 0), 0);
      const totalWarnings = validationResults.reduce((sum, r) => sum + (r.issues?.numWarnings || 0), 0);

      const sortedValidationResults = [...validationResults].sort((a, b) => {
        const aErrors = a.issues?.numErrors || 0;
        const bErrors = b.issues?.numErrors || 0;
        if (aErrors !== bErrors) return bErrors - aErrors;

        const aWarnings = a.issues?.numWarnings || 0;
        const bWarnings = b.issues?.numWarnings || 0;
        if (aWarnings !== bWarnings) return bWarnings - aWarnings;

        const aInfos = a.issues?.numInfos || 0;
        const bInfos = b.issues?.numInfos || 0;
        return bInfos - aInfos;
      });

      return (
        <div className={styles.validationContainer}>
          <div className={styles.validationHeader}>
            <div className={styles.validationHeaderTop}>
              <h3>{hasValidationResults ? 'Validation Results' : 'Selected Files'}</h3>
              <div className={styles.validationActions}>
                <button onClick={handleReset} className={styles.resetButton}>
                  Reset
                </button>
                <button
                  onClick={() => startProcessing(files)}
                  className={styles.processButton}
                >
                  Process Files
                </button>
              </div>
            </div>
            <div className={styles.validationSummary}>
              <span className={styles.summaryItem}>
                <span className={styles.summaryCount}>{files.length}</span> files
              </span>
              {hasValidationResults && (
                <>
                  <span className={`${styles.summaryItem} ${totalErrors > 0 ? styles.summaryError : ''}`}>
                    <span className={styles.summaryCount}>{totalErrors}</span> errors
                  </span>
                  <span className={`${styles.summaryItem} ${totalWarnings > 0 ? styles.summaryWarning : ''}`}>
                    <span className={styles.summaryCount}>{totalWarnings}</span> warnings
                  </span>
                </>
              )}
            </div>
          </div>

          <div className={styles.validationList}>
            {hasValidationResults ? (
              sortedValidationResults.map((result) => {
                const hasMessages = result.issues?.messages && result.issues.messages.length > 0;
                const isExpanded = expandedItems[result.fileName];

                return (
                  <div key={result.fileName} className={styles.validationItem}>
                    <div
                      className={`${styles.validationItemHeader} ${hasMessages ? styles.clickable : ''}`}
                      onClick={() => hasMessages && toggleExpanded(result.fileName)}
                    >
                      <div className={styles.fileInfo}>
                        {hasMessages && (
                          <span className={styles.expandIcon}>
                            {isExpanded ? '▼' : '▶'}
                          </span>
                        )}
                        <span className={styles.fileName}>{result.fileName}</span>
                        {result.fileSize && (
                          <span className={styles.fileSize}>{formatFileSize(result.fileSize)}</span>
                        )}
                      </div>
                      <div className={styles.issueBadges}>
                        {result.issues?.numErrors > 0 && (
                          <span className={`${styles.badge} ${styles.badgeError}`}>
                            {result.issues.numErrors} Error{result.issues.numErrors > 1 ? 's' : ''}
                          </span>
                        )}
                        {result.issues?.numWarnings > 0 && (
                          <span className={`${styles.badge} ${styles.badgeWarning}`}>
                            {result.issues.numWarnings} Warning{result.issues.numWarnings > 1 ? 's' : ''}
                          </span>
                        )}
                        {result.issues?.numInfos > 0 && (
                          <span className={`${styles.badge} ${styles.badgeInfo}`}>
                            {result.issues.numInfos} Info{result.issues.numInfos > 1 ? 's' : ''}
                          </span>
                        )}
                        {result.issues?.numHints > 0 && (
                          <span className={`${styles.badge} ${styles.badgeHint}`}>
                            {result.issues.numHints} Hint{result.issues.numHints > 1 ? 's' : ''}
                          </span>
                        )}
                        {result.issues?.numErrors === 0 && result.issues?.numWarnings === 0 &&
                         result.issues?.numInfos === 0 && result.issues?.numHints === 0 && (
                          <span className={`${styles.badge} ${styles.badgeSuccess}`}>Valid</span>
                        )}
                      </div>
                    </div>

                    {result.info && (
                      <div className={styles.modelInfo}>
                        <span>Generator: {result.info.generator || 'Unknown'}</span>
                        {result.info.version && <span>glTF {result.info.version}</span>}
                      </div>
                    )}

                    {hasMessages && isExpanded && (
                      <div className={styles.messageList}>
                        {result.issues.messages.map((msg, msgIndex) => (
                          <div key={msgIndex} className={`${styles.message} ${getSeverityClass(msg.severity)}`}>
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
                );
              })
            ) : (
              files.map((file, index) => (
                <div key={index} className={styles.validationItem}>
                  <div className={styles.validationItemHeader}>
                    <div className={styles.fileInfo}>
                      <span className={styles.fileName}>{file.name}</span>
                      <span className={styles.fileSize}>{formatFileSize(file.size)}</span>
                    </div>
                    <div className={styles.issueBadges}>
                      <span className={`${styles.badge} ${styles.badgeSkipped}`}>Not Validated</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      );
    }

    if (processing) {
      return (
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
              <p>
                {processingOptions.removeAnimations
                  ? 'Removing animations...'
                  : processingOptions.decimateKeyframes
                    ? `Decimating keyframes (${Math.round(processingOptions.decimateRatio * 100)}%)...`
                    : 'Processing...'}
              </p>
            </div>
          </div>
          <button onClick={handleReset} className={styles.resetButton}>
            Cancel
          </button>
        </div>
      );
    }

    return (
      <div className={styles.form}>
        <div className={styles.optionsPanel}>
          <h3>Processing Options</h3>
          <label className={styles.optionLabel}>
            <input
              type="checkbox"
              checked={processingOptions.validateFiles}
              onChange={(e) => setProcessingOptions(prev => ({
                ...prev,
                validateFiles: e.target.checked
              }))}
              className={styles.checkbox}
            />
            <span>Validate Files</span>
          </label>
          <label className={styles.optionLabel}>
            <input
              type="checkbox"
              checked={processingOptions.removeAnimations}
              onChange={(e) => setProcessingOptions(prev => ({
                ...prev,
                removeAnimations: e.target.checked,
                decimateKeyframes: e.target.checked ? false : prev.decimateKeyframes
              }))}
              className={styles.checkbox}
            />
            <span>Remove Animations</span>
          </label>
          <label className={`${styles.optionLabel} ${processingOptions.removeAnimations ? styles.optionDisabled : ''}`}>
            <input
              type="checkbox"
              checked={processingOptions.decimateKeyframes}
              disabled={processingOptions.removeAnimations}
              onChange={(e) => setProcessingOptions(prev => ({
                ...prev,
                decimateKeyframes: e.target.checked
              }))}
              className={styles.checkbox}
            />
            <span>Decimate Keyframes</span>
          </label>
          {processingOptions.decimateKeyframes && !processingOptions.removeAnimations && (
            <div className={styles.sliderContainer}>
              <label className={styles.sliderLabel}>
                <span>Keep Ratio: {Math.round(processingOptions.decimateRatio * 100)}%</span>
                <input
                  type="range"
                  min="10"
                  max="90"
                  value={processingOptions.decimateRatio * 100}
                  onChange={(e) => setProcessingOptions(prev => ({
                    ...prev,
                    decimateRatio: parseInt(e.target.value) / 100
                  }))}
                  className={styles.slider}
                />
              </label>
              <span className={styles.sliderHint}>
                Lower = more reduction (50% keeps every 2nd keyframe)
              </span>
            </div>
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
    );
  };

  return (
    <div className={styles.container}>
      <main className={styles.main}>
        <h1 className={styles.title}>
          GLB Batch Processing
        </h1>

        <p className={styles.description}>
          Upload GLB files to validate, remove animations, and download processed models
        </p>

        {renderContent()}
      </main>
    </div>
  );
}
