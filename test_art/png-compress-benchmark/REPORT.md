# PNG 压缩基准（单图）

- 输入: `public\assets\battle-floor-bgs\scholomance.png`
- 原始大小: **3.17 MiB**
- 像素: **1080×1920**
- 生成目录: `test_art\png-compress-benchmark`

| 方案 | 输出文件 | 大小 | 相对原图 | 备注 |
|------|----------|------|----------|------|
| original | `public\assets\battle-floor-bgs\scholomance.png` | 3.17 MiB | — | |
| sharp PNG lossless | `test_art\png-compress-benchmark\sharp-lossless-c9-e10.png` | 1.79 MiB | 43.6% smaller | compressionLevel=9 effort=10 |
| sharp palette | `test_art\png-compress-benchmark\sharp-palette-q80-c256.png` | 483.5 KiB | 85.1% smaller | quality=80 colors=256 |
| sharp palette | `test_art\png-compress-benchmark\sharp-palette-q70-c256.png` | 409.9 KiB | 87.4% smaller | quality=70 colors=256 |
| sharp palette | `test_art\png-compress-benchmark\sharp-palette-q75-c128.png` | 405.2 KiB | 87.5% smaller | quality=75 colors=128 |
| pngquant | `test_art\png-compress-benchmark\pngquant-quality-80_95.png` | 746.2 KiB | 77.0% smaller | --quality=80-95 |
| pngquant | `test_art\png-compress-benchmark\pngquant-quality-70_85.png` | 467.0 KiB | 85.6% smaller | --quality=70-85 |
| oxipng on original | `test_art\png-compress-benchmark\oxipng-o4-strip-on-original.png` | 2.02 MiB | 36.2% smaller | -o4 --strip safe |
| oxipng after sharp lossless | `test_art\png-compress-benchmark\oxipng-o4-strip-after-sharp-lossless.png` | 1.30 MiB | 59.0% smaller | chain: sharp lossless → oxipng |
| WebP q=80 (reference only) | `test_art\png-compress-benchmark\reference-webp-q80.webp` | 107.0 KiB | 96.7% smaller | 换格式，仅对比体积 |

说明：sharp palette / pngquant 为「颜色量化类」有损观感；oxipng 为无损像素。

重跑脚本若需 **pngquant** 行：在项目根执行 `npm i -D pngquant-bin`（或本机安装 pngquant 并改脚本路径）。
