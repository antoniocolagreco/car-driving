import tailwind from '@astrojs/tailwind'
import { defineConfig } from 'astro/config'

// https://astro.build/config
const config = defineConfig({
    integrations: [tailwind()],
    base: '/car-driving',
    site: 'https://antoniocolagreco.github.io',
})

export default config
