import { readFile, stat } from 'fs/promises';
import { join, relative, extname, resolve } from 'path';
import { glob } from 'glob';
import { Logger } from './logger.js';
import { LibraryDetector, LibraryInfo } from './library-detector.js';
import {
  scan as nativeScan,
  hashFile as nativeHashFile,
  isIndexerNativeAvailable,
  type IndexerConfig
} from '../native/index.js';

// Флаг использования нативного модуля
const useNativeIndexer = isIndexerNativeAvailable();
if (useNativeIndexer) {
  Logger.info('FileUtils: Using native C++ indexer for high performance scanning');
} else {
  Logger.debug('FileUtils: Using JS fallback for file scanning');
}

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB max file size for parsing

// Comprehensive list of library/vendor directories and patterns
const LIBRARY_IGNORE_PATTERNS = [
  // ===== Package Managers =====
  'node_modules/**',
  '**/node_modules/**',
  'bower_components/**',
  '**/bower_components/**',
  'jspm_packages/**',
  '**/jspm_packages/**',
  '.pnpm/**',
  '**/.pnpm/**',

  // PHP
  'vendor/**',
  '**/vendor/**',

  // Python
  'venv/**',
  '.venv/**',
  '**/venv/**',
  '**/.venv/**',
  '**/site-packages/**',
  '**/__pycache__/**',
  '**/*.pyc',
  '*.egg-info/**',
  '.eggs/**',
  '.tox/**',
  '.nox/**',
  'poetry.lock',
  'Pipfile.lock',

  // Ruby
  'Gemfile.lock',
  '.bundle/**',

  // Go
  'vendor/**',

  // Rust
  'Cargo.lock',
  'target/**',

  // .NET
  'packages/**',
  '**/packages/**',
  'bin/**',
  '**/bin/**',
  'obj/**',
  '**/obj/**',

  // Java/Kotlin
  '.gradle/**',
  '**/build/**',
  '**/.gradle/**',

  // ===== Build/Generated Output =====
  'dist/**',
  '**/dist/**',
  'build/**',
  '**/build/**',
  'out/**',
  '**/out/**',
  '.next/**',
  '.nuxt/**',
  '.output/**',
  '.svelte-kit/**',
  '.vercel/**',
  '.netlify/**',
  'public/build/**',
  'public/dist/**',
  '_site/**',
  'site/**',

  // ===== Version Control =====
  '.git/**',
  '.svn/**',
  '.hg/**',
  '.fossil/**',

  // ===== IDE/Editor =====
  '.idea/**',
  '.vscode/**',
  '.vs/**',
  '*.sublime-*',
  '.atom/**',
  '.eclipse/**',

  // ===== Test Coverage =====
  'coverage/**',
  '.nyc_output/**',
  'htmlcov/**',
  '.coverage/**',
  'lcov-report/**',

  // ===== Cache Directories =====
  '.cache/**',
  '**/.cache/**',
  '.parcel-cache/**',
  '.turbo/**',
  '.eslintcache',
  '.stylelintcache',
  '.prettiercache',

  // ===== Lock Files =====
  'package-lock.json',
  'yarn.lock',
  'pnpm-lock.yaml',
  'bun.lockb',
  'composer.lock',
  'shrinkwrap.json',

  // ===== Minified/Bundled Files =====
  '**/*.min.js',
  '**/*.min.css',
  '**/*.min.mjs',
  '**/*.bundle.js',
  '**/*.bundle.css',
  '**/*.chunk.js',
  '**/*.chunk.css',
  '**/*-min.js',
  '**/*.packed.js',
  '**/*.compressed.js',
  '**/*.optimized.js',

  // Webpack/Vite bundles with hashes
  '**/app.[a-f0-9]*.js',
  '**/vendor.[a-f0-9]*.js',
  '**/chunk-vendors.[a-f0-9]*.js',
  '**/main.[a-f0-9]*.js',
  '**/index.[a-f0-9]*.js',
  '**/*.[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9].js',
  '**/*.[a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9][a-f0-9].css',
  '**/[0-9]*.[a-f0-9]*.js',
  '**/assets/js/*.[a-f0-9]*.js',
  '**/assets/css/*.[a-f0-9]*.css',

  // ===== Third-Party Library Directories =====
  '**/lib/**',
  '**/libs/**',
  '**/third-party/**',
  '**/third_party/**',
  '**/thirdparty/**',
  '**/external/**',
  '**/externals/**',
  '**/assets/lib/**',
  '**/assets/libs/**',
  '**/assets/vendor/**',
  '**/static/lib/**',
  '**/static/libs/**',
  '**/static/vendor/**',
  '**/public/lib/**',
  '**/public/libs/**',
  '**/public/vendor/**',
  '**/wwwroot/lib/**',

  // ===== Rich Text Editors =====
  '**/tinymce/**',
  '**/ckeditor/**',
  '**/ckeditor4/**',
  '**/ckeditor5/**',
  '**/codemirror/**',
  '**/ace-builds/**',
  '**/ace-editor/**',
  '**/monaco-editor/**',
  '**/quill/**',
  '**/froala-editor/**',
  '**/draft-js/**',
  '**/slate/**',
  '**/prosemirror/**',
  '**/tiptap/**',
  '**/trix/**',
  '**/summernote/**',
  '**/medium-editor/**',
  '**/jodit/**',
  '**/suneditor/**',

  // ===== PDF/Document Viewers =====
  '**/ViewerJS/**',
  '**/pdfjs/**',
  '**/pdfjs-dist/**',
  '**/pdf.js',
  '**/pdf.worker.js',
  '**/pdf.worker.min.js',
  '**/webodf/**',
  '**/webodf.js',
  '**/mammoth/**',

  // ===== UI Frameworks =====
  '**/react.js',
  '**/react.min.js',
  '**/react-dom.js',
  '**/react-dom.min.js',
  '**/vue.js',
  '**/vue.min.js',
  '**/vue.esm.js',
  '**/vue.global.js',
  '**/angular.js',
  '**/angular.min.js',
  '**/svelte.js',
  '**/preact.js',
  '**/preact.min.js',
  '**/ember.js',
  '**/ember.min.js',
  '**/backbone.js',
  '**/backbone.min.js',

  // ===== Utility Libraries =====
  '**/jquery*.js',
  '**/jquery-*.js',
  '**/zepto*.js',
  '**/lodash*.js',
  '**/underscore*.js',
  '**/ramda*.js',
  '**/rxjs/**',
  '**/immutable*.js',

  // ===== Date/Time =====
  '**/moment*.js',
  '**/moment-with-locales*.js',
  '**/dayjs*.js',
  '**/date-fns/**',
  '**/luxon*.js',

  // ===== Animation =====
  '**/gsap/**',
  '**/TweenMax*.js',
  '**/TweenLite*.js',
  '**/anime*.js',
  '**/velocity*.js',
  '**/lottie*.js',
  '**/framer-motion/**',

  // ===== Charting/Visualization =====
  '**/chart*.js',
  '**/chartjs/**',
  '**/d3.js',
  '**/d3.min.js',
  '**/d3/**',
  '**/highcharts*.js',
  '**/highcharts/**',
  '**/echarts*.js',
  '**/echarts/**',
  '**/plotly*.js',
  '**/plotly/**',
  '**/apexcharts*.js',
  '**/recharts/**',
  '**/victory/**',
  '**/nivo/**',

  // ===== Mapping =====
  '**/leaflet*.js',
  '**/leaflet/**',
  '**/mapbox*.js',
  '**/mapbox-gl*.js',
  '**/openlayers/**',
  '**/ol.js',
  '**/ol/**',
  '**/google-maps*.js',

  // ===== 3D Graphics =====
  '**/three.js',
  '**/three.min.js',
  '**/three.module.js',
  '**/three/**',
  '**/babylon*.js',
  '**/babylonjs/**',
  '**/aframe*.js',
  '**/aframe/**',

  // ===== Game Engines =====
  '**/phaser*.js',
  '**/phaser/**',
  '**/pixi*.js',
  '**/pixi/**',
  '**/pixijs/**',
  '**/createjs/**',
  '**/easeljs/**',
  '**/p5.js',
  '**/p5.min.js',
  '**/p5/**',
  '**/matter*.js',
  '**/matter-js/**',

  // ===== Video Players =====
  '**/video.js',
  '**/video-js/**',
  '**/plyr*.js',
  '**/plyr/**',
  '**/jwplayer/**',
  '**/mediaelement*.js',
  '**/hls.js',
  '**/hls.min.js',
  '**/dash.all*.js',
  '**/shaka-player*.js',
  '**/videojs-**',
  '**/flowplayer/**',

  // ===== Carousel/Slider =====
  '**/swiper*.js',
  '**/swiper/**',
  '**/slick*.js',
  '**/slick/**',
  '**/owl.carousel*.js',
  '**/owlcarousel/**',
  '**/splide*.js',
  '**/glide*.js',
  '**/flickity*.js',
  '**/keen-slider/**',

  // ===== Syntax Highlighting =====
  '**/highlight.js',
  '**/highlight.min.js',
  '**/highlight/**',
  '**/hljs/**',
  '**/prism.js',
  '**/prism.min.js',
  '**/prismjs/**',
  '**/shiki/**',
  '**/rouge/**',

  // ===== State Management =====
  '**/redux*.js',
  '**/redux/**',
  '**/mobx*.js',
  '**/mobx/**',
  '**/vuex*.js',
  '**/pinia*.js',
  '**/zustand/**',
  '**/recoil/**',
  '**/jotai/**',
  '**/xstate/**',

  // ===== HTTP Clients =====
  '**/axios*.js',
  '**/superagent*.js',
  '**/ky*.js',
  '**/got/**',

  // ===== WebSocket =====
  '**/socket.io*.js',
  '**/socket.io/**',
  '**/sockjs*.js',
  '**/ws.js',

  // ===== Crypto/Security =====
  '**/crypto-js/**',
  '**/cryptojs/**',
  '**/forge*.js',
  '**/node-forge/**',
  '**/sjcl*.js',
  '**/tweetnacl*.js',
  '**/bcrypt*.js',
  '**/argon2*.js',

  // ===== Compression =====
  '**/pako*.js',
  '**/jszip*.js',
  '**/fflate*.js',
  '**/lz-string*.js',

  // ===== Forms/Validation =====
  '**/yup*.js',
  '**/joi*.js',
  '**/zod*.js',
  '**/validator*.js',
  '**/vee-validate/**',
  '**/formik/**',
  '**/react-hook-form/**',

  // ===== Markdown =====
  '**/marked*.js',
  '**/markdown-it*.js',
  '**/showdown*.js',
  '**/remark/**',
  '**/unified/**',

  // ===== Templates =====
  '**/handlebars*.js',
  '**/mustache*.js',
  '**/ejs*.js',
  '**/pug*.js',
  '**/nunjucks*.js',

  // ===== i18n =====
  '**/i18next*.js',
  '**/i18next/**',
  '**/intl-messageformat*.js',
  '**/formatjs/**',
  '**/vue-i18n*.js',
  '**/react-intl/**',

  // ===== Analytics/Tracking =====
  '**/gtag.js',
  '**/ga.js',
  '**/analytics*.js',
  '**/mixpanel*.js',
  '**/amplitude*.js',
  '**/segment*.js',
  '**/hotjar*.js',

  // ===== Social SDKs =====
  '**/fb.js',
  '**/facebook*.js',
  '**/twitter*.js',
  '**/linkedin*.js',
  '**/all.js', // Facebook SDK common name

  // ===== Payment =====
  '**/stripe*.js',
  '**/paypal*.js',
  '**/braintree*.js',
  '**/square*.js',

  // ===== SCORM/LMS =====
  '**/scorm*.js',
  '**/SCORM*.js',
  '**/scorm-again*.js',
  '**/pipwerks*.js',
  '**/xapi*.js',
  '**/tincan*.js',

  // ===== Database/Storage =====
  '**/sql.js',
  '**/sql-wasm*.js',
  '**/pouchdb*.js',
  '**/dexie*.js',
  '**/localforage*.js',
  '**/idb*.js',
  '**/lowdb*.js',

  // ===== Polyfills =====
  '**/core-js/**',
  '**/corejs/**',
  '**/regenerator-runtime/**',
  '**/babel-polyfill*.js',
  '**/polyfill*.js',
  '**/es5-shim*.js',
  '**/es6-shim*.js',
  '**/es6-promise*.js',
  '**/whatwg-fetch*.js',
  '**/unfetch*.js',

  // ===== Other Popular Libraries =====
  '**/uuid*.js',
  '**/nanoid*.js',
  '**/file-saver*.js',
  '**/FileSaver*.js',
  '**/xlsx*.js',
  '**/sheetjs/**',
  '**/exceljs/**',
  '**/papaparse*.js',
  '**/sortable*.js',
  '**/interact*.js',
  '**/hammer*.js',
  '**/cropper*.js',
  '**/fabric*.js',
  '**/konva*.js',
  '**/paper*.js',
  '**/snap.svg*.js',
  '**/svg.js',
  '**/autosize*.js',
  '**/cleave*.js',
  '**/imask*.js',
  '**/inputmask*.js',
  '**/flatpickr*.js',
  '**/pikaday*.js',
  '**/choices*.js',
  '**/select2*.js',
  '**/tom-select*.js',
  '**/dropzone*.js',
  '**/uppy/**',
  '**/filepond*.js',
  '**/lightgallery*.js',
  '**/fancybox*.js',
  '**/glightbox*.js',
  '**/photoswipe*.js',
  '**/masonry*.js',
  '**/isotope*.js',
  '**/lazysizes*.js',
  '**/lozad*.js',
  '**/aos*.js',
  '**/scrollreveal*.js',
  '**/particles*.js',
  '**/tsparticles/**',
  '**/typed*.js',
  '**/countup*.js',
  '**/tippy*.js',
  '**/popper*.js',
  '**/floating-ui/**',
  '**/toastr*.js',
  '**/notyf*.js',
  '**/sweetalert*.js',
  '**/howler*.js',
  '**/tone*.js',
  '**/wavesurfer*.js',
  '**/numeral*.js',
  '**/accounting*.js',
  '**/money*.js',
  '**/dinero*.js',

  // ===== CSS Frameworks =====
  '**/bootstrap*.js',
  '**/bootstrap*.css',
  '**/bootstrap/**',
  '**/tailwind*.css',
  '**/bulma*.css',
  '**/foundation*.js',
  '**/foundation*.css',
  '**/materialize*.js',
  '**/materialize*.css',
  '**/semantic*.js',
  '**/semantic*.css',
  '**/uikit*.js',
  '**/uikit*.css',
  '**/normalize.css',
  '**/reset.css',
  '**/sanitize.css',

  // ===== Font Files (not code) =====
  '**/*.woff',
  '**/*.woff2',
  '**/*.ttf',
  '**/*.otf',
  '**/*.eot',
];

export class FileUtils {
  static async readFileContent(filePath: string): Promise<string> {
    return await readFile(filePath, 'utf-8');
  }

  static async getFileSize(filePath: string): Promise<number> {
    const stats = await stat(filePath);
    return stats.size;
  }

  static async getAllFiles(
    rootDir: string,
    patterns: string[] = [
      // JavaScript/TypeScript ecosystem
      '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.mjs', '**/*.cjs',
      '**/*.vue', '**/*.svelte', '**/*.astro',

      // Python
      '**/*.py', '**/*.pyw', '**/*.pyi',

      // Systems languages
      '**/*.go',                                       // Go
      '**/*.rs',                                       // Rust
      '**/*.zig',                                      // Zig
      '**/*.nim',                                      // Nim
      '**/*.c', '**/*.h', '**/*.cpp', '**/*.hpp', '**/*.cc', '**/*.cxx', '**/*.hh', // C/C++

      // JVM languages
      '**/*.java',                                     // Java
      '**/*.kt', '**/*.kts',                          // Kotlin
      '**/*.scala', '**/*.sc',                        // Scala
      '**/*.groovy', '**/*.gradle',                   // Groovy
      '**/*.clj', '**/*.cljs', '**/*.cljc',          // Clojure

      // .NET languages
      '**/*.cs',                                       // C#
      '**/*.fs', '**/*.fsx',                          // F#
      '**/*.vb',                                       // Visual Basic

      // Web/scripting
      '**/*.php',                                      // PHP
      '**/*.rb', '**/*.erb', '**/*.rake',            // Ruby
      '**/*.pl', '**/*.pm',                          // Perl
      '**/*.lua',                                      // Lua

      // Mobile
      '**/*.swift',                                    // Swift
      '**/*.dart',                                     // Dart/Flutter
      '**/*.m', '**/*.mm',                           // Objective-C

      // Functional languages
      '**/*.hs', '**/*.lhs',                          // Haskell
      '**/*.ml', '**/*.mli',                          // OCaml
      '**/*.erl', '**/*.hrl',                         // Erlang
      '**/*.ex', '**/*.exs',                          // Elixir
      '**/*.jl',                                       // Julia
      '**/*.r', '**/*.R',                             // R

      // Other compiled
      '**/*.cr',                                       // Crystal

      // Markup/styles
      '**/*.html', '**/*.htm',                         // HTML
      '**/*.css', '**/*.scss', '**/*.sass', '**/*.less', '**/*.styl', // CSS
      '**/*.xml', '**/*.xsl', '**/*.xslt',            // XML

      // Data/config
      '**/*.json',                                     // JSON
      '**/*.yaml', '**/*.yml',                         // YAML
      '**/*.toml',                                     // TOML
      '**/*.ini', '**/*.cfg', '**/*.conf',            // INI/Config

      // Database/query
      '**/*.sql', '**/*.prisma',                      // SQL/Prisma
      '**/*.graphql', '**/*.gql',                     // GraphQL

      // Infrastructure
      '**/*.tf', '**/*.tfvars',                       // Terraform
      '**/*.proto',                                    // Protobuf
      '**/Dockerfile', '**/*.dockerfile',             // Docker
      '**/Makefile', '**/*.mk',                       // Make
      '**/CMakeLists.txt', '**/*.cmake',              // CMake

      // Shell/scripting
      '**/*.sh', '**/*.bash', '**/*.zsh',             // Unix shell
      '**/*.ps1', '**/*.psm1', '**/*.psd1',           // PowerShell
      '**/*.bat', '**/*.cmd',                          // Windows batch

      // Documentation
      '**/*.md', '**/*.markdown', '**/*.mdx', '**/*.rst'  // Markdown/RST
    ]
  ): Promise<string[]> {
    // Resolve to absolute path
    const resolvedPath = resolve(rootDir);
    // Normalize for glob (use forward slashes on all platforms)
    const absoluteRootDir = resolvedPath.replace(/\\/g, '/');
    // Logger.debug for verbose output (only in DEBUG mode)
    if (process.env.DEBUG) {
      Logger.info(`getAllFiles: rootDir=${rootDir}, resolvedPath=${resolvedPath}`);
    }

    // Check if directory exists and is accessible
    try {
      const dirStats = await stat(resolvedPath);
      if (!dirStats.isDirectory()) {
        Logger.error(`getAllFiles: ${resolvedPath} is not a directory`);
        return [];
      }
      // Directory exists - no need to log in production
    } catch (err) {
      Logger.error(`getAllFiles: Cannot access directory ${resolvedPath}: ${err}`);
      return [];
    }

    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: absoluteRootDir,
        nodir: true,  // Exclude directories that match file patterns (e.g., "404.php/")
        dot: true,    // Include files in hidden directories (e.g., ".default/")
        ignore: LIBRARY_IGNORE_PATTERNS,
        absolute: true
      });
      files.push(...matches);
    }

    // Verbose logging only in DEBUG mode
    if (process.env.DEBUG) {
      Logger.info(`getAllFiles: found ${files.length} files`);
    }

    // If no files found, list directory contents for debugging
    if (files.length === 0) {
      try {
        const { readdir } = await import('fs/promises');
        const contents = await readdir(resolvedPath, { withFileTypes: true });
        const listing = contents.map(d => `${d.isDirectory() ? '[DIR]' : '[FILE]'} ${d.name}`);
        Logger.warn(`getAllFiles: No files found! Directory contents: ${listing.join(', ') || '(empty)'}`);

        // If there's a single directory inside, it might be a GitHub ZIP inner folder
        const dirs = contents.filter(d => d.isDirectory());
        if (dirs.length === 1) {
          Logger.info(`getAllFiles: Found single subdirectory "${dirs[0].name}", trying to scan inside...`);
          const innerPath = join(resolvedPath, dirs[0].name);
          const innerContents = await readdir(innerPath, { withFileTypes: true });
          const innerListing = innerContents.slice(0, 10).map(d => `${d.isDirectory() ? '[DIR]' : '[FILE]'} ${d.name}`);
          Logger.info(`getAllFiles: Inner directory contents (first 10): ${innerListing.join(', ')}`);
        }
      } catch (listErr) {
        Logger.error(`getAllFiles: Failed to list directory: ${listErr}`);
      }
    }

    // Filter out large files and directories
    const filteredFiles: string[] = [];
    for (const file of [...new Set(files)]) {
      try {
        const stats = await stat(file);
        // Skip directories (e.g., folders named "404.php")
        if (!stats.isFile()) {
          continue;
        }
        if (stats.size <= MAX_FILE_SIZE) {
          filteredFiles.push(file);
        }
      } catch {
        // Skip files we can't stat
      }
    }

    // Only log file list in DEBUG mode
    if (process.env.DEBUG && filteredFiles.length > 0) {
      Logger.info(`getAllFiles: returning ${filteredFiles.length} files`);
    }

    return filteredFiles;
  }

  static getLanguageFromExtension(filePath: string): string {
    const ext = extname(filePath).toLowerCase();
    const filename = filePath.split(/[/\\]/).pop()?.toLowerCase() || '';

    // Special filenames
    if (filename === 'dockerfile' || filename.endsWith('.dockerfile')) return 'dockerfile';
    if (filename === 'makefile' || filename.endsWith('.mk')) return 'make';
    if (filename === 'cmakelists.txt' || filename.endsWith('.cmake')) return 'cmake';

    const map: Record<string, string> = {
      // JavaScript/TypeScript
      '.ts': 'typescript', '.tsx': 'typescript', '.mts': 'typescript', '.cts': 'typescript',
      '.js': 'javascript', '.jsx': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript',
      '.vue': 'vue', '.svelte': 'svelte', '.astro': 'astro',

      // Python
      '.py': 'python', '.pyw': 'python', '.pyi': 'python',

      // Systems languages
      '.go': 'go',
      '.rs': 'rust',
      '.zig': 'zig',
      '.nim': 'nim',
      '.c': 'c', '.h': 'c',
      '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp', '.hh': 'cpp', '.hxx': 'cpp',

      // JVM languages
      '.java': 'java',
      '.kt': 'kotlin', '.kts': 'kotlin',
      '.scala': 'scala', '.sc': 'scala',
      '.groovy': 'groovy', '.gradle': 'groovy',
      '.clj': 'clojure', '.cljs': 'clojure', '.cljc': 'clojure',

      // .NET languages
      '.cs': 'csharp',
      '.fs': 'fsharp', '.fsx': 'fsharp', '.fsi': 'fsharp',
      '.vb': 'visualbasic',

      // Web/scripting
      '.php': 'php', '.phtml': 'php',
      '.rb': 'ruby', '.erb': 'ruby', '.rake': 'ruby',
      '.pl': 'perl', '.pm': 'perl',
      '.lua': 'lua',

      // Mobile
      '.swift': 'swift',
      '.dart': 'dart',
      '.m': 'objectivec', '.mm': 'objectivec',

      // Functional languages
      '.hs': 'haskell', '.lhs': 'haskell',
      '.ml': 'ocaml', '.mli': 'ocaml',
      '.erl': 'erlang', '.hrl': 'erlang',
      '.ex': 'elixir', '.exs': 'elixir',
      '.jl': 'julia',
      '.r': 'r', '.R': 'r',

      // Other compiled
      '.cr': 'crystal',

      // Markup/styles
      '.html': 'html', '.htm': 'html',
      '.css': 'css', '.scss': 'scss', '.sass': 'sass', '.less': 'less', '.styl': 'stylus',
      '.xml': 'xml', '.xsl': 'xml', '.xslt': 'xml',

      // Data/config
      '.json': 'json',
      '.yaml': 'yaml', '.yml': 'yaml',
      '.toml': 'toml',
      '.ini': 'ini', '.cfg': 'ini', '.conf': 'ini',

      // Database/query
      '.sql': 'sql',
      '.prisma': 'prisma',
      '.graphql': 'graphql', '.gql': 'graphql',

      // Infrastructure
      '.tf': 'terraform', '.tfvars': 'terraform',
      '.proto': 'protobuf',

      // Shell/scripting
      '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
      '.ps1': 'powershell', '.psm1': 'powershell', '.psd1': 'powershell',
      '.bat': 'batch', '.cmd': 'batch',

      // Documentation
      '.md': 'markdown', '.markdown': 'markdown', '.mdx': 'markdown',
      '.rst': 'restructuredtext'
    };
    return map[ext] || 'unknown';
  }

  static async getProjectStructure(rootDir: string): Promise<ProjectStructure> {
    const files = await this.getAllFiles(rootDir);
    const structure: ProjectStructure = {
      rootDir,
      files: [],
      directories: new Set()
    };

    for (const file of files) {
      const rel = relative(rootDir, file);
      const stats = await stat(file);

      structure.files.push({
        path: file,
        relativePath: rel,
        language: this.getLanguageFromExtension(file),
        size: stats.size,
        lastModified: stats.mtime
      });

      const parts = rel.split(/[/\\]/);
      const dirPath = join(rootDir, ...parts.slice(0, -1));
      structure.directories.add(dirPath);
    }

    return structure;
  }
}

export interface ProjectStructure {
  rootDir: string;
  files: FileInfo[];
  directories: Set<string>;
}

export interface FileInfo {
  path: string;
  relativePath: string;
  language: string;
  size: number;
  lastModified: Date;
  isLibrary?: boolean;
  libraryInfo?: LibraryInfo;
  /** Content hash (xxHash64 if native, SHA256 if JS fallback) */
  contentHash?: string;
}

/**
 * Result of project scanning with library separation
 */
export interface ScanResult {
  /** User's source code files */
  sourceFiles: string[];
  /** Detected library files with metadata */
  libraryFiles: LibraryInfo[];
  /** Summary of libraries by category */
  librarySummary: {
    category: string;
    count: number;
    libraries: string[];
  }[];
}

/**
 * Extended FileUtils with smart library detection
 */
export class FileUtilsWithLibraries {
  private detector: LibraryDetector;

  constructor() {
    this.detector = new LibraryDetector();
  }

  /**
   * Scan a project and separate source files from libraries
   * Libraries are detected but not included in source files
   */
  async scanProject(rootDir: string): Promise<ScanResult> {
    await this.detector.initialize(rootDir);

    // Get all potential files (including potential libraries for detection)
    const allFiles = await this.getAllFilesIncludingLibraries(rootDir);

    const sourceFiles: string[] = [];
    const libraryFiles: LibraryInfo[] = [];

    for (const file of allFiles) {
      const libInfo = await this.detector.isLibrary(file);
      if (libInfo) {
        libraryFiles.push(libInfo);
      } else {
        sourceFiles.push(file);
      }
    }

    // Create summary
    const summary = this.detector.getLibrarySummary();
    const librarySummary = Array.from(summary.entries()).map(([category, libs]) => ({
      category,
      count: libs.length,
      libraries: [...new Set(libs.map(l => l.name))]
    }));

    Logger.info(`Scanned ${allFiles.length} files: ${sourceFiles.length} source, ${libraryFiles.length} libraries`);

    return {
      sourceFiles,
      libraryFiles,
      librarySummary
    };
  }

  /**
   * Get all files including potential libraries (for detection purposes)
   * Uses native indexer when available for much faster scanning
   */
  private async getAllFilesIncludingLibraries(rootDir: string): Promise<string[]> {
    const resolvedPath = resolve(rootDir);
    const absoluteRootDir = resolvedPath.replace(/\\/g, '/');

    try {
      const dirStats = await stat(resolvedPath);
      if (!dirStats.isDirectory()) {
        return [];
      }
    } catch {
      return [];
    }

    // Попробовать нативный сканер (намного быстрее)
    if (useNativeIndexer) {
      try {
        const nativeConfig: IndexerConfig = {
          excludePatterns: [
            '**/.git/**',
            '**/.svn/**',
            '**/.hg/**',
            '**/.cache/**',
          ],
          includePatterns: [
            '**/*.js', '**/*.mjs', '**/*.cjs',
            '**/*.ts', '**/*.tsx', '**/*.jsx',
            '**/*.vue', '**/*.svelte',
          ],
          maxFileSize: MAX_FILE_SIZE,
          computeContentHash: false, // Не нужен хэш на этом этапе
        };

        const result = await nativeScan(resolvedPath, nativeConfig);
        if (!result.error && result.files.length > 0) {
          Logger.debug(`[Native] Scanned ${resolvedPath}: ${result.files.length} files in ${result.scanTimeMs.toFixed(1)}ms`);
          // Конвертируем относительные пути в абсолютные
          return result.files.map(f => join(resolvedPath, f.path));
        }
      } catch (e) {
        Logger.warn(`Native scanner failed, falling back to glob: ${e}`);
      }
    }

    // JS Fallback: glob-based scanning
    const patterns = [
      '**/*.js', '**/*.mjs', '**/*.cjs',
      '**/*.ts', '**/*.tsx', '**/*.jsx',
      '**/*.vue', '**/*.svelte',
    ];

    const files: string[] = [];

    for (const pattern of patterns) {
      const matches = await glob(pattern, {
        cwd: absoluteRootDir,
        nodir: true,
        dot: true,
        ignore: [
          // Only exclude version control and cache
          '.git/**',
          '.svn/**',
          '.hg/**',
          '.cache/**',
          '**/.cache/**',
        ],
        absolute: true
      });
      files.push(...matches);
    }

    // Filter by size
    const filteredFiles: string[] = [];
    for (const file of [...new Set(files)]) {
      try {
        const stats = await stat(file);
        if (stats.isFile() && stats.size <= MAX_FILE_SIZE) {
          filteredFiles.push(file);
        }
      } catch {
        // Skip inaccessible files
      }
    }

    return filteredFiles;
  }

  /**
   * Get detailed library information for a project
   * This is what ArchiCore uses to "know what a library does"
   */
  async getLibraryDetails(rootDir: string): Promise<{
    libraries: LibraryInfo[];
    byCategory: Map<string, LibraryInfo[]>;
    summary: string;
  }> {
    const result = await this.scanProject(rootDir);

    const byCategory = new Map<string, LibraryInfo[]>();
    for (const lib of result.libraryFiles) {
      const existing = byCategory.get(lib.category) || [];
      existing.push(lib);
      byCategory.set(lib.category, existing);
    }

    // Generate human-readable summary
    const lines: string[] = [];
    if (result.libraryFiles.length > 0) {
      lines.push(`Detected ${result.libraryFiles.length} third-party libraries:`);
      lines.push('');

      for (const [category, libs] of byCategory.entries()) {
        const uniqueNames = [...new Set(libs.map(l => l.name))];
        const categoryLabel = category.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        lines.push(`**${categoryLabel}**: ${uniqueNames.join(', ')}`);
      }
    } else {
      lines.push('No third-party libraries detected.');
    }

    return {
      libraries: result.libraryFiles,
      byCategory,
      summary: lines.join('\n')
    };
  }
}

// Export singleton
export const fileUtilsWithLibraries = new FileUtilsWithLibraries();

/**
 * Hash a file using native xxHash64 (fast) or SHA256 (fallback)
 */
export function hashFile(filePath: string): string {
  return nativeHashFile(filePath);
}

/**
 * Check if native file indexer is available
 */
export function isNativeFileIndexerAvailable(): boolean {
  return useNativeIndexer;
}

/**
 * Fast project scan using native indexer
 * Returns file entries with hashes for incremental indexing
 */
export async function scanProjectFast(
  rootDir: string,
  options?: {
    includePatterns?: string[];
    excludePatterns?: string[];
    computeHash?: boolean;
  }
): Promise<{
  files: Array<{
    path: string;
    relativePath: string;
    size: number;
    hash: string;
    language: string;
  }>;
  scanTimeMs: number;
  isNative: boolean;
}> {
  const resolvedPath = resolve(rootDir);
  const startTime = performance.now();

  const config: IndexerConfig = {
    includePatterns: options?.includePatterns ?? [
      '**/*.ts', '**/*.js', '**/*.tsx', '**/*.jsx', '**/*.mjs', '**/*.cjs',
      '**/*.vue', '**/*.svelte', '**/*.py', '**/*.go', '**/*.rs',
      '**/*.java', '**/*.kt', '**/*.cpp', '**/*.c', '**/*.h',
    ],
    excludePatterns: options?.excludePatterns ?? [
      '**/node_modules/**', '**/.git/**', '**/dist/**', '**/build/**',
      '**/__pycache__/**', '**/*.min.js', '**/*.min.css',
      '**/vendor/**', '**/.venv/**', '**/target/**',
    ],
    computeContentHash: options?.computeHash ?? true,
    maxFileSize: MAX_FILE_SIZE,
  };

  if (useNativeIndexer) {
    try {
      const result = await nativeScan(resolvedPath, config);
      if (!result.error) {
        return {
          files: result.files.map(f => ({
            path: join(resolvedPath, f.path),
            relativePath: f.path,
            size: f.size,
            hash: f.contentHash,
            language: f.language,
          })),
          scanTimeMs: result.scanTimeMs,
          isNative: true,
        };
      }
    } catch (e) {
      Logger.warn(`Native scan failed, using fallback: ${e}`);
    }
  }

  // JS Fallback
  const files = await FileUtils.getAllFiles(resolvedPath);
  const endTime = performance.now();

  const results = await Promise.all(
    files.map(async (filePath) => {
      try {
        const stats = await stat(filePath);
        return {
          path: filePath,
          relativePath: relative(resolvedPath, filePath),
          size: stats.size,
          hash: options?.computeHash ? hashFile(filePath) : '0',
          language: FileUtils.getLanguageFromExtension(filePath),
        };
      } catch {
        return null;
      }
    })
  );

  return {
    files: results.filter((f): f is NonNullable<typeof f> => f !== null),
    scanTimeMs: endTime - startTime,
    isNative: false,
  };
}
