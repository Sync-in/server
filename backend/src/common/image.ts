/*
 * Copyright (C) 2012-2025 Johan Legrand <johan.legrand@sync-in.com>
 * This file is part of Sync-in | The open source file sync and share solution
 * See the LICENSE file for licensing details
 */

import sharp from 'sharp'
import { Resvg } from '@resvg/resvg-js'
import fs from 'node:fs/promises'
import path from 'node:path'

export const pngMimeType = 'image/png'
export const svgMimeType = 'image/svg+xml'

export async function generateThumbnail(filePath: string, size: number) {
  const image = sharp(filePath).rotate()
  let { width, height } = await image.metadata()

  if (!width || !height) throw new Error('Invalid image dimensions')

  // Calculate the new dimensions, maintaining the aspect ratio
  if (width > height) {
    if (width > size) {
      height = Math.round((height * size) / width)
      width = size
    }
  } else {
    if (height > size) {
      width = Math.round((width * size) / height)
      height = size
    }
  }

  return image.resize(width, height, { fit: 'inside' }).png({ compressionLevel: 0 }).toBuffer()
}

export async function generateAvatar(initials: string): Promise<Buffer> {
  const width = 256
  const height = 256
  const { backgroundColor, foregroundColor } = randomColor()

  const fontPath = path.join(__dirname, 'fonts', 'avatar.ttf')
  const fontBase64 = (await fs.readFile(fontPath)).toString('base64')

  const svg = `
  <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <style>
      @font-face {
        font-family: 'Avatar';
        src: url('data:font/ttf;base64,${fontBase64}') format('truetype');
      }
      text {
        font-family: 'Avatar', sans-serif;
        font-size: 150px;
        fill: ${foregroundColor};
        dominant-baseline: central;
        text-anchor: middle;
      }
    </style>
    <rect width="100%" height="100%" fill="${backgroundColor}" />
    <text x="50%" y="50%">${initials}</text>
  </svg>
  `

  // Rasterize SVG to PNG
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: width },
    font: {
      fontFiles: [fontPath],
      loadSystemFonts: false
    }
  })

  return resvg.render().asPng()
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
