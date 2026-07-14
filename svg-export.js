/* ============================================================
   Layer Lab — DOM → 편집 가능 SVG 직렬화기
   렌더된 .v8-canvas(풀사이즈, 스케일 X) DOM을 순회해 SVG 노드로 변환.
   레이아웃은 브라우저가 이미 계산 → getBoundingClientRect로 실측 좌표만 옮긴다.
   지원: rect(둥근모서리)/text(줄단위)/image/ellipse·circle/
        linear·radial gradient/pattern(stripes·dots)/box-shadow(feDropShadow)/
        filter blur(feGaussianBlur)/-webkit-text-stroke/opacity/rotate/line-through·underline
   ============================================================ */
(function (global) {
  "use strict";

  const XMLNS = "http://www.w3.org/2000/svg";

  /* ---------- 색 파싱 ---------- */
  function parseColor(str) {
    // "rgb(a,b,c)" | "rgba(a,b,c,d)" → {hex,a}. 그 외/transparent → null
    if (!str) return null;
    str = str.trim();
    if (str === "transparent" || str === "rgba(0, 0, 0, 0)") return null;
    const m = str.match(/rg0?a?\(([^)]+)\)/) || str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(",").map((x) => parseFloat(x.trim()));
    const to = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
    return { hex: "#" + to(p[0]) + to(p[1]) + to(p[2]), a: p[3] == null ? 1 : p[3] };
  }
  function firstColorFromGradient(str) {
    const m = String(str).match(/rgba?\([^)]+\)/);
    return m ? parseColor(m[0]) : null;
  }

  /* ---------- 그라데이션/패턴 파싱 ---------- */
  // "linear-gradient(160deg, rgb(..) 0%, rgb(..) 100%)" 형태의 개별 함수 문자열을 받음
  function splitStops(inner) {
    // 최상위 콤마로만 분할 (rgb(...) 내부 콤마 보호)
    const out = [];
    let depth = 0, buf = "";
    for (const ch of inner) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(buf); buf = ""; }
      else buf += ch;
    }
    if (buf.trim()) out.push(buf);
    return out.map((x) => x.trim());
  }
  function parseStops(parts) {
    // parts: ["rgb(..) 0%", "rgb(..) 100%"] (선행 방향/도형 토큰은 호출부에서 제거)
    const stops = [];
    parts.forEach((p, i) => {
      const col = p.match(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}/);
      if (!col) return;
      const c = parseColor(col[0]) || { hex: col[0], a: 1 };
      const posM = p.match(/(-?[\d.]+)%/);
      const pos = posM ? parseFloat(posM[1]) / 100 : (i / Math.max(1, parts.length - 1));
      stops.push({ offset: pos, hex: c.hex, opacity: c.a });
    });
    return stops;
  }
  let gradSeq = 0;
  function gradientDef(fnName, inner, defs) {
    const parts = splitStops(inner);
    const id = "g" + (gradSeq++);
    if (fnName === "linear-gradient" || fnName === "repeating-linear-gradient") {
      let angle = 180;
      if (/^[\d.]+deg/.test(parts[0])) { angle = parseFloat(parts.shift()); }
      else if (/^to /.test(parts[0])) { const d = parts.shift(); angle = ({ "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 }[d] != null) ? ({ "to top": 0, "to right": 90, "to bottom": 180, "to left": 270 }[d]) : 180; }
      const stops = parseStops(parts);
      if (!stops.length) return null;
      // CSS 각도(위=0,시계방향) → 벡터
      const rad = (angle - 90) * Math.PI / 180;
      const x = Math.cos(rad), y = Math.sin(rad);
      const x1 = (0.5 - x / 2), y1 = (0.5 - y / 2), x2 = (0.5 + x / 2), y2 = (0.5 + y / 2);
      defs.push(`<linearGradient id="${id}" x1="${x1.toFixed(4)}" y1="${y1.toFixed(4)}" x2="${x2.toFixed(4)}" y2="${y2.toFixed(4)}">${stops.map((s) => `<stop offset="${(s.offset * 100).toFixed(1)}%" stop-color="${s.hex}"${s.opacity < 1 ? ` stop-opacity="${s.opacity}"` : ""}/>`).join("")}</linearGradient>`);
      return `url(#${id})`;
    }
    if (fnName === "radial-gradient") {
      // 선행 도형/위치 토큰 제거 (예: "ellipse at 30% 18%", "circle 5px")
      if (parts[0] && !/rgba?\(|#/.test(parts[0])) parts.shift();
      const stops = parseStops(parts);
      if (!stops.length) return null;
      defs.push(`<radialGradient id="${id}" cx="50%" cy="50%" r="65%">${stops.map((s) => `<stop offset="${(s.offset * 100).toFixed(1)}%" stop-color="${s.hex}"${s.opacity < 1 ? ` stop-opacity="${s.opacity}"` : ""}/>`).join("")}</radialGradient>`);
      return `url(#${id})`;
    }
    return null;
  }
  // 최상위 콤마로 다중 배경 레이어 분리
  function splitLayers(bg) {
    const out = []; let depth = 0, buf = "";
    for (const ch of bg) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) { out.push(buf.trim()); buf = ""; }
      else buf += ch;
    }
    if (buf.trim()) out.push(buf.trim());
    return out;
  }

  /* ---------- 필터(그림자/블러) ---------- */
  let filterSeq = 0;
  function shadowFilter(boxShadow, defs) {
    // "rgba(..) 0px 10px 34px 0px" (color first) 또는 "0px 10px 34px rgba(..)"
    const colM = boxShadow.match(/rgba?\([^)]+\)/);
    const nums = boxShadow.replace(/rgba?\([^)]+\)/, "").match(/-?[\d.]+px/g);
    if (!nums || nums.length < 3) return null;
    const n = nums.map((x) => parseFloat(x));
    const c = colM ? parseColor(colM[0]) : { hex: "#000000", a: 0.2 };
    const id = "f" + (filterSeq++);
    defs.push(`<filter id="${id}" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="${n[0]}" dy="${n[1]}" stdDeviation="${(n[2] || 0) / 2}" flood-color="${c.hex}" flood-opacity="${c.a}"/></filter>`);
    return id;
  }
  function blurFilter(px, defs) {
    const id = "f" + (filterSeq++);
    defs.push(`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${px / 2}"/></filter>`);
    return id;
  }

  /* ---------- 유틸 ---------- */
  const escXml = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  function radius(cs, w, h) {
    let r = parseFloat(cs.borderTopLeftRadius) || 0;
    // 999px pill → 높이의 절반
    if (r >= Math.min(w, h) / 2) r = Math.min(w, h) / 2;
    return r;
  }
  function rotationOf(cs) {
    const t = cs.transform;
    if (!t || t === "none") return 0;
    const m = t.match(/matrix\(([^)]+)\)/);
    if (!m) return 0;
    const p = m[1].split(",").map(parseFloat);
    return Math.round(Math.atan2(p[1], p[0]) * 180 / Math.PI * 100) / 100;
  }

  /* ---------- 텍스트: 줄 단위로 분해 ---------- */
  function emitTextNode(textNode, parentCs, ox, oy, body) {
    const raw = textNode.nodeValue;
    if (!raw || !raw.trim()) return;
    const doc = textNode.ownerDocument;
    const fill = parseColor(parentCs.color) || { hex: "#000000", a: 1 };
    const fontSize = parseFloat(parentCs.fontSize) || 16;
    const weight = parentCs.fontWeight || "400";
    const family = parentCs.fontFamily.replace(/"/g, "'");
    const lsRaw = parentCs.letterSpacing;
    const ls = (lsRaw && lsRaw !== "normal") ? parseFloat(lsRaw) : 0;
    const deco = parentCs.textDecorationLine || parentCs.textDecoration || "";
    const stroke = parentCs.webkitTextStrokeWidth ? parseFloat(parentCs.webkitTextStrokeWidth) : 0;
    const strokeCol = stroke ? (parseColor(parentCs.webkitTextStrokeColor) || { hex: "#000000", a: 1 }) : null;

    // 문자별 rect를 top 기준으로 버킷팅 → 각 줄의 텍스트/좌표 복원
    const range = doc.createRange();
    const buckets = new Map(); // roundedTop → {top,bottom,left,text}
    for (let i = 0; i < raw.length; i++) {
      range.setStart(textNode, i); range.setEnd(textNode, i + 1);
      const rects = range.getClientRects();
      if (!rects.length) { // 공백 등 — 직전 버킷에 붙임
        continue;
      }
      const r = rects[0];
      const key = Math.round(r.top);
      let b = buckets.get(key);
      if (!b) { b = { top: r.top, bottom: r.bottom, left: r.left, text: "" }; buckets.set(key, b); }
      b.left = Math.min(b.left, r.left);
      b.bottom = Math.max(b.bottom, r.bottom);
      b.text += raw[i];
    }
    for (const b of buckets.values()) {
      const t = b.text.replace(/\s+$/, "");
      if (!t) continue;
      const x = (b.left - ox);
      // 베이스라인 ≈ 줄 top + fontSize*0.8 (대략적, 대부분의 산세리프에서 자연스러움)
      const yBase = (b.top - oy) + fontSize * 0.8;
      const attrs = [
        `x="${x.toFixed(1)}"`, `y="${yBase.toFixed(1)}"`,
        `font-family="${escXml(family)}"`, `font-size="${fontSize}"`,
        `font-weight="${weight}"`, `fill="${fill.hex}"`
      ];
      if (fill.a < 1) attrs.push(`fill-opacity="${fill.a}"`);
      if (ls) attrs.push(`letter-spacing="${ls}"`);
      if (/line-through/.test(deco)) attrs.push(`text-decoration="line-through"`);
      else if (/underline/.test(deco)) attrs.push(`text-decoration="underline"`);
      if (stroke && strokeCol) attrs.push(`stroke="${strokeCol.hex}"`, `stroke-width="${stroke}"`, `paint-order="stroke"`);
      body.push(`<text ${attrs.join(" ")}>${escXml(t)}</text>`);
    }
  }

  /* ---------- 요소 → SVG ---------- */
  function walk(el, root, ox, oy, defs, body) {
    if (el.nodeType !== 1) return;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") return;
    const rect = el.getBoundingClientRect();
    const x = rect.left - ox, y = rect.top - oy, w = rect.width, h = rect.height;
    const op = parseFloat(cs.opacity);
    const rot = rotationOf(cs);
    const groupAttrs = [];
    if (op < 1) groupAttrs.push(`opacity="${op}"`);
    if (rot) groupAttrs.push(`transform="rotate(${rot} ${(x + w / 2).toFixed(1)} ${(y + h / 2).toFixed(1)})"`);
    const named = el.getAttribute && el.getAttribute("data-svg-name");
    if (named) groupAttrs.push(`data-name="${escXml(named)}"`);
    const openGroup = (groupAttrs.length) ? `<g ${groupAttrs.join(" ")}>` : "";
    if (openGroup) body.push(openGroup);

    // 1) 배경 상자 (배경색/그라데이션/테두리/그림자/블러)
    const bgColor = parseColor(cs.backgroundColor);
    const bgImg = cs.backgroundImage;
    const r = radius(cs, w, h);
    const border = parseFloat(cs.borderTopWidth) || 0;
    const borderCol = border ? parseColor(cs.borderTopColor) : null;
    const hasBlur = /blur\(([\d.]+)px\)/.exec(cs.filter);
    const hasShadow = cs.boxShadow && cs.boxShadow !== "none";
    let boxAttrs = "", filterId = null;
    if (hasBlur) filterId = blurFilter(parseFloat(hasBlur[1]), defs);
    else if (hasShadow) filterId = shadowFilter(cs.boxShadow, defs);

    const drawBox = (fill, fillOpacity) => {
      const a = [`x="${x.toFixed(1)}"`, `y="${y.toFixed(1)}"`, `width="${w.toFixed(1)}"`, `height="${h.toFixed(1)}"`];
      if (r) a.push(`rx="${r.toFixed(1)}"`);
      a.push(`fill="${fill}"`);
      if (fillOpacity != null && fillOpacity < 1) a.push(`fill-opacity="${fillOpacity}"`);
      if (borderCol) a.push(`stroke="${borderCol.hex}"`, `stroke-width="${border}"`);
      if (filterId) a.push(`filter="url(#${filterId})"`);
      body.push(`<rect ${a.join(" ")}/>`);
      filterId = null; // 필터는 첫 상자에만
    };

    // 원/타원 판정 (border-radius가 50%이거나 매우 큰 경우 + 정사각에 가까움)
    const isEllipse = (cs.borderRadius === "50%" || r >= Math.min(w, h) / 2) && Math.abs(w - h) < Math.max(w, h) * 0.5 && el.children.length === 0 && !el.textContent.trim();

    // 배경 이미지 레이어들 처리
    const layers = (bgImg && bgImg !== "none") ? splitLayers(bgImg) : [];
    let drewBox = false;
    // 배경색 먼저 (있으면)
    if (bgColor && !isEllipse) { drawBox(bgColor.hex, bgColor.a); drewBox = true; }
    for (let li = layers.length - 1; li >= 0; li--) { // CSS는 첫 레이어가 위 → 역순으로 그림
      const layer = layers[li];
      const um = layer.match(/url\(["']?([^"')]+)["']?\)/);
      if (um) {
        const href = um[1];
        const a = [`x="${x.toFixed(1)}"`, `y="${y.toFixed(1)}"`, `width="${w.toFixed(1)}"`, `height="${h.toFixed(1)}"`, `href="${href}"`, `preserveAspectRatio="xMidYMid slice"`];
        if (r) { // 라운드 클립
          const cid = "c" + (gradSeq++);
          defs.push(`<clipPath id="${cid}"><rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${r.toFixed(1)}"/></clipPath>`);
          a.push(`clip-path="url(#${cid})"`);
        }
        body.push(`<image ${a.join(" ")}/>`);
        drewBox = true;
        continue;
      }
      const gm = layer.match(/^(repeating-linear-gradient|linear-gradient|radial-gradient)\((.*)\)$/s);
      if (gm) {
        const fill = gradientDef(gm[1], gm[2], defs);
        if (fill) { drawBox(fill, 1); drewBox = true; }
        else { const fc = firstColorFromGradient(layer); if (fc) { drawBox(fc.hex, fc.a); drewBox = true; } }
      }
    }
    if (isEllipse) {
      const fill = bgColor ? bgColor.hex : (layers.length ? "#000000" : null);
      if (fill) {
        const a = [`cx="${(x + w / 2).toFixed(1)}"`, `cy="${(y + h / 2).toFixed(1)}"`, `rx="${(w / 2).toFixed(1)}"`, `ry="${(h / 2).toFixed(1)}"`, `fill="${fill}"`];
        if (bgColor && bgColor.a < 1) a.push(`fill-opacity="${bgColor.a}"`);
        if (borderCol) a.push(`stroke="${borderCol.hex}"`, `stroke-width="${border}"`);
        if (filterId) { a.push(`filter="url(#${filterId})"`); filterId = null; }
        body.push(`<ellipse ${a.join(" ")}/>`);
        drewBox = true;
      }
    }
    // 테두리만 있고 배경이 전혀 없던 경우 (예: 점선 티켓)
    if (!drewBox && borderCol) drawBox("none", 1);

    // 2) 자식: 텍스트 노드는 직접, 요소는 재귀
    for (const child of el.childNodes) {
      if (child.nodeType === 3) emitTextNode(child, cs, ox, oy, body);
      else if (child.nodeType === 1) {
        if (child.tagName === "IMG") {
          const cr = child.getBoundingClientRect();
          const ccs = getComputedStyle(child);
          const fit = ccs.objectFit === "contain" ? "xMidYMid meet" : "xMidYMid slice";
          body.push(`<image x="${(cr.left - ox).toFixed(1)}" y="${(cr.top - oy).toFixed(1)}" width="${cr.width.toFixed(1)}" height="${cr.height.toFixed(1)}" href="${child.getAttribute("src")}" preserveAspectRatio="${fit}"/>`);
        } else if (child.tagName === "SVG" || child.tagName === "svg") {
          // 이미 SVG(웨이브 등) — 위치 이동해 그대로 삽입
          const cr = child.getBoundingClientRect();
          const clone = child.cloneNode(true);
          clone.setAttribute("x", (cr.left - ox).toFixed(1));
          clone.setAttribute("y", (cr.top - oy).toFixed(1));
          clone.setAttribute("width", cr.width.toFixed(1));
          clone.setAttribute("height", cr.height.toFixed(1));
          body.push(clone.outerHTML);
        } else {
          walk(child, root, ox, oy, defs, body);
        }
      }
    }
    if (openGroup) body.push("</g>");
  }

  /* ---------- 진입점 ---------- */
  function canvasToSVG(rootEl) {
    gradSeq = 0; filterSeq = 0;
    const rect = rootEl.getBoundingClientRect();
    const W = Math.round(rect.width), H = Math.round(rect.height);
    const defs = [], body = [];
    // 루트 배경
    const rcs = getComputedStyle(rootEl);
    const rbg = parseColor(rcs.backgroundColor);
    if (rbg) body.push(`<rect x="0" y="0" width="${W}" height="${H}" fill="${rbg.hex}"${rbg.a < 1 ? ` fill-opacity="${rbg.a}"` : ""}/>`);
    for (const child of rootEl.childNodes) {
      if (child.nodeType === 1) walk(child, rootEl, rect.left, rect.top, defs, body);
    }
    return `<svg xmlns="${XMLNS}" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n<defs>\n${defs.join("\n")}\n</defs>\n${body.join("\n")}\n</svg>`;
  }

  /* ---------- objectURL/blob 이미지 → dataURI 인라인 ---------- */
  function blobToDataURL(blob) {
    return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(blob); });
  }
  async function urlToDataURL(url) {
    const resp = await fetch(url); const blob = await resp.blob(); return blobToDataURL(blob);
  }
  // holder 내부의 blob: URL(img src, background url)을 data URI로 치환
  async function inlineImages(holder) {
    const cache = new Map();
    const conv = async (u) => { if (cache.has(u)) return cache.get(u); const d = await urlToDataURL(u); cache.set(u, d); return d; };
    for (const img of holder.querySelectorAll("img")) {
      const src = img.getAttribute("src") || "";
      if (/^blob:|^http/.test(src)) { try { img.setAttribute("src", await conv(src)); } catch (e) {} }
    }
    // background url(blob:)
    const all = holder.querySelectorAll("*");
    for (const el of all) {
      const bi = el.style && el.style.backgroundImage;
      const m = bi && bi.match(/url\(["']?(blob:[^"')]+|https?:[^"')]+)["']?\)/);
      if (m) { try { const d = await conv(m[1]); el.style.backgroundImage = bi.replace(m[1], d); } catch (e) {} }
    }
  }

  global.LayerLabSVG = { canvasToSVG, inlineImages };
})(this);
