import { WebIO } from '@gltf-transform/core';
import { resample, prune } from '@gltf-transform/functions';

/**
 * Read a File into a glTF-Transform Document via WebIO.
 */
async function readDocument(file) {
  const buffer = await file.arrayBuffer();
  const io = new WebIO();
  return io.readBinary(new Uint8Array(buffer));
}

/**
 * Write a glTF-Transform Document back to a GLB Blob.
 */
async function writeGLB(document) {
  const io = new WebIO();
  const glb = await io.writeBinary(document);
  return new Blob([glb], { type: 'model/gltf-binary' });
}

/**
 * Remove animations from a GLB file.
 * Uses gltf-transform to preserve the original glTF structure.
 * @param {File} file - Input GLB file
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function removeAnimationsFromGLB(file) {
  const document = await readDocument(file);

  // Remove all animations
  for (const animation of document.getRoot().listAnimations()) {
    animation.dispose();
  }

  await document.transform(prune());
  return writeGLB(document);
}

/**
 * Decimate animations in a GLB file using gltf-transform's resample.
 * This preserves the original glTF structure (materials, hierarchy, etc.)
 * which is required for correct USDZ conversion and iOS AR Quick Look.
 * @param {File} file - Input GLB file
 * @param {number} ratio - Keep ratio (0.5 = keep 50% of keyframes)
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function decimateAnimationsFromGLB(file, ratio = 0.5) {
  const document = await readDocument(file);

  // tolerance controls how aggressively redundant keyframes are removed.
  // Higher = more aggressive. Map ratio to tolerance:
  // ratio 1.0 (keep all) → tolerance ~0, ratio 0.1 (keep 10%) → tolerance ~0.1
  // ratio → tolerance mapping (quadratic for gentler control at high keep-ratios)
  // ratio 1.0 → 0, ratio 0.5 → 0.0125, ratio 0.1 → 0.0405
  const tolerance = (1 - ratio) ** 2 * 0.05;

  await document.transform(resample({ tolerance }));
  return writeGLB(document);
}

/**
 * Process GLB file with options.
 * Uses gltf-transform to preserve the original glTF structure.
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

  const document = await readDocument(file);

  if (removeAnimations) {
    for (const animation of document.getRoot().listAnimations()) {
      animation.dispose();
    }
  } else if (decimateKeyframes) {
    const tolerance = (1 - decimateRatio) ** 2 * 0.05;
    await document.transform(resample({ tolerance }));
  }

  await document.transform(prune());
  return writeGLB(document);
}
