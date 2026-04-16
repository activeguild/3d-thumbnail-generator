import { WebIO } from '@gltf-transform/core';
import { resample, prune, getBounds, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';

/**
 * Read a File into a glTF-Transform Document via WebIO.
 */
async function readDocument(file) {
  const buffer = await file.arrayBuffer();
  const io = new WebIO();
  return await io.readBinary(new Uint8Array(buffer));
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
 * Center the model at the origin using gltf-transform's getBounds.
 * Also offsets translation animation keyframes so the model stays
 * centered during animation playback.
 */
function centerOrigin(document) {
  const root = document.getRoot();
  const scenes = root.listScenes();
  if (scenes.length === 0) return;

  const scene = scenes[0];
  const bounds = getBounds(scene);

  const center = [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];

  // Collect scene root children as a Set for quick lookup
  const rootChildren = new Set(scene.listChildren());

  // Offset each scene's root children's initial translation
  for (const child of rootChildren) {
    const t = child.getTranslation();
    child.setTranslation([
      t[0] - center[0],
      t[1] - center[1],
      t[2] - center[2],
    ]);
  }

  // Offset translation keyframes in animations for root children
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      if (channel.getTargetPath() !== 'translation') continue;

      const targetNode = channel.getTargetNode();
      if (!rootChildren.has(targetNode)) continue;

      const sampler = channel.getSampler();
      const output = sampler.getOutput();
      if (!output) continue;

      // Offset each VEC3 keyframe value
      const count = output.getCount();
      for (let i = 0; i < count; i++) {
        const v = output.getElement(i, [0, 0, 0]);
        output.setElement(i, [
          v[0] - center[0],
          v[1] - center[1],
          v[2] - center[2],
        ]);
      }
    }
  }
}

/**
 * Reduce the number of nodes by removing a percentage of mesh nodes.
 * Evenly samples nodes to keep, preserving visual distribution.
 * Also removes associated animation channels for disposed nodes.
 */
function decimateNodes(document, ratio) {
  const root = document.getRoot();

  // Collect ALL nodes with a mesh, regardless of hierarchy depth
  const meshNodes = root.listNodes().filter(n => n.getMesh());
  const totalCount = meshNodes.length;
  const keepCount = Math.max(1, Math.round(totalCount * ratio));

  console.log(`decimateNodes: ${totalCount} mesh nodes, keeping ${keepCount} (${Math.round(ratio * 100)}%)`);

  if (keepCount >= totalCount) return;

  // Evenly select nodes to keep
  const keepSet = new Set();
  for (let i = 0; i < keepCount; i++) {
    const idx = Math.round((i * (totalCount - 1)) / (keepCount - 1));
    keepSet.add(meshNodes[idx]);
  }

  // Dispose nodes that are not kept
  for (const node of meshNodes) {
    if (!keepSet.has(node)) {
      node.dispose();
    }
  }
}

/**
 * Process GLB file with options.
 * Uses gltf-transform to preserve the original glTF structure.
 * @param {File} file - Input GLB file
 * @param {Object} options - Processing options
 * @param {boolean} options.removeAnimations - Remove all animations
 * @param {boolean} options.decimateKeyframes - Decimate keyframes
 * @param {number} options.decimateRatio - Keep ratio for decimation (0.5 = 50%)
 * @param {boolean} options.centerOrigin - Center model at origin (0,0,0)
 * @param {boolean} options.simplifyMesh - Simplify mesh (reduce triangles)
 * @param {number} options.simplifyRatio - Target ratio for mesh simplification (0.5 = 50%)
 * @param {boolean} options.decimateNodes - Reduce number of nodes
 * @param {number} options.decimateNodesRatio - Keep ratio for node decimation (0.5 = 50%)
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function processGLB(file, options = {}) {
  const {
    removeAnimations = false,
    decimateKeyframes = false,
    decimateRatio = 0.5,
    centerOrigin: shouldCenter = false,
    simplifyMesh = false,
    simplifyRatio = 0.5,
    decimateNodes: shouldDecimateNodes = false,
    decimateNodesRatio = 0.5,
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

  if (shouldDecimateNodes) {
    decimateNodes(document, decimateNodesRatio);
  }

  if (shouldCenter) {
    centerOrigin(document);
  }

  if (simplifyMesh) {
    await MeshoptSimplifier.ready;
    await document.transform(
      weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: simplifyRatio, error: 0.01 })
    );
  }

  await document.transform(prune());
  return writeGLB(document);
}
