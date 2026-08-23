const db = createClient();
const LETTERS = ["A", "B", "C", "D"];
const STORAGE_INDEX = "teamspark_quiz_index";
const STORAGE_ANSWERS = "teamspark_quiz_answers";
const $ = (selector) => document.querySelector(selector);

let index = Number(localStorage.getItem(STORAGE_INDEX) || 0);
let answers = JSON.parse(localStorage.getItem(STORAGE_ANSWERS) || "[]");
let result = null;

function saveState() {
  localStorage.setItem(STORAGE_INDEX, String(index));
  localStorage.setItem(STORAGE_ANSWERS, JSON.stringify(answers));
}

function clearState() {
  localStorage.removeItem(STORAGE_INDEX);
  localStorage.removeItem(STORAGE_ANSWERS);
  index = 0;
  answers = [];
}

function buildOptions() {
  const chosen = answers[index];
  return QUESTIONS[index].options.map((text, choiceIndex) => `
    <button type="button" class="option${chosen === choiceIndex ? " selected" : ""}" data-choice="${choiceIndex}">
      <span class="letter">${LETTERS[choiceIndex]}</span>
      <span>${escapeHtml(text)}</span>
    </button>
  `).join("");
}

function syncSelection() {
  document.querySelectorAll("#options .option").forEach((button) => {
    button.classList.toggle("selected", Number(button.dataset.choice) === answers[index]);
  });
}

function renderQuiz() {
  if (index >= QUESTIONS.length) {
    showResult();
    return;
  }

  const current = QUESTIONS[index];
  $("#quiz").classList.remove("hidden");
  $("#result").classList.add("hidden");
  $("#count").textContent = `${index + 1} / ${QUESTIONS.length}`;
  $("#progress").style.width = `${(index / QUESTIONS.length) * 100}%`;
  $("#question").textContent = current.text;
  $("#options").innerHTML = buildOptions();

  document.querySelectorAll("#options .option").forEach((button) => {
    button.addEventListener("click", () => {
      answers[index] = Number(button.dataset.choice);
      saveState();
      syncSelection();
    });
  });

  $("#prev").disabled = index === 0;
  $("#next").textContent = index === QUESTIONS.length - 1 ? "查看结果 →" : "下一题 →";
}

function calculateResult() {
  const scores = new Array(DEPARTMENTS.length).fill(0);
  answers.forEach((choice, questionIndex) => {
    const dept = QUESTIONS[questionIndex].mapping[choice];
    if (Number.isInteger(dept)) scores[dept] += 1;
  });

  const max = Math.max(...scores);
  const topIndexes = scores
    .map((score, deptIndex) => (score === max ? deptIndex : -1))
    .filter((deptIndex) => deptIndex >= 0);

  let badge, title, desc, label;
  if (topIndexes.length === 1) {
    const dept = DEPARTMENTS[topIndexes[0]];
    badge = dept.short;
    title = `你更适合「${dept.name}」`;
    desc = dept.desc;
    label = dept.name;
  } else {
    const names = topIndexes.map((deptIndex) => DEPARTMENTS[deptIndex].short).join(" / ");
    badge = "复合型潜力股";
    title = `你的倾向是「${names}」复合体`;
    desc = "你的选择在多个部门之间都有亮点，适合跨部门协作，或需要综合能力的工作场景。";
    label = "复合型潜力股";
  }

  return { scores, topIndexes, badge, title, desc, label };
}

function showResult() {
  if (answers.length < QUESTIONS.length) {
    index = 0;
    answers = [];
    saveState();
    renderQuiz();
    return;
  }

  result = calculateResult();
  const primary = DEPARTMENTS[result.topIndexes[0]];
  $("#quiz").classList.add("hidden");
  $("#result").classList.remove("hidden");
  $("#result-badge").textContent = result.badge;
  $("#result-badge").style.background = primary.color;
  $("#result-title").textContent = result.title;
  $("#result-desc").textContent = result.desc;
  $("#score-breakdown").innerHTML = DEPARTMENTS.map((dept, deptIndex) => `
    <div class="break-row">
      <span>${escapeHtml(dept.short)}</span>
      <div class="bar"><i style="width:${(result.scores[deptIndex] / QUESTIONS.length) * 100}%;background:${dept.color}"></i></div>
      <strong>${result.scores[deptIndex]}</strong>
    </div>
  `).join("");
  $("#submit-msg").textContent = "";
}

function resetClassFields() {
  $("#class-name").value = "";
  $("#class-other").value = "";
  $("#class-other").classList.add("hidden");
}

function selectedClassName() {
  const classValue = $("#class-name").value;
  if (classValue === "其他") return $("#class-other").value.trim();
  return classValue;
}

$("#class-name").addEventListener("change", () => {
  const isOther = $("#class-name").value === "其他";
  $("#class-other").classList.toggle("hidden", !isOther);
});

$("#prev").addEventListener("click", () => {
  if (index > 0) {
    index -= 1;
    saveState();
    renderQuiz();
  }
});

$("#next").addEventListener("click", () => {
  if (answers[index] === undefined) {
    alert("请先选择一个选项");
    return;
  }
  index += 1;
  saveState();
  renderQuiz();
});

$("#restart").addEventListener("click", () => {
  clearState();
  result = null;
  $("#student-name").value = "";
  resetClassFields();
  renderQuiz();
});

$("#submit-result").addEventListener("click", async () => {
  if (!result) return;
  const name = $("#student-name").value.trim();
  const className = selectedClassName();

  if (!name || !className) {
    $("#submit-msg").textContent = "请先填写姓名和班级。";
    return;
  }

  const button = $("#submit-result");
  button.disabled = true;
  $("#submit-msg").textContent = "提交中…";

  const { error } = await db.from("quiz_responses").insert({
    student_name: name,
    class_name: className,
    answers,
    scores: result.scores,
    department_index: result.topIndexes[0] ?? 0,
    department_label: result.label
  });

  if (error) {
    $("#submit-msg").textContent = `提交失败：${error.message}`;
    button.disabled = false;
    return;
  }

  $("#submit-msg").textContent = "提交成功，感谢参与！";
  button.disabled = true;
});

renderQuiz();