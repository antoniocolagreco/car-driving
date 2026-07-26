import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
    test: {
        environment: 'node',
        include: ['src/**/*.test.ts'],
    },
    resolve: {
        alias: {
            '@app': fileURLToPath(new URL('./src/app.ts', import.meta.url)),
            '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
            '@render': fileURLToPath(new URL('./src/render', import.meta.url)),
            '@ui': fileURLToPath(new URL('./src/ui', import.meta.url)),
            '@components': fileURLToPath(new URL('./src/components', import.meta.url)),
            '@layouts': fileURLToPath(new URL('./src/layouts', import.meta.url)),
            '@css': fileURLToPath(new URL('./src/css', import.meta.url)),
        },
    },
})
