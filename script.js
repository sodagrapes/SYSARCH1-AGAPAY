const app = document.getElementById("app");

const STORAGE_KEY = "agapay_lending_system_v3";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard" },
  { id: "borrowers", label: "Borrower Management", icon: "users" },
  { id: "application", label: "Loan Application", icon: "clipboard" },
  { id: "processing", label: "Loan Processing", icon: "calculator" },
  { id: "payments", label: "Payment Management", icon: "wallet" },
  { id: "monitoring", label: "Monitoring", icon: "pulse" },
  { id: "reports", label: "Reports", icon: "report" },
];

function defaultPersistedData() {
  return {
    borrowers: [],
    applications: [],
    loans: [],
    payments: [],
    transactionNumbers: [],
    processingDraft: null,
    lastEntries: {
      borrower: null,
      application: null,
      processing: null,
    },
    counters: {
      borrower: 0,
      application: 0,
      loan: 0,
      payment: 0,
    },
  };
}

function defaultUiState() {
  return {
    isAuthenticated: false,
    currentPage: "dashboard",
    dashboardMetric: "",
    borrowerSearch: "",
    applicationSearch: "",
    paymentSearch: "",
    reportSearch: "",
    monitoringSearch: "",
    showNotifications: false,
    selectedBorrowerId: "",
    selectedLoanId: "",
    paymentModalOpen: false,
    paymentModalLoanId: "",
    forms: {
      borrower: {
        name: "",
        address: "",
        contact: "",
      },
      borrowerUpdate: {
        name: "",
        address: "",
        contact: "",
      },
      application: {
        borrowerName: "",
        requiredDocuments: [],
        loanAmount: "",
        monthlyIncome: "",
        contactReferences: "",
        dateApplied: "",
      },
      processing: {
        borrowerName: "",
        memberId: "",
        loanAmount: "",
        interestRate: "12",
        termMonths: "",
        startDate: "",
      },
      payment: {
        paymentMethod: "",
        paymentReference: "",
      },
    },
    toasts: [],
  };
}

const state = {
  data: loadPersistedData(),
  ui: defaultUiState(),
};

hydrateUiFromData();

function loadPersistedData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultPersistedData();
    const parsed = JSON.parse(raw);
    return {
      ...defaultPersistedData(),
      ...parsed,
      lastEntries: {
        ...defaultPersistedData().lastEntries,
        ...(parsed.lastEntries || {}),
      },
      counters: {
        ...defaultPersistedData().counters,
        ...(parsed.counters || {}),
      },
    };
  } catch (error) {
    return defaultPersistedData();
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.data));
}

function hydrateUiFromData() {
  state.ui.selectedLoanId = state.data.loans[0]?.id || "";
  const draft = state.data.processingDraft;
  if (draft) {
    state.ui.forms.processing = {
      borrowerName: draft.borrowerName || "",
      memberId: draft.memberId || "",
      loanAmount: draft.loanAmount ? String(draft.loanAmount) : "",
      interestRate: draft.interestRate ? String(draft.interestRate) : "",
      termMonths: draft.termMonths ? String(draft.termMonths) : "",
      startDate: draft.startDate || "",
    };
  }
}

function nextId(type, prefix) {
  state.data.counters[type] += 1;
  saveData();
  return `${prefix}-${String(state.data.counters[type]).padStart(3, "0")}`;
}

function formatCurrency(value) {
  return `PHP ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function formatPercent(value) {
  return `${Math.round(Number(value || 0))}%`;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseNumber(value) {
  const normalized = String(value || "").replace(/[^0-9.]/g, "");
  return normalized ? Number(normalized) : 0;
}

function computeLoanFigures(loanAmount, interestRate, termMonths, totalPaid = 0) {
  const principal = parseNumber(loanAmount);
  const interest = parseNumber(interestRate);
  const term = parseNumber(termMonths);
  const totalPayable = principal + principal * (interest / 100);
  const monthlyPayment = term > 0 ? totalPayable / term : 0;
  const remainingBalance = Math.max(0, totalPayable - totalPaid);
  const completion = totalPayable > 0 ? (totalPaid / totalPayable) * 100 : 0;

  return {
    principal,
    interest,
    term,
    totalPayable,
    monthlyPayment,
    remainingBalance,
    completion,
  };
}

function addMonths(baseDate, count) {
  const date = new Date(baseDate || todayIso());
  date.setMonth(date.getMonth() + count);
  return date.toISOString().slice(0, 10);
}

function buildPaymentSchedule(startDate, termMonths, monthlyPayment) {
  const total = parseNumber(termMonths);
  return Array.from({ length: total }, (_, index) => ({
    dueDate: addMonths(startDate || todayIso(), index),
    amount: monthlyPayment,
    status: "Pending",
  }));
}

function deriveDashboard() {
  const totalBorrowers = state.data.borrowers.length;
  const activeLoans = state.data.loans.filter((loan) => loan.status === "Active").length;
  const pendingAccounts = state.data.applications.filter((appRecord) => appRecord.status === "Pending").length;
  const overdueAccounts = state.data.loans.filter((loan) => loan.overdue).length;
  return { totalBorrowers, activeLoans, pendingAccounts, overdueAccounts };
}

function currentSelectedLoan(filteredLoans = state.data.loans) {
  return filteredLoans.find((loan) => loan.id === state.ui.selectedLoanId) || filteredLoans[0] || null;
}

function createToast(type, message) {
  const duration = Math.max(5000, Math.min(10000, 4000 + message.length * 45));
  const toast = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type,
    message,
    duration,
    unread: true,
    timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
  state.ui.toasts.unshift(toast);
  state.ui.toasts = state.ui.toasts.slice(0, 5);
  window.setTimeout(() => dismissToast(toast.id), duration);
}

function dismissToast(id) {
  const before = state.ui.toasts.length;
  state.ui.toasts = state.ui.toasts.filter((toast) => toast.id !== id);
  if (state.ui.toasts.length !== before) renderApp();
}

function notificationItems() {
  return state.ui.toasts;
}

function unreadCount() {
  return notificationItems().filter((item) => item.unread).length;
}

function markNotificationsRead() {
  state.ui.toasts = state.ui.toasts.map((item) => ({ ...item, unread: false }));
}

function notificationClass(type) {
  if (type === "success") return "notification-success";
  if (type === "warning") return "notification-warning";
  if (type === "error") return "notification-error";
  return "notification-info";
}

function badgeClass(status) {
  const value = String(status || "").toLowerCase();
  if (value === "active") return "badge badge-active";
  if (value === "overdue") return "badge badge-overdue";
  if (value === "pending") return "badge badge-pending";
  if (value === "approved" || value === "completed" || value === "paid") return "badge badge-completed";
  if (value === "rejected" || value === "missed") return "badge badge-missed";
  return "badge badge-completed";
}

function pageMeta(page) {
  const meta = {
    dashboard: { title: "Dashboard", subtitle: "A calm overview of borrower activity, loan movement, and follow-up priorities." },
    borrowers: { title: "Borrower Management", subtitle: "Register borrowers, update records, and maintain searchable account profiles." },
    application: { title: "Loan Application", subtitle: "Create, review, approve, and reject borrower loan applications." },
    processing: { title: "Loan Processing", subtitle: "Process the latest approved borrower and save computed loan records." },
    payments: { title: "Payment Management", subtitle: "Record payments, validate transaction details, and track balances dynamically." },
    monitoring: { title: "Monitoring", subtitle: "Monitor loan status, overdue payments, and remaining balances." },
    reports: { title: "Reports", subtitle: "Search and review borrower, loan, payment, and overdue reporting tables." },
  };
  return meta[page];
}

function icon(name) {
  const icons = {
    dashboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 13h7V4H4Zm9 7h7V4h-7ZM4 20h7v-5H4Zm9 0h7v-7h-7Z" fill="currentColor"/></svg>`,
    users: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 11a4 4 0 1 0-3.99-4A4 4 0 0 0 16 11Zm-8 0a3 3 0 1 0-3-3 3 3 0 0 0 3 3Zm8 2c-2.67 0-8 1.34-8 4v3h16v-3c0-2.66-5.33-4-8-4ZM8 13c-.29 0-.62.02-.97.05A4.94 4.94 0 0 1 10 17v3H2v-3c0-2.02 3.03-3.42 6-4Z" fill="currentColor"/></svg>`,
    clipboard: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 4h-1.18A3 3 0 0 0 12 2a3 3 0 0 0-2.82 2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8l6-6V6a2 2 0 0 0-2-2Zm-4-1a1 1 0 0 1 .95.68L13 4h-2l.05-.32A1 1 0 0 1 12 3Zm4 17v-5h5Z" fill="currentColor"/></svg>`,
    calculator: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm1 3v4h8V5Zm0 7v2h2v-2Zm0 4v2h2v-2Zm4-4v2h2v-2Zm0 4v2h2v-2Zm4-4v6h2v-6Z" fill="currentColor"/></svg>`,
    wallet: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 7V5a2 2 0 0 0-2-2H5a3 3 0 0 0 0 6h14V7Zm1 2H5a4.97 4.97 0 0 1-2-.42V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2Zm-2.5 6A1.5 1.5 0 1 1 18 13.5 1.5 1.5 0 0 1 16.5 15Z" fill="currentColor"/></svg>`,
    pulse: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 13h4l2.5-5 4 10 2.5-5H21v-2h-3.76l-3.24 6.5-4-10L5.76 11H3Z" fill="currentColor"/></svg>`,
    report: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Zm7 1.5V8h4.5ZM8 12h8v-2H8Zm0 4h8v-2H8Zm0 4h5v-2H8Z" fill="currentColor"/></svg>`,
    alert: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 1 21h22Zm1 15h-2v2h2Zm0-8h-2v6h2Z" fill="currentColor"/></svg>`,
    shield: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2 4 5v6c0 5.55 3.84 10.74 8 12 4.16-1.26 8-6.45 8-12V5Zm-1 14-4-4 1.41-1.41L11 13.17l4.59-4.58L17 10Z" fill="currentColor"/></svg>`,
    bell: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm6-6V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1Z" fill="currentColor"/></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.55 18 4 12.45l1.41-1.41 4.14 4.13 9.04-9.04L20 7.55Z" fill="currentColor"/></svg>`,
    back: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20Z" fill="currentColor"/></svg>`,
  };
  return icons[name] || icons.dashboard;
}

function metricCard(item) {
  const clickable = Boolean(item.metric) && item.metric !== "none";
  return `
    <button class="metric-card metric-card-button ${clickable ? "metric-card-interactive" : ""}" ${clickable ? `data-action="dashboard-metric" data-metric="${item.metric}"` : "type=\"button\""}>
      <div class="metric-top">
        <span>${item.label}</span>
        <div class="metric-icon">${icon(item.icon)}</div>
      </div>
      <div class="metric-value">${item.value}</div>
    </button>
  `;
}

function paymentSummaryCard(label, value) {
  return `
    <div class="payment-summary-card">
      <span>${label}</span>
      <strong>${value}</strong>
    </div>
  `;
}

function field(label, inputHtml, options = {}) {
  const { required = false, empty = false } = options;
  return `
    <div class="field">
      <label>${label}${required ? ` <span class="required-dot ${empty ? "required-dot-empty" : ""}"></span>` : ""}</label>
      <div class="input-wrap">${inputHtml}</div>
    </div>
  `;
}

function inputField(name, value, placeholder, type = "text", form = "borrower", disabled = false) {
  return `
    <input type="${type}" data-form="${form}" data-name="${name}" value="${value}" placeholder="${placeholder}" ${disabled ? "disabled" : ""}>
  `;
}

function selectField(name, value, options, placeholder = "Select an option", form = "application") {
  return `
    <select class="${name === "monthlyIncome" ? "monthly-income-select" : ""}" data-form="${form}" data-name="${name}">
      <option value="">${placeholder}</option>
      ${options.map((option) => `<option value="${option}" ${value === option ? "selected" : ""}>${option}</option>`).join("")}
    </select>
  `;
}

function fileUploadField(name, files, form = "application") {
  const selectedFiles = Array.isArray(files) ? files : [];
  return `
    <div class="file-upload">
      <input class="file-input" id="${form}-${name}" type="file" data-file-form="${form}" data-file-name="${name}" accept="image/*,.pdf" multiple>
      <label class="file-drop" for="${form}-${name}">
        <strong>Attach documents</strong>
        <span>Images or PDF files are accepted.</span>
      </label>
      ${selectedFiles.length ? `
        <div class="file-preview-grid">
          ${selectedFiles.map((file) => `
            <div class="file-preview">
              ${file.previewUrl && file.type?.startsWith("image/") ? `<img src="${file.previewUrl}" alt="${file.name} preview">` : `<div class="file-preview-icon">${file.type === "application/pdf" ? "PDF" : "FILE"}</div>`}
              <span>${file.name}</span>
            </div>
          `).join("")}
        </div>
      ` : `<p class="screen-note">No documents selected.</p>`}
    </div>
  `;
}

function detailItem(label, value) {
  return `<div class="detail-item"><span class="detail-label">${label}</span><span class="detail-value">${value}</span></div>`;
}

function isEmptyValue(value) {
  if (Array.isArray(value)) return value.length === 0;
  return !String(value ?? "").trim();
}

function validateRequiredFields(formName, fields) {
  const values = state.ui.forms[formName];
  const missing = fields.filter(({ key }) => isEmptyValue(values[key]));
  if (!missing.length) return true;
  alert(`Please complete the required fields: ${missing.map((item) => item.label).join(", ")}.`);
  renderApp();
  return false;
}

function emptyState(message) {
  return `<div class="empty-state"><strong>No records yet</strong><p class="screen-note">${message}</p></div>`;
}

function selectedBorrower() {
  return state.data.borrowers.find((borrower) => borrower.id === state.ui.selectedBorrowerId) || null;
}

function borrowerFormFromRecord(borrower) {
  return {
    name: borrower?.name || "",
    address: borrower?.address || "",
    contact: borrower?.contact || "",
  };
}

function hasBorrowerUpdateChanges() {
  const borrower = selectedBorrower();
  const form = state.ui.forms.borrowerUpdate;
  if (!borrower) return false;
  return ["name", "address", "contact"].some((key) => String(form[key] || "") !== String(borrower[key] || ""));
}

function renderNotificationCenter() {
  const items = notificationItems().slice(0, 5);
  const unread = unreadCount();
  return `
    <div class="notification-wrapper">
      <button class="notification-button" data-action="toggle-notifications" aria-label="Toggle notifications">
        <span class="nav-icon">${icon("bell")}</span>
        ${unread ? `<span class="notification-badge">${unread}</span>` : ""}
      </button>
      ${state.ui.showNotifications ? `
        <div class="notification-panel">
          <div class="notification-panel-head">
            <strong>Notifications</strong>
            <button class="notification-link" data-action="mark-read">Mark all read</button>
          </div>
          <div class="notification-list">
            ${items.length ? items.map((item) => `
              <article class="notification-item ${notificationClass(item.type)} ${item.unread ? "notification-unread" : ""}">
                <div class="notification-item-top">
                  <span class="notification-dot"></span>
                  <span>${item.timestamp}</span>
                </div>
                <p>${item.message}</p>
              </article>
            `).join("") : `<p class="screen-note">No notifications right now.</p>`}
          </div>
        </div>
      ` : ""}
    </div>
  `;
}

function renderToasts() {
  return `
    <div class="toast-stack">
      ${notificationItems().slice(0, 3).map((item) => `
        <article class="toast ${notificationClass(item.type)}">
          <div class="toast-icon">${icon(item.type === "success" ? "check" : item.type === "warning" ? "alert" : "bell")}</div>
          <div>
            <strong>${item.type === "success" ? "Success" : item.type === "warning" ? "Alert" : item.type === "error" ? "Error" : "Notice"}</strong>
            <p>${item.message}</p>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderDashboardMetricTable() {
  const map = {
    borrowers: {
      title: "Total Borrowers",
      headers: ["ID", "Name", "Status"],
      rows: state.data.borrowers.map((row) => `<tr><td>${row.id}</td><td>${row.name}</td><td><span class="${badgeClass(row.status)}">${row.status}</span></td></tr>`),
    },
    active: {
      title: "Active Loans",
      headers: ["Loan ID", "Borrower", "Amount", "Remaining", "Completion"],
      rows: state.data.loans.filter((loan) => loan.status === "Active").map((loan) => `<tr><td>${loan.id}</td><td>${loan.borrowerName}</td><td>${formatCurrency(loan.loanAmount)}</td><td>${formatCurrency(loan.remainingBalance)}</td><td>${formatPercent(loan.completionPercent)}</td></tr>`),
    },
    pending: {
      title: "Pending Applications",
      headers: ["Application ID", "Borrower", "Member ID", "Loan Amount", "Status"],
      rows: state.data.applications.filter((record) => record.status === "Pending").map((record) => `<tr><td>${record.id}</td><td>${record.borrowerName}</td><td>${record.memberId}</td><td>${formatCurrency(record.loanAmount)}</td><td><span class="${badgeClass(record.status)}">${record.status}</span></td></tr>`),
    },
    overdue: {
      title: "Overdue Accounts",
      headers: ["Loan ID", "Borrower", "Amount Due", "Due Date", "Days Overdue"],
      rows: state.data.loans.filter((loan) => loan.overdue).map((loan) => `<tr><td>${loan.id}</td><td>${loan.borrowerName}</td><td>${formatCurrency(loan.remainingBalance)}</td><td>${loan.nextDueDate || "-"}</td><td>${loan.daysOverdue || 0}</td></tr>`),
    },
  };
  const selected = map[state.ui.dashboardMetric] || map.overdue;
  return `
    <article class="surface-card">
      <div class="section-head">
        <div>
          <h3>${selected.title}</h3>
          <p class="section-copy">Single table view using the same visual style as reports.</p>
        </div>
      </div>
      <div class="table-wrap table-scroll-y">
        <table>
          <thead><tr>${selected.headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
          <tbody>${selected.rows.length ? selected.rows.join("") : `<tr><td colspan="${selected.headers.length}">No records available.</td></tr>`}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderDashboard() {
  const metrics = deriveDashboard();
  return `
    <section class="content-grid">
      <div class="metrics-grid">
        ${metricCard({ label: "Total Borrowers", value: metrics.totalBorrowers, icon: "users", metric: "borrowers" })}
        ${metricCard({ label: "Active Loans", value: metrics.activeLoans, icon: "wallet", metric: "active" })}
        ${metricCard({ label: "Pending Applications", value: metrics.pendingAccounts, icon: "clipboard", metric: "pending" })}
        ${metricCard({ label: "Overdue Accounts", value: metrics.overdueAccounts, icon: "alert", metric: "overdue" })}
      </div>
      ${state.ui.dashboardMetric ? renderDashboardMetricTable() : `<div class="dashboard-spacer"></div>`}
    </section>
  `;
}

function renderBorrowers() {
  const rows = state.data.borrowers.filter((row) =>
    `${row.id} ${row.name} ${row.memberId} ${row.status}`.toLowerCase().includes(state.ui.borrowerSearch.toLowerCase())
  );
  const form = state.ui.forms.borrower;
  const updateForm = state.ui.forms.borrowerUpdate;
  const borrower = selectedBorrower();
  const hasChanges = hasBorrowerUpdateChanges();
  const canRegisterBorrower = !isEmptyValue(form.name) && !isEmptyValue(form.address) && !isEmptyValue(form.contact);
  return `
    <section class="content-grid">
      <article class="surface-card">
        <div class="section-head">
          <div>
            <h3>Borrower Information</h3>
            <p class="section-copy">All borrower data is empty by default and saved permanently after registration.</p>
          </div>
          <div class="button-row">
            <button class="btn btn-secondary" data-action="borrower-view">View Borrower Information</button>
          </div>
        </div>
        <div class="three-column">
          ${field("Name", inputField("name", form.name, "Enter borrower name"), { required: true, empty: isEmptyValue(form.name) })}
          ${field("Address", inputField("address", form.address, "Enter address"), { required: true, empty: isEmptyValue(form.address) })}
          ${field("Contact", inputField("contact", form.contact, "Enter contact number"), { required: true, empty: isEmptyValue(form.contact) })}
        </div>
        ${canRegisterBorrower ? `
          <div class="button-row form-bottom-actions">
            <button class="btn btn-primary" data-action="borrower-submit">Register Borrower</button>
          </div>
        ` : ""}
      </article>

      <article class="surface-card" id="borrowerListSection">
        <div class="search-row">
          <div>
            <h3>Borrower List</h3>
            <p class="section-copy">Select a borrower to update their saved details.</p>
          </div>
          <input class="search-input" data-search="borrowerSearch" type="search" placeholder="Search borrowers" value="${state.ui.borrowerSearch}">
        </div>
        <div class="table-wrap table-scroll-y">
          <table>
            <thead><tr><th>ID</th><th>Name</th><th>Address</th><th>Contact</th><th>Status</th></tr></thead>
            <tbody>${rows.length ? rows.map((row) => `
              <tr class="selectable-row ${state.ui.selectedBorrowerId === row.id ? "selected-row" : ""}" data-action="select-borrower" data-borrower-id="${row.id}" tabindex="0">
                <td>${row.id}</td>
                <td>${row.name}</td>
                <td>${row.address}</td>
                <td>${row.contact}</td>
                <td><span class="${badgeClass(row.status)}">${row.status}</span></td>
              </tr>
            `).join("") : `<tr><td colspan="5">No borrowers registered yet.</td></tr>`}</tbody>
          </table>
        </div>
      </article>

      ${borrower ? `
        <article class="surface-card" id="borrowerUpdateSection">
          <div class="section-head">
            <div>
              <h3>Update Borrower Information</h3>
              <p class="section-copy">Editing ${borrower.id}. Changes are saved to the selected borrower record.</p>
            </div>
            <span class="badge badge-active">${borrower.id}</span>
          </div>
          <div class="three-column">
            ${field("Name", inputField("name", updateForm.name, "Enter borrower name", "text", "borrowerUpdate"), { required: true, empty: isEmptyValue(updateForm.name) })}
            ${field("Address", inputField("address", updateForm.address, "Enter address", "text", "borrowerUpdate"), { required: true, empty: isEmptyValue(updateForm.address) })}
            ${field("Contact", inputField("contact", updateForm.contact, "Enter contact number", "text", "borrowerUpdate"), { required: true, empty: isEmptyValue(updateForm.contact) })}
          </div>
          <div class="button-row" style="margin-top: 1rem;">
            <button class="btn btn-primary" data-action="borrower-save-update" ${hasChanges ? "" : "disabled"}>Update Borrower Information</button>
            <button class="btn btn-ghost btn-icon-text" data-action="borrower-cancel-update" aria-label="Back to borrower list">
              <span class="btn-small-icon">${icon("back")}</span>
              <span>Back</span>
            </button>
          </div>
        </article>
      ` : ""}
    </section>
  `;
}

function renderApplication() {
  const rows = state.data.applications.filter((row) =>
    `${row.id} ${row.borrowerName} ${row.memberId} ${row.status}`.toLowerCase().includes(state.ui.applicationSearch.toLowerCase())
  );
  const form = state.ui.forms.application;
  const incomeRanges = ["PHP 20,000-PHP 40,000", "PHP 40,001-PHP 60,000", "PHP 60,001-PHP 80,000", "PHP 80,001-PHP 100,000", "PHP 100,001 and above"];
  return `
    <section class="content-grid">
      <div class="two-column">
        <article class="surface-card">
          <div class="section-head">
            <div>
              <h3>Loan Application</h3>
              <p class="section-copy">Submit applications first, then approve or reject them from Application Records.</p>
            </div>
          </div>
          <div class="form-grid">
            ${field("Borrower Name", inputField("borrowerName", form.borrowerName, "Enter borrower name", "text", "application"), { required: true, empty: isEmptyValue(form.borrowerName) })}
            ${field("Required Documents", fileUploadField("requiredDocuments", form.requiredDocuments), { required: true, empty: isEmptyValue(form.requiredDocuments) })}
            ${field("Loan Amount", inputField("loanAmount", form.loanAmount, "Enter loan amount", "number", "application"), { required: true, empty: isEmptyValue(form.loanAmount) })}
            ${field("Monthly Income", selectField("monthlyIncome", form.monthlyIncome, incomeRanges, "Select monthly income range"), { required: true, empty: isEmptyValue(form.monthlyIncome) })}
            ${field("Contact References", inputField("contactReferences", form.contactReferences, "Enter contact references", "text", "application"), { required: true, empty: isEmptyValue(form.contactReferences) })}
            ${field("Date Applied", inputField("dateApplied", form.dateApplied, "Select application date", "date", "application"), { required: true, empty: isEmptyValue(form.dateApplied) })}
          </div>
          <div class="button-row" style="margin-top: 1rem;">
            <button class="btn btn-secondary" data-action="application-record">Record</button>
          </div>
        </article>

        <article class="surface-card">
          <div class="search-row">
            <div>
              <h3>Application Records</h3>
              <p class="section-copy">Use search to review recorded applications.</p>
            </div>
            <input class="search-input" data-search="applicationSearch" type="search" placeholder="Search applications" value="${state.ui.applicationSearch}">
          </div>
          <div class="table-wrap table-scroll-y">
            <table>
              <thead><tr><th>ID</th><th>Borrower</th><th>Documents</th><th>Income</th><th>Loan Amount</th><th>Status</th></tr></thead>
              <tbody>${rows.length ? rows.map((row) => {
                const documents = Array.isArray(row.requiredDocuments) ? row.requiredDocuments : [];
                const documentText = documents.length ? documents.map((doc) => `<span class="file-name-chip">${doc.name}</span>`).join("") : (Array.isArray(row.requiredDocuments) ? "-" : row.requiredDocuments || "-");
                const pending = row.status === "Pending";
                return `
                  <tr>
                    <td>${row.id}</td>
                    <td>${row.borrowerName}</td>
                    <td>${documentText}</td>
                    <td>${row.monthlyIncome || row.proofOfMonthlyIncome || "-"}</td>
                    <td>${formatCurrency(row.loanAmount)}</td>
                    <td><span class="${badgeClass(row.status)}">${row.status}</span></td>
                  </tr>
                  <tr class="application-action-row">
                    <td colspan="6">
                      <div class="table-actions application-record-actions">
                        <button class="btn btn-primary btn-table" data-action="application-approve" data-application-id="${row.id}" ${pending ? "" : "disabled"}>Approve</button>
                        <button class="btn btn-ghost btn-table" data-action="application-reject" data-application-id="${row.id}" ${pending ? "" : "disabled"}>Reject</button>
                      </div>
                    </td>
                  </tr>
                `;
              }).join("") : `<tr><td colspan="6">No applications recorded yet.</td></tr>`}</tbody>
            </table>
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderProcessing() {
  const draft = state.ui.forms.processing;
  const figures = computeLoanFigures(draft.loanAmount, draft.interestRate, draft.termMonths);
  return `
    <section class="content-grid">
      <div class="two-column">
        <article class="surface-card">
          <div class="section-head">
            <div>
              <h3>Loan Processing</h3>
              <p class="section-copy">Latest approved borrower automatically appears here for final loan processing.</p>
            </div>
          </div>
          <div class="form-grid">
            ${field("Borrower Name", inputField("borrowerName", draft.borrowerName, "Awaiting approved borrower", "text", "processing"), { required: true, empty: isEmptyValue(draft.borrowerName) })}
            ${field("Member ID", inputField("memberId", draft.memberId, "Awaiting approved member ID", "text", "processing"), { required: true, empty: isEmptyValue(draft.memberId) })}
            ${field("Loan Amount", inputField("loanAmount", draft.loanAmount, "Enter loan amount", "number", "processing"), { required: true, empty: isEmptyValue(draft.loanAmount) })}
            ${field("Interest", inputField("interestRate", draft.interestRate || "12", "12", "number", "processing", true), { required: true, empty: false })}
            ${field("Term (Months)", `<select data-form="processing" data-name="termMonths"><option value="">Select term</option><option value="3" ${draft.termMonths === "3" ? "selected" : ""}>3</option><option value="6" ${draft.termMonths === "6" ? "selected" : ""}>6</option><option value="12" ${draft.termMonths === "12" ? "selected" : ""}>12</option><option value="24" ${draft.termMonths === "24" ? "selected" : ""}>24</option><option value="36" ${draft.termMonths === "36" ? "selected" : ""}>36</option></select>`, { required: true, empty: isEmptyValue(draft.termMonths) })}
            ${field("Start Date", inputField("startDate", draft.startDate, "Select start date", "date", "processing"), { required: true, empty: isEmptyValue(draft.startDate) })}
          </div>
          <div class="button-row" style="margin-top: 1rem;">
            <button class="btn btn-primary" data-action="processing-compute">Compute</button>
            <button class="btn btn-secondary" data-action="processing-save">Save Loan Record</button>
          </div>
        </article>

        <article class="surface-card">
          <div class="section-head">
            <div>
              <h3>Computed Result</h3>
              <p class="section-copy">Monthly payment, total payable, remaining balance, and completion are fully dynamic.</p>
            </div>
          </div>
          <div class="details-grid">
            ${detailItem("Total Payable", formatCurrency(figures.totalPayable))}
            ${detailItem("Payment Plan", figures.term ? `${formatCurrency(figures.monthlyPayment)}/Month` : "PHP 0/Month")}
            ${detailItem("Remaining Balance", formatCurrency(figures.remainingBalance))}
            ${detailItem("Completion", formatPercent(figures.completion))}
          </div>
        </article>
      </div>

      <article class="surface-card">
        <div class="section-head">
          <div>
            <h3>Saved Loan Records</h3>
            <p class="section-copy">Loan records remain persisted after refresh, browser close, or logout.</p>
          </div>
        </div>
        <div class="table-wrap table-scroll-y">
          <table>
            <thead><tr><th>Loan ID</th><th>Borrower</th><th>Amount</th><th>Monthly Payment</th><th>Remaining</th><th>Completion</th></tr></thead>
            <tbody>${state.data.loans.length ? state.data.loans.map((loan) => `<tr><td>${loan.id}</td><td>${loan.borrowerName}</td><td>${formatCurrency(loan.loanAmount)}</td><td>${formatCurrency(loan.monthlyPayment)}</td><td>${formatCurrency(loan.remainingBalance)}</td><td>${formatPercent(loan.completionPercent)}</td></tr>`).join("") : `<tr><td colspan="6">No loan records saved yet.</td></tr>`}</tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderPayments() {
  const transactionSearch = state.ui.paymentSearch.trim().toLowerCase();
  const matchingPayments = transactionSearch
    ? state.data.payments.filter((payment) => String(payment.id || "").toLowerCase().includes(transactionSearch))
    : [];
  const matchingLoanIds = new Set(matchingPayments.map((payment) => payment.loanId));
  const filteredLoans = transactionSearch ? state.data.loans.filter((loan) => matchingLoanIds.has(loan.id)) : state.data.loans;
  const searchedLoan = transactionSearch && matchingPayments.length ? state.data.loans.find((item) => item.id === matchingPayments[0].loanId) : null;
  const loan = searchedLoan || currentSelectedLoan(filteredLoans);
  const loanPayments = transactionSearch ? matchingPayments : (loan ? state.data.payments.filter((payment) => payment.loanId === loan.id) : []);
  return `
    <section class="content-grid">
      <article class="surface-card">
        <div class="search-row">
          <div>
            <h3>Payment Management</h3>
            <p class="section-copy">Search payment records by System Transaction ID.</p>
          </div>
          <input class="search-input" data-search="paymentSearch" type="search" placeholder="Search payment records by transaction ID" value="${state.ui.paymentSearch}">
        </div>
      </article>

      <div class="payment-record-grid">
        <article class="surface-card payment-record-list">
          <div class="section-head">
            <div>
              <h3>Approved Loans</h3>
              <p class="section-copy">Select a loan to review balances and payment history.</p>
            </div>
          </div>
          <div class="monitoring-list">
            ${filteredLoans.length ? filteredLoans.map((item) => `
              <button class="monitoring-list-item ${loan && item.id === loan.id ? "active" : ""}" data-action="select-loan" data-loan-id="${item.id}">
                <div class="monitoring-list-top">
                  <strong>${item.borrowerName}</strong>
                  <span class="${badgeClass(item.status)}">${item.status}</span>
                </div>
                <span class="muted">${item.memberId}</span>
                <div class="monitoring-list-meta"><span>${formatCurrency(item.remainingBalance)}</span><span>${formatPercent(item.completionPercent)}</span></div>
              </button>
            `).join("") : emptyState("Approved loan records will appear here after you save them from Loan Processing.")}
          </div>
        </article>

        <article class="surface-card">
          <div class="section-head">
            <div>
              <h3>Loan Summary</h3>
              <p class="section-copy">Newly approved loans start with zero payment history and zero completion.</p>
            </div>
            <div class="button-row">
              <button class="btn btn-primary" data-action="open-payment-modal" ${loan ? `data-loan-id="${loan.id}"` : ""} ${loan ? "" : "disabled"}>Record Payment</button>
              <button class="btn btn-ghost" data-action="view-history" ${loan ? "" : "disabled"}>View Payment History</button>
            </div>
          </div>
          <div class="payment-summary-grid">
            ${paymentSummaryCard("Total Loan", loan ? formatCurrency(loan.loanAmount) : "PHP 0")}
            ${paymentSummaryCard("Total Paid", loan ? formatCurrency(loan.totalPaid) : "PHP 0")}
            ${paymentSummaryCard("Remaining Balance", loan ? formatCurrency(loan.remainingBalance) : "PHP 0")}
            ${paymentSummaryCard("Completion", loan ? formatPercent(loan.completionPercent) : "0%")}
          </div>
          <div class="details-grid">
            ${detailItem("Borrower Name", loan ? loan.borrowerName : "-")}
            ${detailItem("Member ID", loan ? loan.memberId : "-")}
            ${detailItem("Monthly Payment", loan ? formatCurrency(loan.monthlyPayment) : "PHP 0")}
            ${detailItem("Start Date", loan ? loan.startDate : "-")}
          </div>
        </article>
      </div>

      <article class="surface-card" id="paymentHistorySection">
        <div class="section-head">
          <div>
            <h3>Payment History</h3>
            <p class="section-copy">${transactionSearch ? `Showing transaction matches for ${state.ui.paymentSearch}.` : "Search by System Transaction ID or select a loan to review payment records."}</p>
          </div>
        </div>
        <div class="table-wrap table-scroll-y">
          <table>
            <thead><tr><th>System Transaction ID</th><th>Date</th><th>Payment Method</th><th>Amount</th><th>Balance</th><th>Reference</th></tr></thead>
            <tbody>${loanPayments.length ? loanPayments.map((payment) => `<tr><td>${payment.id}</td><td>${payment.date}</td><td>${payment.paymentMethod}</td><td>${formatCurrency(payment.amount)}</td><td>${formatCurrency(payment.balanceAfter)}</td><td>${payment.transactionReference || "-"}</td></tr>`).join("") : `<tr><td colspan="6">No payment history yet.</td></tr>`}</tbody>
          </table>
        </div>
      </article>
    </section>
  `;
}

function renderMonitoring() {
  const records = state.data.loans.filter((loan) =>
    `${loan.borrowerName} ${loan.memberId} ${loan.status}`.toLowerCase().includes(state.ui.monitoringSearch.toLowerCase())
  );
  const selected = currentSelectedLoan(records);
  return `
    <section class="content-grid">
      <article class="surface-card monitoring-hero">
        <div class="monitoring-head">
          <div>
            <span class="detail-label">Loan Monitoring</span>
            <h3>Search borrower accounts and review live balances</h3>
            <p class="section-copy">Monitoring updates automatically from saved loans and recorded payments.</p>
          </div>
          <div class="monitoring-search">
            <input class="search-input monitoring-search-input" data-search="monitoringSearch" type="search" placeholder="Search monitoring records" value="${state.ui.monitoringSearch}">
          </div>
        </div>
      </article>

      <div class="monitoring-layout">
        <article class="surface-card monitoring-results">
          <div class="section-head">
            <div>
              <h3>Search Results</h3>
              <p class="section-copy">${records.length} record${records.length === 1 ? "" : "s"} found.</p>
            </div>
          </div>
          <div class="monitoring-list">
            ${records.length ? records.map((loan) => `
              <button class="monitoring-list-item ${selected && selected.id === loan.id ? "active" : ""}" data-action="select-loan" data-loan-id="${loan.id}">
                <div class="monitoring-list-top">
                  <strong>${loan.borrowerName}</strong>
                  <span class="${badgeClass(loan.overdue ? "Overdue" : loan.status)}">${loan.overdue ? "Overdue" : loan.status}</span>
                </div>
                <span class="muted">${loan.memberId}</span>
                <div class="monitoring-list-meta"><span>${loan.nextDueDate || "-"}</span><span>${formatCurrency(loan.remainingBalance)}</span></div>
              </button>
            `).join("") : emptyState("Loan monitoring records will appear here after saving a loan record.")}
          </div>
        </article>

        <article class="surface-card monitoring-panel">
          <div class="monitoring-panel-header">
            <div>
              <span class="detail-label">Selected Borrower</span>
              <h3>${selected ? selected.borrowerName : "No loan selected"}</h3>
              <p class="section-copy">Member ID: ${selected ? selected.memberId : "-"}</p>
            </div>
            <span class="${badgeClass(selected ? (selected.overdue ? "Overdue" : selected.status) : "Pending")}">${selected ? (selected.overdue ? "Overdue" : selected.status) : "Pending"}</span>
          </div>
          <div class="monitoring-focus-grid">
            <article class="monitoring-focus-card"><span class="detail-label">View Loan Status</span><strong>${selected ? selected.status : "-"}</strong><p>Updated whenever loan records or payments change.</p></article>
            <article class="monitoring-focus-card"><span class="detail-label">Identify Overdue Payments</span><strong>${selected ? (selected.overdue ? "Yes" : "No") : "-"}</strong><p>${selected ? `${selected.daysOverdue || 0} day(s) overdue` : "No monitoring data yet."}</p></article>
            <article class="monitoring-focus-card"><span class="detail-label">Display Remaining Balance</span><strong>${selected ? formatCurrency(selected.remainingBalance) : "PHP 0"}</strong><p>Completion: ${selected ? formatPercent(selected.completionPercent) : "0%"}</p></article>
          </div>
        </article>
      </div>
    </section>
  `;
}

function slugify(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function reportTable(title, headers, rows, highlighted = false) {
  return `
    <article class="surface-card report-section ${highlighted ? "report-section-highlight" : ""}" id="report-${slugify(title)}">
      <div class="section-head"><div><h3>${title}</h3></div></div>
      <div class="table-wrap table-scroll-y">
        <table>
          <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
          <tbody>${rows.length ? rows.join("") : `<tr><td colspan="${headers.length}">No records available.</td></tr>`}</tbody>
        </table>
      </div>
    </article>
  `;
}

function renderReports() {
  const search = state.ui.reportSearch.trim().toLowerCase();
  const borrowerRows = state.data.borrowers;
  const loanRows = state.data.loans;
  const paymentRows = state.data.payments;
  const overdueRows = state.data.loans.filter((row) => row.overdue);
  const reports = [
    {
      title: "Borrower Records",
      headers: ["ID", "Name", "Member ID", "Status"],
      rows: borrowerRows.map((row) => `<tr><td>${row.id}</td><td>${row.name}</td><td>${row.memberId}</td><td><span class="${badgeClass(row.status)}">${row.status}</span></td></tr>`),
    },
    {
      title: "Loan Records",
      headers: ["ID", "Name", "Amount", "Interest Rate", "Total Payable"],
      rows: loanRows.map((row) => `<tr><td>${row.id}</td><td>${row.borrowerName}</td><td>${formatCurrency(row.loanAmount)}</td><td>${row.interestRate}%</td><td>${formatCurrency(row.totalPayable)}</td></tr>`),
    },
    {
      title: "Payment Records",
      headers: ["System ID", "Reference", "Amount Paid", "Date", "Remaining Balance", "Payment Method"],
      rows: paymentRows.map((row) => `<tr><td>${row.id}</td><td>${row.transactionReference || "-"}</td><td>${formatCurrency(row.amount)}</td><td>${row.date}</td><td>${formatCurrency(row.balanceAfter)}</td><td>${row.paymentMethod}</td></tr>`),
    },
    {
      title: "Overdue Accounts",
      headers: ["ID", "Name", "Amount Due", "Due Date", "Days Overdue"],
      rows: overdueRows.map((row) => `<tr><td>${row.id}</td><td>${row.borrowerName}</td><td>${formatCurrency(row.remainingBalance)}</td><td>${row.nextDueDate || "-"}</td><td>${row.daysOverdue || 0}</td></tr>`),
    },
  ];
  const visibleReports = search ? reports.filter((report) => report.title.toLowerCase().includes(search)) : reports;
  return `
    <section class="content-grid">
      <article class="surface-card">
        <div class="search-row">
          <div>
            <h3>Reports Search</h3>
            <p class="section-copy">Search by report table name, such as Borrower Records or Payment Records.</p>
          </div>
          <input class="search-input" data-search="reportSearch" type="search" placeholder="Search reports" value="${state.ui.reportSearch}">
        </div>
      </article>
      ${visibleReports.length ? visibleReports.map((report, index) => reportTable(report.title, report.headers, report.rows, Boolean(search) && index === 0)).join("") : `<article class="surface-card report-empty"><strong>No matching report found.</strong></article>`}
    </section>
  `;
}

function renderPaymentModal() {
  if (!state.ui.paymentModalOpen) return "";
  const loan = state.data.loans.find((item) => item.id === state.ui.paymentModalLoanId);
  if (!loan) return "";
  const paymentForm = state.ui.forms.payment;
  return `
    <div class="modal-overlay">
      <div class="modal-card">
        <div class="section-head">
          <div>
            <h3>Record Payment</h3>
            <p class="section-copy">Verify all details before recording this payment.</p>
          </div>
          <button class="btn btn-ghost" data-action="close-payment-modal">Close</button>
        </div>
        <div class="form-grid">
          ${field("Payment Amount", inputField("paymentAmount", formatCurrency(loan.monthlyPayment), "", "text", "payment", true))}
          <div class="field">
            <label>Payment Method</label>
            <div class="payment-method-options">
              ${["Bank Payment", "E-wallet", "Payment Center"].map((method) => `
                <button class="method-chip ${paymentForm.paymentMethod === method ? "selected-method" : ""}" data-action="select-payment-method" data-method="${method}">${method}</button>
              `).join("")}
            </div>
          </div>
          ${field("Payment Reference", inputField("paymentReference", paymentForm.paymentReference, "Enter bank / e-wallet / center transaction reference", "text", "payment"), { required: true, empty: isEmptyValue(paymentForm.paymentReference) })}
          ${field("System Transaction ID", `<input type="text" value="Auto-generated after save" disabled>`, { required: false, empty: false })}
        </div>
        <div class="button-row" style="margin-top: 1rem;">
          <button class="btn btn-primary" data-action="record-payment">Confirm Record Payment</button>
        </div>
      </div>
    </div>
  `;
}

function renderPageContent() {
  switch (state.ui.currentPage) {
    case "dashboard": return renderDashboard();
    case "borrowers": return renderBorrowers();
    case "application": return renderApplication();
    case "processing": return renderProcessing();
    case "payments": return renderPayments();
    case "monitoring": return renderMonitoring();
    case "reports": return renderReports();
    default: return renderDashboard();
  }
}

function renderLogin() {
  return `
    <main class="app-shell login-screen">
      <section class="login-showcase login-image-panel">
        <img src="home.png" alt="AGAPAY home visual" class="login-hero-image">
      </section>
      <section class="login-panel">
        <form class="login-card" id="loginForm">
          <div class="login-logo-wrap">
            <img src="logo.png" alt="AGAPAY logo" class="system-logo system-logo-large">
          </div>
          <p class="login-copy">Sign-in to your account.</p>
          <div class="form-grid">
            ${field("User ID", `<input type="text" placeholder="Enter your user ID">`)}
            ${field("Password", `<input type="password" placeholder="Enter your password">`)}
            <div class="login-link-row">
              <a href="#" data-link="forgot" class="login-inline-link">Forgot Password?</a>
            </div>
          </div>
          <div class="login-actions">
            <button class="btn btn-primary" type="submit">Sign in</button>
            <p class="login-copy login-copy-center login-create-copy">No account yet? <a href="#" data-link="create" class="login-inline-link">Create now</a></p>
          </div>
        </form>
      </section>
    </main>
  `;
}

function renderApp() {
  const meta = pageMeta(state.ui.currentPage);
  if (!state.ui.isAuthenticated) {
    document.body.classList.add("login-active");
    app.innerHTML = renderLogin();
    bindEvents();
    return;
  }
  document.body.classList.remove("login-active");

  app.innerHTML = `
    <div class="app-shell layout">
      <aside class="sidebar">
        <div class="sidebar-brand">
          <div class="brand-mark"><img src="logo.png" alt="AGAPAY logo" class="system-logo"></div>
          <div class="brand-meta"><strong>AGAPAY</strong><span>Web-Based Lending System</span></div>
        </div>
        <nav class="nav-list" aria-label="Sidebar Navigation">
          ${navItems.map((item) => `<button class="nav-item ${state.ui.currentPage === item.id ? "active" : ""}" data-page="${item.id}"><span class="nav-icon">${icon(item.icon)}</span><span>${item.label}</span></button>`).join("")}
        </nav>
      </aside>

      <main class="main-panel">
        <div class="mobile-nav" aria-label="Mobile Navigation">
          ${navItems.map((item) => `<button class="nav-item ${state.ui.currentPage === item.id ? "active" : ""}" data-page="${item.id}"><span class="nav-icon">${icon(item.icon)}</span><span>${item.label}</span></button>`).join("")}
        </div>

        <header class="page-header">
          <div>
            <h2 class="page-title">${meta.title}</h2>
            <p class="page-subtitle">${meta.subtitle}</p>
          </div>
          <div class="page-header-actions">
            ${renderNotificationCenter()}
          </div>
        </header>

        ${renderPageContent()}
      </main>
      ${renderToasts()}
      ${renderPaymentModal()}
    </div>
  `;

  bindEvents();
}

function clearForm(formName) {
  state.ui.forms[formName] = { ...defaultUiState().forms[formName] };
}

function restoreReference(type) {
  const source = state.data.lastEntries[type];
  if (!source) return;
  state.ui.forms[type] = { ...state.ui.forms[type], ...Object.fromEntries(Object.entries(source).map(([key, value]) => [key, value == null ? "" : String(value)])) };
  renderApp();
}

function saveBorrower() {
  const form = state.ui.forms.borrower;
  if (!validateRequiredFields("borrower", [
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "contact", label: "Contact" },
  ])) return;
  const normalizedName = form.name.trim().toLowerCase();
  const normalizedContact = form.contact.replace(/\D/g, "");
  const duplicate = state.data.borrowers.find((borrower) =>
    borrower.name.trim().toLowerCase() === normalizedName ||
    borrower.contact.replace(/\D/g, "") === normalizedContact
  );
  if (duplicate) {
    createToast("error", "This user already exists. Borrower name and contact number must be unique.");
    renderApp();
    return;
  }
  const borrowerId = nextId("borrower", "BR");
  const borrower = {
    id: borrowerId,
    memberId: borrowerId,
    name: form.name,
    address: form.address,
    contact: form.contact,
    status: "Active",
  };
  state.data.borrowers.unshift(borrower);
  state.data.lastEntries.borrower = { ...form };
  saveData();
  clearForm("borrower");
  createToast("success", "Borrower registered successfully.");
  renderApp();
}

function selectBorrowerForUpdate(borrowerId) {
  const borrower = state.data.borrowers.find((item) => item.id === borrowerId);
  if (!borrower) return;
  state.ui.selectedBorrowerId = borrower.id;
  state.ui.forms.borrowerUpdate = borrowerFormFromRecord(borrower);
  renderApp();
  window.setTimeout(() => document.getElementById("borrowerUpdateSection")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
}

function updateBorrower() {
  const borrower = selectedBorrower();
  const form = state.ui.forms.borrowerUpdate;
  if (!borrower) {
    createToast("warning", "Select a borrower from the Borrower List before updating.");
    renderApp();
    return;
  }
  if (!hasBorrowerUpdateChanges()) return;
  if (!validateRequiredFields("borrowerUpdate", [
    { key: "name", label: "Name" },
    { key: "address", label: "Address" },
    { key: "contact", label: "Contact" },
  ])) return;

  const normalizedName = form.name.trim().toLowerCase();
  const normalizedContact = form.contact.replace(/\D/g, "");
  const duplicate = state.data.borrowers.find((item) =>
    item.id !== borrower.id &&
    (item.name.trim().toLowerCase() === normalizedName || item.contact.replace(/\D/g, "") === normalizedContact)
  );
  if (duplicate) {
    createToast("error", "Another borrower already uses that name or contact number.");
    renderApp();
    return;
  }

  borrower.name = form.name.trim();
  borrower.address = form.address.trim();
  borrower.contact = form.contact.trim();

  state.data.applications.forEach((application) => {
    if (application.memberId === borrower.memberId) application.borrowerName = borrower.name;
  });
  state.data.loans.forEach((loan) => {
    if (loan.memberId === borrower.memberId) loan.borrowerName = borrower.name;
  });

  state.ui.selectedBorrowerId = "";
  clearForm("borrowerUpdate");
  saveData();
  createToast("success", "Borrower information updated.");
  renderApp();
}

function cancelBorrowerUpdate() {
  state.ui.selectedBorrowerId = "";
  clearForm("borrowerUpdate");
  renderApp();
}

function recordApplication() {
  const form = state.ui.forms.application;
  if (!validateRequiredFields("application", [
    { key: "borrowerName", label: "Borrower Name" },
    { key: "requiredDocuments", label: "Required Documents" },
    { key: "loanAmount", label: "Loan Amount" },
    { key: "monthlyIncome", label: "Monthly Income" },
    { key: "contactReferences", label: "Contact References" },
    { key: "dateApplied", label: "Date Applied" },
  ])) return;
  const documentRecords = form.requiredDocuments.map((file) => ({
    name: file.name,
    type: file.type,
    size: file.size,
  }));
  const applicationId = nextId("application", "APP");
  const application = {
    id: applicationId,
    borrowerName: form.borrowerName,
    memberId: applicationId,
    requiredDocuments: documentRecords,
    loanAmount: parseNumber(form.loanAmount),
    monthlyIncome: form.monthlyIncome,
    contactReferences: form.contactReferences,
    dateApplied: form.dateApplied || todayIso(),
    status: "Pending",
  };
  state.data.applications.unshift(application);
  state.data.lastEntries.application = { ...form, requiredDocuments: documentRecords };
  saveData();
  clearForm("application");
  createToast("info", "Loan application recorded and is pending review.");
  renderApp();
}

function processApplication(applicationId, statusAction) {
  const application = state.data.applications.find((record) => record.id === applicationId);
  if (!application) return;
  if (application.status !== "Pending") {
    createToast("warning", `Application ${application.id} has already been ${application.status.toLowerCase()}.`);
    renderApp();
    return;
  }

  application.status = statusAction;
  if (statusAction === "Approved") {
    state.data.processingDraft = {
      borrowerName: application.borrowerName,
      memberId: application.memberId,
      loanAmount: application.loanAmount,
      interestRate: "",
      termMonths: "",
      startDate: "",
    };
    hydrateUiFromData();
    createToast("success", "Loan application approved and passed to Loan Processing.");
  } else {
    createToast("error", "Loan application rejected.");
  }
  saveData();
  renderApp();
}

function saveLoanRecord() {
  const form = state.ui.forms.processing;
  const figures = computeLoanFigures(form.loanAmount, form.interestRate, form.termMonths);
  if (!validateRequiredFields("processing", [
    { key: "borrowerName", label: "Borrower Name" },
    { key: "memberId", label: "Member ID" },
    { key: "loanAmount", label: "Loan Amount" },
    { key: "termMonths", label: "Term (Months)" },
    { key: "startDate", label: "Start Date" },
  ])) return;
  if (!figures.principal || !figures.term) {
    alert("Please enter valid loan details before saving the loan record.");
    return;
  }
  const loan = {
    id: nextId("loan", "LN"),
    borrowerName: form.borrowerName,
    memberId: form.memberId,
    loanAmount: figures.principal,
    interestRate: figures.interest,
    termMonths: figures.term,
    totalPayable: figures.totalPayable,
    monthlyPayment: figures.monthlyPayment,
    remainingBalance: figures.totalPayable,
    completionPercent: 0,
    totalPaid: 0,
    startDate: form.startDate || todayIso(),
    status: "Active",
    overdue: false,
    daysOverdue: 0,
    nextDueDate: addMonths(form.startDate || todayIso(), 0),
    paymentSchedule: buildPaymentSchedule(form.startDate || todayIso(), figures.term, figures.monthlyPayment),
  };
  state.data.loans.unshift(loan);
  state.data.lastEntries.processing = { ...form };
  state.data.processingDraft = null;
  saveData();
  clearForm("processing");
  state.ui.selectedLoanId = loan.id;
  createToast("success", "Loan record saved successfully.");
  renderApp();
}

function openPaymentModal(loanId = "") {
  const loan = state.data.loans.find((item) => item.id === loanId) || currentSelectedLoan();
  if (!loan) return;
  state.ui.paymentModalOpen = true;
  state.ui.paymentModalLoanId = loan.id;
  clearForm("payment");
  renderApp();
}

function closePaymentModal() {
  state.ui.paymentModalOpen = false;
  state.ui.paymentModalLoanId = "";
  clearForm("payment");
  renderApp();
}

function updateLoanDerivedFields(loan) {
  const figures = computeLoanFigures(loan.loanAmount, loan.interestRate, loan.termMonths, loan.totalPaid);
  loan.remainingBalance = figures.remainingBalance;
  loan.completionPercent = figures.completion;
  loan.totalPayable = figures.totalPayable;
  loan.monthlyPayment = figures.monthlyPayment;
  loan.nextDueDate = loan.paymentSchedule.find((item) => item.status === "Pending")?.dueDate || "-";
  loan.overdue = false;
  loan.daysOverdue = 0;
}

function recordPayment() {
  const loan = state.data.loans.find((item) => item.id === state.ui.paymentModalLoanId);
  const paymentForm = state.ui.forms.payment;
  if (!loan) return;
  if (!paymentForm.paymentMethod) {
    alert("Please select a payment method before recording this payment.");
    return;
  }
  if (!paymentForm.paymentReference) {
    alert("Please provide a transaction reference before recording this payment.");
    return;
  }
  if (state.data.transactionNumbers.includes(paymentForm.paymentReference)) {
    alert("This transaction number already exists. Please enter a unique transaction reference.");
    return;
  }
  const confirmed = confirm("Are you sure you want to record this payment? Please verify all details before proceeding.");
  if (!confirmed) return;
  const amount = loan.monthlyPayment;
  loan.totalPaid += amount;
  updateLoanDerivedFields(loan);
  const payment = {
    id: nextId("payment", "TXN"),
    loanId: loan.id,
    paymentMethod: paymentForm.paymentMethod,
    amount,
    date: todayIso(),
    balanceAfter: loan.remainingBalance,
    transactionReference: paymentForm.paymentReference,
  };
  state.data.transactionNumbers.push(payment.transactionReference);
  state.data.payments.unshift(payment);
  saveData();
  closePaymentModal();
  createToast("success", "Payment recorded successfully.");
}

function handleAction(action, button) {
  if (action === "borrower-submit") return saveBorrower();
  if (action === "borrower-view") {
    const table = document.getElementById("borrowerListSection");
    if (table) table.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (action === "select-borrower") return selectBorrowerForUpdate(button.dataset.borrowerId);
  if (action === "borrower-save-update") return updateBorrower();
  if (action === "borrower-cancel-update") return cancelBorrowerUpdate();
  if (action === "application-record") return recordApplication();
  if (action === "application-approve") return processApplication(button.dataset.applicationId, "Approved");
  if (action === "application-reject") return processApplication(button.dataset.applicationId, "Rejected");
  if (action === "processing-compute") return renderApp();
  if (action === "processing-save") return saveLoanRecord();
  if (action === "restore-reference") return restoreReference(button.dataset.reference);
  if (action === "dashboard-metric") {
    state.ui.dashboardMetric = button.dataset.metric;
    return renderApp();
  }
  if (action === "select-loan") {
    state.ui.selectedLoanId = button.dataset.loanId;
    if (state.ui.currentPage === "payments") state.ui.paymentSearch = "";
    return renderApp();
  }
  if (action === "open-payment-modal") return openPaymentModal(button.dataset.loanId);
  if (action === "close-payment-modal") return closePaymentModal();
  if (action === "select-payment-method") {
    state.ui.forms.payment.paymentMethod = button.dataset.method;
    return renderApp();
  }
  if (action === "record-payment") return recordPayment();
  if (action === "toggle-notifications") {
    state.ui.showNotifications = !state.ui.showNotifications;
    if (state.ui.showNotifications) markNotificationsRead();
    return renderApp();
  }
  if (action === "mark-read") {
    markNotificationsRead();
    return renderApp();
  }
  if (action === "view-history") {
    const history = document.getElementById("paymentHistorySection");
    if (history) history.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
}

function bindEvents() {
  document.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      state.ui.currentPage = button.dataset.page;
      renderApp();
    });
  });

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", (event) => {
      event.preventDefault();
      state.ui.isAuthenticated = true;
      renderApp();
    });
  }

  document.querySelectorAll("[data-form][data-name]").forEach((input) => {
    const updateValue = (event) => {
      const form = event.target.dataset.form;
      const name = event.target.dataset.name;
      const caret = event.target.selectionStart ?? event.target.value.length;
      state.ui.forms[form][name] = event.target.value;
      if (form === "borrower" || form === "borrowerUpdate") {
        renderApp({ focusSelector: `[data-form="${form}"][data-name="${name}"]`, caret });
      }
    };
    input.addEventListener("input", updateValue);
    input.addEventListener("change", updateValue);
  });

  document.querySelectorAll("[data-file-form][data-file-name]").forEach((input) => {
    input.addEventListener("change", (event) => {
      const form = event.target.dataset.fileForm;
      const name = event.target.dataset.fileName;
      state.ui.forms[form][name] = Array.from(event.target.files || []).map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
        previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : "",
      }));
      renderApp();
    });
  });

  document.querySelectorAll("[data-search]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const key = event.target.dataset.search;
      const caret = event.target.selectionStart ?? event.target.value.length;
      state.ui[key] = event.target.value;
      if (key === "paymentSearch") {
        const match = state.data.payments.find((payment) => String(payment.id || "").toLowerCase().includes(state.ui.paymentSearch.trim().toLowerCase()));
        state.ui.selectedLoanId = match?.loanId || "";
      }
      renderApp({ focusSelector: `[data-search="${key}"]`, caret });
      if (key === "reportSearch" && state.ui.reportSearch.trim()) {
        window.setTimeout(() => document.querySelector(".report-section-highlight")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
      }
    });
  });

  document.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => handleAction(button.dataset.action, button));
    button.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      handleAction(button.dataset.action, button);
    });
  });
}

function restoreFocus(options) {
  if (!options?.focusSelector) return;
  const element = document.querySelector(options.focusSelector);
  if (!element) return;
  element.focus();
  if (typeof options.caret === "number" && typeof element.setSelectionRange === "function") {
    const caret = Math.min(options.caret, element.value.length);
    element.setSelectionRange(caret, caret);
  }
}

const originalRenderApp = renderApp;
renderApp = function patchedRenderApp(options) {
  originalRenderApp();
  restoreFocus(options);
};

renderApp();
