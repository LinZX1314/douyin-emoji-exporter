"""抖音表情导出 · 转换器

独立于浏览器：读 JSON 清单 → 下载 → 转换 → 输出到 output/。
不需要登录，不需要 Cookie，不启动浏览器。

用法：
    python convert.py                     # 用默认配置
    python convert.py -i my.json          # 指定清单
    python convert.py --format webp       # 只保留原图
    python convert.py --max-mb 20         # 单文件体积上限(MB)
    python convert.py --workers 4         # 并发数
"""

import argparse
import io
import json
import os
import re
import shutil
import struct
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import requests
from PIL import Image

# ============ 默认配置（可被命令行覆盖，也可直接改这里） ============

DEFAULTS = {
    # 动图输出格式：gif | webp | both
    "format": "gif",
    # 静态图输出格式：png（默认）| webp | original
    # 默认 PNG：兼容性最好，任何平台/软件都能直接打开。
    # 代价是体积：实测 44 个静态图，WebP 无损共 10.7MB，PNG 共 15.1MB（约 1.4 倍）。
    # 想省空间可加 --static-format webp（无损，画质完全一致）。
    "static_format": "png",
    # 单个输出文件体积上限（MB），超过则降采样；0 = 不限制
    "max_mb": 0,
    # 动图超过这个帧数时抽帧（0 = 不限制）
    "max_frames": 0,
    # 输出边长上限（像素），超过则等比缩放；0 = 不限制（保留原始分辨率）
    #
    # 默认 0 = 保留原尺寸。
    # 如果觉得 GIF 太大，可以加 --max-side 240 缩小：
    # 实测 86 张表情在 240px 时 GIF 从 71.5MB 降到约 40MB，
    # 但会损失分辨率，表情在聊天窗口放大时会糊。
    "max_side": 0,
    # GIF 调色板颜色数（最多 255，留 1 个索引给透明）
    "colors": 255,
    # 下载并发数
    "workers": 4,
    # 单个文件下载超时（秒）
    "timeout": 30,
    # 下载失败重试次数
    "retries": 2,
}

ALPHA_THRESHOLD = 128
HEADERS = {
    # 实测不需要任何头也能下载，带上只是为了更规范
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/156.0.0.0 Safari/537.36"
    ),
}


# ============ 数据结构 ============

@dataclass
class Task:
    index: int
    id: str
    url: str
    animated: bool
    declared_w: int = 0
    declared_h: int = 0
    # 结果
    status: str = "pending"      # pending | ok | fail | skip
    error: str = ""
    out_name: str = ""
    out_bytes: int = 0
    src_bytes: int = 0
    frames: int = 0
    elapsed: float = 0.0


@dataclass
class Stats:
    ok: int = 0
    fail: int = 0
    skip: int = 0
    total_src: int = 0
    total_out: int = 0
    start: float = field(default_factory=time.time)

    @property
    def elapsed(self) -> float:
        return time.time() - self.start


# ============ 格式嗅探 ============

def sniff(content: bytes) -> str:
    if content[:4] == b"RIFF" and content[8:12] == b"WEBP":
        return "webp"
    if content[:6] in (b"GIF87a", b"GIF89a"):
        return "gif"
    if content[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if content[:2] == b"\xff\xd8":
        return "jpg"
    return "unknown"


def frame_count(content: bytes) -> int:
    try:
        with Image.open(io.BytesIO(content)) as im:
            return getattr(im, "n_frames", 1)
    except Exception:
        return 1


# ============ WebP 动画延时解析 ============
#
# 【为什么需要自己解析】
# Pillow 读不出抖音这些动画 WebP 的帧延时（im.info["duration"] 全是 None），
# 会导致转出的 GIF 所有帧统一 100ms —— 动画速度完全失真。
#
# WebP 动画的帧延时存在 ANMF chunk 里：
#   ANMF payload 的 [12:15] 三个字节小端就是该帧延时（毫秒）
# 实测 42 个动画表情全部解析成功，帧数与 Pillow 完全一致。

def parse_webp_durations(data: bytes) -> list[int]:
    """解析 WebP 每帧延时(ms)。非动画或解析失败返回空列表。"""
    if len(data) < 12 or data[:4] != b"RIFF" or data[8:12] != b"WEBP":
        return []
    pos, durations = 12, []
    while pos + 8 <= len(data):
        fourcc = data[pos:pos + 4]
        try:
            size = struct.unpack("<I", data[pos + 4:pos + 8])[0]
        except struct.error:
            break
        payload = data[pos + 8:pos + 8 + size]
        if fourcc == b"ANMF" and len(payload) >= 16:
            durations.append(payload[12] | (payload[13] << 8) | (payload[14] << 16))
        pos += 8 + size + (size & 1)
    return durations


# ============ 转换核心 ============

def _resize_if_needed(img: Image.Image, max_side: int) -> Image.Image:
    if max_side <= 0:
        return img
    w, h = img.size
    if max(w, h) <= max_side:
        return img
    scale = max_side / max(w, h)
    return img.resize((max(1, int(w * scale)), max(1, int(h * scale))),
                      Image.LANCZOS)


def _to_transparent_palette_frame(rgba: Image.Image, colors: int) -> Image.Image:
    """
    RGBA -> 带透明索引的 P 模式帧。

    【为什么要手工拼调色板】
    直接用 convert("P", palette=ADAPTIVE) 时，Pillow 有时不会分配 255 号索引，
    或者把 255 号索引占用成某个实际颜色，导致 transparency=255 失效
    （实测出现过 transparency=None，即透明通道完全丢失）。

    这里保证：量化只用 colors 个颜色，索引 255 一定留给透明。
    """
    alpha = rgba.getchannel("A")
    # 半透明也算透明，避免边缘发黑
    mask = Image.eval(alpha, lambda a: 255 if a <= ALPHA_THRESHOLD else 0)

    rgb = rgba.convert("RGB")
    n = max(2, min(colors, 255))
    p = rgb.convert("P", palette=Image.ADAPTIVE, colors=n)

    # 把透明像素标到 255
    p.paste(255, mask)

    # 确保调色板长度覆盖到 255
    pal = p.getpalette()
    if pal is None:
        pal = []
    if len(pal) < 768:
        pal = pal + [0] * (768 - len(pal))
    p.putpalette(pal[:768])
    return p


def animated_to_gif(content: bytes, colors: int = 255,
                    max_frames: int = 0, max_side: int = 0) -> bytes:
    """
    动态图 -> GIF，带透明掩模防止黑边。保留原始帧延时。

    手法：
      1. 从 ANMF chunk 解析真实帧延时（Pillow 读不到，会导致动画速度失真）
      2. 提取 alpha 做掩模，半透明也算透明，避免边缘发黑
      3. 自适应量化到 colors 色，索引 255 一定留给透明
      4. disposal=2 防止帧间残影
    """
    img = Image.open(io.BytesIO(content))
    total = getattr(img, "n_frames", 1)

    # 真实帧延时：优先用自己解析的结果，失败才退回 Pillow
    src_durations = parse_webp_durations(content)
    if len(src_durations) != total:
        src_durations = []
        for i in range(total):
            img.seek(i)
            src_durations.append(img.info.get("duration") or 100)

    # 抽帧：帧数过多时均匀取样，并累积时长保持动画节奏
    if max_frames > 0 and total > max_frames:
        step = total / max_frames
        indices = [int(i * step) for i in range(max_frames)]
    else:
        indices = list(range(total))

    frames, durations = [], []
    for k, idx in enumerate(indices):
        img.seek(idx)
        frame = img.convert("RGBA")
        if max_side > 0:
            frame = _resize_if_needed(frame, max_side)
        frames.append(_to_transparent_palette_frame(frame, colors))

        # 抽帧时把被跳过帧的时长累加到当前帧
        if max_frames > 0 and total > max_frames:
            nxt = indices[k + 1] if k + 1 < len(indices) else total
            dur = sum(src_durations[idx:nxt])
        else:
            dur = src_durations[idx]
        # GIF 最小 20ms，最大 1000ms（浏览器限制）
        durations.append(int(min(1000, max(20, dur))))

    if not frames:
        raise ValueError("没有可用帧")

    out = io.BytesIO()
    frames[0].save(
        out, format="GIF", save_all=True, append_images=frames[1:],
        duration=durations, loop=0, transparency=255,
        disposal=2, optimize=True,
    )
    return out.getvalue()


def static_to_png(content: bytes, max_side: int = 0) -> bytes:
    """静态图 -> PNG，保留透明通道"""
    with Image.open(io.BytesIO(content)) as img:
        img.load()
        if img.mode not in ("RGB", "RGBA", "L"):
            img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
        if max_side > 0:
            img = _resize_if_needed(img, max_side)
        out = io.BytesIO()
        img.save(out, format="PNG", optimize=True, compress_level=9)
        return out.getvalue()


def static_to_lossless_webp(content: bytes, max_side: int = 0) -> bytes:
    """
    静态图 -> WebP 无损。

    【为什么默认用 WebP 而不是 PNG】
    实测同一批表情：44 个静态图转 PNG 共 15.1MB，其中单张最大 2MB。
    这些图多是照片类内容（原图就是 WebP 有损压缩的），PNG 无损重编码
    会把体积放大 5-20 倍，纯属浪费。
    WebP 无损重编码通常只有 PNG 的 1/3 体积，且微信完全支持静态 WebP。
    """
    with Image.open(io.BytesIO(content)) as img:
        img.load()
        if max_side > 0:
            img = _resize_if_needed(img, max_side)
        out = io.BytesIO()
        img.save(out, format="WEBP", lossless=True, quality=100, method=4)
        return out.getvalue()


def static_to_webp(content: bytes) -> bytes:
    """原样保留（已经是 webp）"""
    return content


def _pick_static_output(content: bytes, cfg: dict) -> tuple[bytes, str]:
    """静态图按配置选择输出格式。行为完全跟随配置，不做自动替换。"""
    mode = cfg["static_format"]
    max_side = cfg["max_side"]

    if mode == "webp":
        return static_to_lossless_webp(content, max_side), "webp"

    if mode == "png":
        return static_to_png(content, max_side), "png"

    # original：保持原格式
    fmt = sniff(content)
    return content, (fmt if fmt != "unknown" else "bin")


def _ensure_under_limit(data: bytes, kind: str, limit_mb: float,
                        content: bytes, cfg: dict) -> tuple[bytes, str]:
    """
    体积超限时的降级策略：逐步降低画质/尺寸，直到落进上限。
    返回 (新内容, 说明)
    """
    if limit_mb <= 0:
        return data, ""
    limit = int(limit_mb * 1024 * 1024)
    if len(data) <= limit:
        return data, ""

    note = ""
    # 策略 1：缩小尺寸
    for side in (1024, 768, 512, 384, 256, 160, 96):
        try:
            if kind == "gif":
                new = animated_to_gif(content, colors=min(cfg["colors"], 128),
                                      max_frames=cfg["max_frames"], max_side=side)
            else:
                # 静态图优先试 WebP 无损（体积更小），再试 PNG
                try:
                    new = static_to_lossless_webp(content, max_side=side)
                except Exception:
                    new = static_to_png(content, max_side=side)
            if len(new) <= limit:
                return new, f"已缩放至 {side}px 以符合体积上限"
        except Exception:
            continue

    # 策略 2：极限压缩再试
    try:
        if kind == "gif":
            new = animated_to_gif(content, colors=64, max_frames=40, max_side=160)
            if len(new) <= limit:
                return new, "已降帧降色至 160px/64色 以符合体积上限"
    except Exception:
        pass

    return data, note or "无法压到上限内，保留原样"


# ============ 下载 ============

def download(url: str, timeout: int, retries: int) -> bytes:
    last = None
    for attempt in range(retries + 1):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            if r.status_code == 200:
                return r.content
            last = f"HTTP {r.status_code}"
            if r.status_code in (403, 404):
                break   # 签名失效或不存在，重试没意义
        except Exception as e:
            last = f"{type(e).__name__}: {e}"
        if attempt < retries:
            time.sleep(0.5 * (attempt + 1))
    raise RuntimeError(last or "下载失败")


# ============ 单任务处理 ============

def process(task: Task, cfg: dict, out_dir: Path) -> Task:
    t0 = time.time()
    try:
        raw = download(task.url, cfg["timeout"], cfg["retries"])
        task.src_bytes = len(raw)

        if len(raw) < 100:
            task.status = "fail"
            task.error = "内容为空"
            return task

        fmt = sniff(raw)
        if fmt == "unknown":
            task.status = "fail"
            task.error = "无法识别的图片格式"
            return task

        frames = frame_count(raw)
        task.frames = frames
        is_anim = frames > 1

        # ---- 按实测规律决定输出格式 ----
        if is_anim:
            if cfg["format"] == "webp":
                data, ext = raw, "webp"
            elif cfg["format"] == "both":
                gif = animated_to_gif(raw, cfg["colors"], cfg["max_frames"],
                                      cfg["max_side"])
                gif, _ = _ensure_under_limit(gif, "gif", cfg["max_mb"], raw, cfg)
                _write(out_dir / f"emoji_{task.index:04d}.webp", raw)
                data, ext = gif, "gif"
            else:  # gif（默认）
                data = animated_to_gif(raw, cfg["colors"], cfg["max_frames"],
                                       cfg["max_side"])
                data, _ = _ensure_under_limit(data, "gif", cfg["max_mb"], raw, cfg)
                ext = "gif"
        else:
            data, ext = _pick_static_output(raw, cfg)
            data, _ = _ensure_under_limit(data, "static", cfg["max_mb"], raw, cfg)

        name = f"emoji_{task.index:04d}.{ext}"
        _write(out_dir / name, data)
        task.out_name = name
        task.out_bytes = len(data)
        task.status = "ok"
    except Exception as e:
        task.status = "fail"
        task.error = f"{type(e).__name__}: {e}"
    finally:
        task.elapsed = time.time() - t0
    return task


def _write(path: Path, data: bytes):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(path)


# ============ 清单读写 ============

def load_manifest(path: Path) -> list[Task]:
    data = json.loads(path.read_text(encoding="utf-8"))
    items = data.get("items") or []
    tasks = []
    seen = set()
    for i, it in enumerate(items, 1):
        url = it.get("url", "")
        eid = it.get("id") or url
        if not url or eid in seen:
            continue
        seen.add(eid)
        tasks.append(Task(
            index=len(tasks) + 1,
            id=eid,
            url=url,
            animated=bool(it.get("animated")),
            declared_w=int(it.get("w") or 0),
            declared_h=int(it.get("h") or 0),
        ))
    return tasks


# ============ 主流程 ============

def human(n: float) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.1f}{unit}"
        n /= 1024
    return f"{n:.1f}TB"


def _setup_console() -> None:
    """
    让 Windows 控制台能正确显示中文和 ✓/✗ 等符号。

    【为什么必须做】
    Windows 控制台默认活动代码页是 GBK(936)。打包成 exe 后，
    print 一个 GBK 里没有的字符（如 ✓）会直接抛 UnicodeEncodeError
    导致程序崩溃 —— 实测确实如此。

    解决：把 stdout/stderr 重新配置成 UTF-8 且 errors=replace，
    这样即使终端不支持某字符也只是显示成 ?，不会崩。
    """
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        # 老版本 Python 没有 reconfigure，退回包装层
        try:
            sys.stdout = io.TextIOWrapper(
                sys.stdout.buffer, encoding="utf-8", errors="replace",
                line_buffering=True)
            sys.stderr = io.TextIOWrapper(
                sys.stderr.buffer, encoding="utf-8", errors="replace",
                line_buffering=True)
        except Exception:
            pass

    # Windows 下顺带把控制台代码页切成 UTF-8，中文才不会乱码
    if os.name == "nt":
        try:
            import ctypes
            ctypes.windll.kernel32.SetConsoleOutputCP(65001)
            ctypes.windll.kernel32.SetConsoleCP(65001)
        except Exception:
            pass


def _base_dir() -> Path:
    """
    程序所在目录。

    【为什么不用当前工作目录】
    把 JSON 拖到 exe 上运行时，Windows 传给程序的「当前目录」可能是
    C:\\Windows\\System32 或任意位置，用相对路径会找不到文件、也会把
    output/ 建到莫名其妙的地方。
    用 exe（或脚本）自身所在目录最稳。
    """
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


def _pause_if_dragged():
    """
    双击/拖放运行时，程序结束窗口会立刻关闭，用户看不到结果。
    这里在交互式终端里停一下等回车。

    判断依据：frozen（打包版）或 标准输入是终端 → 认为用户在看窗口。
    设置环境变量 DYE_NOPAUSE=1 可跳过（便于脚本化调用/测试）。
    """
    if os.environ.get("DYE_NOPAUSE") == "1":
        return
    interactive = getattr(sys, "frozen", False)
    try:
        if not interactive and sys.stdin is not None:
            interactive = sys.stdin.isatty()
    except Exception:
        pass
    if not interactive:
        return
    try:
        input("\n按回车键退出...")
    except (EOFError, KeyboardInterrupt):
        pass


def main():
    base = _base_dir()

    ap = argparse.ArgumentParser(
        description="抖音表情导出 · 转换器",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
用法:
  直接把脚本导出的 emoji-list.json 拖到本程序（exe）上即可。
  或命令行指定：convert.exe D:\\path\\emoji-list.json

示例:
  convert.exe emoji-list.json         指定清单
  convert.exe --static-format webp    静态图改用WebP（省约30%体积，无损）
  convert.exe --format webp           动图也保留原格式（体积最小）
  convert.exe --max-side 240          最大边长240px（明显减小GIF体积）
  convert.exe --workers 8             8线程并发
        """,
    )
    # 位置参数：支持拖放
    ap.add_argument("manifest", nargs="?", default=None,
                    help="清单 JSON 路径（可直接把文件拖到程序上）")
    ap.add_argument("-i", "--input", default=None,
                    help="清单 JSON 路径（默认 input/emoji-list.json）")
    ap.add_argument("-o", "--output", default=None, help="输出目录")
    ap.add_argument("--format", choices=["gif", "webp", "both"],
                    default=DEFAULTS["format"], help="动图输出格式")
    ap.add_argument("--static-format", choices=["png", "webp", "original"],
                    default=DEFAULTS["static_format"],
                    help="静态图输出格式（默认 png，兼容性最好；webp 可省约30%%体积）")
    ap.add_argument("--max-mb", type=float, default=DEFAULTS["max_mb"],
                    help="单文件体积上限 MB（0=不限）")
    ap.add_argument("--max-frames", type=int, default=DEFAULTS["max_frames"],
                    help="动图最大帧数（0=不限）")
    ap.add_argument("--max-side", type=int, default=DEFAULTS["max_side"],
                    help="最大边长像素（0=不限）")
    ap.add_argument("--colors", type=int, default=DEFAULTS["colors"],
                    help="GIF 颜色数（<=255）")
    ap.add_argument("--workers", type=int, default=DEFAULTS["workers"],
                    help="并发数")
    ap.add_argument("--clean", action="store_true", help="开始前清空输出目录")
    try:
        args = ap.parse_args()
    except SystemExit as e:
        # 拖放时参数错误也要留住窗口，否则用户看不到报错
        if getattr(sys, "frozen", False) and e.code not in (0, None):
            _pause_if_dragged()
        raise

    cfg = {
        "format": args.format,
        "static_format": args.static_format,
        "max_mb": args.max_mb,
        "max_frames": args.max_frames,
        "max_side": args.max_side,
        "colors": min(args.colors, 255),
        "workers": max(1, args.workers),
        "timeout": DEFAULTS["timeout"],
        "retries": DEFAULTS["retries"],
    }

    # ---- 解析路径 ----
    # 优先级：拖放的位置参数 > -i 参数 > 默认 input/emoji-list.json
    raw_input = args.manifest or args.input or str(Path("input") / "emoji-list.json")
    in_path = Path(raw_input)
    if not in_path.is_absolute():
        in_path = base / in_path

    if args.output:
        out_dir = Path(args.output)
        if not out_dir.is_absolute():
            out_dir = base / out_dir
    else:
        out_dir = None   # 校验完输入后再决定
        
    print("=" * 66)
    print("  抖音表情导出 · 转换器")
    print("=" * 66)

    # 拖放了一个非 JSON 文件？给个明确提示
    if in_path.suffix.lower() != ".json":
        print(f"\n  [错误] 这不是 .json 文件：{in_path.name}")
        print()
        print("  请拖入油猴脚本导出的清单文件（文件名形如 emoji-list-1800000000000.json）。")
        return 1

    if not in_path.exists():
        print(f"\n  [错误] 找不到清单文件：{in_path}")
        print()
        print("  正确用法：把油猴脚本导出的 emoji-list-*.json 直接拖到本程序上。")
        print("  也可以放进 input/ 目录后双击运行。")
        return 1

    # 未指定输出目录时：在程序所在目录下新建一个带时间戳的文件夹
    if out_dir is None:
        stem = re.sub(r"[-_]\d{10,}$", "", in_path.stem) or "output"
        stamp = datetime.now().strftime("%m%d-%H%M")
        out_dir = base / f"{stem}_{stamp}"

    try:
        tasks = load_manifest(in_path)
    except json.JSONDecodeError as e:
        print(f"\n  [错误] 清单文件不是合法的 JSON：{e}")
        print("         文件可能损坏，请重新用脚本导出。")
        return 1
    except Exception as e:
        print(f"\n  [错误] 读取清单失败：{type(e).__name__}: {e}")
        return 1

    if not tasks:
        print(f"\n  [错误] 清单里没有任何表情：{in_path.name}")
        print("         可能是抓取时没抓到内容，请重新抓取。")
        return 1

    if args.clean and out_dir.exists():
        shutil.rmtree(out_dir)
        print(f"  已清空输出目录 {out_dir}")

    out_dir.mkdir(parents=True, exist_ok=True)

    anim_n = sum(1 for t in tasks if t.animated)
    print(f"  清单文件 : {in_path}")
    print(f"  表情数量 : {len(tasks)}（动图 {anim_n}，静态 {len(tasks)-anim_n}）")
    print(f"  输出目录 : {out_dir.resolve()}")
    print(f"  动图格式 : {cfg['format']}    静态格式: {cfg['static_format']}")
    limit_desc = f"{cfg['max_mb']}MB" if cfg["max_mb"] > 0 else "不限"
    print(f"  体积上限 : {limit_desc}    最大边长: "
          f"{cfg['max_side'] or '不限'}    并发: {cfg['workers']}")
    print()
    print("-" * 66)

    stats = Stats()
    done = 0

    with ThreadPoolExecutor(max_workers=cfg["workers"]) as pool:
        futures = {pool.submit(process, t, cfg, out_dir): t for t in tasks}
        for fut in as_completed(futures):
            task = fut.result()
            done += 1
            stats.total_src += task.src_bytes
            if task.status == "ok":
                stats.ok += 1
                stats.total_out += task.out_bytes
                mark = "✓"
                info = (f"{task.frames}帧" if task.frames > 1 else "静态")
                print(f"  [{done:3}/{len(tasks)}] {mark} {task.out_name:20} "
                      f"{human(task.src_bytes):>8} -> {human(task.out_bytes):>8}  "
                      f"{info:6} {task.elapsed:.1f}s")
            else:
                stats.fail += 1
                print(f"  [{done:3}/{len(tasks)}] ✗ #{task.index:04d} "
                      f"{task.error[:50]}")

    print("-" * 66)
    print()
    print("=" * 66)
    print("  完成")
    print("=" * 66)
    print(f"  成功 {stats.ok} 个，失败 {stats.fail} 个")
    print(f"  原始总计 {human(stats.total_src)} -> 输出总计 {human(stats.total_out)}")
    print(f"  耗时 {stats.elapsed:.1f} 秒")
    print(f"  文件在：{out_dir.resolve()}")
    print()

    # 写一份结果报告，便于排查
    report = out_dir / "_report.txt"
    try:
        lines = []
        for t in sorted(tasks, key=lambda x: x.index):
            if t.status == "ok":
                lines.append(f"{t.out_name}\t{human(t.src_bytes)}\t"
                             f"{human(t.out_bytes)}\t{t.frames}帧\t{t.url}")
            else:
                lines.append(f"FAIL #{t.index}\t{t.error}\t{t.url}")
        report.write_text("\n".join(lines), encoding="utf-8")
    except Exception:
        pass

    # 成功时也打开输出目录，拖放场景下用户不用自己找
    try:
        if getattr(sys, "frozen", False) and stats.ok > 0:
            os.startfile(str(out_dir))  # noqa: S606  (Windows only)
    except Exception:
        pass

    return 0 if stats.fail == 0 else 2


if __name__ == "__main__":
    _setup_console()
    _code = 1
    try:
        _code = main()
    except KeyboardInterrupt:
        print("\n已取消。")
        _code = 130
    except Exception:
        # 兜底：打印完整异常，避免窗口一闪而过什么都看不到
        import traceback
        print("\n[程序异常]")
        traceback.print_exc()
        _code = 1
    finally:
        _pause_if_dragged()
    sys.exit(_code)
