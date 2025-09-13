import type { Config } from 'tailwindcss'
import defaultTheme from 'tailwindcss/defaultTheme'

const config: Config = {
    content: ['./src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}'],
    theme: {
        extend: { fontFamily: { sans: ['Nunito Variable', ...defaultTheme.fontFamily.sans] } },
    },
    plugins: [require('@tailwindcss/forms')],
}

export default config
