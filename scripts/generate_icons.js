import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#059669" />
      <stop offset="50%" stop-color="#10B981" />
      <stop offset="100%" stop-color="#34D399" />
    </linearGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.28" />
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0.08" />
    </linearGradient>
  </defs>
  
  <rect width="512" height="512" rx="128" fill="url(#grad)" />
  
  <!-- Glass Card -->
  <rect x="64" y="110" width="384" height="292" rx="36" fill="url(#cardGrad)" stroke="rgba(255,255,255,0.4)" stroke-width="4" />
  
  <!-- Magnetic Strip -->
  <rect x="64" y="170" width="384" height="42" fill="rgba(0,0,0,0.18)" />
  
  <!-- Golden Chip -->
  <rect x="104" y="240" width="64" height="48" rx="10" fill="#F59E0B" stroke="#FCD34D" stroke-width="3" />
  
  <!-- Sparkle Star -->
  <path d="M370 230 L380 255 L405 265 L380 275 L370 300 L360 275 L335 265 L360 255 Z" fill="#FFFFFF" />
  <circle cx="400" cy="230" r="7" fill="#FCD34D" />
  
  <!-- Balance Lines -->
  <rect x="104" y="325" width="150" height="18" rx="9" fill="rgba(255,255,255,0.9)" />
  <rect x="104" y="355" width="90" height="12" rx="6" fill="rgba(255,255,255,0.6)" />
</svg>`;

const publicDir = path.join(__dirname, '..', 'public');
fs.writeFileSync(path.join(publicDir, 'favicon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'icon.svg'), svgContent);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), svgContent);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), svgContent);

console.log('PWA icons created successfully in public/');
