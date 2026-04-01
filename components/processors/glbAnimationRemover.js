import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

function createLoader() {
  const loader = new GLTFLoader();
  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
  loader.setDRACOLoader(dracoLoader);
  return loader;
}

function exportToGLB(scene, animations = []) {
  return new Promise((resolve, reject) => {
    const exporter = new GLTFExporter();
    exporter.parse(
      scene,
      (result) => {
        const blob = new Blob([result], { type: 'model/gltf-binary' });
        resolve(blob);
      },
      (error) => {
        reject(new Error('Failed to export GLB: ' + error.message));
      },
      { binary: true, animations }
    );
  });
}

/**
 * Remove animations from a GLB file
 * @param {File} file - Input GLB file
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function removeAnimationsFromGLB(file) {
  return new Promise((resolve, reject) => {
    const loader = createLoader();
    const fileUrl = URL.createObjectURL(file);

    loader.load(
      fileUrl,
      async (gltf) => {
        URL.revokeObjectURL(fileUrl);
        try {
          const blob = await exportToGLB(gltf.scene, []);
          resolve(blob);
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(fileUrl);
        reject(new Error('Failed to load GLB: ' + error.message));
      }
    );
  });
}

/**
 * Decimate keyframes in animation tracks
 * @param {THREE.KeyframeTrack} track - Animation track
 * @param {number} ratio - Keep ratio (0.5 = keep 50% of keyframes)
 * @returns {THREE.KeyframeTrack} - Decimated track
 */
function decimateTrack(track, ratio) {
  const times = track.times;
  const values = track.values;
  const valueSize = values.length / times.length;

  if (times.length <= 2) {
    return track;
  }

  const step = Math.max(1, Math.round(1 / ratio));
  const newTimes = [];
  const newValues = [];

  for (let i = 0; i < times.length; i++) {
    const isFirst = i === 0;
    const isLast = i === times.length - 1;
    const isSelected = i % step === 0;

    if (isFirst || isLast || isSelected) {
      newTimes.push(times[i]);
      for (let j = 0; j < valueSize; j++) {
        newValues.push(values[i * valueSize + j]);
      }
    }
  }

  const TrackConstructor = track.constructor;
  return new TrackConstructor(
    track.name,
    new Float32Array(newTimes),
    new Float32Array(newValues),
    track.getInterpolation()
  );
}

/**
 * Decimate animations in a GLB file (reduce keyframes)
 * @param {File} file - Input GLB file
 * @param {number} ratio - Keep ratio (0.5 = keep 50% of keyframes)
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function decimateAnimationsFromGLB(file, ratio = 0.5) {
  return new Promise((resolve, reject) => {
    const loader = createLoader();
    const fileUrl = URL.createObjectURL(file);

    loader.load(
      fileUrl,
      async (gltf) => {
        URL.revokeObjectURL(fileUrl);

        try {
          const decimatedAnimations = gltf.animations.map((clip) => {
            const decimatedTracks = clip.tracks.map((track) =>
              decimateTrack(track, ratio)
            );
            return new THREE.AnimationClip(clip.name, clip.duration, decimatedTracks);
          });

          const blob = await exportToGLB(gltf.scene, decimatedAnimations);
          resolve(blob);
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(fileUrl);
        reject(new Error('Failed to load GLB: ' + error.message));
      }
    );
  });
}

/**
 * Process GLB file with options
 * @param {File} file - Input GLB file
 * @param {Object} options - Processing options
 * @param {boolean} options.removeAnimations - Remove all animations
 * @param {boolean} options.decimateKeyframes - Decimate keyframes
 * @param {number} options.decimateRatio - Keep ratio for decimation (0.5 = 50%)
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function processGLB(file, options = {}) {
  const {
    removeAnimations = false,
    decimateKeyframes = false,
    decimateRatio = 0.5
  } = options;

  return new Promise((resolve, reject) => {
    const loader = createLoader();
    const fileUrl = URL.createObjectURL(file);

    loader.load(
      fileUrl,
      async (gltf) => {
        URL.revokeObjectURL(fileUrl);

        try {
          let animations = gltf.animations;

          if (removeAnimations) {
            animations = [];
          } else if (decimateKeyframes && animations.length > 0) {
            animations = animations.map((clip) => {
              const decimatedTracks = clip.tracks.map((track) =>
                decimateTrack(track, decimateRatio)
              );
              return new THREE.AnimationClip(clip.name, clip.duration, decimatedTracks);
            });
          }

          const blob = await exportToGLB(gltf.scene, animations);
          resolve(blob);
        } catch (error) {
          reject(error);
        }
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(fileUrl);
        reject(new Error('Failed to load GLB: ' + error.message));
      }
    );
  });
}
