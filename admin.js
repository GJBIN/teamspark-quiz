const db = createClient();
const LETTERS = ["A", "B", "C", "D"];
const $ = (selector) => document.querySelector(selector);
let rows = [];

function bars(target, entries, color = "#3b8f89") {
  const max = Math.max(...entries.map(([, value]) => value), 1);
  $(target).innerHTML = entries.length
    ? entries.map(([label, value]) => `
        <div class="bar-row">
          <span title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <div class="bar"><i style="width:${(value / max) * 100}%;background:${color}"></i></div>
          <strong>${value}</strong>
        </div>
      `).join("")
    : "<p>暂无数据</p>";
}

function render() {
  const total = rows.length;
  const dept = DEPARTMENTS.map((department, departmentIndex) => [
    department.name,
    rows.filter((row) => row.department_index === departmentIndex).length
  ]);

  const classMap = {};
  rows.forEach((row) => {
    const className = row.class_name || "未填班级";
    classMap[className] = (classMap[className] || 0) + 1;
  });
  const classes = Object.entries(classMap).sort((a, b) => b[1] - a[1]);

  const sortedDept = [...dept].sort((a, b) => b[1] - a[1]);
  const latestTime = Math.max(0, ...rows.map((row) => new Date(row.created_at).getTime() || 0));

  $("#total").textContent = total;
  $("#classes").textContent = classes.length;
  $("#top-dept").textContent = sortedDept[0] && sortedDept[0][1] > 0 ? sortedDept[0][0] : "—";
  $("#latest").textContent = latestTime
    ? new Date(latestTime).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })
    : "—";

  bars("#dept-bars", dept, "#3b8f89");
  bars("#class-bars", classes, "#ed765b");

  const questionRows = QUESTIONS.map((question, questionIndex) => {
    const counts = new Array(DEPARTMENTS.length).fill(0);
    rows.forEach((row) => {
      const answer = Array.isArray(row.answers) ? Number(row.answers[questionIndex]) : NaN;
      if (Number.isInteger(answer)) counts[answer] += 1;
    });
    return [question.text, counts];
  });

  $("#question-table").innerHTML = `
    <thead>
      <tr><th>题目</th><th>A</th><th>B</th><th>C</th><th>D</th></tr>
    </thead>
    <tbody>
      ${questionRows.map(([question, counts]) => `
        <tr><td>${escapeHtml(question)}</td>${counts.map((count) => `<td>${count}</td>`).join("")}</tr>
      `).join("")}
    </tbody>
  `;
}

function exportCsv() {
  const headers = [
    "提交时间",
    "姓名",
    "班级",
    "部门倾向",
    ...DEPARTMENTS.map((department) => department.name),
    ...QUESTIONS.map((_, questionIndex) => `第${questionIndex + 1}题`)
  ];

  const lines = [
    headers,
    ...rows.map((row) => [
      new Date(row.created_at).toLocaleString("zh-CN", { hour12: false }),
      row.student_name || "",
      row.class_name || "",
      row.department_label || DEPARTMENTS[row.department_index]?.name || "",
      ...(Array.isArray(row.scores) ? row.scores : new Array(DEPARTMENTS.length).fill(0)),
      ...(Array.isArray(row.answers) ? row.answers.map((answer) => LETTERS[answer] ?? "") : [])
    ])
  ];

  const csv = lines
    .map((line) => line.map((value) => `"${String(value ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `teamspark-admin-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function login() {
  const pass = $("#password").value;
  if (!pass) {
    $("#auth-msg").textContent = "请输入管理口令。";
    return;
  }

  const button = $("#login");
  button.disabled = true;
  $("#auth-msg").textContent = "验证中…";

  const { data, error } = await db.rpc("get_admin_stats", { pass });
  button.disabled = false;

  if (error) {
    $("#auth-msg").textContent = error.message || "验证失败，请稍后重试。";
    return;
  }

  if (!data || !Array.isArray(data.rows)) {
    $("#auth-msg").textContent = "返回数据格式不正确，请检查 supabase.sql 是否已执行。";
    return;
  }

  rows = data.rows;
  $("#password").value = "";
  $("#auth").classList.add("hidden");
  $("#dashboard").classList.remove("hidden");
  render();
}

$("#login").addEventListener("click", login);
$("#password").addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});

$("#logout").addEventListener("click", () => {
  rows = [];
  $("#dashboard").classList.add("hidden");
  $("#auth").classList.remove("hidden");
  $("#auth-msg").textContent = "";
});

$("#export").addEventListener("click", exportCsv);