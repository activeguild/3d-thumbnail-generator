import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter';

/**
 * Remove animations from a GLB file
 * @param {File} file - Input GLB file
 * @returns {Promise<Blob>} - Processed GLB file as Blob
 */
export async function removeAnimationsFromGLB(file) {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader();
    const dracoLoader = new DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
    loader.setDRACOLoader(dracoLoader);

    const fileUrl = URL.createObjectURL(file);

    loader.load(
      fileUrl,
      (gltf) => {
        URL.revokeObjectURL(fileUrl);

        // Remove animations
        gltf.animations = [];

        // Export back to GLB
        const exporter = new GLTFExporter();
        exporter.parse(
          gltf.scene,
          (result) => {
            const blob = new Blob([result], { type: 'model/gltf-binary' });
            resolve(blob);
          },
          (error) => {
            reject(new Error('Failed to export GLB: ' + error.message));
          },
          { binary: true }
        );
      },
      undefined,
      (error) => {
        URL.revokeObjectURL(fileUrl);
        reject(new Error('Failed to load GLB: ' + error.message));
      }
    );
  });
}
