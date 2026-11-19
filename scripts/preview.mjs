import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'vite';

// Produce a local browser edition with the same calendar and storage code as the app.
const { output } = await build({
  base: './',
  build: {
    write: false,
    modulePreload: false,
    rollupOptions: { output: { inlineDynamicImports: true } }
  },
  logLevel: 'error'
});
const entry = output.find(file => file.type === 'chunk' && file.isEntry);
const css = output.find(file => file.type === 'asset' && file.fileName.endsWith('.css'));
let page = await readFile('index.html', 'utf8');
page = page.replace(/<link[^>]*href="\.\/app\/style\.css"[^>]*>/, () => '<style>' + css.source + '</style>');
page = page.replace(/<script type="module" src="\.\/app\/main\.js"><\/script>/, () => '<script type="module">' + entry.code.replace(/<\/script/gi, '<\\/script') + '</script>');
await mkdir('release', { recursive: true });
await writeFile('release/매일의 온도.html', page);
