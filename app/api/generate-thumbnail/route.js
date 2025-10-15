import { NextResponse } from 'next/server';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { generateThumbnail } from '@/lib/thumbnail-generator';

export async function POST(request) {
  console.log('[API] POST /api/generate-thumbnail - Request received');
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    console.log('[API] File received:', file?.name);

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.name.endsWith('.glb') && !file.name.endsWith('.gltf')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .glb and .gltf files are allowed' },
        { status: 400 }
      );
    }

    // Create uploads and output directories if they don't exist
    const uploadsDir = path.join(process.cwd(), 'uploads');
    const outputDir = path.join(process.cwd(), 'output');

    if (!existsSync(uploadsDir)) {
      await mkdir(uploadsDir, { recursive: true });
    }

    if (!existsSync(outputDir)) {
      await mkdir(outputDir, { recursive: true });
    }

    // Save uploaded file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const timestamp = Date.now();
    const uploadFileName = `${timestamp}-${file.name}`;
    const uploadFilePath = path.join(uploadsDir, uploadFileName);

    await writeFile(uploadFilePath, buffer);
    console.log('[API] File saved to:', uploadFilePath);

    // Generate thumbnail
    const outputFileName = uploadFileName.replace(/\.(glb|gltf)$/, '.png');
    const outputFilePath = path.join(outputDir, outputFileName);

    // Get the host from the request
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    const fileUrl = `${protocol}://${host}/api/uploads/${uploadFileName}`;
    console.log('[API] File URL for Puppeteer:', fileUrl);
    console.log('[API] Starting thumbnail generation...');

    const result = await generateThumbnail(fileUrl, outputFilePath);
    console.log('[API] Thumbnail generation complete:', result);

    // Return the result
    return NextResponse.json({
      success: true,
      hasAnimations: result.hasAnimations,
      thumbnailUrl: `/api/thumbnail/${outputFileName}`,
      message: result.hasAnimations
        ? 'Animated thumbnail generated successfully'
        : 'Static thumbnail generated successfully'
    });

  } catch (error) {
    console.error('Error generating thumbnail:', error);
    return NextResponse.json(
      { error: 'Failed to generate thumbnail: ' + error.message },
      { status: 500 }
    );
  }
}
