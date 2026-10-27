require('../tests/register.cjs');
const fs = require('node:fs');
const path = require('node:path');
const { qrPng } = require('../shared/ssiQr.ts');
const payload = 'dive;noid;dive_type:0;divetime:35;datetime:202610150930;depth_m:18.0;user_firstname:;user_lastname:;watertemp_c:27';
const output = path.resolve(__dirname, '../dist/myssi-test-dive-qr.png');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, Buffer.from(qrPng(payload).base64, 'base64'));
console.log(output);
