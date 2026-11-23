// スクショくん — API 診断（サービスワーカー側）
// Android 版 Chromium 系ブラウザ（Quetta など）で、撮影に使う拡張機能 API が
// どこまで動くかを 1 つずつ試して、結果を chrome.storage.local.diagResult に残す。
// 本体の撮影処理には触らない。

const DIAG_TIMEOUT = 8000;

function diagTimeout(p, ms = DIAG_TIMEOUT) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`応答なし（${ms / 1000} 秒でタイムアウト）`)), ms))]);
}

async function diagStep(list, name, fn) {
  const t0 = Date.now();
  try {
    const detail = await diagTimeout(Promise.resolve().then(fn));
    list.push({ name, ok: true, detail: detail == null ? '' : String(detail), ms: Date.now() - t0 });
  } catch (e) {
    list.push({ name, ok: false, detail: String(e && e.message || e), ms: Date.now() - t0 });
  }
}

// ページに常駐している diag-cs.js へ、タブ ID を使わずに呼びかける。
// storage の変更はすべてのコンテンツスクリプトに届くので、見えているページだけが返事をする。
let diagWaiters = {};
function diagCallContent(extra = {}) {
  const nonce = Math.random().toString(36).slice(2);
  return new Promise((res, rej) => {
    diagWaiters[nonce] = res;
    chrome.storage.local.set({ diagPing: { nonce, at: Date.now(), ...extra } }).catch(rej);
  });
}

chrome.runtime.onMessage.addListener((m, sender, send) => {
  if (m.target !== 'diag') return;
  if (m.type === 'pong') {
    const w = diagWaiters[m.nonce];
    if (w) { delete diagWaiters[m.nonce]; w({ ...m.data, senderTabId: sender.tab && sender.tab.id, senderFrame: sender.frameId, senderUrl: sender.url }); }
    send({ ok: true });
    return;
  }
  if (m.type === 'run') {
    runDiag(m).then(r => send(r), e => send({ error: String(e && e.message || e) }));
    return true;
  }
});

async function dataUrlSize(dataUrl) {
  const blob = await (await fetch(dataUrl)).blob();
  const bmp = await createImageBitmap(blob);
  const s = `${bmp.width}×${bmp.height} px、${Math.round(blob.size / 1024)} KB`;
  bmp.close();
  return s;
}

async function runDiag(m) {
  if (typeof job !== 'undefined' && job) throw new Error('撮影中です。終わってから診断してください');
  const R = [];
  const env = {
    when: new Date().toISOString(),
    extVersion: chrome.runtime.getManifest().version,
    swUA: navigator.userAgent,
    popup: m.popup || {}
  };
  try {
    const p = await chrome.runtime.getPlatformInfo();
    env.platform = `${p.os} / ${p.arch}`;
  } catch (e) { env.platform = '取得失敗: ' + (e.message || e); }

  // API の有無（名前空間が存在するか）
  const ns = ['tabs', 'scripting', 'offscreen', 'tabCapture', 'downloads', 'debugger', 'windows', 'action', 'commands', 'contextMenus', 'sidePanel', 'storage', 'runtime', 'webNavigation'];
  env.androidByUA = /Android/i.test(navigator.userAgent);
  env.namespaces = Object.fromEntries(ns.map(n => [n, !!chrome[n]]));

  let tab = null;
  const tabId = m.tabId;

  await diagStep(R, 'storage.session 読み書き', async () => {
    await chrome.storage.session.set({ diagTest: 1 });
    const { diagTest } = await chrome.storage.session.get('diagTest');
    await chrome.storage.session.remove('diagTest');
    if (diagTest !== 1) throw new Error('書いた値が読めない');
    return 'OK';
  });

  await diagStep(R, 'tabs.query（アクティブなタブ）', async () => {
    const ts = await chrome.tabs.query({ active: true, currentWindow: true });
    return `${ts.length} 件` + (ts[0] ? `、id=${ts[0].id}` : '');
  });

  await diagStep(R, 'tabs.get（対象タブ）', async () => {
    tab = await chrome.tabs.get(tabId);
    return `id=${tab.id}、windowId=${tab.windowId}、active=${tab.active}、url=${(tab.url || '(取得できず)').slice(0, 80)}`;
  });

  await diagStep(R, 'tabCapture の映像から 1 コマ撮影（Android 用の撮影方式）', async () => {
    if (!m.streamId) throw new Error('ポップアップで streamId を取れなかった');
    const v = (await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio }) }))[0].result;
    try { await chrome.offscreen.closeDocument(); } catch (e) {}
    await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS', 'USER_MEDIA'], justification: 'API 診断' });
    try {
      const o = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'sbegin', streamId: m.streamId, vw: v.vw, vh: v.vh, dpr: v.dpr });
      if (!o || o.error) throw new Error(o ? o.error : '返事なし');
      const g = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'sgrab' });
      if (!g || g.error) throw new Error(g ? g.error : '返事なし');
      return `${g.w}×${g.h} px（画面 ${Math.round(v.vw * v.dpr)}×${Math.round(v.vh * v.dpr)} px 相当）`;
    } finally { try { await chrome.offscreen.closeDocument(); } catch (e) {} }
  });

  await diagStep(R, 'windows.getCurrent', async () => {
    const w = await chrome.windows.getCurrent();
    return `id=${w.id}、type=${w.type}`;
  });

  await diagStep(R, 'scripting.executeScript（func）', async () => {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, func: () => ({ href: location.href, h: document.documentElement.scrollHeight, dpr: devicePixelRatio }) });
    const v = r && r.result;
    return v ? `href=${v.href.slice(0, 60)}、高さ=${v.h}px、DPR=${v.dpr}` : '結果なし';
  });

  await diagStep(R, 'scripting.executeScript（files）', async () => {
    const [r] = await chrome.scripting.executeScript({ target: { tabId }, files: ['diag-probe.js'] });
    return r && r.result ? String(r.result) : '結果なし';
  });

  await diagStep(R, 'scripting.insertCSS', async () => {
    await chrome.scripting.insertCSS({ target: { tabId }, css: '/* scsho-kun diag */' });
    return 'OK';
  });

  await diagStep(R, 'tabs.sendMessage → 常駐スクリプト', async () => {
    const r = await chrome.tabs.sendMessage(tabId, { target: 'diag-cs', type: 'ping' });
    return r ? `返事あり（${r.href ? r.href.slice(0, 60) : ''}）` : '返事なし';
  });

  await diagStep(R, '常駐スクリプト ← storage 経由（タブ ID 不要）', async () => {
    const r = await diagCallContent();
    return `返事あり、sender.tab.id=${r.senderTabId}、${r.vw}×${r.vh} CSS px、DPR=${r.dpr}、ページ高さ=${r.scrollH}px`;
  });

  await diagStep(R, '常駐スクリプトでスクロール（storage 経由）', async () => {
    const r = await diagCallContent({ scrollTest: true });
    if (r.scroll && r.scroll.error) throw new Error(r.scroll.error);
    return r.scroll ? `移動 ${r.scroll.from} → ${r.scroll.to}px → 元に戻した` : '結果なし';
  });

  await diagStep(R, 'ページ側：DOM を画像に描き直す（SVG foreignObject）', async () => {
    const r = await diagCallContent({ renderTest: true });
    if (!r.render) throw new Error('結果なし');
    if (!r.render.ok) throw new Error(r.render.error);
    return r.render.detail;
  });

  await diagStep(R, 'ページ側：getDisplayMedia の有無', async () => {
    const r = await diagCallContent();
    return r.gdm ? 'あり（呼び出しは未テスト）' : 'なし';
  });

  let shot = null;
  await diagStep(R, 'tabs.captureVisibleTab（windowId 指定・PNG）', async () => {
    const wid = tab ? tab.windowId : undefined;
    shot = await chrome.tabs.captureVisibleTab(wid, { format: 'png' });
    return await dataUrlSize(shot);
  });

  await new Promise(r => setTimeout(r, 700)); // captureVisibleTab は毎秒 2 回まで
  await diagStep(R, 'tabs.captureVisibleTab（windowId 省略・JPEG）', async () => {
    const d = await chrome.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
    if (!shot) shot = d;
    return await dataUrlSize(d);
  });

  await diagStep(R, 'offscreen.createDocument ＋ 通信', async () => {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
    if (!ctx.length) await chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['BLOBS'], justification: 'API 診断' });
    const r = await chrome.runtime.sendMessage({ target: 'offscreen', type: 'diagPing' });
    try { await chrome.offscreen.closeDocument(); } catch (e) {}
    if (!r) throw new Error('offscreen から返事なし');
    return `返事あり、OffscreenCanvas=${r.offscreenCanvas}、WebP 書き出し=${r.webp}`;
  });

  await diagStep(R, 'debugger.attach（権限がないので失敗が正常）', async () => {
    if (!chrome.debugger) return 'API なし（manifest に debugger 権限がない）';
    await chrome.debugger.attach({ tabId }, '1.3');
    await chrome.debugger.detach({ tabId });
    return 'OK';
  });

  await diagStep(R, 'action.setBadgeText', async () => {
    await chrome.action.setBadgeText({ text: '' });
    return 'OK';
  });

  await diagStep(R, 'commands.getAll', async () => {
    const c = await chrome.commands.getAll();
    return c.map(x => `${x.name}=${x.shortcut || '(なし)'}`).join('、');
  });

  const result = { env, results: R, shot: shot && shot.length < 12e6 ? shot : null, tabId };
  await chrome.storage.local.set({ diagResult: result });
  return { ok: true, count: R.length, okCount: R.filter(r => r.ok).length };
}
