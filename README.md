# 抖音表情导出 · douyin-emoji-exporter

一个油猴脚本，把抖音表情直接下载到本地：**收藏表情批量导出** + **评论区表情右键下载**，动态表情自动转成微信能发的 GIF。

无需安装软件，无需命令行，无 Python 环境。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-2.1.0-blue.svg)]()
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-userscript-orange.svg)](https://www.tampermonkey.net/)
[![ScriptCat](https://img.shields.io/badge/ScriptCat-userscript-2f9e6e.svg)](https://docs.scriptcat.org/)

---

## 特点

- **单文件脚本，约 54 KB** —— 抓取、下载、GIF 转换全在浏览器里完成，不依赖外部程序
- **默认直接下载** —— 不用先导出清单再跑转换器，选完表情点一下就到本地
- **动态表情转 GIF** —— 用内置 [gifenc](https://github.com/mattdesl/gifenc) 编码，微信可直接发送
- **评论区表情右键下载** —— 右键任意评论表情，旁边浮出下载按钮
- **可勾选** —— 抓取后默认全选，可以逐个取消，也能只选动态表情

---

## 安装

1. 浏览器装 **[Tampermonkey](https://www.tampermonkey.net/)**（篡改猴）或 **[ScriptCat](https://docs.scriptcat.org/)**
2. 打开 [`userscript/douyin-emoji-exporter.user.js`](userscript/douyin-emoji-exporter.user.js)，点 **Raw**，脚本管理器会接管安装

> 也可以从 [Greasy Fork](https://greasyfork.org/) / [ScriptCat 脚本页面](https://scriptcat.org/zh-CN/script-show-page/8734) 安装。

---

## 用法一：收藏表情批量导出

1. 打开 <https://www.douyin.com/> 并登录
2. 进入 **消息 → 任意私信 → 点输入框旁 😊 → 切到「收藏」标签**
3. **先手动把表情面板打开**（脚本不会替你点开，这是刻意的）
4. 点右下角的绿色小球 😊 展开面板 → 点 **抓取当前收藏表情**
   - 脚本会自动滚到底，把懒加载的表情全部加载出来
   - 也可以按 `Ctrl+Shift+E` 直接抓取
5. 抓完后默认全选，需要的话点掉不要的
6. 点 **开始下载**

> **悬浮球**：单击展开/收起；按住拖动可移到任意位置；位置和展开状态会记在本地，刷新后保持。抓完会显示数量角标。

### 面板选项

| 选项 | 说明 |
| --- | --- |
| **下载模式 · 浏览器下载** | 默认。直接把文件存到下载目录 |
| **下载模式 · 导出 JSON** | 只导出清单 `emoji-list-*.json`，不下载文件（给需要自己处理 URL 的人） |
| **下载格式 · 转 GIF/PNG** | 默认。动态转 GIF（微信能动），静态转 PNG |
| **下载格式 · 原图 WebP** | 保留原始格式，体积最小、完全无损，但微信里动态 WebP 不会动 |

---

## 用法二：评论区表情右键下载

在视频评论区里，**右键**任意表情图：

- 抖音会照常弹出它的「添加到表情」气泡 —— **不受影响**
- 我们的 **「下载表情」** 绿色按钮会浮在气泡左侧
- 点它即可下载，格式遵循面板里的「下载格式」设置

鼠标点别处、滚动页面或按 `Esc` 会自动收起按钮。

> **实现说明**：抖音右键表情时弹出的其实不是菜单，而是 Semi Design 的 tooltip（`role="tooltip"`），由 React 托管、鼠标移开即销毁，无法往里注入节点；浏览器原生右键菜单也无法用脚本扩展。所以这里采用**并排浮动按钮**，两边互不干扰。

---

## GIF 体积说明

**GIF 格式本身决定了动图会比较大**，这是格式限制，不是实现问题。

实测 86 张表情（42 动态 + 44 静态，原始尺寸）：

| 输出配置 | 总体积 |
| --- | --- |
| 动态 GIF + 静态 PNG | **145 MB**（GIF 130 MB + PNG 15 MB） |
| 静态改 WebP | 141 MB |
| 保留原图 WebP | **约 22 MB** |

**为什么这么大**：GIF 帧间独立，每帧都要完整存一张 256 色调色板图。实测「字节/像素/帧」稳定在 0.5~1.0，一张 148 帧、236×426 的动图转 GIF 必然接近 11 MB。这个系数由 GIF 格式决定，**换任何语言都改变不了**。

**怎么选**：

- **要发微信且动画能动** → 用默认的「转 GIF/PNG」。微信单文件上限 25 MB，最大那张约 11 MB 没问题
- **只存档 / 不在意微信动效** → 选「原图 WebP」，体积最小且完全无损

---

## 技术细节

### 为什么用 `GM_xmlhttpRequest`

实测表情 CDN **不带 CORS 响应头**，页面内 `fetch`/`XHR` 直接 `TypeError: Failed to fetch`；`canvas.getImageData` 会因污染抛 `SecurityError`。

`GM_xmlhttpRequest` 由脚本管理器发出，不受页面同源策略限制，是唯一可靠拿到字节的方式。

### 为什么内置 gifenc

浏览器没有原生 GIF 编码 API。gifenc 是成熟的浏览器端 GIF 编码库（自适应中位切分量化），比手写 LZW 画质更好。为满足油猴脚本「单文件」要求，压缩版（约 10.8 KB）直接内联进产物。

### 判定动图 / 静态图

URL 里带 `.awebp` 的是动图，`.webp` 是静态图 —— 实测与真实帧数 **100% 对应**。

### 判定评论区表情

评论区表情 URL 统一是 `~tplv-<biz>-medium-webp:248:332` 模板、页面上渲染高度一律 120px。

这里用 **URL 模板参数**判定而不是量 `naturalWidth` —— 后者会随原图变化，实测出现 310 / 323 / 248 / 493 / 343 等多种值，用尺寸阈值会漏判一半。回归验证结果：命中 11 张评论区表情，头像 **0 误伤**。

### 真实帧延时

WebP 的 `ANMF` chunk 里存着每帧的真实延时（payload 字节 `[12..14]`，小端毫秒）。Pillow 读这些文件会得到 `duration=None`，所以自己解析，否则所有帧都会变成 100ms，动画速度失真。

### 签名有效期

实测 `x-expires` 距当时约 **365 天**，并不是短时效链接。但 URL 会随页面刷新变化，建议抓到就下。

---

## 常见问题

**Q：点抓取提示「请先打开发情面板」？**
这是设计如此。脚本不替你点开面板，避免误操作。请手动进「消息 → 私信 → 😊 → 收藏」，再点抓取。

**Q：抓到的表情不全？**
面板是滚动加载的。脚本会自动滚到底并等列表稳定（连续 3 轮数量不增才停）。若仍不全，先手动滑到最底部再抓。

**Q：下载很慢 / 大量失败？**
每张都有重试。若普遍失败，可能是签名过期，重新抓一次即可。

**Q：右键表情没出现下载按钮？**
确认是**评论区的表情图**（小图），不是头像或评论配图。另外脚本更新后需要**刷新页面**才生效。

**Q：能不能不装油猴？**
可以。用「导出 JSON」拿到清单，然后用任意工具自己下 URL，脚本不限制你怎么处理。

---

## 文件结构

```
douyin-emoji-exporter/
├── userscript/
│   ├── douyin-emoji-exporter.user.js   ← 构建产物（安装这个）
│   ├── _template.js                    源码模板，含 __GIFENC__ 占位符
│   ├── _build.py                       构建脚本：内联 gifenc → 产出 .user.js
│   └── _libs/
│       └── gifenc.min.js               gifenc 压缩版（MIT）
├── converter/
│   ├── convert.py                      可选的 Python 转换器（命令行用）
│   └── requirements.txt
├── README.md
└── LICENSE
```

### 自己构建

```bash
cd userscript
python _build.py     # 读取 _template.js + _libs/gifenc.min.js，输出 .user.js
```

构建只依赖 Python 标准库，无需安装任何包。

### 清单格式（导出 JSON 时）

```json
{
  "version": 1,
  "captured_at": "2026-10-26T00:10:00+08:00",
  "source": "https://www.douyin.com/",
  "total": 86,
  "animated": 42,
  "static": 44,
  "items": [
    {
      "id": "o8BABlJUEEMAAjdQZ4TfEFz0DDehBeI1H9sKrA",
      "url": "https://p26-im-emoticon-sign.byteimg.com/...",
      "w": 240,
      "h": 240,
      "animated": true
    }
  ]
}
```

`id` 取自 URL 中 `~tplv` 之前那段（实测 86 个全部唯一）。**不能用路径末段** —— 那是 resize 参数，很多不同表情会撞成同一个。

---

## 更新记录

### v2.1.0

- **移除**「自动打开收藏面板」的模拟点击逻辑：不再替你点消息 → 私信 → 表情，改为只认你手动打开的面板（减少了大量易随抖音改版失效的 DOM 猜测代码）
- **重写**评论区表情下载：原先试图往抖音右键菜单注入，参考的是 `rightMenu`/`contextMenu` 之类的类名，但抖音类名是 `iLNqted2` 这类随机串，从未匹配上。现改为在「添加到表情」气泡旁浮动「下载」按钮
- **修正**评论区表情判定规则：改用 URL 模板参数 `medium-webp:248:332`，替代原先会漏判的尺寸阈值

### v2.0.0

- 合并为单文件脚本：GIF 转换内置（gifenc），不再需要下载 exe
- 默认直接浏览器下载，可切换导出 JSON
- 面板改为可拖动悬浮球

### v1.0.0

- 初版：油猴脚本抓 URL → 导出 JSON → Python 转换器（PyInstaller 打包 exe）

---

## License

[MIT](LICENSE)
