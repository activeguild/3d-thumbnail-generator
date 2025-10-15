import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import apng from "sharp-apng";

export async function generateThumbnail(glbFilePath, outputFilePath, envMapUrl = null) {
  console.log('[DEBUG] Starting thumbnail generation...');
  console.log('[DEBUG] Input file:', glbFilePath);
  console.log('[DEBUG] Output file:', outputFilePath);

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  console.log('[DEBUG] Browser launched');

  const page = await browser.newPage();
  console.log('[DEBUG] New page created');

  // Listen to console messages from the page
  page.on('console', msg => console.log('[PAGE LOG]', msg.text()));
  page.on('pageerror', error => console.error('[PAGE ERROR]', error.message));

  // Navigate to about:blank
  await page.goto('about:blank');

  // Set basic HTML
  await page.setContent(`
    <html>
      <head>
        <style>body { margin: 0; background: #F2F6FF; }</style>
      </head>
      <body>
        <canvas id="canvas"></canvas>
      </body>
    </html>
  `);

  // Add Three.js scripts using addScriptTag
  console.log('[DEBUG] Loading Three.js scripts...');
  await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.150.0/build/three.min.js' });
  await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/loaders/GLTFLoader.js' });
  await page.addScriptTag({ url: 'https://cdn.jsdelivr.net/npm/three@0.150.0/examples/js/loaders/DRACOLoader.js' });
  console.log('[DEBUG] Three.js scripts loaded');

  // Execute rendering script
  await page.evaluate((glbPath) => {
    console.log('Initializing Three.js scene...');

    window.glbRendered = false;
    window.hasAnimations = false;

    const scene = new THREE.Scene();
    const canvasSize = 512;

    const camera = new THREE.OrthographicCamera(
      -canvasSize / 2, canvasSize / 2, canvasSize / 2, -canvasSize / 2, -1000, 1000
    );

    const renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('canvas'),
      antialias: true
    });
    renderer.setSize(canvasSize, canvasSize);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setClearColor(0xF2F6FF);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(1, 1, 1).normalize();
    scene.add(directionalLight);

    let mixer;
    let modelGroup = new THREE.Group();
    scene.add(modelGroup);

    const gltfLoader = new THREE.GLTFLoader();
    const dracoLoader = new THREE.DRACOLoader();
    dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.5/');
    gltfLoader.setDRACOLoader(dracoLoader);

    console.log('Starting to load GLB file:', glbPath);

    gltfLoader.load(
      glbPath,
      (gltf) => {
        console.log('GLB file loaded successfully');
        const model = gltf.scene;
        modelGroup.add(model);

        model.traverse((child) => {
          if (child.isMesh) {
            child.geometry.computeBoundingBox();
            child.material.side = THREE.DoubleSide;
            child.material.needsUpdate = true;
          }
        });

        if (gltf.animations && gltf.animations.length > 0) {
          mixer = new THREE.AnimationMixer(modelGroup);
          mixer.clipAction(gltf.animations[0]).play();
          window.hasAnimations = true;
        }

        setTimeout(() => {
          console.log('Processing model positioning...');
          const box = new THREE.Box3().setFromObject(modelGroup);
          const size = new THREE.Vector3();
          box.getSize(size);

          const maxDimension = Math.max(size.x, size.y, size.z);
          const targetSize = 0.7 * canvasSize;
          const scaleFactor = targetSize / maxDimension;
          modelGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);

          const center = new THREE.Vector3();
          box.getCenter(center);

          model.position.sub(center);
          modelGroup.position.x -= center.x;
          modelGroup.position.z -= center.z;
          modelGroup.position.y -= center.y / 2;

          const scaledBox = new THREE.Box3().setFromObject(modelGroup);
          const scaledSize = new THREE.Vector3();
          scaledBox.getSize(scaledSize);
          const yCorrection = (scaledSize.y - size.y * scaleFactor) / 2;
          modelGroup.position.y += yCorrection;

          camera.position.set(maxDimension * 1.5, maxDimension * 1.5, maxDimension * 1.5);
          camera.lookAt(0, 0, 0);

          camera.left = -canvasSize / 2;
          camera.right = canvasSize / 2;
          camera.top = canvasSize / 2;
          camera.bottom = -canvasSize / 2;
          camera.updateProjectionMatrix();

          console.log('Model rendering complete, setting glbRendered flag');
          window.glbRendered = true;

          if (mixer) {
            mixer.clipAction(gltf.animations[0]).reset();
          }
        }, 3000);
      },
      (xhr) => {
        if (xhr.total > 0) {
          console.log('Loading progress:', Math.round((xhr.loaded / xhr.total * 100)) + '%');
        }
      },
      (error) => {
        console.error('Error loading GLB file:', error);
        window.glbLoadError = error.toString();
      }
    );

    function animate() {
      requestAnimationFrame(animate);
      if (mixer) mixer.update(0.016);
      renderer.render(scene, camera);
    }
    animate();
  }, glbFilePath);

  console.log('[DEBUG] Waiting for model to render...');

  try {
    await page.waitForFunction("window.glbRendered === true", { timeout: 60000 });
    console.log('[DEBUG] Model rendered successfully');
  } catch (error) {
    console.error('[DEBUG] Timeout waiting for model to render');
    const loadError = await page.evaluate(() => window.glbLoadError);
    if (loadError) {
      console.error('[DEBUG] GLB Load Error:', loadError);
    }
    await browser.close();
    throw error;
  }

  const hasAnimationsResult = await page.evaluate(() => window.hasAnimations);
  console.log('[DEBUG] Has animations:', hasAnimationsResult);

  if (hasAnimationsResult) {
    console.log('[DEBUG] Generating animated APNG...');
    const tempDir = path.dirname(outputFilePath);
    const pngFiles = [];

    for (let i = 0; i < 30; i++) {
      const filePath = path.join(tempDir, `frame-${Date.now()}-${i}.png`);
      pngFiles.push(filePath);
      await page.screenshot({
        path: filePath,
        clip: { x: 0, y: 0, width: 512, height: 512 },
      });
      await page.waitForTimeout(50); // Wait 50ms between frames
    }

    const images = pngFiles.map((filePath) => sharp(filePath));
    await apng.framesToApng(images, outputFilePath);

    // Clean up temporary frames
    pngFiles.forEach((filePath) => {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    });
    console.log('[DEBUG] Animated APNG saved');
  } else {
    console.log('[DEBUG] Generating static PNG...');
    await page.screenshot({
      path: outputFilePath,
      clip: { x: 0, y: 0, width: 512, height: 512 },
    });
    console.log('[DEBUG] Static PNG saved');
  }

  await browser.close();
  console.log('[DEBUG] Browser closed');

  return {
    hasAnimations: hasAnimationsResult,
    outputPath: outputFilePath
  };
}
