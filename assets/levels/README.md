# 关卡图片目录

把每一关要用的图片放进这个文件夹，然后在 `js/levels.js` 里对应关卡填好 `src` 与 `caption`。

## 建议命名（已预置在占位框里）

| 关卡 | 主图 | 剧情插图 | 结果配图 |
| --- | --- | --- | --- |
| 1 发现关联 | `l1-hero.png` | `l1-story.png` | `l1-result.png` |
| 2 控制混杂 | `l2-hero.png` | `l2-story.png` | `l2-result.png` |
| 3 剂量-反应 | `l3-hero.png` | `l3-story.png` | `l3-result.png` |
| 4 干预验证 | `l4-hero.png` | `l4-story.png` | `l4-result.png` |
| 5 机制补充 | `l5-hero.png` | `l5-story.png` | `l5-result.png` |
| 6 主动设计动物实验 | `l6-hero.png` | `l6-story.png` | `l6-result.png` |

扩展名不限于 `.png`，`.jpg / .webp / .svg` 都可以，改一下 `src` 里的文件名即可。

## 如何填写

打开 `js/levels.js`，找到对应关卡里的 `images` 段：

```js
images: {
  hero:   { src: '', caption: '', slot: '关卡主图', file: 'assets/levels/l1-hero.png' },
  story:  { src: '', caption: '', slot: '剧情插图', file: 'assets/levels/l1-story.png' },
  result: { src: '', caption: '', slot: '结果配图', file: 'assets/levels/l1-result.png' }
},
```

把 `src` 填成图片路径、`caption` 填成图注即可：

```js
hero: { src: 'assets/levels/l1-hero.png', caption: '1970 年代，临床记录里反复出现的模式', slot: '关卡主图', file: '' },
```

`src` 一填上，虚线占位框就会自动变成真实图片。三个槽位的位置：

- `hero`：关卡标题下方、剧情正文之前
- `story`：剧情正文之后、任务说明之前
- `result`：研究结果卡片内部、标题上方

图片不必先做裁剪——样式会自动按容器宽度缩放。
