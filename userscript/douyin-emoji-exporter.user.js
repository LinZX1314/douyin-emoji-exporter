// ==UserScript==
// @name         抖音表情导出
// @namespace    https://github.com/LinZX1314/douyin-emoji-exporter
// @version      1.1.0
// @description  从抖音私信表情面板抓取「收藏表情」的图片地址，导出为 JSON 供离线转换器使用
// @author       -
// @match        https://www.douyin.com/*
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

/*
 * ==========================================================================
 * 设计说明
 * ==========================================================================
 *
 * 【本脚本只做一件事】
 *   抓取表情面板里每张表情的图片地址，导出成一份 JSON 清单。
 *   不下载、不转换、不打包 —— 那些交给独立的转换器。
 *
 * 【为什么不需要登录态 / Cookie】
 *   实测：表情 CDN (p*-im-emoticon-sign.byteimg.com) 对匿名请求返回 200，
 *   且带 Access-Control-Allow-Origin: *。
 *   签名 URL 本身就是唯一凭证，所以转换器拿到 URL 就能直接下载。
 *
 * 【签名有效期】
 *   实测 x-expires 距当时还有约 365 天，不是分钟级临时签名。
 *   因此不需要「抓取瞬间落盘」，用户抓完慢慢挑、隔天再转换都没问题。
 *
 * 【为什么用「帧数/后缀」而不是「尺寸」区分动静】
 *   实测 .awebp = 动画，.webp = 静态，与帧数 100% 对应。
 *   大尺寸表情（2048x1926 等）其实都是静态的，体积也小。
 *   这个信息会写进清单，转换器据此决定输出 GIF 还是 PNG。
 */

(function () {
  'use strict';

  // 面板容器选择器（实测可用的主选择器 + 兜底）
  const PANEL_SELECTORS = [
    '#dialog-0 .componentsemojiemojiPanel',
    '[class*="components"][class*="emoji"][class*="emojiPanel"]',
    '[class*="emojiPanel"]',
  ];

  const SCROLLER_CLASS = 'componentsemojitabPanel';

  // ---- 工具函数 ----

  /**
   * 从表情 URL 提取稳定 ID。
   *
   * 抖音表情 URL 形如：
   *   https://p26-im-emoticon-sign.byteimg.com/tos-cn-o-0812/
   *   o8BABlJUEEMAAjdQZ4TfEFz0DDehBeI1H9sKrA~tplv-0wx4r9yasq-awebp-resize:0:0.awebp
   *   ?biz_tag=...&x-expires=...&x-signature=...
   *
   * `~tplv-` 之前那一段是文件本体标识，稳定且唯一（实测 87 个全部互异）。
   * 不能用「路径末段」—— 那是 resize 参数，所有表情都一样。
   */
  function stableId(url) {
    const m = url.match(/\/([A-Za-z0-9~_-]{16,})~tplv/);
    if (m) return m[1];
    // 兜底：剥掉查询串后取末段
    const clean = url.split('?')[0];
    return clean.substring(clean.lastIndexOf('/') + 1) || clean;
  }

  /** 判断是否动画：.awebp 后缀 = 动画 .webp = 静态（实测 100% 对应） */
  function isAnimated(url) {
    return /\.awebp(\?|$)/i.test(url.split('?')[0]) || url.includes('.awebp');
  }

  /** 找表情面板 */
  function findPanel() {
    for (const sel of PANEL_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /** 找面板内可滚动的容器 */
  function findScroller(panel) {
    const byClass = panel.querySelector('.' + SCROLLER_CLASS);
    if (byClass) return byClass;
    // 兜底：找第一个真正能滚的
    for (const el of [panel, ...panel.querySelectorAll('*')]) {
      if (el.scrollHeight > el.clientHeight + 20 && el.clientHeight > 50) return el;
    }
    return panel;
  }

  /** 收集当前 DOM 里所有表情（去重） */
  function collect(panel) {
    const map = new Map();
    for (const img of panel.querySelectorAll('img')) {
      const src = img.src || img.getAttribute('data-src') || '';
      if (!src || !/^https?:/.test(src)) continue;
      // 只认表情 CDN，排除头像/封面等噪音
      if (!/im-emoticon/i.test(src)) continue;
      const id = stableId(src);
      if (!map.has(id)) {
        map.set(id, {
          id,
          url: src,
          w: img.naturalWidth || 0,
          h: img.naturalHeight || 0,
          animated: isAnimated(src),
        });
      }
    }
    return [...map.values()];
  }

  /**
   * 自动滚动到底，把懒加载的表情全部加载出来。
   *
   * 抖音表情面板是滚动加载的：初始只有第一屏，滚到底才继续加载。
   * 这里每滚一次数一下数量，连续 N 轮不增长就认为到底了。
   */
  async function scrollToEnd(panel, onProgress) {
    const scroller = findScroller(panel);
    let lastCount = -1;
    let stillRounds = 0;
    let round = 0;

    const MAX_ROUNDS = 60;      // 安全上限，防止无限滚动
    const STILL_LIMIT = 3;      // 连续 3 轮无新增即停止
    const WAIT = 450;           // 每轮等待渲染

    while (round < MAX_ROUNDS) {
      round++;
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise(r => setTimeout(r, WAIT));

      const count = collect(panel).length;
      if (onProgress) onProgress(round, count, stillRounds);

      if (count <= lastCount) {
        stillRounds++;
        if (stillRounds >= STILL_LIMIT) break;
      } else {
        stillRounds = 0;
      }
      lastCount = count;
    }
    return collect(panel);
  }

  // ---- UI ----
  //
  // 交互设计：
  //   默认只是一个可拖动的小球（不挡视线），点一下展开完整面板，再点球或右上角收起。
  //   展开状态会记在 localStorage，刷新后保持。
  //   球的位置也会记住。

  let ui = null;
  let busy = false;

  const LS_POS = 'dyee_ball_pos';
  const LS_OPEN = 'dyee_open';

  function lsGet(k, def) {
    try {
      const v = localStorage.getItem(k);
      return v === null ? def : v;
    } catch (e) { return def; }
  }
  function lsSet(k, v) {
    try { localStorage.setItem(k, v); } catch (e) { /* ignore */ }
  }

  function buildUI() {
    if (ui) return ui;

    const root = document.createElement('div');
    root.id = 'dy-emoji-exporter-ui';

    root.innerHTML = `
      <style>
        #dy-emoji-exporter-ui {
          position: fixed; z-index: 2147483647;
          font: 13px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
          user-select: none;
          /* 给角标留出溢出空间，否则会被裁掉 */
          padding: 7px;
        }
        #dy-emoji-exporter-ui * { box-sizing: border-box; }

        /* ---------- 小球 ---------- */
        #dyee-ball {
          width: 46px; height: 46px; border-radius: 50%;
          background: linear-gradient(145deg, #37b37c, #2f9e6e);
          box-shadow: 0 4px 14px rgba(47,158,110,.42), 0 1px 3px rgba(0,0,0,.16);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; position: relative;
          transition: transform .16s ease, box-shadow .16s ease;
        }
        #dyee-ball:hover {
          transform: scale(1.08);
          box-shadow: 0 6px 20px rgba(47,158,110,.55), 0 1px 3px rgba(0,0,0,.2);
        }
        #dyee-ball:active { transform: scale(.95); }
        #dyee-ball .face {
          font-size: 21px; line-height: 1; filter: drop-shadow(0 1px 1px rgba(0,0,0,.15));
        }
        /* 抓取中：呼吸/旋转 */
        #dyee-ball.working .face { animation: dyee-spin 1.1s linear infinite; }
        @keyframes dyee-spin {
          0%   { transform: rotate(0deg)   scale(1); }
          50%  { transform: rotate(180deg) scale(1.12); }
          100% { transform: rotate(360deg) scale(1); }
        }
        /* 数量角标 */
        #dyee-badge {
          position: absolute; top: -4px; right: -4px;
          min-width: 19px; height: 19px; padding: 0 5px;
          border-radius: 10px; background: #fff; color: #2f9e6e;
          font-size: 11px; font-weight: 700; line-height: 19px;
          text-align: center; border: 1.5px solid #2f9e6e;
          display: none;
        }
        #dyee-ball.has-data #dyee-badge { display: block; }

        /* ---------- 面板 ---------- */
        #dyee-panel {
          position: absolute; right: 0; bottom: 58px;
          width: 268px; background: #fff; color: #1f2d26;
          border: 1px solid #d8e6dd; border-radius: 14px;
          box-shadow: 0 10px 34px rgba(31,45,38,.18);
          overflow: hidden;
          transform-origin: bottom right;
          transition: opacity .16s ease, transform .16s ease;
        }
        #dyee-panel.hidden {
          opacity: 0; transform: scale(.9) translateY(8px);
          pointer-events: none;
        }
        #dyee-hd {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 13px; background: #2f9e6e; color: #fff; font-weight: 600;
        }
        #dyee-close {
          cursor: pointer; opacity: .85; font-size: 16px; line-height: 1;
          padding: 0 2px;
        }
        #dyee-close:hover { opacity: 1; }
        #dyee-bd { padding: 12px 13px; }
        #dyee-status {
          color: #6b7d74; font-size: 12.5px; margin-bottom: 10px;
          line-height: 1.65; word-break: break-word;
        }
        .dyee-btn {
          width: 100%; padding: 9px; border-radius: 8px; font-size: 13px;
          cursor: pointer; font-family: inherit;
          transition: filter .15s ease, background .15s ease;
        }
        .dyee-btn:disabled { opacity: .5; cursor: not-allowed; }
        #dyee-scan {
          border: none; background: #2f9e6e; color: #fff; font-weight: 600;
        }
        #dyee-scan:hover:not(:disabled) { filter: brightness(1.07); }
        #dyee-save {
          margin-top: 8px; border: 1px solid #d8e6dd; background: #fff; color: #47584f;
        }
        #dyee-save:hover:not(:disabled) { background: #f3f8f4; border-color: #bfe3cd; color: #1c7a52; }
        #dyee-count {
          margin-top: 10px; font-size: 12px; color: #6b7d74; display: none;
        }
        #dyee-count b { color: #1c7a52; }
      </style>

      <div id="dyee-panel" class="hidden">
        <div id="dyee-hd">
          <span>抖音表情导出</span>
          <span id="dyee-close" title="收起">✕</span>
        </div>
        <div id="dyee-bd">
          <div id="dyee-status">请在抖音里打开「私信 → 表情 → 收藏表情」面板</div>
          <button id="dyee-scan" class="dyee-btn">开始抓取</button>
          <button id="dyee-save" class="dyee-btn" disabled>导出 JSON</button>
          <div id="dyee-count"></div>
        </div>
      </div>

      <div id="dyee-ball" title="抖音表情导出">
        <span class="face">😊</span>
        <span id="dyee-badge"></span>
      </div>
    `;

    document.body.appendChild(root);

    const ball = root.querySelector('#dyee-ball');
    const panel = root.querySelector('#dyee-panel');
    const badge = root.querySelector('#dyee-badge');

    // ---- 位置恢复 ----
    let pos = null;
    try { pos = JSON.parse(lsGet(LS_POS, 'null')); } catch (e) { pos = null; }

    // 拖拽时按球的尺寸限制边界（含 padding，避免角标跑出屏幕）
    function clampPos(x, y) {
      const w = root.offsetWidth || 60;
      const h = root.offsetHeight || 60;
      return {
        x: Math.min(Math.max(0, x), Math.max(0, window.innerWidth - w)),
        y: Math.min(Math.max(0, y), Math.max(0, window.innerHeight - h)),
      };
    }

    if (pos && typeof pos.x === 'number' && typeof pos.y === 'number') {
      const c = clampPos(pos.x, pos.y);
      root.style.left = c.x + 'px';
      root.style.top = c.y + 'px';
    } else {
      root.style.right = '22px';
      root.style.bottom = '22px';
    }

    // ---- 展开/收起 ----
    function setOpen(open) {
      panel.classList.toggle('hidden', !open);
      lsSet(LS_OPEN, open ? '1' : '0');
    }
    if (lsGet(LS_OPEN, '0') === '1') setOpen(true);
    root.querySelector('#dyee-close').onclick = e => {
      e.stopPropagation();
      setOpen(false);
    };

    // ---- 拖动 + 点击（区分拖拽与单击）----
    let dragging = false;
    let moved = false;
    let startX = 0, startY = 0;
    let origX = 0, origY = 0;

    ball.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      dragging = true;
      moved = false;
      const r = root.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      origX = r.left;
      origY = r.top;
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      moved = true;

      const c = clampPos(origX + dx, origY + dy);
      root.style.left = c.x + 'px';
      root.style.top = c.y + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', e => {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        // 拖完记住位置
        const r = root.getBoundingClientRect();
        lsSet(LS_POS, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
      } else {
        // 没移动 = 单击，切换面板
        const isOpen = !panel.classList.contains('hidden');
        setOpen(!isOpen);
      }
    });

    root.querySelector('#dyee-scan').onclick = () => doScan();
    root.querySelector('#dyee-save').onclick = () => doExport();

    ui = root;
    return root;
  }

  let result = null;

  function setStatus(text, color) {
    const el = document.querySelector('#dyee-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '#6b7d74';
  }

  function setCount(text) {
    const el = document.querySelector('#dyee-count');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = text;
  }

  /** 更新小球角标 */
  function setBadge(n) {
    const ball = document.querySelector('#dyee-ball');
    const badge = document.querySelector('#dyee-badge');
    if (!ball || !badge) return;
    if (n > 0) {
      badge.textContent = n > 999 ? '999+' : String(n);
      ball.classList.add('has-data');
    } else {
      badge.textContent = '';
      ball.classList.remove('has-data');
    }
  }

  /** 抓取中的小球动效 */
  function setWorking(on) {
    const ball = document.querySelector('#dyee-ball');
    if (!ball) return;
    ball.classList.toggle('working', !!on);
  }

  async function doScan() {
    if (busy) return;
    const panel = findPanel();
    if (!panel) {
      setStatus('没找到表情面板。请先打开：私信 → 任意对话 → 😊 → 收藏表情', '#cf5b52');
      return;
    }

    busy = true;
    setWorking(true);
    const btn = document.querySelector('#dyee-scan');
    btn.disabled = true;
    btn.textContent = '抓取中...';

    try {
      setStatus('正在滚动加载全部表情...');
      const items = await scrollToEnd(panel, (round, count) => {
        setStatus(`第 ${round} 轮滚动，已发现 ${count} 个表情...`);
      });

      const anim = items.filter(i => i.animated).length;
      const still = items.length - anim;

      result = {
        version: 1,
        captured_at: new Date().toISOString(),
        source: location.href,
        total: items.length,
        animated: anim,
        static: still,
        items,
      };

      setStatus(`抓取完成`, '#1c7a52');
      setCount(`共 <b>${items.length}</b> 个　动画 <b>${anim}</b>　静态 <b>${still}</b>`);
      setBadge(items.length);

      const save = document.querySelector('#dyee-save');
      save.disabled = false;

      // 同时把面板滚回顶部，方便用户复查
      try {
        const sc = findScroller(panel);
        sc.scrollTop = 0;
      } catch (e) { /* ignore */ }
    } catch (e) {
      setStatus('抓取出错：' + e.message, '#cf5b52');
    } finally {
      busy = false;
      setWorking(false);
      btn.disabled = false;
      btn.textContent = '重新抓取';
    }
  }

  function doExport() {
    if (!result) return;
    const json = JSON.stringify(result, null, 2);

    // 优先下载成文件
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `emoji-list-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
      setStatus('已导出，把它拖到 douyin-emoji-exporter.exe 上即可转换', '#1c7a52');
      return;
    } catch (e) { /* 降级到剪贴板 */ }

    try {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(json, 'text');
        setStatus('已复制到剪贴板，请粘贴保存为 .json 文件', '#1c7a52');
      }
    } catch (e) {
      setStatus('导出失败，请打开控制台手动复制', '#cf5b52');
      console.log(json);
    }
  }

  // ---- 启动 ----

  function init() {
    if (document.getElementById('dy-emoji-exporter-ui')) return;
    buildUI();
  }

  // 小球要尽早出现，用户一进抖音就能看到，不用等表情面板打开
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // 抖音是 SPA，切换页面可能重建 DOM，这里做个兜底：UI 被移除就重建
  setInterval(() => {
    if (!document.getElementById('dy-emoji-exporter-ui')) init();
  }, 3000);

  // 快捷键：Ctrl+Shift+E 抓取
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      // 快捷键触发时自动展开面板，让用户看到进度
      const p = document.querySelector('#dyee-panel');
      if (p && p.classList.contains('hidden')) {
        p.classList.remove('hidden');
        try { localStorage.setItem('dyee_open', '1'); } catch (err) { /* ignore */ }
      }
      doScan();
    }
  });
})();
