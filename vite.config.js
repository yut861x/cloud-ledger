import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

const repository = process.env.GITHUB_REPOSITORY?.split('/')[1]
const owner = process.env.GITHUB_REPOSITORY?.split('/')[0]
const pagesBase = repository && repository.toLowerCase() !== `${owner?.toLowerCase()}.github.io`
  ? `/${repository}/`
  : '/'

export default defineConfig({
  plugins: [vue()],
  base: process.env.VITE_BASE_PATH || (process.env.GITHUB_ACTIONS ? pagesBase : '/'),
})
