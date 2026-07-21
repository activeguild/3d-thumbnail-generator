# Texture Atlas Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add texture atlas functionality to the batch processing pipeline, merging multiple materials' textures into a single atlas to reduce draw calls.

**Architecture:** A new `textureAtlas()` function in `glbAnimationRemover.js` that uses Canvas API to decode textures, pack them into a 2048x2048 atlas using shelf-packing, remap UVs, and merge materials. Integrated into `processGLB` pipeline before `joinMeshes`. UI checkbox added to `GLBProcessor.js`.

**Tech Stack:** gltf-transform core API (Texture, Material, Accessor), Canvas/OffscreenCanvas API, existing processGLB pipeline.

---

### Task 1: Add `textureAtlas()` core function to processor

**Files:**
- Modify: `components/processors/glbAnimationRemover.js`

- [ ] **Step 1: Add texture slot constant and helper to decode textures**

Add the following code after the `decimateNodes` function (after line 172) in `components/processors/glbAnimationRemover.js`:

```javascript
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
```

- [ ] **Step 2: Add shelf-packing function**

Add the following after the code from Step 1:

```javascript
/**
 * Shelf-packing algorithm. Places rectangles into a 2D atlas.
 * @param {Array<{width: number, height: number, index: number}>} rects - Rectangles to pack
 * @param {number} maxSize - Maximum atlas dimension (width and height)
 * @returns {{regions: Array<{x: number, y: number, width: number, height: number}>, atlasWidth: number, atlasHeight: number} | null}
 */
function shelfPack(rects, maxSize) {
  // Sort by height descending for better packing
  const sorted = rects.map((r, i) => ({ ...r, originalIndex: r.index }))
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
```

- [ ] **Step 3: Add UV tiling check helper**

Add the following after the code from Step 2:

```javascript
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
```

- [ ] **Step 4: Add the main `textureAtlas()` function**

Add the following after the code from Step 3:

```javascript
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
    // Must have at least one texture
    const hasTexture = TEXTURE_SLOTS.some(slot => mat[slot.get]() !== null);
    if (!hasTexture) {
      console.log(`textureAtlas: skipping material "${mat.getName()}" (no textures)`);
      continue;
    }
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
  const newTextures = {};
  for (const slot of TEXTURE_SLOTS) {
    const bitmaps = slotBitmaps[slot.get];
    const hasAny = bitmaps.some(b => b !== null);
    if (!hasAny) continue;

    const canvas = typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(atlasWidth, atlasHeight)
      : document.createElement
        ? document.createElement('canvas')
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

      const texcoord = prim.getAttribute('TEXCOORD_0');
      if (!texcoord) continue;

      // Clone accessor if shared with other primitives
      const users = texcoord.listParents().filter(p => p.propertyType !== 'Root');
      let accessor = texcoord;
      if (users.length > 1) {
        accessor = texcoord.clone();
        prim.setAttribute('TEXCOORD_0', accessor);
      }

      const region = regions[matIndex];
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
```

- [ ] **Step 5: Integrate `textureAtlas` into `processGLB` pipeline**

Modify `processGLB` in `components/processors/glbAnimationRemover.js`. Add the `textureAtlas` option to the destructuring (after `joinMeshes = false` on line 200):

```javascript
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
```

Add the atlas call between the `simplifyMesh` block and `joinMeshes` block. Insert after the closing `}` of `if (simplifyMesh)` (after line 228):

```javascript
  if (shouldTextureAtlas) {
    await textureAtlas(document);
  }
```

- [ ] **Step 6: Verify the build compiles**

Run: `cd /Users/j1ngzoue/projects/3d-thumbnail-generator && npx next build 2>&1 | tail -20`
Expected: Build succeeds without errors related to the new code.

- [ ] **Step 7: Commit**

```bash
git add components/processors/glbAnimationRemover.js
git commit -m "feat: add textureAtlas function to GLB processor"
```

---

### Task 2: Add Texture Atlas checkbox to batch processing UI

**Files:**
- Modify: `components/features/GLBProcessor.js`

- [ ] **Step 1: Add `textureAtlas` to processing options state**

In `components/features/GLBProcessor.js`, modify the `processingOptions` initial state (line 20-32). Add `textureAtlas: false` after `joinMeshes: false`:

```javascript
  const [processingOptions, setProcessingOptions] = useState({
    validateFiles: true,
    removeAnimations: true,
    decimateKeyframes: false,
    decimateRatio: 0.5,
    dracoCompress: false,
    centerOrigin: false,
    simplifyMesh: false,
    simplifyRatio: 0.5,
    decimateNodes: false,
    decimateNodesRatio: 0.5,
    joinMeshes: false,
    textureAtlas: false,
  });
```

- [ ] **Step 2: Add `textureAtlas` to the `needsProcessing` check**

In `startProcessing`, modify the `needsProcessing` check (lines 247-250). Add `processingOptions.textureAtlas`:

```javascript
        const needsProcessing =
          processingOptions.removeAnimations || processingOptions.decimateKeyframes ||
          processingOptions.centerOrigin || processingOptions.simplifyMesh ||
          processingOptions.decimateNodes || processingOptions.joinMeshes ||
          processingOptions.textureAtlas;
```

- [ ] **Step 3: Pass `textureAtlas` option to `processGLB`**

In `startProcessing`, add `textureAtlas` to the options object passed to `processGLB` (lines 253-263). Add it after `joinMeshes`:

```javascript
          ? await processGLB(fileList[i], {
              removeAnimations: processingOptions.removeAnimations,
              decimateKeyframes: processingOptions.decimateKeyframes,
              decimateRatio: processingOptions.decimateRatio,
              centerOrigin: processingOptions.centerOrigin,
              simplifyMesh: processingOptions.simplifyMesh,
              simplifyRatio: processingOptions.simplifyRatio,
              decimateNodes: processingOptions.decimateNodes,
              decimateNodesRatio: processingOptions.decimateNodesRatio,
              joinMeshes: processingOptions.joinMeshes,
              textureAtlas: processingOptions.textureAtlas,
            })
```

- [ ] **Step 4: Add Texture Atlas checkbox to UI**

In the options panel section of `renderContent()`, add a checkbox after the Join Meshes checkbox (after line 687). Insert before the commented-out Simplify Mesh block:

```jsx
          <label className={styles.optionLabel}>
            <input
              type="checkbox"
              checked={processingOptions.textureAtlas}
              onChange={(e) => setProcessingOptions(prev => ({
                ...prev,
                textureAtlas: e.target.checked
              }))}
              className={styles.checkbox}
            />
            <span>Texture Atlas (merge materials)</span>
          </label>
```

- [ ] **Step 5: Verify the build compiles**

Run: `cd /Users/j1ngzoue/projects/3d-thumbnail-generator && npx next build 2>&1 | tail -20`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add components/features/GLBProcessor.js
git commit -m "feat: add Texture Atlas option to batch processing UI"
```

---

### Task 3: Manual testing and fix

**Files:**
- Possibly modify: `components/processors/glbAnimationRemover.js`, `components/features/GLBProcessor.js`

- [ ] **Step 1: Start dev server and test with a multi-material GLB**

Run: `cd /Users/j1ngzoue/projects/3d-thumbnail-generator && npm run dev`

Test manually:
1. Open http://localhost:3000 in browser
2. Navigate to GLB Batch Processing
3. Upload a GLB file with multiple materials
4. Enable "Validate Files" to check draw call count before processing
5. Enable "Texture Atlas (merge materials)" checkbox
6. Click "Process Files"
7. Compare the before/after draw call counts

- [ ] **Step 2: Test edge cases**

Test with:
- A GLB with only 1 material (should be skipped gracefully)
- A GLB with UV tiling (should be skipped with console log)
- Texture Atlas + Join Meshes combined (should reduce draw calls further)

- [ ] **Step 3: Fix any issues found and commit**

```bash
git add -u
git commit -m "fix: address issues found during texture atlas testing"
```
