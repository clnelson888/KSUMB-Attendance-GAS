import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

function ensureSize(matrix, rowCount, colCount, fillValue = '') {
  while (matrix.length < rowCount) {
    matrix.push([]);
  }

  for (let r = 0; r < rowCount; r++) {
    while (matrix[r].length < colCount) {
      matrix[r].push(fillValue);
    }
  }
}

class MockRange {
  constructor(sheet, row, col, numRows = 1, numCols = 1) {
    this.sheet = sheet;
    this.row = row;
    this.col = col;
    this.numRows = numRows;
    this.numCols = numCols;
  }

  getValues() {
    const values = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowValues = [];
      for (let c = 0; c < this.numCols; c++) {
        rowValues.push(this.sheet.getValue(this.row + r, this.col + c));
      }
      values.push(rowValues);
    }
    return values;
  }

  setValues(values) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setValue(this.row + r, this.col + c, values[r][c]);
      }
    }
    return this;
  }

  getValue() {
    return this.sheet.getValue(this.row, this.col);
  }

  setValue(value) {
    this.sheet.setValue(this.row, this.col, value);
    return this;
  }

  getNotes() {
    const notes = [];
    for (let r = 0; r < this.numRows; r++) {
      const rowNotes = [];
      for (let c = 0; c < this.numCols; c++) {
        rowNotes.push(this.sheet.getNote(this.row + r, this.col + c));
      }
      notes.push(rowNotes);
    }
    return notes;
  }

  setNotes(values) {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setNote(this.row + r, this.col + c, values[r][c]);
      }
    }
    return this;
  }

  getNote() {
    return this.sheet.getNote(this.row, this.col);
  }

  setNote(value) {
    this.sheet.setNote(this.row, this.col, value);
    return this;
  }

  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setValue(this.row + r, this.col + c, '');
      }
    }
    return this;
  }

  clearNote() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setNote(this.row + r, this.col + c, '');
      }
    }
    return this;
  }

  setFormula(value) {
    return this.setValue(value);
  }

  setDataValidation() {
    return this;
  }
}

class MockSheet {
  constructor(name, values = []) {
    this.name = name;
    this.values = values.map((row) => row.slice());
    this.notes = values.map((row) => row.map(() => ''));
  }

  getName() {
    return this.name;
  }

  getLastRow() {
    return this.values.length;
  }

  getLastColumn() {
    let max = 0;
    for (let i = 0; i < this.values.length; i++) {
      if (this.values[i].length > max) max = this.values[i].length;
    }
    return max;
  }

  getMaxRows() {
    return Math.max(this.getLastRow(), 2);
  }

  getRange(row, col, numRows = 1, numCols = 1) {
    ensureSize(this.values, row + numRows - 1, col + numCols - 1, '');
    ensureSize(this.notes, row + numRows - 1, col + numCols - 1, '');
    return new MockRange(this, row, col, numRows, numCols);
  }

  getDataRange() {
    const rows = Math.max(this.getLastRow(), 1);
    const cols = Math.max(this.getLastColumn(), 1);
    return this.getRange(1, 1, rows, cols);
  }

  appendRow(row) {
    this.values.push(row.slice());
    this.notes.push(row.map(() => ''));
  }

  setFrozenRows() {
    return this;
  }

  activate() {
    return this;
  }

  autoResizeColumns() {
    return this;
  }

  deleteColumns(startCol, howMany) {
    for (let r = 0; r < this.values.length; r++) {
      this.values[r].splice(startCol - 1, howMany);
      this.notes[r].splice(startCol - 1, howMany);
    }
  }

  getValue(row, col) {
    ensureSize(this.values, row, col, '');
    return this.values[row - 1][col - 1];
  }

  setValue(row, col, value) {
    ensureSize(this.values, row, col, '');
    this.values[row - 1][col - 1] = value;
  }

  getNote(row, col) {
    ensureSize(this.notes, row, col, '');
    return this.notes[row - 1][col - 1];
  }

  setNote(row, col, value) {
    ensureSize(this.notes, row, col, '');
    this.notes[row - 1][col - 1] = value;
  }
}

class MockSpreadsheet {
  constructor(sheetMap) {
    this.sheets = { ...sheetMap };
  }

  getSheetByName(name) {
    return this.sheets[name] || null;
  }

  insertSheet(name) {
    const sheet = new MockSheet(name, []);
    this.sheets[name] = sheet;
    return sheet;
  }

  toast() {}
}

function formatDate(date, pattern) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  const hours24 = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = hours24 % 12 || 12;

  if (pattern === 'M/d') return `${month}/${day}`;
  if (pattern === 'h:mm a') return `${hours12}:${minutes} ${suffix}`;
  if (pattern === 'M/d/yyyy h:mm a') return `${month}/${day}/${year} ${hours12}:${minutes} ${suffix}`;
  if (pattern === 'M/d h:mm a') return `${month}/${day} ${hours12}:${minutes} ${suffix}`;
  return date.toISOString();
}

export function createGasTestContext(initialSheets) {
  const spreadsheet = new MockSpreadsheet(initialSheets);
  const documentProperties = {};
  const context = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return spreadsheet;
      },
      flush() {},
      getUi() {
        return {
          ButtonSet: { OK: 'OK' },
          alert() {},
        };
      },
      newDataValidation() {
        return {
          requireValueInList() {
            return this;
          },
          setAllowInvalid() {
            return this;
          },
          build() {
            return {};
          },
        };
      },
    },
    LockService: {
      getScriptLock() {
        return {
          waitLock() {},
          releaseLock() {},
        };
      },
    },
    Utilities: {
      getUuid() {
        return 'test-uuid';
      },
      formatDate(date, _timezone, pattern) {
        return formatDate(date, pattern);
      },
    },
    PropertiesService: {
      getDocumentProperties() {
        return {
          getProperties() {
            return { ...documentProperties };
          },
          setProperties(values) {
            Object.assign(documentProperties, values);
          },
          deleteProperty(key) {
            delete documentProperties[key];
          },
        };
      },
    },
  };

  vm.createContext(context);
  return { context, spreadsheet, MockSheet, documentProperties };
}

export function loadGasScripts(context, scriptPaths) {
  for (const scriptPath of scriptPaths) {
    const absolutePath = path.resolve(process.cwd(), scriptPath);
    const source = readFileSync(absolutePath, 'utf8');
    vm.runInContext(source, context, { filename: scriptPath });
  }
}

export { MockSheet };
