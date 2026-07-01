import { createCanvas } from 'canvas'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outDir = join(__dirname, '..', 'public', 'icons')
mkdirSync(outDir, { recursive: true })

function drawIcon(size, padding = 0) {
  const canvas = createCanvas(size, size)
  const ctx = canvas.getContext('2d')

  const r = size * 0.125

  if (padding > 0) {
    ctx.fillStyle = '#1E293B'
    ctx.fillRect(0, 0, size, size)
    const inset = size * padding
    roundRect(ctx, inset, inset, size - inset * 2, size - inset * 2, r)
    ctx.fillStyle = '#1E293B'
    ctx.fill()
  } else {
    roundRect(ctx, 0, 0, size, size, r)
    ctx.fillStyle = '#1E293B'
    ctx.fill()
  }

  ctx.fillStyle = 'white'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const fontSize = padding > 0 ? size * 0.3 : size * 0.4
  ctx.font = `600 ${fontSize}px Georgia, serif`
  ctx.fillText('CC', size / 2, size / 2 + fontSize * 0.04)

  return canvas
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r)
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r)
  ctx.quadraticCurveTo(x, y, x + r, y)
  ctx.closePath()
}

for (const size of [192, 512]) {
  const canvas = drawIcon(size)
  writeFileSync(join(outDir, `icon-${size}.png`), canvas.toBuffer('image/png'))
  console.log(`Generated icon-${size}.png`)
}

const maskable = drawIcon(512, 0.1)
writeFileSync(join(outDir, 'icon-maskable-512.png'), maskable.toBuffer('image/png'))
console.log('Generated icon-maskable-512.png')
