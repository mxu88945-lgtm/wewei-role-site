# 交接日记（2026-10-17，Hark → 其他 AI，11/1 后交回）

## 两个仓库
- 惟境：mxu88945-lgtm/wewei-role-site（React+Vite+TS）。当前 v136，提交 787b98d。
- 顾祁砚：mxu88945-lgtm/fantastic-guacamole（单 index.html + src 模块）。当前 sw v206，提交 03838a9。

## 通用规矩
- 先 `git pull --ff-only`（她自己也会推）。
- 惟境：`npm run lint && npm test && npm run build` 全过才推 main。每次发版同时改三处：public/sw.js 的 CACHE_NAME、src/main.tsx 的 SERVICE_WORKER_RELEASE、App.tsx「应用更新」卡里的「当前版本：vNN」。不要提交 dist/。
- 顾祁砚：改 sw.js 版本号时，scripts/*-regression.mjs 里同一字符串要一起改；`npm test`（32 个文件）。`npm run build` 的 prebuild 会把锁屏/天气代码就地注入 index.html，不要把注入结果提交。index.html 里不要写 `function wxEnsureWidget` 这个名字（注入脚本靠它判断是否已注入；之前用 `wx-widget` 当标记，被主题 CSS 误触发，导致天气卡消失）。
- 她用 iPhone 主屏 PWA 测试：全屏弹层要处理键盘高度；按钮用 pointerup 防止要点两次；不要给每条消息加 backdrop-filter（会卡）。用 Python 改文件时，先读完再用 `with open(p,'w')` 写回，否则会把文件清空。
- 她说"没生效"时，先让她去 设置 → 应用更新 → 强制刷新到最新版，确认版本号。

## 今天做了什么
- 顾祁砚：新主题「暖光琥珀」(amberglow)，气泡改成更透的"液态玻璃"近似效果（底色约 12–20%，blur 3px，会跟随设置里的气泡透明度滑杆）。iOS 原生那种液态玻璃网页做不到，只能近似。
- 顾祁砚：修好天气/时间卡消失的问题（v206）。
- 惟境 v133：待发送图片的缩略图可以点开看大图。
- 惟境 v134–v136：新增「人格窗口」。
  - 首页「✧ 人格窗口」，可以从角色库添加多个角色，各自独立，可切换。
  - 每个角色可以开多个窗口，同一角色的窗口共用长期记忆。
  - 回复用小说正文风格。
  - 文件：src/personaWindow*.ts、PersonaWindowPage.tsx、persona-window.css，数据存在 `weijing.personaWindows`（state v2，有 threads）。
  - 前世记忆：只读读取该角色在小手机和长剧情里的记忆，作为他亲身经历的过去，上限约 1 万字。小手机也会只读看到他在人格窗口里的记忆，群聊里只给他本人。
  - 右上角 ••• 抽屉里有：窗口列表、新开窗口、记忆页、前世记忆开关、每个人格单独的模型/渠道选择、管理人格。
  - 记忆页能看「前世记忆来源」和请求预览。

## 待她验证 / 下一步
- 虞山行在人格窗口里曾经说话像客服，还说自己"没收到人设"。推断原因：她用的中转站只保留第一条 system 消息。v136 已经把人设、前世记忆等合并成一条 system 消息，并在她最后一条消息前加了一条提醒；测试见 src/personaWindowWire.test.ts。需要她在**新开的窗口**里验证，旧窗口里客服腔的历史会干扰。
- 如果主聊天以后也出现同样问题，到 chatApi / buildChatPrompt 去合并多条 system 消息。
- 设定里提到"美化/格式要求/html/css"的世界书条目，会被人格窗口当作显示规则跳过。如果她觉得少了设定，查这里。
- 没有任何一项做过真机视觉验证。

## v250（2026-11-15）图记 / 发图防卡死 / 档案头字号
- 图片：真图只在发出那一轮（含重新生成）发给主模型；那一轮【本轮背景】里加一句请他写 `[图记:≤40字]`（src/imageMemo.ts，界面含流式由 sanitizeAssistantOutput 剥掉），图记存在 `ChatImage.memo`。之后的请求只带「【此前发过的图片：图记】」（无图记：「【此前发过的图片】」）。她回指旧图（那张图/刚才的图/照片/图里/之前发的，或说到某条图记里的连续 3 字）时，只把最近一张匹配的原图临时附进这一轮（最多 1 张）。续演/自动活跃/应用事件那轮不发图。历史按条数取，带图不挤历史。测试：src/imageMemo.test.ts。
- 防卡死：prepareChatImage 每张 20s 超时（报错文字直接显示）；persistentStore 打开 6s 超时+重开一次，写入 15s 超时，失败不堵同键后续保存（src/persistentStoreTimeout.test.ts）。
- 字号：runtime-enhancements.css 的 `:where(h3, strong, b)` 15px 规则豁免整个 `.archive-heading` 与布丁胶囊、以及锁屏倒计时/状态时钟/红包金额/游戏图标/统计数字/未读角标等展示型大字；手机消息/学院/唱片名字改 calc(23px × 界面字号)。测试在 src/fontControls.test.ts。
- 花费（只报告未改）：人格窗口/长剧情历史按「记忆长度」条数（默认 47）不设 token 上限，长回复时历史是顾祁砚（8200 token 预算）的 1.5–2.4 倍；默认 maxTokens 8000（顾祁砚 2048）。
