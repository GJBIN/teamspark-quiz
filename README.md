# TeamSpark 招新趣味测试

一个可直接部署的在线共享版趣味测试：学生完成 10 道选择题，提交后获得“仅供参考”的部门倾向总结；管理后台可查看答题人数、部门倾向、班级分布和每题选项统计，并导出 CSV。

## 招新部门

- 秘书部
- 权益部
- 文体部
- 宣传部
- 学习部

题目共 40 个选项，每个部门各出现 8 次，权重一致。

## 文件

- `index.html`：学生端测试页面
- `admin.html`：管理后台入口
- `shared.js`：共用题目、部门定义和 Supabase 客户端配置
- `app.js`：学生端答题、结果计算和提交逻辑
- `admin.js`：后台口令验证、统计渲染和 CSV 导出
- `styles.css`：响应式视觉样式
- `supabase.sql`：建表、索引、RLS 策略和统计 RPC（可重复执行，兼容旧表）
- `README.md`：部署说明

## Supabase 配置

1. 打开 Supabase 项目 SQL Editor。
2. 完整执行 `supabase.sql`。
3. 该脚本可重复执行：已经存在旧表时会自动补列、按新部门映射回填旧数据，不会丢失已有答卷。
4. 前端已内置以下配置，一般无需修改：
   - Project URL：`https://gfkxvecalhysgpwexyfy.supabase.co`
   - Publishable key：`sb_publishable_5tpsOVVb2FVER8J8SDBwuw_ATT1vPqv`
5. 如果项目 URL 或 key 不同，修改 `shared.js` 顶部的常量即可。

## 部署网页

将整个文件夹上传到任意静态托管服务即可，无需构建步骤：

- GitHub Pages / Netlify / Vercel / Cloudflare Pages
- 学校或自有的静态服务器

访问 `index.html` 分享给学生；访问 `admin.html` 进入后台。

## 后台口令

- 默认后台口令：`TeamSpark@2026`
- 口令只保存在 Supabase 的 `admin_config` 表中，前端不保存。
- 上线前请立即更换默认口令，执行以下 SQL（把“你的新口令”替换成你的口令）：

```sql
update public.admin_config
set value = encode(extensions.digest('你的新口令', 'sha256'), 'hex')
where key = 'password_hash';
```

## 提交去重

同一“姓名+班级”只记录第一次提交：数据库通过 `quiz_responses_name_class_unique_idx` 唯一索引去重，重复提交会提示“你已提交过”。若需关闭，删除该索引即可。

## 安全说明

- 前端只使用题目给出的 Publishable key，不使用任何 `sb_secret` 或 service role key。
- 匿名用户仅能插入符合格式的答卷，不能直接读取答卷数据。
- 后台通过 `get_admin_stats` RPC 验证口令后返回统计和明细；错误口令会被数据库拒绝。
- 请根据学校隐私要求评估姓名/班级数据的保存周期。

## 本地检查

可用任意静态服务器运行：

```bash
python -m http.server 8000
```

然后打开 `http://localhost:8000/`。学生端页面和后台页面均可直接访问；后台统计需要先在 Supabase 执行 `supabase.sql`。