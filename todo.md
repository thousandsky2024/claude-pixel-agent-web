# Claude Dungeon - TODO

## Phase 1: 地下城像素艺术资源生成
- [x] 生成地下城背景地图（固定布局：Boss房、商店、牧师区、休息区）
- [x] 生成战士英雄精灵（idle、fighting、casting、resting、shopping 状态）
- [x] 生成法师英雄精灵（idle、fighting、casting、resting、shopping 状态）
- [x] 生成牧师英雄精灵（idle、fighting、casting、resting、shopping 状态）
- [x] 生成 Boss 精灵（不同类型：代码Boss、文档Boss、搜索Boss）
- [x] 生成牧师 NPC 精灵（洗礼/治疗动画）
- [x] 生成商店 NPC 精灵
- [x] 生成技能图标（6种技能）
- [x] 生成 UI 面板背景（像素风格）

## Phase 2: 后端 API 重设计
- [x] 更新数据库 Schema（heroes、skills、dungeon_state 表）
- [x] 创建英雄管理 API（CRUD、职业分配）
- [x] 创建技能管理 API（全局技能、项目级技能）
- [x] 创建地下城状态 API（房间状态、英雄位置）
- [x] 本地 JSON 持久化（技能配置保存到文件）

## Phase 3: 前端地下城 UI 重写
- [x] 设计固定地下城地图布局（Canvas）
- [x] 实现英雄精灵渲染和动画
- [x] 实现 Boss 战场景（工具使用时触发）
- [x] 实现牧师洗礼场景（休息时触发）
- [x] 实现商店场景（Planning 时触发）
- [x] 实现英雄状态面板（职业、技能、当前任务）
- [x] 实现技能商店 UI
- [x] 实现地下城日志面板
- [x] 实现 DEMO/LIVE 切换按钮

## Phase 4: Claude Code 实时监听
- [x] 修复文件监听（双重策略：fs.watch + 轮询）
- [x] 完善 JSONL 转录解析（工具状态、Sub-Agent）
- [x] WebSocket 实时推送到前端
- [x] 职业自动分配（基于工具使用模式）
- [x] Sub-Agent 可视化（子英雄）

## Phase 5: 技能系统
- [x] 技能定义（6种技能、视觉效果）
- [x] 全局技能配置（~/.claude/skills.json）
- [x] 项目级技能配置（.claude/skills.json）
- [x] 技能 UI（商店购买、英雄装备）
- [x] 技能视觉效果（使用时动画）

## Phase 6: 端到端测试
- [x] 启动 Claude Code Agent 测试（模拟 JSONL 数据）
- [x] 验证新 Agent 自动出现（新英雄蹦出）—— 测试通过，每个 JSONL 文件独立创建英雄
- [x] 验证工具使用时的战斗动画 —— 测试通过
- [x] 验证休息状态的牧师洗礼动画 —— 测试通过
- [x] 验证 Planning 时的商店场景 —— 测试通过
- [x] 验证技能系统功能 —— 测试通过
- [x] 验证 Sub-Agent 可视化 —— 已实现

## Phase 7: 修复和交付
- [x] 修复每个 JSONL 文件独立对应英雄的 bug
- [x] 修复 Vite HMR WebSocket 配置
- [x] 添加 vitest 测试（9 tests passing）
- [x] 性能优化（Canvas 60fps 游戏循环）
- [x] 最终检查点保存

## Phase 8: 真实 Claude Code 集成重构
- [x] 修复转录监听路径：改为 ~/.claude/projects/**/*.jsonl（按项目组织）
- [x] 从文件路径解析项目名称（-home-user-myproject → /home/user/myproject）
- [x] 后端 Skills API：读取 ~/.claude/skills/ 全局技能列表
- [x] 后端 Skills API：读取项目级 .claude/skills/ 技能列表
- [x] 后端 Skills API：创建新技能（写入 SKILL.md）
- [x] 后端 Skills API：编辑技能内容
- [x] 后端 Skills API：删除技能
- [x] 后端配置 API：读写 ~/.claude-dungeon/config.json
- [x] 配置页面：设置 Claude Code 根目录路径
- [x] 配置页面：连接状态诊断（是否检测到 ~/.claude/projects/）
- [x] Skills 管理页面：全局技能列表 + 创建/编辑/删除
- [x] Skills 管理页面：项目级技能（按项目分组）
- [x] Skills 管理页面：SKILL.md 内容编辑器（含 frontmatter）
- [x] 英雄面板显示该 Agent 所在项目路径
- [x] 更新 vitest 测试覆盖新功能

## Phase 9: 本地 Bridge 脚本（方案 B）

- [x] 后端添加 Bridge API 端点（接收本地脚本推送的英雄数据）
- [x] 后端添加 API Key 认证保护 Bridge 端点
- [x] 开发本地 Bridge 脚本（Node.js，监听 ~/.claude/projects/ 并推送到云端）
- [x] Bridge 脚本支持 Skills/Agents 文件同步
- [x] 测试 Bridge 脚本端到端流程
- [x] 编写用户使用说明（README）

## Phase 10: 最终完善
- [x] 修复 CSS @import 顺序警告（移到 index.html）
- [x] 添加 ⚙️ Config 按钮和 ConfigPanel 组件
- [x] ConfigPanel 显示 Bridge API Key、快速启动命令、连接状态
- [x] 添加 demo-start/demo-stop WebSocket 消息处理
- [x] 18 个 vitest 测试全部通过（agents + auth + bridge）

## Phase 11: 核心逻辑修复
- [x] 英雄只在 Claude Code 活跃进程存在时出现（只处理 5 分钟内有修改的文件）
- [x] Claude Code 退出后英雄消失（10 分钟无活动后自动移除）
- [x] 修复地图黑屏问题（添加 crossOrigin="anonymous" 解决 CORS 问题）
- [x] 整合新素材包（已拉取并复制到 client/public/sprites）
- [x] 修复 bridge API key 不匹配问题（统一使用 bridge.ts 的 getOrCreateApiKey）
- [x] 修复 Skills 无法新增的问题（创建 ~/.claude/skills 目录）

## Phase 12: 前端视觉全面升级
- [x] 拉取新素材包并评估可用资源
- [x] 修复英雄退出检测：缩短超时到 2 分钟 + 15 秒进程检测
- [x] 整合新素材包到地图和英雄渲染（骨士精灵图 + 女巫商人 NPC + 火把/蜡烛装饰）
- [x] 全面提升前端视觉效果（平铺背景贴图、真实素材替换像素绘制）

## Phase 13: Another Metroidvania 素材包全面整合
- [x] 复制 Another Metroidvania Asset Pack 到 client/public/sprites/mv
- [x] 重写 DungeonMap.tsx：有走廊连接的完整地图布局（Library→Dungeon→Boss Arena，Dungeon→Shop→Tavern）
- [x] 整合 Lord Wizard Boss、Guardian 敌人、女巫 NPC、火把道具、天花板吊链
- [x] 18 个 vitest 测试全部通过

## Phase 14: 英雄行为系统全面重构
- [x] 研究 Claude Code 所有指令类型并设计动作映射
- [x] 英雄走路动画：BFS 逐格寻路 + 插值移动（房间之间沿走廊行走）
- [x] 出生动画：所有英雄在 Holy Sanctuary 出生（传送门/光效）
- [x] 消失动画：英雄回到 Holy Sanctuary 后消失（传送门/光效）
- [x] 房间逻辑修正：planning → Witch Shop、bash/write → Boss Arena、idle → Rest Area
- [x] Claude 指令→动作映射完善
- [ ] 找到适合的开源发布平台

## Phase 15: 全面视觉优化
- [x] 重新设计地图布局：平衡各房间大小，扩大走廊宽度
- [x] 增强房间装饰：更多道具、更好的光效
- [x] 英雄放大（4x scale）并改善名字标签
- [x] 修复 "DUNGEON AWAITS" 覆盖位置（移至右下角）
- [x] 优化左侧栏英雄列表（加宽、HP条、等级标签）
- [x] 优化头部统计显示（彩色标签）

## Phase 16: 大城堡 Tilemap 重做
- [x] 用 AI 生成俯视角像素艺术地下城背景图（5区域无缝拼接）
- [x] 设计新的布局（5区域紧密拼接，无黑色间隙，共享墙壁）
- [x] 实现 AI 背景图渲染（drawImage 铺满画布，动态效果叠加）
- [x] 实现 BFS 逐格寻路和英雄走路动画
- [x] 实现骑士生命周期（出生→任务→战斗→休息→消失，按action动态切换）
- [x] 画布自适应浏览器窗口
- [x] 集成 NPC（Lord Wizard、Guardian、Witch）到新地图
- [x] 背景填满，无黑色间隙
- [x] 测试和修复

## Phase 17: 位置与交互优化
- [x] 确认英雄出生位置在 Spawn 区域正中心（移除随机偏移，精确在 ROOM_CENTERS.spawn）
- [x] 确认 Boss（Lord Wizard）在 Boss Arena 正中心（修复 TS*8 偏移，改用 BOSS_SCREEN_X 常量）
- [x] 确认 Guardian NPC 在 Dungeon Main 正中心（移除 sin 随机摇摆，改用 GUARDIAN_SCREEN_X 常量）
- [x] 确认 Witch NPC 在 Witch Shop 正中心（修复 ph*0.55 偏移，改用 WITCH_SCREEN_X 常量）
- [x] 英雄面向 NPC（攻击 Boss 时面向 Boss，购买时面向 Witch，对话时面向 Guardian）
- [x] 攻击动画：英雄走到 Boss 左前方（col-5），面向右方（朝向 Boss）进行战斗
- [x] 购买动画：英雄走到 Witch 左前方（col-3），面向右方（朝向 Witch）进行交互
- [x] 对话动画：英雄走到 Guardian 附近，动态面向 Guardian
- [x] 服务端 ROOM_POSITIONS 更新为与新地图布局匹配的正确坐标
- [x] Demo 英雄增加 4 个（含 shop/rest 状态），展示所有区域
- [ ] 找到适合的开源发布平台

## Phase 18: 墙壁碰撞修复
- [x] 测量背景图实际墙壁像素位置，对比当前 WALKABLE 格子（添加 ?debug=1 可视化调试模式）
- [x] 修复走廊格子坐标与背景图墙壁对齐（垂直走廊之前是红色不可走，现已修复）
- [x] 修复走廊宽度（每条走廊 4 格宽，对准拱门位置）
- [x] 验证 Boss Arena 英雄不进墙（英雄在 Boss 左侧 5 格攻击）
- [x] 验证走廊中英雄不进墙（BFS 路径通过走廊格子）
- [x] 更新 README.md，添加游戏截图和 NPC 交互说明表格

## Phase 19: 细节修复
- [x] Guardian 改回 idle 动画（用 if(false) 屏蔽攻击动画，只有 Boss 战才攻击）
- [x] 修复 Boss 在法阵正中心（用 (c0+c1+1)/2*TS 公式，修复半格偏差）
- [x] Witch 的英雄目标位置改为 Witch 右侧 3 格（col=33，在可走区域 22-37 内）
- [x] 英雄面向 Witch 时面向左（facingLeft=true，因为 Witch 在英雄左侧）

## Phase 20: Boss位置和墙壁修复
- [x] 测量背景图法阵圆圈实际中心像素位置（Python 像素分析：原始图 x=2304, y=788 → canvas x=2813, y=985）
- [x] 修复 Boss X 坐标确定为 BOSS_SCREEN_X=2813, BOSS_SCREEN_Y=985
- [x] 英雄攻击 Boss 距离改为 2 格（col=57，贴近 Boss）

## Phase 21: 固定地图尺寸（去除缩放）
- [x] Canvas 固定为 3360x1920，不随窗口缩放
- [x] 地图容器改为可滚动（overflow-auto）
- [x] 移除 scaleX/scaleY 坐标转换，点击坐标直接使用 CSS 像素
- [x] Boss 坐标硬编码为法阵实际中心 (2813, 985)
- [x] 验证英雄不进墙、Boss 在法阵中心
