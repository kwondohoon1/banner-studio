# 배너 스튜디오 (Banner Studio)

배너를 **만들고(플러그인) → 곧바로 편집(에디터)**하는 정적 웹앱. 서버·빌드 없이 HTML/JS만으로 동작하며 GitHub Pages로 배포됩니다.

- **에디터**(`index.html`) — 피그마식 SVG 편집기. 요소 선택·드래그·크기조절·폰트/크기/색/투명도, **텍스트 더블클릭 즉석 편집**, 다중선택, 되돌리기, SVG/PNG 내보내기.
- **플러그인**(`plugins/`) — 각 배너 생성기(단일 HTML). 편집 가능한 SVG를 만들어 에디터로 넘김.

## 구조

```
banner-studio/
├── index.html               # 에디터 (SVG 편집기 + 플러그인 도크)
├── svg-export.js            # DOM→편집가능 SVG 직렬화기 (출시배너가 사용)
├── plugins/
│   ├── plugins.json         # 플러그인 매니페스트 (에디터가 읽음)
│   ├── launch-sale.html     # 출시배너 (내용→섹션 자동 구성)
│   ├── reservation.html     # 예약배너 (예약판매 공지)
│   └── hansung-mall.html    # 한성몰종합 (마켓별 10종 세트)
├── PLUGIN_SPEC.md           # 새 플러그인 제작 명세 + 조건 프롬프트
└── README.md
```

## 사용

1. 에디터(`index.html`)를 연다. 상단바에서 배너 플러그인 탭을 눌러 도크에서 배너를 만든다.
2. 플러그인의 **"에디터로 보내기"** → 결과가 캔버스에 **요소별 편집 가능한 SVG**로 들어온다.
3. 캔버스에서 폰트·크기·배치를 다듬고 **SVG 저장** 또는 **PNG 내보내기**.

## 플러그인 추가

- **런타임**: 상단바 **`＋ 플러그인`** → HTML 경로/URL 입력(브라우저에 저장).
- **정식 등록**: `plugins/`에 파일 추가 + `plugins/plugins.json`에 한 줄.
- 자세한 계약과 **새 플러그인 생성용 조건 프롬프트**는 [`PLUGIN_SPEC.md`](PLUGIN_SPEC.md).

## 로컬 실행

`fetch`(매니페스트)가 `file://`에서 막히므로 간단한 서버로 연다:

```bash
python -m http.server 8000
# http://localhost:8000/ 접속
```
(매니페스트 로드 실패 시 에디터는 내장 기본 플러그인 3종으로 폴백한다.)

## 배포 (GitHub Pages)

정적 사이트라 그대로 Pages에 올라간다. 저장소 Settings → Pages → Source: `main` 브랜치 루트.
배포 후: `https://kwondohoon1.github.io/banner-studio/`

## 설계 메모

- 플러그인↔에디터는 `postMessage({pluginMessage:{type:'save-svg', filename, svg}})` 한 계약으로만 연결 — 서로 독립적으로 수정 가능.
- 내부망(사내 AI/LLM/ComfyUI) 접속 코드는 포함하지 않는다.
