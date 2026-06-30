# 3D Tools

> Integrated 3D model processing toolkit — batch processing, comparison, and thumbnail generation for GLB/GLTF files.

**Live:** [3d-thumbnail-generator.vercel.app](https://3d-thumbnail-generator.vercel.app)

## Features

### GLB Batch Processing (Main)

Bulk-process GLB files with configurable optimization options:

- **Animation removal/reduction** — strip or reduce keyframes with configurable algorithms
- **Draco compression** — apply Draco mesh compression for smaller file sizes
- **Mesh joining** — merge meshes sharing the same material to reduce draw calls
- **Mesh simplification** — reduce polygon count with adjustable ratio
- **Decimation** — reduce keyframes, nodes, and meshes
- **Center origin** — align model origins automatically
- **Draco-compressed GLB support** — read and write Draco-compressed models natively
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

> GLB/GLTFファイル向けの統合3Dモデル処理ツールキット — バッチ処理、比較、サムネイル生成。

**公開URL:** [3d-thumbnail-generator.vercel.app](https://3d-thumbnail-generator.vercel.app)

### 機能

#### GLBバッチ処理（メイン）

GLBファイルを一括処理し、各種最適化オプションを適用できます:

- **アニメーション削除/削減** — キーフレームの除去・削減（アルゴリズム選択可）
- **Draco圧縮** — Dracoメッシュ圧縮でファイルサイズを削減
- **メッシュ結合** — 同一マテリアルのメッシュを結合してドローコールを削減
- **メッシュ簡略化** — ポリゴン数を任意の比率で削減
- **デシメーション** — キーフレーム・ノード・メッシュを削減
- **原点中央化** — モデルの原点を自動で揃える
- **Draco圧縮GLB対応** — Draco圧縮済みモデルの読み書きにネイティブ対応
- **GLTFバリデーション** — glTF仕様に基づき検証し、エラー/警告を詳細にレポート
- **一括ダウンロード** — 複数ファイルを処理してZIPで一括ダウンロード

#### GLB比較

2つのGLBモデルを並べて比較:

- オービット操作可能なインタラクティブ3Dビューア
- ジオメトリ統計（三角形数、頂点数、メッシュ数、マテリアル数、テクスチャ数）
- アニメーション比較（数、長さ、トラック数、キーフレーム数）
- モデル間の同期再生
- Draco圧縮モデルにも対応

#### 3Dサムネイル生成

3DモデルからPNGサムネイルを生成:

- カメラ角度・ズーム・オフセットの調整
- 背景のカスタマイズ（単色／グラデーション）
- キュー管理付きのバッチ処理
- サムネイル単位でのカメラ調整・再生成

### 技術スタック

| カテゴリ | 技術 |
|----------|-----------|
| フレームワーク | Next.js 15 (App Router) |
| 3Dレンダリング | Three.js |
| GLB処理 | gltf-transform |
| 圧縮 | Draco (draco3dgltf) |
| バリデーション | gltf-validator |
| 画像処理 | Sharp |
| デプロイ | Vercel |

### はじめに

#### 前提条件

- Node.js 20+

#### インストール

```bash
git clone https://github.com/YOUR_USER/3d-thumbnail-generator.git
cd 3d-thumbnail-generator
npm install
```

#### 開発

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000) を開いてください。

#### その他のコマンド

| コマンド | 説明 |
|---------|-------------|
| `npm run build` | プロダクションビルド |
| `npm run start` | プロダクションサーバー起動 |
| `npm run cli` | CLIモード |
| `npm run batch` | CLIによるバッチ処理 |

### デプロイ

[Vercel](https://vercel.com) にデプロイされています。`main` ブランチへのプッシュで自動デプロイされます。

## License

MIT
