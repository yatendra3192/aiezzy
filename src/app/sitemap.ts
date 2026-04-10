import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://aiezzy.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://aiezzy.com/signup', lastModified: new Date(), changeFrequency: 'monthly', priority: 0.8 },
  ];
}
