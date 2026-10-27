// ==UserScript==
// @name         抖音表情导出
// @namespace    https://github.com/LinZX1314/douyin-emoji-exporter
// @version      2.1.0
// @description  抖音表情导出：收藏表情批量下载/导出JSON + 评论区表情右键下载，支持转 GIF
// @author       LinZX1314
// @match        https://www.douyin.com/*
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @grant        GM.download
// @grant        GM_download
// @grant        GM.xmlHttpRequest
// @connect      byteimg.com
// @connect      douyinpic.com
// @connect      *
// ==/UserScript==

/* ==========================================================================
 * 抖音表情导出
 * ==========================================================================
 *
 * 【功能】
 *   1. 收藏表情：抓取表情面板全部表情，可勾选后批量下载或导出 JSON
 *   2. 评论区表情：右键表情图时，在抖音「添加到表情」气泡旁浮出下载按钮
 *   3. 格式转换：动态 WebP 转 GIF（用 gifenc），静态转 PNG
 *
 * 【为什么用 GM_xmlhttpRequest】
 *   实测表情 CDN 不带 CORS 响应头，页面内 fetch/XHR 直接失败，
 *   canvas getImageData 会被污染。GM_xmlhttpRequest 由脚本管理器发出，
 *   不受页面同源策略限制，是唯一可靠拿到字节的方式。
 *
 * 【为什么内置 gifenc】
 *   浏览器没有原生 GIF 编码 API。gifenc 是成熟的浏览器端 GIF 编码库
 *   （自适应中位切分量化），比手写 LZW 画质更好、更可靠。
 *   为满足油猴脚本「单文件」要求，这里把压缩版内联进来（约 10KB）。
 *
 * 【签名有效期】
 *   实测 x-expires 距当时还有约 365 天，但 URL 随页面刷新变化，建议抓到就下。
 */

(function () {
  'use strict';

  // ==========================================================================
  // 内置依赖：gifenc（MIT License, https://github.com/mattdesl/gifenc）
  // ==========================================================================
  const GIFENC = (function () {
    // 在闭包内执行 gifenc 源码，隔离出所需 API
    const module = { exports: {} };
    (function (module, exports) {
      /**
 * Minified by jsDelivr using Terser v5.39.0.
 * Original file: /npm/gifenc@1.0.3/dist/gifenc.js
 *
 * Do NOT use SRI with dynamically generated files! More information: https://www.jsdelivr.com/using-sri-with-dynamic-files
 */
var __defProp=Object.defineProperty,__markAsModule=e=>__defProp(e,"__esModule",{value:!0}),__export=(e,t)=>{for(var r in t)__defProp(e,r,{get:t[r],enumerable:!0})};__markAsModule(exports),__export(exports,{GIFEncoder:()=>GIFEncoder,applyPalette:()=>applyPalette,default:()=>src_default,nearestColor:()=>nearestColor,nearestColorIndex:()=>nearestColorIndex,nearestColorIndexWithDistance:()=>nearestColorIndexWithDistance,prequantize:()=>prequantize,quantize:()=>quantize,snapColorsToPalette:()=>snapColorsToPalette});var constants_default={signature:"GIF",version:"89a",trailer:59,extensionIntroducer:33,applicationExtensionLabel:255,graphicControlExtensionLabel:249,imageSeparator:44,signatureSize:3,versionSize:3,globalColorTableFlagMask:128,colorResolutionMask:112,sortFlagMask:8,globalColorTableSizeMask:7,applicationIdentifierSize:8,applicationAuthCodeSize:3,disposalMethodMask:28,userInputFlagMask:2,transparentColorFlagMask:1,localColorTableFlagMask:128,interlaceFlagMask:64,idSortFlagMask:32,localColorTableSizeMask:7};function createStream(e=256){let t=0,r=new Uint8Array(e);return{get buffer(){return r.buffer},reset(){t=0},bytesView:()=>r.subarray(0,t),bytes:()=>r.slice(0,t),writeByte(e){n(t+1),r[t]=e,t++},writeBytes(e,o=0,a=e.length){n(t+a);for(let n=0;n<a;n++)r[t++]=e[n+o]},writeBytesView(e,o=0,a=e.byteLength){n(t+a),r.set(e.subarray(o,o+a),t),t+=a}};function n(e){var n=r.length;if(n>=e)return;e=Math.max(e,n*(n<1048576?2:1.125)>>>0),0!=n&&(e=Math.max(e,256));const o=r;r=new Uint8Array(e),t>0&&r.set(o.subarray(0,t),0)}}var BITS=12,DEFAULT_HSIZE=5003,MASKS=[0,1,3,7,15,31,63,127,255,511,1023,2047,4095,8191,16383,32767,65535];function lzwEncode(e,t,r,n,o=createStream(512),a=new Uint8Array(256),i=new Int32Array(DEFAULT_HSIZE),c=new Int32Array(DEFAULT_HSIZE)){const l=i.length,s=Math.max(2,n);a.fill(0),c.fill(0),i.fill(-1);let f=0,u=0;const w=s+1,d=w;let b=!1,g=d,y=(1<<g)-1;const p=1<<w-1,h=p+1;let B=p+2,_=0,m=r[0],I=0;for(let e=l;e<65536;e*=2)++I;I=8-I,o.writeByte(s),S(p);const A=r.length;for(let e=1;e<A;e++)e:{const t=r[e],n=(t<<BITS)+m;let o=t<<I^m;if(i[o]===n){m=c[o];break e}const a=0===o?1:l-o;for(;i[o]>=0;)if(o-=a,o<0&&(o+=l),i[o]===n){m=c[o];break e}S(m),m=t,B<1<<BITS?(c[o]=B++,i[o]=n):(i.fill(-1),B=p+2,b=!0,S(p))}return S(m),S(h),o.writeByte(0),o.bytesView();function S(e){for(f&=MASKS[u],u>0?f|=e<<u:f=e,u+=g;u>=8;)a[_++]=255&f,_>=254&&(o.writeByte(_),o.writeBytesView(a,0,_),_=0),f>>=8,u-=8;if((B>y||b)&&(b?(g=d,y=(1<<g)-1,b=!1):(++g,y=g===BITS?1<<g:(1<<g)-1)),e==h){for(;u>0;)a[_++]=255&f,_>=254&&(o.writeByte(_),o.writeBytesView(a,0,_),_=0),f>>=8,u-=8;_>0&&(o.writeByte(_),o.writeBytesView(a,0,_),_=0)}}}var lzwEncode_default=lzwEncode;function rgb888_to_rgb565(e,t,r){return e<<8&63488|t<<2&992|r>>3}function rgba8888_to_rgba4444(e,t,r,n){return e>>4|240&t|(240&r)<<4|(240&n)<<8}function rgb888_to_rgb444(e,t,r){return e>>4<<8|240&t|r>>4}function clamp(e,t,r){return e<t?t:e>r?r:e}function sqr(e){return e*e}function find_nn(e,t,r){var n=0,o=1e100;const a=e[t],i=a.cnt,c=a.ac,l=a.rc,s=a.gc,f=a.bc;for(var u=a.fw;0!=u;u=e[u].fw){const t=e[u],a=t.cnt,d=i*a/(i+a);if(!(d>=o)){var w=0;r&&(w+=d*sqr(t.ac-c))>=o||(w+=d*sqr(t.rc-l))>=o||(w+=d*sqr(t.gc-s))>=o||(w+=d*sqr(t.bc-f))>=o||(o=w,n=u)}}a.err=o,a.nn=n}function create_bin(){return{ac:0,rc:0,gc:0,bc:0,cnt:0,nn:0,fw:0,bk:0,tm:0,mtm:0,err:0}}function create_bin_list(e,t){const r=new Array("rgb444"===t?4096:65536),n=e.length;if("rgba4444"===t)for(let t=0;t<n;++t){const n=e[t],o=n>>24&255,a=n>>16&255,i=n>>8&255,c=255&n,l=rgba8888_to_rgba4444(c,i,a,o);let s=l in r?r[l]:r[l]=create_bin();s.rc+=c,s.gc+=i,s.bc+=a,s.ac+=o,s.cnt++}else if("rgb444"===t)for(let t=0;t<n;++t){const n=e[t],o=n>>16&255,a=n>>8&255,i=255&n,c=rgb888_to_rgb444(i,a,o);let l=c in r?r[c]:r[c]=create_bin();l.rc+=i,l.gc+=a,l.bc+=o,l.cnt++}else for(let t=0;t<n;++t){const n=e[t],o=n>>16&255,a=n>>8&255,i=255&n,c=rgb888_to_rgb565(i,a,o);let l=c in r?r[c]:r[c]=create_bin();l.rc+=i,l.gc+=a,l.bc+=o,l.cnt++}return r}function quantize(e,t,r={}){const{format:n="rgb565",clearAlpha:o=!0,clearAlphaColor:a=0,clearAlphaThreshold:i=0,oneBitAlpha:c=!1}=r;if(!e||!e.buffer)throw new Error("quantize() expected RGBA Uint8Array data");if(!(e instanceof Uint8Array||e instanceof Uint8ClampedArray))throw new Error("quantize() expected RGBA Uint8Array data");const l=new Uint32Array(e.buffer);let s=!1!==r.useSqrt;const f="rgba4444"===n,u=create_bin_list(l,n),w=u.length,d=w-1,b=new Uint32Array(w+1);for(var g=0,y=0;y<w;++y){const e=u[y];if(null!=e){var p=1/e.cnt;f&&(e.ac*=p),e.rc*=p,e.gc*=p,e.bc*=p,u[g++]=e}}sqr(t)/g<.022&&(s=!1);var h,B,_;for(y=0;y<g-1;++y)u[y].fw=y+1,u[y+1].bk=y,s&&(u[y].cnt=Math.sqrt(u[y].cnt));for(s&&(u[y].cnt=Math.sqrt(u[y].cnt)),y=0;y<g;++y){find_nn(u,y,!1);var m=u[y].err;for(B=++b[0];B>1&&!(u[h=b[_=B>>1]].err<=m);B=_)b[B]=h;b[B]=y}var I=g-t;for(y=0;y<I;){for(var A;;){var S=b[1];if((A=u[S]).tm>=A.mtm&&u[A.nn].mtm<=A.tm)break;A.mtm==d?S=b[1]=b[b[0]--]:(find_nn(u,S,!1),A.tm=y);m=u[S].err;for(B=1;(_=B+B)<=b[0]&&(_<b[0]&&u[b[_]].err>u[b[_+1]].err&&_++,!(m<=u[h=b[_]].err));B=_)b[B]=h;b[B]=S}var x=u[A.nn],C=A.cnt,M=x.cnt;p=1/(C+M);f&&(A.ac=p*(C*A.ac+M*x.ac)),A.rc=p*(C*A.rc+M*x.rc),A.gc=p*(C*A.gc+M*x.gc),A.bc=p*(C*A.bc+M*x.bc),A.cnt+=x.cnt,A.mtm=++y,u[x.bk].fw=x.fw,u[x.fw].bk=x.bk,x.mtm=d}let q=[];var U=0;for(y=0;;++U){let e=clamp(Math.round(u[y].rc),0,255),t=clamp(Math.round(u[y].gc),0,255),r=clamp(Math.round(u[y].bc),0,255),n=255;if(f){if(n=clamp(Math.round(u[y].ac),0,255),c){n=n<=("number"==typeof c?c:127)?0:255}o&&n<=i&&(e=t=r=a,n=0)}const l=f?[e,t,r,n]:[e,t,r];if(existsInPalette(q,l)||q.push(l),0==(y=u[y].fw))break}return q}function existsInPalette(e,t){for(let r=0;r<e.length;r++){const n=e[r];let o=n[0]===t[0]&&n[1]===t[1]&&n[2]===t[2],a=!(n.length>=4&&t.length>=4)||n[3]===t[3];if(o&&a)return!0}return!1}function euclideanDistanceSquared(e,t){var r,n=0;for(r=0;r<e.length;r++){const o=e[r]-t[r];n+=o*o}return n}function roundStep(e,t){return t>1?Math.round(e/t)*t:e}function prequantize(e,{roundRGB:t=5,roundAlpha:r=10,oneBitAlpha:n=null}={}){const o=new Uint32Array(e.buffer);for(let e=0;e<o.length;e++){const a=o[e];let i=a>>24&255,c=a>>16&255,l=a>>8&255,s=255&a;if(i=roundStep(i,r),n){i=i<=("number"==typeof n?n:127)?0:255}s=roundStep(s,t),l=roundStep(l,t),c=roundStep(c,t),o[e]=i<<24|c<<16|l<<8|s}}function applyPalette(e,t,r="rgb565"){if(!e||!e.buffer)throw new Error("quantize() expected RGBA Uint8Array data");if(!(e instanceof Uint8Array||e instanceof Uint8ClampedArray))throw new Error("quantize() expected RGBA Uint8Array data");if(t.length>256)throw new Error("applyPalette() only works with 256 colors or less");const n=new Uint32Array(e.buffer),o=n.length,a="rgb444"===r?4096:65536,i=new Uint8Array(o),c=new Array(a);if("rgba4444"===r)for(let e=0;e<o;e++){const r=n[e],o=r>>24&255,a=r>>16&255,l=r>>8&255,s=255&r,f=rgba8888_to_rgba4444(s,l,a,o),u=f in c?c[f]:c[f]=nearestColorIndexRGBA(s,l,a,o,t);i[e]=u}else{const e="rgb444"===r?rgb888_to_rgb444:rgb888_to_rgb565;for(let r=0;r<o;r++){const o=n[r],a=o>>16&255,l=o>>8&255,s=255&o,f=e(s,l,a),u=f in c?c[f]:c[f]=nearestColorIndexRGB(s,l,a,t);i[r]=u}}return i}function nearestColorIndexRGBA(e,t,r,n,o){let a=0,i=1e100;for(let c=0;c<o.length;c++){const l=o[c];let s=sqr2(l[3]-n);if(s>i)continue;if(s+=sqr2(l[0]-e),s>i)continue;if(s+=sqr2(l[1]-t),s>i)continue;s+=sqr2(l[2]-r),s>i||(i=s,a=c)}return a}function nearestColorIndexRGB(e,t,r,n){let o=0,a=1e100;for(let i=0;i<n.length;i++){const c=n[i];let l=sqr2(c[0]-e);if(l>a)continue;if(l+=sqr2(c[1]-t),l>a)continue;l+=sqr2(c[2]-r),l>a||(a=l,o=i)}return o}function snapColorsToPalette(e,t,r=5){if(!e.length||!t.length)return;const n=e.map((e=>e.slice(0,3))),o=r*r,a=e[0].length;for(let r=0;r<t.length;r++){let i=t[r];i=i.length<a?[i[0],i[1],i[2],255]:i.length>a?i.slice(0,3):i.slice();const c=nearestColorIndexWithDistance(n,i.slice(0,3),euclideanDistanceSquared),l=c[0],s=c[1];s>0&&s<=o&&(e[l]=i)}}function sqr2(e){return e*e}function nearestColorIndex(e,t,r=euclideanDistanceSquared){let n=1/0,o=-1;for(let a=0;a<e.length;a++){const i=r(t,e[a]);i<n&&(n=i,o=a)}return o}function nearestColorIndexWithDistance(e,t,r=euclideanDistanceSquared){let n=1/0,o=-1;for(let a=0;a<e.length;a++){const i=r(t,e[a]);i<n&&(n=i,o=a)}return[o,n]}function nearestColor(e,t,r=euclideanDistanceSquared){return e[nearestColorIndex(e,t,r)]}function GIFEncoder(e={}){const{initialCapacity:t=4096,auto:r=!0}=e,n=createStream(t),o=new Uint8Array(256),a=new Int32Array(5003),i=new Int32Array(5003);let c=!1;return{reset(){n.reset(),c=!1},finish(){n.writeByte(constants_default.trailer)},bytes:()=>n.bytes(),bytesView:()=>n.bytesView(),get buffer(){return n.buffer},get stream(){return n},writeHeader:l,writeFrame(e,t,s,f={}){const{transparent:u=!1,transparentIndex:w=0,delay:d=0,palette:b=null,repeat:g=0,colorDepth:y=8,dispose:p=-1}=f;let h=!1;if(r?c||(h=!0,l(),c=!0):h=Boolean(f.first),t=Math.max(0,Math.floor(t)),s=Math.max(0,Math.floor(s)),h){if(!b)throw new Error("First frame must include a { palette } option");encodeLogicalScreenDescriptor(n,t,s,b,y),encodeColorTable(n,b),g>=0&&encodeNetscapeExt(n,g)}const B=Math.round(d/10);encodeGraphicControlExt(n,p,B,u,w);const _=Boolean(b)&&!h;encodeImageDescriptor(n,t,s,_?b:null),_&&encodeColorTable(n,b),encodePixels(n,e,t,s,y,o,a,i)}};function l(){writeUTFBytes(n,"GIF89a")}}function encodeGraphicControlExt(e,t,r,n,o){var a,i;e.writeByte(33),e.writeByte(249),e.writeByte(4),o<0&&(o=0,n=!1),n?(a=1,i=2):(a=0,i=0),t>=0&&(i=7&t),i<<=2;e.writeByte(i|a),writeUInt16(e,r),e.writeByte(o||0),e.writeByte(0)}function encodeLogicalScreenDescriptor(e,t,r,n,o=8){const a=128|o-1<<4|colorTableSize(n.length)-1;writeUInt16(e,t),writeUInt16(e,r),e.writeBytes([a,0,0])}function encodeNetscapeExt(e,t){e.writeByte(33),e.writeByte(255),e.writeByte(11),writeUTFBytes(e,"NETSCAPE2.0"),e.writeByte(3),e.writeByte(1),writeUInt16(e,t),e.writeByte(0)}function encodeColorTable(e,t){const r=1<<colorTableSize(t.length);for(let n=0;n<r;n++){let r=[0,0,0];n<t.length&&(r=t[n]),e.writeByte(r[0]),e.writeByte(r[1]),e.writeByte(r[2])}}function encodeImageDescriptor(e,t,r,n){if(e.writeByte(44),writeUInt16(e,0),writeUInt16(e,0),writeUInt16(e,t),writeUInt16(e,r),n){const t=0,r=0,o=colorTableSize(n.length)-1;e.writeByte(128|t|r|o)}else e.writeByte(0)}function encodePixels(e,t,r,n,o=8,a,i,c){lzwEncode_default(r,n,t,o,e,a,i,c)}function writeUInt16(e,t){e.writeByte(255&t),e.writeByte(t>>8&255)}function writeUTFBytes(e,t){for(var r=0;r<t.length;r++)e.writeByte(t.charCodeAt(r))}function colorTableSize(e){return Math.max(Math.ceil(Math.log2(e)),1)}var src_default=GIFEncoder;

    })(module, module.exports);

    // gifenc 的 IIFE 末尾定义了 GIFEncoder / quantize / applyPalette
    // 但都在函数作用域内，需要从返回值拿
    return module.exports;
  })();

  // ==========================================================================
  // 配置
  // ==========================================================================

  const CFG_KEY = 'dyee_config_v2';

  // 默认配置
  const DEFAULT_CFG = {
    // 下载模式：'browser' = 浏览器直接下载 | 'json' = 导出清单
    downloadMode: 'browser',
    // 浏览器下载格式：'gif' = 转 GIF/PNG | 'original' = 保留原图
    browserFormat: 'gif',
  };

  function loadCfg() {
    try {
      const raw = localStorage.getItem(CFG_KEY);
      if (!raw) return { ...DEFAULT_CFG };
      const o = JSON.parse(raw);
      return {
        downloadMode: o.downloadMode === 'json' ? 'json' : 'browser',
        browserFormat: o.browserFormat === 'original' ? 'original' : 'gif',
      };
    } catch (e) {
      return { ...DEFAULT_CFG };
    }
  }

  function saveCfg(cfg) {
    try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
  }

  let cfg = loadCfg();

  // ==========================================================================
  // 表情面板定位（收藏表情）
  // ==========================================================================

  const PANEL_SELECTORS = [
    '#dialog-0 .componentsemojiemojiPanel',
    '[class*="components"][class*="emoji"][class*="emojiPanel"]',
    '[class*="emojiPanel"]',
  ];

  const SCROLLER_CLASS = 'componentsemojitabPanel';

  function findEmojiPanel() {
    for (const sel of PANEL_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findScroller(panel) {
    const byClass = panel.querySelector('.' + SCROLLER_CLASS);
    if (byClass) return byClass;
    for (const el of [panel, ...panel.querySelectorAll('*')]) {
      if (el.scrollHeight > el.clientHeight + 20 && el.clientHeight > 50) return el;
    }
    return panel;
  }

  // ==========================================================================
  // 工具函数
  // ==========================================================================

  /** 从表情 URL 提取稳定 ID（~tplv 之前那段，实测全部唯一） */
  function stableId(url) {
    const m = url.match(/\/([A-Za-z0-9~_-]{16,})~tplv/);
    if (m) return m[1];
    const clean = url.split('?')[0];
    return clean.substring(clean.lastIndexOf('/') + 1) || clean;
  }

  /** 判断是否动画：.awebp = 动画（实测与实际帧数 100% 对应） */
  function isAnimatedUrl(url) {
    return /\.awebp(\?|$)/i.test(url.split('?')[0]) || url.includes('.awebp');
  }

  /** 是否是表情图片 URL */
  function isEmoticonUrl(url) {
    if (!url) return false;
    // 1. 收藏表情（IM 表情 CDN）
    if (/im-emoticon/i.test(url)) return true;
    if (/douyinpic\.com.*(sticker|emotion|emoticon)/i.test(url)) return true;

    // 2. 评论区表情：实测 10/10 都是 p3-sign / p26-sign / p9-sign.douyinpic.com
    //    下的 xxx~tplv-<biz>-medium-webp:248:332.webp，页面上统一渲染成高 120px。
    //    用模板参数判定比量 naturalWidth 稳（后者会随原图变化，
    //    实测出现 310/323/248/493/343 等多种值）。
    if (/douyinpic\.com/i.test(url) && /~tplv-[a-z0-9]+-medium-webp:248:332/i.test(url)) return true;

    return false;
  }

  /** 文件名安全化 */
  function safeName(s) {
    return String(s || 'emoji')
      .replace(/[\\/:*?"<>|]/g, '_')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'emoji';
  }

  // ==========================================================================
  // 底层的「取字节 → 转换 → 存盘」管线
  // ==========================================================================

  /** GM_xmlhttpRequest 取字节（绕过页面 CORS） */
  function fetchBytes(url, timeoutMs) {
    timeoutMs = timeoutMs || 30000;
    return new Promise(function (resolve, reject) {
      const gmXhr =
        typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest :
        (typeof GM !== 'undefined' && GM.xmlHttpRequest) ? GM.xmlHttpRequest.bind(GM) :
        null;

      if (!gmXhr) {
        reject(new Error('GM_xmlhttpRequest 不可用，请检查脚本管理器的跨域权限'));
        return;
      }

      gmXhr({
        method: 'GET',
        url: url,
        responseType: 'arraybuffer',
        timeout: timeoutMs,
        onload: function (res) {
          if (res.status >= 200 && res.status < 300 && res.response) {
            resolve(new Uint8Array(res.response));
          } else {
            reject(new Error('HTTP ' + res.status));
          }
        },
        onerror: function () { reject(new Error('网络错误')); },
        ontimeout: function () { reject(new Error('请求超时')); },
      });
    });
  }

  /** 嗅探真实格式 */
  function sniffFormat(buf) {
    if (buf.length < 12) return 'unknown';
    if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
        buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'webp';
    if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'gif';
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
    if (buf[0] === 0xff && buf[1] === 0xd8) return 'jpg';
    return 'unknown';
  }

  /** 解析 WebP 的 ANMF chunk 拿真实帧延时（ImageDecoder 有时不给 duration） */
  function parseWebpDurations(buf) {
    const out = [];
    if (sniffFormat(buf) !== 'webp') return out;
    const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
    let pos = 12;
    while (pos + 8 <= buf.length) {
      const fourcc = String.fromCharCode(buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]);
      const size = dv.getUint32(pos + 4, true);
      if (fourcc === 'ANMF' && size >= 16) {
        const base = pos + 8;
        out.push(buf[base + 12] | (buf[base + 13] << 8) | (buf[base + 14] << 16));
      }
      pos += 8 + size + (size & 1);
    }
    return out;
  }

  /** 静态图 → PNG Blob */
  async function stillToPng(u8, mime) {
    const bmp = await createImageBitmap(new Blob([u8], { type: mime }));
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    canvas.getContext('2d').drawImage(bmp, 0, 0);
    if (bmp.close) bmp.close();
    return await new Promise(function (res) {
      canvas.toBlob(function (b) { res(b); }, 'image/png');
    });
  }

  /**
   * 动态图 → GIF（用 gifenc）
   *
   * gifenc 提供：
   *   quantize(rgba, maxColors)    自适应中位切分量化
   *   applyPalette(rgba, palette)  把 RGBA 映射为索引
   *   GIFEncoder()                 写帧
   */
  async function animatedToGif(u8, mime) {
    if (typeof ImageDecoder === 'undefined') {
      throw new Error('浏览器不支持动态图解码（需要 ImageDecoder / WebCodecs）');
    }

    const dec = new ImageDecoder({ data: u8, type: mime });
    await dec.tracks.ready;
    const track = dec.tracks.selectedTrack;
    const frameCount = track ? (track.frameCount || 0) : 0;

    if (frameCount <= 1) {
      try { dec.close(); } catch (e) { /* ignore */ }
      return { blob: await stillToPng(u8, mime), ext: 'png', frames: 1 };
    }

    const anmf = parseWebpDurations(u8);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const { GIFEncoder, quantize, applyPalette } = GIFENC;
    const gif = GIFEncoder();

    let width = 0, height = 0;

    for (let i = 0; i < frameCount; i++) {
      let result;
      try {
        result = await dec.decode({ frameIndex: i });
      } catch (e) {
        break;
      }
      const img = result.image;
      if (!width) {
        width = img.displayWidth || img.width;
        height = img.displayHeight || img.height;
        canvas.width = width;
        canvas.height = height;
      }
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);

      // 每帧量化。注意 gifenc 的 quantize 接受 RGBA 数组
      const rgba = ctx.getImageData(0, 0, width, height).data;
      const palette = quantize(rgba, 256);
      const index = applyPalette(rgba, palette);

      let delay = img.duration ? Math.round(img.duration / 1000) : 0;
      if ((!delay || delay <= 0) && anmf[i]) delay = anmf[i];
      if (!delay || delay <= 0) delay = 100;

      gif.writeFrame(index, width, height, { palette: palette, delay: delay });
      if (img.close) img.close();
    }

    try { dec.close(); } catch (e) { /* ignore */ }
    gif.finish();

    return {
      blob: new Blob([gif.bytes()], { type: 'image/gif' }),
      ext: 'gif',
      frames: frameCount,
    };
  }

  /**
   * 完整管线：取图 → 转换 → 返回 Blob
   * @param {string} url
   * @param {'gif'|'original'} mode
   * @returns {Promise<{blob: Blob, ext: string, frames: number}>}
   */
  async function convertUrl(url, mode) {
    const u8 = await fetchBytes(url);
    const fmt = sniffFormat(u8);
    const mime = fmt === 'webp' ? 'image/webp'
               : fmt === 'gif' ? 'image/gif'
               : fmt === 'png' ? 'image/png'
               : fmt === 'jpg' ? 'image/jpeg'
               : 'application/octet-stream';

    if (mode === 'original') {
      return { blob: new Blob([u8], { type: mime }), ext: fmt === 'unknown' ? 'bin' : fmt, frames: 0 };
    }

    // 已经是 GIF，直接返回
    if (fmt === 'gif') {
      return { blob: new Blob([u8], { type: 'image/gif' }), ext: 'gif', frames: 0 };
    }

    // 用后缀先判断，避免无谓解码
    const maybeAnim = isAnimatedUrl(url);

    if (!maybeAnim) {
      // 静态：直接转 PNG
      try {
        const png = await stillToPng(u8, mime);
        return { blob: png, ext: 'png', frames: 1 };
      } catch (e) {
        return { blob: new Blob([u8], { type: mime }), ext: fmt, frames: 0 };
      }
    }

    // 动画：走 GIF 编码
    return await animatedToGif(u8, mime);
  }

  /** 存盘 */
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);

    const gmDown =
      typeof GM_download === 'function' ? GM_download :
      (typeof GM !== 'undefined' && GM.download) ? GM.download.bind(GM) :
      null;

    if (gmDown) {
      try {
        gmDown({
          url: url,
          name: filename,
          saveAs: false,
          onload: function () { setTimeout(function () { URL.revokeObjectURL(url); }, 5000); },
          onerror: function () { fallbackAnchor(url, filename); },
          ontimeout: function () { fallbackAnchor(url, filename); },
        });
        return;
      } catch (e) { /* 落到 fallback */ }
    }
    fallbackAnchor(url, filename);
  }

  function fallbackAnchor(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
  }

  /** 下载单个表情（带进度回调） */
  async function downloadOne(url, onProgress) {
    const name = safeName(stableId(url));
    try {
      if (onProgress) onProgress('正在处理…');
      const r = await convertUrl(url, cfg.browserFormat);
      const filename = name + '.' + r.ext;
      saveBlob(r.blob, filename);
      return { ok: true, filename: filename, size: r.blob.size };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }

  // ==========================================================================
  // 评论区表情：右键时在抖音「添加到表情」气泡旁挂一个下载按钮
  // ==========================================================================
  //
  // 【实测结论】
  //   在评论表情图上右键，抖音弹出的并不是一个多项菜单，而是 Semi Design 的
  //   tooltip 气泡（.semi-tooltip-wrapper[role="tooltip"]），内容只有
  //   「添加到表情」。它由 React 托管、鼠标移开即销毁，不能往里塞节点。
  //   所以我们不注入，改为在旁边浮动一个自己的按钮，与抖音气泡并存。

  // 右键命中的表情 URL
  let ctxUrl = '';
  // 我们浮出来的按钮
  let ctxBtn = null;

  /** 找抖音的「添加到表情」气泡 */
  function findAddToEmojiTip() {
    const tips = document.querySelectorAll('.semi-tooltip-wrapper[role="tooltip"]');
    for (const t of tips) {
      if (!t.offsetParent) continue;
      if (/添加到表情/.test(t.textContent || '')) return t;
    }
    return null;
  }

  /** 移除浮动按钮 */
  function hideCtxBtn() {
    if (ctxBtn && ctxBtn.parentNode) ctxBtn.parentNode.removeChild(ctxBtn);
    ctxBtn = null;
  }

  /** 在抖音气泡旁边显示下载按钮 */
  function showCtxBtn(url) {
    hideCtxBtn();
    if (!url) return;

    const tip = findAddToEmojiTip();
    const btn = document.createElement('div');
    btn.className = 'dyee-ctx-btn';
    btn.textContent = '下载表情';

    // 贴抖音气泡的左侧；没有气泡就退到鼠标附近
    let left, top;
    if (tip) {
      const r = tip.getBoundingClientRect();
      left = r.left - 8;
      top = r.top + r.height / 2;
      btn.style.transform = 'translate(-100%, -50%)';
    } else {
      left = lastMouseX;
      top = lastMouseY;
      btn.style.transform = 'translate(8px, 8px)';
    }
    btn.style.left = Math.max(4, left) + 'px';
    btn.style.top = top + 'px';

    btn.addEventListener('mousedown', function (e) {
      // 用 mousedown 抢在鼠标移开导致气泡消失之前
      e.preventDefault();
      e.stopPropagation();
    });

    btn.addEventListener('click', async function (e) {
      e.stopPropagation();
      e.preventDefault();
      btn.textContent = '下载中…';
      btn.classList.add('busy');

      const r = await downloadOne(url);
      btn.classList.remove('busy');
      btn.textContent = r.ok ? '已下载' : '失败';
      btn.classList.add(r.ok ? 'ok' : 'err');

      setTimeout(function () {
        hideCtxBtn();
      }, 1200);
    });

    document.body.appendChild(btn);
    ctxBtn = btn;
  }

  // 记录鼠标位置，作为没有气泡时的兜底定位
  let lastMouseX = 0;
  let lastMouseY = 0;
  document.addEventListener('mousemove', function (e) {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
  }, true);

  /**
   * 右键：记录表情 URL，等抖音气泡出现后挂上我们的按钮。
   * 不动抖音的任何行为（不 preventDefault），两套并存。
   */
  document.addEventListener('contextmenu', function (e) {
    hideCtxBtn();
    ctxUrl = '';

    const img = e.target && e.target.closest && e.target.closest('img');
    if (!img) return;
    const src = img.currentSrc || img.src || img.getAttribute('data-src') || '';
    if (isEmoticonUrl(src)) ctxUrl = src;

    if (!ctxUrl) return;

    // 抖音气泡要几十毫秒后才挂上来，轮询几次
    const url = ctxUrl;
    let tries = 0;
    (function poll() {
      if (!ctxUrl || ctxUrl !== url) return;   // 已被新的右键取代
      const tip = findAddToEmojiTip();
      if (tip) { showCtxBtn(url); return; }
      if (++tries > 25) return;                // 约 500ms 后放弃
      setTimeout(poll, 20);
    })();
  }, true);

  // 点击别处 / 滚动 / 按 Esc 就收起
  document.addEventListener('mousedown', function (e) {
    if (ctxBtn && !ctxBtn.contains(e.target)) hideCtxBtn();
  }, true);
  document.addEventListener('scroll', hideCtxBtn, true);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') hideCtxBtn();
  }, true);

  // ==========================================================================
  // UI：悬浮小球 + 面板
  // ==========================================================================

  const LS_POS = 'dyee_ball_pos';
  const LS_OPEN = 'dyee_open';

  let ui = null;
  let busy = false;
  let scanResult = null;
  let picked = new Set();

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
          position: fixed; z-index: 2147483647; padding: 7px;
          font: 13px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
          user-select: none;
        }
        #dy-emoji-exporter-ui * { box-sizing: border-box; }

        #dyee-ball {
          width: 46px; height: 46px; border-radius: 50%;
          background: linear-gradient(145deg, #37b37c, #2f9e6e);
          box-shadow: 0 4px 14px rgba(47,158,110,.42), 0 1px 3px rgba(0,0,0,.16);
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; position: relative;
          transition: transform .16s ease, box-shadow .16s ease;
        }
        #dyee-ball:hover { transform: scale(1.08); }
        #dyee-ball:active { transform: scale(.95); }
        #dyee-ball .face { font-size: 21px; line-height: 1; }
        #dyee-ball.working .face { animation: dyee-spin 1.1s linear infinite; }
        @keyframes dyee-spin {
          0% { transform: rotate(0) scale(1); }
          50% { transform: rotate(180deg) scale(1.12); }
          100% { transform: rotate(360deg) scale(1); }
        }
        #dyee-badge {
          position: absolute; top: -4px; right: -4px;
          min-width: 19px; height: 19px; padding: 0 5px;
          border-radius: 10px; background: #fff; color: #2f9e6e;
          font-size: 11px; font-weight: 700; line-height: 19px;
          text-align: center; border: 1.5px solid #2f9e6e; display: none;
        }
        #dyee-ball.has-data #dyee-badge { display: block; }

        #dyee-panel {
          position: absolute; right: 0; bottom: 58px;
          width: 430px; max-height: 72vh;
          display: flex; flex-direction: column;
          background: #fff; color: #1f2d26;
          border: 1px solid #d8e6dd; border-radius: 14px;
          box-shadow: 0 10px 34px rgba(31,45,38,.18);
          overflow: hidden; transform-origin: bottom right;
          transition: opacity .16s ease, transform .16s ease;
        }
        #dyee-panel.hidden {
          opacity: 0; transform: scale(.9) translateY(8px); pointer-events: none;
        }
        @media (max-width: 500px) { #dyee-panel { width: calc(100vw - 60px); } }

        /* 右键表情时浮在抖音「添加到表情」气泡旁的下载按钮 */
        .dyee-ctx-btn {
          position: fixed; z-index: 2147483646;
          padding: 6px 12px; border-radius: 8px;
          background: linear-gradient(145deg, #37b37c, #2f9e6e);
          color: #fff; font: 600 13px/1.5 -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif;
          white-space: nowrap; cursor: pointer;
          box-shadow: 0 4px 14px rgba(47,158,110,.42), 0 1px 3px rgba(0,0,0,.14);
          user-select: none;
          transition: transform .12s ease, box-shadow .12s ease;
        }
        .dyee-ctx-btn:hover {
          box-shadow: 0 6px 18px rgba(47,158,110,.55), 0 1px 3px rgba(0,0,0,.18);
          filter: brightness(1.06);
        }
        .dyee-ctx-btn.busy { opacity: .75; cursor: default; }
        .dyee-ctx-btn.ok { background: #2f9e6e; }
        .dyee-ctx-btn.err { background: #cf5b52; }

        #dyee-hd {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 13px; background: #2f9e6e; color: #fff;
          font-weight: 600; flex: none;
        }
        #dyee-close { cursor: pointer; opacity: .85; font-size: 16px; }
        #dyee-close:hover { opacity: 1; }
        #dyee-bd {
          padding: 12px 13px; display: flex; flex-direction: column;
          min-height: 0; flex: 1;
        }

        /* ---- 设置区 ---- */
        #dyee-settings {
          flex: none; margin-bottom: 10px; padding: 9px 10px;
          background: #f7fbf8; border: 1px solid #e6f0ea; border-radius: 9px;
        }
        .dyee-row {
          display: flex; align-items: center; gap: 8px; margin-bottom: 7px;
          font-size: 12px;
        }
        .dyee-row:last-child { margin-bottom: 0; }
        .dyee-row > label { color: #47584f; min-width: 62px; flex: none; }
        .dyee-seg { display: flex; gap: 0; flex: 1; }
        .dyee-seg button {
          flex: 1; padding: 4px 6px; font-size: 11.5px; cursor: pointer;
          border: 1px solid #d8e6dd; background: #fff; color: #47584f;
          font-family: inherit; transition: .14s;
        }
        .dyee-seg button:first-child { border-radius: 6px 0 0 6px; }
        .dyee-seg button:last-child { border-radius: 0 6px 6px 0; }
        .dyee-seg button + button { border-left: none; }
        .dyee-seg button.on {
          background: #2f9e6e; border-color: #2f9e6e; color: #fff; font-weight: 600;
        }

        #dyee-status {
          color: #6b7d74; font-size: 12.5px; margin-bottom: 9px;
          line-height: 1.6; flex: none; word-break: break-word;
        }

        .dyee-btn {
          width: 100%; padding: 9px; border-radius: 8px; font-size: 13px;
          cursor: pointer; font-family: inherit; transition: .15s;
        }
        .dyee-btn:disabled { opacity: .5; cursor: not-allowed; }
        #dyee-scan {
          border: none; background: #2f9e6e; color: #fff; font-weight: 600;
          flex: none;
        }
        #dyee-scan:hover:not(:disabled) { filter: brightness(1.07); }
        #dyee-scan:active:not(:disabled) { transform: scale(.99); }

        /* ---- 选择区 ---- */
        #dyee-select {
          display: none; flex-direction: column; min-height: 0; flex: 1;
          margin-top: 9px; border-top: 1px solid #e6f0ea; padding-top: 9px;
        }
        #dyee-select.on { display: flex; }
        #dyee-tools {
          display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 8px;
          flex: none; align-items: center;
        }
        .dyee-tool {
          padding: 4px 9px; border-radius: 6px; font-size: 11.5px;
          border: 1px solid #d8e6dd; background: #fff; color: #47584f;
          cursor: pointer; font-family: inherit; transition: .14s;
          line-height: 1.4;
        }
        .dyee-tool:hover { background: #f3f8f4; border-color: #bfe3cd; color: #1c7a52; }
        .dyee-tool:active { transform: scale(.96); }

        /* 已选数量：做成醒目的胶囊，放最右 */
        #dyee-selinfo {
          margin-left: auto; white-space: nowrap;
          font-size: 11.5px; color: #fff; background: #2f9e6e;
          padding: 4px 10px; border-radius: 10px; font-weight: 600;
          line-height: 1.4;
        }
        #dyee-selinfo b { color: #fff; font-weight: 700; }
        #dyee-selinfo.zero { background: #b9c4be; }

        #dyee-grid {
          flex: 1; min-height: 90px; overflow-y: auto; overflow-x: hidden;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
          gap: 7px; align-content: start; padding: 3px;
          scrollbar-width: thin;
        }
        #dyee-grid::-webkit-scrollbar { width: 6px; }
        #dyee-grid::-webkit-scrollbar-thumb { background: #cfe9dc; border-radius: 3px; }
        #dyee-grid::-webkit-scrollbar-thumb:hover { background: #a8d5bc; }

        /* 格子：未选中是浅灰边，选中是绿边 + 轻微内发光 */
        .dyee-cell {
          position: relative; aspect-ratio: 1; border-radius: 9px;
          background: #f3f8f4 center/contain no-repeat;
          border: 2px solid #e6f0ea; cursor: pointer;
          transition: border-color .12s, transform .12s, box-shadow .12s;
          overflow: hidden;
        }
        .dyee-cell:hover {
          border-color: #a8d5bc; transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(31,45,38,.1);
        }
        .dyee-cell.picked {
          border-color: #2f9e6e;
          box-shadow: 0 0 0 2px rgba(47,158,110,.22);
        }
        /* 选中时右上角只放一个小圆点，不用大对勾 */
        .dyee-cell .dot {
          position: absolute; top: 4px; right: 4px;
          width: 12px; height: 12px; border-radius: 50%;
          background: #fff; border: 2px solid rgba(255,255,255,.9);
          box-shadow: 0 1px 3px rgba(0,0,0,.25);
          display: none;
        }
        .dyee-cell.picked .dot {
          display: block;
          background: #2f9e6e;
          border-color: #fff;
        }
        /* 动图角标：底部左侧小标签 */
        .dyee-cell .anim {
          position: absolute; bottom: 0; left: 0;
          font-size: 9px; color: #fff; background: rgba(28,122,82,.82);
          padding: 1px 4px; border-radius: 0 6px 0 0;
          line-height: 12px; letter-spacing: .3px;
        }

        #dyee-actions { display: flex; gap: 6px; margin-top: 9px; flex: none; }
        #dyee-download { flex: 1; border: none; background: #2f9e6e; color: #fff; font-weight: 600; }
        #dyee-json { flex: none; padding: 9px 14px; border: 1px solid #d8e6dd;
          background: #fff; color: #47584f; border-radius: 8px; font-size: 12.5px;
          cursor: pointer; font-family: inherit; }
        #dyee-json:hover:not(:disabled) { background: #f3f8f4; color: #1c7a52; }
      </style>

      <div id="dyee-panel" class="hidden">
        <div id="dyee-hd">
          <span>抖音表情导出</span>
          <span id="dyee-close" title="收起">✕</span>
        </div>
        <div id="dyee-bd">
          <div id="dyee-settings">
            <div class="dyee-row">
              <label>下载模式</label>
              <div class="dyee-seg" id="dyee-mode">
                <button data-v="browser">浏览器下载</button>
                <button data-v="json">导出 JSON</button>
              </div>
            </div>
            <div class="dyee-row">
              <label>下载格式</label>
              <div class="dyee-seg" id="dyee-format">
                <button data-v="gif">转 GIF/PNG</button>
                <button data-v="original">原图 WebP</button>
              </div>
            </div>
          </div>

          <div id="dyee-status">先在私信里打开发情面板并切到「收藏」，再点抓取</div>
          <button id="dyee-scan" class="dyee-btn">抓取当前收藏表情</button>

          <div id="dyee-select">
            <div id="dyee-tools">
              <button class="dyee-tool" data-act="all">全选</button>
              <button class="dyee-tool" data-act="none">取消</button>
              <button class="dyee-tool" data-act="invert">反选</button>
              <button class="dyee-tool" data-act="anim">仅动图</button>
              <span id="dyee-selinfo"></span>
            </div>
            <div id="dyee-grid"></div>
            <div id="dyee-actions">
              <button id="dyee-download" class="dyee-btn">下载选中</button>
              <button id="dyee-json">导出 JSON</button>
            </div>
          </div>
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

    // ---- 设置项初始化 ----
    function syncSettings() {
      root.querySelectorAll('#dyee-mode button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.v === cfg.downloadMode);
      });
      root.querySelectorAll('#dyee-format button').forEach(function (b) {
        b.classList.toggle('on', b.dataset.v === cfg.browserFormat);
      });
      // 导出 JSON 模式下，格式选择无意义，置灰
      const fmtRow = root.querySelector('#dyee-format').closest('.dyee-row');
      const jsonMode = cfg.downloadMode === 'json';
      fmtRow.style.opacity = jsonMode ? '.45' : '1';
      root.querySelectorAll('#dyee-format button').forEach(function (b) {
        b.disabled = jsonMode;
      });
    }

    root.querySelectorAll('#dyee-mode button').forEach(function (b) {
      b.onclick = function () {
        cfg.downloadMode = b.dataset.v;
        saveCfg(cfg);
        syncSettings();
      };
    });
    root.querySelectorAll('#dyee-format button').forEach(function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        cfg.browserFormat = b.dataset.v;
        saveCfg(cfg);
        syncSettings();
      };
    });
    syncSettings();

    // ---- 位置恢复 ----
    let pos = null;
    try { pos = JSON.parse(lsGet(LS_POS, 'null')); } catch (e) { pos = null; }

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
    root.querySelector('#dyee-close').onclick = function (e) {
      e.stopPropagation();
      setOpen(false);
    };

    // ---- 拖动 + 点击 ----
    let dragging = false, moved = false;
    let startX = 0, startY = 0, origX = 0, origY = 0;

    ball.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      dragging = true; moved = false;
      const r = root.getBoundingClientRect();
      startX = e.clientX; startY = e.clientY;
      origX = r.left; origY = r.top;
      e.preventDefault();
      e.stopPropagation();
    });

    window.addEventListener('mousemove', function (e) {
      if (!dragging) return;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!moved && Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
      moved = true;
      const c = clampPos(origX + dx, origY + dy);
      root.style.left = c.x + 'px';
      root.style.top = c.y + 'px';
      root.style.right = 'auto';
      root.style.bottom = 'auto';
    });

    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      if (moved) {
        const r = root.getBoundingClientRect();
        lsSet(LS_POS, JSON.stringify({ x: Math.round(r.left), y: Math.round(r.top) }));
      } else {
        setOpen(panel.classList.contains('hidden'));
      }
    });

    // ---- 按钮绑定 ----
    root.querySelector('#dyee-scan').onclick = doScan;
    root.querySelector('#dyee-download').onclick = doDownloadPicked;
    root.querySelector('#dyee-json').onclick = doExportJson;

    root.querySelectorAll('.dyee-tool').forEach(function (b) {
      b.onclick = function () { doToolAction(b.dataset.act); };
    });

    ui = root;
    return root;
  }

  // ==========================================================================
  // UI 动作
  // ==========================================================================

  function $(sel) { return document.querySelector(sel); }

  function setStatus(text, color) {
    const el = $('#dyee-status');
    if (!el) return;
    el.textContent = text;
    el.style.color = color || '#6b7d74';
  }

  function setBadge(n) {
    const ball = $('#dyee-ball');
    const badge = $('#dyee-badge');
    if (!ball || !badge) return;
    if (n > 0) {
      badge.textContent = n > 999 ? '999+' : String(n);
      ball.classList.add('has-data');
    } else {
      badge.textContent = '';
      ball.classList.remove('has-data');
    }
  }

  function setWorking(on) {
    const ball = $('#dyee-ball');
    if (ball) ball.classList.toggle('working', !!on);
  }

  function updateSelInfo() {
    const el = $('#dyee-selinfo');
    if (!el) return;
    const total = scanResult ? scanResult.items.length : 0;
    el.innerHTML = '已选 <b>' + picked.size + '</b> / ' + total;
  }

  /** 抓取表情 */
  async function collect(panel) {
    const map = new Map();
    for (const img of panel.querySelectorAll('img')) {
      const src = img.src || img.getAttribute('data-src') || '';
      if (!src || !/^https?:/.test(src)) continue;
      if (!/im-emoticon/i.test(src)) continue;
      const id = stableId(src);
      if (!map.has(id)) {
        map.set(id, {
          id: id,
          url: src,
          w: img.naturalWidth || 0,
          h: img.naturalHeight || 0,
          animated: isAnimatedUrl(src),
        });
      }
    }
    return Array.from(map.values());
  }

  async function scrollToEnd(panel, onProgress) {
    const scroller = findScroller(panel);
    let lastCount = -1, stillRounds = 0, round = 0;
    const MAX_ROUNDS = 60, STILL_LIMIT = 3, WAIT = 420;

    while (round < MAX_ROUNDS) {
      round++;
      scroller.scrollTop = scroller.scrollHeight;
      await new Promise(function (r) { setTimeout(r, WAIT); });
      const count = (await collect(panel)).length;
      if (onProgress) onProgress(round, count);
      if (count <= lastCount) {
        stillRounds++;
        if (stillRounds >= STILL_LIMIT) break;
      } else {
        stillRounds = 0;
      }
      lastCount = count;
    }
    try { scroller.scrollTop = 0; } catch (e) { /* ignore */ }
    return await collect(panel);
  }

  async function doScan() {
    if (busy) return;

    busy = true;
    setWorking(true);

    const btn = $('#dyee-scan');
    if (btn) {
      btn.disabled = true;
      btn.textContent = '抓取中…';
    }

    try {
      // 只认用户已经打开的表情面板，不替他点任何东西
      const panel = findEmojiPanel();
      if (!panel) {
        setStatus('请先在私信里打开发情面板并切到「收藏」，再点抓取', '#cf5b52');
        return;
      }

      setStatus('正在滚动加载全部表情…');
      const items = await scrollToEnd(panel, function (round, count) {
        setStatus('第 ' + round + ' 轮滚动，已发现 ' + count + ' 个表情…');
      });

      const anim = items.filter(function (i) { return i.animated; }).length;
      scanResult = {
        version: 1,
        captured_at: new Date().toISOString(),
        source: location.href,
        total: items.length,
        animated: anim,
        static: items.length - anim,
        items: items,
      };

      // 默认全选
      picked = new Set(items.map(function (i) { return i.id; }));

      setStatus('抓取完成：共 ' + items.length + ' 个（动画 ' + anim + '，静态 ' + (items.length - anim) + '）', '#1c7a52');
      setBadge(items.length);
      renderGrid();
      $('#dyee-select').classList.add('on');
      updateSelInfo();
    } catch (e) {
      setStatus('抓取出错：' + e.message, '#cf5b52');
    } finally {
      busy = false;
      setWorking(false);
      if (btn) {
        btn.disabled = false;
        btn.textContent = scanResult ? '重新抓取' : '抓取当前收藏表情';
      }
    }
  }

  /** 渲染缩略图网格 */
  function renderGrid() {
    const grid = $('#dyee-grid');
    if (!grid || !scanResult) return;

    const html = scanResult.items.map(function (it) {
      const sel = picked.has(it.id) ? ' picked' : '';
      const anim = it.animated ? '<span class="anim">动</span>' : '';
      return '<div class="dyee-cell' + sel + '" data-id="' + it.id + '"' +
             ' style="background-image:url(\'' + it.url + '\')">' +
             '<span class="tick">✓</span>' + anim + '</div>';
    }).join('');

    grid.innerHTML = html;
  }

  /** 网格点击（事件委托） */
  document.addEventListener('click', function (e) {
    const cell = e.target.closest && e.target.closest('.dyee-cell');
    if (!cell) return;
    const id = cell.dataset.id;
    if (picked.has(id)) {
      picked.delete(id);
      cell.classList.remove('picked');
    } else {
      picked.add(id);
      cell.classList.add('picked');
    }
    updateSelInfo();
  });

  function doToolAction(act) {
    // 重新抓取不依赖已有结果
    if (act === 'rescan') {
      doScan();
      return;
    }
    if (!scanResult) return;
    const items = scanResult.items;
    if (act === 'all') {
      picked = new Set(items.map(function (i) { return i.id; }));
    } else if (act === 'none') {
      picked.clear();
    } else if (act === 'invert') {
      const next = new Set();
      items.forEach(function (i) {
        if (!picked.has(i.id)) next.add(i.id);
      });
      picked = next;
    } else if (act === 'anim') {
      picked = new Set(items.filter(function (i) { return i.animated; })
                          .map(function (i) { return i.id; }));
    }
    // 同步 UI
    document.querySelectorAll('.dyee-cell').forEach(function (c) {
      c.classList.toggle('picked', picked.has(c.dataset.id));
    });
    updateSelInfo();
  }

  /** 下载选中的表情 */
  async function doDownloadPicked() {
    if (busy || !scanResult) return;

    const targets = scanResult.items.filter(function (i) { return picked.has(i.id); });
    if (!targets.length) {
      setStatus('没有选中任何表情', '#c98a1b');
      return;
    }

    busy = true;
    setWorking(true);
    const btn = $('#dyee-download');
    btn.disabled = true;

    let ok = 0, fail = 0;
    try {
      for (let i = 0; i < targets.length; i++) {
        btn.textContent = '下载中 ' + (i + 1) + '/' + targets.length;
        setStatus('正在下载 ' + (i + 1) + '/' + targets.length +
                  '（' + (cfg.browserFormat === 'original' ? '原图' : '转 GIF/PNG') + '）…');
        const r = await downloadOne(targets[i].url);
        if (r.ok) ok++; else fail++;
      }
      setStatus('下载完成：成功 ' + ok + ' 个' + (fail ? '，失败 ' + fail + ' 个' : ''), '#1c7a52');
    } finally {
      busy = false;
      setWorking(false);
      btn.disabled = false;
      btn.textContent = '下载选中';
    }
  }

  /** 导出 JSON（供离线工具使用） */
  function doExportJson() {
    if (!scanResult) {
      setStatus('请先抓取表情', '#c98a1b');
      return;
    }
    const sel = scanResult.items.filter(function (i) { return picked.has(i.id); });
    const doc = {
      version: 1,
      captured_at: scanResult.captured_at,
      source: scanResult.source,
      total: sel.length,
      animated: sel.filter(function (i) { return i.animated; }).length,
      static: sel.filter(function (i) { return !i.animated; }).length,
      items: sel,
    };
    const json = JSON.stringify(doc, null, 2);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'emoji-list-' + Date.now() + '.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 3000);
      setStatus('已导出 ' + sel.length + ' 个表情的清单', '#1c7a52');
    } catch (e) {
      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(json, 'text');
        setStatus('清单已复制到剪贴板', '#1c7a52');
      } else {
        setStatus('导出失败：' + e.message, '#cf5b52');
      }
    }
  }

  // ==========================================================================
  // 启动
  // ==========================================================================

  function init() {
    if (document.getElementById('dy-emoji-exporter-ui')) return;
    buildUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }

  // SPA 路由切换后 UI 可能被移除，兜底重建
  setInterval(function () {
    if (!document.getElementById('dy-emoji-exporter-ui')) init();
  }, 3000);

  // 快捷键 Ctrl+Shift+E 抓取
  document.addEventListener('keydown', function (e) {
    if (e.ctrlKey && e.shiftKey && e.key === 'E') {
      e.preventDefault();
      const p = $('#dyee-panel');
      if (p && p.classList.contains('hidden')) {
        p.classList.remove('hidden');
        try { localStorage.setItem('dyee_open', '1'); } catch (err) { /* ignore */ }
      }
      doScan();
    }
  });

})();
