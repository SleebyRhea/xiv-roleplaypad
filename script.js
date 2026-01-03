const STORAGE_NAME = "padContent";
const CHARACTER_LIMIT = 500;
const DEBUGGING = false;
const HAS_FILESYSTEM_API = window.showOpenFilePicker ? true : false;

/**
 * The amount of characters that make up: (##/##)
 *
 * Since in RP its /unlikely/ that anyone will be posting into the hundreds
 * for a single post, this is sufficient and saves a lot of effort.
 */
const CHAR_COUNT_OFFSET = 8;

const KNOWN_NAMES = new Set();
const HIDDEN_NAMES = {};
const HIDDEN_CHATS = {};

const TIMESTAMP_RE = /^\[\d+-\d+-\d+ +\d+:\d+(:?:\d+)?(?: ..)?\] /;
const NEWLINE_RE = /\r?\n/;

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

const CHAT_PATTERNS = {
  tell_to:
    /^(?<prefix>>> (?<fname>[^:@\s]+) (?<lname>[^:@\s]+)(?<server>@[a-zA-Z]+)?:)/,

  tell_from:
    /^(?<prefix>(?<fname>[^:@\s]+) (?<lname>[^:@\s]+)(?<server>@[a-zA-Z]+)? +>>)/,

  say: /^(?<prefix>(?<fname>[^:@\s]+) +(?<lname>[^@:\s]+)(?<server>@[a-zA-Z]+)?:)/,

  party:
    /^(?<prefix>\((?<fname>[^:@\s]+) +(?<lname>[^@:\s]+)(?<server>@[a-zA-Z]+)?\))/,

  freecompany:
    /^(?<prefix>\[FC\]<(?<fname>[^:@\s]+) +(?<lname>[^@:\s]+)(?<server>@[a-zA-Z]+)?>)/,

  linkshell:
    /^(?<prefix>\[(?<cw>CW)?LS(?<ls>[0-9])\]<(?<fname>[^:@\s]+) +(?<lname>[^@:\s]+)(?<server>@[a-zA-Z]+)?>)/,

  emote:
    /^(?<prefix>(?<fname>[^:@\s]+) +(?<lname>[^@:\s]+)(?<server>@[a-zA-Z]+)?)/,
};

const CHAT_TYPES = new Set([
  "say",
  "party",
  "yell",
  "shout",
  "emote",
  "tell",
  "freecompany",
  "linkshell",
]);

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
    console.log("[DEBUG]", ...what);
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
 * Determine the message class of a chunked message using Regexp matches
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
 * Determine the message class of a chat message using Regexp matches
 * @param {String} message
 */
const getChatClass = (message) => {
  for (let chatType in CHAT_PATTERNS) {
    if (!CHAT_PATTERNS[chatType]) continue;
    if (!CHAT_PATTERNS[chatType].test(message)) continue;

    return chatType;
  }

  alert("Invalid chatlog given, bad line:\n" + message);
  throw `Could not determine chat class for: ${message}`;
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
      for (const k in this.#data) {
        if (!defaults[k]) delete this.#data[k];
      }
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
 * @param {String} lines
 * @param {Settings} settings
 * @param {String} prefix
 */
const formatLines = (lines, settings, prefix) => {
  if (settings.doEmConvert) lines = lines.replace(/--/g, "—");
  lines = lines.replace(/[ \t]+/g, " ").replace(/^\s+/g, "");
  lines = lines.replace(/\s+>>/g, " ");

  let all_lines = lines.split(NEWLINE_RE);
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

const clearFilters = () => {
  for (const n in HIDDEN_NAMES) {
    document.head.removeChild(HIDDEN_NAMES[n]);
    delete HIDDEN_NAMES[n];
  }
};

/**
 *
 * @param {HTMLLinkElement} node
 */
const toggleHidden = (node) => {
  let name = node.parentElement.getAttribute("data-charName");
  if (!name) {
    console.log("ERROR: Failed to get name from node:", node.parentElement);
    return;
  }

  if (HIDDEN_NAMES[name]) {
    document.head.removeChild(HIDDEN_NAMES[name]);
    delete HIDDEN_NAMES[name];
    return;
  }

  let style = document.createElement("style");

  style.innerHTML = `
    #editor > #filewatch-container > ul#filewatch > li[data-charName="${name}"] {
      display: none;
      
      & a {
        text-decoration: 3px solid red line-through;
      }

      & a:hover {
        text-decoration: 3px solid blue line-through;
      }
    }
  `;

  document.head.appendChild(style);
  HIDDEN_NAMES[name] = style;
};

/**
 *
 * @param {String} type
 * @param {Boolean?} want
 */
const toggleChat = (type, want) => {
  if (!CHAT_TYPES.has(type)) {
    dbgLog(`What is a '${type}'?`);
    return;
  }

  if (want === undefined || want === null) {
    want = !HIDDEN_CHATS[type];
  }

  switch (want) {
    case true:
      dbgLog(`Ensuring ${type} is enabled`);
      if (!HIDDEN_CHATS[type]) return;
      document.head.removeChild(HIDDEN_CHATS[type]);
      delete HIDDEN_CHATS[type];
      break;

    case false:
      dbgLog(`Ensuring ${type} is disabled`);
      if (HIDDEN_CHATS[type]) return;
      let style = document.createElement("style");
      style.innerHTML = `
        #editor > #filewatch-container > ul#filewatch {
          & li:has(> span.${type}) { 
            display: none;
            & a {
              text-decoration: 3px black line-through;
              cursor: default;
            }
          }
        }
      `;
      document.head.appendChild(style);
      HIDDEN_CHATS[type] = style;
      break;
  }
};

/**
 *
 * @param {Settings} settings
 * @param {String[]} lines
 */
const populateFilewatch = (settings, lines) => {
  let lastLine;
  let filewatch = document.querySelector("ul#filewatch");
  filewatch.parentElement.hidden = false;
  filewatch.parentElement.style.display = "flex";

  lines.forEach((l) => {
    l = l.replace(/\s+/g, " ").trim();
    if (/^\s*$/.test(l)) return;
    if (l === lastLine) return;

    lastLine = l;

    let li = document.createElement("li");
    let prefix = document.createElement("a");
    let span = document.createElement("span");

    // Remove beginning timestamps
    l = l.replace(TIMESTAMP_RE, "");
    let chatClass;
    try {
      chatClass = getChatClass(l);
    } catch {
      return;
    }

    /** @type {RegExpMatchArray} */
    let match = CHAT_PATTERNS[chatClass].exec(l);
    l = l.replace(CHAT_PATTERNS[chatClass], "").trim();
    chatClass = chatClass.startsWith("tell") ? "tell" : chatClass;
    let charName = `${match.groups.fname} ${match.groups.lname}`;

    KNOWN_NAMES.add(charName);
    prefix.onclick = () => toggleHidden(prefix);

    li.setAttribute("data-charName", charName);
    prefix.classList.add(chatClass);
    span.classList.add(chatClass);
    prefix.textContent = match?.groups.prefix;
    span.textContent = l;

    li.appendChild(prefix);
    li.appendChild(span);
    filewatch.appendChild(li);

    if (settings.doChatAutoscrolling) scrollTo(filewatch, li);
  });
};

/**
 * With a name, find an element on the DOM and assign it an onclick
 * @param {String} name
 * @param {String} defaultPage
 */
const makeMenu = (name, defaultPage) => {
  /** @type {HTMLDialogElement} */
  const menus = {};
  const modal = document.querySelector(`#${name}`);
  const icon = document.querySelector(`#${name}-icon`);
  const close = modal.querySelector(".close");

  let selected = "";

  if (!modal || !icon) {
    throw `makeMenu: Missing either #${name} or ${name}-icon Element`;
  }

  /**
   * @param {String} pageName
   */
  const setPage = (pageName) => {
    if (selected === pageName) return;
    if (!menus[pageName]) return;

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
    if (!menus[forMenu]) throw `Menu navlink is missing its page: ${forMenu}`;

    option.onclick = () => {
      setPage(forMenu);
    };
  });

  if (close) {
    modal.querySelector(".close").onclick = () => {
      modal.close();
    };
  }

  /** @param {String?} page */
  return (page) => {
    setPage(page || defaultPage);
    return modal.showModal();
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

document.onreadystatechange = () => {
  if (document.readyState !== "interactive") return;

  var timeoutID = null;

  const elements = {
    /////////////////
    // Application //
    /////////////////

    /** @type {HTMLTextAreaElement} */
    textBox: document.querySelector("#textbox"),

    /** @type {HTMLUListElement} */
    previewBox: document.querySelector("#preview"),

    /** @type {HTMLUListElement} */
    fileWatch: document.querySelector("ul#filewatch"),

    /** @type {HTMLSpanElement} */
    chatScrollIndicator: document.querySelector("#chat-scroll-indicator"),

    /////////////////////////
    // Scratchpad Settings //
    /////////////////////////

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

    //////////////////////
    // Chatlog Settings //
    //////////////////////

    /** @type {HTMLInputElement} */
    sayFilterCheckbox: document.querySelector("#enable-say"),

    /** @type {HTMLInputElement} */
    tellFilterCheckbox: document.querySelector("#enable-tell"),

    /** @type {HTMLInputElement} */
    partyFilterCheckbox: document.querySelector("#enable-party"),

    /** @type {HTMLInputElement} */
    emoteFilterCheckbox: document.querySelector("#enable-emotes"),

    /** @type {HTMLInputElement} */
    linkshellFilterCheckbox: document.querySelector("#enable-linkshell"),

    /** @type {HTMLInputElement} */
    freecompanyFilterCheckbox: document.querySelector("#enable-freecompany"),

    /** @type {HTMLInputElement} */
    allFiltersCheckbox: document.querySelector("#enable-filters"),

    /** @type {HTMLInputElement} */
    chatAutoScrollCheckbox: document.querySelector("#enable-chat-autoscroll"),

    /** @type {HTMLStyleElement} */
    doChatFilteringStyle: document.querySelector(
      "style#disable-chat-filtering",
    ),

    /////////////////////
    // Menus and Icons //
    /////////////////////

    /** Open the main menu to the given page if it exists */
    mainMenu: makeMenu("mainmenu", "settings-page"),

    /** @type {HTMLLinkElement} */
    clearFiltersIcon: document.querySelector("#clearfilters-icon"),

    /** @type {HTMLLinkElement} */
    saveLink: document.querySelector("#save a"),

    /** @type {HTMLLinkElement} */
    followIcon: document.querySelector("#followlog-icon"),

    /** @type {HTMLLinkElement} */
    filtersMenu: document.querySelector("#otherfilters-icon"),
  };

  const chatFilters = {
    say: elements.sayFilterCheckbox,
    tell: elements.tellFilterCheckbox,
    party: elements.partyFilterCheckbox,
    emote: elements.emoteFilterCheckbox,
    linkshell: elements.linkshellFilterCheckbox,
    freecompany: elements.freecompanyFilterCheckbox,
  };

  let allTruthy = all(elements);
  if (!allTruthy[0])
    throw `Cannot load, missing required elements: ${allTruthy[1]}`;

  const doUpdate = () => {
    return populatePreview(
      elements.textBox,
      elements.previewBox,
      padSettings,
      getChatPrefix(),
    );
  };

  elements.textBox.value = localStorage.getItem(STORAGE_NAME) || "";
  elements.previewNameInput.value = padSettings.previewName;

  // Scratchpad Settings
  padSettings.linkCheckbox("doEmConvert", elements.emDashCheckbox);
  padSettings.linkCheckbox("doAutoscroll", elements.autoscrollCheckbox);
  padSettings.linkCheckbox("isOutOfCharacter", elements.oocCheckbox, doUpdate);

  padSettings.linkCheckbox(
    "doSpellcheck",
    elements.spellcheckCheckbox,
    (value) => (elements.textBox.spellcheck = value),
  );

  // Chatbox settings
  padSettings.linkCheckbox(
    "doChatFiltering",
    elements.allFiltersCheckbox,
    (value) => (elements.doChatFilteringStyle.disabled = value),
  );

  padSettings.linkCheckbox(
    "doChatAutoscrolling",
    elements.chatAutoScrollCheckbox,
  );

  // Chatbox filters
  padSettings.linkCheckbox("allowSay", chatFilters.say, (v) =>
    toggleChat("say", v),
  );

  padSettings.linkCheckbox("allowTell", chatFilters.tell, (v) =>
    toggleChat("tell", v),
  );

  padSettings.linkCheckbox("allowParty", chatFilters.party, (v) =>
    toggleChat("party", v),
  );

  padSettings.linkCheckbox("allowEmote", chatFilters.emote, (v) =>
    toggleChat("emote", v),
  );

  padSettings.linkCheckbox("allowLinkshell", chatFilters.linkshell, (v) =>
    toggleChat("linkshell", v),
  );

  padSettings.linkCheckbox("allowFreecompany", chatFilters.freecompany, (v) =>
    toggleChat("freecompany", v),
  );

  /**
   * Keyboard shortcuts
   * @param {Event} event
   */
  document.onkeydown = function (event) {
    if (event.ctrlKey) {
      switch (event.key) {
        case "s":
          event.preventDefault();

          elements.saveLink.click();
          break;
        case "o":
          event.preventDefault();

          if (!HAS_FILESYSTEM_API) return;
          elements.followIcon.click();
          break;
        case "/":
          event.preventDefault();

          elements.mainMenu("help-page");
          break;
      }
    }
  };

  /**
   * Allow inputting tabs in the textarea instead of changing focus to the next element
   * (must use onkeydown to prevent default behavior of moving focus)
   * @param {Event} event
   */
  elements.textBox.onkeydown = function (event) {
    if (event.key === "Tab") {
      event.preventDefault();
      var text = this.value,
        s = this.selectionStart,
        e = this.selectionEnd;
      this.value = text.substring(0, s) + "\t" + text.substring(e);
      this.selectionStart = this.selectionEnd = s + 1;
    }
  };

  /** Update the preview and reset save timeout */
  elements.textBox.onkeyup = function () {
    window.clearTimeout(timeoutID);

    timeoutID = window.setTimeout(() => {
      localStorage.setItem(STORAGE_NAME, elements.textBox.value);
      doUpdate();
    }, 100);
  };

  /** Save the contents of the textbox to a file */
  elements.saveLink.onclick = function () {
    this.download = `${STORAGE_NAME}.txt`;
    this.href = URL.createObjectURL(
      new Blob([elements.textBox.value], {
        type: "text/plain",
      }),
    );
  };

  /** When the chat type is changed, we need to rebuild the preview  */
  elements.chatTypeRadio.forEach((node) => {
    node.onchange = doUpdate;
  });

  /** Similarly, when we're changing the custom prefix; update the preview if it's in use*/
  elements.customChatInput.oninput = () => {
    var current_chat = document.querySelector(
      "input[name='chatype']:checked",
    ).id;

    if (current_chat === "customchat") doUpdate();
  };

  elements.previewNameInput.onchange = function () {
    padSettings.previewName = this.value;
    doUpdate();
  };

  elements.textBox.setSelectionRange(
    elements.textBox.value.length,
    elements.textBox.value.length,
  );

  elements.filtersMenu.onclick = () => {
    elements.mainMenu("filters-page");
  };

  /** Scroll to the bottom of the chatbox when scrolled up */
  elements.chatScrollIndicator.onclick = function () {
    scrollTo(elements.fileWatch, elements.fileWatch.lastChild);
  };

  /** When clicked, clear player filters and reset the chatype filters */
  elements.clearFiltersIcon.onclick = function () {
    clearFilters();
    for (const box in chatFilters) {
      if (!chatFilters[box].checked) chatFilters[box].click();
    }
    scrollTo(elements.fileWatch, elements.fileWatch.lastChild);
  };

  const followLog = async function () {
    /** @type {FileSystemFileHandle} */
    let fh;
    let timeout;
    let tailTimeoutID;
    let lastModified = 0;
    let lastLen = 0;

    timeout = () => {
      /**
       * Ensure that we're returning an asyncronous function, and resetting our timeout
       * @param {*} fn
       * @returns
       */
      let complete = function (fn) {
        return async () => {
          await fn();
          window.clearTimeout(tailTimeoutID);
          tailTimeoutID = window.setTimeout(timeout, 1000);
        };
      };

      /**
       * Using the file handle received, set a timer every second to check the file for
       * changes. If the timestamp for modification is less than now, pass. If the size is
       * the same, pass. Repopulate the chatbox if its been updated.
       */
      tailTimeoutID = window.setTimeout(
        complete(async () => {
          let file = await fh.getFile();

          if (file.lastModified <= lastModified) return;
          if (file.size == lastLen) return;

          if (file.size < lastLen) {
            lastModified = file.lastModified;
            lastLen = file.size;
          }

          let stream = await file.slice(lastLen, file.size).text();
          lastLen = file.size;
          lastModified = file.lastModified;

          populateFilewatch(padSettings, stream.split(NEWLINE_RE));
        }, 1000),
      );
    };

    [fh] = await window.showOpenFilePicker();
    tailTimeoutID = window.setTimeout(timeout, 1000);

    elements.followIcon.classList.remove("unopened");
    elements.followIcon.classList.add("opened");

    /**
     * Modify the followicon element classlist to alter the display of the icon, and
     * upon closing of the chatbox, clear out userfilters.
     */
    elements.followIcon.onclick = () => {
      window.clearTimeout(tailTimeoutID);

      elements.followIcon.onclick = followLog;
      elements.followIcon.classList.remove("opened");
      elements.followIcon.classList.add("unopened");

      elements.fileWatch.parentElement.hidden = true;
      elements.fileWatch.parentElement.style.display = "none";

      while (elements.fileWatch.hasChildNodes()) {
        elements.fileWatch.removeChild(elements.fileWatch.firstChild);
      }

      clearFilters();
      KNOWN_NAMES.clear();
    };
  };

  /**
   * If we have access to the File System API, then we can enable the log tailing
   * features. Display the icon, enable the feature, and prepare the scrollIndicator
   */
  if (HAS_FILESYSTEM_API) {
    elements.followIcon.hidden = false;
    elements.followIcon.onclick = followLog;

    elements.fileWatch.onscroll = () => {
      if (!elements.fileWatch.lastChild) return;

      const childH = elements.fileWatch.offsetHeight;
      const scroll = elements.fileWatch.scrollTop;
      const height = elements.fileWatch.scrollHeight;

      if (height > scroll + childH) {
        elements.chatScrollIndicator.hidden = false;
      } else {
        elements.chatScrollIndicator.hidden = true;
      }
    };
  }

  /* Make sure that the pad contents and our settings are saved just before we exit. */
  window.onbeforeunload = function () {
    localStorage.setItem(STORAGE_NAME, elements.textBox.value);
    padSettings.save();
  };

  doUpdate();
};
