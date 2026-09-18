# assets/character/ — 角色部件放置说明

把角色的透明 PNG 放进这个文件夹，页面**刷新即生效**，不需要改任何代码里的坐标。

所有部件都用**同一张画布 1000 × 1400 px**、透明底、导出时不裁剪不移动。
缺哪一张，那一层就退回几何占位图形，页面照样能跑。

完整的拆分要求、文件清单与画法要点见项目根目录的 **`角色部件清单.md`**；
机读版清单见同目录的 **`manifest.json`**。

## 文件命名（37 张）

| 组 | 文件 |
| --- | --- |
| 脸打底（1） | `face-base.png` |
| 五官·睁眼（6） | `face-{idle,warn-cred,warn-cost,warn-both,pass,fail}-open.png` |
| 五官·眨眼（6） | `face-{idle,warn-cred,warn-cost,warn-both,pass,fail}-blink.png` |
| 前发三条（3） | `hair-front-1.png` `hair-front-2.png` `hair-front-3.png`（左→右） |
| 后发（1） | `hair-back.png` |
| 身体（1） | `body.png` |
| 大臂（2） | `arm-left-upper.png` `arm-right-upper.png` |
| 小臂＋手（12） | `arm-{left,right}-fore-{idle,warn-cred,warn-cost,warn-both,pass,fail}.png` |
| 情绪气泡（5） | `bubble-{warn-cred,warn-cost,warn-both,pass,fail}.png`（平静没有） |

## 三条硬性要求

1. **同一画布**：1000×1400，导出时不要裁剪、不要移动。
2. **五官只画五官**：`face-*-open/blink.png` 里不要画脸型与肤色，那是 `face-base.png` 的事；12 张五官的位置必须完全一致。
3. **气泡不遮脸**：`bubble-*.png` 画在画布左上（约 `x 6%–28%`、`y 2%–18%`），绝不能覆盖脸部（`x 29%–71%`）；图里不要写字。

## 关于「分部件动作」

头发摆动、手臂起伏、呼吸等运动**尚未实现**，等图片到位后再按实际画风补上。
每个图层的旋转轴心已在 `js/character.js` 的 `ANCHORS` 中预留。
