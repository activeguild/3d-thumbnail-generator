import { del } from '@vercel/blob';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  draco,
  dedup,
  resample,
  prune,
  textureCompress,
  flatten,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';
import sharp from 'sharp';

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get('url');

  if (!url) {
    return Response.json({ error: 'No url provided' }, { status: 400 });
  }

  try {
    // Fetch GLB from Vercel Blob
    const response = await fetch(url);
    if (!response.ok) {
      return Response.json(
        { error: `Failed to fetch from blob: ${response.status} ${response.statusText}` },
        { status: 500 }
      );
    }
    const buffer = await response.arrayBuffer();

    // Setup gltf-transform IO
    const io = new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({
        'draco3d.encoder': await draco3d.createEncoderModule(),
        'draco3d.decoder': await draco3d.createDecoderModule(),
      });

    const document = await io.readBinary(new Uint8Array(buffer));

    // Check for morph animations (Draco doesn't support them)
    const hasMorphAnimation = document
      .getRoot()
      .listAnimations()
      .some((anim) =>
        anim.listChannels().some((ch) => ch.getTargetPath() === 'weights')
      );

    await document.transform(
      resample(),
      prune({keepAttributes: false}),
      dedup(),
      ...(hasMorphAnimation ? [] : [draco()]),
      textureCompress({
        encoder: sharp,
        targetFormat: 'webp',
        resize: [1024, 1024],
      }),
      flatten()
    );

    const glb = await io.writeBinary(document);

    // Cleanup blob
    del(url).catch(() => {});

    return new Response(glb, {
      status: 200,
      headers: {
        'Content-Type': 'model/gltf-binary',
        'Content-Length': String(glb.length),
      },
    });
  } catch (err) {
    console.error('Draco compression failed:', err);
    // Cleanup blob on error too
    del(url).catch(() => {});
    return Response.json(
      { error: 'Compression failed: ' + err.message },
      { status: 500 }
    );
  }
}
