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

export default function Home() {
  const [activeFeature, setActiveFeature] = useState('thumbnail');

  return (
    <div className={styles.appContainer}>
      <Sidebar activeFeature={activeFeature} onFeatureChange={setActiveFeature} />
      <main className={styles.mainContent}>
        {activeFeature === 'thumbnail' && <ThumbnailGenerator />}
        {activeFeature === 'glb-processor' && <GLBProcessor />}
        {activeFeature === 'glb-compare' && <GLBCompare />}
      </main>
    </div>
  );
}
