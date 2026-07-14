/* ============================================================
   image-drop.js — 배너 스튜디오 공용 이미지 드래그&드롭 헬퍼
   드롭된 것(파일 또는 웹페이지 이미지)을 File로 변환해 대상 <input type=file>에
   주입하고 change를 발생시킨다 → 각 플러그인의 기존 파일 처리(배경 제거 등)를 그대로 재사용.
   웹페이지 이미지(다나와 등 CORS 차단)는 이미지 프록시(images.weserv.nl)로 우회해 임베드한다.
   ------------------------------------------------------------
   사용: ImageDrop.attachToInput(dropTargetEl, fileInputEl, onStatus?)
   ============================================================ */
(function (global) {
  "use strict";

  var styled = false;
  function ensureStyle() {
    if (styled) return; styled = true;
    var s = document.createElement("style");
    s.textContent = ".img-dragover{outline:2px dashed #20221d;outline-offset:3px;border-radius:12px;background:#f0f1e6}";
    document.head.appendChild(s);
  }

  // 드롭 데이터에서 이미지 URL 추출 (uri-list → html img src → text)
  function dropUrl(dt) {
    var u = (dt.getData("text/uri-list") || "").split(/\r?\n/).find(function (l) { return l && l[0] !== "#"; });
    if (!u) { var h = dt.getData("text/html"); var m = h && h.match(/<img[^>]+src=["']([^"']+)["']/i); if (m) u = m[1]; }
    if (!u) { var t = dt.getData("text/plain"); if (/^https?:\/\//.test(t)) u = t.trim(); }
    return u || "";
  }

  // 다나와 썸네일 크롭 파라미터 제거 → 원본(고해상도)
  function cleanUrl(url) {
    if (/img\.danawa\.com\/images\/attachFiles\//i.test(url)) return url.split("?")[0];
    return url;
  }
  function proxied(url) {
    return "https://images.weserv.nl/?url=" + encodeURIComponent("ssl:" + url.replace(/^https?:\/\//, ""));
  }
  function fname(url, type) {
    var ext = (type && type.split("/")[1]) || "png";
    var base = ((url.split("/").pop() || "image").split("?")[0]).replace(/\.[a-z0-9]+$/i, "");
    return (base || "image") + "." + ext;
  }

  // 원격 이미지 URL → File (직접 CORS 시도 → 실패 시 프록시)
  async function urlToFile(url) {
    url = cleanUrl(url);
    try {
      var r = await fetch(url, { mode: "cors" });
      if (r.ok) { var b = await r.blob(); if (/^image\//.test(b.type)) return new File([b], fname(url, b.type), { type: b.type }); }
    } catch (e) { /* CORS 차단 → 프록시로 */ }
    var r2 = await fetch(proxied(url));
    if (!r2.ok) throw new Error("proxy " + r2.status);
    var b2 = await r2.blob();
    if (!/^image\//.test(b2.type)) throw new Error("not-image");
    return new File([b2], fname(url, b2.type), { type: b2.type || "image/png" });
  }

  function setInputFile(input, file) {
    var t = new DataTransfer(); t.items.add(file);
    input.files = t.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  // dropTargetEl에 드래그&드롭을 붙여, 결과 File을 fileInputEl에 주입한다.
  function attachToInput(target, input, onStatus) {
    if (!target || !input) return;
    ensureStyle();
    var say = function (m, e) { if (onStatus) try { onStatus(m, e); } catch (x) {} };
    target.addEventListener("dragover", function (e) { e.preventDefault(); target.classList.add("img-dragover"); });
    target.addEventListener("dragleave", function (e) { if (!target.contains(e.relatedTarget)) target.classList.remove("img-dragover"); });
    target.addEventListener("drop", async function (e) {
      e.preventDefault(); target.classList.remove("img-dragover");
      var dt = e.dataTransfer;
      try {
        if (dt.files && dt.files.length && /^image\//.test(dt.files[0].type)) {
          say("이미지를 넣는 중…"); setInputFile(input, dt.files[0]); return;
        }
        var u = dropUrl(dt);
        if (!u) { say("이미지를 인식하지 못했어요. 파일로 올려주세요.", true); return; }
        say("이미지를 가져오는 중… (다나와 등 외부 이미지 포함)");
        var file = await urlToFile(u);
        setInputFile(input, file);
        say("이미지를 넣었습니다.");
      } catch (err) {
        say("이미지를 가져오지 못했어요. 이미지를 저장해 파일로 올려주세요.", true);
      }
    });
  }

  // 여러 대상(라벨/부모/미리보기)에 한 번에 붙이는 편의 함수
  function wire(inputId, extraSelectors, onStatus) {
    var input = document.getElementById(inputId);
    if (!input) return;
    var targets = [];
    var lbl = document.querySelector('label[for="' + inputId + '"]'); if (lbl) targets.push(lbl);
    if (input.parentElement && input.type === "file" && input.offsetParent !== null) targets.push(input.parentElement);
    (extraSelectors || []).forEach(function (sel) { var el = document.querySelector(sel); if (el) targets.push(el); });
    targets.forEach(function (t) { attachToInput(t, input, onStatus); });
  }

  global.ImageDrop = { attachToInput: attachToInput, wire: wire, urlToFile: urlToFile, dropUrl: dropUrl };
})(window);
