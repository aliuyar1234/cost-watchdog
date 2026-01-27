/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: {
    ignoreDuringBuilds: true,
  },
};

if (process.env.NEXT_OUTPUT === 'standalone') {
  nextConfig.output = 'standalone';
}

module.exports = nextConfig;
