import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'astro/config'

const config = defineConfig({
    vite: {
        plugins: [tailwindcss()],
    },
    base: '/car-driving',
    site: 'https://antoniocolagreco.github.io',
})

export default config
