// Membuat static/panduan.html (infografis) dari src/lib/bantuan/isi.ts.
//   npm run panduan
import { writeFileSync } from 'node:fs';
import { buatInfografis } from '../src/lib/bantuan/infografis.ts';

writeFileSync(new URL('../static/panduan.html', import.meta.url), buatInfografis());
console.log('static/panduan.html diperbarui');
