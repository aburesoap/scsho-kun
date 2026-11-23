// スクショくん — API 診断用の常駐スクリプト（content_scripts）
// Android ではタブ ID からページを探す API が動かないことがあるので、
// storage の変更通知でサービスワーカーから呼びかけを受け、runtime.sendMessage で返事をする。
// 見えているページ（最上位フレーム）だけが返事をする。

(() => {
  if (window.top !== window) return;

  chrome.runtime.onMessage.addListener((m, sender, send) => {
    if (m.target !== 'diag-cs') return;
    send({ ok: true, href: location.href });
  });

  chrome.storage.onChanged.addListener((ch, area) => {
    if (area !== 'local' || !ch.diagPing || !ch.diagPing.newValue) return;
    if (document.visibilityState !== 'visible') return;
    const p = ch.diagPing.newValue;
    if (Date.now() - p.at > 10000) return;
    answer(p).then(data => chrome.runtime.sendMessage({ target: 'diag', type: 'pong', nonce: p.nonce, data }).catch(() => {}));
  });

  async function answer(p) {
    const d = {
      href: location.href,
      vw: innerWidth, vh: innerHeight, dpr: devicePixelRatio,
      scrollH: document.documentElement.scrollHeight,
      gdm: !!(navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia)
    };
    if (p.scrollTest) {
      try {
        const from = scrollY;
        scrollTo(0, from + Math.min(200, Math.max(0, d.scrollH - innerHeight - from)));
        await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        const to = scrollY;
        scrollTo(0, from);
        d.scroll = { from: Math.round(from), to: Math.round(to) };
      } catch (e) { d.scroll = { error: String(e.message || e) }; }
    }
    if (p.renderTest) d.render = await renderTest();
    return d;
  }

  // html-to-image などと同じ仕組み（DOM を SVG に包んで canvas に描く）が使えるか試す
  async function renderTest() {
    try {
      const w = 200, h = 80;
      const html = '<div xmlns="http://www.w3.org/1999/xhtml" style="font:20px sans-serif;background:#1d9bf0;color:#fff;width:200px;height:80px">scsho-kun</div>';
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><foreignObject width="100%" height="100%">${html}</foreignObject></svg>`;
      const img = new Image();
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
      await img.decode();
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(10, 10, 1, 1).data; // ここで失敗したら canvas が汚染されている
      const url = cv.toDataURL('image/png');
      const blue = px[2] > 200 && px[0] < 100;
      return { ok: true, detail: `描画できた（左上の色 rgb(${px[0]},${px[1]},${px[2]})${blue ? '・正しい色' : '・色が想定外'}、PNG ${Math.round(url.length / 1024)} KB）` };
    } catch (e) {
      return { ok: false, error: String(e && e.message || e) };
    }
  }
})();
