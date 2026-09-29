import { WebIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { prune } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import { MeshoptDecoder, MeshoptEncoder } from 'meshoptimizer';

let _io = null;

/**
 * Draco extension that leaves skinned primitives (JOINTS_0 / WEIGHTS_0) uncompressed.
 * Draco quantizes skin weights so they no longer sum to 1, and some USDZ converters
 * mishandle Draco-compressed skinned meshes. gltf-transform skips non-indexed primitives,
 * so indices are detached during prewrite and restored before the primitives are written.
 */
class KHRDracoMeshCompressionSkipSkinned extends KHRDracoMeshCompression {
  prewrite(context, propertyType) {
    const detached = [];
    for (const mesh of this.document.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) {
        if (prim.getAttribute('JOINTS_0') && prim.getIndices()) {
          detached.push([prim, prim.getIndices()]);
          prim.setIndices(null);
        }
      }
    }
    try {
      return super.prewrite(context, propertyType);
    } finally {
      for (const [prim, indices] of detached) prim.setIndices(indices);
    }
  }
}

async function getIO() {
  if (!_io) {
    const [decoderModule, encoderModule] = await Promise.all([
      draco3d.createDecoderModule({ locateFile: (f) => `/draco/${f}` }),
      draco3d.createEncoderModule({ locateFile: (f) => `/draco/${f}` }),
    ]);
    await Promise.all([MeshoptDecoder.ready, MeshoptEncoder.ready]);
    _io = new WebIO()
      // Register every supported extension so unrelated ones (e.g. KHR_materials_unlit) survive the round trip
      .registerExtensions([
        ...ALL_EXTENSIONS.filter(ext => ext !== KHRDracoMeshCompression),
        KHRDracoMeshCompressionSkipSkinned,
      ])
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
 * - Ancestors of joints (their transforms affect joint world matrices)
 * - Nodes targeted by animation channels
 * - Skinned mesh nodes
 */
function getProtectedNodes(document) {
  const root = document.getRoot();
  const protectedNodes = new Set();

  // Joints and their ancestors
  for (const skin of root.listSkins()) {
    for (const joint of skin.listJoints()) {
      protectedNodes.add(joint);
      // Protect all ancestors — their transforms contribute to joint world matrices
      let ancestor = joint.getParentNode();
      while (ancestor) {
        protectedNodes.add(ancestor);
        ancestor = ancestor.getParentNode();
      }
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
 * Re-parents skinned mesh nodes to the scene root with an identity transform.
 * This resolves:
 * - "Node with a skinned mesh is not root" warnings
 * - "Ancestor has non-identity transform" warnings (for USD conversion)
 *
 * The glTF spec requires viewers to ignore the transform of a skinned mesh node
 * (vertices are placed by joint world matrices × IBM), so resetting it does not
 * change rendering, while USD converters that do apply it would double-transform.
 * Non-skeletal children are moved to the scene root with their world transform kept.
 * If a child is a joint or animated, the node's world transform is kept instead.
 * IBM and vertex data are left unchanged.
 */
function fixArmatureTransforms(document) {
  const root = document.getRoot();
  const nodes = root.listNodes();

  const skinnedNodes = nodes.filter(n => n.getSkin());
  if (skinnedNodes.length === 0) return;

  const scenes = root.listScenes();
  if (scenes.length === 0) return;
  const scene = scenes[0];

  const protectedNodes = getProtectedNodes(document);

  for (const skinNode of skinnedNodes) {
    const children = skinNode.listChildren();
    const canReset = children.every(child => !protectedNodes.has(child));

    // Compute current world transform before re-parenting
    const worldMat = getWorldTransform(skinNode);

    if (canReset) {
      for (const child of children) {
        const childTRS = decomposeMat4(getWorldTransform(child));
        scene.addChild(child);
        child.setTranslation(childTRS.translation);
        child.setRotation(childTRS.rotation);
        child.setScale(childTRS.scale);
      }
    }

    // Detach from parent, attach to scene root
    scene.addChild(skinNode);

    if (canReset) {
      skinNode.setTranslation([0, 0, 0]);
      skinNode.setRotation([0, 0, 0, 1]);
      skinNode.setScale([1, 1, 1]);
    } else {
      // Children depend on this node's transform; preserve world transform as local
      const { translation, rotation, scale } = decomposeMat4(worldMat);
      skinNode.setTranslation(translation);
      skinNode.setRotation(rotation);
      skinNode.setScale(scale);
    }
  }
}

/**
 * Merge skinned mesh nodes that share the same skin into a single node / mesh.
 * USD converters handle one skinned mesh per skeleton more reliably.
 * Only merges nodes at the scene root with identity transform, no children,
 * no morph targets, and meshes not shared with other nodes.
 */
function mergeSkinnedMeshes(document) {
  const root = document.getRoot();
  const scenes = root.listScenes();
  if (scenes.length === 0) return;
  const sceneChildren = new Set(scenes[0].listChildren());

  const meshUseCount = new Map();
  for (const node of root.listNodes()) {
    const mesh = node.getMesh();
    if (mesh) meshUseCount.set(mesh, (meshUseCount.get(mesh) || 0) + 1);
  }

  const morphTargetNodes = new Set();
  for (const animation of root.listAnimations()) {
    for (const channel of animation.listChannels()) {
      if (channel.getTargetPath() === 'weights') morphTargetNodes.add(channel.getTargetNode());
    }
  }

  const isMergeable = (node) => {
    const mesh = node.getMesh();
    return (
      mesh &&
      sceneChildren.has(node) &&
      isIdentityTRS(node) &&
      node.listChildren().length === 0 &&
      meshUseCount.get(mesh) === 1 &&
      !morphTargetNodes.has(node) &&
      mesh.getWeights().length === 0 &&
      mesh.listPrimitives().every(p => p.listTargets().length === 0)
    );
  };

  const nodesBySkin = new Map();
  for (const node of root.listNodes()) {
    const skin = node.getSkin();
    if (!skin || !isMergeable(node)) continue;
    if (!nodesBySkin.has(skin)) nodesBySkin.set(skin, []);
    nodesBySkin.get(skin).push(node);
  }

  for (const skinNodes of nodesBySkin.values()) {
    if (skinNodes.length < 2) continue;
    const targetMesh = skinNodes[0].getMesh();
    for (let i = 1; i < skinNodes.length; i++) {
      const mesh = skinNodes[i].getMesh();
      for (const prim of mesh.listPrimitives()) {
        mesh.removePrimitive(prim);
        targetMesh.addPrimitive(prim);
      }
      skinNodes[i].dispose();
      mesh.dispose();
    }
  }
}

/**
 * Find the lowest common ancestor (LCA) of the given nodes, or null if they
 * do not share an ancestor (e.g. separate scene roots).
 */
function findCommonAncestor(nodes) {
  const getAncestorChain = (node) => {
    const chain = [node];
    let current = node.getParentNode();
    while (current) {
      chain.push(current);
      current = current.getParentNode();
    }
    return chain;
  };

  let common = nodes[0];
  for (let i = 1; i < nodes.length && common; i++) {
    const ancestors = new Set(getAncestorChain(common));
    common = getAncestorChain(nodes[i]).find(n => ancestors.has(n)) || null;
  }
  return common;
}

/**
 * Make each skin a closed joint hierarchy rooted at a single joint.
 *
 * USD skeletons only contain nodes listed as joints, so a non-joint node between
 * the skeleton root and a joint (e.g. a scaled "group" node) loses its transform
 * on conversion. This:
 * - Adds a new "SkeletonRoot" joint (identity) when the common ancestor of the joints
 *   is not itself a joint, and moves the joint branches under it
 * - Adds every non-joint node on the path from the root joint to each joint as a joint,
 *   with IBM = inverse of its rest world matrix (no vertices are weighted to it)
 * World transforms, vertex data and existing IBMs are unchanged.
 */
function closeSkeletonHierarchy(document) {
  const root = document.getRoot();
  const scenes = root.listScenes();
  if (scenes.length === 0) return;
  const scene = scenes[0];

  for (const skin of root.listSkins()) {
    const joints = skin.listJoints();
    if (joints.length === 0) continue;
    const jointSet = new Set(joints);

    // All ancestors of joints, including the joints themselves
    const pathNodes = new Set();
    for (const joint of joints) {
      for (let n = joint; n && !pathNodes.has(n); n = n.getParentNode()) pathNodes.add(n);
    }

    let rootJoint = findCommonAncestor(joints);
    if (!rootJoint || !jointSet.has(rootJoint)) {
      const container = rootJoint;
      const containerChildren = container ? container.listChildren() : scene.listChildren();
      const branches = containerChildren.filter(child => pathNodes.has(child));
      // Joints spread over several scenes cannot be moved under one root safely
      if (!container && joints.some(j => !branches.includes(findTopAncestor(j)))) continue;

      rootJoint = document.createNode('SkeletonRoot');
      if (container) container.addChild(rootJoint);
      else scene.addChild(rootJoint);
      for (const branch of branches) rootJoint.addChild(branch);
    }

    // Collect non-joint nodes between the root joint and each joint
    const additions = jointSet.has(rootJoint) ? [] : [rootJoint];
    for (const joint of joints) {
      for (let n = joint.getParentNode(); n && n !== rootJoint; n = n.getParentNode()) {
        if (!jointSet.has(n) && !additions.includes(n)) additions.push(n);
      }
    }
    if (additions.length === 0) continue;

    const ibmAccessor = skin.getInverseBindMatrices();
    const ibmArray = new Float32Array((joints.length + additions.length) * 16);
    for (let i = 0; i < joints.length; i++) {
      const m = ibmAccessor
        ? ibmAccessor.getElement(i, new Array(16).fill(0))
        : [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
      ibmArray.set(m, i * 16);
    }
    additions.forEach((node, k) => {
      ibmArray.set(mat4Invert(getWorldTransform(node)), (joints.length + k) * 16);
      skin.addJoint(node);
    });

    const newIBM = document.createAccessor(ibmAccessor?.getName() || 'inverseBindMatrices')
      .setType('MAT4')
      .setArray(ibmArray)
      .setBuffer(ibmAccessor?.getBuffer() || root.listBuffers()[0] || null);
    skin.setInverseBindMatrices(newIBM);
  }
}

function findTopAncestor(node) {
  let n = node;
  while (n.getParentNode()) n = n.getParentNode();
  return n;
}

/**
 * Reorder skin joints so every parent comes before its children (USD skeleton
 * topology requirement), remapping JOINTS_n and IBM accordingly. Also stores
 * JOINTS_n as UNSIGNED_BYTE when the skin has 256 joints or fewer.
 * Skipped if the joints do not form a single tree or a mesh is shared between skins.
 */
function optimizeSkinJoints(document) {
  const root = document.getRoot();

  for (const skin of root.listSkins()) {
    const joints = skin.listJoints();
    if (joints.length === 0) continue;
    const jointSet = new Set(joints);

    const rootJoints = joints.filter(j => !jointSet.has(j.getParentNode()));
    if (rootJoints.length !== 1) continue;

    // Depth-first order from the root joint, parents before children
    const order = [];
    const visit = (node) => {
      if (!jointSet.has(node)) return;
      order.push(node);
      for (const child of node.listChildren()) visit(child);
    };
    visit(rootJoints[0]);
    if (order.length !== joints.length) continue;

    const skinnedNodes = root.listNodes().filter(n => n.getSkin() === skin && n.getMesh());
    const skinMeshes = new Set(skinnedNodes.map(n => n.getMesh()));
    const sharedWithOtherSkin = root.listNodes().some(
      n => n.getMesh() && skinMeshes.has(n.getMesh()) && n.getSkin() !== skin
    );
    if (sharedWithOtherSkin) continue;

    const oldIndex = new Map(joints.map((j, i) => [j, i]));
    const remap = order.map(j => oldIndex.get(j)); // new -> old
    const oldToNew = new Array(joints.length);
    remap.forEach((oldIdx, newIdx) => { oldToNew[oldIdx] = newIdx; });
    const reordered = remap.some((oldIdx, newIdx) => oldIdx !== newIdx);
    const ArrayType = joints.length <= 256 ? Uint8Array : Uint16Array;

    // Remap JOINTS_n accessors
    const replaced = new Map();
    for (const mesh of skinMeshes) {
      for (const prim of mesh.listPrimitives()) {
        for (const semantic of prim.listSemantics()) {
          if (!semantic.startsWith('JOINTS_')) continue;
          const accessor = prim.getAttribute(semantic);
          if (!replaced.has(accessor)) {
            if (!reordered && accessor.getArray() instanceof ArrayType) {
              replaced.set(accessor, accessor);
              continue;
            }
            const src = accessor.getArray();
            const dst = new ArrayType(src.length);
            for (let i = 0; i < src.length; i++) dst[i] = oldToNew[src[i]] ?? 0;
            replaced.set(accessor, accessor.clone().setArray(dst).setNormalized(false));
          }
          prim.setAttribute(semantic, replaced.get(accessor));
        }
      }
    }

    if (!reordered) continue;

    const ibmAccessor = skin.getInverseBindMatrices();
    if (ibmAccessor) {
      const ibmArray = new Float32Array(joints.length * 16);
      remap.forEach((oldIdx, newIdx) => {
        ibmArray.set(ibmAccessor.getElement(oldIdx, new Array(16).fill(0)), newIdx * 16);
      });
      skin.setInverseBindMatrices(ibmAccessor.clone().setArray(ibmArray));
    }

    for (const joint of joints) skin.removeJoint(joint);
    for (const joint of order) skin.addJoint(joint);
  }
}

const TRS_PATHS = ['translation', 'rotation', 'scale'];

function getRestTRS(node, path) {
  if (path === 'translation') return node.getTranslation();
  if (path === 'rotation') return node.getRotation();
  return node.getScale();
}

function setRestTRS(node, path, value) {
  if (path === 'translation') node.setTranslation(value);
  else if (path === 'rotation') node.setRotation(value);
  else node.setScale(value);
}

/**
 * Return the constant output value of a LINEAR / STEP sampler, or null if it changes.
 */
function getConstantSamplerValue(sampler, eps) {
  if (!sampler || sampler.getInterpolation() === 'CUBICSPLINE') return null;
  const output = sampler.getOutput();
  if (!output || output.getCount() === 0) return null;
  const size = output.getElementSize();
  const first = output.getElement(0, new Array(size).fill(0));
  for (let i = 1; i < output.getCount(); i++) {
    const v = output.getElement(i, new Array(size).fill(0));
    if (!v.every((x, k) => Math.abs(x - first[k]) < eps)) return null;
  }
  return first;
}

/**
 * Remove the animation channels of nodes that do not move at all in an animation
 * (every translation / rotation / scale channel of the node is constant).
 * Nodes with at least one changing channel keep all of their channels, because
 * USD converters fill a missing channel of an animated joint with zero / identity
 * instead of the node's rest value.
 * - If the constants equal the node's rest TRS, the channels are simply removed.
 * - If the document has a single animation, the constants are baked into the node's
 *   rest TRS first. With several animations the rest pose is shared, so nodes with
 *   differing constants are kept.
 * An animation always keeps at least one channel.
 */
function removeConstantAnimationChannels(document) {
  const root = document.getRoot();
  const animations = root.listAnimations();
  const canBake = animations.length === 1;
  const eps = 1e-6;

  const nearlyEqual = (a, b, path) => {
    const same = a.every((x, i) => Math.abs(x - b[i]) < eps);
    // q and -q are the same rotation
    if (!same && path === 'rotation') return a.every((x, i) => Math.abs(x + b[i]) < eps);
    return same;
  };

  for (const animation of animations) {
    const channelsByNode = new Map();
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      if (!node) continue;
      if (!channelsByNode.has(node)) channelsByNode.set(node, []);
      channelsByNode.get(node).push(channel);
    }

    for (const [node, channels] of channelsByNode) {
      if (channels.some(c => !TRS_PATHS.includes(c.getTargetPath()))) continue;
      const constants = channels.map(c => getConstantSamplerValue(c.getSampler(), eps));
      if (constants.some(v => v === null)) continue;

      const needsBake = channels.some((c, i) => !nearlyEqual(constants[i], getRestTRS(node, c.getTargetPath()), c.getTargetPath()));
      if (needsBake && !canBake) continue;
      if (animation.listChannels().length - channels.length < 1) continue;

      channels.forEach((channel, i) => {
        const sampler = channel.getSampler();
        if (needsBake) setRestTRS(node, channel.getTargetPath(), constants[i]);
        animation.removeChannel(channel);
        channel.dispose();
        if (!animation.listChannels().some(c => c.getSampler() === sampler)) {
          animation.removeSampler(sampler);
          sampler.dispose();
        }
      });
    }
  }
}

/**
 * Give every animated joint a translation, rotation and scale channel.
 * USD SkelAnimation stores all three per joint, and converters fill a missing
 * glTF channel with zero / identity instead of the node's rest value, which
 * collapses joints (e.g. a joint animated only by rotation loses its offset).
 * Missing channels are added as 2-key constant channels holding the rest value.
 */
function completeJointAnimationChannels(document) {
  const root = document.getRoot();
  const jointSet = new Set(root.listSkins().flatMap(skin => skin.listJoints()));
  if (jointSet.size === 0) return;

  for (const animation of root.listAnimations()) {
    const pathsByNode = new Map();
    let start = Infinity;
    let end = -Infinity;
    let buffer = null;
    for (const channel of animation.listChannels()) {
      const node = channel.getTargetNode();
      const input = channel.getSampler()?.getInput();
      if (input && input.getCount() > 0) {
        start = Math.min(start, input.getMin([0])[0]);
        end = Math.max(end, input.getMax([0])[0]);
        buffer = buffer || input.getBuffer();
      }
      if (!node || !jointSet.has(node)) continue;
      if (!pathsByNode.has(node)) pathsByNode.set(node, new Set());
      pathsByNode.get(node).add(channel.getTargetPath());
    }
    if (!Number.isFinite(start)) continue;

    let input = null;
    for (const [node, paths] of pathsByNode) {
      for (const path of TRS_PATHS) {
        if (paths.has(path)) continue;
        if (!input) {
          input = document.createAccessor()
            .setType('SCALAR')
            .setArray(new Float32Array(end > start ? [start, end] : [start]))
            .setBuffer(buffer);
        }
        const rest = getRestTRS(node, path);
        const values = end > start ? [...rest, ...rest] : [...rest];
        const output = document.createAccessor()
          .setType(path === 'rotation' ? 'VEC4' : 'VEC3')
          .setArray(new Float32Array(values))
          .setBuffer(buffer);
        const sampler = document.createAnimationSampler()
          .setInput(input)
          .setOutput(output)
          .setInterpolation('LINEAR');
        const channel = document.createAnimationChannel()
          .setTargetNode(node)
          .setTargetPath(path)
          .setSampler(sampler);
        animation.addSampler(sampler).addChannel(channel);
      }
    }
  }
}

/**
 * Normalize skin weights (WEIGHTS_0, WEIGHTS_1, ...) so each vertex sums to 1.
 * Fixes drift from Draco quantization and "Weights must sum to 1" validation errors.
 */
function normalizeSkinWeights(document) {
  const root = document.getRoot();
  const processed = new Set();

  for (const mesh of root.listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const weightSets = prim.listSemantics()
        .filter(s => s.startsWith('WEIGHTS_'))
        .map(s => prim.getAttribute(s));
      if (weightSets.length === 0 || weightSets.some(a => processed.has(a))) continue;
      weightSets.forEach(a => processed.add(a));

      const count = weightSets[0].getCount();
      for (let i = 0; i < count; i++) {
        const values = weightSets.map(a => a.getElement(i, [0, 0, 0, 0]));
        const sum = values.reduce((acc, v) => acc + v.reduce((a, b) => a + Math.max(b, 0), 0), 0);
        if (sum < 1e-8 || Math.abs(sum - 1) < 1e-6) continue;
        weightSets.forEach((a, k) => a.setElement(i, values[k].map(w => Math.max(w, 0) / sum)));
      }
    }
  }
}

/**
 * Fix skin.skeleton to point to the lowest common ancestor (LCA) of all joints.
 * Fixes "Skeleton node is not a common root" validation errors, which can exist
 * in the original file or be introduced by re-parenting.
 */
function fixSkeletonRoots(document) {
  const root = document.getRoot();

  for (const skin of root.listSkins()) {
    const joints = skin.listJoints();
    if (joints.length === 0) continue;

    const commonRoot = findCommonAncestor(joints);
    if (commonRoot && skin.getSkeleton() !== commonRoot) {
      skin.setSkeleton(commonRoot);
    }
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
 * Normalize all NORMAL vectors to unit length.
 * Replaces zero-length normals with [0, 0, 1] (default up-facing normal).
 * Fixes "Vector3 is not of unit length" validation errors.
 */
function normalizeNormals(document) {
  const root = document.getRoot();
  const processedAccessors = new Set();

  for (const mesh of root.listMeshes()) {
    for (const primitive of mesh.listPrimitives()) {
      const normal = primitive.getAttribute('NORMAL');
      if (!normal || processedAccessors.has(normal)) continue;
      processedAccessors.add(normal);

      for (let i = 0; i < normal.getCount(); i++) {
        const v = normal.getElement(i, [0, 0, 0]);
        const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
        if (len < 1e-6) {
          // Zero-length normal — replace with default
          normal.setElement(i, [0, 0, 1]);
        } else if (Math.abs(len - 1.0) > 1e-4) {
          // Non-unit-length — normalize
          normal.setElement(i, [v[0] / len, v[1] / len, v[2] / len]);
        }
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
 * Apply the auto-fix rules to a gltf-transform Document in place.
 * @param {Document} document - gltf-transform Document
 * @param {Object} options - Fix options (see autoFixGLB)
 */
export async function fixDocument(document, options = {}) {
  if (options.fixArmatureTransforms) {
    fixArmatureTransforms(document);
  }

  if (options.closeSkeletonHierarchy) {
    closeSkeletonHierarchy(document);
  }

  if (options.mergeSkinnedMeshes) {
    mergeSkinnedMeshes(document);
  }

  if (options.applyTransforms) {
    applyTransforms(document);
  }

  if (options.normalizeNormals) {
    normalizeNormals(document);
  }

  if (options.removeConstantAnimationChannels) {
    removeConstantAnimationChannels(document);
  }

  if (options.completeJointAnimationChannels) {
    completeJointAnimationChannels(document);
  }

  if (options.normalizeSkinWeights) {
    normalizeSkinWeights(document);
  }

  if (options.optimizeSkinJoints) {
    optimizeSkinJoints(document);
  }

  if (options.removeUnused) {
    await document.transform(prune());
  }

  fixSkeletonRoots(document);
  sanitizeInverseBindMatrices(document);
  mergeBuffers(document);
  return document;
}

/**
 * Auto-fix a GLB file with the specified options.
 * @param {File} file - Input GLB file
 * @param {Object} options - Fix options
 * @param {boolean} options.applyTransforms - Bake all node transforms into vertices
 * @param {boolean} options.fixArmatureTransforms - Fix ancestor transforms of skinned meshes
 * @param {boolean} options.removeUnused - Remove unused objects
 * @param {boolean} options.normalizeNormals - Normalize non-unit-length normal vectors
 * @param {boolean} options.closeSkeletonHierarchy - Add a root joint and turn non-joint nodes between joints into joints
 * @param {boolean} options.mergeSkinnedMeshes - Merge skinned mesh nodes that share a skin into one node
 * @param {boolean} options.removeConstantAnimationChannels - Remove animation channels of nodes that never move
 * @param {boolean} options.completeJointAnimationChannels - Give animated joints translation / rotation / scale channels
 * @param {boolean} options.normalizeSkinWeights - Normalize skin weights to sum to 1
 * @param {boolean} options.optimizeSkinJoints - Order joints parent-first and store JOINTS_n as UNSIGNED_BYTE when possible
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 *
 * Skinned primitives are always written without Draco compression.
 */
export async function autoFixGLB(file, options = {}) {
  const document = await readDocument(file);
  await fixDocument(document, options);
  return writeGLB(document);
}

// Exported for tests
export {
  KHRDracoMeshCompressionSkipSkinned,
  applyTransforms,
  fixArmatureTransforms,
  mergeSkinnedMeshes,
  closeSkeletonHierarchy,
  optimizeSkinJoints,
  removeConstantAnimationChannels,
  completeJointAnimationChannels,
  normalizeSkinWeights,
  normalizeNormals,
  fixSkeletonRoots,
  sanitizeInverseBindMatrices,
  mergeBuffers,
  decomposeMat4,
};
