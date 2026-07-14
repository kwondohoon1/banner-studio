# 배너 플러그인 제작 명세 (조건 프롬프트)

이 문서 하나만 있으면 **레포를 참조하지 않고도** 새 배너 플러그인을 만들어 에디터에 붙일 수 있습니다.
플러그인은 "배너를 만들어 **편집 가능한 SVG**로 에디터에 넘겨주는 독립 HTML 파일" 입니다.

---

## 1. 반드시 지켜야 하는 계약 (Hard Requirements)

플러그인이 에디터와 물리려면 아래를 **정확히** 지켜야 합니다.

1. **단일 HTML 파일** — CSS/JS 인라인. 외부 라이브러리는 꼭 필요할 때 CDN `<script>`만(내부망/AI 서버 호출 금지).
2. **편집 가능한 SVG를 만든다** (PNG·canvas 픽셀 아님):
   - 루트: `<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">`
   - 글자는 **줄마다 별도 `<text>`** 노드로, `x`·`y`·`font-family`·`font-size`(px 숫자)·`font-weight`·`fill` 명시.
     - 가로 정렬은 `text-anchor`(왼쪽 `start`·가운데 `middle`·오른쪽 `end`), 세로 중앙은 `dominant-baseline="central"`.
   - 도형은 `<rect>`(둥근모서리 `rx`)·`<ellipse>`·`<circle>`·`<path>`·`<polygon>`, 그라데이션은 `<defs><linearGradient>`.
   - **이미지는 반드시 data URI로 임베드**(`toDataURL('image/png')`), `<image href="data:..." preserveAspectRatio="...">`. (blob:/외부 URL은 에디터에서 깨짐)
3. **에디터 브리지** — iframe 안에서 실행되면 결과를 부모(에디터)로 넘긴다:
   ```js
   const inFrame = window.parent !== window;
   function outputSVG(filename, svg){
     if (inFrame) parent.postMessage({ pluginMessage: { type: 'save-svg', filename, svg } }, '*');
     else { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
   }
   ```
   - 저장 버튼 라벨은 `inFrame ? '에디터로 보내기' : 'SVG 다운로드'`.
4. **(선택) 부모 메시지 수신** — 에디터가 `{type:'toast'|'error', message}`를 보내면 상태로 표시:
   ```js
   window.addEventListener('message', e => {
     const m = e.data && e.data.pluginMessage; if(!m) return;
     if (m.type === 'toast' || m.type === 'error') setStatus(m.message);
   });
   ```
5. **디자인 시스템 준수**(일관성) — 아래 라이트 테마 토큰/틀을 사용:
   좁은 단일 컬럼, 스티키 상단 헤더, `.step` 폼 섹션, `.primary` 버튼, 스케일되는 `.preview-shell`.
6. **이미지 첨부는 드래그&드롭 지원(필수)** — 파일뿐 아니라 **웹페이지(다나와 등)의 이미지를 드래그해서** 넣을 수 있어야 한다. 공용 헬퍼 `image-drop.js`(같은 `plugins/` 폴더)를 포함하고 각 `<input type=file>`에 연결한다. 외부 이미지는 CORS 차단 시 이미지 프록시(`images.weserv.nl`)로 우회해 **data URI로 임베드**한다. (6절 참조)

> 계약의 유일한 필수 접점은 **`postMessage({pluginMessage:{type:'save-svg', filename, svg}})`** 입니다. 이 한 줄만 지키면 어떤 방식으로 만들어도 에디터에 붙습니다.

---

## 2. 공용 디자인 토큰 (그대로 복사)

```css
:root{--bg:#f5f5f1;--panel:#fff;--ink:#171814;--muted:#777970;--line:#dedfd8;--lime:#dfff43;--dark:#20221d;--shadow:0 16px 42px rgba(25,27,22,.11)}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:12px Pretendard,"Noto Sans KR",Arial,sans-serif;letter-spacing:-.2px}
.top{height:58px;padding:0 16px;display:flex;align-items:center;gap:10px;position:sticky;top:0;z-index:30;background:rgba(245,245,241,.96);border-bottom:1px solid var(--line)}
.logo{width:31px;height:31px;border-radius:9px;background:var(--dark);color:var(--lime);display:grid;place-items:center;font-weight:950}
main{padding:16px;max-width:520px}
.step{margin:17px 0 8px;display:flex;justify-content:space-between;align-items:center}.step b{font-size:12px}
.num{font-size:9px;border-radius:99px;background:#e7e8e2;color:#85877e;padding:3px 7px;letter-spacing:.6px}
.title-input,textarea,input[type=text]{width:100%;border:1px solid #cfd1c9;border-radius:12px;background:#fff;padding:11px 12px;font:inherit;outline:none}
.primary{width:100%;border:0;border-radius:12px;background:var(--dark);color:#fff;padding:13px;font-weight:850;cursor:pointer}
.preview-shell{background:#d9dbd4;border-radius:14px;padding:8px;margin-top:14px}
.preview-shell svg{width:100%;height:auto;max-width:100%;display:block;background:#fff;border-radius:8px}
.status{display:none;margin-top:12px;padding:10px;border-radius:10px;background:#efffb7;color:#39430f;font-size:11px}.status.show{display:block}
```

---

## 3. 최소 스켈레톤 (복붙 시작점)

```html
<!doctype html><html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>새 배너</title>
<style>/* 2번 토큰 붙여넣기 */</style></head>
<body>
  <header class="top"><div class="logo">B</div><b>새 배너</b></header>
  <main>
    <div class="step"><b>문구</b><span class="num">01</span></div>
    <input id="title" class="title-input" value="여기에 타이틀">
    <button class="primary" id="saveBtn">SVG 다운로드</button>
    <div id="status" class="status"></div>
    <div class="preview-shell" id="preview"></div>
  </main>
<script>
const inFrame = window.parent !== window;
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
function setStatus(t){ const x=$('#status'); x.textContent=t; x.className='status show'; }
function buildSVG(){
  const W=600,H=400, title=$('#title').value;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`+
    `<rect x="0" y="0" width="${W}" height="${H}" fill="#f5f5f1"/>`+
    `<text x="${W/2}" y="${H/2}" text-anchor="middle" dominant-baseline="central" `+
    `font-family="Pretendard, sans-serif" font-size="44" font-weight="800" fill="#171814">${esc(title)}</text>`+
    `</svg>`;
}
function render(){ $('#preview').innerHTML = buildSVG(); }
function outputSVG(filename, svg){
  if (inFrame) parent.postMessage({ pluginMessage:{ type:'save-svg', filename, svg } }, '*');
  else { const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'})); a.download=filename; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),1000); }
}
$('#title').addEventListener('input', render);
$('#saveBtn').textContent = inFrame ? '에디터로 보내기' : 'SVG 다운로드';
$('#saveBtn').onclick = () => outputSVG('new-banner.svg', buildSVG());
window.addEventListener('message', e => { const m=e.data&&e.data.pluginMessage; if(m&&(m.type==='toast'||m.type==='error')) setStatus(m.message); });
render();
</script>
</body></html>
```

---

## 3.5 이미지 드래그&드롭 (다나와 등) — 필수

같은 폴더의 `image-drop.js`를 포함하고, 각 파일 입력에 연결하면 파일·웹이미지 드롭이 모두 된다.

```html
<script src="image-drop.js"></script>
<script>
  window.addEventListener('load', function(){
    // (fileInput id, 추가 드롭영역 셀렉터[], 상태콜백?) — 라벨/미리보기가 드롭영역이 됨
    ImageDrop.wire('myFileInput', ['#preview'], window.setStatus);
    // 또는 요소 직접 지정: ImageDrop.attachToInput(dropEl, fileInputEl, onStatus)
  });
</script>
```

- 드롭된 **파일**이나 **웹페이지 이미지 URL**을 `File`로 만들어 지정한 `<input type=file>`에 주입하고 `change`를 발생 → 플러그인의 **기존 파일 처리(배경 제거 등)를 그대로 재사용**한다.
- 다나와처럼 **CORS로 막힌 이미지**는 `images.weserv.nl` 프록시로 우회해 확실히 임베드된다(다나와 썸네일 크롭 파라미터는 자동 제거해 원본 해상도로).
- 레포 없이 만드는 단독 플러그인이면 `image-drop.js` 내용을 그대로 인라인해도 된다.

## 4. 에디터에 붙이는 법 (둘 중 하나)

- **런타임 추가(레포 수정 불필요)**: 에디터 상단바 **`＋ 플러그인`** → 플러그인 HTML의 경로/URL 입력 → 즉시 탭 추가(브라우저에 저장됨). 개인적으로 쓰거나 시험할 때.
- **정식 등록**: 파일을 `plugins/` 에 넣고 `plugins/plugins.json` 배열에 한 줄 추가:
  ```json
  { "id": "my-banner", "title": "내 배너", "description": "설명", "file": "plugins/my-banner.html" }
  ```

---

## 5. 새 플러그인 생성용 조건 프롬프트 (AI에게 그대로 붙여넣기)

> 아래 블록을 복사해, 원하는 배너 설명만 채워 AI에게 주면 계약을 지키는 플러그인이 나옵니다. **이 레포를 첨부할 필요 없음.**

```
너는 "배너 스튜디오" 에디터에 붙는 독립 배너 생성 플러그인(단일 HTML)을 만든다.
반드시 아래 계약을 지켜라:
1) 단일 HTML 파일(CSS/JS 인라인, 내부망/AI 서버 호출 금지, 외부는 CDN만).
2) 결과는 "편집 가능한 SVG"다. 글자는 줄마다 <text>(x·y·font-family·font-size(px)·font-weight·fill,
   가로정렬 text-anchor, 세로중앙 dominant-baseline="central"). 도형은 rect/ellipse/circle/path,
   그라데이션은 defs. 이미지는 toDataURL로 data URI 임베드. 루트 svg에 width/height/viewBox.
3) 에디터 브리지: const inFrame = window.parent !== window;
   저장 시 inFrame이면 parent.postMessage({pluginMessage:{type:'save-svg', filename, svg}}, '*'),
   아니면 .svg 다운로드. 버튼 라벨은 inFrame ? '에디터로 보내기' : 'SVG 다운로드'.
4) (선택) window message로 {type:'toast'|'error', message} 수신 시 상태 표시.
5) UI는 라이트 테마(--bg:#f5f5f1 --dark:#20221d --lime:#dfff43), 좁은 단일 컬럼,
   스티키 상단 헤더, .step 폼 섹션, .primary 버튼, 폭에 맞게 축소되는 .preview-shell.
6) 입력이 바뀌면 미리보기 SVG를 다시 그린다. 가로 스크롤이 생기면 안 된다(svg width:100%).
7) 이미지 첨부는 파일 업로드뿐 아니라 웹페이지(다나와 등) 이미지 드래그&드롭을 지원한다.
   같은 폴더의 image-drop.js를 포함하고 window load 시 ImageDrop.wire('파일입력id', ['#미리보기'], setStatus)로 연결한다.
   (외부 CORS 차단 이미지는 헬퍼가 images.weserv.nl 프록시로 우회해 임베드한다.)

만들 배너: << 여기에 배너 종류/크기/문구/레이아웃/색을 설명 >>
```
