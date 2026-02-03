import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { promisify } from 'node:util'
import sharp from 'sharp'
import TextToSVG from 'text-to-svg' // Sharp settings

// Sharp settings
sharp.cache(false)
sharp.concurrency(Math.min(2, os.cpus()?.length || 1))

// Constants
export const pngMimeType = 'image/png'
export const svgMimeType = 'image/svg+xml'
export const webpMimeType = 'image/webp'
const avatarSize = 256
const fontPath = path.join(__dirname, 'fonts', 'avatar.ttf')
const loadTextToSVG = promisify(TextToSVG.load.bind(TextToSVG))
let textToSvgCache: Promise<TextToSVG> | null = null

export async function generateThumbnail(filePath: string, size: number): Promise<Readable> {
  return sharp(filePath, {
    failOn: 'none',
    sequentialRead: true, // sequential read = more efficient I/O
    limitInputPixels: 268e6 // protects against extremely large images
  })
    .rotate()
    .resize({
      width: size,
      height: size,
      fit: 'inside',
      kernel: 'nearest',
      withoutEnlargement: true,
      fastShrinkOnLoad: true // true by default, added for clarity
    })
    .webp({ quality: 80, effort: 0, alphaQuality: 90 })
}

export async function generateAvatar(initials: string): Promise<NodeJS.ReadableStream> {
  const tts = await getTextToSvg()
  const { backgroundColor, foregroundColor } = randomColor()
  const fontSize = fitFontSize(tts, initials, avatarSize * 0.8, 170)

  const d = tts.getD(initials, {
    x: avatarSize / 2,
    y: avatarSize / 2.1,
    fontSize,
    anchor: 'center middle'
  })

  const svg = `
<svg width="${avatarSize}" height="${avatarSize}" viewBox="0 0 ${avatarSize} ${avatarSize}"
     xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${backgroundColor}"/>
  <path d="${d}" fill="${foregroundColor}" />
</svg>`.trim()

  return sharp(Buffer.from(svg, 'utf8')).png()
}

export async function convertImageToBase64(imgPath: string) {
  const base64String = await fs.readFile(imgPath, { encoding: 'base64' })
  return `data:image/png;base64,${base64String}`
}

function randomColor() {
  let color = ''
  while (color.length < 6) {
    /* sometimes the returned value does not have
     * the 6 digits needed, so we do it again until
     * it does
     */
    color = Math.floor(Math.random() * 16777215).toString(16)
  }
  const red = parseInt(color.substring(0, 2), 16)
  const green = parseInt(color.substring(2, 4), 16)
  const blue = parseInt(color.substring(4, 6), 16)
  const brightness = red * 0.299 + green * 0.587 + blue * 0.114

  return {
    backgroundColor: `#${color}`,
    foregroundColor: brightness > 180 ? '#000000' : '#ffffff'
  }
}

function fitFontSize(tts: TextToSVG, text: string, box: number, start = 170): number {
  // Heuristic to make the text occupy ~80% of the available width
  let size = start
  // Lower bound to prevent infinite loops when the font renders very small
  while (size > 20) {
    const m = tts.getMetrics(text, { fontSize: size, anchor: 'center middle' })
    if (m.width <= box) break
    size -= 4
  }
  return size
}

function getTextToSvg(): Promise<TextToSVG> {
  return (textToSvgCache ??= loadTextToSVG(fontPath) as Promise<TextToSVG>)
}
