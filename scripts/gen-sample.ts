import { writeFileSync } from 'node:fs';
import { writeUdf, defaultPageFormat, defaultStyles } from '../src/index';

const udf = writeUdf({
  pageFormat: defaultPageFormat(),
  styles: defaultStyles(),
  body: [
    { alignment: 'center', runs: [{ text: 'NÖBETÇİ ASLİYE HUKUK MAHKEMESİNE', bold: true }] },
    { alignment: 'justify', runs: [{ text: 'Bu bir test dilekçesidir. Açıklamalar.' }] },
    { alignment: 'left', runs: [{ text: 'Saygılarımızla.' }] },
  ],
});
writeFileSync('out.udf', udf);
console.log('wrote out.udf');
