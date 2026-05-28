'use client';

import styles from './Sidebar.module.css';

const FEATURES = [
  {
    id: 'thumbnail',
    name: '3D Thumbnail Creation',
    icon: '🖼️',
    description: 'Generate thumbnails from 3D models',
    subItems: [
      { id: 'thumbnail-asset', name: 'Asset', description: 'Batch thumbnail generation' },
      { id: 'thumbnail-template', name: 'Template', description: 'Custom background & lighting' },
    ],
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
        {FEATURES.map(feature => {
          const isParentActive = feature.subItems
            ? feature.subItems.some(sub => sub.id === activeFeature)
            : activeFeature === feature.id;

          return (
            <div key={feature.id}>
              <button
                className={`${styles.navItem} ${isParentActive ? styles.active : ''}`}
                onClick={() => {
                  if (feature.subItems) {
                    onFeatureChange(feature.subItems[0].id);
                  } else {
                    onFeatureChange(feature.id);
                  }
                }}
              >
                <span className={styles.icon}>{feature.icon}</span>
                <div className={styles.content}>
                  <span className={styles.name}>{feature.name}</span>
                  <span className={styles.description}>{feature.description}</span>
                </div>
              </button>

              {feature.subItems && isParentActive && (
                <div className={styles.subItems}>
                  {feature.subItems.map(sub => (
                    <button
                      key={sub.id}
                      className={`${styles.subItem} ${activeFeature === sub.id ? styles.subItemActive : ''}`}
                      onClick={() => onFeatureChange(sub.id)}
                    >
                      <span className={styles.subItemName}>{sub.name}</span>
                      <span className={styles.subItemDesc}>{sub.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
