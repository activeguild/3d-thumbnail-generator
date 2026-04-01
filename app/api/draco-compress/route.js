import { NodeIO } from '@gltf-transform/core';
import { KHRDracoMeshCompression } from '@gltf-transform/extensions';
import { draco } from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

async function compressTextures(document) {
  const root = document.getRoot();
  const textures = root.listTextures();

  for (const texture of textures) {
    const image = texture.getImage();
    if (!image) continue;

    const mimeType = texture.getMimeType();
    if (mimeType === 'image/webp') continue;

    try {
      const compressed = await sharp(Buffer.from(image))
        .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();

      texture.setImage(new Uint8Array(compressed));
      texture.setMimeType('image/webp');
    } catch (err) {
      console.warn(`Failed to compress texture: ${err.message}`);
    }
  }
}

export async function POST(request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const io = new NodeIO()
      .registerExtensions([KHRDracoMeshCompression])
      .registerDependencies({
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'draco3d.decoder': await draco3d.createDecoderModule(),
      });

    const document = await io.readBinary(uint8Array);

    await compressTextures(document);

    await document.transform(
      draco({ method: 'edgebreaker' })
    );

    const outputBinary = await io.writeBinary(document);

    return new Response(outputBinary, {
      status: 200,
      headers: {
        'Content-Type': 'application/octet-stream',
      },
    });
  } catch (err) {
    console.error('Draco compression failed:', err);
    return Response.json(
      { error: 'Compression failed: ' + err.message },
      { status: 500 }
    );
  }
}
