// https://nuxt.com/docs/api/configuration/nuxt-config

// Runs before first paint: decides whether the entrance sequence plays.
const ENTRANCE_GATE = `(function(){try{
var h=document.documentElement;
var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var seen=false;try{seen=sessionStorage.getItem('spawn:seen')==='1'}catch(e){}
if(reduce){h.dataset.entrance='off';return}
h.dataset.entrance=seen?'quick':'pending';
setTimeout(function(){if(h.dataset.entrance==='pending'||h.dataset.entrance==='quick'){h.dataset.entrance='off'}},7000);
}catch(e){document.documentElement.dataset.entrance='off'}})();`

export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/fonts'],
  css: ['~/assets/css/main.css', '~/assets/css/prism.css', '~/assets/css/skyline.css'],
  vite: {
    optimizeDeps: {
      // three is lazily imported after first paint — pre-bundle it so dev
      // doesn't trigger a full reload the first time a profile page loads.
      include: ['three'],
    },
  },
  fonts: {
    families: [
      { name: 'Chakra Petch', provider: 'google', weights: [400, 500, 600, 700], subsets: ['thai', 'latin', 'latin-ext'] },
      { name: 'Anuphan', provider: 'google', weights: [300, 400, 500, 600], subsets: ['thai', 'latin', 'latin-ext'] },
    ],
  },
  app: {
    head: {
      htmlAttrs: { lang: 'th' },
      meta: [
        { name: 'theme-color', content: '#05070C' },
        { name: 'color-scheme', content: 'dark' },
      ],
      link: [
        { rel: 'icon', type: 'image/svg+xml', href: '/favicon.svg' },
      ],
      script: [
        { tagPriority: 'critical', innerHTML: ENTRANCE_GATE },
      ],
    },
  },
})
