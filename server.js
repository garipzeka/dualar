const http = require('http');
const fs = require('fs');
const path = require('path');
const srv = http.createServer((req, res) => {
  let p = '.' + req.url;
  if(p === './') p = './index.html';
  const ext = path.extname(p);
  let ct = 'text/html';
  if(ext === '.js') ct = 'text/javascript';
  else if(ext === '.css') ct = 'text/css';
  else if(ext === '.json') ct = 'application/json';
  else if(ext === '.png') ct = 'image/png';
  else if(ext === '.ico') ct = 'image/x-icon';
  fs.readFile(path.join(__dirname, p), (err, data) => {
    if(err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': ct });
    res.end(data);
  });
});
srv.listen(5500, () => console.log('Live server on http://localhost:5500'));
