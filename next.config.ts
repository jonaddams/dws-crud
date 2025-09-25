import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Exclude @nutrient-sdk/viewer from the bundle since we're using the CDN version
  serverExternalPackages: ['@nutrient-sdk/viewer'],

  // Turbopack configuration for development
  turbopack: {
    resolveAlias: {
      '@nutrient-sdk/viewer': 'NutrientViewer',
    },
  },

  webpack: (config, { isServer, dev }) => {
    // Only configure webpack externals when not using Turbopack (production builds)
    if (!isServer && !dev) {
      if (Array.isArray(config.externals)) {
        config.externals.push({
          '@nutrient-sdk/viewer': 'NutrientViewer',
        });
      } else if (typeof config.externals === 'object') {
        config.externals = {
          ...config.externals,
          '@nutrient-sdk/viewer': 'NutrientViewer',
        };
      } else {
        config.externals = {
          '@nutrient-sdk/viewer': 'NutrientViewer',
        };
      }
    }
    return config;
  },
};

export default nextConfig;
