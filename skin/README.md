# Muro 影幕 · 皮肤资产

这是一个标准的 DSH 皮肤目录（清单 v2），可以直接使用：

```sh
cp -R skin ~/.dsh/skins/muro
```

然后在皮肤中心（设置 → Web 扩展 → 皮肤）选中「Muro 影幕」。

底图由插件的「Muro 影幕」设置分区管理；不装插件时，手动换图只需替换
`assets/backdrop-dark.jpg` / `assets/backdrop-light.jpg`，并保持 `skin.json` 里
`contributes.backgroundMedia.<theme>.src` 指向对应文件。

安装、原理与许可见上一级 [README](../README.md)。
