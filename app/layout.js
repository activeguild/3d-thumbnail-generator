import './globals.css'

export const metadata = {
  title: '3D Thumbnail Generator',
  description: 'Generate thumbnails from 3D models (.glb and .gltf files)',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
