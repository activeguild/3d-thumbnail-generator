import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import sharp from "sharp";
import apng from "sharp-apng";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const glbFilePath = process.argv[2];
const envMapUrl = process.env.ENV_MAP_URL;

if (!glbFilePath) {
  console.error("Specify the path to the GLB file.");
  process.exit(1);
}

(async () => {
  const browser = await puppeteer.launch({
    headless: true,
  });
  const page = await browser.newPage();

  await page.setContent(`
    <html>
      <body style="margin:0; background: #F2F6FF;">
        <canvas id="canvas"></canvas>
        <script src="https://cdn.jsdelivr.net/npm/three@latest/build/three.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@latest/examples/js/loaders/GLTFLoader.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/three@latest/examples/js/loaders/RGBELoader.js"></script>
        <script>
          THREE.ColorManagement.legacyMode = false;
          THREE.ColorManagement.enabled = true;

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

          renderer.outputEncoding = THREE.LinearEncoding;
          renderer.toneMapping = THREE.ACESFilmicToneMapping;

          const envMapUrl = '${envMapUrl}';
          if (envMapUrl) {
            const loader = new THREE.RGBELoader();
            loader.load(envMapUrl, function(texture) {
              texture.mapping = THREE.EquirectangularReflectionMapping;
              texture.encoding = THREE.LinearEncoding;
              scene.environment = texture;
              scene.background = texture;
            });
          } else {
            const ambientLight = new THREE.AmbientLight(0xffffff, 1);
            scene.add(ambientLight);

            const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
            directionalLight.position.set(1, 1, 1).normalize();
            scene.add(directionalLight);
          }

          let mixer;
          let hasAnimations = false;
          let modelGroup = new THREE.Group(); 
          scene.add(modelGroup); 

          const gltfLoader = new THREE.GLTFLoader();
          gltfLoader.load('${glbFilePath}', (gltf) => {
            const model = gltf.scene;
            modelGroup.add(model);

            model.traverse((child) => {
              if (child.isMesh) {
                child.geometry.computeBoundingBox(); 
                child.material.side = THREE.DoubleSide;
                child.material.needsUpdate = true;

                if (child.material.map) {
                  // child.material.map.encoding = THREE.LinearEncoding;
                  child.material.needsUpdate = true;
                }

                ['normalMap', 'metalnessMap', 'roughnessMap', 'emissiveMap'].forEach((map) => {
                  if (child.material[map]) {
                    // child.material[map].encoding = THREE.LinearEncoding;
                    child.material.needsUpdate = true;
                  }
                });
              }
            });

            if (gltf.animations && gltf.animations.length > 0) {
              mixer = new THREE.AnimationMixer(modelGroup); 
              gltf.animations.forEach((clip) => {
                mixer.clipAction(clip).play();
              });
              hasAnimations = true;
            }

            setTimeout(() => {
              const box = new THREE.Box3().setFromObject(modelGroup);
              const size = new THREE.Vector3();
              box.getSize(size);

              const maxDimension = Math.max(size.x, size.y, size.z);
              const targetSize = 0.7 * canvasSize; 
              const scaleFactor = targetSize / maxDimension;
              modelGroup.scale.set(scaleFactor, scaleFactor, scaleFactor);

              const center = new THREE.Vector3();
              box.getCenter(center);

              modelGroup.position.x -= center.x;
              modelGroup.position.z -= center.z;

              modelGroup.position.y -= center.y * scaleFactor;

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

              window.glbRendered = true;
            }, 3000);
          });

          function animate() {
            requestAnimationFrame(animate);
            if (mixer) mixer.update(0.016);
            renderer.render(scene, camera);
          }
          animate();
        </script>
      </body>
    </html>
  `);

  await page.waitForFunction('window.glbRendered === true', { timeout: 5000 });

  if (await page.evaluate(() => hasAnimations)) {
    const pngFiles = [];
    for (let i = 0; i < 30; i++) {
      const filePath = path.join(__dirname, `frame-${i}.png`);
      pngFiles.push(filePath);
      await page.screenshot({
        path: filePath,
        clip: { x: 0, y: 0, width: 512, height: 512 },
      });
    }

    const images = pngFiles.map((filePath) => sharp(filePath));
    await apng.framesToApng(images, "./animated.png");

    pngFiles.forEach((filePath) => {
      fs.unlinkSync(filePath);
      console.log(`${filePath} deleted.`);
    });
  } else {
    await page.screenshot({
      path: path.join(__dirname, "static_image.png"),
      clip: { x: 0, y: 0, width: 512, height: 512 },
    });
    console.log("Still image saved.");
  }

  await browser.close();
})();
