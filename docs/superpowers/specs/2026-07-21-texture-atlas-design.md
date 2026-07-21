# テクスチャアトラス化機能 設計仕様

## 目的

複数マテリアルの各テクスチャを1枚のアトラスにまとめ、マテリアルを統合することでドローコール数を削減する。

## 要件

- クライアントサイド（ブラウザ内）で処理を完結させる
- 対象テクスチャ: baseColor, normal, metallicRoughness, emissive, occlusion
- アトラスサイズ上限: 2048x2048
- 既存バッチ処理UIにチェックボックスとして追加

## アーキテクチャ

### 処理フロー

```
1. Document内の全マテリアルからテクスチャを収集
2. UVタイリング（[0,1]範囲外）を使用するメッシュを検出・除外
3. 各テクスチャをCanvas上でデコード
4. ビンパッキングアルゴリズムでアトラスレイアウトを計算
5. テクスチャ種類ごとにアトラスCanvasへ描画（最大2048x2048）
6. 各メッシュのUV座標をアトラス上の位置に再マッピング
7. マテリアルを1つに統合し、アトラステクスチャを割り当て
8. 元のテクスチャ・マテリアルを削除（prune で処理）
```

### 実装ファイル

| ファイル | 変更内容 |
|---------|---------|
| `components/processors/glbAnimationRemover.js` | `textureAtlas()` 関数を追加、`processGLB` のパイプラインに組み込み |
| `components/features/GLBProcessor.js` | UIにチェックボックス「Texture Atlas」を追加 |

### processGLB パイプライン内の実行順序

```
removeAnimations / decimateKeyframes
  → decimateNodes
  → centerOrigin
  → simplifyMesh
  → textureAtlas    ← ここに追加（joinMeshes の前）
  → joinMeshes
  → prune
```

`joinMeshes` の前に実行することで、アトラス化後に統合されたマテリアルを持つメッシュを `join()` でさらにまとめられる。

## 詳細設計

### ビンパッキング

シンプルなシェルフパッキングアルゴリズムを使用する。

1. テクスチャを高さの降順でソート
2. アトラスの幅（2048）に収まるだけ横に並べる（1段 = 1シェルフ）
3. 1段が埋まったら次の段に移動
4. 全体が2048x2048に収まらない場合、テクスチャを縮小して再試行

### UV再マッピング

各プリミティブの TEXCOORD_0 アクセサを書き換える:

```
newU = (originalU * regionWidth + regionX) / atlasWidth
newV = (originalV * regionHeight + regionY) / atlasHeight
```

### スキップ条件

以下の場合はアトラス化をスキップする:

- マテリアルが1つ以下（統合不要）
- UV座標が [0,1] 範囲外のプリミティブがある（タイリング使用）
- テクスチャを持たないマテリアルがある

スキップしたマテリアルのメッシュはそのまま残す（部分的アトラス化）。

### テクスチャデコード

ブラウザの `Canvas` API を使用:

1. テクスチャの Image データを取得（gltf-transform の `getImage()` → Blob → createImageBitmap）
2. Canvas に描画してピクセルデータを操作
3. アトラス Canvas から `toBlob('image/png')` で出力

### マテリアル統合

アトラス化対象の全マテリアルを1つの新しいマテリアルに統合する。

- PBRプロパティ（metallic, roughness, emissive factor 等）は最初のマテリアルの値を使用
- アルファモードが混在する場合は BLEND を採用
- 各テクスチャスロット（baseColorTexture, normalTexture 等）にアトラステクスチャを割り当て

## エラーハンドリング

- Canvas API が使えない環境 → `OffscreenCanvas` にフォールバック
- テクスチャデコード失敗 → 該当マテリアルをスキップしてログ出力
- アトラスに収まらない → テクスチャを最小256x256まで縮小して再試行、それでも収まらなければスキップ

## テスト観点

- 複数マテリアル（2-5個）のGLBでドローコール数が減ること
- UVタイリングモデルが正しくスキップされること
- アトラス化後のモデルが視覚的に正しいこと（テクスチャの位置ずれがないこと）
- テクスチャなしマテリアルを含むモデルで例外が出ないこと
