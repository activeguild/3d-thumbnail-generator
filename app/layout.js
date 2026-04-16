import './globals.css'
import { Analytics } from '@vercel/analytics/react'

export const metadata = {
  title: {
    default: '3D Tools - GLBバッチ処理・比較・サムネイル生成',
    template: '%s | 3D Tools',
  },
  description: 'GLB/GLTFファイルのバッチ処理を中心とした統合3Dツール。アニメーション削減、GLBファイル比較、3Dサムネイル生成に対応。',
  keywords: ['3D', 'GLB', 'GLTF', 'バッチ処理', 'アニメーション削減', '3Dモデル', 'サムネイル生成', 'GLB比較'],
  authors: [{ name: '3D Tools' }],
  openGraph: {
    title: '3D Tools - 統合3Dモデル処理ツール',
    description: 'GLBバッチ処理・ファイル比較・サムネイル生成をブラウザで完結',
    type: 'website',
    locale: 'ja_JP',
    url: 'https://3d-thumbnail-generator.vercel.app',
  },
  twitter: {
    card: 'summary_large_image',
    title: '3D Tools - 統合3Dモデル処理ツール',
    description: 'GLBバッチ処理・ファイル比較・サムネイル生成をブラウザで完結',
  },
  robots: { index: true, follow: true },
}

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body suppressHydrationWarning>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@type': 'WebApplication',
              name: '3D Tools',
              description: 'GLB/GLTFファイルのバッチ処理を中心とした統合3Dツール',
              url: 'https://3d-thumbnail-generator.vercel.app',
              applicationCategory: 'DesignApplication',
              operatingSystem: 'Any',
              offers: {
                '@type': 'Offer',
                price: '0',
                priceCurrency: 'JPY',
              },
            }),
          }}
        />
        {children}
        <Analytics />
      </body>
    </html>
  )
}
