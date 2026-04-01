'use client';

import styles from './Sidebar.module.css';

const FEATURES = [
  {
    id: 'thumbnail',
    name: '3D Thumbnail Creation',
    icon: '🖼️',
    description: 'Generate thumbnails from 3D models'
  },
  {
    id: 'glb-processor',
    name: 'GLB Batch Processing',
    icon: '⚙️',
    description: 'Remove animations from GLB files'
  },
  {
    id: 'glb-compare',
    name: 'GLB Compare',
    icon: '🔍',
    description: 'Compare two GLB files side by side'
  }
];

export default function Sidebar({ activeFeature, onFeatureChange }) {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <h2>3D Tools</h2>
      </div>

      <nav className={styles.nav}>
        {FEATURES.map(feature => (
          <button
            key={feature.id}
            className={`${styles.navItem} ${
              activeFeature === feature.id ? styles.active : ''
            }`}
            onClick={() => onFeatureChange(feature.id)}
          >
            <span className={styles.icon}>{feature.icon}</span>
            <div className={styles.content}>
              <span className={styles.name}>{feature.name}</span>
              <span className={styles.description}>{feature.description}</span>
            </div>
          </button>
        ))}
      </nav>
    </aside>
  );
}
