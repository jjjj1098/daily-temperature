import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';

// Only the built, self-contained calendar is shared. Each phone stores its
// own events in its browser; the preview server receives no calendar data.
const addresses = Object.values(networkInterfaces()).flat().filter(
  address => address?.family === 'IPv4' && !address.internal &&
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(address.address)
);
const host = process.argv[2] || addresses[0]?.address;
if (!addresses.some(address => address.address === host)) {
  throw new Error('Wi-Fi 또는 유선 네트워크의 사설 IPv4 주소를 확인해 주세요.');
}
const port = 4173;
const page = new URL('../release/매일의 온도.html', import.meta.url);
const server = createServer(async (req, res) => {
  if (req.url !== '/' || !['GET', 'HEAD'].includes(req.method)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const html = await readFile(page);
    res.writeHead(200, {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': html.length
    }).end(req.method === 'HEAD' ? undefined : html);
  } catch {
    res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' }).end('미리보기 파일을 먼저 빌드해 주세요.');
  }
});
server.listen(port, host, () => console.log('같은 Wi-Fi의 Safari에서 열기: http://' + host + ':' + port + '/'));
