// スクショくん — API 診断の結果ページ
const $ = id => document.getElementById(id);
const local = [], dl = [];
let stored = null;

function li(r) {
  const el = document.createElement('li');
  el.innerHTML = `<span class="${r.ok ? 'ok' : 'ng'}">${r.ok ? '✓' : '✗'}</span><b></b><span class="m"></span>`;
  el.querySelector('b').textContent = r.name;
  el.querySelector('.m').textContent = (r.detail || '') + (r.ms != null ? `（${r.ms} ms）` : '');
  return el;
}
function render(ul, list) { ul.replaceChildren(...list.map(li)); }

async function step(list, name, fn) {
  try { const d = await fn(); list.push({ name, ok: true, detail: d == null ? '' : String(d) }); }
  catch (e) { list.push({ name, ok: false, detail: String(e && e.message || e) }); }
}

function line(r) { return `${r.ok ? '✓' : '✗'} ${r.name}: ${r.detail || ''}`; }

function text() {
  const out = ['# スクショくん API 診断'];
  if (stored) {
    const e = stored.env;
    out.push(`日時: ${e.when}`, `拡張機能: v${e.extVersion}`, `プラットフォーム: ${e.platform}`, `UA: ${e.swUA}`);
    if (e.popup) out.push(`ポップアップ: ${JSON.stringify(e.popup)}`);
    out.push(`API の有無: ${Object.entries(e.namespaces).map(([k, v]) => `${k}=${v ? '○' : '×'}`).join(' ')}`);
    out.push('', '## 撮影対象のページ', ...stored.results.map(line));
  } else out.push('', '## 撮影対象のページ', '（結果なし）');
  out.push('', '## 拡張機能のページ', ...local.map(line));
  if (dl.length) out.push('', '## 保存', ...dl.map(line));
  return out.join('\n');
}
function refresh() { $('txt').value = text(); }

async function localTests() {
  const via = new URLSearchParams(location.search).get('via');
  local.push({ name: 'このページの開き方', ok: via !== 'popup', detail: via === 'tab' ? 'tabs.create で新しいタブに開けた' : via === 'popup' ? 'tabs.create が失敗したのでポップアップ内で開いた' : '直接開いた' });
  await step(local, 'OffscreenCanvas', () => { const c = new OffscreenCanvas(10, 10); c.getContext('2d'); return 'あり'; });
  await step(local, 'canvas → WebP 書き出し', async () => {
    const c = document.createElement('canvas'); c.width = c.height = 10;
    const b = await new Promise(r => c.toBlob(r, 'image/webp', 0.9));
    if (!b) throw new Error('toBlob が null');
    return b.type === 'image/webp' ? 'WebP で書き出せた' : `${b.type} になった（WebP 非対応）`;
  });
  await step(local, 'createImageBitmap', async () => { const b = await createImageBitmap(new ImageData(4, 4)); b.close(); return 'あり'; });
  await step(local, 'CompressionStream（zip 用）', () => { new CompressionStream('deflate-raw'); return 'あり'; });
  await step(local, 'MediaRecorder（録画用）', () => {
    if (typeof MediaRecorder === 'undefined') throw new Error('なし');
    return ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].filter(t => MediaRecorder.isTypeSupported(t)).join('、') || '対応形式なし';
  });
  await step(local, 'getDisplayMedia（画面共有）', () => {
    if (!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)) throw new Error('なし');
    return 'あり（呼び出しは未テスト）';
  });
  await step(local, 'tabCapture API', () => {
    if (!chrome.tabCapture) throw new Error('なし');
    return Object.keys(chrome.tabCapture).join('、');
  });
  await step(local, 'storage.local 読み書き（unlimitedStorage）', async () => {
    const big = 'x'.repeat(6 * 1024 * 1024);
    await chrome.storage.local.set({ diagBig: big });
    const { diagBig } = await chrome.storage.local.get('diagBig');
    await chrome.storage.local.remove('diagBig');
    if (!diagBig || diagBig.length !== big.length) throw new Error('6 MB を書いて読めなかった');
    return '6 MB を書いて読めた';
  });
  await step(local, '画面サイズ', () => `${innerWidth}×${innerHeight} CSS px、DPR=${devicePixelRatio}、screen ${screen.width}×${screen.height}`);
  await step(local, 'UA-CH brands', () => navigator.userAgentData ? navigator.userAgentData.brands.map(b => `${b.brand} ${b.version}`).join('、') + `、mobile=${navigator.userAgentData.mobile}` : 'なし');
  render($('local'), local);
}

function testFile() {
  return new Blob([`スクショくん 保存テスト ${new Date().toISOString()}\n`], { type: 'text/plain' });
}
$('dl1').onclick = async () => {
  const url = URL.createObjectURL(testFile());
  await step(dl, 'chrome.downloads.download（blob URL）', async () => {
    if (!chrome.downloads) throw new Error('API なし');
    const id = await chrome.downloads.download({ url, filename: 'scsho-kun-diag-1.txt', conflictAction: 'uniquify' });
    await new Promise(r => setTimeout(r, 1500));
    const [it] = await chrome.downloads.search({ id });
    return `id=${id}、状態=${it ? it.state : '不明'}${it && it.error ? '、エラー=' + it.error : ''}`;
  });
  render($('dl'), dl); refresh();
};
$('dl2').onclick = async () => {
  await step(dl, 'a download（blob URL）', async () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(testFile());
    a.download = 'scsho-kun-diag-2.txt';
    document.body.appendChild(a); a.click(); a.remove();
    return 'クリックした（実際に保存されたかはダウンロード一覧で確認してください）';
  });
  render($('dl'), dl); refresh();
};

$('copy').onclick = async () => {
  refresh();
  try { await navigator.clipboard.writeText($('txt').value); $('copied').textContent = ' コピーしました'; }
  catch (e) { $('txt').select(); $('copied').textContent = ' 自動でコピーできませんでした。下の欄を長押ししてコピーしてください'; }
};

(async () => {
  try { stored = (await chrome.storage.local.get('diagResult')).diagResult || null; } catch (e) {}
  if (stored) {
    render($('bg'), stored.results);
    const n = stored.results.filter(r => r.ok).length;
    $('sum').textContent = `撮影対象のページ：${stored.results.length} 項目中 ${n} 項目が成功`;
    $('env').textContent = JSON.stringify(stored.env, null, 2);
    if (stored.shot) { $('shot').src = stored.shot; $('shot').hidden = false; $('noshot').hidden = true; }
  } else {
    $('sum').textContent = 'まだ診断していません';
    $('none').hidden = false;
  }
  await localTests();
  refresh();
})();
