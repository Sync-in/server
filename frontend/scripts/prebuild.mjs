import { checkPdfjs } from './pdfjs.mjs'

if (process.env.NODE_ENV !== 'development') {
  console.log('build assets ...')
  await checkPdfjs()
}
