export default function robots() {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
    },
    sitemap: 'https://3d-thumbnail-generator.vercel.app/sitemap.xml',
  }
}
