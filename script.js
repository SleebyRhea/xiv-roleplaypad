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
  say: /^(\/s|\/say)\s/,
  party: /^(\/p|\/party)\s/,
  yell: /^(\/y|\/yell)\s/,
  shout: /^(\/sh|\/shout)\s/,
  emote: /^(\/em|\/emote)\s/,
  tell: /^(\/t|\/tell)\s+(?<target>[^@\s]+\s+[^@\s]+@[@a-zA-Z]+)\s/,
  freecompany: /^(\/fc|\/freecompany)\s/,
  linkshell: /^(?:\/(?<cw>cw)?linkshell(?<linkshell>[1-9]))\s/,
};

/**
 * Returns false and sends an error message to the console
 * @param {String} message
 */
const badInput = (message) => {
  console.error(msg);
  return false;
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
 * Get the size in bytes of a string by converting it into a Blob- this means that should
 * never have to worry about whether or not non-ascii characters will push the chat over
 * it's size limit.
 * @type {String} str
 */
const charLen = (str) => {
  return new Blob([str]).size;
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

  return "command";
};

/**
 *
 * @param {String} line
 * @param {String} cls
 * @param {Settings} settings
 */
const getLinePreview = (line, cls, settings) => {
  /** @type {RegExp} */
  let rgx = PREFIX_PATTERNS[cls];

  if (!rgx) return line;

  let match = rgx.exec(line);
  if (!match) return line;

  switch (cls) {
    case "yell":
    case "shout":
    case "say":
      line = `${settings.previewName}@Server: ${line.replace(rgx, "")}`;
      break;

    case "party":
      line = `(${settings.previewName}@Server) ${line.replace(rgx, "")}`;
      break;

    case "emote":
      line = `${settings.previewName}@Server ${line.replace(rgx, "")}`;
      break;

    case "linkshell":
      let ls_groups = rgx.exec(line)?.groups;
      if (!ls_groups) break;

      let cw = ls_groups["cw"]?.toUpperCase() ?? "";
      let ls = ls_groups["linkshell"];
      line = `[${cw}LS${ls}]<${settings.previewName}@Server> ${line.replace(rgx, "")}`;
      break;

    case "freecompany":
      line = `[FC]<${settings.previewName}@Server> ${line.replace(rgx, "")}`;
      break;

    case "tell":
      let tell_groups = rgx.exec(line)?.groups;
      if (!tell_groups) break;

      let target = tell_groups["target"];
      line = `>> ${target}: ${line.replace(rgx, "")}`;
      break;
  }

  return line;
};

class Settings {
  #load = () => {};
  #save = () => {};

  #data = {};
  #onSet = {};

  /**
   * @param {String} name
   * @param {Object} defaults
   */
  constructor(name, defaults) {
    this.#load = () => {
      this.#data = { ...defaults, ...JSON.parse(localStorage.getItem(name)) };
    };

    this.#save = () => {
      localStorage.setItem(name, JSON.stringify(this.#data));
    };

    this.#onSet = {};
    this.load();
  }

  save() {
    return this.#save();
  }

  load() {
    return this.#load();
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

      if (this.#onSet[name] && Array.isArray(this._onSet[name])) {
        this.#onSet[name].forEach((fn) => {
          return fn(this.#data[name]);
        });
      }
    } catch {
      console.error(`Failed to save ${name}`);
    }
  }

  addSetHandler(name, fn) {
    if (!this.#onSet[name]) {
      this.#onSet[name] = new Array();
    }

    this.#onSet[name].push(fn);
  }

  /**
   *
   * @param {String} name
   * @param {HTMLInputElement} node
   * @param {((arg0:Boolean) => void)?} callback
   */
  linkCheckbox(name, node, callback) {
    const _self = this;
    const cb = callback ? callback : (_) => {};

    dbgLog(`Linked "${name}" to`, node);

    node.checked = _self.#data[name];

    node.onchange = function () {
      dbgLog(`Running onchange for "${name} => "${this.checked}"`);
      _self.setEvent(name, () => {
        _self.#data[name] = this.checked;
      });
      return cb(this.checked);
    };

    cb(_self.#data[name]);
  }

  /**
   * @param {Boolean} value
   */
  set doSpellcheck(value) {
    return this.setEvent("doSpellcheck", () => {
      this.#data.doSpellcheck = value;
    });
  }

  /**
   * @returns {Boolean}
   */
  get doSpellcheck() {
    return this.#data.doSpellcheck;
  }

  /**
   * @param {Boolean} value
   */
  set doEmConvert(value) {
    return this.setEvent("doEmConvert", () => {
      this.#data.doEmConvert = value;
    });
  }

  /**
   * @returns {Boolean}
   */
  get doEmConvert() {
    return this.#data.doEmConvert;
  }

  /**
   * @param {Boolean} value
   */
  set doAutoscroll(value) {
    return this.setEvent("doAutoscroll", () => {
      this.#data.doAutoscroll = value;
    });
  }

  /**
   * @returns {Boolean}
   */
  get doAutoscroll() {
    return this.#data.doAutoscroll;
  }

  /**
   * @param {Boolean} value
   */
  set isOutOfCharacter(value) {
    return this.setEvent("isOutOfCharacter", () => {
      this.#data.isOutOfCharacter = value;
    });
  }

  /**
   * @returns {Boolean}
   */
  get isOutOfCharacter() {
    return this.#data.isOutOfCharacter;
  }

  /**
   * @param {Boolean} value
   */
  set doChatFiltering(value) {
    return this.setEvent("doChatFiltering", () => {
      this.#data.doChatFiltering = value;
    });
  }

  /**
   * @returns {Boolean}
   */
  get doChatFiltering() {
    return this.#data.doChatFiltering;
  }

  /**
   * @param {Boolean} value
   */
  set doChatAutoscrolling(value) {
    return this.setEvent("doChatAutoscrolling", () => {
      this.#data.doChatAutoscrolling = value;
    });
  }

  /**
   * @returns {Boolean}
   */
  get doChatAutoscrolling() {
    return this.#data.doChatAutoscrolling;
  }

  /**
   * @param {String} value
   */
  set previewName(value) {
    return this.setEvent("previewName", () => {
      this.#data.previewName = value;
    });
  }

  /**
   * @returns {String}
   */
  get previewName() {
    return this.#data.previewName;
  }
}

var lastRun = [];
var lastFocused = -1;

/**
 *
 * @param {HTMLElement} container
 * @param {HTMLElement} child
 */
const scrollTo = (container, child) => {
  if (!container || !child) return;
  child.scrollIntoView();
};

/**
 * Populates the preview element with formatted chat messages. Formats them according to:
 * - Whether or not they are over the byte limit
 * - Accordingly for the chat prefix used
 * - Whether or not they are a non-chat command
 *
 * @param {HTMLTextAreaElement} box
 * @param {HTMLOListElement} preview
 * @param {Settings} settings
 * @param {String} prefix
 */
const populatePreview = (box, preview, settings, prefix) => {
  /** @type {HTMLUListElement[]} */
  let list_objects = [];

  let thisRun = [];

  formatLines(box.value, settings, prefix).forEach((line, i, self) => {
    let cls = getMessageClass(line);
    let li = document.createElement("li");
    let data = document.createElement("div");
    let content = document.createElement("span");
    let metadata = document.createElement("span");

    data.hidden = true;
    data.textContent = line;
    data.classList.add("content");

    content.textContent = getLinePreview(line, cls, settings);
    content.className = "chat-preview";
    content.classList.add(cls);

    metadata.className = "metadata";
    metadata.textContent = `${charLen(line)}\n${i + 1}/${self.length}`;

    if (charLen(line) > CHARACTER_LIMIT) {
      li.className = "overlimit";
    }

    li.onclick = function () {
      if (content.classList.contains("copied")) {
        content.classList.remove("copied");
        return;
      }

      content.classList.add("copied");
      navigator.clipboard.writeText(data.textContent);
    };

    li.appendChild(data);
    li.appendChild(content);
    li.appendChild(metadata);

    thisRun.push(line);
    list_objects.push(li);
  });

  preview.replaceChildren(...list_objects);

  let lastRunLen = lastRun.length;
  let thisRunLen = thisRun.length;

  if (thisRunLen > 0) {
    let scrolled = false;

    for (let i = 0; i < thisRunLen; i++) {
      /** @type {String} */
      let line = thisRun[i];

      /** @type {String?} */
      let last = lastRun[i];

      if (!last) {
        scrolled = true;
        if (settings.doAutoscroll)
          scrollTo(box, list_objects[list_objects.length]);
        lastFocused = i;
        list_objects[i].classList.add("focused");

        break;
      }

      last = last.replace(` (${i + 1}/${lastRunLen})`, "");
      line = line.replace(` (${i + 1}/${thisRunLen})`, "");

      if (last !== line) {
        scrolled = true;
        if (settings.doAutoscroll) scrollTo(preview, list_objects[i]);
        lastFocused = i;
        list_objects[i].classList.add("focused");
        break;
      }
    }

    lastRun = thisRun;
    if (!scrolled && lastFocused >= 0) {
      if (list_objects[lastFocused]) {
        if (settings.doAutoscroll) scrollTo(preview, list_objects[lastFocused]);
        list_objects[lastFocused].classList.add("focused");
      }
    }
  }
};

/**
 *
 * @param {HTMLTextAreaElement} box
 * @param {Settings} settings
 * @param {String} prefix
 */
const formatLines = (lines, settings, prefix) => {
  if (settings.doEmConvert) lines = lines.replace(/--/g, "—");
  lines = lines.replace(/[ \t]+/g, " ").replace(/^\s+/g, "");
  lines = lines.replace(/\s+>>/g, " ");

  let all_lines = lines.split(/\n/);
  let result = [];

  let count = 0;
  let offset = 0;
  let skipped = 0;
  let singular = true;

  all_lines.forEach((line, i) => {
    if (/^\s*$/.test(line)) return;

    // Since processLine needs to know whether or not it's running against only one
    // message in the list, rather than iterate against the entire array, we borrow
    // utilize the 'singular' variable, and simply flip it to false once another is
    // found in the following loop. If it truly /is/ singular, then it will only run
    // the once anyway. And if it's not, we short circuit early with a simple if-then.
    if (singular) {
      let on = i + 1;
      while (all_lines[on] !== undefined || all_lines[on] !== null) {
        if (/^\s*$/.test(all_lines[on])) {
          on++;
          continue;
        }

        singular = false;
        break;
      }
    }

    let lines = processLine(line, settings, prefix, singular);
    result.push(...lines);
    count += lines.length;

    // We use the message class to determine whether or not we need to offset the overall
    // count of messages downwards. This is done via an offset, as processLine() may have
    // split messages into multiples, so we take the length of the resultant variable
    // and simply subtract said offset.
    //
    // TODO:
    //    We could deduplicate work by simply having processLine return the command class
    //    but that feels unnecessary; it's a trivial amount of work on the whole anyway.
    for (let l in lines) {
      if (getMessageClass(lines[l]) === "command") {
        offset++;
        return;
      }
    }
  });

  count = count - offset;
  if (count <= 1) return result;

  // Because we cannot know the end result of the string parsing before it is done, we
  // loop on the result and append ennumeration tags to the end after the fact.
  result.forEach((line, i, self) => {
    if (getMessageClass(line) === "command") {
      skipped++;
      return;
    }

    self[i] = `${line} (${i + 1 - skipped}/${count})`;
  });

  return result;
};

/**
 * Split a string into lines each within the CHARACTER_LIMIT
 * @param {String} line
 * @param {Settings} settings
 * @param {String} prefix
 * @param {Boolean} singular
 */
const processLine = (line, settings, prefix, singular) => {
  line = line.replace(/\s+/g, " ");

  if (/^\/[a-zA-Z0-9]+/.test(line)) {
    /** @type {RegExpExecArray} */
    prefix = /^(\/[a-zA-Z0-9]+)/.exec(line)[0];
    line = line.slice(charLen(prefix) + 1, charLen(line));
  }

  var totalOffset = charLen(prefix) + 1;

  /**
   * @param {String} input
   * @returns {String}
   */
  var finishLine = (input) => {
    return `${prefix} ${input}`.replace(/(^\s+|\s+$)/g, "");
  };

  if (settings.isOutOfCharacter) {
    totalOffset += 4;
    finishLine = (input) => {
      // If the message is a non-chat command, then we *do not* want to enclose
      // in parenthesis. Though... why you would be running them there, I'm admittedly
      // not quite sure. This is very much an edge case.
      if (getMessageClass(`${prefix} ${input}`) === "command")
        return `${prefix} ${input}`.replace(/(^\s+|\s+$)/g, "");

      return `${prefix} ((${input}))`.replace(/(^\s+|\s+$)/g, "");
    };
  }

  if (singular && charLen(line) + totalOffset <= CHARACTER_LIMIT) {
    return [finishLine(line)];
  }

  if (CHARACTER_LIMIT >= charLen(line) + totalOffset + CHAR_COUNT_OFFSET) {
    return [finishLine(line)];
  }

  dbgLog(`Over line limit: ${line.length}`);

  var isSplit = false;
  var words = line.split(" ");
  var results = [""];
  var on = 0;

  words.forEach((word, i) => {
    let thisLineLength =
      charLen(results[on] + word) + 1 + CHAR_COUNT_OFFSET + totalOffset;

    if (CHARACTER_LIMIT < thisLineLength) {
      results[on] = finishLine(results[on]);
      results[++on] = "";

      if (!isSplit) {
        isSplit = true;
        totalOffset += 2;
        prefix = `${prefix} |`;
      }
    }

    results[on] += word + " ";
  });

  results[on] = finishLine(results[on]);

  dbgLog("Final result:", results);

  return results;
};

/**
 * With a name, find an element on the DOM and assign it an onclick
 * @param {String} name
 * @param {String} defaultPage
 */
const makeMenu = (name, defaultPage) => {
  /** @type {HTMLDialogElement} */
  let modal = document.querySelector(`#${name}`);
  let icon = document.querySelector(`#${name}-icon`);
  let close = modal.querySelector(".close");

  let menus = {};
  let selected = "";

  if (!modal || !icon) {
    console.error(`makeMenu: Missing either #${name} or ${name}-icon Element`);
    return;
  }

  /**
   * @param {String} pageName
   */
  let setPage = (pageName) => {
    if (selected === pageName) return;

    selected = pageName;
    menus[pageName].hidden = false;

    for (let name in menus) {
      if (name !== pageName) menus[name].hidden = true;
    }
  };

  icon.onclick = () => {
    setPage(defaultPage);
    return modal.showModal();
  };

  modal.querySelectorAll(".option[for]")?.forEach((option) => {
    let forMenu = option.getAttribute("for");
    if (!forMenu || forMenu === "") return;

    menus[forMenu] = modal.querySelector(`#${forMenu}`);

    option.onclick = () => {
      setPage(forMenu);
    };
  });

  if (close)
    modal.querySelector(".close").onclick = () => {
      modal.close();
    };

  return modal;
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
  // Scratchpad
  previewName: "Firstname L.",

  isOutOfCharacter: false,
  doSpellcheck: true,
  doEmConvert: true,
  doAutoscroll: true,

  // Chatlog
  doChatFiltering: true,
  doChatAutoscrolling: true,
  allowSay: true,
  allowTell: true,
  allowParty: true,
  allowEmote: true,
  allowLinkshell: true,
  allowFreecompany: true,
});

const initialize = () => {
  var timeoutID = null;

  const staticElements = {
    ////////////////
    // Scratchpad //
    ////////////////

    /** @type {HTMLTextAreaElement} */
    textBox: document.querySelector("#textbox"),

    /** @type {HTMLUListElement} */
    previewBox: document.querySelector("#preview"),

    /** @type {HTMLLinkElement} */
    saveLink: document.querySelector("#save a"),

    /** @type {HTMLLinkElement} */
    openLink: document.querySelector("#open a"),

    /** @type {HTMLLinkElement} */
    openInput: document.querySelector("#open input"),

    //////////////
    // Settings //
    //////////////

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

    /** @type {HTMLInputElement} */
    autoscrollCheckbox: document.querySelector("#set-autoscroll"),

    /** @type {HTMLInputElement} */
    previewNameInput: document.querySelector("#set-preview-name"),

    /** @type {HTMLDialogElement} */
    mainMenu: makeMenu("mainmenu", "settings-page"),
  };

  let allTruthy = all(staticElements);
  if (!allTruthy[0])
    throw `Cannot load, missing required elements: ${allTruthy[1]}`;

  staticElements.textBox.value = localStorage.getItem(STORAGE_NAME) || "";
  staticElements.textBox.spellcheck = padSettings.doSpellcheck;
  staticElements.spellcheckCheckbox.checked = padSettings.doSpellcheck;
  staticElements.emDashCheckbox.checked = padSettings.doEmConvert;
  staticElements.oocCheckbox.checked = padSettings.isOutOfCharacter;
  staticElements.previewNameInput.value = padSettings.previewName;
  staticElements.autoscrollCheckbox.checked = padSettings.doAutoscroll;

  const doUpdate = () => {
    return populatePreview(
      staticElements.textBox,
      staticElements.previewBox,
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
      localStorage.setItem(STORAGE_NAME, staticElements.textBox.value);
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
    staticElements.textBox.spellcheck = this.checked;
  };

  staticElements.emDashCheckbox.onchange = function () {
    padSettings.doEmConvert = this.checked;
    doUpdate();
  };

  staticElements.oocCheckbox.onchange = function () {
    padSettings.isOutOfCharacter = this.checked;
    doUpdate();
  };

  staticElements.autoscrollCheckbox.onchange = function () {
    padSettings.doAutoscroll = this.checked;
  };

  staticElements.previewNameInput.onchange = function () {
    padSettings.previewName = this.value;
    doUpdate();
  };

  staticElements.textBox.setSelectionRange(
    staticElements.textBox.value.length,
    staticElements.textBox.value.length,
  );

  window.onbeforeunload = function () {
    localStorage.setItem(STORAGE_NAME, staticElements.textBox.value);
    padSettings.save();
  };

  doUpdate();
};

document.onreadystatechange = () => {
  if (document.readyState === "interactive") {
    initialize();
  }
};
