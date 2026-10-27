# 抖音表情导出 · douyin-emoji-exporter

把抖音「收藏表情」批量导出成本地文件，自动转成微信可直接发送的格式（动态转 GIF、静态转 PNG）。

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Python](https://img.shields.io/badge/Python-3.9%2B-blue.svg)](https://www.python.org/)
[![Tampermonkey](https://img.shields.io/badge/Tampermonkey-userscript-orange.svg)](https://www.tampermonkey.net/)

**两个部件完全解耦**：

```
1. 油猴脚本      →  导出 emoji-list.json
                          ↓
2. douyin-emoji-exporter.exe →  下载 + 转换 + 写入独立文件夹
```

两者之间只通过一个 JSON 文件交接 —— 不需要同时运行，不需要登录态，转换器可以随时重跑。

---

## 快速开始

1. 装油猴脚本 → 在抖音里抓取 → 得到 `emoji-list-xxx.json`
2. 到 [Releases](https://github.com/LinZX1314/douyin-emoji-exporter/releases/latest) 或者 [蓝奏云](https://wwbdf.lanzouc.com/iVrgO4ddjnqj)(密码:frh8) 下载 `douyin-emoji-exporter.exe`
3. **把 json 文件直接拖到这个 exe 上**
4. 约 20 秒后，产物出现在 exe 旁边的新文件夹 `emoji-list_<日期>-<时间>\` 里

**单文件 exe，22 MB，无需安装，无需 Python。**

> 也可以只用源码：`pip install -r converter/requirements.txt` 后运行 `python converter/convert.py <清单.json>`

---

## 第一部分：抓取脚本

### 安装

1. 浏览器安装 [**ScriptCat**](https://docs.scriptcat.org/) 或者 **Tampermonkey**（篡改猴）扩展
2.  [点击安装脚本](https://scriptcat.org/zh-CN/script-show-page/8734)

### 使用

1. 打开 <https://www.douyin.com/> 并登录
2. 进入：**消息 → 任意私信 → 点输入框旁 😊 → 收藏的表情**
3. **点右下角的绿色小球**（😊 图标）展开面板，点 **开始抓取**
   - 脚本会自动滚动到列表底部，把懒加载的表情全部加载出来
   - 也可以按 `Ctrl+Shift+E` 快捷键直接抓取
4. 抓完点 **导出 JSON**，得到一个 `emoji-list-*.json` 文件

> **小球操作**：单击展开/收起面板；按住拖动可移到任意位置；位置和展开状态都会记住，刷新后保持。抓取完成后球上会显示数量角标。

### 关于「抓取不全」

表情面板是**滚动加载**的。脚本会自动滚到底并等待列表稳定（连续 3 轮数量不再增加才停），所以正常情况下不需要手动滑。

如果仍然不全，先手动滑到最底部再点抓取。

---

## 第二部分：转换器

### 最快用法：拖放

**把脚本导出的 `emoji-list-xxx.json` 直接拖到 `douyin-emoji-exporter.exe` 上。**

程序会在 exe 同级目录下新建一个文件夹（名字带清单名和时间戳），产物就在里面：

```
(exe 所在目录)\
├── douyin-emoji-exporter.exe
└── emoji-list_1026-0030\      ← 产物在这里
    ├── emoji_0001.gif
    ├── emoji_0002.gif
    ├── ...
    └── _report.txt
```

窗口会显示统计，看完按回车关闭。**重复拖放不会覆盖**，每次生成新文件夹。

不需要 Python，不需要命令行。

### 命令行用法（可选）

```bash
douyin-emoji-exporter.exe emoji-list.json                  # 基本用法
douyin-emoji-exporter.exe emoji-list.json --max-side 240   # 带参数
douyin-emoji-exporter.exe --help                           # 全部参数
```

### 常用参数

| 参数 | 作用 |
| --- | --- |
| `--static-format webp` | 静态图改用 WebP（省约 30% 体积，无损） |
| `--format webp` | 动图也保留原格式（体积最小，但微信动态 WebP 不会动） |
| `--max-side 240` | 最大边长 240px，GIF 体积大幅下降 |
| `--max-frames 30` | 动图最多 30 帧（抽帧，动画会变卡） |
| `--max-mb 5` | 单文件超过 5MB 时自动降采样 |
| `--workers 8` | 并发线程数（默认 4） |

### 源码运行（开发用）

```bash
cd converter
pip install pillow requests
python convert.py input/emoji-list.json
```

---

## 关于体积（重要）

**GIF 格式本身决定了动图会比较大。** 这是格式限制，不是程序问题。

实测 86 张表情（42 动图 + 44 静态，保留原始尺寸）：

| 输出配置 | 总体积 | 说明 |
| --- | --- | --- |
| **默认（动图 GIF + 静态 PNG）** | **145.4 MB** | GIF 130.3 MB + PNG 15.1 MB |
| `--static-format webp` | 140.9 MB | 静态图从 15.1 降到 10.7 MB |
| `--max-side 240` | 约 73 MB | 缩到 240px，聊天窗口够用 |
| `--format webp` | **约 22 MB** | 保留原始体积，但微信动态 WebP 不会动 |

**为什么 GIF 这么大**：GIF 是帧间独立的，每帧都要完整存一张 256 色调色板图。实测「字节/像素/帧」稳定在 0.5~1.0，一个 148 帧、236×426 的动画，转成 GIF 必然接近 11MB。这个系数由 GIF 格式决定，**换任何语言都改变不了**。

**怎么选**：

- **要发微信能动** → 用默认的 GIF。微信单文件限制 25MB，最大那张 10.9MB 没问题
- **只要静态图/存档** → `--format webp`，体积最小且完全无损
- **量大且不在乎缩放** → `--max-side 240`

静态图默认 **PNG**（兼容性最好，任何软件都能打开）。改 `--static-format webp` 可省约 30% 体积，且是无损重编码，画质与 PNG 一致。

---

## 关于打包成 exe

Release 提供的是 PyInstaller **onefile 单文件版**：`douyin-emoji-exporter.exe`，**22 MB**。下载下来就是这一个 exe，没有任何依赖库目录或附加文件。

体积对比：

| 方案 | 体积 | 能否处理动画 WebP |
| --- | --- | --- |
| **Python + PyInstaller（onefile）** | **22 MB 单文件** | ✅ 可以（Pillow 完整支持） |
| Python + PyInstaller（onedir） | 46 MB 目录（90 个文件） | ✅ 可以，但要多带一堆文件 |
| Go（仅标准库） | 9.6 MB | ❌ 不支持 |
| Go（+ x/image/webp） | 2.6 MB | ❌ 只能解第一帧，动画报错 |

**为什么不用 Go**：抖音的表情**全部是动画 WebP**。实测 `golang.org/x/image/webp` 对动画 WebP 直接报 `webp: invalid format`，只能解第一帧。要用 Go 处理只能 CGO 绑 libwebp（捆 DLL、失去静态单文件优势）或自己实现 RIFF/ANMF + VP8 解码（等于重写解码器）。Pillow 开箱即用完整支持动画 WebP、透明通道和自适应调色板量化。

**关于 onefile 的启动**：单文件版启动时要把自身内容解压到临时目录，因此首次启动会比带库目录的版本慢 1~2 秒，属正常现象。打包时已用 `--runtime-tmpdir "."` 指定为 exe 所在目录，避免某些系统上默认临时目录不可写导致的 `Could not create temporary directory!` 报错；程序退出会自动清理，不会残留文件。

---

## 转换器做了什么

1. **读清单** → 解析 JSON，按 `id` 去重
2. **并发下载** → 每张重试 2 次，403/404 不重试（签名失效重试没意义）
3. **按帧数分流**
   - 帧数 > 1 → 转 GIF（保留真实帧延时、透明通道）
   - 帧数 = 1 → 转 PNG（或按 `--static-format` 改 WebP）
4. **写盘** → 先写 `.tmp` 再原子替换，避免中断留下半个文件
5. **写报告** → 产物目录下 `_report.txt`，记录每个文件的大小/帧数/来源 URL

### GIF 转换的关键处理

- **透明通道**：单独提取 alpha 做掩模，半透明也算透明，避免边缘发黑
- **调色板**：强制索引 255 留给透明，防止某些图丢透明
- **帧延时**：自己解析 WebP 的 ANMF chunk（Pillow 读不到，否则所有帧都会变成 100ms，动画速度失真）
- **disposal=2**：每帧后恢复背景，防止动态残影

---

## 文件结构

**仓库内容（源码）**：

```
douyin-emoji-exporter/
├── userscript/
│   └── douyin-emoji-exporter.user.js   油猴脚本（抓 URL → JSON）
├── converter/
│   ├── convert.py                      转换器源码
│   ├── requirements.txt
│   └── input/emoji-list.json           清单格式示例
├── README.md
└── LICENSE
```

**Release 下载的就是这一个文件**：

```
douyin-emoji-exporter.exe     单文件，22 MB，免安装
```

把它放在任意目录，然后把 `emoji-list-*.json` 拖上去即可。

产物位置：`emoji-list_<日期>-<时间>\`（和 exe 同级）

### 清单格式

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

`id` 取自 URL 中 `~tplv` 之前那段（实测 86 个全部唯一）。不能用路径末段——那是 resize 参数，很多表情相同。

---

## 常见问题

**Q：转换时大量 403？**
签名 URL 的 `x-expires` 到期了（实测约 1 年）。重新抓一次即可。

**Q：脚本抓到的表情不全？**
先手动把表情面板滑到最底部，再点抓取。

**Q：能不能不装油猴？**
可以。直接把 `emoji-list.json` 里的 `items` 手填 URL 就行，转换器不关心 URL 从哪来。

**Q：GIF 太大想压小？**
用 `--max-side 240` 或 `--max-frames 30`（抽帧）。注意抽帧会让动画不流畅。

**Q：静态图体积能再小点吗？**
加 `--static-format webp`，省约 30% 且完全无损。

---

