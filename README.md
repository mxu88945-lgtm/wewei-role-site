
## 感知互动来源
感知互动功能参考并拷贝了 [pwa-sense-bridge](https://github.com/0xblewalker/pwa-sense-bridge) 的 `src/sense-bridge.js` 与 `src/math.js`，保留原作者归属，按 **AGPL-3.0-only** 授权。录音与动作数据只在本机前端分析，不上传、不保存。


## 2026-11-23｜🌙 锁屏也不断
惟境主聊天新增可选的云端中继：设置 → 应用设置 →「🌙 锁屏也不断」，开关默认关闭。中继地址和 RELAY_KEY 只存当前设备 `weijing-local.relay`，不进入备份、同步或诊断；独立人格窗口、小手机、群聊和剧场仍直连，中继失败会自动回退。
