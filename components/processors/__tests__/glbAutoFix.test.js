import { describe, it, expect } from 'vitest';
import { Document, NodeIO } from '@gltf-transform/core';
import draco3d from 'draco3dgltf';
import { validateBytes } from 'gltf-validator';
import { Matrix4 } from 'three';
import {
  fixDocument,
  KHRDracoMeshCompressionSkipSkinned,
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
} from '../glbAutoFix';

const ALL_OPTIONS = {
  applyTransforms: true,
  fixArmatureTransforms: true,
  normalizeNormals: true,
  closeSkeletonHierarchy: true,
  mergeSkinnedMeshes: true,
  removeConstantAnimationChannels: true,
  completeJointAnimationChannels: true,
  normalizeSkinWeights: true,
  optimizeSkinJoints: true,
  removeUnused: true,
};

const TRS = ['translation', 'rotation', 'scale'];

const invert = (m) => new Matrix4().fromArray(m).invert().toArray();
const multiply = (a, b) => new Matrix4().multiplyMatrices(new Matrix4().fromArray(a), new Matrix4().fromArray(b)).toArray();

/**
 * Build a small rig with the same kinds of problems as a real-world file
 * that broke in AR Quick Look:
 *
 * Scene
 * ├─ Root (non-joint)                  ← skin.skeleton, not a joint
 * │  ├─ JointA (T 0,1,0)               ← animated: rotation changes, T/S constant
 * │  │  └─ JointB (T 0,0.5,0)          ← animated: rotation only
 * │  ├─ Group (T 1.2,0,0 / S 1.58)     ← non-joint between root and JointC
 * │  │  ├─ BunnyMesh (skinned)         ← skinned mesh under a transformed parent
 * │  │  └─ JointC (T 0,0.2,0)          ← animated: constant T (≠ rest) and R
 * │  ├─ FlowerMesh (skinned)           ← second skinned mesh sharing the skin
 * │  └─ Static (mesh with bad normals)
 */
function createRig({ extraAnimation = false } = {}) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buffer);

  const scene = doc.createScene();
  const root = doc.createNode('Root');
  scene.addChild(root);

  const jointA = doc.createNode('JointA').setTranslation([0, 1, 0]);
  const jointB = doc.createNode('JointB').setTranslation([0, 0.5, 0]);
  jointA.addChild(jointB);
  const group = doc.createNode('Group').setTranslation([1.2, 0, 0]).setScale([1.58, 1.58, 1.58]);
  const jointC = doc.createNode('JointC').setTranslation([0, 0.2, 0]);
  group.addChild(jointC);
  root.addChild(jointA);
  root.addChild(group);

  // Child listed before its parent on purpose (USD needs parent-first order)
  const joints = [jointB, jointA, jointC];
  const ibm = new Float32Array(joints.length * 16);
  joints.forEach((joint, i) => ibm.set(invert(joint.getWorldMatrix()), i * 16));
  const skin = doc.createSkin('Skin').setInverseBindMatrices(acc('MAT4', ibm)).setSkeleton(root);
  joints.forEach(joint => skin.addJoint(joint));

  // Flower: weighted to JointA / JointB (index 1 / 0); one vertex sums to 0.9998
  const flowerPrim = doc.createPrimitive().setName('flower')
    .setAttribute('POSITION', acc('VEC3', new Float32Array([0, 1, 0, 0.1, 1.2, 0, 0, 1.5, 0])))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array([1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0])))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array([1, 0, 0, 0, 0.5, 0.4998, 0, 0, 1, 0, 0, 0])))
    .setIndices(acc('SCALAR', new Uint16Array([0, 1, 2])));
  const flowerNode = doc.createNode('FlowerMesh').setMesh(doc.createMesh('Flower').addPrimitive(flowerPrim)).setSkin(skin);
  root.addChild(flowerNode);

  // Bunny: weighted to JointC (index 2), positions in bind (world) space
  const bunnyPrim = doc.createPrimitive().setName('bunny')
    .setAttribute('POSITION', acc('VEC3', new Float32Array([1.2, 0.3, 0, 1.3, 0.4, 0, 1.2, 0.5, 0.1])))
    .setAttribute('JOINTS_0', acc('VEC4', new Uint16Array([2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0])))
    .setAttribute('WEIGHTS_0', acc('VEC4', new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])))
    .setIndices(acc('SCALAR', new Uint16Array([0, 1, 2])));
  const bunnyNode = doc.createNode('BunnyMesh').setMesh(doc.createMesh('Bunny').addPrimitive(bunnyPrim)).setSkin(skin);
  group.addChild(bunnyNode);

  const staticPrim = doc.createPrimitive().setName('static')
    .setAttribute('POSITION', acc('VEC3', new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0])))
    .setAttribute('NORMAL', acc('VEC3', new Float32Array([0, 0, 0, 0, 0, 2, 0, 0, 1])))
    .setIndices(acc('SCALAR', new Uint16Array([0, 1, 2])));
  root.addChild(doc.createNode('Static').setMesh(doc.createMesh('Static').addPrimitive(staticPrim)));

  const times = acc('SCALAR', new Float32Array([0, 1]));
  const animation = doc.createAnimation('Loop');
  const addChannel = (anim, node, path, values) => {
    const sampler = doc.createAnimationSampler()
      .setInput(times)
      .setOutput(acc(path === 'rotation' ? 'VEC4' : 'VEC3', new Float32Array(values)))
      .setInterpolation('LINEAR');
    anim.addSampler(sampler).addChannel(
      doc.createAnimationChannel().setTargetNode(node).setTargetPath(path).setSampler(sampler)
    );
  };
  const s = Math.SQRT1_2;
  addChannel(animation, jointA, 'rotation', [0, 0, 0, 1, 0, 0, s, s]);
  addChannel(animation, jointA, 'translation', [0, 1, 0, 0, 1, 0]);
  addChannel(animation, jointA, 'scale', [1, 1, 1, 1, 1, 1]);
  addChannel(animation, jointB, 'rotation', [0, 0, 0, 1, s, 0, 0, s]);
  addChannel(animation, jointC, 'translation', [0, 0.3, 0, 0, 0.3, 0]);
  addChannel(animation, jointC, 'rotation', [0, 0, 0, 1, 0, 0, 0, 1]);

  if (extraAnimation) {
    const other = doc.createAnimation('Other');
    addChannel(other, jointB, 'rotation', [0, 0, 0, 1, 0, 0, 0, 1]);
  }

  return { doc, root, jointA, jointB, jointC, group, skin, flowerNode, bunnyNode };
}

/** Pose every animated node at the first keyframe of the first animation. */
function poseAtFirstKey(doc) {
  const animation = doc.getRoot().listAnimations()[0];
  for (const channel of animation.listChannels()) {
    const output = channel.getSampler().getOutput();
    const value = output.getElement(0, new Array(output.getElementSize()).fill(0));
    const node = channel.getTargetNode();
    const path = channel.getTargetPath();
    if (path === 'translation') node.setTranslation(value);
    else if (path === 'rotation') node.setRotation(value);
    else if (path === 'scale') node.setScale(value);
  }
}

/**
 * Linear blend skinning as defined by glTF (the skinned node's own transform is ignored).
 * Returns { [primitiveName]: [[x, y, z], ...] } with weights normalized, so the result
 * only reflects geometry, not weight drift.
 */
function skinnedPositions(doc) {
  const result = {};
  for (const node of doc.getRoot().listNodes()) {
    const skin = node.getSkin();
    if (!skin) continue;
    const ibm = skin.getInverseBindMatrices();
    const jointMatrices = skin.listJoints().map((joint, i) =>
      multiply(joint.getWorldMatrix(), ibm.getElement(i, new Array(16).fill(0)))
    );
    for (const prim of node.getMesh().listPrimitives()) {
      const position = prim.getAttribute('POSITION');
      const jointsAttr = prim.getAttribute('JOINTS_0');
      const weightsAttr = prim.getAttribute('WEIGHTS_0');
      const out = [];
      for (let i = 0; i < position.getCount(); i++) {
        const [x, y, z] = position.getElement(i, [0, 0, 0]);
        const j = jointsAttr.getElement(i, [0, 0, 0, 0]);
        const w = weightsAttr.getElement(i, [0, 0, 0, 0]);
        const sum = w.reduce((a, b) => a + b, 0);
        const p = [0, 0, 0];
        for (let k = 0; k < 4; k++) {
          if (!w[k]) continue;
          const m = jointMatrices[j[k]];
          for (let c = 0; c < 3; c++) p[c] += (w[k] / sum) * (m[c] * x + m[4 + c] * y + m[8 + c] * z + m[12 + c]);
        }
        out.push(p);
      }
      result[prim.getName()] = out;
    }
  }
  return result;
}

function expectPositionsClose(actual, expected) {
  expect(Object.keys(actual).sort()).toEqual(Object.keys(expected).sort());
  for (const name of Object.keys(expected)) {
    expected[name].forEach((p, i) => {
      p.forEach((v, c) => expect(actual[name][i][c]).toBeCloseTo(v, 5));
    });
  }
}

function channelPaths(doc) {
  const paths = new Map();
  for (const animation of doc.getRoot().listAnimations()) {
    for (const channel of animation.listChannels()) {
      const name = channel.getTargetNode().getName();
      if (!paths.has(name)) paths.set(name, new Set());
      paths.get(name).add(channel.getTargetPath());
    }
  }
  return paths;
}

async function createIO() {
  return new NodeIO()
    .registerExtensions([KHRDracoMeshCompressionSkipSkinned])
    .registerDependencies({
      'draco3d.decoder': await draco3d.createDecoderModule(),
      'draco3d.encoder': await draco3d.createEncoderModule(),
    });
}

function readGLBJson(glb) {
  const view = new DataView(glb.buffer, glb.byteOffset, glb.byteLength);
  const jsonLength = view.getUint32(12, true);
  return JSON.parse(new TextDecoder().decode(glb.slice(20, 20 + jsonLength)));
}

describe('fixArmatureTransforms', () => {
  it('moves skinned mesh nodes to the scene root with an identity transform', () => {
    const { doc, bunnyNode } = createRig();
    const before = skinnedPositions(doc);

    fixArmatureTransforms(doc);

    expect(doc.getRoot().listScenes()[0].listChildren()).toContain(bunnyNode);
    expect(bunnyNode.getParentNode()).toBeNull();
    expect(bunnyNode.getTranslation()).toEqual([0, 0, 0]);
    expect(bunnyNode.getScale()).toEqual([1, 1, 1]);
    expectPositionsClose(skinnedPositions(doc), before);
  });

  it('keeps the world transform of non-skeletal children', () => {
    const { doc, bunnyNode } = createRig();
    const attachment = doc.createNode('Attachment').setTranslation([0, 1, 0]);
    bunnyNode.addChild(attachment);
    const worldBefore = attachment.getWorldMatrix();

    fixArmatureTransforms(doc);

    expect(attachment.getParentNode()).toBeNull();
    attachment.getWorldMatrix().forEach((v, i) => expect(v).toBeCloseTo(worldBefore[i], 6));
  });

  it('keeps the world transform on the node when a child is a joint', () => {
    const { doc, bunnyNode, skin } = createRig();
    const joint = doc.createNode('ChildJoint');
    bunnyNode.addChild(joint);
    skin.addJoint(joint);

    fixArmatureTransforms(doc);

    expect(bunnyNode.getTranslation()[0]).toBeCloseTo(1.2, 6);
    expect(bunnyNode.getScale()[0]).toBeCloseTo(1.58, 6);
  });
});

describe('closeSkeletonHierarchy', () => {
  it('adds a root joint and registers non-joint ancestors as joints', () => {
    const { doc, root, group, skin } = createRig();
    fixArmatureTransforms(doc);
    const before = skinnedPositions(doc);

    closeSkeletonHierarchy(doc);

    const joints = skin.listJoints();
    const jointSet = new Set(joints);
    const skeletonRoot = joints.find(j => j.getName() === 'SkeletonRoot');
    expect(skeletonRoot).toBeDefined();
    expect(skeletonRoot.getParentNode()).toBe(root);
    expect(jointSet.has(group)).toBe(true);
    // Every joint except the root joint has a joint parent
    for (const joint of joints) {
      if (joint !== skeletonRoot) expect(jointSet.has(joint.getParentNode())).toBe(true);
    }
    // IBM of an added joint is the inverse of its rest world matrix
    const groupIBM = skin.getInverseBindMatrices().getElement(joints.indexOf(group), new Array(16).fill(0));
    invert(group.getWorldMatrix()).forEach((v, i) => expect(groupIBM[i]).toBeCloseTo(v, 5));
    expectPositionsClose(skinnedPositions(doc), before);
  });

  it('does nothing when the joints already form a closed hierarchy', () => {
    const doc = new Document();
    const parent = doc.createNode('Parent');
    const child = doc.createNode('Child');
    parent.addChild(child);
    doc.createScene().addChild(parent);
    const skin = doc.createSkin().addJoint(parent).addJoint(child);

    closeSkeletonHierarchy(doc);

    expect(skin.listJoints()).toEqual([parent, child]);
    expect(doc.getRoot().listNodes()).toHaveLength(2);
  });
});

describe('mergeSkinnedMeshes', () => {
  it('merges skinned mesh nodes that share a skin into one node', () => {
    const { doc, skin } = createRig();
    fixArmatureTransforms(doc);
    const before = skinnedPositions(doc);

    mergeSkinnedMeshes(doc);

    const skinnedNodes = doc.getRoot().listNodes().filter(n => n.getSkin() === skin);
    expect(skinnedNodes).toHaveLength(1);
    expect(skinnedNodes[0].getMesh().listPrimitives().map(p => p.getName()).sort()).toEqual(['bunny', 'flower']);
    expectPositionsClose(skinnedPositions(doc), before);
  });

  it('does not merge meshes with morph targets', () => {
    const { doc, skin, flowerNode } = createRig();
    fixArmatureTransforms(doc);
    const target = doc.createPrimitiveTarget()
      .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(9)));
    flowerNode.getMesh().listPrimitives()[0].addTarget(target);

    mergeSkinnedMeshes(doc);

    expect(doc.getRoot().listNodes().filter(n => n.getSkin() === skin)).toHaveLength(2);
  });
});

describe('optimizeSkinJoints', () => {
  it('orders joints parent-first and stores JOINTS_0 as UNSIGNED_BYTE', () => {
    const { doc, skin, jointA, jointB } = createRig();
    fixArmatureTransforms(doc);
    closeSkeletonHierarchy(doc);
    const before = skinnedPositions(doc);

    optimizeSkinJoints(doc);

    const joints = skin.listJoints();
    expect(joints.indexOf(jointA)).toBeLessThan(joints.indexOf(jointB));
    for (const node of doc.getRoot().listNodes().filter(n => n.getSkin())) {
      for (const prim of node.getMesh().listPrimitives()) {
        expect(prim.getAttribute('JOINTS_0').getArray()).toBeInstanceOf(Uint8Array);
      }
    }
    expectPositionsClose(skinnedPositions(doc), before);
  });

  it('skips skins whose joints do not form a single tree', () => {
    const { doc, skin } = createRig();
    const order = skin.listJoints();

    optimizeSkinJoints(doc); // JointA/JointB and JointC have different parents

    expect(skin.listJoints()).toEqual(order);
  });
});

describe('removeConstantAnimationChannels', () => {
  it('removes channels of nodes that never move and bakes their values', () => {
    const { doc, jointC } = createRig();

    removeConstantAnimationChannels(doc);

    expect(channelPaths(doc).has('JointC')).toBe(false);
    expect(jointC.getTranslation()[1]).toBeCloseTo(0.3, 6);
  });

  it('keeps every channel of a node that has at least one changing channel', () => {
    const { doc } = createRig();

    removeConstantAnimationChannels(doc);

    expect([...channelPaths(doc).get('JointA')].sort()).toEqual(['rotation', 'scale', 'translation']);
  });

  it('keeps constants that differ from the rest pose when there are several animations', () => {
    const { doc, jointC } = createRig({ extraAnimation: true });

    removeConstantAnimationChannels(doc);

    expect(channelPaths(doc).has('JointC')).toBe(true);
    expect(jointC.getTranslation()[1]).toBeCloseTo(0.2, 6);
  });
});

describe('completeJointAnimationChannels', () => {
  it('adds missing translation / scale channels holding the rest value', () => {
    const { doc, jointB } = createRig();

    completeJointAnimationChannels(doc);

    expect([...channelPaths(doc).get('JointB')].sort()).toEqual(['rotation', 'scale', 'translation']);
    const translation = doc.getRoot().listAnimations()[0].listChannels()
      .find(c => c.getTargetNode() === jointB && c.getTargetPath() === 'translation');
    const output = translation.getSampler().getOutput();
    for (let i = 0; i < output.getCount(); i++) {
      expect(output.getElement(i, [0, 0, 0])).toEqual([0, 0.5, 0]);
    }
    expect(translation.getSampler().getInput().getArray()).toEqual(new Float32Array([0, 1]));
  });

  it('does not touch animated nodes that are not joints', () => {
    const { doc } = createRig();
    const plain = doc.createNode('Plain');
    const animation = doc.getRoot().listAnimations()[0];
    const sampler = doc.createAnimationSampler()
      .setInput(doc.createAccessor().setType('SCALAR').setArray(new Float32Array([0, 1])))
      .setOutput(doc.createAccessor().setType('VEC4').setArray(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1])));
    animation.addSampler(sampler).addChannel(
      doc.createAnimationChannel().setTargetNode(plain).setTargetPath('rotation').setSampler(sampler)
    );

    completeJointAnimationChannels(doc);

    expect([...channelPaths(doc).get('Plain')]).toEqual(['rotation']);
  });
});

describe('normalizeSkinWeights', () => {
  it('makes every vertex weight sum to 1', () => {
    const { doc, flowerNode } = createRig();

    normalizeSkinWeights(doc);

    const weights = flowerNode.getMesh().listPrimitives()[0].getAttribute('WEIGHTS_0');
    for (let i = 0; i < weights.getCount(); i++) {
      const sum = weights.getElement(i, [0, 0, 0, 0]).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(1, 6);
    }
  });
});

describe('normalizeNormals', () => {
  it('replaces zero-length normals and normalizes non-unit ones', () => {
    const { doc } = createRig();

    normalizeNormals(doc);

    const normal = doc.getRoot().listMeshes().find(m => m.getName() === 'Static')
      .listPrimitives()[0].getAttribute('NORMAL');
    expect(normal.getElement(0, [0, 0, 0])).toEqual([0, 0, 1]);
    expect(normal.getElement(1, [0, 0, 0])).toEqual([0, 0, 1]);
  });
});

describe('fixSkeletonRoots', () => {
  it('points skin.skeleton to the common ancestor of the joints', () => {
    const { doc, skin, jointA, jointB } = createRig();
    const lonely = doc.createSkin().addJoint(jointA).addJoint(jointB).setSkeleton(jointB);

    fixSkeletonRoots(doc);

    expect(lonely.getSkeleton()).toBe(jointA);
    expect(skin.getSkeleton().getName()).toBe('Root');
  });
});

describe('sanitizeInverseBindMatrices', () => {
  it('snaps float noise and enforces the affine bottom row', () => {
    const doc = new Document();
    const joint = doc.createNode('Joint');
    const ibm = doc.createAccessor().setType('MAT4').setArray(new Float32Array([
      1 + 1e-12, 1e-12, 0, 0.001,
      0, 1, 0, 0,
      0, 0, 1, 0,
      0, 0, 0, 1,
    ]));
    doc.createSkin().addJoint(joint).setInverseBindMatrices(ibm);

    sanitizeInverseBindMatrices(doc);

    expect(ibm.getElement(0, new Array(16).fill(0))).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
});

describe('KHRDracoMeshCompressionSkipSkinned', () => {
  it('compresses static primitives but leaves skinned primitives uncompressed', async () => {
    const { doc } = createRig();
    doc.createExtension(KHRDracoMeshCompressionSkipSkinned).setRequired(true);
    const io = await createIO();

    const json = readGLBJson(await io.writeBinary(doc));

    const byName = Object.fromEntries(json.meshes.map(m => [m.name, m.primitives[0]]));
    expect(byName.Static.extensions?.KHR_draco_mesh_compression).toBeDefined();
    expect(byName.Flower.extensions?.KHR_draco_mesh_compression).toBeUndefined();
    expect(byName.Flower.indices).toBeDefined();
    // Indices detached during prewrite are restored on the document
    for (const mesh of doc.getRoot().listMeshes()) {
      for (const prim of mesh.listPrimitives()) expect(prim.getIndices()).not.toBeNull();
    }
  });
});

describe('fixDocument (all rules)', () => {
  it('produces a closed, USD-friendly skeleton without changing the posed geometry', async () => {
    const baseline = createRig();
    poseAtFirstKey(baseline.doc);
    const expected = skinnedPositions(baseline.doc);

    const { doc } = createRig();
    await fixDocument(doc, ALL_OPTIONS);

    const root = doc.getRoot();
    const skinnedNodes = root.listNodes().filter(n => n.getSkin());
    expect(skinnedNodes).toHaveLength(1);
    expect(skinnedNodes[0].getParentNode()).toBeNull();

    const skin = root.listSkins()[0];
    const joints = skin.listJoints();
    const jointSet = new Set(joints);
    expect(jointSet.has(skin.getSkeleton())).toBe(true);
    joints.forEach((joint, i) => {
      if (i === 0) return;
      expect(joints.indexOf(joint.getParentNode())).toBeLessThan(i);
    });

    // Every animated joint keeps translation / rotation / scale (USD converters zero missing ones)
    for (const [name, paths] of channelPaths(doc)) {
      const node = root.listNodes().find(n => n.getName() === name);
      if (jointSet.has(node)) expect([...paths].sort()).toEqual([...TRS].sort());
    }

    poseAtFirstKey(doc);
    expectPositionsClose(skinnedPositions(doc), expected);
  });

  it('writes a GLB that passes the glTF validator', async () => {
    const { doc } = createRig();
    doc.createExtension(KHRDracoMeshCompressionSkipSkinned).setRequired(true);
    await fixDocument(doc, ALL_OPTIONS);
    const io = await createIO();

    const report = await validateBytes(await io.writeBinary(doc));

    expect(report.issues.messages.filter(m => m.severity === 0)).toEqual([]);
  });
});
