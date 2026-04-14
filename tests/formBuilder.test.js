import { describe, expect, test } from '@jest/globals';
import { readFileSync } from 'fs';
import path from 'path';
import vm from 'vm';

class MockChoice {
  constructor(value, navigationTarget) {
    this.value = value;
    this.navigationTarget = navigationTarget;
  }
}

class MockBaseItem {
  constructor(type) {
    this.type = type;
    this.title = '';
    this.required = false;
    this.helpText = '';
    this.validation = null;
  }

  setTitle(title) {
    this.title = title;
    return this;
  }

  setRequired(required) {
    this.required = required;
    return this;
  }

  setHelpText(helpText) {
    this.helpText = helpText;
    return this;
  }

  setValidation(validation) {
    this.validation = validation;
    return this;
  }
}

class MockMultipleChoiceItem extends MockBaseItem {
  constructor() {
    super('MULTIPLE_CHOICE');
    this.choices = [];
  }

  setChoiceValues(values) {
    this.choiceValues = values.slice();
    return this;
  }

  createChoice(value, navigationTarget) {
    return new MockChoice(value, navigationTarget);
  }

  setChoices(choices) {
    this.choices = choices.slice();
    return this;
  }
}

class MockListItem extends MockBaseItem {
  constructor() {
    super('LIST');
  }

  setChoiceValues(values) {
    this.choiceValues = values.slice();
    return this;
  }
}

class MockTextItem extends MockBaseItem {
  constructor() {
    super('TEXT');
  }
}

class MockParagraphTextItem extends MockBaseItem {
  constructor() {
    super('PARAGRAPH_TEXT');
  }
}

class MockDateItem extends MockBaseItem {
  constructor() {
    super('DATE');
  }
}

class MockTimeItem extends MockBaseItem {
  constructor() {
    super('TIME');
  }
}

class MockCheckboxItem extends MockBaseItem {
  constructor() {
    super('CHECKBOX');
  }

  setChoiceValues(values) {
    this.choiceValues = values.slice();
    return this;
  }
}

class MockPageBreakItem extends MockBaseItem {
  constructor() {
    super('PAGE_BREAK');
    this.goToPage = null;
  }

  setGoToPage(target) {
    this.goToPage = target;
    return this;
  }
}

class MockTextValidationBuilder {
  constructor() {
    this.pattern = '';
    this.helpText = '';
  }

  requireTextMatchesPattern(pattern) {
    this.pattern = pattern;
    return this;
  }

  setHelpText(helpText) {
    this.helpText = helpText;
    return this;
  }

  build() {
    return {
      pattern: this.pattern,
      helpText: this.helpText,
    };
  }
}

class MockForm {
  constructor(title) {
    this.title = title;
    this.items = [];
    this.allowResponseEdits = false;
  }

  setDescription(description) {
    this.description = description;
    return this;
  }

  setCollectEmail(enabled) {
    this.collectEmail = enabled;
    return this;
  }

  setLimitOneResponsePerUser(enabled) {
    this.limitOneResponsePerUser = enabled;
    return this;
  }

  setAllowResponseEdits(enabled) {
    this.allowResponseEdits = enabled;
    return this;
  }

  addMultipleChoiceItem() {
    const item = new MockMultipleChoiceItem();
    this.items.push(item);
    return item;
  }

  addPageBreakItem() {
    const item = new MockPageBreakItem();
    this.items.push(item);
    return item;
  }

  addListItem() {
    const item = new MockListItem();
    this.items.push(item);
    return item;
  }

  addTextItem() {
    const item = new MockTextItem();
    this.items.push(item);
    return item;
  }

  addParagraphTextItem() {
    const item = new MockParagraphTextItem();
    this.items.push(item);
    return item;
  }

  addDateItem() {
    const item = new MockDateItem();
    this.items.push(item);
    return item;
  }

  addTimeItem() {
    const item = new MockTimeItem();
    this.items.push(item);
    return item;
  }

  addCheckboxItem() {
    const item = new MockCheckboxItem();
    this.items.push(item);
    return item;
  }
}

function loadFeatureFormBuilder(contextOverrides = {}) {
  const context = {
    console,
    getConfiguredSectionTabs() {
      return ['Trumpet', 'Tuba'];
    },
    getConfiguredLateReasons() {
      return ['Class', 'Traffic', 'Other'];
    },
    FormApp: {
      PageNavigationType: {
        SUBMIT: 'SUBMIT',
      },
      create(title) {
        return new MockForm(title);
      },
      createTextValidation() {
        return new MockTextValidationBuilder();
      },
    },
    ...contextOverrides,
  };

  vm.createContext(context);
  const sharedSource = readFileSync(
    path.resolve(process.cwd(), 'src/FormNameLogic.js'),
    'utf8'
  );
  vm.runInContext(sharedSource, context, { filename: 'src/FormNameLogic.js' });

  const source = readFileSync(
    path.resolve(process.cwd(), 'src/Feature_FormBuilder.js'),
    'utf8'
  );
  vm.runInContext(source, context, { filename: 'src/Feature_FormBuilder.js' });
  return context;
}

function findItemsByTitle(form, title) {
  return form.items.filter((item) => item.title === title);
}

function findPageByTitle(form, title) {
  return form.items.find((item) => item.type === 'PAGE_BREAK' && item.title === title);
}

describe('Feature_FormBuilder', () => {
  test('late form routes by section and each selected section page submits immediately', () => {
    const context = loadFeatureFormBuilder();

    const form = context._buildLateForm({
      Trumpet: ['Doe, Jane'],
      Tuba: ['Smith, Sam'],
    });

    const sectionQuestion = form.items[0];
    const trumpetPage = findPageByTitle(form, 'Trumpet — Student Information');
    const tubaPage = findPageByTitle(form, 'Tuba — Student Information');
    const manualNameItems = findItemsByTitle(
      form,
      'If you cannot find your name in the list, enter it here as Last, First'
    );

    expect(sectionQuestion.title).toBe('What is your section?');
    expect(sectionQuestion.choices).toHaveLength(2);
    expect(sectionQuestion.choices[0].value).toBe('Trumpet');
    expect(sectionQuestion.choices[0].navigationTarget).toBe(trumpetPage);
    expect(sectionQuestion.choices[1].value).toBe('Tuba');
    expect(sectionQuestion.choices[1].navigationTarget).toBe(tubaPage);
    expect(trumpetPage.goToPage).toBe('SUBMIT');
    expect(tubaPage.goToPage).toBe('SUBMIT');
    expect(manualNameItems).toHaveLength(2);
    expect(manualNameItems[0].validation.pattern).toBe('^\\s*[^,]+,\\s*[^,].*$');
  });

  test('pink and yellow forms use the same section-first name flow with manual override field', () => {
    const context = loadFeatureFormBuilder();
    const namesBySection = {
      Trumpet: ['Doe, Jane'],
      Tuba: ['Smith, Sam'],
    };

    const pinkForm = context._buildPinkForm(namesBySection);
    const yellowForm = context._buildYellowForm(namesBySection);

    const pinkNameItems = findItemsByTitle(pinkForm, 'Your Name');
    const yellowNameItems = findItemsByTitle(yellowForm, 'Your Name');
    const pinkManualItems = findItemsByTitle(
      pinkForm,
      'If you cannot find your name in the list, enter it here as Last, First'
    );
    const yellowManualItems = findItemsByTitle(
      yellowForm,
      'If you cannot find your name in the list, enter it here as Last, First'
    );

    expect(pinkForm.items[0].title).toBe('What is your section?');
    expect(yellowForm.items[0].title).toBe('What is your section?');
    expect(pinkNameItems[0].choiceValues).toEqual(['Doe, Jane']);
    expect(yellowNameItems[1].choiceValues).toEqual(['Smith, Sam']);
    expect(pinkNameItems[0].required).toBe(false);
    expect(pinkNameItems[0].helpText).toContain('leave this blank');
    expect(pinkManualItems).toHaveLength(2);
    expect(yellowManualItems).toHaveLength(2);
    expect(yellowForm.allowResponseEdits).toBe(true);
  });
});
