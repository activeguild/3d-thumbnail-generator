# 3D Tools

> Integrated 3D model processing toolkit — batch processing, comparison, and thumbnail generation for GLB/GLTF files.

**Live:** [3d-thumbnail-generator.vercel.app](https://3d-thumbnail-generator.vercel.app)

## Features

### GLB Batch Processing (Main)

Bulk-process GLB files with configurable optimization options:

- **Animation removal/reduction** — strip or reduce keyframes with configurable algorithms
- **Draco compression** — apply Draco mesh compression for smaller file sizes
- **Mesh simplification** — reduce polygon count with adjustable ratio
- **Decimation** — reduce keyframes, nodes, and meshes
- **Center origin** — align model origins automatically
- **GLTF validation** — validate files against the glTF spec with detailed error/warning reports
- **Batch download** — process multiple files and download as ZIP

### GLB Compare

Side-by-side comparison of two GLB models:

- Interactive 3D viewers with orbit controls
- Geometry stats (triangles, vertices, meshes, materials, textures)
- Animation comparison (count, duration, tracks, keyframes)
- Synchronized playback between models
- Draco-compressed model support

### 3D Thumbnail Creation

Generate PNG thumbnails from 3D models:

- Adjustable camera angle, zoom, and offset
- Background customization (solid color or gradient)
- Batch processing with queue management
- Per-thumbnail camera adjustment and regeneration

## Tech Stack

| Category | Technology |
|----------|-----------|
| Framework | Next.js 15 (App Router) |
| 3D Rendering | Three.js |
| GLB Processing | gltf-transform |
| Compression | Draco (draco3dgltf) |
| Validation | gltf-validator |
| Image Processing | Sharp |
| Deployment | Vercel |

## Getting Started

### Prerequisites

- Node.js 20+

### Installation

```bash
git clone https://github.com/YOUR_USER/3d-thumbnail-generator.git
cd 3d-thumbnail-generator
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Other Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run cli` | CLI mode |
| `npm run batch` | Batch processing via CLI |

## Deployment

Deployed on [Vercel](https://vercel.com). Push to `main` to trigger automatic deployment.

---

## 日本語ガイド

### 概要

GLB/GLTFファイルの統合処理ツールです。ブラウザ上で3Dモデルのバッチ処理、比較、サムネイル生成ができます。

### 主な機能

- **GLBバッチ処理（メイン）** — アニメーション削減、Draco圧縮、メッシュ簡略化、バリデーション等をまとめて処理
- **GLB比較** — 2つのGLBファイルを並べて、ジオメトリ・アニメーションの差分を確認
- **3Dサムネイル生成** — 3DモデルからPNGサムネイルを生成（カメラ角度・背景カスタマイズ可）

### セットアップ

```bash
npm install
npm run dev
```

## License

MIT
