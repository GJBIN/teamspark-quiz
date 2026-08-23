-- TeamSpark 趣味测试数据库脚本（可重复执行）
-- 在 Supabase 项目的 SQL Editor 中完整执行本文件。
-- 前端只使用 Publishable key，本文件不包含任何 sb_secret / service_role key。

create extension if not exists pgcrypto with schema extensions;

-- 招新部门参考表
create table if not exists public.departments (
  id smallint primary key,
  name text not null,
  color text not null
);

insert into public.departments (id, name, color) values
  (0, '秘书部', '#3b8f89'),
  (1, '权益部', '#ed765b'),
  (2, '文体部', '#d49c35'),
  (3, '宣传部', '#6d70b5'),
  (4, '学习部', '#4c9f70')
on conflict (id) do update
  set name = excluded.name,
      color = excluded.color;

-- 题目选项到部门的映射表，保证 40 个选项中每个部门各出现 8 次。
create table if not exists public.option_mapping (
  question_index smallint not null,
  option_index smallint not null,
  department_index smallint not null,
  primary key (question_index, option_index)
);

insert into public.option_mapping (question_index, option_index, department_index) values
  (0,0,0),(0,1,1),(0,2,2),(0,3,3),
  (1,0,1),(1,1,0),(1,2,2),(1,3,4),
  (2,0,3),(2,1,0),(2,2,1),(2,3,4),
  (3,0,0),(3,1,2),(3,2,3),(3,3,4),
  (4,0,4),(4,1,2),(4,2,1),(4,3,3),
  (5,0,0),(5,1,1),(5,2,3),(5,3,2),
  (6,0,0),(6,1,1),(6,2,2),(6,3,4),
  (7,0,0),(7,1,1),(7,2,3),(7,3,4),
  (8,0,4),(8,1,0),(8,2,3),(8,3,2),
  (9,0,1),(9,1,2),(9,2,3),(9,3,4)
on conflict (question_index, option_index) do update
  set department_index = excluded.department_index;

-- 学生答卷表
create table if not exists public.quiz_responses (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  student_name text not null check (char_length(student_name) between 1 and 80),
  class_name text not null check (char_length(class_name) between 1 and 80),
  answers jsonb not null check (jsonb_typeof(answers) = 'array' and jsonb_array_length(answers) = 10),
  scores jsonb not null default '[]'::jsonb,
  department_index smallint not null check (department_index between 0 and 4),
  department_label text not null default '未分类'
);

-- 兼容旧版表：如果项目里已有旧表，补齐缺失字段，不丢失已有答卷。
alter table public.quiz_responses
  add column if not exists scores jsonb,
  add column if not exists department_label text;

-- 先删除旧约束，再回填，否则旧数据会被旧的长度/范围约束拦住
do $$
declare constraint_record record;
begin
  for constraint_record in
    select conname
    from pg_constraint
    where conrelid = 'public.quiz_responses'::regclass
      and contype = 'c'
      and (conname like 'quiz_responses_scores%'
           or conname like 'quiz_responses_department%')
  loop
    execute format('alter table public.quiz_responses drop constraint %I', constraint_record.conname);
  end loop;
end;
$$;

-- 根据最新题目映射计算部门得分和倾向
create or replace function public.department_from_answers(answers jsonb)
returns smallint
language sql
stable
as $$
  select m.department_index
  from generate_series(0, 9) as g(question_index)
  join public.option_mapping m
    on m.question_index = g.question_index
   and m.option_index = (answers->>g.question_index)::int
  group by m.department_index
  order by count(*) desc, m.department_index asc
  limit 1
$$;

-- 回填旧数据：旧答卷按新映射重新计算
update public.quiz_responses r
set scores = jsonb_build_array(
  (select count(*)
   from generate_series(0, 9) as g(question_index)
   join public.option_mapping m
     on m.question_index = g.question_index
    and m.option_index = (r.answers->>g.question_index)::int
   where m.department_index = 0),
  (select count(*)
   from generate_series(0, 9) as g(question_index)
   join public.option_mapping m
     on m.question_index = g.question_index
    and m.option_index = (r.answers->>g.question_index)::int
   where m.department_index = 1),
  (select count(*)
   from generate_series(0, 9) as g(question_index)
   join public.option_mapping m
     on m.question_index = g.question_index
    and m.option_index = (r.answers->>g.question_index)::int
   where m.department_index = 2),
  (select count(*)
   from generate_series(0, 9) as g(question_index)
   join public.option_mapping m
     on m.question_index = g.question_index
    and m.option_index = (r.answers->>g.question_index)::int
   where m.department_index = 3),
  (select count(*)
   from generate_series(0, 9) as g(question_index)
   join public.option_mapping m
     on m.question_index = g.question_index
    and m.option_index = (r.answers->>g.question_index)::int
   where m.department_index = 4)
),
department_index = public.department_from_answers(r.answers),
department_label = case public.department_from_answers(r.answers)
  when 0 then '秘书部'
  when 1 then '权益部'
  when 2 then '文体部'
  when 3 then '宣传部'
  when 4 then '学习部'
  else '复合型潜力股'
end
where r.scores is null
   or coalesce(jsonb_array_length(r.scores), 0) <> 5;

alter table public.quiz_responses
  alter column scores set default '[]'::jsonb,
  alter column scores set not null,
  alter column department_label set default '未分类',
  alter column department_label set not null;

alter table public.quiz_responses add constraint quiz_responses_scores_check
  check (jsonb_typeof(scores) = 'array' and jsonb_array_length(scores) = 5);

alter table public.quiz_responses add constraint quiz_responses_department_label_check
  check (char_length(department_label) between 1 and 80);

alter table public.quiz_responses add constraint quiz_responses_department_index_check
  check (department_index between 0 and 4);

alter table public.quiz_responses enable row level security;

drop policy if exists "Anyone can submit quiz responses" on public.quiz_responses;
create policy "Anyone can submit quiz responses"
  on public.quiz_responses
  for insert to anon, authenticated
  with check (
    jsonb_array_length(answers) = 10
    and jsonb_array_length(scores) = 5
    and department_index between 0 and 4
    and char_length(student_name) between 1 and 80
    and char_length(class_name) between 1 and 80
  );

-- 注意：quiz_responses 不创建 select 策略。
-- 后台读取数据只能通过下方受口令保护的 RPC 函数。

create index if not exists quiz_responses_class_name_idx on public.quiz_responses (class_name);
create index if not exists quiz_responses_department_idx on public.quiz_responses (department_index);

-- 管理口令配置表
create table if not exists public.admin_config (
  key text primary key,
  value text not null
);

alter table public.admin_config enable row level security;

-- 默认后台口令：TeamSpark@2026
-- 上线前请务必执行下方 README 中的命令更换口令。
insert into public.admin_config (key, value) values
  ('password_hash', 'c58a70c2909c0d0ee9bc852966ac259388d7359c8f1484ed282636c46fed3871')
on conflict (key) do update set value = excluded.value;

-- 受口令保护的后台统计 RPC。
-- 函数使用 security definer 读取表，匿名前端不能直接 select 答卷数据。
create or replace function public.get_admin_stats(pass text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_total integer;
  v_latest timestamptz;
  v_rows jsonb;
begin
  if pass is null or not exists (
    select 1
    from public.admin_config
    where key = 'password_hash'
      and value = encode(extensions.digest(pass, 'sha256'), 'hex')
  ) then
    raise exception '管理口令错误，请检查后重试。';
  end if;

  select count(*) into v_total from public.quiz_responses;
  select max(created_at) into v_latest from public.quiz_responses;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', q.id,
        'created_at', q.created_at,
        'student_name', q.student_name,
        'class_name', q.class_name,
        'answers', q.answers,
        'scores', q.scores,
        'department_index', q.department_index,
        'department_label', q.department_label
      )
      order by q.created_at desc
    ),
    '[]'::jsonb
  )
  into v_rows
  from public.quiz_responses q;

  return jsonb_build_object(
    'total', v_total,
    'latest', v_latest,
    'rows', v_rows
  );
end;
$$;

revoke execute on function public.get_admin_stats(text) from public;
grant execute on function public.get_admin_stats(text) to anon, authenticated;