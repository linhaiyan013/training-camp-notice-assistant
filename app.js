const TASK_TYPES = [
  { id: "noon", label: "中午预告", short: "中午" },
  { id: "before", label: "课前提醒", short: "课前" },
];

const TEMPLATE_TYPES = [
  { id: "daily", label: "每日课程预告" },
  { id: "noon", label: "中午预告" },
  { id: "before", label: "课前提醒" },
  { id: "replay", label: "回放提醒" },
  { id: "homework", label: "作业提醒" },
  { id: "opening", label: "开营预告" },
  { id: "start", label: "正式开营提醒" },
  { id: "closing", label: "结营提醒" },
  { id: "conversion", label: "转化提醒" },
  { id: "general", label: "通用模板" },
];

const TEMPLATE_USAGE_TYPES = {
  noon: ["noon", "daily", "opening"],
  before: ["before", "start"],
};

const SUPABASE_TABLES = {
  camps: "training_camps",
  groups: "camp_groups",
  lessons: "camp_lessons",
  tasks: "message_tasks",
  statuses: "task_group_statuses",
  templates: "message_templates",
  presets: "lesson_presets",
  presetItems: "lesson_preset_items",
};

const ADMIN_STORAGE_KEY = "training-camp-admin-code";
const ASSISTANT_STORAGE_KEY = "training-camp-assistant-code";
const ROLE_STORAGE_KEY = "training-camp-last-role";
const REMINDER_ENABLED_KEY = "training-camp-reminders-enabled";
const REMINDER_LAST_KEY = "training-camp-reminder-last";
const REMINDER_REPEAT_MINUTES = 10;
const HOSTED_CALENDAR_FILE = "./training-camp-reminders.ics?v=teacher1";

let db = null;
let currentPage = "today";
let calendarCursor = startOfMonth(new Date());
let selectedCalendarDate = toDateInput(new Date());
let activeTaskId = null;
let state = emptyState();
let adminCode = window.localStorage.getItem(ADMIN_STORAGE_KEY) || "";
let assistantCode = window.localStorage.getItem(ASSISTANT_STORAGE_KEY) || "";
let preferredRole = window.localStorage.getItem(ROLE_STORAGE_KEY) || "";
let loginMode = preferredRole === "admin" ? "admin" : "assistant";
let remindersEnabled = window.localStorage.getItem(REMINDER_ENABLED_KEY) === "1";
let reminderLastMap = readReminderLastMap();
let reminderAudioContext = null;
let appIntervalsStarted = false;
let isAdmin = false;
let hasAssistantAccess = false;

const els = {
  todayWeek: document.querySelector("#todayWeek"),
  todayDate: document.querySelector("#todayDate"),
  saveStatus: document.querySelector("#saveStatus"),
  todayTotal: document.querySelector("#todayTotal"),
  todayDone: document.querySelector("#todayDone"),
  todayPending: document.querySelector("#todayPending"),
  reminderButton: document.querySelector("#reminderButton"),
  calendarExportButton: document.querySelector("#calendarExportButton"),
  reminderHint: document.querySelector("#reminderHint"),
  todayList: document.querySelector("#todayList"),
  monthTitle: document.querySelector("#monthTitle"),
  calendarGrid: document.querySelector("#calendarGrid"),
  selectedDateTitle: document.querySelector("#selectedDateTitle"),
  calendarDayList: document.querySelector("#calendarDayList"),
  campForm: document.querySelector("#campForm"),
  groupFields: document.querySelector("#groupFields"),
  templateSelects: document.querySelector("#templateSelects"),
  draftList: document.querySelector("#draftList"),
  lessonFields: document.querySelector("#lessonFields"),
  campList: document.querySelector("#campList"),
  templateForm: document.querySelector("#templateForm"),
  templateList: document.querySelector("#templateList"),
  toggleTemplateForm: document.querySelector("#toggleTemplateForm"),
  hideTemplateForm: document.querySelector("#hideTemplateForm"),
  detailView: document.querySelector("#detailView"),
  detailType: document.querySelector("#detailType"),
  detailTitle: document.querySelector("#detailTitle"),
  detailContent: document.querySelector("#detailContent"),
  detailProgress: document.querySelector("#detailProgress"),
  roleLabel: document.querySelector("#roleLabel"),
  roleHint: document.querySelector("#roleHint"),
  adminModeButton: document.querySelector("#adminModeButton"),
  switchAssistantButton: document.querySelector("#switchAssistantButton"),
  modeLogoutButton: document.querySelector("#modeLogoutButton"),
  adminModal: document.querySelector("#adminModal"),
  adminLoginPanel: document.querySelector("#adminLoginPanel"),
  adminManagePanel: document.querySelector("#adminManagePanel"),
  adminCodeInput: document.querySelector("#adminCodeInput"),
  adminLoginButton: document.querySelector("#adminLoginButton"),
  adminLoginStatus: document.querySelector("#adminLoginStatus"),
  newAdminName: document.querySelector("#newAdminName"),
  newAdminCode: document.querySelector("#newAdminCode"),
  newPrimaryAdminCode: document.querySelector("#newPrimaryAdminCode"),
  primaryAdminCodeStatus: document.querySelector("#primaryAdminCodeStatus"),
  setPrimaryAdminCodeButton: document.querySelector("#setPrimaryAdminCodeButton"),
  assistantAccessModal: document.querySelector("#assistantAccessModal"),
  loginModeTitle: document.querySelector("#loginModeTitle"),
  loginModeHint: document.querySelector("#loginModeHint"),
  loginCodeLabel: document.querySelector("#loginCodeLabel"),
  loginModeButtons: document.querySelectorAll("[data-login-mode]"),
  assistantCodeInput: document.querySelector("#assistantCodeInput"),
  assistantLoginButton: document.querySelector("#assistantLoginButton"),
  assistantLoginStatus: document.querySelector("#assistantLoginStatus"),
  newAssistantCode: document.querySelector("#newAssistantCode"),
  assistantCodeStatus: document.querySelector("#assistantCodeStatus"),
  setAssistantCodeButton: document.querySelector("#setAssistantCodeButton"),
  toast: document.querySelector("#toast"),
};

init();

async function init() {
  setupNavigation();
  setupCalendar();
  setupCampForm();
  setupTemplates();
  setupAssistantAccess();
  setupAdminMode();
  setupGlobalActions();
  setupReminderControls();
  applyRoleUI();
  renderTodayHeader();
  renderEmptyShell("正在连接 Supabase 云端数据...");

  const ready = await setupSupabase();
  if (!ready) return;
  startAppIntervals();

  const wantsAdminEntry = isAdminEntryRequested();
  await restoreStoredSession(wantsAdminEntry);
  if (wantsAdminEntry && !isAdmin) {
    renderAccessRequired();
    openAssistantAccessModal("admin");
    return;
  }
  if (!canAccessData()) {
    renderAccessRequired();
    openAssistantAccessModal();
    return;
  }
  await loadCloudData();
  renderAll();
  if (wantsAdminEntry && isAdmin) openAdminModal();
}

function startAppIntervals() {
  if (appIntervalsStarted) return;
  appIntervalsStarted = true;
  window.setInterval(async () => {
    if (!canAccessData()) return;
    const isEditingCamp = els.campForm.classList.contains("open");
    if (!activeTaskId && !isEditingCamp && currentPage !== "templates") {
      await loadCloudData({ silent: true });
      renderAll();
    }
  }, 30000);
  window.setInterval(() => {
    if (!canAccessData()) return;
    renderTodayHeader();
    renderTodayList();
    checkDueReminders();
    updateReminderUI();
  }, 30000);
}

function emptyState() {
  return {
    camps: [],
    groups: [],
    lessons: [],
    tasks: [],
    statuses: [],
    templates: [],
    presets: [],
    presetItems: [],
  };
}

async function setupSupabase() {
  const config = window.TRAINING_CAMP_SUPABASE;
  const publicKey = config?.publishableKey || config?.anonKey;
  if (!config?.url || !publicKey || config.url.includes("YOUR_") || publicKey.includes("YOUR_")) {
    els.saveStatus.textContent = "未配置云端";
    renderConfigMissing();
    return false;
  }

  try {
    if (!window.supabase?.createClient) {
      throw new Error("Supabase SDK 未加载，请检查网络或 CDN");
    }
    db = createSupabaseClient(config, publicKey);
    els.saveStatus.textContent = "云端已连接";
    return true;
  } catch (error) {
    els.saveStatus.textContent = "云端连接失败";
    renderFatal(`Supabase 连接失败：${error.message}`);
    return false;
  }
}

function createSupabaseClient(config, publicKey) {
  const headers = {};
  if (adminCode) headers["x-admin-code"] = adminCode;
  if (assistantCode) headers["x-assistant-code"] = assistantCode;
  const options = Object.keys(headers).length
    ? { global: { headers } }
    : undefined;
  return window.supabase.createClient(config.url, publicKey, options);
}

function rebuildSupabaseClient() {
  const config = window.TRAINING_CAMP_SUPABASE;
  const publicKey = config?.publishableKey || config?.anonKey;
  db = createSupabaseClient(config, publicKey);
}

async function loadCloudData({ silent = false } = {}) {
  if (!db) return;
  if (!canAccessData()) {
    renderAccessRequired();
    return;
  }
  if (!silent) els.saveStatus.textContent = "同步云端中";

  const [
    camps,
    groups,
    lessons,
    tasks,
    statuses,
    templates,
    presets,
    presetItems,
  ] = await Promise.all([
    selectAll(SUPABASE_TABLES.camps, "created_at"),
    selectAll(SUPABASE_TABLES.groups, "position"),
    selectAll(SUPABASE_TABLES.lessons, "sort_order"),
    selectAll(SUPABASE_TABLES.tasks, "send_at"),
    selectAll(SUPABASE_TABLES.statuses, "created_at"),
    selectAll(SUPABASE_TABLES.templates, "sort_order"),
    selectAll(SUPABASE_TABLES.presets, "created_at"),
    selectAll(SUPABASE_TABLES.presetItems, "sort_order"),
  ]);

  state = { camps, groups, lessons, tasks, statuses, templates, presets, presetItems };
  els.saveStatus.textContent = "云端已同步";
}

async function selectAll(table, orderColumn) {
  let query = db.from(table).select("*");
  if (orderColumn) query = query.order(orderColumn, { ascending: true });
  const { data, error } = await query;
  if (error) throwAndRender(error);
  return data || [];
}

function throwAndRender(error) {
  renderFatal(`读取云端数据失败：${error.message}`);
  throw error;
}

function renderConfigMissing() {
  const message = `
    <div class="empty-state">
      还没有配置 Supabase。<br />
      请复制 <b>config.example.js</b> 为 <b>config.js</b>，填入 Supabase URL 和 anon key。<br />
      数据不会再保存到本地浏览器。
    </div>
  `;
  els.todayList.innerHTML = message;
  els.calendarDayList.innerHTML = message;
  els.campList.innerHTML = message;
  els.templateList.innerHTML = message;
}

function renderFatal(message) {
  const html = `<div class="empty-state">${escapeHTML(message)}</div>`;
  els.todayList.innerHTML = html;
  els.calendarDayList.innerHTML = html;
  els.campList.innerHTML = html;
  els.templateList.innerHTML = html;
}

function renderAccessRequired() {
  const message = `
    <div class="empty-state">
      请选择进入助理模式或管理员模式。<br />
      输入对应密码后，就能进入对应的工作界面。
    </div>
  `;
  els.saveStatus.textContent = "需要访问码";
  els.todayTotal.textContent = "0";
  els.todayDone.textContent = "0";
  els.todayPending.textContent = "0";
  els.todayList.innerHTML = message;
  els.calendarDayList.innerHTML = message;
  els.campList.innerHTML = message;
  els.templateList.innerHTML = message;
}

function renderEmptyShell(message) {
  const html = `<div class="empty-state">${escapeHTML(message)}</div>`;
  els.todayList.innerHTML = html;
  els.calendarDayList.innerHTML = html;
  els.campList.innerHTML = html;
}

function setupNavigation() {
  document.querySelectorAll("[data-open-page]").forEach((button) => {
    button.addEventListener("click", () => openPage(button.dataset.openPage));
  });
}

function openPage(page) {
  if (page === "templates" && !isAdmin) {
    requireAdmin();
    return;
  }
  currentPage = page;
  syncActivePage();
  renderAll();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function syncActivePage() {
  document.querySelectorAll(".page").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.page === currentPage);
  });
  document.querySelectorAll(".nav-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.openPage === currentPage);
  });
}

function setupCalendar() {
  document.querySelector("#prevMonth").addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
    selectedCalendarDate = toDateInput(calendarCursor);
    renderCalendar();
  });
  document.querySelector("#nextMonth").addEventListener("click", () => {
    calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
    selectedCalendarDate = toDateInput(calendarCursor);
    renderCalendar();
  });
}

function setupCampForm() {
  const today = new Date();
  document.querySelector("#startDate").value = toDateInput(today);
  document.querySelector("#endDate").value = toDateInput(addDays(today, 7));
  addGroupField("");
  addLessonField({ day_number: 1, kind: "正课", title: "", detail: "", sort_order: 1 });

  document.querySelector("#toggleCampForm").addEventListener("click", () => {
    if (!requireAdmin()) return;
    els.campForm.classList.add("open");
    renderTemplateSelects();
    renderDraftPreview();
    document.querySelector("#campName").focus();
  });
  document.querySelector("#hideCampForm").addEventListener("click", () => els.campForm.classList.remove("open"));
  document.querySelector("#addGroup").addEventListener("click", () => addGroupField(""));
  document.querySelector("#refreshDrafts").addEventListener("click", renderDraftPreview);
  document.querySelector("#loadImageAgenda").addEventListener("click", applyFirstCloudPreset);
  document.querySelector("#addLesson").addEventListener("click", () => {
    const lessons = getLessonFormData();
    addLessonField({
      day_number: lessons.length ? Math.max(...lessons.map((lesson) => lesson.day_number)) + 1 : 1,
      kind: "正课",
      title: "",
      detail: "",
      sort_order: lessons.length + 1,
    });
    updateEndDateFromLessons();
  });

  els.groupFields.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-group]");
    if (!button) return;
    button.closest(".group-field").remove();
    if (!els.groupFields.querySelector(".group-field")) addGroupField("");
  });

  els.lessonFields.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-lesson]");
    if (!button) return;
    button.closest(".lesson-field").remove();
    updateLessonNumbers();
    updateEndDateFromLessons();
    renderDraftPreview();
  });

  els.lessonFields.addEventListener("input", () => {
    updateLessonNumbers();
    updateEndDateFromLessons();
    renderDraftPreview();
  });
  els.templateSelects.addEventListener("change", renderDraftPreview);
  document.querySelector("#startDate").addEventListener("change", updateEndDateFromLessons);
  els.campForm.addEventListener("submit", createCampFromForm);
}

function setupTemplates() {
  document.querySelector("#templateType").innerHTML = templateTypeOptions("daily");
  els.toggleTemplateForm.addEventListener("click", () => {
    if (!requireAdmin()) return;
    els.templateForm.classList.add("open");
    els.toggleTemplateForm.setAttribute("aria-expanded", "true");
    window.setTimeout(() => document.querySelector("#templateName").focus(), 0);
  });
  els.hideTemplateForm.addEventListener("click", closeTemplateForm);
  els.templateForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireAdmin()) return;
    if (!db) return showToast("请先配置 Supabase");
    const name = document.querySelector("#templateName").value.trim();
    const type = document.querySelector("#templateType").value;
    const content = document.querySelector("#templateContent").value.trim();
    if (!name || !content) return showToast("模板名称和内容要填");

    await cloudInsert(SUPABASE_TABLES.templates, {
      name,
      type,
      content,
      sort_order: state.templates.length + 1,
    });
    els.templateForm.reset();
    closeTemplateForm();
    await reloadAndRender("模板已保存");
  });

  els.templateList.addEventListener("click", async (event) => {
    const editButton = event.target.closest("[data-edit-template]");
    const saveButton = event.target.closest("[data-save-template]");
    const deleteButton = event.target.closest("[data-delete-template]");

    if (editButton) {
      if (!requireAdmin()) return;
      editButton.closest(".template-card").classList.toggle("editing");
      return;
    }
    if (saveButton) {
      if (!requireAdmin()) return;
      await saveTemplate(saveButton.dataset.saveTemplate);
      return;
    }
    if (deleteButton) {
      if (!requireAdmin()) return;
      await cloudDelete(SUPABASE_TABLES.templates, deleteButton.dataset.deleteTemplate);
      await reloadAndRender("模板已删除");
    }
  });
}

function closeTemplateForm() {
  els.templateForm.classList.remove("open");
  els.toggleTemplateForm.setAttribute("aria-expanded", "false");
}

function setupAssistantAccess() {
  els.loginModeButtons.forEach((button) => {
    button.addEventListener("click", () => setLoginMode(button.dataset.loginMode));
  });
  document.querySelector("#assistantLoginButton").addEventListener("click", loginSelectedMode);
  document.querySelector("#closeAssistantAccessModal").addEventListener("click", closeAssistantAccessModal);
  els.assistantAccessModal.addEventListener("click", (event) => {
    if (event.target === els.assistantAccessModal) closeAssistantAccessModal();
  });
  els.assistantCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginSelectedMode();
  });
}

function openAssistantAccessModal(mode = "") {
  const nextMode = mode || getDefaultLoginMode();
  if (isAdmin || (hasAssistantAccess && nextMode !== "admin")) return;
  setLoginMode(nextMode);
  setInlineStatus(els.assistantLoginStatus);
  els.assistantAccessModal.hidden = false;
  window.setTimeout(() => els.assistantCodeInput.focus(), 0);
}

function closeAssistantAccessModal() {
  els.assistantAccessModal.hidden = true;
}

function isAdminEntryRequested() {
  const params = new URLSearchParams(window.location.search);
  return params.get("admin") === "1" || window.location.hash === "#admin";
}

function getDefaultLoginMode() {
  return preferredRole === "admin" ? "admin" : "assistant";
}

function setLoginMode(mode) {
  loginMode = mode === "admin" ? "admin" : "assistant";
  const isAdminLogin = loginMode === "admin";
  els.loginModeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.loginMode === loginMode);
  });
  els.loginModeTitle.textContent = "选择进入模式";
  els.loginModeHint.textContent = isAdminLogin
    ? "管理员输入密码后，可以新建训练营、改模板、改密码和管理排期。"
    : "助理输入访问码后，可以查看排期、复制话术和勾选已发送。";
  els.loginCodeLabel.textContent = isAdminLogin ? "管理员密码" : "助理访问码";
  els.assistantCodeInput.placeholder = isAdminLogin ? "输入管理员密码" : "输入助理访问码";
  els.assistantLoginButton.textContent = isAdminLogin ? "进入管理员模式" : "进入助理模式";
  setInlineStatus(els.assistantLoginStatus);
}

async function restoreStoredSession(preferAdmin = false) {
  if (preferAdmin && adminCode) {
    await verifyAdminSession({ silent: true });
    if (isAdmin) return;
  }

  if (preferredRole === "assistant" && assistantCode) {
    await verifyAssistantSession({ silent: true });
    if (hasAssistantAccess) return;
  }

  if (preferredRole === "admin" && adminCode) {
    await verifyAdminSession({ silent: true });
    if (isAdmin) return;
  }

  if (adminCode) await verifyAdminSession({ silent: true });
  if (!isAdmin && assistantCode) await verifyAssistantSession({ silent: true });
}

function rememberRole(role) {
  preferredRole = role;
  window.localStorage.setItem(ROLE_STORAGE_KEY, role);
}

async function loginSelectedMode() {
  const code = els.assistantCodeInput.value.trim();
  setInlineStatus(els.assistantLoginStatus);
  if (!code) {
    const message = loginMode === "admin" ? "请输入管理员密码" : "请输入助理访问码";
    setInlineStatus(els.assistantLoginStatus, message, "error");
    return showToast(message);
  }
  setButtonLoading(els.assistantLoginButton, true, "登录中...");
  try {
    if (loginMode === "admin") {
      await loginAdminWithCode(code, els.assistantLoginStatus);
    } else {
      await loginAssistantWithCode(code, els.assistantLoginStatus);
    }
  } finally {
    setButtonLoading(els.assistantLoginButton, false);
  }
}

async function loginAssistantWithCode(code, statusElement = els.assistantLoginStatus) {
  assistantCode = code;
  rebuildSupabaseClient();
  const ok = await verifyAssistantSession({ silent: true });
  if (!ok) {
    assistantCode = "";
    window.localStorage.removeItem(ASSISTANT_STORAGE_KEY);
    rebuildSupabaseClient();
    setInlineStatus(statusElement, "助理访问码不对，请重新输入", "error");
    return showToast("助理访问码不对");
  }
  window.localStorage.setItem(ASSISTANT_STORAGE_KEY, assistantCode);
  rememberRole("assistant");
  els.assistantCodeInput.value = "";
  closeAssistantAccessModal();
  await reloadAndRender("已进入助理模式");
}

async function verifyAssistantSession({ silent = false } = {}) {
  if (!assistantCode || !db) {
    setAssistantAccessState(false);
    return false;
  }
  const { data, error } = await db.rpc("verify_assistant_code");
  const ok = !error && data === true;
  if (!ok) {
    assistantCode = "";
    window.localStorage.removeItem(ASSISTANT_STORAGE_KEY);
    if (preferredRole === "assistant") {
      preferredRole = "";
      window.localStorage.removeItem(ROLE_STORAGE_KEY);
    }
    rebuildSupabaseClient();
    if (!silent) showToast("助理访问码已失效");
  }
  setAssistantAccessState(ok);
  return ok;
}

function setAssistantAccessState(nextHasAccess) {
  hasAssistantAccess = nextHasAccess;
  applyRoleUI();
}

function setupAdminMode() {
  els.adminModeButton.addEventListener("click", handleAdminModeButton);
  els.switchAssistantButton.addEventListener("click", switchToAssistantView);
  els.modeLogoutButton.addEventListener("click", logoutCurrentMode);
  document.querySelector("#closeAdminModal").addEventListener("click", closeAdminModal);
  document.querySelector("#adminLoginButton").addEventListener("click", loginAdmin);
  document.querySelector("#adminLogoutButton").addEventListener("click", logoutAdmin);
  document.querySelector("#addAdminButton").addEventListener("click", addAdminCode);
  document.querySelector("#setAssistantCodeButton").addEventListener("click", setAssistantCode);
  document.querySelector("#setPrimaryAdminCodeButton").addEventListener("click", setPrimaryAdminCode);
  els.adminModal.addEventListener("click", (event) => {
    if (event.target === els.adminModal) closeAdminModal();
  });
  els.adminCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") loginAdmin();
  });
}

async function handleAdminModeButton() {
  if (!isAdmin && adminCode) {
    rebuildSupabaseClient();
    const ok = await verifyAdminSession();
    if (ok) {
      await reloadAndRender("已切回管理员模式");
      return;
    }
  }
  openAdminModal();
}

function switchToAssistantView() {
  if (!isAdmin) return;
  setAdminState(false);
  rememberRole("assistant");
  closeAdminModal();
  if (currentPage === "templates") openPage("today");
  if (!hasAssistantAccess) {
    renderAccessRequired();
    openAssistantAccessModal();
    showToast("已切到助理视角，请输入助理访问码");
    return;
  }
  renderAll();
  showToast("已切到助理视角");
}

function openAdminModal() {
  els.adminModal.hidden = false;
  renderAdminModal();
  if (!isAdmin) {
    setInlineStatus(els.adminLoginStatus);
    window.setTimeout(() => els.adminCodeInput.focus(), 0);
  }
}

function closeAdminModal() {
  els.adminModal.hidden = true;
}

function renderAdminModal() {
  els.adminLoginPanel.hidden = isAdmin;
  els.adminManagePanel.hidden = !isAdmin;
}

async function loginAdmin() {
  const code = els.adminCodeInput.value.trim();
  setInlineStatus(els.adminLoginStatus);
  if (!code) {
    setInlineStatus(els.adminLoginStatus, "请输入管理员密码", "error");
    return showToast("请输入管理员密码");
  }
  setButtonLoading(els.adminLoginButton, true, "登录中...");
  try {
    await loginAdminWithCode(code, els.adminLoginStatus);
  } finally {
    setButtonLoading(els.adminLoginButton, false);
  }
}

async function loginAdminWithCode(code, statusElement = els.adminLoginStatus) {
  adminCode = code;
  rebuildSupabaseClient();
  const ok = await verifyAdminSession({ silent: true });
  if (!ok) {
    adminCode = "";
    window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    rebuildSupabaseClient();
    setInlineStatus(statusElement, "管理员密码不对，请重新输入", "error");
    return showToast("管理员密码不对");
  }
  window.localStorage.setItem(ADMIN_STORAGE_KEY, adminCode);
  rememberRole("admin");
  els.adminCodeInput.value = "";
  els.assistantCodeInput.value = "";
  closeAssistantAccessModal();
  closeAdminModal();
  await reloadAndRender("已进入管理员模式");
}

async function verifyAdminSession({ silent = false } = {}) {
  if (!adminCode || !db) {
    setAdminState(false);
    return false;
  }
  const { data, error } = await db.rpc("verify_admin_code");
  const ok = !error && data === true;
  if (!ok) {
    adminCode = "";
    window.localStorage.removeItem(ADMIN_STORAGE_KEY);
    if (preferredRole === "admin") {
      preferredRole = "";
      window.localStorage.removeItem(ROLE_STORAGE_KEY);
    }
    rebuildSupabaseClient();
    if (!silent) showToast("管理员密码已失效");
  }
  setAdminState(ok);
  return ok;
}

async function addAdminCode() {
  if (!requireAdmin()) return;
  const name = els.newAdminName.value.trim();
  const code = els.newAdminCode.value.trim();
  if (!name || !code) return showToast("名称和密码都要填");
  if (code.length < 8) return showToast("密码建议至少 8 位");

  const { error } = await db.rpc("add_admin_code", {
    admin_name: name,
    admin_secret: code,
  });
  if (error) return showToast(`新增失败：${error.message}`);
  els.newAdminName.value = "";
  els.newAdminCode.value = "";
  showToast("新管理员已添加");
}

function setInlineStatus(element, message = "", type = "") {
  if (!element) return;
  element.textContent = message;
  element.className = type ? `inline-status ${type}` : "inline-status";
}

function setButtonLoading(button, isLoading, loadingText = "更新中...") {
  if (!button) return "";
  if (isLoading) {
    const originalText = button.textContent;
    button.dataset.originalText = originalText;
    button.textContent = loadingText;
    button.disabled = true;
    return originalText;
  }
  button.textContent = button.dataset.originalText || button.textContent;
  button.disabled = false;
  delete button.dataset.originalText;
  return "";
}

async function setAssistantCode() {
  if (!requireAdmin()) return;
  const code = els.newAssistantCode.value.trim();
  if (!code) {
    setInlineStatus(els.assistantCodeStatus, "请输入新的助理访问码", "error");
    return showToast("请输入新的助理访问码");
  }
  if (code.length < 4) {
    setInlineStatus(els.assistantCodeStatus, "访问码至少 4 位", "error");
    return showToast("访问码至少 4 位");
  }
  if (!window.confirm(`确认把助理访问码改成「${code}」吗？`)) {
    setInlineStatus(els.assistantCodeStatus, "已取消修改助理访问码");
    return;
  }

  setInlineStatus(els.assistantCodeStatus, "正在更新助理访问码...", "pending");
  setButtonLoading(els.setAssistantCodeButton, true);
  try {
    const { error } = await db.rpc("set_assistant_code", {
      assistant_name: "助理访问码",
      assistant_secret: code,
    });
    if (error) throw error;

    assistantCode = code;
    hasAssistantAccess = true;
    window.localStorage.setItem(ASSISTANT_STORAGE_KEY, assistantCode);
    rebuildSupabaseClient();
    els.newAssistantCode.value = "";
    setInlineStatus(els.assistantCodeStatus, "已更新成功，助理下次使用新访问码进入。", "success");
    showToast("助理访问码已更新");
  } catch (error) {
    setInlineStatus(els.assistantCodeStatus, `更新失败：${error.message}`, "error");
    showToast("助理访问码更新失败");
  } finally {
    setButtonLoading(els.setAssistantCodeButton, false);
  }
}

async function setPrimaryAdminCode() {
  if (!requireAdmin()) return;
  const code = els.newPrimaryAdminCode.value.trim();
  if (!code) {
    setInlineStatus(els.primaryAdminCodeStatus, "请输入新的管理员主密码", "error");
    return showToast("请输入新的管理员主密码");
  }
  if (code.length < 4) {
    setInlineStatus(els.primaryAdminCodeStatus, "管理员主密码至少 4 位", "error");
    return showToast("管理员主密码至少 4 位");
  }
  if (!window.confirm("确认修改管理员主密码吗？改完后旧管理员主密码会失效。")) {
    setInlineStatus(els.primaryAdminCodeStatus, "已取消修改管理员主密码");
    return;
  }

  setInlineStatus(els.primaryAdminCodeStatus, "正在更新管理员主密码...", "pending");
  setButtonLoading(els.setPrimaryAdminCodeButton, true);
  try {
    const { error } = await db.rpc("set_primary_admin_code", {
      admin_name: "海岩管理员",
      admin_secret: code,
    });
    if (error) throw error;

    adminCode = code;
    window.localStorage.setItem(ADMIN_STORAGE_KEY, adminCode);
    rememberRole("admin");
    rebuildSupabaseClient();
    setAdminState(true);
    els.newPrimaryAdminCode.value = "";
    setInlineStatus(els.primaryAdminCodeStatus, "已更新成功，新的管理员主密码已经生效。", "success");
    showToast("管理员主密码已更新");
  } catch (error) {
    setInlineStatus(els.primaryAdminCodeStatus, `更新失败：${error.message}`, "error");
    showToast("管理员主密码更新失败");
  } finally {
    setButtonLoading(els.setPrimaryAdminCodeButton, false);
  }
}

function logoutAdmin() {
  adminCode = "";
  window.localStorage.removeItem(ADMIN_STORAGE_KEY);
  if (preferredRole === "admin") {
    preferredRole = "";
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
  }
  rebuildSupabaseClient();
  setAdminState(false);
  closeAdminModal();
  if (currentPage === "templates") openPage("today");
  if (hasAssistantAccess) {
    renderAll();
    showToast("已切回助理模式");
  } else {
    renderAccessRequired();
    openAssistantAccessModal();
    showToast("已退出管理员模式");
  }
}

function logoutAssistant() {
  assistantCode = "";
  hasAssistantAccess = false;
  window.localStorage.removeItem(ASSISTANT_STORAGE_KEY);
  if (preferredRole === "assistant") {
    preferredRole = "";
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
  }
  rebuildSupabaseClient();
  closeAssistantAccessModal();
  closeAdminModal();
  if (currentPage === "templates") openPage("today");
  applyRoleUI();
  renderAccessRequired();
  openAssistantAccessModal();
  showToast("已退出助理模式");
}

function logoutCurrentMode() {
  if (isAdmin) {
    logoutAdmin();
    return;
  }
  if (hasAssistantAccess) {
    logoutAssistant();
    return;
  }
  showToast("当前还没有登录");
}

function setAdminState(nextIsAdmin) {
  isAdmin = nextIsAdmin;
  if (isAdmin) closeAssistantAccessModal();
  applyRoleUI();
  renderAdminModal();
}

function applyRoleUI() {
  const hasAccess = canAccessData();
  document.body.classList.toggle("is-admin", isAdmin);
  document.body.classList.toggle("is-assistant", !isAdmin);
  document.body.classList.toggle("is-locked", !hasAccess);
  els.roleLabel.textContent = isAdmin
    ? "管理员模式"
    : hasAccess
      ? "助理模式"
      : "需要访问码";
  els.roleHint.textContent = isAdmin
    ? "可新建、修改、删除和新增管理员"
    : hasAccess
      ? "可查看、复制话术、勾选已发送"
      : "选择身份并输入密码后进入";
  els.adminModeButton.textContent = "管理设置";
  els.adminModeButton.hidden = !isAdmin;
  els.switchAssistantButton.hidden = !isAdmin;
  els.modeLogoutButton.hidden = !hasAccess;
  document.querySelectorAll("[data-admin-only]").forEach((element) => {
    element.classList.toggle("admin-only-hidden", !isAdmin);
  });
  if (!isAdmin && currentPage === "templates") currentPage = "today";
  syncActivePage();
  updateReminderUI();
}

function requireAdmin() {
  if (isAdmin) return true;
  showToast("请先进入管理员模式");
  openAssistantAccessModal("admin");
  return false;
}

function canAccessData() {
  return isAdmin || hasAssistantAccess;
}

function setupReminderControls() {
  els.reminderButton.addEventListener("click", toggleReminders);
  els.calendarExportButton.addEventListener("click", exportCalendarReminders);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      renderTodayHeader();
      renderTodayList();
      checkDueReminders();
      updateReminderUI();
    }
  });
  updateReminderUI();
}

async function toggleReminders() {
  if (!canAccessData()) {
    showToast("请先登录后再开启提醒");
    openAssistantAccessModal();
    return;
  }

  if (remindersEnabled) {
    remindersEnabled = false;
    window.localStorage.removeItem(REMINDER_ENABLED_KEY);
    updateReminderUI();
    showToast("到点提醒已关闭");
    return;
  }

  remindersEnabled = true;
  window.localStorage.setItem(REMINDER_ENABLED_KEY, "1");
  prepareReminderAudio();
  const permission = await requestNotificationPermission();
  updateReminderUI();
  if (permission === "granted") {
    showToast("提醒已开启，到点会弹通知", 2600);
  } else if (permission === "denied") {
    showToast("页面提醒已开，系统通知被浏览器拦截", 3200);
  } else {
    showToast("页面提醒已开启，请保持页面打开", 2800);
  }
  checkDueReminders({ force: true });
}

function exportCalendarReminders() {
  if (!canAccessData()) {
    showToast("请先登录后再导入日历");
    openAssistantAccessModal();
    return;
  }

  showToast("正在打开日历文件，按手机提示添加即可", 3600);
  window.location.href = HOSTED_CALENDAR_FILE;
}

function buildCalendarICS(tasks) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Training Camp Notice Assistant//CN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:训练营消息提醒",
  ];

  tasks.forEach((task) => {
    const camp = getCamp(task.camp_id);
    const lesson = getLesson(task.lesson_id);
    const start = parseDate(task.send_at);
    const end = addMinutes(start, 15);
    const groups = statusesForTask(task.id).map((status) => status.group_name);
    const title = `发群：${task.type_label}｜${camp?.name || "训练营"}`;
    const description = [
      `课程：${lesson?.title || camp?.topic || "-"}`,
      `上课：${formatClassTime(task)}`,
      `微信群：${groups.join("、") || "-"}`,
      "",
      "话术：",
      task.message || "",
    ].join("\n");

    lines.push(
      "BEGIN:VEVENT",
      `UID:${escapeICSText(task.id)}@training-camp-notice-assistant`,
      `DTSTAMP:${formatICSUTC(new Date())}`,
      `DTSTART:${formatICSLocal(start)}`,
      `DTEND:${formatICSLocal(end)}`,
      `SUMMARY:${escapeICSText(title)}`,
      `DESCRIPTION:${escapeICSText(description)}`,
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      `DESCRIPTION:${escapeICSText(title)}`,
      "TRIGGER:PT0M",
      "END:VALARM",
      "END:VEVENT"
    );
  });

  lines.push("END:VCALENDAR");
  return lines.map(foldICSLine).join("\r\n");
}

function downloadTextFile(filename, text, mimeType) {
  const blob = new Blob([text], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function formatICSLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function formatICSUTC(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function escapeICSText(value) {
  return String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function foldICSLine(line) {
  if (line.length <= 70) return line;
  const chunks = [];
  let rest = line;
  while (rest.length > 70) {
    chunks.push(rest.slice(0, 70));
    rest = rest.slice(70);
  }
  chunks.push(rest);
  return chunks.join("\r\n ");
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission === "default") {
    try {
      return await Notification.requestPermission();
    } catch (error) {
      return "unsupported";
    }
  }
  return Notification.permission;
}

function updateReminderUI() {
  if (!els.reminderButton || !els.reminderHint) return;
  const hasAccess = canAccessData();
  els.reminderButton.disabled = !hasAccess;
  els.calendarExportButton.disabled = !hasAccess;
  els.reminderButton.classList.toggle("active", remindersEnabled && hasAccess);
  els.reminderButton.textContent = remindersEnabled && hasAccess ? "关闭提醒" : "开启提醒";

  if (!hasAccess) {
    els.reminderHint.textContent = "登录后可开启提醒";
    return;
  }
  if (!remindersEnabled) {
    els.reminderHint.textContent = "点一次授权，到发送时间会提醒";
    return;
  }
  if (!("Notification" in window)) {
    els.reminderHint.textContent = "页面提醒已开；当前浏览器不支持系统通知";
    return;
  }
  if (Notification.permission === "granted") {
    els.reminderHint.textContent = "提醒已开，请保持页面打开";
    return;
  }
  if (Notification.permission === "denied") {
    els.reminderHint.textContent = "页面提醒已开；系统通知被浏览器拦截";
    return;
  }
  els.reminderHint.textContent = "提醒已开；下次可允许系统通知";
}

function checkDueReminders({ force = false } = {}) {
  if (!remindersEnabled || !canAccessData()) return;
  const now = new Date();
  const dueTasks = tasksForDate(toDateInput(now))
    .filter((task) => !isTaskDone(task) && parseDate(task.send_at) <= now)
    .sort(compareTaskTime);
  const readyTasks = dueTasks.filter((task) => shouldSendReminder(task, now, force));
  if (!readyTasks.length) return;

  const taskToOpen = readyTasks[0];
  readyTasks.forEach((task) => {
    reminderLastMap[task.id] = now.getTime();
  });
  saveReminderLastMap();

  if (readyTasks.length === 1) {
    notifySingleTask(readyTasks[0]);
  } else {
    notifyTaskSummary(readyTasks);
  }
  playReminderTone();
  vibrateReminder();
  flashDocumentTitle(taskToOpen.type_label || "该发送了");
}

function shouldSendReminder(task, now, force) {
  if (force) return true;
  const last = Number(reminderLastMap[task.id] || 0);
  if (!last) return true;
  return now.getTime() - last >= REMINDER_REPEAT_MINUTES * 60000;
}

function notifySingleTask(task) {
  const { title, body, toast } = buildReminderCopy(task);
  showToast(toast, 5200);
  sendBrowserNotification(title, body, task.id);
}

function notifyTaskSummary(tasks) {
  const first = tasks[0];
  const title = `有 ${tasks.length} 条消息该发送了`;
  const body = tasks
    .slice(0, 3)
    .map((task) => {
      const camp = getCamp(task.camp_id);
      return `${formatClock(task.send_at)} ${task.type_label}｜${camp?.name || "训练营"}`;
    })
    .join("\n");
  showToast(`有 ${tasks.length} 条消息该发送了，先看最早的一条`, 5600);
  sendBrowserNotification(title, body, first.id);
}

function buildReminderCopy(task) {
  const camp = getCamp(task.camp_id);
  const lesson = getLesson(task.lesson_id);
  const unsent = statusesForTask(task.id).filter((status) => !status.sent).length;
  const title = `该发消息了：${formatClock(task.send_at)} ${task.type_label}`;
  const body = `${camp?.name || "训练营"}｜${lesson?.title || camp?.topic || "课程提醒"}\n还有 ${unsent} 个群未发送`;
  return {
    title,
    body,
    toast: `${formatClock(task.send_at)} ${task.type_label}该发了，还有 ${unsent} 个群未发`,
  };
}

function sendBrowserNotification(title, body, taskId) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  try {
    const notification = new Notification(title, {
      body,
      tag: `training-camp-task-${taskId}`,
      renotify: true,
      requireInteraction: true,
    });
    notification.onclick = () => {
      window.focus();
      openTaskDetail(taskId);
      notification.close();
    };
  } catch (error) {
    showToast("浏览器通知被拦截，请保持页面打开", 2600);
  }
}

function prepareReminderAudio() {
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    reminderAudioContext = reminderAudioContext || new AudioContextClass();
    reminderAudioContext.resume?.();
  } catch (error) {
    reminderAudioContext = null;
  }
}

function playReminderTone() {
  try {
    prepareReminderAudio();
    if (!reminderAudioContext) return;
    const ctx = reminderAudioContext;
    const startAt = ctx.currentTime + 0.02;
    [0, 0.34].forEach((offset) => {
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = 880;
      gain.gain.setValueAtTime(0.0001, startAt + offset);
      gain.gain.exponentialRampToValueAtTime(0.22, startAt + offset + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, startAt + offset + 0.2);
      oscillator.connect(gain);
      gain.connect(ctx.destination);
      oscillator.start(startAt + offset);
      oscillator.stop(startAt + offset + 0.22);
    });
  } catch (error) {
    // Some mobile webviews block audio even after a tap; toast/notification still works.
  }
}

function vibrateReminder() {
  if (navigator.vibrate) navigator.vibrate([260, 120, 260]);
}

function flashDocumentTitle(label) {
  const originalTitle = document.title;
  let count = 0;
  window.clearInterval(flashDocumentTitle.timer);
  flashDocumentTitle.timer = window.setInterval(() => {
    document.title = count % 2 === 0 ? `【提醒】${label}` : originalTitle;
    count += 1;
    if (count > 10) {
      window.clearInterval(flashDocumentTitle.timer);
      document.title = originalTitle;
    }
  }, 750);
}

function readReminderLastMap() {
  try {
    return JSON.parse(window.localStorage.getItem(REMINDER_LAST_KEY) || "{}") || {};
  } catch (error) {
    return {};
  }
}

function saveReminderLastMap() {
  window.localStorage.setItem(REMINDER_LAST_KEY, JSON.stringify(reminderLastMap));
}

function setupGlobalActions() {
  document.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-copy-task]");
    const openButton = event.target.closest("[data-open-task]");
    const allButton = event.target.closest("[data-mark-all]");
    const unmarkAllButton = event.target.closest("[data-unmark-all]");
    const dayButton = event.target.closest("[data-date]");
    const saveTimeButton = event.target.closest("[data-save-detail-time]");
    const toggleGroupButton = event.target.closest("[data-toggle-group]");
    const copyGroupButton = event.target.closest("[data-copy-group-name]");
    const openWechatButton = event.target.closest("[data-open-wechat-group]");
    const deleteCampButton = event.target.closest("[data-delete-camp]");

    if (copyButton) {
      const task = getTask(copyButton.dataset.copyTask);
      if (task) await copyTaskMessage(task);
      return;
    }
    if (copyGroupButton) {
      await copyGroupName(copyGroupButton.dataset.copyGroupName);
      return;
    }
    if (openWechatButton) {
      await openWechatGroup(openWechatButton.dataset.openWechatGroup);
      return;
    }
    if (allButton) {
      await markAllGroups(allButton.dataset.markAll);
      return;
    }
    if (unmarkAllButton) {
      await unmarkAllGroups(unmarkAllButton.dataset.unmarkAll);
      return;
    }
    if (dayButton) {
      selectedCalendarDate = dayButton.dataset.date;
      renderCalendar();
      return;
    }
    if (saveTimeButton) {
      if (!requireAdmin()) return;
      await saveDetailEdits(saveTimeButton.dataset.saveDetailTime);
      return;
    }
    if (toggleGroupButton) {
      await toggleGroup(toggleGroupButton.dataset.statusId);
      return;
    }
    if (deleteCampButton) {
      if (!requireAdmin()) return;
      await cloudDelete(SUPABASE_TABLES.camps, deleteCampButton.dataset.deleteCamp);
      await reloadAndRender("训练营已删除");
      return;
    }
    if (openButton) {
      openTaskDetail(openButton.dataset.openTask);
    }
  });

  document.querySelector("#closeDetail").addEventListener("click", closeTaskDetail);
  document.querySelector("#detailCopy").addEventListener("click", async () => {
    const task = getTask(activeTaskId);
    if (task) await copyTaskMessage(task);
  });
}

function addGroupField(value) {
  const row = document.createElement("div");
  row.className = "group-field";
  row.innerHTML = `
    <input class="group-input" type="text" placeholder="微信群名称" value="${escapeHTML(value)}" />
    <button class="secondary-button" type="button" data-remove-group>删除</button>
  `;
  els.groupFields.appendChild(row);
}

function addLessonField(lesson) {
  const row = document.createElement("div");
  row.className = "lesson-field";
  row.innerHTML = `
    <div class="lesson-head">
      <strong data-lesson-label>第 ${lesson.sort_order || 1} 节</strong>
      <button class="text-button" type="button" data-remove-lesson>删除</button>
    </div>
    <div class="lesson-meta">
      <label>
        <span>第几天</span>
        <input class="lesson-day" type="number" min="1" step="1" value="${escapeHTML(lesson.day_number || 1)}" />
      </label>
      <label>
        <span>类型</span>
        <select class="lesson-kind">
          <option value="正课" ${lesson.kind === "正课" ? "selected" : ""}>正课</option>
          <option value="点评" ${lesson.kind === "点评" ? "selected" : ""}>点评</option>
        </select>
      </label>
    </div>
    <label>
      <span>课程主题</span>
      <input class="lesson-title" type="text" placeholder="课程主题" value="${escapeHTML(lesson.title || "")}" />
    </label>
    <label>
      <span>课程内容</span>
      <textarea class="lesson-detail" rows="3" placeholder="这节课会讲什么">${escapeHTML(lesson.detail || "")}</textarea>
    </label>
  `;
  els.lessonFields.appendChild(row);
  updateLessonNumbers();
}

function applyFirstCloudPreset() {
  const preset = state.presets[0];
  if (!preset) return showToast("云端还没有课程预设");
  const items = state.presetItems
    .filter((item) => item.preset_id === preset.id)
    .sort((a, b) => a.sort_order - b.sort_order);

  document.querySelector("#campName").value = preset.camp_name || preset.name || "";
  document.querySelector("#topic").value = preset.topic || "";
  document.querySelector("#teacher").value = preset.teacher || "";
  document.querySelector("#classTime").value = preset.class_time || "20:00";
  document.querySelector("#durationMinutes").value = preset.duration_minutes || 90;
  document.querySelector("#highlights").value = preset.highlights || "";
  document.querySelector("#audience").value = preset.audience || "";
  els.groupFields.innerHTML = "";
  (preset.groups || []).forEach((group) => addGroupField(group));
  if (!els.groupFields.querySelector(".group-field")) addGroupField("");
  els.lessonFields.innerHTML = "";
  items.forEach((item) => addLessonField(item));
  if (!items.length) addLessonField({ day_number: 1, kind: "正课", title: "", detail: "", sort_order: 1 });
  updateEndDateFromLessons();
  renderDraftPreview();
  showToast("已套用云端预设");
}

function renderTemplateSelects() {
  els.templateSelects.innerHTML = TASK_TYPES.map((type) => {
    const options = templatesForType(type.id)
      .map((template) => `<option value="${template.id}">${escapeHTML(template.name)}</option>`)
      .join("");
    return `
      <label class="template-choice">
        <span>${type.short}</span>
        <select data-template-choice="${type.id}">
          ${options || `<option value="">请先添加模板</option>`}
        </select>
      </label>
    `;
  }).join("");
}

function renderDraftPreview() {
  const camp = getCampFormData();
  const firstLesson = camp.lessons[0];
  els.draftList.innerHTML = TASK_TYPES.map((type) => {
    const message = generateMessage(type.id, camp, 1, camp.start_date, firstLesson);
    return `
      <div class="draft-item">
        <strong>${type.label}</strong><br />
        ${escapeHTML(firstLine(message) || "请先在模板库保存对应话术")}
      </div>
    `;
  }).join("");
}

function getCampFormData() {
  return {
    name: document.querySelector("#campName").value.trim(),
    topic: document.querySelector("#topic").value.trim(),
    teacher: document.querySelector("#teacher").value.trim(),
    start_date: document.querySelector("#startDate").value,
    end_date: document.querySelector("#endDate").value,
    class_time: document.querySelector("#classTime").value,
    duration_minutes: Number(document.querySelector("#durationMinutes").value) || 90,
    live_link: document.querySelector("#liveLink").value.trim(),
    highlights: document.querySelector("#highlights").value.trim(),
    audience: document.querySelector("#audience").value.trim(),
    notes: document.querySelector("#notes").value.trim(),
    groups: [...document.querySelectorAll(".group-input")].map((input) => input.value.trim()).filter(Boolean),
    lessons: getLessonFormData(),
    template_choices: Object.fromEntries(
      TASK_TYPES.map((type) => [type.id, document.querySelector(`[data-template-choice="${type.id}"]`)?.value])
    ),
  };
}

function getLessonFormData() {
  return [...els.lessonFields.querySelectorAll(".lesson-field")]
    .map((row, index) => ({
      day_number: Math.max(1, Number(row.querySelector(".lesson-day").value) || index + 1),
      kind: row.querySelector(".lesson-kind").value,
      title: row.querySelector(".lesson-title").value.trim(),
      detail: row.querySelector(".lesson-detail").value.trim(),
      sort_order: index + 1,
    }))
    .filter((lesson) => lesson.title);
}

async function createCampFromForm(event) {
  event.preventDefault();
  if (!requireAdmin()) return;
  if (!db) return showToast("请先配置 Supabase");
  const camp = getCampFormData();
  if (!camp.name || !camp.topic || !camp.start_date || !camp.end_date || !camp.class_time) {
    return showToast("训练营、主题和时间要填");
  }
  if (!camp.groups.length) return showToast("至少添加一个微信群");
  if (!camp.lessons.length) return showToast("至少添加一节课");
  if (!TASK_TYPES.every((type) => camp.template_choices[type.id])) {
    return showToast("请先为中午和课前选择模板");
  }

  const maxDay = Math.max(...camp.lessons.map((lesson) => lesson.day_number));
  camp.end_date = toDateInput(addDays(parseDateOnly(camp.start_date), maxDay - 1));

  const { groups, lessons, template_choices, ...campRow } = camp;
  const savedCamp = await cloudInsert(SUPABASE_TABLES.camps, campRow, true);
  const savedGroups = await cloudInsertMany(
    SUPABASE_TABLES.groups,
    groups.map((name, index) => ({ camp_id: savedCamp.id, name, position: index + 1 })),
    true
  );
  const savedLessons = await cloudInsertMany(
    SUPABASE_TABLES.lessons,
    lessons.map((lesson) => ({ ...lesson, camp_id: savedCamp.id })),
    true
  );

  const taskRows = [];
  savedLessons
    .sort((a, b) => a.sort_order - b.sort_order)
    .forEach((lesson, index) => {
      taskRows.push(...createTaskRows(savedCamp, lesson, index + 1, template_choices));
    });
  const savedTasks = await cloudInsertMany(SUPABASE_TABLES.tasks, taskRows, true);
  const statusRows = savedTasks.flatMap((task) =>
    savedGroups.map((group) => ({
      task_id: task.id,
      group_id: group.id,
      group_name: group.name,
      sent: false,
      sent_at: null,
    }))
  );
  await cloudInsertMany(SUPABASE_TABLES.statuses, statusRows, false);

  resetCampForm();
  await reloadAndRender("排期已生成");
  openPage("today");
}

function createTaskRows(camp, lesson, lessonIndex, templateChoices) {
  const date = toDateInput(addDays(parseDateOnly(camp.start_date), lesson.day_number - 1));
  const classStart = parseLocalDateTime(date, camp.class_time);
  const sendTimes = {
    noon: parseLocalDateTime(date, "12:00"),
    before: addMinutes(classStart, -60),
  };
  return TASK_TYPES.map((type) => ({
    camp_id: camp.id,
    lesson_id: lesson.id,
    type: type.id,
    type_label: type.label,
    lesson_index: lessonIndex,
    class_date: date,
    send_at: toDateTimeInput(sendTimes[type.id]),
    message: generateMessage(type.id, camp, lessonIndex, date, lesson, templateChoices[type.id]),
    completed_at: null,
  }));
}

function resetCampForm() {
  els.campForm.reset();
  els.groupFields.innerHTML = "";
  els.lessonFields.innerHTML = "";
  const today = new Date();
  document.querySelector("#startDate").value = toDateInput(today);
  document.querySelector("#endDate").value = toDateInput(addDays(today, 7));
  document.querySelector("#classTime").value = "20:00";
  document.querySelector("#durationMinutes").value = "90";
  addGroupField("");
  addLessonField({ day_number: 1, kind: "正课", title: "", detail: "", sort_order: 1 });
  els.campForm.classList.remove("open");
  renderTemplateSelects();
  renderDraftPreview();
}

function renderAll() {
  renderTodayHeader();
  renderTodayList();
  renderCalendar();
  renderCamps();
  renderTemplates();
  renderTemplateSelects();
  if (activeTaskId) renderTaskDetail(activeTaskId);
  applyRoleUI();
  updateReminderUI();
  checkDueReminders();
}

function renderTodayHeader() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "long" });
  els.todayWeek.textContent = "今天";
  els.todayDate.textContent = formatter.format(now);
  const tasks = tasksForDate(toDateInput(now));
  const done = tasks.filter(isTaskDone).length;
  els.todayTotal.textContent = tasks.length;
  els.todayDone.textContent = done;
  els.todayPending.textContent = Math.max(tasks.length - done, 0);
}

function renderTodayList() {
  const tasks = tasksForDate(toDateInput(new Date())).sort(compareTaskTime);
  els.todayList.innerHTML = tasks.length
    ? tasks.map(renderTaskCard).join("")
    : `<div class="empty-state">今天暂无消息排期</div>`;
}

function renderTaskCard(task) {
  const camp = getCamp(task.camp_id);
  const lesson = getLesson(task.lesson_id);
  const status = getTaskStatus(task);
  const statuses = statusesForTask(task.id);
  const sent = statuses.filter((item) => item.sent).length;
  const total = statuses.length;
  const lessonPrefix = lesson ? `第${task.lesson_index || lesson.sort_order}节 · ${lesson.kind}` : "课程";
  return `
    <article class="message-card ${status.level}" data-open-task="${task.id}">
      <div class="message-head">
        <div class="send-time">${formatClock(task.send_at)}</div>
        <div class="message-main">
          <h3>${escapeHTML(camp?.name || "未命名训练营")}</h3>
          <p>${escapeHTML(lessonPrefix)} · ${escapeHTML(lesson?.title || camp?.topic || "-")} · 上课 ${escapeHTML(formatClassTime(task))}</p>
        </div>
        <span class="status-pill ${status.level}">${status.label}</span>
      </div>
      <div class="card-meta">
        <div class="meta-box"><span>发送类型</span><b>${escapeHTML(task.type_label)}</b></div>
        <div class="meta-box"><span>微信群</span><b>${total} 个群</b></div>
        <div class="meta-box"><span>进度</span><b>${sent} 已发 / ${total - sent} 未发</b></div>
      </div>
      <div class="message-preview">${escapeHTML(firstLine(task.message))}</div>
      <div class="card-actions">
        <button class="secondary-button" type="button" data-copy-task="${task.id}">复制话术</button>
        <button class="secondary-button" type="button" data-open-task="${task.id}">群列表</button>
        <button class="primary-button" type="button" data-mark-all="${task.id}">全标已发</button>
        <button class="secondary-button" type="button" data-unmark-all="${task.id}">取消已发</button>
      </div>
    </article>
  `;
}

function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  els.monthTitle.textContent = `${year}年${month + 1}月`;
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const gridStart = addDays(first, -startOffset);
  const cells = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));

  els.calendarGrid.innerHTML = cells.map((date) => {
    const dateKey = toDateInput(date);
    const types = [...new Set(tasksForDate(dateKey).map((task) => task.type))];
    return `
      <button class="day-cell ${date.getMonth() === month ? "in-month" : ""} ${isSameDate(date, new Date()) ? "today" : ""} ${
        selectedCalendarDate === dateKey ? "selected" : ""
      }" type="button" data-date="${dateKey}">
        <span class="day-number">${date.getDate()}</span>
        <span class="day-dots">${types.map((type) => `<i class="dot ${type}"></i>`).join("")}</span>
      </button>
    `;
  }).join("");

  els.selectedDateTitle.textContent = `${formatDateOnly(selectedCalendarDate)}任务`;
  const dayTasks = tasksForDate(selectedCalendarDate).sort(compareTaskTime);
  els.calendarDayList.innerHTML = dayTasks.length
    ? dayTasks.map(renderTaskCard).join("")
    : `<div class="empty-state">这天暂无消息任务</div>`;
}

function renderCamps() {
  if (!state.camps.length) {
    els.campList.innerHTML = `<div class="empty-state">还没有训练营排期</div>`;
    return;
  }
  els.campList.innerHTML = state.camps
    .slice()
    .sort((a, b) => parseDateOnly(a.start_date) - parseDateOnly(b.start_date))
    .map((camp) => {
      const tasks = state.tasks.filter((task) => task.camp_id === camp.id);
      const done = tasks.filter(isTaskDone).length;
      const todayCount = tasks.filter((task) => isSameDate(parseDate(task.send_at), new Date())).length;
      const progress = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
      const days = datesBetween(camp.start_date, camp.end_date).length;
      return `
        <article class="camp-card">
          <div class="camp-top">
            <div>
              <h3>${escapeHTML(camp.name)}</h3>
              <p>${escapeHTML(formatDateOnly(camp.start_date))} - ${escapeHTML(formatDateOnly(camp.end_date))} · 共 ${days} 天</p>
            </div>
            <span class="status-pill ${todayCount ? "due" : "pending"}">${todayCount ? "今日有任务" : "今日无任务"}</span>
          </div>
          <div class="progress-track"><div class="progress-fill" style="width:${progress}%"></div></div>
          <div class="camp-stats">
            <div><span>发送群</span><b>${groupsForCamp(camp.id).length} 个</b></div>
            <div><span>任务进度</span><b>${done}/${tasks.length}</b></div>
            <div><span>完成率</span><b>${progress}%</b></div>
          </div>
          <div class="camp-actions ${isAdmin ? "" : "admin-only-hidden"}">
            <button class="danger-button" type="button" data-delete-camp="${camp.id}">删除训练营</button>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderTemplates() {
  if (!isAdmin) {
    closeTemplateForm();
    els.templateForm.classList.add("admin-only-hidden");
    els.templateList.innerHTML = `
      <div class="empty-state">
        模板库需要管理员模式。<br />
        助理日常只需要在「今日」复制话术和勾选已发送。
      </div>
    `;
    return;
  }
  els.templateForm.classList.remove("admin-only-hidden");
  els.templateList.innerHTML = state.templates.length
    ? state.templates.map((template) => `
      <article class="template-card">
        <div class="template-summary">
          <div>
            <h3>${escapeHTML(template.name)}</h3>
            <p>${escapeHTML(firstLine(template.content))}</p>
          </div>
          <span class="type-pill">${escapeHTML(typeLabel(template.type))}</span>
        </div>
        <div class="card-actions">
          <button class="secondary-button" type="button" data-edit-template="${template.id}">编辑</button>
          <button class="danger-button" type="button" data-delete-template="${template.id}">删除</button>
        </div>
        <div class="template-edit">
          <input type="text" value="${escapeHTML(template.name)}" data-template-name="${template.id}" />
          <select data-template-type="${template.id}">
            ${templateTypeOptions(template.type)}
          </select>
          <textarea rows="5" data-template-content="${template.id}">${escapeHTML(template.content)}</textarea>
          <button class="primary-button full" type="button" data-save-template="${template.id}">保存修改</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">云端还没有话术模板，请先导入 seed.sql 或手动新增。</div>`;
}

function openTaskDetail(taskId) {
  activeTaskId = taskId;
  renderTaskDetail(taskId);
  els.detailView.hidden = false;
}

function closeTaskDetail() {
  activeTaskId = null;
  els.detailView.hidden = true;
  renderAll();
}

function renderTaskDetail(taskId) {
  const task = getTask(taskId);
  if (!task) return;
  const camp = getCamp(task.camp_id);
  const lesson = getLesson(task.lesson_id);
  const statuses = statusesForTask(task.id);
  els.detailType.textContent = task.type_label;
  els.detailTitle.textContent = camp?.name || "群发送详情";
  const detailEditor = isAdmin
    ? `
      <label>
        <span>发送时间</span>
        <input type="datetime-local" value="${escapeHTML(task.send_at.slice(0, 16))}" data-detail-time="${task.id}" />
      </label>
      <button class="secondary-button" type="button" data-save-detail-time="${task.id}">保存时间和话术</button>
    `
    : `
      <div class="readonly-time">
        <span>发送时间</span>
        <b>${escapeHTML(formatClock(task.send_at))}</b>
      </div>
    `;
  const messageEditor = isAdmin
    ? `<textarea rows="8" data-detail-message="${task.id}">${escapeHTML(task.message)}</textarea>`
    : `<div class="readonly-message">${escapeHTML(task.message).replace(/\n/g, "<br>")}</div>`;
  els.detailContent.innerHTML = `
    <div class="detail-time">
      <div class="detail-summary">
        <strong>${escapeHTML(`第${task.lesson_index || lesson?.sort_order || 1}节 · ${lesson?.kind || "课程"} · ${lesson?.title || camp?.topic || "-"}`)}</strong>
        <span>老师：${escapeHTML(camp?.teacher || "-")} · 上课 ${escapeHTML(formatClassTime(task))}</span>
      </div>
      ${detailEditor}
    </div>
    <div class="detail-message">
      <div class="detail-message-head">
        <strong>完整话术</strong>
        <button class="secondary-button mini" type="button" data-copy-task="${task.id}">一键复制</button>
      </div>
      ${messageEditor}
    </div>
    <div class="group-list-panel">
      ${statuses.map((status) => `
        <div class="group-row">
          <div class="group-info">
            <span>${escapeHTML(status.group_name)}</span>
            <div class="group-tools">
              <button type="button" data-copy-group-name="${escapeHTML(status.group_name)}">复制群名</button>
              <button type="button" data-open-wechat-group="${escapeHTML(status.group_name)}">打开微信</button>
            </div>
          </div>
          <button class="${status.sent ? "sent" : "unsent"}" type="button" data-toggle-group data-status-id="${status.id}">
            ${status.sent ? "已发送" : "未发送"}
          </button>
        </div>
      `).join("")}
    </div>
  `;
  els.detailProgress.textContent = `已发送 ${statuses.filter((item) => item.sent).length} / 共 ${statuses.length} 个群`;
}

async function saveDetailEdits(taskId) {
  const message = document.querySelector(`[data-detail-message="${taskId}"]`).value.trim();
  const sendAt = document.querySelector(`[data-detail-time="${taskId}"]`).value;
  await cloudUpdate(SUPABASE_TABLES.tasks, taskId, { message, send_at: sendAt });
  await reloadAndRender("已保存");
}

async function toggleGroup(statusId) {
  const status = state.statuses.find((item) => item.id === statusId);
  if (!status) return;
  const nextSent = !status.sent;
  await cloudUpdate(SUPABASE_TABLES.statuses, statusId, {
    sent: nextSent,
    sent_at: nextSent ? new Date().toISOString() : null,
  });
  await reloadAndRender();
}

async function markAllGroups(taskId) {
  const statuses = statusesForTask(taskId);
  await Promise.all(
    statuses.map((status) =>
      cloudUpdate(SUPABASE_TABLES.statuses, status.id, {
        sent: true,
        sent_at: status.sent_at || new Date().toISOString(),
      })
    )
  );
  await reloadAndRender("已全部标记");
}

async function unmarkAllGroups(taskId) {
  const statuses = statusesForTask(taskId);
  await Promise.all(
    statuses.map((status) =>
      cloudUpdate(SUPABASE_TABLES.statuses, status.id, {
        sent: false,
        sent_at: null,
      })
    )
  );
  await reloadAndRender("已取消标记");
}

async function updateTaskCompletion(taskId) {
  return taskId;
}

async function saveTemplate(templateId) {
  const name = document.querySelector(`[data-template-name="${templateId}"]`).value.trim();
  const type = document.querySelector(`[data-template-type="${templateId}"]`).value;
  const content = document.querySelector(`[data-template-content="${templateId}"]`).value.trim();
  await cloudUpdate(SUPABASE_TABLES.templates, templateId, { name, type, content });
  await reloadAndRender("模板已更新");
}

async function copyTaskMessage(task) {
  const textarea = document.querySelector(`[data-detail-message="${task.id}"]`);
  if (textarea && textarea.value.trim() !== task.message) {
    if (!requireAdmin()) return;
    task.message = textarea.value.trim();
    await cloudUpdate(SUPABASE_TABLES.tasks, task.id, { message: task.message });
  }
  await copyText(task.message || "");
  showToast("话术已复制");
}

async function copyGroupName(groupName) {
  await copyText(groupName || "");
  showToast("群名已复制");
}

async function openWechatGroup(groupName) {
  const name = groupName || "这个群";
  showToast(`正在打开微信。若没跳转，请到微信搜索「${name}」`);
  window.setTimeout(() => {
    showToast(`浏览器可能拦截了微信跳转，请手动打开微信搜索「${name}」`);
  }, 1200);
  window.setTimeout(() => {
    window.location.href = "weixin://";
  }, 180);
}

async function reloadAndRender(toastMessage = "") {
  if (!canAccessData()) {
    renderAccessRequired();
    openAssistantAccessModal();
    return;
  }
  await loadCloudData({ silent: true });
  renderAll();
  if (toastMessage) showToast(toastMessage);
}

async function cloudInsert(table, row, shouldSelect = false) {
  let query = db.from(table).insert(row);
  if (shouldSelect) query = query.select().single();
  const { data, error } = await query;
  if (error) throwAndRender(error);
  return data;
}

async function cloudInsertMany(table, rows, shouldSelect = false) {
  if (!rows.length) return [];
  let query = db.from(table).insert(rows);
  if (shouldSelect) query = query.select();
  const { data, error } = await query;
  if (error) throwAndRender(error);
  return data || [];
}

async function cloudUpdate(table, id, patch) {
  const { error } = await db.from(table).update(patch).eq("id", id);
  if (error) throwAndRender(error);
}

async function cloudDelete(table, id) {
  const { error } = await db.from(table).delete().eq("id", id);
  if (error) throwAndRender(error);
}

function generateMessage(type, camp, lessonIndex, date, lesson, templateId) {
  const template = state.templates.find((item) => item.id === templateId) || templatesForType(type)[0];
  if (!template) return "";
  return fillTemplate(template.content, camp, lessonIndex, date, type, lesson);
}

function fillTemplate(content, camp, lessonIndex, date, type, lesson) {
  const replacements = {
    训练营名称: camp.name || "这期训练营",
    第几天: lesson?.day_number || lessonIndex || 1,
    第几节: lessonIndex || lesson?.sort_order || 1,
    课程主题: lesson?.title || camp.topic || "今晚这节课",
    课程内容: cleanShort(lesson?.detail, "偏实操的内容"),
    课程类型: lesson?.kind || "正课",
    授课老师: camp.teacher || "",
    老师: camp.teacher || "",
    上课日期: date ? formatDateOnly(date) : "今天",
    上课时间: friendlyClassTime(date || camp.start_date, camp.class_time || "20:00"),
    直播链接: camp.live_link || "直播链接稍后发群里",
    课程亮点: cleanShort(lesson?.detail || camp.highlights, "偏实操的内容"),
    适合人群: cleanShort(camp.audience, "想把 AI 用起来的同学"),
    发送类型: typeLabel(type),
    备注: camp.notes || "",
  };
  return content.replace(/\{\{(.+?)\}\}/g, (_, key) => replacements[key.trim()] ?? "");
}

function tasksForDate(dateKey) {
  return state.tasks.filter((task) => toDateInput(parseDate(task.send_at)) === dateKey);
}

function getTaskStatus(task) {
  if (isTaskDone(task)) return { level: "done", label: "已完成" };
  const diff = (new Date() - parseDate(task.send_at)) / 60000;
  if (diff >= 30) return { level: "overdue", label: "超时未发" };
  if (diff >= 0) return { level: "due", label: "该发送了" };
  return { level: "pending", label: "未到时间" };
}

function isTaskDone(task) {
  const statuses = statusesForTask(task.id);
  return statuses.length > 0 && statuses.every((status) => status.sent);
}

function groupsForCamp(campId) {
  return state.groups.filter((group) => group.camp_id === campId).sort((a, b) => a.position - b.position);
}

function statusesForTask(taskId) {
  return state.statuses.filter((status) => status.task_id === taskId);
}

function getTask(taskId) {
  return state.tasks.find((task) => task.id === taskId);
}

function getCamp(campId) {
  return state.camps.find((camp) => camp.id === campId);
}

function getLesson(lessonId) {
  return state.lessons.find((lesson) => lesson.id === lessonId);
}

function templatesForType(type) {
  const usableTypes = TEMPLATE_USAGE_TYPES[type] || [type];
  const exact = state.templates.filter((template) => usableTypes.includes(template.type));
  const general = state.templates.filter((template) => template.type === "general");
  return [...exact, ...general];
}

function typeLabel(type) {
  return TEMPLATE_TYPES.find((item) => item.id === type)?.label || "通用模板";
}

function templateTypeOptions(selected) {
  return TEMPLATE_TYPES
    .map((type) => `<option value="${type.id}" ${type.id === selected ? "selected" : ""}>${type.label}</option>`)
    .join("");
}

function updateLessonNumbers() {
  els.lessonFields.querySelectorAll(".lesson-field").forEach((row, index) => {
    const day = Number(row.querySelector(".lesson-day").value) || index + 1;
    const kind = row.querySelector(".lesson-kind").value;
    row.querySelector("[data-lesson-label]").textContent = `第 ${index + 1} 节 · 第 ${day} 天 · ${kind}`;
  });
}

function updateEndDateFromLessons() {
  updateLessonNumbers();
  const lessons = getLessonFormData();
  const startDate = document.querySelector("#startDate").value;
  if (!lessons.length || !startDate) return;
  document.querySelector("#endDate").value = toDateInput(addDays(parseDateOnly(startDate), Math.max(...lessons.map((lesson) => lesson.day_number)) - 1));
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back below for older mobile browser contexts.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function compareTaskTime(a, b) {
  return parseDate(a.send_at) - parseDate(b.send_at);
}

function datesBetween(startValue, endValue) {
  const start = parseDateOnly(startValue);
  const end = parseDateOnly(endValue);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) return [];
  const dates = [];
  let cursor = start;
  while (cursor <= end) {
    dates.push(toDateInput(cursor));
    cursor = addDays(cursor, 1);
  }
  return dates;
}

function parseDate(value) {
  return new Date(value);
}

function parseDateOnly(value) {
  return new Date(`${value}T00:00`);
}

function parseLocalDateTime(dateValue, timeValue) {
  return new Date(`${dateValue}T${timeValue}`);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toDateTimeInput(date) {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${toDateInput(date)}T${hours}:${minutes}`;
}

function isSameDate(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatDateOnly(value) {
  const date = parseDateOnly(value);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatClock(value) {
  const date = parseDate(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatClassTime(task) {
  const camp = getCamp(task.camp_id);
  return camp ? `${formatDateOnly(task.class_date)} ${camp.class_time}` : "-";
}

function friendlyClassTime(dateValue, timeValue) {
  const date = parseLocalDateTime(dateValue, timeValue);
  const hour = date.getHours();
  const minute = date.getMinutes();
  const hourText = hour > 12 ? hour - 12 : hour;
  const minuteText = minute ? `:${String(minute).padStart(2, "0")}` : "点";
  const period = hour < 12 ? "上午" : hour < 18 ? "下午" : "晚上";
  const dayText = isSameDate(date, new Date()) && hour >= 18 ? "今晚" : `${date.getMonth() + 1}月${date.getDate()}日${period}`;
  return `${dayText}${hourText}${minuteText}`;
}

function cleanShort(value, fallback) {
  return firstLine(value).replace(/[，。；;,.]+$/, "") || fallback;
}

function firstLine(value) {
  return String(value || "")
    .split(/\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function showToast(message, duration = 1700) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), duration);
}

function escapeHTML(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
