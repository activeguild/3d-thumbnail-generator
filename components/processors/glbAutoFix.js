import { WebIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression, EXTTextureWebP, EXTMeshoptCompression } from '@gltf-transform/extensions';
import { prune, tangents } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

let _io = null;

async function getIO() {
  if (!_io) {
    const [decoderModule, encoderModule] = await Promise.all([
      draco3d.createDecoderModule({ locateFile: (f) => `/draco/${f}` }),
      draco3d.createEncoderModule({ locateFile: (f) => `/draco/${f}` }),
    ]);
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
    _io = new WebIO()
      .registerExtensions([KHRDracoMeshCompression, EXTTextureWebP, EXTMeshoptCompression])
      .registerDependencies({
        'draco3d.decoder': decoderModule,
        'draco3d.encoder': encoderModule,
        'meshopt.decoder': MeshoptDecoder,
        'meshopt.encoder': MeshoptEncoder,
      });
  }
  return _io;
}

async function readDocument(file) {
  const buffer = await file.arrayBuffer();
  const io = await getIO();
  return await io.readBinary(new Uint8Array(buffer));
}

async function writeGLB(document) {
  const io = await getIO();
  const glb = await io.writeBinary(document);
  return new Blob([glb], { type: 'model/gltf-binary' });
}

/**
 * Multiply two 4x4 matrices (column-major, flat array of 16).
 */
function mat4Multiply(a, b) {
  const out = new Float64Array(16);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      out[j * 4 + i] =
        a[0 * 4 + i] * b[j * 4 + 0] +
        a[1 * 4 + i] * b[j * 4 + 1] +
        a[2 * 4 + i] * b[j * 4 + 2] +
        a[3 * 4 + i] * b[j * 4 + 3];
    }
  }
  return out;
}

/**
 * Invert a 4x4 matrix (column-major).
 */
function mat4Invert(m) {
  const inv = new Float64Array(16);
  inv[0]  =  m[5]*m[10]*m[15] - m[5]*m[11]*m[14] - m[9]*m[6]*m[15] + m[9]*m[7]*m[14] + m[13]*m[6]*m[11] - m[13]*m[7]*m[10];
  inv[4]  = -m[4]*m[10]*m[15] + m[4]*m[11]*m[14] + m[8]*m[6]*m[15] - m[8]*m[7]*m[14] - m[12]*m[6]*m[11] + m[12]*m[7]*m[10];
  inv[8]  =  m[4]*m[9]*m[15]  - m[4]*m[11]*m[13] - m[8]*m[5]*m[15] + m[8]*m[7]*m[13] + m[12]*m[5]*m[11] - m[12]*m[7]*m[9];
  inv[12] = -m[4]*m[9]*m[14]  + m[4]*m[10]*m[13] + m[8]*m[5]*m[14] - m[8]*m[6]*m[13] - m[12]*m[5]*m[10] + m[12]*m[6]*m[9];
  inv[1]  = -m[1]*m[10]*m[15] + m[1]*m[11]*m[14] + m[9]*m[2]*m[15] - m[9]*m[3]*m[14] - m[13]*m[2]*m[11] + m[13]*m[3]*m[10];
  inv[5]  =  m[0]*m[10]*m[15] - m[0]*m[11]*m[14] - m[8]*m[2]*m[15] + m[8]*m[3]*m[14] + m[12]*m[2]*m[11] - m[12]*m[3]*m[10];
  inv[9]  = -m[0]*m[9]*m[15]  + m[0]*m[11]*m[13] + m[8]*m[1]*m[15] - m[8]*m[3]*m[13] - m[12]*m[1]*m[11] + m[12]*m[3]*m[9];
  inv[13] =  m[0]*m[9]*m[14]  - m[0]*m[10]*m[13] - m[8]*m[1]*m[14] + m[8]*m[2]*m[13] + m[12]*m[1]*m[10] - m[12]*m[2]*m[9];
  inv[2]  =  m[1]*m[6]*m[15]  - m[1]*m[7]*m[14]  - m[5]*m[2]*m[15] + m[5]*m[3]*m[14] + m[13]*m[2]*m[7]  - m[13]*m[3]*m[6];
  inv[6]  = -m[0]*m[6]*m[15]  + m[0]*m[7]*m[14]  + m[4]*m[2]*m[15] - m[4]*m[3]*m[14] - m[12]*m[2]*m[7]  + m[12]*m[3]*m[6];
  inv[10] =  m[0]*m[5]*m[15]  - m[0]*m[7]*m[13]  - m[4]*m[1]*m[15] + m[4]*m[3]*m[13] + m[12]*m[1]*m[7]  - m[12]*m[3]*m[5];
  inv[14] = -m[0]*m[5]*m[14]  + m[0]*m[6]*m[13]  + m[4]*m[1]*m[14] - m[4]*m[2]*m[13] - m[12]*m[1]*m[6]  + m[12]*m[2]*m[5];
  inv[3]  = -m[1]*m[6]*m[11]  + m[1]*m[7]*m[10]  + m[5]*m[2]*m[11] - m[5]*m[3]*m[10] - m[9]*m[2]*m[7]   + m[9]*m[3]*m[6];
  inv[7]  =  m[0]*m[6]*m[11]  - m[0]*m[7]*m[10]  - m[4]*m[2]*m[11] + m[4]*m[3]*m[10] + m[8]*m[2]*m[7]   - m[8]*m[3]*m[6];
  inv[11] = -m[0]*m[5]*m[11]  + m[0]*m[7]*m[9]   + m[4]*m[1]*m[11] - m[4]*m[3]*m[9]  - m[8]*m[1]*m[7]   + m[8]*m[3]*m[5];
  inv[15] =  m[0]*m[5]*m[10]  - m[0]*m[6]*m[9]   - m[4]*m[1]*m[10] + m[4]*m[2]*m[9]  + m[8]*m[1]*m[6]   - m[8]*m[2]*m[5];

  const det = m[0]*inv[0] + m[1]*inv[4] + m[2]*inv[8] + m[3]*inv[12];
  if (Math.abs(det) < 1e-12) return Float64Array.from([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]);

  const invDet = 1.0 / det;
  for (let i = 0; i < 16; i++) inv[i] *= invDet;
  return inv;
}

/**
 * Build a 4x4 matrix from TRS (column-major).
 */
function mat4FromTRS(t, r, s) {
  const [x, y, z, w] = r;
  const x2 = x + x, y2 = y + y, z2 = z + z;
  const xx = x * x2, xy = x * y2, xz = x * z2;
  const yy = y * y2, yz = y * z2, zz = z * z2;
  const wx = w * x2, wy = w * y2, wz = w * z2;

  return Float64Array.from([
    (1 - (yy + zz)) * s[0], (xy + wz) * s[0],         (xz - wy) * s[0],         0,
    (xy - wz) * s[1],       (1 - (xx + zz)) * s[1],    (yz + wx) * s[1],         0,
    (xz + wy) * s[2],       (yz - wx) * s[2],          (1 - (xx + yy)) * s[2],   0,
    t[0],                    t[1],                       t[2],                      1,
  ]);
}

/**
 * Extract the 3x3 upper-left (rotation+scale) as a normal matrix (inverse transpose).
 * For transforming normals correctly.
 */
function mat3NormalFromMat4(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2];
  const a10 = m[4], a11 = m[5], a12 = m[6];
  const a20 = m[8], a21 = m[9], a22 = m[10];

  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;

  let det = a00 * b01 + a01 * b11 + a02 * b21;
  if (Math.abs(det) < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];

  det = 1.0 / det;
  return [
    b01 * det, (-a22 * a01 + a02 * a21) * det, (a12 * a01 - a02 * a11) * det,
    b11 * det, (a22 * a00 - a02 * a20) * det,  (-a12 * a00 + a02 * a10) * det,
    b21 * det, (-a21 * a00 + a01 * a20) * det, (a11 * a00 - a01 * a10) * det,
  ];
}

/**
 * Transform a vec3 by a 4x4 matrix (as a point, w=1).
 */
function vec3TransformMat4(v, m) {
  const x = v[0], y = v[1], z = v[2];
  const w = m[3] * x + m[7] * y + m[11] * z + m[15];
  return [
    (m[0] * x + m[4] * y + m[8]  * z + m[12]) / w,
    (m[1] * x + m[5] * y + m[9]  * z + m[13]) / w,
    (m[2] * x + m[6] * y + m[10] * z + m[14]) / w,
  ];
}

/**
 * Transform a vec3 normal by a 3x3 normal matrix, then normalize.
 */
function vec3TransformNormal(v, nm) {
  const x = v[0], y = v[1], z = v[2];
  const rx = nm[0] * x + nm[3] * y + nm[6] * z;
  const ry = nm[1] * x + nm[4] * y + nm[7] * z;
  const rz = nm[2] * x + nm[5] * y + nm[8] * z;
  const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  return [rx / len, ry / len, rz / len];
}

/**
 * Transform a vec4 tangent by a 4x4 matrix. Preserves the w (handedness) component.
 */
function vec4TransformTangent(v, m) {
  const x = v[0], y = v[1], z = v[2], w = v[3];
  const rx = m[0] * x + m[4] * y + m[8]  * z;
  const ry = m[1] * x + m[5] * y + m[9]  * z;
  const rz = m[2] * x + m[6] * y + m[10] * z;
  const len = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  return [rx / len, ry / len, rz / len, w];
}

/**
 * Compute world transform for a gltf-transform Node.
 */
function getWorldTransform(node) {
  const localMat = mat4FromTRS(
    node.getTranslation(),
    node.getRotation(),
    node.getScale()
  );
  const parent = node.getParentNode();
  if (!parent) return localMat;
  return mat4Multiply(getWorldTransform(parent), localMat);
}

/**
 * Collect sets of nodes that must NOT have their transforms reset:
 * - Joints (referenced by any skin)
 * - Nodes targeted by animation channels
 * - Skinned mesh nodes
 */
function getProtectedNodes(document) {
  const root = document.getRoot();
  const protectedNodes = new Set();

  // Joints
  for (const skin of root.listSkins()) {
    for (const joint of skin.listJoints()) {
      protectedNodes.add(joint);
    }
  }

  // Skinned mesh nodes
  for (const node of root.listNodes()) {
    if (node.getSkin()) protectedNodes.add(node);
  }

  // Animation targets
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      const target = channel.getTargetNode();
      if (target) protectedNodes.add(target);
    }
  }

  return protectedNodes;
}

/**
 * Apply transforms to all nodes in the document.
 * Bakes world transforms into mesh vertices and resets node TRS to identity.
 * Skips joints, skinned mesh nodes, and animation targets to preserve animations.
 */
function applyTransforms(document) {
  const root = document.getRoot();
  const nodes = root.listNodes();
  const protectedNodes = getProtectedNodes(document);

  // Build a map of which meshes are used by which nodes (meshes can be instanced)
  const meshNodeMap = new Map();
  for (const node of nodes) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    if (!meshNodeMap.has(mesh)) meshNodeMap.set(mesh, []);
    meshNodeMap.get(mesh).push(node);
  }

  // Track which Accessors have already been transformed to avoid double-transform on shared data
  const transformedAccessors = new Set();

  // Process meshes: bake world transform into vertex data
  for (const [mesh, meshNodes] of meshNodeMap) {
    // For instanced meshes (shared by multiple nodes), skip baking
    if (meshNodes.length > 1) continue;

    const node = meshNodes[0];

    // Skip protected nodes (joints, skinned meshes, animation targets)
    if (protectedNodes.has(node)) continue;

    const worldMat = getWorldTransform(node);

    // Skip if already identity
    const identity = [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
    let isIdentity = true;
    for (let i = 0; i < 16; i++) {
      if (Math.abs(worldMat[i] - identity[i]) > 1e-6) { isIdentity = false; break; }
    }
    if (isIdentity) continue;

    const normalMat = mat3NormalFromMat4(worldMat);

    for (const primitive of mesh.listPrimitives()) {
      const position = primitive.getAttribute('POSITION');
      if (position && !transformedAccessors.has(position)) {
        transformedAccessors.add(position);
        for (let i = 0; i < position.getCount(); i++) {
          const v = position.getElement(i, [0, 0, 0]);
          position.setElement(i, vec3TransformMat4(v, worldMat));
        }
      }

      const normal = primitive.getAttribute('NORMAL');
      if (normal && !transformedAccessors.has(normal)) {
        transformedAccessors.add(normal);
        for (let i = 0; i < normal.getCount(); i++) {
          const v = normal.getElement(i, [0, 0, 0]);
          normal.setElement(i, vec3TransformNormal(v, normalMat));
        }
      }

      const tangent = primitive.getAttribute('TANGENT');
      if (tangent && !transformedAccessors.has(tangent)) {
        transformedAccessors.add(tangent);
        for (let i = 0; i < tangent.getCount(); i++) {
          const v = tangent.getElement(i, [0, 0, 0, 0]);
          tangent.setElement(i, vec4TransformTangent(v, worldMat));
        }
      }
    }
  }

  // Reset only non-protected node transforms to identity
  for (const node of nodes) {
    if (protectedNodes.has(node)) continue;
    node.setTranslation([0, 0, 0]);
    node.setRotation([0, 0, 0, 1]);
    node.setScale([1, 1, 1]);
  }
}

/**
 * Check if a node's TRS is identity.
 */
function isIdentityTRS(node) {
  const t = node.getTranslation();
  const r = node.getRotation();
  const s = node.getScale();
  const eps = 1e-6;
  return (
    Math.abs(t[0]) < eps && Math.abs(t[1]) < eps && Math.abs(t[2]) < eps &&
    Math.abs(r[0]) < eps && Math.abs(r[1]) < eps && Math.abs(r[2]) < eps && Math.abs(r[3] - 1) < eps &&
    Math.abs(s[0] - 1) < eps && Math.abs(s[1] - 1) < eps && Math.abs(s[2] - 1) < eps
  );
}

/**
 * Decompose a 4x4 column-major matrix into TRS.
 */
function decomposeMat4(m) {
  const translation = [m[12], m[13], m[14]];

  const sx = Math.sqrt(m[0]*m[0] + m[1]*m[1] + m[2]*m[2]);
  const sy = Math.sqrt(m[4]*m[4] + m[5]*m[5] + m[6]*m[6]);
  const sz = Math.sqrt(m[8]*m[8] + m[9]*m[9] + m[10]*m[10]);
  const scale = [sx, sy, sz];

  // Normalize rotation matrix
  const r00 = m[0]/sx, r01 = m[1]/sx, r02 = m[2]/sx;
  const r10 = m[4]/sy, r11 = m[5]/sy, r12 = m[6]/sy;
  const r20 = m[8]/sz, r21 = m[9]/sz, r22 = m[10]/sz;

  // Rotation matrix to quaternion
  const trace = r00 + r11 + r22;
  let qx, qy, qz, qw;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1.0);
    qw = 0.25 / s;
    qx = (r12 - r21) * s;
    qy = (r20 - r02) * s;
    qz = (r01 - r10) * s;
  } else if (r00 > r11 && r00 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r00 - r11 - r22);
    qw = (r12 - r21) / s;
    qx = 0.25 * s;
    qy = (r10 + r01) / s;
    qz = (r20 + r02) / s;
  } else if (r11 > r22) {
    const s = 2.0 * Math.sqrt(1.0 + r11 - r00 - r22);
    qw = (r20 - r02) / s;
    qx = (r10 + r01) / s;
    qy = 0.25 * s;
    qz = (r21 + r12) / s;
  } else {
    const s = 2.0 * Math.sqrt(1.0 + r22 - r00 - r11);
    qw = (r01 - r10) / s;
    qx = (r20 + r02) / s;
    qy = (r21 + r12) / s;
    qz = 0.25 * s;
  }
  const rotation = [qx, qy, qz, qw];

  return { translation, rotation, scale };
}

/**
 * Fix armature transforms for skinned meshes.
 *
 * Re-parents skinned mesh nodes to the scene root, preserving their
 * world transform as the new local transform. This resolves:
 * - "Node with a skinned mesh is not root" warnings
 * - "Ancestor has non-identity transform" warnings (for USD conversion)
 *
 * Does NOT clear ancestor transforms — joints remain under the original
 * hierarchy so that the skinning equation (which cancels mesh world vs
 * joint world) and animation keyframes are preserved correctly.
 */
function fixArmatureTransforms(document) {
  const root = document.getRoot();
  const nodes = root.listNodes();

  const skinnedNodes = nodes.filter(n => n.getSkin());
  if (skinnedNodes.length === 0) return;

  const scenes = root.listScenes();
  if (scenes.length === 0) return;
  const scene = scenes[0];

  // Check if a node is a direct child of the scene (root-level)
  const sceneChildren = new Set(scene.listChildren());

  for (const skinNode of skinnedNodes) {
    if (sceneChildren.has(skinNode)) continue; // already at scene root

    // Compute current world transform before re-parenting
    const worldMat = getWorldTransform(skinNode);
    const { translation, rotation, scale } = decomposeMat4(worldMat);

    // Detach from parent, attach to scene root
    const parent = skinNode.getParentNode();
    if (parent) parent.removeChild(skinNode);
    scene.addChild(skinNode);

    // Preserve world transform as new local transform
    // This maintains visual size/position (e.g., 0.01 scale from ancestor)
    skinNode.setTranslation(translation);
    skinNode.setRotation(rotation);
    skinNode.setScale(scale);
  }
}

/**
 * Sanitize inverseBindMatrices to fix floating-point precision artifacts.
 * Snaps near-zero values to 0 and near-one values to 1 in the affine row
 * (indices 3, 7, 11, 15 of each MAT4), which must be [0, 0, 0, 1].
 */
function sanitizeInverseBindMatrices(document) {
  const root = document.getRoot();
  const eps = 1e-10;

  for (const skin of root.listSkins()) {
    const ibmAccessor = skin.getInverseBindMatrices();
    if (!ibmAccessor) continue;

    for (let i = 0; i < ibmAccessor.getCount(); i++) {
      const mat = ibmAccessor.getElement(i, new Array(16).fill(0));
      let changed = false;

      for (let j = 0; j < 16; j++) {
        if (Math.abs(mat[j]) < eps) {
          if (mat[j] !== 0) { mat[j] = 0; changed = true; }
        } else if (Math.abs(mat[j] - 1) < eps) {
          if (mat[j] !== 1) { mat[j] = 1; changed = true; }
        } else if (Math.abs(mat[j] + 1) < eps) {
          if (mat[j] !== -1) { mat[j] = -1; changed = true; }
        }
      }

      // Enforce affine bottom row: [0, 0, 0, 1]
      if (mat[3] !== 0 || mat[7] !== 0 || mat[11] !== 0 || mat[15] !== 1) {
        mat[3] = 0; mat[7] = 0; mat[11] = 0; mat[15] = 1;
        changed = true;
      }

      if (changed) {
        ibmAccessor.setElement(i, mat);
      }
    }
  }
}

/**
 * Merge all buffers in the document into one (GLB requires 0–1 buffers).
 */
function mergeBuffers(document) {
  const root = document.getRoot();
  const buffers = root.listBuffers();
  if (buffers.length > 1) {
    const keepBuffer = buffers[0];
    for (let i = 1; i < buffers.length; i++) {
      buffers[i].dispose();
    }
    for (const accessor of root.listAccessors()) {
      if (!accessor.getBuffer()) {
        accessor.setBuffer(keepBuffer);
      }
    }
  }
}

/**
 * Auto-fix a GLB file with the specified options.
 * @param {File} file - Input GLB file
 * @param {Object} options - Fix options
 * @param {boolean} options.applyTransforms - Bake all node transforms into vertices
 * @param {boolean} options.fixArmatureTransforms - Fix ancestor transforms of skinned meshes
 * @param {boolean} options.removeUnused - Remove unused objects
 * @param {boolean} options.generateTangents - Generate missing tangents for normal-mapped meshes
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function autoFixGLB(file, options = {}) {
  const document = await readDocument(file);

  if (options.fixArmatureTransforms) {
    fixArmatureTransforms(document);
  }

  if (options.applyTransforms) {
    applyTransforms(document);
  }

  if (options.generateTangents) {
    const { generateTangents } = await import('mikktspace');
    await document.transform(tangents({ generateTangents }));
  }

  if (options.removeUnused) {
    await document.transform(prune());
  }

  sanitizeInverseBindMatrices(document);
  mergeBuffers(document);
  return writeGLB(document);
}
