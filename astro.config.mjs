import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({ output: 'static', integrations: [react()], vite: { plugins: [tailwindcss()] }, experimental: { csp: { directives: ["connect-src 'self' https://*.cow.fi https://api.hyperliquid-testnet.xyz https://api.hyperliquid.xyz https://ethereum-sepolia-rpc.publicnode.com https://ethereum-rpc.publicnode.com https://base-rpc.publicnode.com https://arbitrum-one-rpc.publicnode.com", "img-src 'self' data:", "style-src 'self' 'unsafe-inline'", "object-src 'none'", "base-uri 'self'", "form-action 'self'"] } } });
