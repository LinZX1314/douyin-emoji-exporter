"""构建最终单文件油猴脚本。

流程：
  1. 读 gifenc 压缩版（10.8KB，IIFE 格式）
  2. 读主脚本模板
  3. 把 gifenc 内联进模板的占位位置
  4. 输出单文件 douyin-emoji-exporter.user.js

用法（在本文件所在目录执行）：
  python _build.py
"""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
LIB = HERE / "_libs" / "gifenc.min.js"
TPL = HERE / "_template.js"
OUT = HERE / "douyin-emoji-exporter.user.js"


def main():
    if not LIB.exists():
        raise SystemExit(f"缺少依赖文件: {LIB}")
    if not TPL.exists():
        raise SystemExit(f"缺少模板文件: {TPL}")

    lib = LIB.read_text(encoding="utf-8")
    # 去掉 sourceMappingURL 注释（内联后无意义，且会触发 404）
    lib = re.sub(r"//# sourceMappingURL=.*$", "", lib, flags=re.M)

    tpl = TPL.read_text(encoding="utf-8")
    if "__GIFENC__" not in tpl:
        raise SystemExit("模板缺少 __GIFENC__ 占位符")

    out = tpl.replace("__GIFENC__", lib)
    OUT.write_text(out, encoding="utf-8")

    # 统计
    lines = out.count("\n") + 1
    size = OUT.stat().st_size
    print(f"已生成 {OUT}")
    print(f"  总行数 : {lines}")
    print(f"  总大小 : {size:,} 字节 ({size/1024:.1f} KB)")
    print(f"  其中 gifenc: {len(lib):,} 字节")


if __name__ == "__main__":
    main()
