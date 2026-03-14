import { mkdirSync, writeFileSync } from 'node:fs';

mkdirSync('docs', { recursive: true });
writeFileSync('docs/.nojekyll', '');
