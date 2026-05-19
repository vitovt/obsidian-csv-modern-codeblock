// @ts-nocheck
import { MarkdownRenderChild, Notice, Plugin, TFile } from "obsidian";

class CsvParseError extends Error {
  constructor(message, row, field, line) {
    super(message);
    this.name = "CsvParseError";
    this.row = row;
    this.field = field;
    this.line = line;
  }
}

class CsvParser {
  constructor(source, delimiter = ',') {
    this.source = source;
    this.delimiter = delimiter;
  }

  forEachRow(onRow) {
    const source = this.source;
    const delimiter = this.delimiter;
    const STATE_FIELD_START = 0;
    const STATE_IN_UNQUOTED = 1;
    const STATE_IN_QUOTED = 2;
    const STATE_AFTER_QUOTE = 3;
    let currentRow = [];
    let currentFieldParts = [];
    let fieldStart = 0;
    let state = STATE_FIELD_START;
    let rowNumber = 1;
    let fieldNumber = 1;
    let lineNumber = 1;
    let lastTokenWasDelimiter = false;

    const appendPendingFieldText = (end) => {
      if (fieldStart < end) {
        currentFieldParts.push(source.slice(fieldStart, end));
      }
    };

    const throwParseError = (message) => {
      throw new CsvParseError(message, rowNumber, fieldNumber, lineNumber);
    };

    const pushField = () => {
      if (currentFieldParts.length === 0) {
        currentRow.push('');
      } else if (currentFieldParts.length === 1) {
        currentRow.push(currentFieldParts[0]);
      } else {
        currentRow.push(currentFieldParts.join(''));
      }
      currentFieldParts = [];
      fieldNumber++;
      lastTokenWasDelimiter = false;
    };

    const pushRow = () => {
      if (state === STATE_FIELD_START && lastTokenWasDelimiter) {
        pushField();
      } else if (state === STATE_IN_UNQUOTED || state === STATE_AFTER_QUOTE) {
        pushField();
      } else if (state === STATE_FIELD_START && currentRow.length === 0) {
        pushField();
      }
      if (currentRow.length > 1 || currentRow[0] !== '') {
        onRow(currentRow, rowNumber);
      }
      currentRow = [];
      rowNumber++;
      fieldNumber = 1;
      state = STATE_FIELD_START;
      lastTokenWasDelimiter = false;
    };

    for (let i = 0; i < source.length; i++) {
      const char = source[i];
      const nextChar = source[i + 1];
      const isNewLine = char === "\n" || char === "\r";

      if (state === STATE_FIELD_START) {
        if (char === delimiter) {
          pushField();
          fieldStart = i + 1;
          lastTokenWasDelimiter = true;
        } else if (isNewLine) {
          pushRow();
          if (char === "\r" && nextChar === "\n") {
            i++;
          }
          fieldStart = i + 1;
          lineNumber++;
        } else if (char === '"') {
          state = STATE_IN_QUOTED;
          fieldStart = i + 1;
        } else {
          state = STATE_IN_UNQUOTED;
          fieldStart = i;
        }
        continue;
      }

      if (state === STATE_IN_UNQUOTED) {
        if (char === delimiter) {
          appendPendingFieldText(i);
          pushField();
          fieldStart = i + 1;
          state = STATE_FIELD_START;
          lastTokenWasDelimiter = true;
        } else if (isNewLine) {
          appendPendingFieldText(i);
          pushRow();
          if (char === "\r" && nextChar === "\n") {
            i++;
          }
          fieldStart = i + 1;
          lineNumber++;
        } else if (char === '"') {
          throwParseError("Unexpected quote inside an unquoted field");
        }
        continue;
      }

      if (state === STATE_IN_QUOTED) {
        if (char === '"') {
          appendPendingFieldText(i);
          if (nextChar === '"') {
            currentFieldParts.push('"');
            i++;
            fieldStart = i + 1;
          } else {
            state = STATE_AFTER_QUOTE;
            fieldStart = i + 1;
          }
        } else if (char === "\r") {
          if (nextChar === "\n") {
            i++;
          }
          lineNumber++;
        } else if (char === "\n") {
          lineNumber++;
        }
        continue;
      }

      if (char === delimiter) {
        pushField();
        fieldStart = i + 1;
        state = STATE_FIELD_START;
        lastTokenWasDelimiter = true;
      } else if (isNewLine) {
        pushRow();
        if (char === "\r" && nextChar === "\n") {
          i++;
        }
        fieldStart = i + 1;
        lineNumber++;
      } else if (char === " " || char === "\t") {
        fieldStart = i + 1;
      } else {
        throwParseError(`Unexpected character "${char}" after a closing quote`);
      }
    }

    if (state === STATE_IN_QUOTED) {
      throwParseError("Unclosed quoted field");
    }

    if (state === STATE_IN_UNQUOTED) {
      appendPendingFieldText(source.length);
      pushField();
      state = STATE_FIELD_START;
    } else if (state === STATE_AFTER_QUOTE) {
      pushField();
      state = STATE_FIELD_START;
    } else if (state === STATE_FIELD_START && lastTokenWasDelimiter) {
      pushField();
    }

    if (currentRow.length > 0) {
      pushRow();
    }
  }

}

function detectCsvDelimiter(source) {
  const candidates = [",", ";"];
  const scores = new Map(candidates.map((delimiter) => [delimiter, 0]));
  const matches = new Map(candidates.map((delimiter) => [delimiter, 0]));
  let inQuotes = false;
  let rowCounts = new Map(candidates.map((delimiter) => [delimiter, 0]));
  let sampledRows = 0;
  let sawRowData = false;

  const commitRow = () => {
    if (!sawRowData) {
      rowCounts = new Map(candidates.map((delimiter) => [delimiter, 0]));
      return;
    }
    sampledRows++;
    for (const delimiter of candidates) {
      const count = rowCounts.get(delimiter);
      if (count > 0) {
        scores.set(delimiter, scores.get(delimiter) + count);
        matches.set(delimiter, matches.get(delimiter) + 1);
      }
    }
    rowCounts = new Map(candidates.map((delimiter) => [delimiter, 0]));
    sawRowData = false;
  };

  for (let i = 0; i < source.length && sampledRows < 10; i++) {
    const char = source[i];
    const nextChar = source[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      sawRowData = true;
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && nextChar === "\n") {
        i++;
      }
      commitRow();
      continue;
    }

    if (!inQuotes && scores.has(char)) {
      rowCounts.set(char, rowCounts.get(char) + 1);
      sawRowData = true;
    } else if (char.trim().length > 0) {
      sawRowData = true;
    }
  }

  commitRow();

  if (scores.get(";") > scores.get(",") && matches.get(";") >= matches.get(",")) {
    return ";";
  }
  return ",";
}

function createCellContent(doc, cell, text) {
  const trimmed = text.trim();
  if (trimmed.length > 0) {
    try {
      const url = new URL(trimmed);
      if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:") {
        const link = doc.createElement("a");
        link.className = "csv-codeblock__link";
        link.href = trimmed;
        link.textContent = text;
        if (url.protocol !== "mailto:") {
          link.target = "_blank";
          link.rel = "noopener noreferrer";
        }
        cell.appendChild(link);
        return;
      }
    } catch (error) {
    }
  }
  cell.textContent = text;
}

function serializeCsvField(value, delimiter) {
  const text = String(value == null ? "" : value);
  const needsQuotes = text.includes('"') ||
    text.includes("\n") ||
    text.includes("\r") ||
    text.includes(delimiter) ||
    /^[ \t]/.test(text) ||
    /[ \t]$/.test(text);

  if (!needsQuotes) {
    return text;
  }

  return `"${text.replace(/"/g, '""')}"`;
}

function serializeCsvRows(rows, delimiter) {
  return rows.map((row) => row.map((value) => serializeCsvField(value, delimiter)).join(delimiter)).join("\n");
}

function normalizeSourceText(source) {
  return source.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function getCodeBlockSectionInfo(ctx, el) {
  if (!ctx || typeof ctx.getSectionInfo !== "function") {
    return null;
  }

  return ctx.getSectionInfo(el) || (el.parentElement ? ctx.getSectionInfo(el.parentElement) : null);
}

function getSourceFile(app, ctx) {
  const sourcePath = ctx && typeof ctx.sourcePath === "string" ? ctx.sourcePath : "";
  if (sourcePath.length > 0) {
    const sourceFile = app.vault.getAbstractFileByPath(sourcePath);
    if (sourceFile instanceof TFile) {
      return sourceFile;
    }
  }

  return null;
}

function countSourceLines(source) {
  return source.length === 0 ? 1 : source.split(/\r?\n/).length;
}

async function replaceCodeBlockSource(plugin, ctx, sectionInfo, previousSource, nextSource) {
  if (!sectionInfo || typeof sectionInfo.lineStart !== "number" || typeof sectionInfo.lineEnd !== "number") {
    throw new Error("Cannot locate the source code block in the note");
  }

  const sourceFile = getSourceFile(plugin.app, ctx);
  if (!sourceFile) {
    throw new Error("Cannot locate the note file for this rendered table");
  }

  let lineDelta = 0;

  await plugin.app.vault.process(sourceFile, (fileText) => {
    const newline = fileText.includes("\r\n") ? "\r\n" : "\n";
    const lines = fileText.split(/\r?\n/);
    const bodyStart = sectionInfo.lineStart + 1;
    const bodyEnd = sectionInfo.lineEnd;

    if (bodyStart < 0 || bodyEnd < bodyStart || bodyEnd > lines.length) {
      throw new Error("The source code block range is no longer valid");
    }

    const currentBody = lines.slice(bodyStart, bodyEnd).join("\n");
    if (normalizeSourceText(currentBody) !== normalizeSourceText(previousSource)) {
      throw new Error("The source CSV block changed after this table was rendered");
    }

    const replacementLines = nextSource.length === 0 ? [""] : nextSource.split(/\r?\n/);
    lineDelta = replacementLines.length - countSourceLines(previousSource);
    return lines.slice(0, bodyStart).concat(replacementLines, lines.slice(bodyEnd)).join(newline);
  });

  sectionInfo.lineEnd += lineDelta;
}

function showCsvEditError(error) {
  const message = error instanceof Error ? error.message : String(error);
  new Notice(`CSV edit failed: ${message}`);
}

function compareCellValues(leftValue, rightValue) {
  const leftText = leftValue.trim();
  const rightText = rightValue.trim();

  if (leftText.length === 0 && rightText.length === 0) {
    return 0;
  }
  if (leftText.length === 0) {
    return 1;
  }
  if (rightText.length === 0) {
    return -1;
  }

  const leftNumber = Number(leftText);
  const rightNumber = Number(rightText);
  const leftIsNumber = Number.isFinite(leftNumber);
  const rightIsNumber = Number.isFinite(rightNumber);

  if (leftIsNumber && rightIsNumber) {
    return leftNumber - rightNumber;
  }

  return leftText.localeCompare(rightText, void 0, {
    numeric: true,
    sensitivity: "base"
  });
}

function updateSortIndicators(headers, activeColumnIndex, direction, enabled) {
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const isActive = enabled && i === activeColumnIndex;
    header.cell.setAttribute("aria-sort", isActive ? direction === 1 ? "ascending" : "descending" : "none");
    header.indicator.textContent = isActive ? direction === 1 ? "▲" : "▼" : "";
    header.button.className = enabled ? "csv-codeblock__sort-button" : "csv-codeblock__sort-button csv-codeblock__sort-button--disabled";
    header.button.setAttribute("aria-disabled", enabled ? "false" : "true");
  }
}

function createSortController(body, headers, rows) {
  let activeColumnIndex = -1;
  let direction = 1;
  let enabled = false;

  const resetOrder = () => {
    const sortedRows = rows.slice().sort((left, right) => left.originalIndex - right.originalIndex);
    for (const row of sortedRows) {
      body.appendChild(row.element);
    }
  };

  const applySort = () => {
    if (!enabled || activeColumnIndex < 0) {
      return;
    }
    const sortedRows = rows.slice().sort((left, right) => {
      const result = compareCellValues(
        left.values[activeColumnIndex] || "",
        right.values[activeColumnIndex] || ""
      );
      if (result !== 0) {
        return result * direction;
      }
      return left.originalIndex - right.originalIndex;
    });

    for (const row of sortedRows) {
      body.appendChild(row.element);
    }
  };

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    header.button.addEventListener("click", () => {
      if (!enabled) {
        return;
      }
      if (activeColumnIndex === i) {
        direction = direction === 1 ? -1 : 1;
      } else {
        activeColumnIndex = i;
        direction = 1;
      }
      applySort();
      updateSortIndicators(headers, activeColumnIndex, direction, enabled);
    });
  }

  const setEnabled = (nextEnabled) => {
    enabled = nextEnabled && headers.length > 0 && rows.length > 0;
    if (!enabled) {
      activeColumnIndex = -1;
      direction = 1;
      resetOrder();
    }
    updateSortIndicators(headers, activeColumnIndex, direction, enabled);
  };

  setEnabled(false);
  return {
    setEnabled,
    refresh: applySort
  };
}

function createFilterController(doc, head, headerRow, rows) {
  if (!headerRow || rows.length === 0) {
    return {
      setEnabled() {
      },
      refresh() {
      }
    };
  }

  const filterRow = doc.createElement("tr");
  const inputs = [];
  const requestFrame = typeof requestAnimationFrame === "function" ? requestAnimationFrame : (callback) => {
    callback();
    return 0;
  };
  const cancelFrame = typeof cancelAnimationFrame === "function" ? cancelAnimationFrame : () => {
  };
  let frameHandle = 0;
  let enabled = false;

  filterRow.className = "csv-codeblock__header-filter-row";

  for (let i = 0; i < headerRow.childNodes.length; i++) {
    const cell = doc.createElement("th");
    const input = doc.createElement("input");

    cell.className = "csv-codeblock__header-filter-cell";
    input.type = "search";
    input.className = "csv-codeblock__header-filter-input";
    input.placeholder = "Filter";

    input.addEventListener("input", () => {
      if (frameHandle) {
        cancelFrame(frameHandle);
      }
      frameHandle = requestFrame(() => {
        frameHandle = 0;
        applyFilter();
      });
    });

    cell.appendChild(input);
    filterRow.appendChild(cell);
    inputs.push(input);
  }

  head.appendChild(filterRow);

  const applyFilter = () => {
    for (const row of rows) {
      let isVisible = true;
      for (let i = 0; i < inputs.length; i++) {
        const query = inputs[i].value.trim().toLowerCase();
        if (query.length > 0 && !(row.searchValues[i] || "").includes(query)) {
          isVisible = false;
          break;
        }
      }
      row.element.hidden = !isVisible;
    }
  };

  const clearFilters = () => {
    for (const input of inputs) {
      input.value = "";
    }
  };

  const setEnabled = (nextEnabled) => {
    enabled = nextEnabled;
    filterRow.hidden = !enabled;
    if (!enabled) {
      clearFilters();
    }
    applyFilter();
  };

  setEnabled(false);
  return {
    setEnabled,
    refresh: applyFilter
  };
}

function renderDataCellContent(doc, cell, value, linksEnabled) {
  cell.replaceChildren();
  if (linksEnabled) {
    createCellContent(doc, cell, value);
  } else {
    cell.textContent = value;
  }
}

function createEditController(plugin, doc, table, sourceRows, dataRows, editContext, onRowsChanged, onDirtyChanged) {
  let enabled = false;
  let activeEdit = null;
  let saving = false;
  let dirty = false;

  const findDataRow = (sourceRowIndex) => dataRows.find((row) => row.sourceRowIndex === sourceRowIndex);

  const setDirty = (nextDirty) => {
    if (dirty === nextDirty) {
      return;
    }
    dirty = nextDirty;
    onDirtyChanged(dirty);
  };

  const restoreCell = (edit, value) => {
    edit.cell.classList.remove("csv-codeblock__cell--editing", "csv-codeblock__cell--saving", "csv-codeblock__cell--error");

    if (edit.isHeader) {
      edit.editor.remove();
      for (const node of edit.hiddenNodes) {
        node.hidden = false;
      }
      if (edit.label) {
        edit.label.textContent = value;
      }
      return;
    }

    renderDataCellContent(doc, edit.cell, value, editContext.links);
  };

  const cancelActiveEdit = () => {
    if (!activeEdit) {
      return;
    }
    const edit = activeEdit;
    activeEdit = null;
    restoreCell(edit, sourceRows[edit.sourceRowIndex][edit.sourceColumnIndex] || "");
  };

  const commitActiveEdit = () => {
    if (!activeEdit) {
      return;
    }

    const edit = activeEdit;
    const nextValue = edit.editor.value;
    const previousValue = sourceRows[edit.sourceRowIndex][edit.sourceColumnIndex] || "";

    if (nextValue === previousValue) {
      activeEdit = null;
      restoreCell(edit, previousValue);
      return;
    }

    sourceRows[edit.sourceRowIndex][edit.sourceColumnIndex] = nextValue;

    if (!edit.isHeader) {
      const dataRow = findDataRow(edit.sourceRowIndex);
      if (dataRow) {
        dataRow.values[edit.sourceColumnIndex] = nextValue;
        dataRow.searchValues[edit.sourceColumnIndex] = nextValue.toLowerCase();
      }
    }

    activeEdit = null;
    restoreCell(edit, nextValue);
    setDirty(true);
    onRowsChanged();
  };

  const saveSession = async () => {
    if (saving) {
      return false;
    }

    commitActiveEdit();

    if (!dirty) {
      return true;
    }

    saving = true;
    table.classList.add("csv-codeblock__table--saving");

    try {
      const nextSource = serializeCsvRows(sourceRows, editContext.delimiter);

      await replaceCodeBlockSource(
        plugin,
        editContext.ctx,
        editContext.sectionInfo,
        editContext.sourceRef.value,
        nextSource
      );

      editContext.sourceRef.value = nextSource;
      setDirty(false);
      return true;
    } catch (error) {
      showCsvEditError(error);
      return false;
    } finally {
      saving = false;
      table.classList.remove("csv-codeblock__table--saving");
    }
  };

  const startEdit = (cell) => {
    if (saving) {
      return;
    }
    if (activeEdit && activeEdit.cell === cell) {
      activeEdit.editor.focus();
      return;
    }
    if (activeEdit) {
      commitActiveEdit();
      if (activeEdit) {
        return;
      }
    }

    const sourceRowIndex = Number(cell.dataset.sourceRowIndex);
    const sourceColumnIndex = Number(cell.dataset.sourceColumnIndex);
    if (!Number.isInteger(sourceRowIndex) || !Number.isInteger(sourceColumnIndex) || !sourceRows[sourceRowIndex]) {
      return;
    }

    const isHeader = cell.dataset.csvCodeblockHeader === "true";
    const value = sourceRows[sourceRowIndex][sourceColumnIndex] || "";
    const editor = doc.createElement("textarea");
    const hiddenNodes = [];

    editor.className = "csv-codeblock__cell-editor";
    editor.value = value;
    editor.rows = Math.min(8, Math.max(1, value.split(/\r?\n/).length));
    editor.setAttribute("aria-label", `Edit cell row ${sourceRowIndex + 1}, column ${sourceColumnIndex + 1}`);

    if (isHeader) {
      for (const node of Array.from(cell.childNodes)) {
        if (node.nodeType === 1) {
          node.hidden = true;
          hiddenNodes.push(node);
        }
      }
      cell.appendChild(editor);
    } else {
      cell.replaceChildren(editor);
    }

    cell.classList.add("csv-codeblock__cell--editing");
    activeEdit = {
      cell,
      editor,
      hiddenNodes,
      isHeader,
      label: isHeader ? cell.csvCodeblockHeaderLabel : null,
      sourceRowIndex,
      sourceColumnIndex
    };

    editor.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        cancelActiveEdit();
      } else if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        commitActiveEdit();
      }
    });

    editor.addEventListener("blur", () => {
      commitActiveEdit();
    });

    editor.focus();
    editor.select();
  };

  table.addEventListener("mousedown", (event) => {
    if (!enabled) {
      return;
    }

    const target = event.target;
    if (activeEdit && target && activeEdit.editor.contains(target)) {
      return;
    }

    const cell = target && typeof target.closest === "function" ? target.closest("td, th") : null;
    if (!cell || !table.contains(cell) || !cell.dataset || cell.dataset.sourceRowIndex == null) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    startEdit(cell);
  }, true);

  return {
    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      if (!enabled) {
        cancelActiveEdit();
      }
    },
    async saveSession() {
      return saveSession();
    },
    isDirty() {
      return dirty;
    }
  };
}

function resolveMaxHeight(maxHeight, highTableEnabled) {
  if (!highTableEnabled) {
    return maxHeight;
  }

  const normalized = maxHeight.trim().toLowerCase();
  if (normalized === "none" || normalized === "auto" || normalized === "unset" || normalized === "inherit") {
    return maxHeight;
  }

  return `calc(${maxHeight} * 2)`;
}

function setCssVariable(element, name, value) {
  if (element.style && typeof element.style.setProperty === "function") {
    element.style.setProperty(name, value);
  } else {
    element.style[name] = value;
  }
}

function setWrapperClasses(wrapper, state, stickyEnabled) {
  wrapper.className = [
    "csv-codeblock",
    state.compact ? "csv-codeblock--compact" : "",
    state.zebra ? "csv-codeblock--zebra" : "",
    state.highTable ? "csv-codeblock--high-table" : "",
    state.edit ? "csv-codeblock--edit-mode" : "",
    stickyEnabled ? "csv-codeblock--sticky" : ""
  ].filter((className) => className.length > 0).join(" ");
}

function updateStickyOffsets(wrapper, headerRow) {
  const setOffset = () => {
    let height = 0;
    if (headerRow && typeof headerRow.getBoundingClientRect === "function") {
      height = headerRow.getBoundingClientRect().height;
    } else if (headerRow && typeof headerRow.offsetHeight === "number") {
      height = headerRow.offsetHeight;
    }
    setCssVariable(wrapper, "--csv-codeblock-header-height", `${Math.ceil(height || 0)}px`);
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(setOffset);
  } else {
    setOffset();
  }
}

function setToolbarButtonState(button, pressed, dirty = false) {
  const label = button.dataset.label || button.textContent || "";
  const marker = button.querySelector(".csv-codeblock__toolbar-marker");
  const dirtyMarker = button.querySelector(".csv-codeblock__toolbar-dirty");

  button.className = [
    "csv-codeblock__toolbar-button",
    pressed ? "csv-codeblock__toolbar-button--pressed" : "",
    dirty ? "csv-codeblock__toolbar-button--dirty" : ""
  ].filter((className) => className.length > 0).join(" ");
  if (marker) {
    marker.textContent = pressed ? "✔" : "〰";
  } else {
    button.textContent = `${pressed ? "✔" : "〰"} ${label}${dirty ? " *" : ""}`;
  }
  if (dirtyMarker) {
    dirtyMarker.textContent = dirty ? "*" : "";
    dirtyMarker.hidden = !dirty;
  }
  button.setAttribute("aria-pressed", pressed ? "true" : "false");
  button.setAttribute("aria-label", `${label}: ${pressed ? "enabled" : "disabled"}${dirty ? ", unsaved changes" : ""}`);
  button.setAttribute("title", label);
}

function setToolbarLabelMode(toolbar, mode) {
  toolbar.dataset.labelMode = mode;

  for (const button of toolbar.querySelectorAll(".csv-codeblock__toolbar-button")) {
    const wideLabel = button.querySelector(".csv-codeblock__toolbar-label--wide");
    const narrowLabel = button.querySelector(".csv-codeblock__toolbar-label--narrow");
    const shortLabel = button.querySelector(".csv-codeblock__toolbar-label--short");

    if (wideLabel) {
      wideLabel.hidden = mode !== "wide";
    }
    if (narrowLabel) {
      narrowLabel.hidden = mode !== "narrow";
    }
    if (shortLabel) {
      shortLabel.hidden = mode !== "short";
    }
  }
}

function toolbarFitsSingleRow(toolbar) {
  const buttons = Array.from(toolbar.querySelectorAll(".csv-codeblock__toolbar-button"));

  if (buttons.length <= 1 || !toolbar.isConnected) {
    return true;
  }

  const firstTop = buttons[0].offsetTop;
  return buttons.every((button) => Math.abs(button.offsetTop - firstTop) <= 1);
}

function chooseToolbarLabelMode(toolbar) {
  if (!toolbar.isConnected) {
    return toolbar.dataset.labelMode || "wide";
  }

  for (const mode of ["wide", "narrow", "short"]) {
    setToolbarLabelMode(toolbar, mode);
    if (toolbarFitsSingleRow(toolbar)) {
      return mode;
    }
  }

  return "short";
}

function createToolbar(doc, features, onToggle) {
  const toolbar = doc.createElement("div");
  const buttons = {};
  let animationFrameId = 0;
  const controls = [
    { key: "sort", label: "Sorting", narrowLabel: "Sort", shortLabel: "S", available: features.sort },
    { key: "filter", label: "Filtering", narrowLabel: "Filter", shortLabel: "F", available: features.filter },
    { key: "compact", label: "Compact", narrowLabel: "Fit", shortLabel: "C", available: true },
    { key: "zebra", label: "Zebra", narrowLabel: "Zebra", shortLabel: "Z", available: true },
    { key: "highTable", label: "High table", narrowLabel: "Tall", shortLabel: "H", available: true },
    { key: "edit", label: "Edit mode", narrowLabel: "Edit", shortLabel: "E", available: features.edit }
  ];

  toolbar.className = "csv-codeblock__toolbar";

  for (const control of controls) {
    const button = doc.createElement("button");
    const marker = doc.createElement("span");
    const wideLabel = doc.createElement("span");
    const narrowLabel = doc.createElement("span");
    const shortLabel = doc.createElement("span");
    const dirtyMarker = doc.createElement("span");

    button.type = "button";
    button.dataset.label = control.label;
    button.dataset.narrowLabel = control.narrowLabel;
    button.dataset.shortLabel = control.shortLabel;
    marker.className = "csv-codeblock__toolbar-marker";
    wideLabel.className = "csv-codeblock__toolbar-label csv-codeblock__toolbar-label--wide";
    narrowLabel.className = "csv-codeblock__toolbar-label csv-codeblock__toolbar-label--narrow";
    shortLabel.className = "csv-codeblock__toolbar-label csv-codeblock__toolbar-label--short";
    dirtyMarker.className = "csv-codeblock__toolbar-dirty";
    wideLabel.textContent = control.label;
    narrowLabel.textContent = control.narrowLabel;
    shortLabel.textContent = control.shortLabel;
    narrowLabel.hidden = true;
    shortLabel.hidden = true;
    dirtyMarker.hidden = true;
    button.append(marker, wideLabel, narrowLabel, shortLabel, dirtyMarker);
    button.disabled = !control.available;
    setToolbarButtonState(button, false);
    if (button.disabled) {
      button.className += " csv-codeblock__toolbar-button--disabled";
      button.setAttribute("aria-disabled", "true");
    } else {
      button.addEventListener("click", () => {
        onToggle(control.key);
      });
    }

    toolbar.appendChild(button);
    buttons[control.key] = button;
  }

  const updateLabelMode = () => {
    animationFrameId = 0;
    setToolbarLabelMode(toolbar, chooseToolbarLabelMode(toolbar));
  };
  const scheduleLabelModeUpdate = () => {
    if (animationFrameId) {
      return;
    }
    const win = doc.defaultView || window;

    if (win && typeof win.requestAnimationFrame === "function") {
      animationFrameId = win.requestAnimationFrame(updateLabelMode);
    } else {
      updateLabelMode();
    }
  };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(scheduleLabelModeUpdate) : null;

  setToolbarLabelMode(toolbar, "wide");
  if (observer) {
    observer.observe(toolbar);
  }

  return {
    element: toolbar,
    update(state) {
      for (const control of controls) {
        if (!buttons[control.key] || !control.available) {
          continue;
        }
        setToolbarButtonState(buttons[control.key], state[control.key], control.key === "edit" && state.editDirty);
      }
      scheduleLabelModeUpdate();
    },
    destroy() {
      if (animationFrameId) {
        const win = doc.defaultView || window;

        if (win && typeof win.cancelAnimationFrame === "function") {
          win.cancelAnimationFrame(animationFrameId);
        }
        animationFrameId = 0;
      }
      if (observer) {
        observer.disconnect();
      }
    }
  };
}

const DEFAULT_RENDER_OPTIONS = {
  title: "",
  header: true,
  sticky: true,
  zebra: false,
  compact: false,
  sort: false,
  filter: false,
  highTable: false,
  edit: false,
  links: true,
  maxHeight: "24rem",
  delimiter: "auto"
};

function normalizeOptionKey(key) {
  if (key === "max-height") {
    return "maxHeight";
  }
  if (key === "high-table") {
    return "highTable";
  }
  if (key === "edit-mode") {
    return "edit";
  }
  return key;
}

function parseBooleanOption(key, rawValue) {
  if (rawValue === "true" || rawValue === "on" || rawValue === "yes" || rawValue === "1") {
    return true;
  }
  if (rawValue === "false" || rawValue === "off" || rawValue === "no" || rawValue === "0") {
    return false;
  }
  throw new Error(`Invalid boolean value for option "${key}"`);
}

function parseStringOption(rawValue) {
  if (rawValue.length >= 2) {
    const firstChar = rawValue[0];
    const lastChar = rawValue[rawValue.length - 1];
    if ((firstChar === '"' || firstChar === "'") && firstChar === lastChar) {
      return rawValue.slice(1, -1).replace(/\\(["'])/g, "$1");
    }
  }
  return rawValue;
}

function tokenizeOptionString(optionText) {
  const tokens = [];
  let current = "";
  let quote = "";

  for (let i = 0; i < optionText.length; i++) {
    const char = optionText[i];

    if (quote) {
      current += char;
      if (char === "\\" && i + 1 < optionText.length) {
        current += optionText[i + 1];
        i++;
      } else if (char === quote) {
        quote = "";
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      current += char;
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }

    current += char;
  }

  if (quote) {
    throw new Error("Unclosed quote in codeblock options");
  }
  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

function parseFenceOptions(optionText, defaultDelimiter) {
  const options = Object.assign({}, DEFAULT_RENDER_OPTIONS, {
    delimiter: defaultDelimiter
  });
  const tokens = tokenizeOptionString(optionText);

  for (const token of tokens) {
    const separatorIndex = token.indexOf(":");
    if (separatorIndex <= 0) {
      throw new Error(`Invalid codeblock option "${String(token)}"`);
    }

    const rawKey = token.slice(0, separatorIndex).trim();
    const key = normalizeOptionKey(rawKey);
    const rawValue = token.slice(separatorIndex + 1).trim();

    if (rawValue.length === 0) {
      throw new Error(`Missing value for option "${rawKey}"`);
    }

    if (key === "title" || key === "maxHeight") {
      options[key] = parseStringOption(rawValue);
    } else if (
      key === "header" ||
      key === "sticky" ||
      key === "zebra" ||
      key === "compact" ||
      key === "sort" ||
      key === "filter" ||
      key === "highTable" ||
      key === "edit" ||
      key === "links"
    ) {
      options[key] = parseBooleanOption(rawKey, rawValue);
    } else if (key === "delimiter") {
      const value = parseStringOption(rawValue);
      if (value !== "auto" && value !== "comma" && value !== "semicolon" && value !== "tab") {
        throw new Error(`Invalid delimiter value "${value}"`);
      }
      options.delimiter = value;
    } else {
      throw new Error(`Unknown codeblock option "${rawKey}"`);
    }
  }

  return options;
}

function getRenderOptions(ctx, el, defaultDelimiter) {
  const sectionInfo = getCodeBlockSectionInfo(ctx, el);
  if (!sectionInfo || typeof sectionInfo.text !== "string") {
    return Object.assign({}, DEFAULT_RENDER_OPTIONS, { delimiter: defaultDelimiter });
  }

  const firstLine = sectionInfo.text.split(/\r?\n/, 1)[0];
  const match = /^\s*(?:`{3,}|~{3,})\s*\S+\s*(.*)$/.exec(firstLine);
  if (!match || match[1].trim().length === 0) {
    return Object.assign({}, DEFAULT_RENDER_OPTIONS, { delimiter: defaultDelimiter });
  }

  return parseFenceOptions(match[1], defaultDelimiter);
}

function resolveDelimiter(source, configuredDelimiter) {
  if (configuredDelimiter === "comma") {
    return ",";
  }
  if (configuredDelimiter === "semicolon") {
    return ";";
  }
  if (configuredDelimiter === "tab") {
    return "\t";
  }
  return detectCsvDelimiter(source);
}


export default class CsvCodeBlockPlugin extends Plugin {
  async onload() {
    // Register CSV code block processor
    this.registerMarkdownCodeBlockProcessor("csv", (source, el, ctx) => {
      this.renderTable(source, el, ctx, "auto");
    });

    // Register TSV code block processor
    this.registerMarkdownCodeBlockProcessor("tsv", (source, el, ctx) => {
      this.renderTable(source, el, ctx, "tab");
    });
  }

  renderTable(source, el, ctx, defaultDelimiter) {
    const sectionInfo = getCodeBlockSectionInfo(ctx, el);
    const editableSectionInfo = sectionInfo ? Object.assign({}, sectionInfo) : null;
    const sourcePath = ctx && typeof ctx.sourcePath === "string" ? ctx.sourcePath : "";
    const canEditSource = !!editableSectionInfo &&
      sourcePath.length > 0 &&
      typeof editableSectionInfo.lineStart === "number" &&
      typeof editableSectionInfo.lineEnd === "number";
    const options = getRenderOptions(ctx, el, defaultDelimiter);
    const resolvedDelimiter = resolveDelimiter(source, options.delimiter);
    const doc = el.ownerDocument;
    const wrapper = doc.createElement("div");
    const scrollContainer = doc.createElement("div");
    const table = doc.createElement("table");
    const head = doc.createElement("thead");
    const body = doc.createElement("tbody");
    const sortableHeaders = [];
    const dataRows = [];
    const sourceRows = [];
    const sourceRef = { value: source };
    const state = {
      sort: options.sort,
      filter: options.filter,
      compact: options.compact,
      zebra: options.zebra,
      highTable: options.highTable,
      edit: options.edit && canEditSource,
      editDirty: false
    };
    let expectedColumnCount = 0;
    let isHeaderRow = options.header;
    let headerRowElement = null;
    let sortController = {
      setEnabled() {
      },
      refresh() {
      }
    };
    let filterController = {
      setEnabled() {
      },
      refresh() {
      }
    };
    let editController = {
      setEnabled() {
      },
      async saveSession() {
        return true;
      },
      isDirty() {
        return false;
      }
    };
    let applyState = () => {
      setWrapperClasses(wrapper, state, options.sticky);
      setCssVariable(wrapper, "--csv-codeblock-max-height", resolveMaxHeight(options.maxHeight, state.highTable));
      editController.setEnabled(state.edit && canEditSource);
      toolbar.update(state);
    };

    setWrapperClasses(wrapper, state, options.sticky);
    scrollContainer.className = "csv-codeblock__scroll";
    table.className = "csv-codeblock__table";

    if (options.title.length > 0) {
      const title = doc.createElement("div");
      title.className = "csv-codeblock__title";
      title.textContent = options.title;
      wrapper.appendChild(title);
    }

    const toolbar = createToolbar(doc, {
      sort: options.header,
      filter: options.header,
      edit: canEditSource
    }, async (key) => {
      if (key === "edit" && state.edit) {
        const saved = await editController.saveSession();
        if (!saved) {
          state.edit = true;
          state.editDirty = editController.isDirty();
          applyState();
          return;
        }
        state.edit = false;
        state.editDirty = false;
        applyState();
        return;
      }

      state[key] = !state[key];
      applyState();
    });
    if (ctx && typeof ctx.addChild === "function") {
      const toolbarCleanup = new MarkdownRenderChild(toolbar.element);

      toolbarCleanup.onunload = () => toolbar.destroy();
      ctx.addChild(toolbarCleanup);
    }
    wrapper.appendChild(toolbar.element);

    try {
      const parser = new CsvParser(source, resolvedDelimiter);

      parser.forEachRow((rowData, rowNumber) => {
        if (expectedColumnCount === 0) {
          expectedColumnCount = rowData.length;
        } else if (rowData.length !== expectedColumnCount) {
          throw new CsvParseError(
            `Row has ${rowData.length} fields, expected ${expectedColumnCount}`,
            rowNumber,
            rowData.length + 1,
            rowNumber
          );
        }
        const sourceRowIndex = sourceRows.length;
        sourceRows.push(rowData);
        const row = doc.createElement("tr");
        const cellTag = isHeaderRow ? "th" : "td";
        for (let i = 0; i < rowData.length; i++) {
          const cell = doc.createElement(cellTag);
          cell.dataset.sourceRowIndex = String(sourceRowIndex);
          cell.dataset.sourceColumnIndex = String(i);
          if (isHeaderRow) {
            cell.scope = "col";
            cell.className = "csv-codeblock__header-cell";
            cell.dataset.csvCodeblockHeader = "true";
            const button = doc.createElement("button");
            const label = doc.createElement("span");
            const indicator = doc.createElement("span");

            button.type = "button";
            button.className = "csv-codeblock__sort-button";
            label.className = "csv-codeblock__sort-label";
            label.textContent = rowData[i];
            indicator.className = "csv-codeblock__sort-indicator";

            button.appendChild(label);
            button.appendChild(indicator);
            cell.appendChild(button);
            cell.csvCodeblockHeaderLabel = label;

            sortableHeaders.push({
              button,
              cell,
              indicator
            });
          } else {
            if (options.links) {
              createCellContent(doc, cell, rowData[i]);
            } else {
              cell.textContent = rowData[i];
            }
          }
          row.appendChild(cell);
        }
        if (isHeaderRow) {
          row.className = "csv-codeblock__header-row";
          head.appendChild(row);
          headerRowElement = row;
          isHeaderRow = false;
        } else {
          dataRows.push({
            element: row,
            values: rowData,
            searchValues: rowData.map((value) => value.toLowerCase()),
            originalIndex: dataRows.length,
            sourceRowIndex
          });
          body.appendChild(row);
        }
      });
    } catch (error) {
      this.renderError(el, doc, error);
      return;
    }

    if (head.childNodes.length > 0) {
      filterController = createFilterController(doc, head, headerRowElement, dataRows);
      sortController = createSortController(body, sortableHeaders, dataRows);
      editController = createEditController(this, doc, table, sourceRows, dataRows, {
        ctx,
        sectionInfo: editableSectionInfo,
        sourceRef,
        delimiter: resolvedDelimiter,
        links: options.links
      }, () => {
        filterController.refresh();
        sortController.refresh();
      }, (dirty) => {
        state.editDirty = dirty;
        toolbar.update(state);
      });
      applyState = () => {
        setWrapperClasses(wrapper, state, options.sticky);
        setCssVariable(wrapper, "--csv-codeblock-max-height", resolveMaxHeight(options.maxHeight, state.highTable));
        sortController.setEnabled(state.sort && options.header);
        filterController.setEnabled(state.filter && options.header);
        editController.setEnabled(state.edit && canEditSource);
        toolbar.update(state);
        updateStickyOffsets(wrapper, headerRowElement);
      };

      table.appendChild(head);
      table.appendChild(body);
      wrapper.appendChild(scrollContainer);
      scrollContainer.appendChild(table);
      el.appendChild(wrapper);
      applyState();
      return;
    }

    editController = createEditController(this, doc, table, sourceRows, dataRows, {
      ctx,
      sectionInfo: editableSectionInfo,
      sourceRef,
      delimiter: resolvedDelimiter,
      links: options.links
    }, () => {
      filterController.refresh();
      sortController.refresh();
    }, (dirty) => {
      state.editDirty = dirty;
      toolbar.update(state);
    });
    table.appendChild(body);
    wrapper.appendChild(scrollContainer);
    scrollContainer.appendChild(table);
    el.appendChild(wrapper);
    applyState();
  }

  renderError(el, doc, error) {
    const wrapper = doc.createElement("div");
    const title = doc.createElement("div");
    const details = doc.createElement("div");

    wrapper.className = "csv-codeblock csv-codeblock--error";
    title.className = "csv-codeblock__error-title";
    details.className = "csv-codeblock__error-details";
    title.textContent = "Malformed CSV";

    if (error instanceof CsvParseError) {
      details.textContent = `Row ${error.row}, field ${error.field} (line ${error.line}): ${error.message}.`;
    } else if (error instanceof Error) {
      details.textContent = error.message;
    } else {
      details.textContent = String(error);
    }

    wrapper.appendChild(title);
    wrapper.appendChild(details);
    el.appendChild(wrapper);
  }
}
