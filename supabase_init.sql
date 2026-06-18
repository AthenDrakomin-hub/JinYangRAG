-- Jin Yang RAG v2.0 群活跃话术 Supabase 初始化脚本
-- 在 Supabase Studio 的 SQL Editor 中执行
-- 作用：给现有 documents 表加 STAGE_SPEECH 支持 + 新建 speech_history 历史表

-- ============== 1. 给 documents 表加索引（如果还没建） ==============
-- current_stage + user_id 联合索引，加速 STAGE 隔离查询
CREATE INDEX IF NOT EXISTS idx_documents_stage_user
  ON documents (current_stage, user_id);

-- ============== 2. 群活跃话术历史表 ==============
CREATE TABLE IF NOT EXISTS speech_history (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT 'speech_default',
  query TEXT NOT NULL,
  total_lines INTEGER NOT NULL DEFAULT 8,
  answer TEXT NOT NULL,
  identify_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_speech_history_user_time
  ON speech_history (user_id, created_at DESC);

-- ============== 3. 行级安全（RLS） ==============
ALTER TABLE speech_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "speech_history_user_isolation" ON speech_history;
CREATE POLICY "speech_history_user_isolation"
  ON speech_history
  USING (user_id = current_setting('request.jwt.claims', true)::json->>'sub'
         OR user_id = current_setting('app.current_user_id', true)
         OR auth.role() = 'service_role');

-- ============== 4. 上传一份群运营文档模板（可选，给主人测试用） ==============
-- 这一步是测试数据，主人正式用时改为自己的真实业务文档
INSERT INTO documents (content, url, user_id, current_stage, embedding)
VALUES (
  $json$
{
  "场景": [
    {"name": "早盘引导", "trigger": "9:00-9:30", "timing": "开盘前 15 分钟"},
    {"name": "盘中拉升", "trigger": "10:30-11:00", "timing": "主线确认后"},
    {"name": "尾盘出货", "trigger": "14:30-15:00", "timing": "收盘前"},
    {"name": "晚课复盘", "trigger": "19:00-21:00", "timing": "夜盘开盘前"}
  ],
  "角色": [
    {"name": "老师", "trait": "专业 / 主线判断", "voice": "沉稳不浮夸，给方向", "bestTiming": "全程"},
    {"name": "老粉", "trait": "陪伴 / 感恩", "voice": "现身说法，不夸张", "bestTiming": "全程"},
    {"name": "答疑派", "trait": "理性 / 帮解惑", "voice": "平实，给具体逻辑", "bestTiming": "盘中拉升/尾盘"},
    {"name": "萌新", "trait": "懵懂 / 求带", "voice": "真诚，发问式", "bestTiming": "早盘引导/晚课"}
  ],
  "节奏": {
    "totalLines": 8,
    "order": ["老师", "老粉", "答疑派", "萌新", "老粉", "老师", "答疑派", "老粉"],
    "intervalHint": "每条 1-3 分钟，群里看着像真实互动"
  },
  "禁词": [
    "100% 涨", "必涨", "翻倍", "具体股票代码", "保证收益",
    "主力动向", "内幕消息", "群友", "推荐"
  ],
  "案例": [
    "今天盘面要盯着 AI 算力那条线，主力资金已经在动了",
    "老李我跟你讲，跟着主线走心里踏实，不追高不抄底"
  ]
}
  $json$,
  'https://manual.local/group-ops-v1',
  'speech_default',
  'STAGE_SPEECH',
  NULL  -- 主人测试时如果后端支持自动 embedding 可去掉 NULL；不支持就保留 NULL 走文本匹配
)
ON CONFLICT DO NOTHING;

-- ============== 5. 验证 ==============
SELECT
  (SELECT count(*) FROM documents WHERE current_stage = 'STAGE_SPEECH') AS speech_docs,
  (SELECT count(*) FROM speech_history) AS speech_history_count;
