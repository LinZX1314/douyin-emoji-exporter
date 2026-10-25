// ==UserScript==
// @name         抖音表情导出
// @namespace    https://github.com/LinZX1314/douyin-emoji-exporter
// @version      1.0.0
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

  let ui = null;
  let busy = false;

  function buildUI() {
    if (ui) return ui;

    const box = document.createElement('div');
    box.id = 'dy-emoji-exporter-ui';
    box.style.cssText = `
      position: fixed; right: 18px; bottom: 18px; z-index: 2147483647;
      width: 268px; background: #fff; color: #1f2d26;
      border: 1px solid #d8e6dd; border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0,0,0,.16);
      font: 13px/1.6 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
      overflow: hidden; user-select: none;
    `;

    box.innerHTML = `
      <div id="dy-hd" style="display:flex;align-items:center;justify-content:space-between;
           padding:10px 13px;background:#2f9e6e;color:#fff;cursor:move;font-weight:600;">
        <span>表情抓取</span>
        <span id="dy-fold" style="cursor:pointer;opacity:.85;font-size:15px;">−</span>
      </div>
      <div id="dy-bd" style="padding:12px 13px;">
        <div id="dy-status" style="color:#6b7d74;font-size:12.5px;margin-bottom:10px;">
          请在抖音里打开「私信 → 表情 → 收藏表情」面板
        </div>
        <button id="dy-scan" style="width:100%;padding:9px;border:none;border-radius:8px;
                background:#2f9e6e;color:#fff;font-size:13px;font-weight:600;cursor:pointer;">
          开始抓取
        </button>
        <button id="dy-save" disabled style="width:100%;padding:9px;margin-top:8px;
                border:1px solid #d8e6dd;border-radius:8px;background:#fff;color:#47584f;
                font-size:13px;cursor:pointer;opacity:.5;">
          导出 JSON
        </button>
        <div id="dy-count" style="margin-top:10px;font-size:12px;color:#6b7d74;
             display:none;"></div>
      </div>
    `;

    document.body.appendChild(box);

    // 折叠
    const bd = box.querySelector('#dy-bd');
    box.querySelector('#dy-fold').onclick = () => {
      const hidden = bd.style.display === 'none';
      bd.style.display = hidden ? 'block' : 'none';
      box.querySelector('#dy-fold').textContent = hidden ? '−' : '+';
    };

    // 拖动
    let dragging = false, ox = 0, oy = 0;
    const hd = box.querySelector('#dy-hd');
    hd.onmousedown = e => {
      dragging = true;
      ox = e.clientX - box.offsetLeft;
      oy = e.clientY - box.offsetTop;
      e.preventDefault();
    };
    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      box.style.left = (e.clientX - ox) + 'px';
      box.style.top = (e.clientY - oy) + 'px';
      box.style.right = 'auto';
      box.style.bottom = 'auto';
    });
    document.addEventListener('mouseup', () => { dragging = false; });

    box.querySelector('#dy-scan').onclick = doScan;
    box.querySelector('#dy-save').onclick = doExport;

    ui = box;
    return box;
  }

  let result = null;

  function setStatus(text, color) {
    const el = document.querySelector('#dy-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '#6b7d74';
  }

  function setCount(text) {
    const el = document.querySelector('#dy-count');
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = text;
  }

  async function doScan() {
    if (busy) return;
    const panel = findPanel();
    if (!panel) {
      setStatus('没找到表情面板。请先打开：私信 → 任意对话 → 😊 → 收藏表情', '#cf5b52');
      return;
    }

    busy = true;
    const btn = document.querySelector('#dy-scan');
    btn.disabled = true;
    btn.style.opacity = '.6';
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

      const save = document.querySelector('#dy-save');
      save.disabled = false;
      save.style.opacity = '1';
      save.style.color = '#2f9e6e';
      save.style.borderColor = '#bfe3cd';

      // 同时把面板滚回顶部，方便用户复查
      try {
        const sc = findScroller(panel);
        sc.scrollTop = 0;
      } catch (e) { /* ignore */ }
    } catch (e) {
      setStatus('抓取出错：' + e.message, '#cf5b52');
    } finally {
      busy = false;
      btn.disabled = false;
      btn.style.opacity = '1';
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
      setStatus('已导出 JSON 文件，请放进转换器的 input/ 目录', '#1c7a52');
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

  // 页面是 SPA，面板可能晚于脚本出现，轮询等待
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    init();
    if (findPanel() || tries > 60) clearInterval(timer);
  }, 1000);

  // 快捷键：Ctrl+Shift+E 抓取
  document.addEventListener('keydown', e => {
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      doScan();
    }
  });
})();
