<p align="center"><img src="icon.png" width="96" alt=""></p>

<h1 align="center">スクショくん Android対応版（非公式）</h1>

<p align="center">どんなに長いページも、丸ごと1つのPDFに。Androidのブラウザでも。<br>
Save any web page, however long, as one PDF — now on Android too.</p>

<p align="center">
<a href="https://github.com/aburesoap/scsho-kun-android/releases/latest/download/scsho-kun-android.zip"><b>ダウンロード / Download (zip)</b></a> ·
<a href="LICENSE">MIT License</a>
</p>

---

## これは何？

[satoru.net（矢野さとる）](https://satoru.net/)さん作のChrome拡張機能「[スクショくん](https://satoru.net/app/screenshot-kun/)」を、aburesoapがAndroidのブラウザ（Quettaで確認）でも使えるように改造した非公式版です。本家とは関係ありません。本家への問い合わせはご遠慮ください。

ボタンひとつで、ページを上から下まで自動でスクロールして撮り、PDF・HTML・画像で保存できます。画面の一部だけを撮ったり、録画や印刷をしたりもできます。

### できること
- **ページ全体**：自動でスクロールして全部撮影
- **表示部分**：いま見えているところだけを撮影
- **選択範囲**：ドラッグ（スマホは指でなぞる）で囲んだところを撮影
- **録画**：画面の動きを動画（MP4／WebM）で保存。範囲を選んで録ることも
- **印刷**：A4・レターの大きさに分けて印刷
- **履歴**：保存したものをサムネ付きで一覧（オフにもできます）

長いページも1ページずつ処理するので最後まで保存でき、初期設定は劣化なしです。日本語・英語に対応しています。

### 本家からの変更点
- Androidで撮影できるようにした（Androidでは`captureVisibleTab`が使えないため、録画と同じタブの映像から1コマずつ取り出して撮影）
- 選択範囲を指で選べるようにし、画面下に「中止」ボタンを追加
- doctypeのないページ（古い掲示板など）で、ページ全体が1画面ぶんしか撮れない不具合を修正
- スクロールが途中で止まったときに、その理由を表示

### 入れ方
1. [zipをダウンロード](https://github.com/aburesoap/scsho-kun-android/releases/latest/download/scsho-kun-android.zip)
2. ブラウザの拡張機能の管理画面（Chromeなら`chrome://extensions`）で「デベロッパーモード」をオン
3. zipを読み込む（Chromeなら画面にドラッグ＆ドロップ）

### Androidでの注意
- 撮影中・録画中は、タブを共有中であることを示す表示が出ることがあります
- ショートカットキー（Alt+Shift+P）は使えません。ポップアップのボタンから撮影してください

---

## English

An unofficial fork of [Snappy (スクショくん)](https://satoru.net/app/screenshot-kun/?lang=en) by [satoru.net](https://satoru.net/), modified by aburesoap to also work on Android browsers (tested on Quetta). Not affiliated with the original author.

It scrolls a page from top to bottom and saves the whole thing as a PDF, HTML file or image in one click. It can also capture part of the screen, record video and print.

**Changes from the original:** captures via the tab video stream on Android (where `captureVisibleTab` is not available), touch-friendly area selection, a fix for pages without a doctype, and a message when scrolling stops partway.

**Install:** [download the zip](https://github.com/aburesoap/scsho-kun-android/releases/latest/download/scsho-kun-android.zip), turn on developer mode on your browser's extensions page, and load the zip.

---

## しくみ / How it works

| ファイル / File | 役割 / Role |
|---|---|
| `background.js` | スクロールしながら撮影（PCは`captureVisibleTab`、Androidはタブの映像）、録画、保存と履歴 / Scroll & capture, recording, saving and history |
| `offscreen.js` | 撮った画面を貼り合わせてPDF・HTML・画像・zipを作成。タブの映像の受け取りと録画 / Builds PDF, HTML, images and zip; receives the tab video and records |
| `popup.html` / `popup.js` | ポップアップと設定 / Popup and settings |
| `history.*` / `print.*` / `store.js` | 履歴・印刷用ページ / History and print pages |
| `i18n.js` / `_locales/` | 日本語・英語 / Japanese & English |

外部のライブラリやサーバーは使っていません。すべてブラウザの中で処理し、データを外部に送ることはありません。
No external libraries or servers. Everything runs locally in the browser, and no data is sent anywhere.

## ライセンス / License

[MIT](LICENSE)
- 原作 / Original: © 2026 [satoru.net](https://satoru.net/) · [@satorunet](https://x.com/satorunet)
- Android対応版 / Android modifications: © 2026 aburesoap
