import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export async function GET(request, { params }) {
  try {
    const { filename } = params;

    const filePath = path.join(process.cwd(), 'output', filename);

    if (!existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Thumbnail not found' },
        { status: 404 }
      );
    }

    const fileBuffer = await readFile(filePath);

    // Determine content type based on file extension
    const contentType = filename.endsWith('.png') ? 'image/png' : 'image/apng';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000',
      },
    });

  } catch (error) {
    console.error('Error serving thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to serve thumbnail' },
      { status: 500 }
    );
  }
}
