#!/usr/bin/env node
/**
 * Generates placeholder PNG icons using the `canvas` npm package.
 * Run: npm install canvas && node generate-icons.js
 * Or manually create 16x16, 48x48, 128x128 PNG icons in the icons/ folder.
 *
 * This script is only needed for local dev — replace with real icons for production.
 */
const { createCanvas } = require("canvas");
const fs = require("fs");
const path = require("path");

const sizes = [16, 48, 128];
const dir = path.join(__dirname, "icons");
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

for (const size of sizes) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Background circle
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();

  // Green ring
  ctx.strokeStyle = "#3aff6c";
  ctx.lineWidth = size * 0.08;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - size * 0.08, 0, Math.PI * 2);
  ctx.stroke();

  // Cookie emoji text
  ctx.fillStyle = "#ffffff";
  ctx.font = `${size * 0.5}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🚫", size / 2, size / 2);

  const out = path.join(dir, `icon${size}.png`);
  fs.writeFileSync(out, canvas.toBuffer("image/png"));
  console.log(`Created ${out}`);
}
