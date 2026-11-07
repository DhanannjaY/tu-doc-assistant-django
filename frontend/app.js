const API = (
  window.DOC_ASSISTANT_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:8000/api`
).replace(/\/+$/, "");
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const FEEDBACK_TYPES = new Set(["error", "warning", "success", "info"]);

let selectedDocType = null;
let templatesData = {};
let selectedFile = null;
let accordionCount = 0;

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character];
  });
}

function setMessage(id, message) {
  const element = document.getElementById(id);
  element.textContent = message;
  element.hidden = !message;
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initializePageNavigation();
  initializeTaglineReveal();
  document.getElementById("copyright-year").textContent = String(
    new Date().getFullYear(),
  );
  loadTemplates();

  document.getElementById("doc-text").addEventListener("input", function () {
    const words = this.value
      .trim()
      .split(/\s+/)
      .filter((x) => x).length;
    const count = document.getElementById("word-count");
    count.textContent = `${words.toLocaleString()} words`;
    count.setAttribute("aria-label", `${words.toLocaleString()} words`);
    setMessage("input-error", "");
    if (this.value.trim() && selectedFile) {
      clearSelectedFile();
      setMessage(
        "upload-status",
        "The selected file was cleared because pasted text is now active.",
      );
    }
    updateSelectedFileSummary();
  });
  document.getElementById("file-input").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (file) processFile(file);
  });
  document.getElementById("upload-area").addEventListener("click", () => {
    document.getElementById("file-input").click();
  });
  document.getElementById("change-file-button").addEventListener("click", () => {
    document.getElementById("file-input").click();
  });
  document.getElementById("paste-text-button").addEventListener("click", goToTextInput);
  document.getElementById("doc-cards").addEventListener("click", (event) => {
    const card = event.target.closest("[data-doc-type]");
    if (card) selectDoc(card.dataset.docType);
  });
  document.getElementById("supported-cards").addEventListener("click", (event) => {
    const card = event.target.closest("[data-doc-type]");
    if (!card || !selectDoc(card.dataset.docType)) return;
    goToStep2();
  });
  // Drag & drop setup
  const uploadArea = document.getElementById("upload-area");
  if (uploadArea) {
    uploadArea.addEventListener("dragover", (e) => {
      e.preventDefault();
      uploadArea.classList.add("drag-over");
    });
    uploadArea.addEventListener("dragleave", () => {
      uploadArea.classList.remove("drag-over");
    });
    uploadArea.addEventListener("drop", (e) => {
      e.preventDefault();
      uploadArea.classList.remove("drag-over");
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    });
  }
});

function initializePageNavigation() {
  const toggle = document.getElementById("menu-toggle");
  const menu = document.getElementById("mobile-nav");
  toggle.addEventListener("click", () => {
    const isOpen = toggle.getAttribute("aria-expanded") === "true";
    toggle.setAttribute("aria-expanded", String(!isOpen));
    toggle.setAttribute("aria-label", isOpen ? "Open navigation" : "Close navigation");
    menu.hidden = isOpen;
    document.body.classList.toggle("nav-open", !isOpen);
    if (!isOpen) menu.querySelector("a")?.focus();
  });
  menu.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMobileNavigation(false);
  });
  document.addEventListener("keydown", (event) => {
    if (toggle.getAttribute("aria-expanded") !== "true") return;
    if (event.key === "Escape") {
      closeMobileNavigation(true);
      return;
    }
    if (event.key === "Tab") {
      const links = [...menu.querySelectorAll("a")];
      const firstLink = links[0];
      const lastLink = links[links.length - 1];
      if (event.shiftKey && document.activeElement === firstLink) {
        event.preventDefault();
        lastLink.focus();
      } else if (!event.shiftKey && document.activeElement === lastLink) {
        event.preventDefault();
        firstLink.focus();
      }
    }
  });

  if (!("IntersectionObserver" in window)) return;
  const navSections = ["analyzer", "supported", "how-it-works", "scoring", "faq"]
    .map((id) => document.getElementById(id))
    .filter(Boolean);
  let navObserver;
  const observeNavigationSections = () => {
    navObserver?.disconnect();
    const triggerLine = Math.round(window.innerHeight * 0.5);
    const bottomMargin = window.innerHeight - triggerLine - 1;
    navObserver = new IntersectionObserver((entries) => {
      const current = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (!current) {
        document.querySelectorAll(".desktop-nav a, .mobile-nav a").forEach((link) => {
          link.removeAttribute("aria-current");
        });
        return;
      }
      document.querySelectorAll(".desktop-nav a, .mobile-nav a").forEach((link) => {
        if (link.hash === `#${current.target.id}`) {
          link.setAttribute("aria-current", "location");
        } else {
          link.removeAttribute("aria-current");
        }
      });
    }, { rootMargin: `-${triggerLine}px 0px -${bottomMargin}px 0px`, threshold: 0 });
    navSections.forEach((section) => navObserver.observe(section));
  };
  observeNavigationSections();
  window.addEventListener("resize", observeNavigationSections);
}

function closeMobileNavigation(returnFocus) {
  const toggle = document.getElementById("menu-toggle");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-label", "Open navigation");
  document.getElementById("mobile-nav").hidden = true;
  document.body.classList.remove("nav-open");
  if (returnFocus) toggle.focus();
}

function initializeTaglineReveal() {
  const section = document.querySelector(".reveal-section");
  const words = [...document.querySelectorAll(".tagline-word")];
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    section.classList.add("is-visible");
    words.forEach((word) => word.classList.add("is-active"));
    return;
  }
  if (!("IntersectionObserver" in window)) {
    section.classList.add("is-visible");
    words.forEach((word) => word.classList.add("is-active"));
    return;
  }

  const sectionObserver = new IntersectionObserver((entries, observer) => {
    if (!entries.some((entry) => entry.isIntersecting)) return;
    section.classList.add("is-visible");
    observer.disconnect();
  }, { threshold: 0.1 });
  sectionObserver.observe(section);

  const wordQueue = [];
  let isRevealing = false;
  const revealNextWord = () => {
    const word = wordQueue.shift();
    if (!word) {
      isRevealing = false;
      return;
    }
    word.classList.add("is-active");
    window.setTimeout(revealNextWord, 55);
  };
  const wordObserver = new IntersectionObserver((entries, observer) => {
    const visibleWords = entries
      .filter((entry) => entry.isIntersecting)
      .sort((a, b) => words.indexOf(a.target) - words.indexOf(b.target));
    visibleWords.forEach((entry) => {
      wordQueue.push(entry.target);
      observer.unobserve(entry.target);
    });
    if (!isRevealing && wordQueue.length) {
      isRevealing = true;
      revealNextWord();
    }
  }, { rootMargin: "0px 0px -35% 0px", threshold: 0 });
  words.forEach((word) => wordObserver.observe(word));
}

// ─────────────────────────────────────────
// TEMPLATES
// ─────────────────────────────────────────
async function loadTemplates() {
  try {
    const res = await fetch(`${API}/templates/`);
    if (!res.ok) throw new Error(`Request failed (${res.status})`);
    const data = await res.json();
    templatesData = data.templates;
    if (!templatesData || typeof templatesData !== "object") {
      throw new Error("The template response was invalid.");
    }
    renderDocCards();
    renderSupportedCards();
    document.getElementById("template-count").textContent = String(
      Object.keys(templatesData).length,
    );
    setMessage("template-status", "");
  } catch (e) {
    const supportedCards = document.getElementById("supported-cards");
    supportedCards.innerHTML = "";
    supportedCards.setAttribute("aria-busy", "false");
    document.getElementById("supported-empty").hidden = false;
    document.getElementById("doc-cards").innerHTML = "";
    document.getElementById("doc-cards").setAttribute("aria-busy", "false");
    setMessage(
      "template-status",
      "Could not load document types. Check the API connection and try again.",
    );
  }
}

function renderDocCards() {
  const grid = document.getElementById("doc-cards");
  const semLabels = {
    project_1: "4th Semester",
    project_2: "6th Semester",
    internship: "7th Semester",
    project_3: "8th Semester",
  };

  grid.innerHTML = Object.entries(templatesData)
    .map(
      ([key, tmpl], index) => {
        const sections = Number(tmpl.total_required_sections);
        const chapters = Array.isArray(tmpl.chapters) ? tmpl.chapters.length : 0;
        return `
          <button type="button" class="doc-card${key === selectedDocType ? " selected" : ""}" data-doc-type="${escapeHTML(key)}" aria-pressed="${key === selectedDocType}">
            <span class="doc-card-topline">
              <span class="sem">${escapeHTML(semLabels[key] || `${tmpl.semester} Semester`)}</span>
              <span class="doc-card-position">0${index + 1}</span>
            </span>
            <span class="name">${escapeHTML(tmpl.name.split("—")[0].split("(")[0].trim())}</span>
            <span class="code">${escapeHTML(tmpl.code)}</span>
            <span class="doc-card-description">${escapeHTML(getTemplateDescription(key))}</span>
            <span class="doc-card-meta">${Number.isFinite(sections) ? `${escapeHTML(sections)} required sections` : `${escapeHTML(chapters)} chapters in template`}</span>
          </button>
        `;
      },
    )
    .join("");
  grid.setAttribute("aria-busy", "false");
}

function renderSupportedCards() {
  const container = document.getElementById("supported-cards");
  const emptyState = document.getElementById("supported-empty");
  const semLabels = {
    project_1: "4th Semester",
    project_2: "6th Semester",
    internship: "7th Semester",
    project_3: "8th Semester",
  };
  const templateDescriptions = {
    project_1:
      "Review introductory chapters, system analysis, design, implementation, and testing.",
    project_2:
      "Review development methodology, system design, implementation, and testing.",
    internship:
      "Review organization details, internship activities, weekly logs, and learning outcomes.",
    project_3:
      "Review the required chapters and academic checks for your final semester project.",
  };
  const entries = Object.entries(templatesData);
  container.setAttribute("aria-busy", "false");
  emptyState.hidden = entries.length > 0;
  container.innerHTML = entries
    .map(([key, tmpl], index) => {
      const name = tmpl.name.split("—")[0].split("(")[0].trim();
      const semester = semLabels[key] || `${tmpl.semester} Semester`;
      const sections = Number(tmpl.total_required_sections);
      return `
        <button type="button" class="supported-card" data-doc-type="${escapeHTML(key)}" aria-label="Select ${escapeHTML(name)}, ${escapeHTML(semester)}">
          <span class="supported-card-topline">
          <span class="supported-semester">${escapeHTML(semester)}</span>
            <span class="supported-card-position">0${index + 1}</span>
          </span>
          <span class="supported-name">${escapeHTML(name)}</span>
          <span class="supported-code">${escapeHTML(tmpl.code)}</span>
          <span class="supported-description">${escapeHTML(templateDescriptions[key] || "Review the required sections and academic checks for this report type.")}</span>
          <span class="supported-action">${Number.isFinite(sections) ? `${escapeHTML(sections)} required sections` : "View report checks"} <span aria-hidden="true">→</span></span>
        </button>`;
    })
    .join("");
}

function getTemplateDescription(key) {
  const descriptions = {
    project_1: "System analysis, design, implementation, and testing.",
    project_2: "Development methodology, system design, and testing.",
    internship: "Organization, internship activities, and learning outcomes.",
    project_3: "Required sections for the final semester project.",
  };
  return descriptions[key] || "Required sections and academic checks for this report.";
}

function selectDoc(key) {
  if (!Object.hasOwn(templatesData, key)) return false;
  document.querySelectorAll(".doc-card").forEach((card) => {
    const isSelected = card.dataset.docType === key;
    card.classList.toggle("selected", isSelected);
    card.setAttribute("aria-pressed", String(isSelected));
  });
  selectedDocType = key;
  document.getElementById("step1-next").disabled = false;
  setMessage("template-status", "");
  return true;
}

// ─────────────────────────────────────────
// FILE UPLOAD
// ─────────────────────────────────────────
function processFile(file) {
  document.getElementById("file-input").value = "";
  const extension = file.name.toLowerCase().split(".").pop();
  if (extension !== "pdf" && extension !== "docx") {
    setMessage("upload-status", "Choose a PDF or DOCX file.");
    return;
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    setMessage("upload-status", "The file exceeds the 10 MB limit.");
    return;
  }
  selectedFile = file;
  const area = document.getElementById("upload-area");
  area.classList.add("file-selected");
  document.getElementById("upload-content").innerHTML = `
    <span class="selected-file-check" aria-hidden="true">✓</span>
    <span class="upload-title">${escapeHTML(file.name)}</span>
    <span class="upload-btn-label">Change file</span>`;
  clearText();
  updateSelectedFileSummary();
  setMessage("upload-status", "File selected. Choose the button again to change it.");
  setMessage("input-error", "");
}

function clearText() {
  const text = document.getElementById("doc-text");
  text.value = "";
  const count = document.getElementById("word-count");
  count.textContent = "0 words";
  count.setAttribute("aria-label", "0 words");
}

function renderUploadPrompt() {
  document.getElementById("upload-area").classList.remove("file-selected", "drag-over");
  document.getElementById("upload-content").innerHTML = `
    <span class="upload-title">Choose a file or drop it here</span>
    <span class="upload-btn-label">Browse files</span>`;
}

function clearSelectedFile() {
  selectedFile = null;
  document.getElementById("file-input").value = "";
  renderUploadPrompt();
  updateSelectedFileSummary();
}

function updateSelectedFileSummary() {
  const name = document.getElementById("selected-file-name");
  const detail = document.getElementById("selected-file-detail");
  const action = document.getElementById("change-file-button");
  const summary = document.getElementById("selected-file-summary");
  if (!name || !detail || !action || !summary) return;

  if (selectedFile) {
    name.textContent = selectedFile.name;
    detail.textContent = `${(selectedFile.size / 1024).toFixed(0)} KB · Ready for analysis`;
    action.textContent = "Change file";
    summary.classList.add("has-file");
  } else {
    name.textContent = "No file selected";
    detail.textContent = "You can paste report text below instead.";
    action.textContent = "Choose file";
    summary.classList.remove("has-file");
  }
}

// ─────────────────────────────────────────
// STEP NAVIGATION
// ─────────────────────────────────────────
function setStep(n, { focus = true } = {}) {
  document.getElementById("progress-fill").style.transform =
    `scaleX(${n === 1 ? 1 / 3 : n === 2 ? 2 / 3 : 1})`;
  document
    .querySelector(".progress-track")
    .setAttribute("aria-valuenow", String(n));

  [1, 2, 3].forEach((i) => {
    const item = document.getElementById(`step${i}-dot`);
    item.classList.remove("active", "done");
    item.removeAttribute("aria-current");
    const numEl = item.querySelector(".step-num");
    if (i < n) {
      item.classList.add("done");
      numEl.textContent = "✓";
    } else if (i === n) {
      item.classList.add("active");
      item.setAttribute("aria-current", "step");
      numEl.textContent = String(i).padStart(2, "0");
    } else numEl.textContent = String(i).padStart(2, "0");
  });

  [1, 2, 3].forEach((i) => {
    document.getElementById(`step${i}`).hidden = i !== n;
  });
  document.getElementById("step-announcement").textContent =
    `Step ${n} of 3: ${["Select document type", "Add your document", "Analysis results"][n - 1]}`;
  if (focus) document.getElementById(`step${n}-title`).focus();
}

function goToStep1() {
  setStep(1);
}

function startOver() {
  const hasDraft =
    Boolean(selectedFile) || Boolean(document.getElementById("doc-text").value.trim());
  if (hasDraft && !window.confirm("Start over and discard your current document?")) {
    return;
  }
  selectedDocType = null;
  clearSelectedFile();
  clearText();
  document.querySelectorAll(".doc-card").forEach((card) => {
    card.classList.remove("selected");
    card.setAttribute("aria-pressed", "false");
  });
  document.getElementById("step1-next").disabled = true;
  document.getElementById("results-actions").innerHTML = `
    <button class="btn-ghost" type="button" onclick="goToStep2()">Edit document</button>
    <button class="btn-ghost" type="button" onclick="startOver()">Start over</button>`;
  document.getElementById("score-banner").hidden = false;
  setMessage("upload-status", "");
  setMessage("input-error", "");
  setStep(1);
}

function goToStep2() {
  if (!selectedDocType) return;

  // Reference format update
  const refEl = document.getElementById("ref-format");
  if (refEl) {
    refEl.textContent =
      selectedDocType === "internship" ? "APA format" : "IEEE format";
  }

  fetch(`${API}/templates/${selectedDocType}/`)
    .then((res) => res.json())
    .then((data) => {
      if (!data || !Array.isArray(data.required_sections)) {
        throw new Error("Template sections are unavailable.");
      }
      renderSectionList(data.required_sections, data.optional_sections || []);
    })
    .catch(() => {
      document.getElementById("section-list").textContent =
        "Could not load required sections. Check the API connection and try again.";
    });

  setStep(2);
}

function goToTextInput() {
  if (!selectedDocType) {
    setMessage("template-status", "Choose a report type before adding your document.");
    document.querySelector("#doc-cards [data-doc-type]")?.focus();
    return;
  }
  goToStep2();
  document.getElementById("doc-text").focus();
}

function renderSectionList(required, optional) {
  const container = document.getElementById("section-list");
  const all = [
    ...required.map((s) => ({ name: s, opt: false })),
    ...optional.map((s) => ({ name: s, opt: true })),
  ];
  container.innerHTML = all
    .map(
      (s, i) => `
    <div class="section-item">
      <span class="num">${i + 1}.</span>
      <span>${escapeHTML(capitalize(s.name))}</span>
      ${s.opt ? '<span class="opt">optional</span>' : ""}
    </div>
  `,
    )
    .join("");
}

// ─────────────────────────────────────────
// ANALYZE
// ─────────────────────────────────────────
async function analyze() {
  const text = document.getElementById("doc-text").value.trim();
  const hasFile = selectedFile !== null;
  const hasText = text.split(/\s+/).filter((x) => x).length >= 30;

  if (!hasFile && !hasText) {
    setMessage(
      "input-error",
      "Choose a PDF or DOCX file, or paste at least 30 words of document text.",
    );
    document.getElementById("input-error").focus();
    return;
  }

  setMessage("input-error", "");
  const analyzeButton = document.getElementById("analyze-button");
  analyzeButton.disabled = true;
  analyzeButton.setAttribute("aria-busy", "true");
  document.getElementById("step3").setAttribute("aria-busy", "true");
  document.getElementById("results-actions").hidden = true;
  setStep(3, { focus: false });
  document.getElementById("loading").hidden = false;
  document.getElementById("results").hidden = true;
  document.getElementById("score-banner").hidden = false;
  document.getElementById("loading").focus();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    let res;

    if (hasFile) {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("doc_type", selectedDocType);
      res = await fetch(`${API}/analyze/`, {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
    } else {
      res = await fetch(`${API}/analyze/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, doc_type: selectedDocType }),
        signal: controller.signal,
      });
    }

    let data;
    try {
      data = await res.json();
    } catch {
      throw new Error("The server returned an unreadable response.");
    }

    if (!res.ok) {
      showError(data.error || `Analysis failed (HTTP ${res.status}).`);
      return;
    }

    if (data.error) {
      showError(data.error);
      return;
    }

    if (
      !data.structure ||
      !Number.isFinite(Number(data.score)) ||
      !Number.isFinite(Number(data.structure.sections_found)) ||
      !Number.isFinite(Number(data.structure.total_required))
    ) {
      showError("The analysis service returned incomplete results. Please try again.");
      return;
    }

    renderResults(data);
    document.getElementById("results-actions").hidden = false;

    document.getElementById("results-actions").innerHTML = `
      <button class="btn-ghost" type="button" onclick="goToStep2()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M11 7H3M7 3L3 7l4 4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Edit document
      </button>
      <button class="btn-ghost" type="button" onclick="startOver()">Start over</button>
      <button class="btn-primary download-action" type="button" onclick="downloadReport()">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M7 1v8M4 10l3 3 3-3M1 10v2a1 1 0 001 1h10a1 1 0 001-1v-2"
                stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
        Download Report
      </button>`;

  } catch (error) {
    if (error.name === "AbortError") {
      showError("Analysis took too long (90s). Try with a smaller file or use plain text.");
    } else if (error instanceof TypeError) {
      showError("Could not reach the analysis service. Check the API connection and try again.");
    } else {
      showError(error.message || "The analysis could not be completed. Please try again.");
    }
  } finally {
    clearTimeout(timeout);
    analyzeButton.disabled = false;
    analyzeButton.removeAttribute("aria-busy");
    document.getElementById("step3").removeAttribute("aria-busy");
  }
}

// ─────────────────────────────────────────
// RENDER RESULTS
// ─────────────────────────────────────────
function renderResults(data) {
  document.getElementById("loading").hidden = true;
  document.getElementById("results").hidden = false;
  document.getElementById("results-actions").hidden = false;
  document.getElementById("result-announcement").textContent =
    `Analysis complete. Document readiness score: ${data.score} out of 100.`;
  document.getElementById("step3-title").focus();
  accordionCount = 0;

  const score = Number(data.score);
  const scoreClass = score >= 75 ? "good" : score >= 50 ? "ok" : "bad";
  const scoreDesc =
    score >= 75
      ? "Well structured document"
      : score >= 50
        ? "Needs some improvements"
        : "Significant issues found";

  // Progress bar update
  document.getElementById("progress-fill").style.transform = "scaleX(1)";

  // Score circle
  document.getElementById("score-num").textContent = score;
  document.getElementById("score-desc").textContent = scoreDesc;
  document.getElementById("score-circle").className =
    `score-circle ${scoreClass}`;

  // Metrics
  document.getElementById("metrics").innerHTML = `
    <div class="metric-card">
      <div class="metric-val">${escapeHTML(data.structure.sections_found)}/${escapeHTML(data.structure.total_required)}</div>
      <div class="metric-lbl">Sections<br>detected</div>
    </div>
    <div class="metric-card">
      <div class="metric-val">${escapeHTML(Number(data.total_words || 0).toLocaleString())}</div>
      <div class="metric-lbl">Total<br>words</div>
    </div>
    <div class="metric-card">
      <div class="metric-val ${data.total_issues > 5 ? "bad" : data.total_issues > 2 ? "ok" : "good"}">${escapeHTML(data.total_issues ?? 0)}</div>
      <div class="metric-lbl">Actionable<br>findings</div>
    </div>
    ${
      data.group_info?.member_count
        ? `
    <div class="metric-card">
      <div class="metric-val">${escapeHTML(data.group_info.member_count)}</div>
      <div class="metric-lbl">Member(s)<br>detected</div>
    </div>`
        : ""
    }
  `;
  const breakdown = data.score_breakdown || {};
  const breakdownItems = [
    ["Structure", breakdown.structure],
    ["Language", breakdown.language],
    ["Formatting", breakdown.formatting],
  ].filter(([, item]) => item && Number.isFinite(item.score) && Number.isFinite(item.max));
  document.getElementById("score-breakdown").innerHTML = breakdownItems.length
    ? `<h3>Score breakdown</h3><dl>${breakdownItems
        .map(
          ([label, item]) =>
            `<div class="score-breakdown-item"><dt>${label}</dt><dd>${escapeHTML(item.score)} / ${escapeHTML(item.max)}</dd></div>`,
        )
        .join("")}</dl>${
        breakdown.proposal_cap
          ? `<p class="score-breakdown-note">The overall score is capped at ${escapeHTML(breakdown.proposal_cap)} when a proposal is detected.</p>`
          : ""
      }`
    : "";
  document.getElementById("score-breakdown").hidden = breakdownItems.length === 0;

  const fb = document.getElementById("feedback");
  fb.innerHTML = "";
  // ── 0. DOCUMENT TYPE CHECK ──
  if (data.numbering_issues?.length > 0) {
    const hasError = data.numbering_issues.some((n) => n.type === "error");
    const items = data.numbering_issues
      .map(
        (n) =>
          `<div class="fb-item ${FEEDBACK_TYPES.has(n.type) ? n.type : "info"}">${escapeHTML(n.message)}</div>`,
      )
      .join("");
    fb.innerHTML += buildSection(
      "🚨 Document Type Check",
      hasError ? "error" : "warning",
      items,
    );
  }

  // Proposal bhane score circle red
  const isProposal = data.numbering_issues?.some(
    (n) => n.type === "error" && n.message.includes("PROPOSAL"),
  );
  if (isProposal) {
    document.getElementById("score-circle").className = "score-circle bad";
    document.getElementById("score-desc").textContent =
      "⚠️ This appears to be a proposal — submit your final report";
  }

  // ── 1. GROUP VALIDATION ──
  if (data.group_info?.feedback?.length > 0) {
    const g = data.group_info;
    let html = "";
    if (g.member_count) {
      html += `<div class="fb-item ${g.member_count > 2 ? "error" : "success"}">
        👥 <strong>${escapeHTML(g.member_count)} member(s) detected</strong>
        ${g.member_names?.length ? ` — ${g.member_names.map(escapeHTML).join(", ")}` : ""}
        ${g.roll_nos?.length ? `<br><span class="member-rolls">Roll: ${g.roll_nos.map(escapeHTML).join(", ")}</span>` : ""}
      </div>`;
    }
    g.feedback.forEach((f) => {
      html += `<div class="fb-item ${FEEDBACK_TYPES.has(f.type) ? f.type : "info"}">
        ${f.type === "error" ? "❌" : f.type === "warning" ? "⚠️" : f.type === "success" ? "✅" : "ℹ️"}
        ${escapeHTML(f.message)}
      </div>`;
    });
    fb.innerHTML += buildSection(
      "👥 Group / Member Validation",
      g.feedback.some((f) => f.type === "error")
        ? "error"
        : g.feedback.some((f) => f.type === "warning")
          ? "warning"
          : "success",
      html,
    );
  }

  // ── 2. MISSING SECTIONS ──
  if (data.section_guides?.length > 0) {
    let html = "";
    data.section_guides.forEach((guide) => {
      const panelId = nextAccordionId();
      html += `
        <div class="fb-item error expandable">
          <button type="button" class="fb-item-header" aria-expanded="false" aria-controls="${panelId}" onclick="toggleExpand(this)">
            <span>❌ <strong>${escapeHTML(guide.section)}</strong> — Missing</span>
            <span class="expand-btn">▼ How to fix</span>
          </button>
          <div class="fb-expand-content" id="${panelId}" hidden>
            <p class="fb-label">📝 This section must contain:</p>
            <ul class="fix-list">
              ${guide.must_contain.map((c) => `<li>${escapeHTML(c)}</li>`).join("")}
            </ul>
            ${guide.word_limit ? `<p class="fb-meta">📏 Suggested: <strong>${escapeHTML(guide.word_limit)}</strong></p>` : ""}
            ${guide.tip ? `<p class="fb-tip">💡 ${escapeHTML(guide.tip)}</p>` : ""}
            ${
              guide.template
                ? `<p class="fb-label" style="margin-top:.5rem">✏️ Template:</p>
              <div class="code-block">${escapeHTML(guide.template)}</div>`
                : ""
            }
          </div>
        </div>`;
    });
    fb.innerHTML += buildSection(
      "📋 Missing Sections — How to Fix",
      "error",
      html,
    );
  } else {
    fb.innerHTML += buildSection(
      "📋 Section Structure",
      "success",
      `<div class="fb-item success">✅ All required sections detected!</div>`,
    );
  }

  // ── 3. CHAPTER SUB-SECTIONS ──
  if (data.structure.subsection_issues?.length > 0) {
    const items = data.structure.subsection_issues
      .map(
        (s) =>
            `<div class="fb-item warning">⚠️ Missing: <strong>${escapeHTML(s)}</strong></div>`,
      )
      .join("");
    fb.innerHTML += buildSection("📑 Chapter Sub-sections", "warning", items);
  }

  // ── 4. PASSIVE VOICE FIXES ──
  if (data.passive_fixes?.length > 0) {
    let html = `<div class="fb-item error">❌ First-person active voice detected. TU FOHSS requires passive voice / third-person.</div>
      <p class="fb-label" style="margin:.6rem 0 .4rem">🔄 Specific corrections:</p>`;
    data.passive_fixes.forEach((fix) => {
      html += `<div class="fix-card">
        <div class="fix-original">❌ "${escapeHTML(fix.sentence || fix.original)}"</div>
        <div class="fix-arrow">↓ Suggested fix</div>
        <div class="fix-suggested">✅ "${escapeHTML(fix.suggested)}"</div>
      </div>`;
    });
    fb.innerHTML += buildSection(
      "✍️ First-Person Language Fixes",
      "error",
      html,
    );
  }

  // ── 5. GRAMMAR ISSUES ──
  if (data.grammar_issues?.length > 0) {
    const high = data.grammar_issues.filter((g) => g.priority === "high");
    const normal = data.grammar_issues.filter((g) => g.priority === "normal");
    let html = "";
    if (high.length > 0) {
      html += `<p class="fb-label" style="margin-bottom:.4rem">🔴 Significant issues:</p>`;
      high.forEach((g) => {
        html += `<div class="fix-card">
            <div class="fix-original">❌ ${escapeHTML(g.context)}</div>
            <div class="fix-arrow">↓ ${escapeHTML(g.message)}</div>
            ${g.suggestion ? `<div class="fix-suggested">✅ "${escapeHTML(g.suggestion)}"</div>` : ""}
        </div>`;
      });
    }
    if (normal.length > 0) {
      html += `<p class="fb-label" style="margin:.6rem 0 .4rem">🟡 Minor suggestions:</p>`;
      normal.forEach((g) => {
        html += `<div class="fb-item warning" style="margin-bottom:4px">
          ⚠️ ${escapeHTML(g.message)}
          ${g.suggestion ? ` → <strong>"${escapeHTML(g.suggestion)}"</strong>` : ""}
          <br><span class="grammar-context">${escapeHTML(g.context)}</span>
        </div>`;
      });
    }
    fb.innerHTML += buildSection(
      "📝 Grammar Analysis",
      high.length > 0 ? "error" : "warning",
      html,
    );
  }

  // ── ACADEMIC TONE ──
  if (data.academic_tone?.length > 0) {
    const items = data.academic_tone
      .map(
        (f) => `
      <div class="fb-item ${FEEDBACK_TYPES.has(f.type) ? f.type : "info"}">
        ${f.type === "error" ? "❌" : f.type === "warning" ? "⚠️" : f.type === "success" ? "✅" : "ℹ️"}
        ${escapeHTML(f.message)}
      </div>`,
      )
      .join("");
    fb.innerHTML += buildSection(
      "🎓 Academic Tone",
      getBadgeType(data.academic_tone),
      items,
    );
  }

  // ── 6. INFORMAL LANGUAGE ──
  if (data.informal_fixes?.length > 0) {
    let html = `<div class="fb-item warning">⚠️ Informal vocabulary found — replace with academic terms:</div>
      <table class="fix-table">
        <thead><tr><th>Informal</th><th>Replace with</th><th>Context</th></tr></thead>
        <tbody>
          ${data.informal_fixes
            .map(
              (f) => `
            <tr>
              <td class="word-bad">"${escapeHTML(f.word)}"${f.count > 1 ? ` ×${escapeHTML(f.count)}` : ""}</td>
              <td class="word-good">${escapeHTML(f.replace_with)}</td>
              <td class="word-context">${escapeHTML(f.context)}</td>
            </tr>`,
            )
            .join("")}
        </tbody>
      </table>`;
    fb.innerHTML += buildSection("🗣️ Informal Language", "warning", html);
  }

  // ── 7. WORD COUNT ──
  const wcInfo = (data.wordcount || []).filter((w) => w.type === "info");
  const wcSuccess = (data.wordcount || []).filter((w) => w.type === "success");
  if (wcInfo.length > 0 || wcSuccess.length > 0) {
    let html = `<div class="fb-item info" style="margin-bottom:.5rem">
      ℹ️ <strong>Note:</strong> Word counts are <strong>estimates</strong> — 
      not mandatory TU requirements. Content quality matters more.
      ${
        data.file_type === "pdf"
          ? "<br>⚠️ <strong>PDF detected:</strong> Word counts may vary ±20%. Upload <strong>DOCX</strong> for accurate analysis."
          : ""
      }
    </div>`;
    wcInfo.forEach((w) => {
      const panelId = nextAccordionId();
      html += `<div class="fb-item info expandable">
        <button type="button" class="fb-item-header" aria-expanded="false" aria-controls="${panelId}" onclick="toggleExpand(this)">
          <span>ℹ️ ${escapeHTML(w.message)}</span>
          ${w.how_to_fix ? `<span class="expand-btn">▼ Suggestions</span>` : ""}
        </button>
        ${
          w.how_to_fix
            ? `<div class="fb-expand-content" id="${panelId}" hidden>
          <ul class="fix-list">${w.how_to_fix.map((h) => `<li>${escapeHTML(h)}</li>`).join("")}</ul>
          ${w.tip ? `<p class="fb-tip">💡 ${escapeHTML(w.tip)}</p>` : ""}
        </div>`
            : ""
        }
      </div>`;
    });
    wcSuccess.forEach((w) => {
      html += `<div class="fb-item success">✅ ${escapeHTML(w.message)}</div>`;
    });
    fb.innerHTML += buildSection(
      "📏 Word Count",
      wcInfo.length > 0 ? "info" : "success",
      html,
    );
  }

  // ── 8. FORMATTING ──
  if (data.formatting?.length > 0) {
    const items = data.formatting
      .map(
        (f) => `
      <div class="fb-item ${FEEDBACK_TYPES.has(f.type) ? f.type : "info"}">
        ${f.type === "error" ? "❌" : f.type === "warning" ? "⚠️" : f.type === "success" ? "✅" : "ℹ️"}
        ${escapeHTML(f.message)}
      </div>`,
      )
      .join("");
    fb.innerHTML += buildSection(
      "📐 Formatting",
      getBadgeType(data.formatting),
      items,
    );
  }

  // ── Template info ──
  fb.innerHTML += buildSection(
    "ℹ️ Analysis Info",
    "info",
    `
        <div class="fb-item info analysis-meta">
          <strong>Template:</strong> ${escapeHTML(data.template_name)} ·
          <strong>Code:</strong> ${escapeHTML(data.course_code)} ·
          <strong>File:</strong> ${escapeHTML((data.file_type || "text").toUpperCase())} ·
          <strong>Referencing:</strong> ${data.doc_type === "internship" ? "APA" : "IEEE"}
        </div>`,
  );
}

// ─────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────
function showError(msg) {
  document.getElementById("loading").hidden = true;
  document.getElementById("results").hidden = false;
  document.getElementById("score-banner").hidden = true;
  document.getElementById("score-breakdown").hidden = true;
  document.getElementById("results-actions").hidden = true;
  document.getElementById("result-announcement").textContent =
    "Analysis could not be completed.";
  document.getElementById("feedback").innerHTML = `
    <div class="fb-section">
      <div class="fb-section-body">
        <div class="fb-item error" role="alert" tabindex="-1" id="analysis-error">❌ ${escapeHTML(msg)}</div>
        <div style="margin-top:.75rem;display:flex;gap:8px">
          <button class="btn-ghost" type="button" onclick="goToStep2()">← Try again</button>
          <button class="btn-ghost" type="button" onclick="startOver()">Start over</button>
        </div>
      </div>
    </div>`;
  document.getElementById("analysis-error").focus();
}

function icon(type) {
  return type === "error"
    ? "❌"
    : type === "warning"
      ? "⚠️"
      : type === "success"
        ? "✅"
        : "ℹ️";
}

function buildSection(title, badgeType, content) {
  const badgeText = {
    error: "Action needed",
    warning: "Review",
    success: "Good",
    info: "Info",
  };
  return `
    <div class="fb-section">
      <div class="fb-section-header">
        <span class="fb-section-title">${escapeHTML(title)}</span>
        <span class="fb-badge ${FEEDBACK_TYPES.has(badgeType) ? badgeType : "info"}">${badgeText[badgeType] || "Info"}</span>
      </div>
      <div class="fb-section-body">${content}</div>
    </div>`;
}

function getBadgeType(items) {
  if (items.some((i) => i.type === "error")) return "error";
  if (items.some((i) => i.type === "warning")) return "warning";
  return "success";
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function nextAccordionId() {
  accordionCount += 1;
  return `feedback-panel-${accordionCount}`;
}

function toggleExpand(header) {
  const content = document.getElementById(header.getAttribute("aria-controls"));
  if (!content) return;
  const btn = header.querySelector(".expand-btn");
  const isExpanded = header.getAttribute("aria-expanded") === "true";
  header.setAttribute("aria-expanded", String(!isExpanded));
  content.hidden = isExpanded;
  if (btn) btn.textContent = isExpanded ? "▼ How to fix" : "▲ Hide";
}

function downloadReport() {
  const score = document.getElementById("score-num").textContent;
  const scoreDesc = document.getElementById("score-desc").textContent;
  const metrics = document.getElementById("metrics").innerHTML;
  const feedback = document.getElementById("feedback").innerHTML;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8"/>
  <title>TU Document Analysis Report</title>
  <style>
    body {
      font-family: 'Times New Roman', serif;
      max-width: 750px;
      margin: 0 auto;
      padding: 40px;
      color: #1C1714;
      line-height: 1.6;
    }
    .report-header {
      text-align: center;
      border-bottom: 2px solid #7A2E1A;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .report-header h1 {
      font-size: 20px;
      color: #7A2E1A;
      margin-bottom: 4px;
    }
    .report-header p {
      font-size: 12px;
      color: #666;
    }
    .score-box {
      background: #FAF8F4;
      border: 1px solid #E4DDD8;
      border-radius: 8px;
      padding: 16px 20px;
      margin-bottom: 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .score-big {
      font-size: 36px;
      font-weight: 700;
      color: #7A2E1A;
      min-width: 80px;
    }
    .metric-card {
      background: #F0EBE3;
      border-radius: 6px;
      padding: 8px 14px;
      text-align: center;
      display: inline-block;
      margin: 4px;
    }
    .metric-val { font-size: 18px; font-weight: 700; }
    .metric-lbl { font-size: 10px; color: #666; }
    .fb-section {
      margin-bottom: 20px;
      border: 1px solid #E4DDD8;
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .fb-section-header {
      background: #FAF8F4;
      padding: 10px 16px;
      border-bottom: 1px solid #E4DDD8;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .fb-section-title { font-size: 13px; font-weight: 600; }
    .fb-section-body { padding: 12px 16px; }
    .fb-item {
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 11.5px;
      margin-bottom: 5px;
      border-left: 3px solid transparent;
      line-height: 1.55;
    }
    .fb-item.error   { background: #FCEDED; border-left-color: #D63030; color: #4A0A0A; }
    .fb-item.warning { background: #FDF5E0; border-left-color: #E8A000; color: #4A3000; }
    .fb-item.success { background: #EAF3E8; border-left-color: #3D8B3D; color: #0A2A0A; }
    .fb-item.info    { background: #E8EFF9; border-left-color: #3B6FCC; color: #0A1E4A; }
    .fb-badge { font-size: 10px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
    .fb-badge.error   { background: #FCEDED; color: #8B1A1A; }
    .fb-badge.warning { background: #FDF5E0; color: #7A5500; }
    .fb-badge.success { background: #EAF3E8; color: #2D6A2D; }
    .fb-badge.info    { background: #E8EFF9; color: #1A3D6B; }
    .fix-card {
      background: #fff;
      border: 1px solid #E4DDD8;
      border-radius: 6px;
      padding: 8px 12px;
      margin: 4px 0;
      font-size: 11.5px;
    }
    .fix-original  { color: #8B1A1A; font-style: italic; }
    .fix-suggested { color: #2D6A2D; font-weight: 600; margin-top: 3px; }
    .fix-list { padding-left: 16px; font-size: 11.5px; color: #4A3F38; }
    .fix-list li { margin-bottom: 3px; }
    .fix-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 11px;
      margin-top: 6px;
    }
    .fix-table th {
      background: #F0EBE3;
      padding: 6px 8px;
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
    }
    .fix-table td {
      padding: 6px 8px;
      border-top: 1px solid #EDE8E3;
    }
    .expand-btn, .fb-item.expandable { display: block; }
    .fb-expand-content { display: block !important; }
    .fb-item-header { display: block; }
    .fb-tip {
      background: #F5E8D6;
      border-left: 3px solid #80521F;
      padding: 6px 10px;
      border-radius: 0 6px 6px 0;
      font-size: 11px;
      color: #5A4000;
      margin-top: 6px;
    }
    .fb-label { font-size: 11.5px; font-weight: 600; color: #4A3F38; margin-bottom: 4px; }
    .code-block {
      background: #FAF8F4;
      border: 1px solid #E4DDD8;
      border-radius: 4px;
      padding: 8px 10px;
      font-family: 'Courier New', monospace;
      font-size: 10.5px;
      white-space: pre-line;
      margin-top: 4px;
    }
    .report-footer {
      text-align: center;
      font-size: 10px;
      color: #999;
      border-top: 1px solid #E4DDD8;
      padding-top: 16px;
      margin-top: 30px;
    }
    .fb-item.expandable{display:block}
    .fb-expand-content{display:block!important}
    @media print {
      body { padding: 20px; }
      .score-box { page-break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="report-header">
    <h1>TU BCA Document Analysis Report</h1>
    <p>Generated by TU Document Assistant · ${new Date().toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    )}</p>
  </div>

  <div class="score-box">
    <div class="score-big">${score}<span style="font-size:14px;color:#666">/100</span></div>
    <div>
      <div style="font-size:14px;font-weight:600;margin-bottom:6px">${scoreDesc}</div>
      <div>${metrics}</div>
    </div>
  </div>

  ${feedback}

  <div class="report-footer">
    Tribhuvan University · Faculty of Humanities and Social Sciences · BCA Document Assistant
  </div>
</body>
</html>`;

  // Open print dialog — user can Save as PDF
  const win = window.open("", "_blank");
  if (!win) {  // ← null check chhaina!
    alert("Popup blocked! Browser settings ma popup allow garnus.");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.onload = () => {
    win.print();
  };
}
