import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import preact from '@astrojs/preact'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://sdougbrown.github.io',
  base: '/umpire',
  vite: {
    server: {
      watch: {
        // Force polling — native FSEvents may not be propagating changes
        usePolling: true,
        interval: 500,
      },
    },
    plugins: [{
      name: 'starlight-asset-reload',
      handleHotUpdate({ file, server }) {
        // Log to confirm file watcher is firing at all
        if (file.includes('/docs/src/')) {
          console.log(`[asset-reload] changed: ${file.split('/docs/')[1]}`);
          server.ws.send({ type: 'full-reload' });
        }
      },
    }],
  },
  integrations: [
    preact({ include: ['**/SignalsFineGrainedDemo.*', '**/FreightQuoteDemo.*', '**/LearnDemos.*'] }),
    react({ exclude: ['**/SignalsFineGrainedDemo.*', '**/FreightQuoteDemo.*', '**/LearnDemos.*'] }),
    starlight({
      title: '🛂 Umpire',
      description: 'Rule the form. Flag the field.',
      favicon: '/favicon.svg',
      customCss: [
        './src/styles/custom.css',
        './src/styles/lineup.css',
        './src/styles/captcha-demo.css',
        './src/styles/demo-common.css',
        './src/styles/learn-demo.css',
        './src/styles/signup-demo.css',
        './src/styles/react-demo.css',
        './src/styles/zustand-demo.css',
        './src/styles/printer-demo.css',
        './src/styles/freight-demo.css',
        './src/styles/signals-demo.css',
        './src/styles/calendar-demo.css',
      ],
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
        { label: 'Getting Started', items: [
          { label: 'Introduction', slug: '' },
          { label: 'Quick Start', slug: 'learn' },
          { label: 'Droid-First Development', slug: 'droid-first' },
        ] },
        {
          label: 'Concepts',
          items: [
            { label: 'Availability', slug: 'concepts/availability' },
            { label: 'Satisfaction', slug: 'concepts/satisfaction' },
            { label: 'Evaluation Order', slug: 'concepts/evaluation' },
            { label: 'Composing Validation', slug: 'concepts/validation' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'umpire()', slug: 'api/umpire' },
            { label: 'Rules', collapsed: true, items: [
              { label: 'Overview', slug: 'api/rules' },
              { label: 'requires()', slug: 'api/rules/requires' },
              { label: 'enabledWhen()', slug: 'api/rules/enabled-when' },
              { label: 'disables()', slug: 'api/rules/disables' },
              { label: 'oneOf()', slug: 'api/rules/one-of' },
              { label: 'anyOf()', slug: 'api/rules/any-of' },
              { label: 'check()', slug: 'api/rules/check' },
            ] },
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
            { label: 'Zod', slug: 'examples/signup' },
          ],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Login + Captcha', slug: 'examples/captcha' },
            { label: 'Calendar Recurrence', slug: 'examples/calendar' },
            { label: 'Freight Quote', slug: 'examples/freight-quote' },
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
