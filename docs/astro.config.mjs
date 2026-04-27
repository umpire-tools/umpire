import { defineConfig } from 'astro/config'
import starlight from '@astrojs/starlight'
import preact from '@astrojs/preact'
import react from '@astrojs/react'

export default defineConfig({
  site: 'https://sdougbrown.github.io',
  base: '/umpire',
  vite: {
    define: {
      'process.env.UMPIRE_INTERNAL': JSON.stringify('true'),
    },
    optimizeDeps: {
      exclude: ['@umpire/devtools'],
    },
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
      description: 'Declare rules. Derive availability. Play the field.',
      favicon: '/favicon.svg',
      customCss: ['./src/styles/main.css'],
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
        ] },
        {
          label: 'Concepts',
          items: [
            { label: 'Availability', slug: 'concepts/availability' },
            { label: 'Satisfaction', slug: 'concepts/satisfaction' },
            { label: 'Evaluation Order', slug: 'concepts/evaluation' },
            { label: 'Composing Validation', slug: 'concepts/validation' },
            { label: 'Selection', slug: 'concepts/selection' },
            { label: 'Droid-First Development', slug: 'droid-first' },
          ],
        },
        {
          label: 'API Reference',
          items: [
            { label: 'umpire()', slug: 'api/umpire' },
            { label: 'field<V>()', slug: 'api/field' },
            { label: 'Rules', collapsed: true, items: [
              { label: 'Overview', slug: 'api/rules' },
              { label: 'requires()', slug: 'api/rules/requires' },
              { label: 'enabledWhen()', slug: 'api/rules/enabled-when' },
              { label: 'fairWhen()', slug: 'api/rules/fair-when' },
              { label: 'disables()', slug: 'api/rules/disables' },
              { label: 'oneOf()', slug: 'api/rules/one-of' },
              { label: 'anyOf()', slug: 'api/rules/any-of' },
              { label: 'eitherOf()', slug: 'api/rules/either-of' },
              { label: 'check()', slug: 'api/rules/check' },
            ] },
            { label: 'check()', slug: 'api/check' },
            { label: 'play()', slug: 'api/play' },
            { label: 'challenge()', slug: 'api/challenge' },
            { label: 'scorecard()', slug: 'api/scorecard' },
          ],
        },
        {
          label: 'Extensions',
          items: [
            { label: 'DSL', slug: 'extensions/dsl' },
            { label: 'DevTools', slug: 'extensions/devtools' },
            { label: 'Reads', slug: 'extensions/reads' },
            { label: 'Testing', slug: 'extensions/testing' },
            { label: 'Write', slug: 'extensions/write' },
            { label: 'ESLint Plugin', slug: 'extensions/eslint-plugin' },
            { label: 'JSON', collapsed: true, items: [
              { label: 'Overview', slug: 'extensions/json' },
              { label: 'Builders & Checks', slug: 'extensions/json/builders' },
            ] },
          ],
        },
        {
          label: 'Adapters',
          items: [
            { label: 'UI', collapsed: false, items: [
              { label: 'React', slug: 'adapters/react' },
              { label: 'Solid', slug: 'adapters/solid' },
            ] },
            { label: 'Signals', collapsed: false, items: [
              { label: 'Overview', slug: 'adapters/signals' },
              { label: 'Preact', slug: 'adapters/signals/preact' },
              { label: 'Vue', slug: 'adapters/signals/vue' },
              { label: 'Solid', slug: 'adapters/signals/solid' },
              { label: 'alien-signals', slug: 'adapters/signals/alien' },
              { label: 'TC39', slug: 'adapters/signals/tc39' },
            ] },
            { label: 'State', collapsed: false, items: [
              { label: 'Store', slug: 'adapters/store' },
              { label: 'Zustand', slug: 'adapters/zustand' },
              { label: 'Pinia', slug: 'adapters/pinia' },
              { label: 'Redux', slug: 'adapters/redux' },
              { label: 'TanStack Store', slug: 'adapters/tanstack-store' },
              { label: 'Vuex', slug: 'adapters/vuex' },
            ] },
            { label: 'Validation', collapsed: false, items: [
              { label: 'Overview', slug: 'adapters/validation' },
              { label: 'Zod', slug: 'adapters/validation/zod' },
            ] },
          ],
        },
        {
          label: 'Examples',
          items: [
            { label: 'Minesweeper', slug: 'examples/minesweeper' },
            { label: 'PC Builder', slug: 'examples/pc-builder' },
            { label: 'Calendar Recurrence', slug: 'examples/calendar' },
            { label: 'Freight Quote', slug: 'examples/freight-quote' },
            { label: 'Login + Captcha', slug: 'examples/captcha' },
            { label: 'Signup Form + Zod', slug: 'examples/signup' },
            { label: 'Config-Driven UI', slug: 'examples/config-driven-ui' },
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
