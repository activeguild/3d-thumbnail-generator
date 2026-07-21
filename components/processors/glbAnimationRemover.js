import { WebIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, EXTTextureWebP } from '@gltf-transform/extensions';
import { resample, prune, getBounds, simplify, weld, dedup, flatten, join } from '@gltf-transform/functions';
import { PropertyType } from '@gltf-transform/core';
import { MeshoptSimplifier } from 'meshoptimizer';
import draco3d from 'draco3dgltf';

let _io = null;

async function getIO() {
  if (!_io) {
    const [decoderModule, encoderModule] = await Promise.all([
      draco3d.createDecoderModule({ locateFile: (f) => `/draco/${f}` }),
      draco3d.createEncoderModule({ locateFile: (f) => `/draco/${f}` }),
    ]);
    _io = new WebIO()
      .registerExtensions([KHRDracoMeshCompression, EXTTextureWebP])
      .registerDependencies({
        'draco3d.decoder': decoderModule,
        'draco3d.encoder': encoderModule,
      });
  }
  return _io;
}

/**
 * Read a File into a glTF-Transform Document via WebIO.
 */
async function readDocument(file) {
  const buffer = await file.arrayBuffer();
  const io = await getIO();
  return await io.readBinary(new Uint8Array(buffer));
}

/**
 * Write a glTF-Transform Document back to a GLB Blob.
 */
async function writeGLB(document) {
  const io = await getIO();
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
 * Texture slots used for atlas packing.
 */
const TEXTURE_SLOTS = [
  { get: 'getBaseColorTexture', set: 'setBaseColorTexture', getInfo: 'getBaseColorTextureInfo' },
  { get: 'getNormalTexture', set: 'setNormalTexture', getInfo: 'getNormalTextureInfo' },
  { get: 'getMetallicRoughnessTexture', set: 'setMetallicRoughnessTexture', getInfo: 'getMetallicRoughnessTextureInfo' },
  { get: 'getEmissiveTexture', set: 'setEmissiveTexture', getInfo: 'getEmissiveTextureInfo' },
  { get: 'getOcclusionTexture', set: 'setOcclusionTexture', getInfo: 'getOcclusionTextureInfo' },
];

/**
 * Decode a gltf-transform Texture to an ImageBitmap.
 */
async function decodeTexture(texture) {
  const imageData = texture.getImage();
  if (!imageData) return null;
  const blob = new Blob([imageData], { type: texture.getMimeType() || 'image/png' });
  return createImageBitmap(blob);
}

/**
 * Shelf-packing algorithm. Places rectangles into a 2D atlas.
 * @param {Array<{width: number, height: number, index: number}>} rects - Rectangles to pack
 * @param {number} maxSize - Maximum atlas dimension (width and height)
 * @returns {{regions: Array<{x: number, y: number, width: number, height: number}>, atlasWidth: number, atlasHeight: number} | null}
 */
function shelfPack(rects, maxSize) {
  // Sort by height descending for better packing
  const sorted = rects.map((r) => ({ ...r, originalIndex: r.index }))
    .sort((a, b) => b.height - a.height);

  const regions = new Array(rects.length);
  let shelfX = 0;
  let shelfY = 0;
  let shelfHeight = 0;
  let atlasWidth = 0;

  for (const rect of sorted) {
    if (shelfX + rect.width > maxSize) {
      // Move to next shelf
      shelfY += shelfHeight;
      shelfX = 0;
      shelfHeight = 0;
    }
    if (shelfY + rect.height > maxSize) {
      return null; // Doesn't fit
    }
    regions[rect.originalIndex] = {
      x: shelfX,
      y: shelfY,
      width: rect.width,
      height: rect.height,
    };
    shelfX += rect.width;
    atlasWidth = Math.max(atlasWidth, shelfX);
    shelfHeight = Math.max(shelfHeight, rect.height);
  }

  const atlasHeight = shelfY + shelfHeight;
  return { regions, atlasWidth, atlasHeight };
}

/**
 * Check if any primitive using a given material has UV coordinates outside [0,1].
 */
function hasUVTiling(document, material) {
  const root = document.getRoot();
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (prim.getMaterial() !== material) continue;
      const texcoord = prim.getAttribute('TEXCOORD_0');
      if (!texcoord) continue;
      const count = texcoord.getCount();
      const el = [0, 0];
      for (let i = 0; i < count; i++) {
        texcoord.getElement(i, el);
        if (el[0] < -0.001 || el[0] > 1.001 || el[1] < -0.001 || el[1] > 1.001) {
          return true;
        }
      }
    }
  }
  return false;
}

/**
 * Merge multiple materials into one by atlasing their textures.
 * Skips materials with UV tiling or no textures.
 * @param {Document} document - gltf-transform Document
 * @param {number} maxSize - Maximum atlas dimension (default 2048)
 */
async function textureAtlas(document, maxSize = 2048) {
  const root = document.getRoot();
  const allMaterials = root.listMaterials();

  if (allMaterials.length <= 1) {
    console.log('textureAtlas: skipped (1 or fewer materials)');
    return;
  }

  // Filter materials eligible for atlasing
  const eligible = [];
  for (const mat of allMaterials) {
    // Must not use UV tiling
    if (hasUVTiling(document, mat)) {
      console.log(`textureAtlas: skipping material "${mat.getName()}" (UV tiling detected)`);
      continue;
    }
    eligible.push(mat);
  }

  if (eligible.length <= 1) {
    console.log('textureAtlas: skipped (1 or fewer eligible materials)');
    return;
  }

  // Decode all textures for each slot
  const slotBitmaps = {}; // slot.get -> [{bitmap, width, height, matIndex}]
  for (const slot of TEXTURE_SLOTS) {
    const bitmaps = [];
    for (let i = 0; i < eligible.length; i++) {
      const tex = eligible[i][slot.get]();
      if (tex) {
        const bitmap = await decodeTexture(tex);
        if (bitmap) {
          bitmaps.push({ bitmap, width: bitmap.width, height: bitmap.height, matIndex: i });
        } else {
          bitmaps.push(null);
        }
      } else {
        bitmaps.push(null);
      }
    }
    slotBitmaps[slot.get] = bitmaps;
  }

  // Use baseColor slot (or first available) to determine layout
  const layoutSlot = TEXTURE_SLOTS.find(slot =>
    slotBitmaps[slot.get].some(b => b !== null)
  );
  if (!layoutSlot) {
    console.log('textureAtlas: skipped (no decodable textures)');
    return;
  }

  // Build rects for packing from layout slot
  // For materials without a texture in this slot, use a 1x1 placeholder size
  const rects = eligible.map((mat, i) => {
    const entry = slotBitmaps[layoutSlot.get][i];
    return {
      width: entry ? entry.width : 1,
      height: entry ? entry.height : 1,
      index: i,
    };
  });

  // Try packing, shrink textures if needed
  let packResult = null;
  let scale = 1;
  for (let attempt = 0; attempt < 4; attempt++) {
    const scaledRects = rects.map(r => ({
      width: Math.max(1, Math.round(r.width * scale)),
      height: Math.max(1, Math.round(r.height * scale)),
      index: r.index,
    }));
    packResult = shelfPack(scaledRects, maxSize);
    if (packResult) break;
    scale *= 0.5;
  }

  if (!packResult) {
    console.log('textureAtlas: skipped (textures too large to fit in atlas)');
    return;
  }

  const { regions, atlasWidth, atlasHeight } = packResult;
  console.log(`textureAtlas: packing ${eligible.length} materials into ${atlasWidth}x${atlasHeight} atlas (scale=${scale})`);

  // Create atlas textures for each slot
  // For baseColor, always create an atlas (fill with baseColorFactor for textureless materials)
  const newTextures = {};
  for (const slot of TEXTURE_SLOTS) {
    const bitmaps = slotBitmaps[slot.get];
    const isBaseColor = slot.get === 'getBaseColorTexture';
    const hasAny = bitmaps.some(b => b !== null);
    if (!hasAny && !isBaseColor) continue;

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(atlasWidth, atlasHeight)
      : typeof window !== 'undefined' && window.document
        ? window.document.createElement('canvas')
        : null;
    if (!canvas) continue;

    if (canvas.width !== undefined) {
      canvas.width = atlasWidth;
      canvas.height = atlasHeight;
    }
    const ctx = canvas.getContext('2d');

    for (let i = 0; i < eligible.length; i++) {
      const entry = bitmaps[i];
      const region = regions[i];
      if (entry && entry.bitmap) {
        ctx.drawImage(entry.bitmap, region.x, region.y, region.width, region.height);
        entry.bitmap.close();
      } else if (isBaseColor) {
        // Fill with material's baseColorFactor for textureless materials
        const factor = eligible[i].getBaseColorFactor();
        const r = Math.round(factor[0] * 255);
        const g = Math.round(factor[1] * 255);
        const b = Math.round(factor[2] * 255);
        const a = factor[3];
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.fillRect(region.x, region.y, region.width, region.height);
      }
    }

    // Convert canvas to PNG Uint8Array
    let pngData;
    if (canvas.convertToBlob) {
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      pngData = new Uint8Array(await blob.arrayBuffer());
    } else if (canvas.toBlob) {
      pngData = await new Promise((resolve) => {
        canvas.toBlob(async (blob) => {
          resolve(new Uint8Array(await blob.arrayBuffer()));
        }, 'image/png');
      });
    }

    if (pngData) {
      const tex = document.createTexture(slot.get.replace('get', 'atlas_'))
        .setImage(pngData)
        .setMimeType('image/png');
      newTextures[slot.get] = tex;
    }
  }

  // Remap UVs for all primitives using eligible materials
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const mat = prim.getMaterial();
      const matIndex = eligible.indexOf(mat);
      if (matIndex === -1) continue;

      const region = regions[matIndex];
      let texcoord = prim.getAttribute('TEXCOORD_0');

      if (!texcoord) {
        // Create UV coordinates for primitives without TEXCOORD_0
        // (e.g. solid-color materials). Point all vertices to the center of their atlas region.
        const position = prim.getAttribute('POSITION');
        if (!position) continue;
        const vertexCount = position.getCount();
        const centerU = (region.x + region.width * 0.5) / atlasWidth;
        const centerV = (region.y + region.height * 0.5) / atlasHeight;
        const uvData = new Float32Array(vertexCount * 2);
        for (let i = 0; i < vertexCount; i++) {
          uvData[i * 2] = centerU;
          uvData[i * 2 + 1] = centerV;
        }
        const accessor = document.createAccessor('atlas_uv')
          .setType('VEC2')
          .setArray(uvData);
        prim.setAttribute('TEXCOORD_0', accessor);
        continue;
      }

      // Clone accessor if shared with other primitives
      const users = texcoord.listParents().filter(p => p.propertyType !== 'Root');
      let accessor = texcoord;
      if (users.length > 1) {
        accessor = texcoord.clone();
        prim.setAttribute('TEXCOORD_0', accessor);
      }

      const count = accessor.getCount();
      const el = [0, 0];
      for (let i = 0; i < count; i++) {
        accessor.getElement(i, el);
        el[0] = (el[0] * region.width + region.x) / atlasWidth;
        el[1] = (el[1] * region.height + region.y) / atlasHeight;
        accessor.setElement(i, el);
      }
    }
  }

  // Create merged material
  const mergedMat = document.createMaterial('atlas_material');

  // Copy PBR properties from first eligible material
  const firstMat = eligible[0];
  mergedMat.setBaseColorFactor(firstMat.getBaseColorFactor());
  mergedMat.setMetallicFactor(firstMat.getMetallicFactor());
  mergedMat.setRoughnessFactor(firstMat.getRoughnessFactor());
  mergedMat.setEmissiveFactor(firstMat.getEmissiveFactor());
  mergedMat.setAlphaMode(firstMat.getAlphaMode());
  mergedMat.setAlphaCutoff(firstMat.getAlphaCutoff());
  mergedMat.setDoubleSided(firstMat.getDoubleSided());

  // If any material uses BLEND, use BLEND
  if (eligible.some(m => m.getAlphaMode() === 'BLEND')) {
    mergedMat.setAlphaMode('BLEND');
  }

  // Assign atlas textures to merged material
  for (const slot of TEXTURE_SLOTS) {
    if (newTextures[slot.get]) {
      mergedMat[slot.set](newTextures[slot.get]);
    }
  }

  // Replace all eligible materials with the merged one
  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      if (eligible.includes(prim.getMaterial())) {
        prim.setMaterial(mergedMat);
      }
    }
  }

  console.log(`textureAtlas: merged ${eligible.length} materials into 1`);
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
 * @param {boolean} options.joinMeshes - Join meshes with same material to reduce draw calls
 * @param {boolean} options.textureAtlas - Merge materials by atlasing textures
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
    joinMeshes = false,
    textureAtlas: shouldTextureAtlas = false,
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

  if (shouldTextureAtlas) {
    await textureAtlas(document);
  }

  if (joinMeshes) {
    await document.transform(
      dedup({ propertyTypes: [PropertyType.MATERIAL] }),
      flatten(),
      join(),
    );
  }

  await document.transform(prune());
  return writeGLB(document);
}
