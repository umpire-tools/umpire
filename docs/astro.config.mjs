import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'

export default defineConfig({
  site: 'https://sdougbrown.github.io',
  base: '/umpire',
  integrations: [
    starlight({
      title: '🛂 Umpire',
      description: 'Rule the form. Flag the field.',
      customCss: ['./src/styles/custom.css'],
      expressiveCode: {
        themes: ['github-dark'],
        styleOverrides: {
          codeBg: 'rgba(18, 18, 18, 0.96)',
          codeSelectionBg: 'rgba(107, 254, 156, 0.12)',
          borderColor: 'rgba(107, 254, 156, 0.14)',
          borderRadius: '0.5rem',
          codeFontFamily: "'JetBrains Mono', monospace",
          codeFontSize: '0.85rem',
          codeLineHeight: '1.7',
          scrollbarThumbColor: 'rgba(107, 254, 156, 0.2)',
          scrollbarThumbHoverColor: 'rgba(107, 254, 156, 0.4)',
        },
      },
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/sdougbrown/umpire',
        },
      ],
      sidebar: [
        { label: 'Getting Started', items: [{ label: 'Introduction', slug: '' }] },
        {
          label: 'Concepts',
          items: [
            { label: 'Availability', slug: 'concepts/availability' },
            { label: 'Satisfaction', slug: 'concepts/satisfaction' },
            { label: 'Evaluation Order', slug: 'concepts/evaluation' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'umpire()', slug: 'api/umpire' },
            { label: 'Rules', slug: 'api/rules' },
            { label: 'check()', slug: 'api/check' },
            { label: 'flag()', slug: 'api/flag' },
            { label: 'challenge()', slug: 'api/challenge' },
          ],
        },
        {
          label: 'Adapters',
          items: [
            { label: 'Signals', slug: 'adapters/signals' },
            { label: 'React', slug: 'adapters/react' },
            { label: 'Zustand', slug: 'adapters/zustand' },
          ],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Signup Form', slug: 'examples/signup' },
            { label: 'Calendar Recurrence', slug: 'examples/calendar' },
            { label: 'Login + Captcha', slug: 'examples/captcha' },
          ],
        },
      ],
      head: [
        {
          tag: 'meta',
          attrs: {
            name: 'theme-color',
            content: '#0e0e0e',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.googleapis.com',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'preconnect',
            href: 'https://fonts.gstatic.com',
            crossorigin: '',
          },
        },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href: 'https://fonts.googleapis.com/css2?family=Work+Sans:ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&family=JetBrains+Mono:wght@400;500;700&family=Space+Grotesk:wght@500;700&display=swap',
          },
        },
        {
          tag: 'script',
          children: `
            document.documentElement.dataset.theme = 'dark';
            localStorage.setItem('starlight-theme', 'dark');
          `,
        },
      ],
    }),
  ],
})
