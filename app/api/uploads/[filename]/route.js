import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  try {
    const { filename } = params;

    const filePath = path.join(process.cwd(), 'uploads', filename);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'File not found' },
        { status: 404 }
      );
    }

    const fileBuffer = await readFile(filePath);

    // Determine content type based on file extension
    const contentType = filename.endsWith('.glb')
      ? 'model/gltf-binary'
      : 'model/gltf+json';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000',
      },
    });

  } catch (error) {
    console.error('Error serving upload:', error);
    return NextResponse.json(
      { error: 'Failed to serve file' },
      { status: 500 }
    );
  }
}
