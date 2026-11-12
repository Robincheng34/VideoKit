const port = process.argv[2];
const req = JSON.parse(process.argv[3]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

const RPC_EXPR = `(async()=>{
  const body=${JSON.stringify('<?xml version="1.0"?><methodCall><methodName>' + req.method + '</methodName><params>' + req.paramsXml + '</params></methodCall>')};
  let t;
  try {
    const r=await fetch('https://api.opensubtitles.org/xml-rpc',{method:'POST',headers:{'Content-Type':'text/xml'},body});
    t=await r.text();
  } catch(e) { return {cf:true}; }
  if(t.includes('Just a moment')) return {cf:true};
  const conv=v=>{const c=v.firstElementChild; if(!c) return v.textContent;
    if(c.tagName==='struct'){const o={};for(const m of c.children){o[m.querySelector('name').textContent]=conv(m.querySelector('value'));}return o;}
    if(c.tagName==='array'){return [...c.querySelector('data').children].map(conv);}
    if(c.tagName==='int'||c.tagName==='i4')return parseInt(c.textContent);
    if(c.tagName==='double')return parseFloat(c.textContent);
    if(c.tagName==='boolean')return c.textContent==='1';
    return c.textContent;};
  const doc=new DOMParser().parseFromString(t,'text/xml');
  const val=doc.querySelector('methodResponse>params>param>value');
  const fault=doc.querySelector('fault');
  return {ok:true, data: val?conv(val):null, fault: fault?conv(fault.querySelector('value')):null};
})()`;

const FETCH_EXPR = `(async()=>{
  let r;
  try { r=await fetch(${JSON.stringify(req.url)}); } catch(e) { return {cf:true}; }
  if(!r.ok) throw new Error('下载失败 HTTP '+r.status);
  const u8=new Uint8Array(await r.arrayBuffer());
  let bin=''; for(let i=0;i<u8.length;i+=8192){ bin+=String.fromCharCode.apply(null,u8.subarray(i,i+8192)); }
  return btoa(bin);
})()`;

async function main() {
  let targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  let page = targets.find(t => t.type === 'page' && t.url.includes('opensubtitles.org'));
  if (!page) {
    let r;
    try {
      r = await fetch(`http://127.0.0.1:${port}/json/new?https://api.opensubtitles.org/xml-rpc`, { method: 'PUT' });
    } catch {
      r = await fetch(`http://127.0.0.1:${port}/json/new?https://api.opensubtitles.org/xml-rpc`);
    }
    page = await r.json();
    await sleep(4000);
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method: m, params: p })); });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
  };
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await send('Runtime.enable');
  await send('Page.enable');
  const loc = await send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
  if (!String(loc.result.value).includes('opensubtitles.org')) {
    await send('Page.navigate', { url: 'https://api.opensubtitles.org/xml-rpc' });
    await sleep(5000);
  }
  const r = await send('Runtime.evaluate', { expression: req.kind === 'rpc' ? RPC_EXPR : FETCH_EXPR, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  process.stdout.write(JSON.stringify(r.result.value));
  ws.close();
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });