const STORAGE_NAME = "padContent";
const CHARACTER_LIMIT = 500;
const DEBUGGING = false;

/**
 * The amount of characters that make up: (##/##)
 *
 * Since in RP its /unlikely/ that anyone will be posting into the hundreds
 * for a single post, this is sufficient and saves a lot of effort.
 */
const CHAR_COUNT_OFFSET = 8;

const PREFIX_PATTERNS = {
  say: /^(?:\/s|\/say)\s/,
  party: /^(?:\/p|\/party)\s/,
  yell: /^(?:\/y|\/yell)\s/,
  shout: /^(?:\/sh|\/shout)\s/,
  emote: /^(?:\/em|\/emote)\s/,
  tell: /^(?:\/t|\/tell)\s+[^\s]+\s+[^\s]+@[^\s]+\s/,
  freecompany: /^(?:\/fc|\/freecompany)\s/,
  linkshell:
    /^(?:\/ls[0-9]|\/linkshell[0-9]|\/cwls[0-9]|\/crossworldlinkshell[0-9])\s/,
};

/**
 * Returns false and sends an error message to the console
 * @param {String} message
 * @returns
 */
const badInput = (message) => {
  console.error(msg);
  return false;
};

/**
 * Store an object in local storage
 * @param {String} name[]
 * @param {any} what
 */
const storeLocally = (name, what) => {
  localStorage.setItem(name, what);
};

/**
 * Lot something to the console if debugging is enabled
 * @param {any} what
 */
const dbgLog = (...what) => {
  if (DEBUGGING) {
    console.log("DEBUG", ...what);
  }
};

/**
 * Raise an exception if any objects are null or undefined
 * @param {Object} object
 */
const all = (object) => {
  for (let key in object) {
    if (object[key] === null || object[key] === undefined) {
      return [false, key];
    }
  }

  return [true];
};

/**
 *
 * @param {String} message
 */
const getMessageClass = (message) => {
  for (let chatType in PREFIX_PATTERNS) {
    if (!PREFIX_PATTERNS[chatType]) continue;
    if (!PREFIX_PATTERNS[chatType].test(message)) continue;
    return chatType;
  }

  return "say";
};

class Settings {
  /**
   * @param {String} name
   * @param {Object} defaults
   */
  constructor(name, defaults) {
    this._load = () => {
      let stored = JSON.parse(localStorage.getItem(name));
      this._data = { ...defaults, ...stored };
    };

    this._save = () => {
      localStorage.setItem(name, JSON.stringify(this._data));
    };

    this._onSet = {};
    this.load();
  }

  save() {
    return this._save();
  }

  load() {
    return this._load();
  }

  /**
   * Ensure that Settings->save() is run, catching and printing an error if it fails
   * @param {String} name
   * @param {() => void} fn
   * @returns
   */
  setEvent(name, fn) {
    try {
      fn();
      this.save();

      if (this._onSet[name] && Array.isArray(this._onSet[name])) {
        this._onSet[name].forEach((fn) => {
          return fn(this._data[name]);
        });
      }
    } catch {
      console.error(`Failed to save ${name}`);
    }
  }

  addSetHandler(name, fn) {
    if (!this._onSet[name]) {
      this._onSet[name] = new Array();
    }

    this._onSet[name].push(fn);
  }

  set doSpellcheck(value) {
    return this.setEvent("doSpellcheck", () => {
      this._data.doSpellcheck = value;
    });
  }

  get doSpellcheck() {
    return this._data.doSpellcheck;
  }

  set doEmConvert(value) {
    return this.setEvent("doEmConvert", () => {
      this._data.doEmConvert = value;
    });
  }

  get doEmConvert() {
    return this._data.doEmConvert;
  }

  set isOutOfCharacter(value) {
    return this.setEvent("isOutOfCharacter", () => {
      this._data.isOutOfCharacter = value;
    });
  }

  get isOutOfCharacter() {
    return this._data.isOutOfCharacter;
  }
}

/**
 * @param {Number} size
 * @param {Number} offset
 * @returns {Boolean}
 */
const isOverLimit = (size, offset = 0) => {
  var r = Math.floor(
    (size - 1) / (CHARACTER_LIMIT - CHAR_COUNT_OFFSET - offset),
  );

  dbgLog(
    `Math.floor((${
      size - 1
    } / (${CHARACTER_LIMIT} - ${CHAR_COUNT_OFFSET} - ${offset}))) = ${r} >= 1`,
  );

  return 1 <= r;
};

/**
 *
 * @param {HTMLTextAreaElement} box
 * @param {HTMLOListElement} preview
 * @param {Settings} settings
 * @param {String} prefix
 */
const populatePreview = (box, preview, settings, prefix) => {
  var list_objects = [];

  formatLines(box.value, settings, prefix).forEach((line, i, self) => {
    var li = document.createElement("li");
    var content = document.createElement("span");
    var metadata = document.createElement("span");

    content.textContent = line;
    content.className = "content";
    metadata.className = "metadata";
    metadata.textContent = `${line.length}\n${i + 1}/${self.length}`;
    content.classList.add(getMessageClass(line));

    if (line.length > CHARACTER_LIMIT) {
      li.className = "overlimit";
    }

    li.onclick = function () {
      if (content.classList.contains("copied")) {
        content.classList.remove("copied");
        return;
      }

      content.classList.add("copied");
      navigator.clipboard.writeText(content.textContent);
    };

    li.appendChild(content);
    li.appendChild(metadata);
    list_objects.push(li);
  });

  preview.replaceChildren(...list_objects);
};

/**
 * Split a string into lines each within the CHARACTER_LIMIT
 * @param {String} line
 * @param {Settings} settings
 * @param {String} prefix
 * @param {Boolean} singular
 */
const processLine = (line, settings, prefix, singular) => {
  var isSplit = false;

  line = line.replace(/\s+/g, " ");

  if (/^\/[a-zA-Z0-9]+/.test(line)) {
    /** @type {RegExpExecArray} */
    prefix = /^(\/[a-zA-Z0-9]+)/.exec(line)[0];
    line = line.slice(prefix.length + 1, line.length);
  }

  var totalOffset = prefix.length + 1;

  var finishLine = (input) => {
    return `${prefix} ${input}`;
  };

  if (settings.isOutOfCharacter) {
    totalOffset += 4;
    finishLine = (input) => {
      return `${prefix} ((${input.replace(/\s*$/, "")}))`;
    };
  }

  if (singular && line.length <= CHARACTER_LIMIT - totalOffset) {
    dbgLog(`processLine: Line length(${line.length}) <= ${CHARACTER_LIMIT}`);
    return [finishLine(line)];
  }

  if (!isOverLimit(line.length, totalOffset)) {
    dbgLog(`Not over line limit: ${line.length}`);
    return [finishLine(line)];
  }

  dbgLog(`Over line limit: ${line.length}`);

  var words = line.split(" ");
  var results = [""];
  var count = 0;
  var on = 0;

  words.forEach((word) => {
    count += word.length + 1;
    dbgLog(`On word '${word}' [${count}]`);

    if (isOverLimit(count, totalOffset)) {
      dbgLog(`Breaking up words on: ${word}`);
      count = 0;
      results[on] = finishLine(results[on]);
      results[++on] = "";
      if (!isSplit) {
        isSplit = true;
        totalOffset += 2;
        prefix = `${prefix} | `;
      }
    }

    results[on] += word + " ";
  });

  results[on] = finishLine(results[on].replace(/[ \t]$/, ""));

  dbgLog("Final result:", results);

  return results;
};

/**
 *
 * @param {HTMLTextAreaElement} box
 * @param {Settings} settings
 * @param {String} prefix
 */
const formatLines = (lines, settings, prefix) => {
  if (settings.doEmConvert) {
    lines = lines.replace(/--/g, "—");
  }

  lines = lines.replace(/[ \t]+/g, " ");
  var all_lines = lines.split(/\n/);
  var count = 0;
  var result = [];

  all_lines.forEach((line) => {
    if (/^\s*$/.test(line)) return;
    count++;
  });

  all_lines.forEach((line) => {
    if (/^\s*$/.test(line)) return;
    result.push(...processLine(line, settings, prefix, count == 1));
  });

  count = result.length;

  if (count <= 1) return result;

  result.forEach((line, i, self) => {
    self[i] = `${line.replace(/\s?$/, "")} (${i + 1}/${count})`;
  });

  return result;
};

/**
 * With a name, find an element on the DOM and assign it an onclick
 * @param {String} name
 * @param {(HTMLDialogElement)=>void} onclick
 */
const makeModal = (name, onclick) => {
  /** @type {HTMLDialogElement} */
  var modal = document.querySelector(`#${name}`);
  var icon = document.querySelector(`#${name}-icon`);

  if (!modal || !icon) {
    console.error(`makeModal: Missing either #${name} or ${name}-icon Element`);
    return;
  }

  if (!onclick) {
    onclick = (m) => {
      return m.showModal();
    };
  }

  icon.onclick = (e) => {
    return onclick(modal, e);
  };
};

const getChatPrefix = () => {
  var prefix = document.querySelector('input[name="chatype"]:checked').value;
  if (prefix === "") {
    prefix = document.querySelector("input#customchat-input").value;
    if (prefix.replace(/^\s*$/, "") === "") {
      return "/???";
    }
  }

  return prefix;
};

const padSettings = new Settings("padSettings", {
  isOutOfCharacter: false,
  doSpellcheck: true,
  doEmConvert: true,
});

const initialize = () => {
  var timeoutID = null;

  const staticElements = {
    /** @type {HTMLTextAreaElement} */
    textBox: document.querySelector("#textbox"),

    /** @type {HTMLUListElement} */
    previewBox: document.querySelector("#preview"),

    /** @type {HTMLInputElement} */
    spellcheckCheckbox: document.querySelector("#spellcheck"),

    /** @type {HTMLInputElement} */
    emDashCheckbox: document.querySelector("#emdash"),

    /** @type {HTMLInputElement} */
    oocCheckbox: document.querySelector("#ooc"),

    /** @type {NodeListOf<HTMLInputElement>} */
    chatTypeRadio: document.querySelectorAll("input[name='chatype']"),

    /** @type {HTMLInputElement} */
    customChatInput: document.querySelector("#customchat-input"),

    /** @type {HTMLLinkElement} */
    helpLink: document.querySelector("#help-icon"),

    /** @type {HTMLLinkElement} */
    saveLink: document.querySelector("#save a"),

    /** @type {HTMLLinkElement} */
    openLink: document.querySelector("#open a"),

    /** @type {HTMLLinkElement} */
    openInput: document.querySelector("#open input"),
  };

  let allTruthy = all(staticElements);
  if (!allTruthy[0])
    throw `Cannot load, missing required elements: ${allTruthy[1]}`;

  /** @type {HTMLPreElement} */
  const previewbox = document.querySelector("#preview");

  staticElements.textBox.value = localStorage.getItem(STORAGE_NAME) || "";
  staticElements.textBox.spellcheck = padSettings.doSpellcheck;
  staticElements.spellcheckCheckbox.checked = padSettings.doSpellcheck;
  staticElements.emDashCheckbox.checked = padSettings.doEmConvert;
  staticElements.oocCheckbox.checked = padSettings.isOutOfCharacter;

  padSettings.addSetHandler("doSpellcheck", (value) => {
    staticElements.textBox.spellcheck = value;
  });

  makeModal("about");
  makeModal("help");

  const doUpdate = () => {
    return populatePreview(
      staticElements.textBox,
      previewbox,
      padSettings,
      getChatPrefix(),
    );
  };

  /**
   * Keyboard shortcuts
   * @param {Event} event
   */
  document.onkeydown = function (event) {
    if (event.ctrlKey) {
      switch (event.key) {
        case "s":
          staticElements.saveLink.click();
          event.preventDefault();
          break;
        case "o":
          staticElements.openInput.click();
          event.preventDefault();
          break;
        case "/":
          staticElements.helpLink.click();
          event.preventDefault();
          break;
      }
    }
  };

  /**
   * Allow inputting tabs in the textarea instead of changing focus to the next element
   * (must use onkeydown to prevent default behavior of moving focus)
   * @param {Event} event
   */
  staticElements.textBox.onkeydown = function (event) {
    if (event.key === "Tab") {
      event.preventDefault();
      var text = this.value,
        s = this.selectionStart,
        e = this.selectionEnd;
      this.value = text.substring(0, s) + "\t" + text.substring(e);
      this.selectionStart = this.selectionEnd = s + 1;
    }
  };

  /**
   * Update the preview and reset save timeout
   */
  staticElements.textBox.onkeyup = function () {
    doUpdate();
    window.clearTimeout(timeoutID);
    timeoutID = window.setTimeout(() => {
      storeLocally(STORAGE_NAME, staticElements.textBox.value);
    }, 1000);
  };

  /** Load contents from a text file */
  staticElements.openLink.onclick = function () {
    staticElements.openInput.click();
  };

  /** @this {FileReader} */
  staticElements.openInput.onchange = function () {
    var reader = new FileReader();
    reader.file = this.files[0];

    reader.onload = function () {
      staticElements.textBox.value = this.result;
    };

    reader.readAsText(this.files[0]);
  };

  staticElements.saveLink.onclick = function () {
    this.download = `${STORAGE_NAME}.txt`;
    this.href = URL.createObjectURL(
      new Blob([staticElements.textBox.value], {
        type: "text/plain",
      }),
    );
  };

  staticElements.chatTypeRadio.forEach((node) => {
    node.onchange = doUpdate;
  });

  staticElements.customChatInput.oninput = () => {
    var current_chat = document.querySelector(
      "input[name='chatype']:checked",
    ).id;

    if (current_chat === "customchat") {
      doUpdate();
    }
  };

  staticElements.spellcheckCheckbox.onchange = function () {
    padSettings.doSpellcheck = this.checked;
  };

  staticElements.emDashCheckbox.onchange = function () {
    padSettings.doEmConvert = this.checked;
    doUpdate();
  };

  staticElements.oocCheckbox.onchange = function () {
    padSettings.isOutOfCharacter = this.checked;
    doUpdate();
  };

  staticElements.textBox.setSelectionRange(
    staticElements.textBox.value.length,
    staticElements.textBox.value.length,
  );

  window.onbeforeunload = function () {
    storeLocally(STORAGE_NAME, staticElements.textBox.value);
    padSettings.save();
  };

  doUpdate();
};

document.onreadystatechange = () => {
  if (document.readyState === "interactive") {
    initialize();
  }
};
