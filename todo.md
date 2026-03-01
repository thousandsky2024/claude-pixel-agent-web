# Claude Pixel Agent Web - TODO

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
