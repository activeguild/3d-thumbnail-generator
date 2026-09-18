'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import Sidebar from '@/components/Sidebar';
import ThumbnailGenerator from '@/components/features/ThumbnailGenerator';
import styles from './page.module.css';

const GLBProcessor = dynamic(() => import('@/components/features/GLBProcessor'), {
  ssr: false,
  loading: () => <p style={{color: 'white'}}>Loading GLB Processor...</p>
});

const GLBCompare = dynamic(() => import('@/components/features/GLBCompare'), {
  ssr: false,
  loading: () => <p style={{color: 'white'}}>Loading GLB Compare...</p>
});

const TemplateViewer = dynamic(() => import('@/components/features/TemplateViewer'), {
  ssr: false,
  loading: () => <p style={{color: 'white'}}>Loading Template Viewer...</p>
});

const GLBAutoFix = dynamic(() => import('@/components/features/GLBAutoFix'), {
  ssr: false,
  loading: () => <p style={{color: 'white'}}>Loading 3D Auto Fix...</p>
});

const GLBContactSheet = dynamic(() => import('@/components/features/GLBContactSheet'), {
  ssr: false,
  loading: () => <p style={{color: 'white'}}>Loading GLB Contact Sheet...</p>
});

export default function Home() {
  const [activeFeature, setActiveFeature] = useState('thumbnail-asset');

  return (
    <div className={styles.appContainer}>
      <Sidebar activeFeature={activeFeature} onFeatureChange={setActiveFeature} />
      <main className={styles.mainContent}>
        {activeFeature === 'thumbnail-asset' && <ThumbnailGenerator />}
        {activeFeature === 'thumbnail-template' && <TemplateViewer />}
        {activeFeature === 'glb-processor' && <GLBProcessor />}
        {activeFeature === 'glb-compare' && <GLBCompare />}
        {activeFeature === 'glb-autofix' && <GLBAutoFix />}
        {activeFeature === 'glb-contactsheet' && <GLBContactSheet />}
      </main>
    </div>
  );
}
