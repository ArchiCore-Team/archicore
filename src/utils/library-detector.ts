import { stat, readFile } from 'fs/promises';
import { join, basename, relative } from 'path';
import { Logger } from './logger.js';

/**
 * Library metadata - what ArchiCore knows about the library
 */
export interface LibraryInfo {
  name: string;
  category: LibraryCategory;
  description: string;
  detectedBy: 'pattern' | 'package-json' | 'minified' | 'vendor-dir' | 'content-analysis';
  path: string;
}

export type LibraryCategory =
  | 'ui-framework'      // React, Vue, Angular, Svelte
  | 'utility'           // Lodash, Underscore, Ramda
  | 'dom-manipulation'  // jQuery, Zepto
  | 'animation'         // GSAP, Anime.js, Motion
  | 'charting'          // Chart.js, D3, Highcharts, ECharts
  | 'mapping'           // Leaflet, Mapbox, OpenLayers
  | 'date-time'         // Moment, Day.js, date-fns
  | 'http-client'       // Axios, Superagent
  | 'state-management'  // Redux, MobX, Vuex, Pinia
  | 'form-validation'   // Yup, Joi, Zod
  | '3d-graphics'       // Three.js, Babylon.js
  | 'game-engine'       // Phaser, PixiJS
  | 'pdf-viewer'        // PDF.js, ViewerJS
  | 'rich-text-editor'  // TinyMCE, CKEditor, Quill, Froala
  | 'code-editor'       // Monaco, CodeMirror, Ace
  | 'video-player'      // Video.js, Plyr, JW Player
  | 'carousel'          // Swiper, Slick, Owl Carousel
  | 'testing'           // Jest, Mocha, Jasmine
  | 'bundler'           // Webpack, Rollup, Vite runtime
  | 'polyfill'          // core-js, regenerator-runtime
  | 'scorm'             // SCORM API wrappers
  | 'crypto'            // CryptoJS, Forge
  | 'compression'       // pako, jszip
  | 'analytics'         // Google Analytics, Mixpanel
  | 'social'            // Facebook SDK, Twitter SDK
  | 'payment'           // Stripe.js, PayPal SDK
  | 'database'          // SQL.js, PouchDB, Dexie
  | 'websocket'         // Socket.io client
  | 'other';

/**
 * Known library patterns with metadata
 */
const KNOWN_LIBRARIES: Array<{
  patterns: RegExp[];
  name: string;
  category: LibraryCategory;
  description: string;
}> = [
  // UI Frameworks
  { patterns: [/react(-dom)?\./, /react\.(min\.)?js/], name: 'React', category: 'ui-framework', description: 'UI component library by Meta' },
  { patterns: [/vue(\.(min|esm|global))?\.js/, /vue@/], name: 'Vue.js', category: 'ui-framework', description: 'Progressive JavaScript framework' },
  { patterns: [/angular(\.min)?\.js/, /@angular\//], name: 'Angular', category: 'ui-framework', description: 'Platform by Google for web apps' },
  { patterns: [/svelte(\.min)?\.js/], name: 'Svelte', category: 'ui-framework', description: 'Compile-time UI framework' },
  { patterns: [/preact(\.min)?\.js/], name: 'Preact', category: 'ui-framework', description: 'Fast 3kB React alternative' },
  { patterns: [/ember(\.min)?\.js/], name: 'Ember.js', category: 'ui-framework', description: 'Opinionated web framework' },
  { patterns: [/backbone(\.min)?\.js/], name: 'Backbone.js', category: 'ui-framework', description: 'MVC framework' },

  // Utilities
  { patterns: [/lodash/, /underscore/], name: 'Lodash/Underscore', category: 'utility', description: 'Utility library for arrays, objects, strings' },
  { patterns: [/ramda(\.min)?\.js/], name: 'Ramda', category: 'utility', description: 'Functional programming utilities' },
  { patterns: [/rxjs/, /rx\.js/], name: 'RxJS', category: 'utility', description: 'Reactive extensions for JavaScript' },
  { patterns: [/immutable(\.min)?\.js/], name: 'Immutable.js', category: 'utility', description: 'Immutable data structures' },

  // DOM Manipulation
  { patterns: [/jquery/, /zepto/], name: 'jQuery/Zepto', category: 'dom-manipulation', description: 'DOM manipulation and AJAX library' },

  // Animation
  { patterns: [/gsap/, /TweenMax/, /TweenLite/], name: 'GSAP', category: 'animation', description: 'Professional-grade animation platform' },
  { patterns: [/anime(\.min)?\.js/], name: 'Anime.js', category: 'animation', description: 'Lightweight animation library' },
  { patterns: [/velocity(\.min)?\.js/], name: 'Velocity.js', category: 'animation', description: 'Accelerated JavaScript animation' },
  { patterns: [/motion(\.min)?\.js/, /framer-motion/], name: 'Motion', category: 'animation', description: 'Animation library for React' },
  { patterns: [/lottie/], name: 'Lottie', category: 'animation', description: 'Renders After Effects animations' },

  // Charting
  { patterns: [/chart\.js/, /chart(\.min)?\.js/], name: 'Chart.js', category: 'charting', description: 'Simple HTML5 charts' },
  { patterns: [/d3\./, /d3(\.min)?\.js/], name: 'D3.js', category: 'charting', description: 'Data-driven document manipulation' },
  { patterns: [/highcharts/], name: 'Highcharts', category: 'charting', description: 'Interactive JavaScript charts' },
  { patterns: [/echarts/], name: 'ECharts', category: 'charting', description: 'Apache charting library' },
  { patterns: [/plotly/], name: 'Plotly', category: 'charting', description: 'Graphing library' },
  { patterns: [/apexcharts/], name: 'ApexCharts', category: 'charting', description: 'Modern charting library' },
  { patterns: [/recharts/], name: 'Recharts', category: 'charting', description: 'React charting library' },

  // Mapping
  { patterns: [/leaflet/], name: 'Leaflet', category: 'mapping', description: 'Interactive maps library' },
  { patterns: [/mapbox/], name: 'Mapbox GL', category: 'mapping', description: 'Interactive vector maps' },
  { patterns: [/openlayers/, /ol\.js/], name: 'OpenLayers', category: 'mapping', description: 'High-performance map library' },
  { patterns: [/google.*maps/i], name: 'Google Maps', category: 'mapping', description: 'Google Maps JavaScript API' },

  // Date/Time
  { patterns: [/moment(\.min)?\.js/, /moment-with-locales/], name: 'Moment.js', category: 'date-time', description: 'Parse, validate, manipulate dates' },
  { patterns: [/dayjs/, /day\.js/], name: 'Day.js', category: 'date-time', description: 'Immutable date library (2KB)' },
  { patterns: [/date-fns/], name: 'date-fns', category: 'date-time', description: 'Modern date utility library' },
  { patterns: [/luxon/], name: 'Luxon', category: 'date-time', description: 'Modern date/time library' },

  // HTTP Clients
  { patterns: [/axios/], name: 'Axios', category: 'http-client', description: 'Promise-based HTTP client' },
  { patterns: [/superagent/], name: 'SuperAgent', category: 'http-client', description: 'Ajax with fluent API' },
  { patterns: [/ky(\.min)?\.js/], name: 'Ky', category: 'http-client', description: 'Tiny HTTP client based on Fetch' },

  // State Management
  { patterns: [/redux/], name: 'Redux', category: 'state-management', description: 'Predictable state container' },
  { patterns: [/mobx/], name: 'MobX', category: 'state-management', description: 'Simple, scalable state management' },
  { patterns: [/vuex/], name: 'Vuex', category: 'state-management', description: 'State management for Vue.js' },
  { patterns: [/pinia/], name: 'Pinia', category: 'state-management', description: 'Intuitive Vue.js store' },
  { patterns: [/zustand/], name: 'Zustand', category: 'state-management', description: 'Minimal React state management' },
  { patterns: [/recoil/], name: 'Recoil', category: 'state-management', description: 'React state management by Meta' },
  { patterns: [/jotai/], name: 'Jotai', category: 'state-management', description: 'Primitive and flexible state' },

  // Form Validation
  { patterns: [/yup(\.min)?\.js/], name: 'Yup', category: 'form-validation', description: 'Schema validation' },
  { patterns: [/joi/], name: 'Joi', category: 'form-validation', description: 'Data validation library' },
  { patterns: [/zod/], name: 'Zod', category: 'form-validation', description: 'TypeScript-first schema validation' },
  { patterns: [/validator(\.min)?\.js/], name: 'Validator.js', category: 'form-validation', description: 'String validation and sanitization' },

  // 3D Graphics
  { patterns: [/three(\.min)?\.js/, /three\.module\.js/], name: 'Three.js', category: '3d-graphics', description: '3D graphics library using WebGL' },
  { patterns: [/babylon/], name: 'Babylon.js', category: '3d-graphics', description: 'Powerful 3D engine' },
  { patterns: [/aframe/], name: 'A-Frame', category: '3d-graphics', description: 'WebVR framework' },

  // Game Engines
  { patterns: [/phaser/], name: 'Phaser', category: 'game-engine', description: 'HTML5 game framework' },
  { patterns: [/pixi/], name: 'PixiJS', category: 'game-engine', description: '2D WebGL renderer' },
  { patterns: [/createjs/, /easeljs/], name: 'CreateJS', category: 'game-engine', description: 'Suite for interactive content' },
  { patterns: [/p5(\.min)?\.js/], name: 'p5.js', category: 'game-engine', description: 'Creative coding library' },

  // PDF Viewers
  { patterns: [/pdf\.js/, /pdf\.worker/, /pdfjs-dist/], name: 'PDF.js', category: 'pdf-viewer', description: 'Mozilla PDF renderer' },
  { patterns: [/ViewerJS/], name: 'ViewerJS', category: 'pdf-viewer', description: 'Document viewer for web' },
  { patterns: [/webodf/], name: 'WebODF', category: 'pdf-viewer', description: 'ODF document viewer' },

  // Rich Text Editors
  { patterns: [/tinymce/], name: 'TinyMCE', category: 'rich-text-editor', description: 'WYSIWYG HTML editor' },
  { patterns: [/ckeditor/], name: 'CKEditor', category: 'rich-text-editor', description: 'Smart WYSIWYG editor' },
  { patterns: [/quill/], name: 'Quill', category: 'rich-text-editor', description: 'Modern rich text editor' },
  { patterns: [/froala/], name: 'Froala', category: 'rich-text-editor', description: 'WYSIWYG HTML Editor' },
  { patterns: [/draft-js/, /draftjs/], name: 'Draft.js', category: 'rich-text-editor', description: 'React rich text framework' },
  { patterns: [/slate/], name: 'Slate', category: 'rich-text-editor', description: 'Customizable rich text editor' },
  { patterns: [/trix/], name: 'Trix', category: 'rich-text-editor', description: 'Rich text editor by Basecamp' },
  { patterns: [/prosemirror/], name: 'ProseMirror', category: 'rich-text-editor', description: 'Semantic text editing toolkit' },
  { patterns: [/tiptap/], name: 'Tiptap', category: 'rich-text-editor', description: 'Headless rich text editor' },

  // Code Editors
  { patterns: [/monaco/], name: 'Monaco Editor', category: 'code-editor', description: 'VS Code editor component' },
  { patterns: [/codemirror/], name: 'CodeMirror', category: 'code-editor', description: 'Versatile text editor' },
  { patterns: [/ace-builds/, /ace\.js/, /ace-editor/], name: 'Ace Editor', category: 'code-editor', description: 'High-performance code editor' },
  { patterns: [/prism\.js/, /prismjs/], name: 'Prism', category: 'code-editor', description: 'Syntax highlighting library' },
  { patterns: [/highlight\.js/, /hljs/], name: 'Highlight.js', category: 'code-editor', description: 'Syntax highlighter' },
  { patterns: [/shiki/], name: 'Shiki', category: 'code-editor', description: 'Beautiful syntax highlighting' },

  // Video Players
  { patterns: [/video\.js/, /video-js/], name: 'Video.js', category: 'video-player', description: 'HTML5 video player' },
  { patterns: [/plyr/], name: 'Plyr', category: 'video-player', description: 'Simple HTML5 media player' },
  { patterns: [/jwplayer/], name: 'JW Player', category: 'video-player', description: 'Video player platform' },
  { patterns: [/mediaelement/], name: 'MediaElement.js', category: 'video-player', description: 'HTML5 audio/video player' },
  { patterns: [/hls\.js/], name: 'HLS.js', category: 'video-player', description: 'HLS client implementation' },
  { patterns: [/dash\.js/], name: 'DASH.js', category: 'video-player', description: 'MPEG-DASH player' },
  { patterns: [/shaka-player/], name: 'Shaka Player', category: 'video-player', description: 'Adaptive media player' },

  // Carousels/Sliders
  { patterns: [/swiper/], name: 'Swiper', category: 'carousel', description: 'Modern mobile touch slider' },
  { patterns: [/slick/], name: 'Slick', category: 'carousel', description: 'Carousel plugin for jQuery' },
  { patterns: [/owl\.carousel/, /owlcarousel/], name: 'Owl Carousel', category: 'carousel', description: 'Touch-enabled carousel' },
  { patterns: [/splide/], name: 'Splide', category: 'carousel', description: 'Lightweight slider/carousel' },
  { patterns: [/glide/], name: 'Glide.js', category: 'carousel', description: 'Dependency-free slider' },
  { patterns: [/flickity/], name: 'Flickity', category: 'carousel', description: 'Touch carousel' },

  // Testing
  { patterns: [/jest/], name: 'Jest', category: 'testing', description: 'JavaScript testing framework' },
  { patterns: [/mocha/], name: 'Mocha', category: 'testing', description: 'Feature-rich test framework' },
  { patterns: [/jasmine/], name: 'Jasmine', category: 'testing', description: 'BDD testing framework' },
  { patterns: [/chai/], name: 'Chai', category: 'testing', description: 'Assertion library' },
  { patterns: [/sinon/], name: 'Sinon', category: 'testing', description: 'Spies, stubs and mocks' },
  { patterns: [/cypress/], name: 'Cypress', category: 'testing', description: 'E2E testing tool' },
  { patterns: [/playwright/], name: 'Playwright', category: 'testing', description: 'Browser automation' },

  // Bundler Runtimes
  { patterns: [/webpack.*runtime/, /webpackBootstrap/], name: 'Webpack Runtime', category: 'bundler', description: 'Webpack module loader runtime' },
  { patterns: [/rollup/], name: 'Rollup', category: 'bundler', description: 'Module bundler' },
  { patterns: [/parcel/], name: 'Parcel', category: 'bundler', description: 'Zero-config bundler' },

  // Polyfills
  { patterns: [/core-js/, /corejs/], name: 'core-js', category: 'polyfill', description: 'Modular standard library polyfills' },
  { patterns: [/regenerator-runtime/], name: 'regenerator-runtime', category: 'polyfill', description: 'Generator/async support' },
  { patterns: [/babel.*polyfill/, /@babel\/runtime/], name: 'Babel Runtime', category: 'polyfill', description: 'Babel helper runtime' },
  { patterns: [/polyfill\.io/, /polyfills?\.(min\.)?js/i], name: 'Polyfills', category: 'polyfill', description: 'Browser polyfills' },

  // SCORM
  { patterns: [/scorm.*api/i, /scorm-again/i, /SCORM.*wrapper/i], name: 'SCORM API', category: 'scorm', description: 'SCORM LMS integration' },
  { patterns: [/pipwerks.*scorm/i], name: 'Pipwerks SCORM', category: 'scorm', description: 'SCORM API wrapper' },

  // Crypto
  { patterns: [/crypto-js/, /cryptojs/], name: 'CryptoJS', category: 'crypto', description: 'JavaScript crypto library' },
  { patterns: [/forge(\.min)?\.js/], name: 'node-forge', category: 'crypto', description: 'TLS/crypto implementation' },
  { patterns: [/sjcl/], name: 'SJCL', category: 'crypto', description: 'Stanford JavaScript Crypto' },
  { patterns: [/tweetnacl/], name: 'TweetNaCl', category: 'crypto', description: 'Cryptographic library' },
  { patterns: [/bcrypt/], name: 'bcrypt.js', category: 'crypto', description: 'bcrypt hashing' },

  // Compression
  { patterns: [/pako/], name: 'Pako', category: 'compression', description: 'zlib port to JavaScript' },
  { patterns: [/jszip/], name: 'JSZip', category: 'compression', description: 'Create and read ZIP files' },
  { patterns: [/fflate/], name: 'fflate', category: 'compression', description: 'Fast JavaScript compression' },

  // Analytics
  { patterns: [/google.*analytics/i, /gtag\.js/, /ga\.js/], name: 'Google Analytics', category: 'analytics', description: 'Google Analytics tracking' },
  { patterns: [/mixpanel/], name: 'Mixpanel', category: 'analytics', description: 'Product analytics' },
  { patterns: [/amplitude/], name: 'Amplitude', category: 'analytics', description: 'Product analytics platform' },
  { patterns: [/segment/], name: 'Segment', category: 'analytics', description: 'Customer data platform' },
  { patterns: [/hotjar/], name: 'Hotjar', category: 'analytics', description: 'Behavior analytics' },

  // Social
  { patterns: [/facebook.*sdk/i, /fb\.js/], name: 'Facebook SDK', category: 'social', description: 'Facebook JavaScript SDK' },
  { patterns: [/twitter.*sdk/i, /widgets\.js/], name: 'Twitter SDK', category: 'social', description: 'Twitter JavaScript SDK' },
  { patterns: [/linkedin/], name: 'LinkedIn SDK', category: 'social', description: 'LinkedIn JavaScript SDK' },

  // Payment
  { patterns: [/stripe\.js/, /stripe-js/], name: 'Stripe.js', category: 'payment', description: 'Stripe payment integration' },
  { patterns: [/paypal.*sdk/i, /paypal.*checkout/i], name: 'PayPal SDK', category: 'payment', description: 'PayPal JavaScript SDK' },
  { patterns: [/braintree/], name: 'Braintree', category: 'payment', description: 'Payment platform' },

  // Database
  { patterns: [/sql\.js/, /sql-wasm/], name: 'SQL.js', category: 'database', description: 'SQLite in JavaScript' },
  { patterns: [/pouchdb/], name: 'PouchDB', category: 'database', description: 'CouchDB-inspired database' },
  { patterns: [/dexie/], name: 'Dexie.js', category: 'database', description: 'IndexedDB wrapper' },
  { patterns: [/localforage/], name: 'localForage', category: 'database', description: 'Offline storage library' },
  { patterns: [/idb/], name: 'idb', category: 'database', description: 'IndexedDB with promises' },

  // WebSocket
  { patterns: [/socket\.io/, /socket-io/], name: 'Socket.io', category: 'websocket', description: 'Real-time bidirectional communication' },
  { patterns: [/sockjs/], name: 'SockJS', category: 'websocket', description: 'WebSocket emulation' },
  { patterns: [/ws\.js/], name: 'ws', category: 'websocket', description: 'WebSocket client/server' },

  // Other common libraries
  { patterns: [/uuid/], name: 'uuid', category: 'other', description: 'RFC-compliant UUID generation' },
  { patterns: [/nanoid/], name: 'nanoid', category: 'other', description: 'Secure unique ID generator' },
  { patterns: [/marked(\.min)?\.js/], name: 'marked', category: 'other', description: 'Markdown parser' },
  { patterns: [/markdown-it/], name: 'markdown-it', category: 'other', description: 'Markdown parser' },
  { patterns: [/showdown/], name: 'Showdown', category: 'other', description: 'Markdown to HTML converter' },
  { patterns: [/handlebars/], name: 'Handlebars', category: 'other', description: 'Semantic templating' },
  { patterns: [/mustache/], name: 'Mustache', category: 'other', description: 'Logic-less templates' },
  { patterns: [/ejs/], name: 'EJS', category: 'other', description: 'Embedded JavaScript templates' },
  { patterns: [/pug/], name: 'Pug', category: 'other', description: 'Template engine' },
  { patterns: [/i18next/], name: 'i18next', category: 'other', description: 'Internationalization framework' },
  { patterns: [/intl-messageformat/], name: 'FormatJS', category: 'other', description: 'Internationalization library' },
  { patterns: [/numeral/], name: 'Numeral.js', category: 'other', description: 'Number formatting' },
  { patterns: [/accounting/], name: 'Accounting.js', category: 'other', description: 'Number/currency formatting' },
  { patterns: [/file-saver/, /FileSaver/], name: 'FileSaver.js', category: 'other', description: 'Save files client-side' },
  { patterns: [/xlsx/, /sheetjs/], name: 'SheetJS', category: 'other', description: 'Spreadsheet parser' },
  { patterns: [/papaparse/], name: 'PapaParse', category: 'other', description: 'CSV parser' },
  { patterns: [/sortablejs/, /Sortable/], name: 'SortableJS', category: 'other', description: 'Drag-and-drop library' },
  { patterns: [/interact\.js/], name: 'interact.js', category: 'other', description: 'Drag, resize, gesture library' },
  { patterns: [/hammer\.js/, /hammerjs/], name: 'Hammer.js', category: 'other', description: 'Touch gestures' },
  { patterns: [/cropperjs/, /cropper\.js/], name: 'Cropper.js', category: 'other', description: 'Image cropping' },
  { patterns: [/fabric\.js/, /fabric/], name: 'Fabric.js', category: 'other', description: 'Canvas library' },
  { patterns: [/konva/], name: 'Konva', category: 'other', description: '2D canvas library' },
  { patterns: [/paper\.js/, /paper-core/], name: 'Paper.js', category: 'other', description: 'Vector graphics scripting' },
  { patterns: [/snap\.svg/], name: 'Snap.svg', category: 'other', description: 'SVG manipulation' },
  { patterns: [/svg\.js/], name: 'SVG.js', category: 'other', description: 'SVG manipulation library' },
  { patterns: [/autosize/], name: 'Autosize', category: 'other', description: 'Auto-resize textareas' },
  { patterns: [/cleave/], name: 'Cleave.js', category: 'other', description: 'Input formatting' },
  { patterns: [/imask/], name: 'Imask.js', category: 'other', description: 'Input masking' },
  { patterns: [/inputmask/], name: 'Inputmask', category: 'other', description: 'Input masking' },
  { patterns: [/flatpickr/], name: 'Flatpickr', category: 'other', description: 'Date/time picker' },
  { patterns: [/pikaday/], name: 'Pikaday', category: 'other', description: 'Date picker' },
  { patterns: [/choices\.js/], name: 'Choices.js', category: 'other', description: 'Customizable select' },
  { patterns: [/select2/], name: 'Select2', category: 'other', description: 'Searchable select' },
  { patterns: [/tom-select/, /tom\.select/], name: 'Tom Select', category: 'other', description: 'Select input' },
  { patterns: [/dropzone/], name: 'Dropzone.js', category: 'other', description: 'Drag-n-drop file uploads' },
  { patterns: [/uppy/], name: 'Uppy', category: 'other', description: 'Modular file uploader' },
  { patterns: [/filepond/], name: 'FilePond', category: 'other', description: 'File upload library' },
  { patterns: [/lightgallery/], name: 'LightGallery', category: 'other', description: 'Full-featured lightbox' },
  { patterns: [/fancybox/], name: 'Fancybox', category: 'other', description: 'Lightbox library' },
  { patterns: [/glightbox/], name: 'GLightbox', category: 'other', description: 'Pure JavaScript lightbox' },
  { patterns: [/photoswipe/], name: 'PhotoSwipe', category: 'other', description: 'JavaScript gallery' },
  { patterns: [/masonry/], name: 'Masonry', category: 'other', description: 'Cascading grid layout' },
  { patterns: [/isotope/], name: 'Isotope', category: 'other', description: 'Filtering and sorting layouts' },
  { patterns: [/lazysizes/], name: 'lazysizes', category: 'other', description: 'Lazy loading images' },
  { patterns: [/lozad/], name: 'Lozad', category: 'other', description: 'Lazy loader using IntersectionObserver' },
  { patterns: [/aos/], name: 'AOS', category: 'other', description: 'Animate On Scroll library' },
  { patterns: [/scrollreveal/], name: 'ScrollReveal', category: 'other', description: 'Scroll animations' },
  { patterns: [/particles\.js/, /tsparticles/], name: 'Particles.js', category: 'other', description: 'Particle backgrounds' },
  { patterns: [/typed\.js/], name: 'Typed.js', category: 'other', description: 'Typing animation library' },
  { patterns: [/countup/], name: 'CountUp.js', category: 'other', description: 'Animates number counting' },
  { patterns: [/tippy/], name: 'Tippy.js', category: 'other', description: 'Tooltip library' },
  { patterns: [/popper/], name: 'Popper.js', category: 'other', description: 'Tooltip positioning engine' },
  { patterns: [/floating-ui/], name: 'Floating UI', category: 'other', description: 'Positioning library' },
  { patterns: [/toastr/, /notyf/, /sweetalert/], name: 'Notification Libraries', category: 'other', description: 'Toast/notification systems' },
  { patterns: [/howler/], name: 'Howler.js', category: 'other', description: 'Audio library' },
  { patterns: [/tone\.js/], name: 'Tone.js', category: 'other', description: 'Web Audio framework' },
  { patterns: [/wavesurfer/], name: 'WaveSurfer.js', category: 'other', description: 'Audio waveform visualization' },
];

/**
 * Vendor directory patterns
 */
const VENDOR_DIRS = [
  'node_modules',
  'bower_components',
  'vendor',
  'vendors',
  'third-party',
  'third_party',
  'thirdparty',
  'external',
  'externals',
  'lib',
  'libs',
  'assets/js/lib',
  'assets/js/libs',
  'assets/js/vendor',
  'assets/vendor',
  'static/lib',
  'static/libs',
  'static/vendor',
  'public/lib',
  'public/libs',
  'public/vendor',
  'wwwroot/lib',
  'packages',
  '.pnpm',
  'jspm_packages',
];

/**
 * Smart library detector for ArchiCore
 * Identifies third-party libraries and provides metadata about them
 */
export class LibraryDetector {
  private detectedLibraries: Map<string, LibraryInfo> = new Map();
  private packageJsonDeps: Set<string> = new Set();
  private rootDir: string = '';

  /**
   * Initialize detector for a project
   */
  async initialize(projectDir: string): Promise<void> {
    this.rootDir = projectDir;
    this.detectedLibraries.clear();
    this.packageJsonDeps.clear();

    // Try to read package.json to get dependencies
    await this.loadPackageJsonDeps(projectDir);
  }

  /**
   * Load dependencies from package.json
   */
  private async loadPackageJsonDeps(projectDir: string): Promise<void> {
    try {
      const packageJsonPath = join(projectDir, 'package.json');
      const content = await readFile(packageJsonPath, 'utf-8');
      const pkg = JSON.parse(content);

      // Collect all dependencies
      const deps = [
        ...Object.keys(pkg.dependencies || {}),
        ...Object.keys(pkg.devDependencies || {}),
        ...Object.keys(pkg.peerDependencies || {}),
        ...Object.keys(pkg.optionalDependencies || {}),
      ];

      deps.forEach(dep => this.packageJsonDeps.add(dep));
      Logger.debug(`Loaded ${this.packageJsonDeps.size} dependencies from package.json`);
    } catch {
      // No package.json or invalid - that's fine
    }
  }

  /**
   * Check if a file is a library
   * Returns library info if detected, null otherwise
   */
  async isLibrary(filePath: string): Promise<LibraryInfo | null> {
    // Check cache first
    if (this.detectedLibraries.has(filePath)) {
      return this.detectedLibraries.get(filePath) || null;
    }

    const fileName = basename(filePath);
    const relativePath = this.rootDir ? relative(this.rootDir, filePath) : filePath;

    // 1. Check vendor directories
    const vendorMatch = this.isInVendorDir(relativePath);
    if (vendorMatch) {
      const info: LibraryInfo = {
        name: this.extractLibraryName(relativePath),
        category: 'other',
        description: 'Third-party library in vendor directory',
        detectedBy: 'vendor-dir',
        path: filePath
      };
      this.detectedLibraries.set(filePath, info);
      return info;
    }

    // 2. Check known patterns
    for (const lib of KNOWN_LIBRARIES) {
      for (const pattern of lib.patterns) {
        if (pattern.test(fileName) || pattern.test(relativePath)) {
          const info: LibraryInfo = {
            name: lib.name,
            category: lib.category,
            description: lib.description,
            detectedBy: 'pattern',
            path: filePath
          };
          this.detectedLibraries.set(filePath, info);
          return info;
        }
      }
    }

    // 3. Check if it's from a package.json dependency
    const depMatch = this.isFromPackageJsonDep(relativePath);
    if (depMatch) {
      const info: LibraryInfo = {
        name: depMatch,
        category: 'other',
        description: `Dependency from package.json`,
        detectedBy: 'package-json',
        path: filePath
      };
      this.detectedLibraries.set(filePath, info);
      return info;
    }

    // 4. Check if file content indicates minified code
    try {
      const stats = await stat(filePath);
      // Only check files under 5MB and with JS extensions
      if (stats.size < 5 * 1024 * 1024 && /\.(js|mjs|cjs)$/i.test(fileName)) {
        const isMinified = await this.isMinifiedFile(filePath, stats.size);
        if (isMinified) {
          const info: LibraryInfo = {
            name: this.extractLibraryName(relativePath),
            category: 'other',
            description: 'Detected as minified/bundled code',
            detectedBy: 'minified',
            path: filePath
          };
          this.detectedLibraries.set(filePath, info);
          return info;
        }
      }
    } catch {
      // Can't read file - skip minification check
    }

    return null;
  }

  /**
   * Check if file is in a vendor directory
   */
  private isInVendorDir(relativePath: string): boolean {
    const normalizedPath = relativePath.replace(/\\/g, '/').toLowerCase();
    return VENDOR_DIRS.some(dir => {
      const normalizedDir = dir.toLowerCase();
      return normalizedPath.includes(`/${normalizedDir}/`) ||
             normalizedPath.startsWith(`${normalizedDir}/`);
    });
  }

  /**
   * Check if file is from a package.json dependency
   */
  private isFromPackageJsonDep(relativePath: string): string | null {
    const parts = relativePath.replace(/\\/g, '/').split('/');

    // Check if any part matches a dependency name
    for (const part of parts) {
      // Handle scoped packages (@org/package)
      if (this.packageJsonDeps.has(part)) {
        return part;
      }
    }

    // Check for scoped packages
    for (let i = 0; i < parts.length - 1; i++) {
      if (parts[i].startsWith('@')) {
        const scopedName = `${parts[i]}/${parts[i + 1]}`;
        if (this.packageJsonDeps.has(scopedName)) {
          return scopedName;
        }
      }
    }

    return null;
  }

  /**
   * Check if a file is minified by analyzing its content
   */
  private async isMinifiedFile(filePath: string, fileSize: number): Promise<boolean> {
    try {
      // Read first 10KB to analyze
      const handle = await import('fs').then(fs =>
        new Promise<number>((resolve, reject) => {
          fs.open(filePath, 'r', (err, fd) => err ? reject(err) : resolve(fd));
        })
      );

      const buffer = Buffer.alloc(Math.min(10240, fileSize));
      const { read, close } = await import('fs').then(fs => ({
        read: fs.read,
        close: fs.close
      }));

      await new Promise<void>((resolve, reject) => {
        read(handle, buffer, 0, buffer.length, 0, (err) => {
          err ? reject(err) : resolve();
        });
      });

      await new Promise<void>((resolve) => {
        close(handle, () => resolve());
      });

      const content = buffer.toString('utf-8');

      // Minification indicators
      const lines = content.split('\n');
      const avgLineLength = content.length / Math.max(lines.length, 1);

      // Minified files typically have very long lines (>500 chars average)
      if (avgLineLength > 500) {
        return true;
      }

      // Check for common minification patterns
      const minifiedPatterns = [
        // Very few spaces between operators
        /\w+[=+\-*\/&|<>!]=?\w+[=+\-*\/&|<>!]=?\w+/,
        // Single-letter variables in sequence
        /\b[a-z],\s*[a-z],\s*[a-z],\s*[a-z]\b/i,
        // Chained function calls without newlines
        /\)\.\w+\(\)\.w+\(\)/,
        // Very dense code
        /\{[^}]{200,}\}/,
      ];

      let minifiedScore = 0;
      for (const pattern of minifiedPatterns) {
        if (pattern.test(content)) {
          minifiedScore++;
        }
      }

      // Check comment ratio - minified files have very few comments
      const commentMatches = content.match(/\/\*[\s\S]*?\*\/|\/\/.*/g) || [];
      const commentLength = commentMatches.join('').length;
      const commentRatio = commentLength / content.length;

      // If almost no comments and shows minification patterns
      if (commentRatio < 0.02 && minifiedScore >= 2) {
        return true;
      }

      // If file is large (>100KB) with no comments, likely minified
      if (fileSize > 100 * 1024 && commentRatio < 0.01) {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Extract a reasonable library name from path
   */
  private extractLibraryName(relativePath: string): string {
    const parts = relativePath.replace(/\\/g, '/').split('/');

    // Try to find a meaningful name
    for (let i = parts.length - 1; i >= 0; i--) {
      const part = parts[i];

      // Skip generic names
      if (['js', 'dist', 'build', 'src', 'lib', 'index.js', 'main.js'].includes(part.toLowerCase())) {
        continue;
      }

      // Remove file extension for filenames
      if (part.includes('.')) {
        return part.replace(/\.(min\.)?(js|mjs|cjs)$/i, '');
      }

      return part;
    }

    return basename(relativePath).replace(/\.(min\.)?(js|mjs|cjs)$/i, '');
  }

  /**
   * Get all detected libraries
   */
  getDetectedLibraries(): LibraryInfo[] {
    return Array.from(this.detectedLibraries.values());
  }

  /**
   * Get summary of detected libraries by category
   */
  getLibrarySummary(): Map<LibraryCategory, LibraryInfo[]> {
    const summary = new Map<LibraryCategory, LibraryInfo[]>();

    for (const lib of this.detectedLibraries.values()) {
      const existing = summary.get(lib.category) || [];
      existing.push(lib);
      summary.set(lib.category, existing);
    }

    return summary;
  }

  /**
   * Static method to quickly check if a path looks like a library
   * without full analysis (for performance in hot paths)
   */
  static quickCheck(filePath: string): boolean {
    const normalizedPath = filePath.replace(/\\/g, '/').toLowerCase();

    // Check vendor directories
    for (const dir of VENDOR_DIRS) {
      if (normalizedPath.includes(`/${dir}/`) || normalizedPath.startsWith(`${dir}/`)) {
        return true;
      }
    }

    // Check for minified pattern in filename
    if (/\.(min|bundle|packed)\.(js|mjs|cjs)$/i.test(filePath)) {
      return true;
    }

    // Check for hash in filename (bundler output)
    if (/\.[a-f0-9]{8,}\.(js|mjs|cjs)$/i.test(filePath)) {
      return true;
    }

    return false;
  }
}

// Export singleton for convenience
export const libraryDetector = new LibraryDetector();
