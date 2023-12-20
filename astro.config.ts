import tailwind from '@astrojs/tailwind'
import { defineConfig } from 'astro/config'

// https://astro.build/config
const config = defineConfig({
    integrations: [tailwind()],
})

export default config
