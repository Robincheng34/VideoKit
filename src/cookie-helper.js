const port = process.argv[2];

async function main() {
  let version;
  for (let i = 0; i < 40; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      break;
    } catch {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  if (!version) throw new Error('浏览器调试端口未就绪');
  const ws = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  const result = await new Promise((res, rej) => {
    ws.onmessage = ev => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) m.error ? rej(new Error(m.error.message)) : res(m.result);
    };
    ws.send(JSON.stringify({ id: 1, method: 'Storage.getCookies' }));
  });
  ws.close();
  process.stdout.write(JSON.stringify(result.cookies || []));
}

main().then(() => process.exit(0)).catch(e => { console.error(e.message); process.exit(1); });