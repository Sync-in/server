import { fixIconsSymlinks } from './fix-icons-symlinks.mjs'

if (process.env.NODE_ENV !== 'development') {
  console.log('fix assets ...')
  await fixIconsSymlinks()
}
