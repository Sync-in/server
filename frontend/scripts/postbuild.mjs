import { copyMimesForProd } from './copy-mimes-dir.mjs'

if (process.env.NODE_ENV !== 'development') {
  console.log('fix assets ...')
  await copyMimesForProd()
}
