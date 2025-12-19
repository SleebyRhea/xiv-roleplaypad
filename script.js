const STORAGE_NAME = "roleplaypad";
const DEFAULT_FILE_NAME = "roleplaypad.txt";
const CHARACTER_LIMIT = 500;
const DEBUGGING = false;

/**
 * The amount of characters that make up: (##/##)
 *
 * Since in RP its /unlikely/ that anyone will be posting into the hundreds
 * for a single post, this is sufficient and saves a lot of effort.
 */
const CHAR_COUNT_OFFSET = 8;

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
 * `Chat2Connection` objects handle interfacing with the webinterface of the [chat2](https://github.com/Infiziert90/ChatTwo)
 * dalamud plugin
 */
class Chat2Connection {
  constructor(url) {
    this.status = false;
    this.auth = false;
    this.__xhr = new XMLHttpRequest(url);
  }

  /**
   * Attempt to authenticate
   * @param {String} auth
   * @returns {Boolean}
   */
  authenticate(auth) {
    if (!/^[0-9]{6}$/.test(auth))
      return badInput(`${this.className}: auth code must be 6 digit integer`);

    this.__xhr.open("POST", "/auth", false, null, auth);
    this.__xhr.setRequestHeader(
      "Content-Type",
      "application/x-www-form-urlencoded",
    );
    this.__xhr.send(`authcode=${auth}`);

    if (this.__xhr.status !== 200) {
      console.error(`${url}: Bad auth: ${this.__xhr.statusText}`);
      return false;
    }

    return (this.auth = true);
  }

  /**
   * Gate a function behind authentication with Chat2
   * @param {(...any) => any} fn
   * @returns {Boolean}
   */
  needAuth(fn) {
    if (this.auth) {
      return fn();
    } else {
      return false;
    }
  }

  /**
   * Send a message to the configured chat2 interface
   * @param {String} input
   * @returns {Boolean}
   */
  sendMessage(input) {
    return this.needAuth(() => {
      this.__xhr.open("PUSH", "/send", false);
      this.__xhr.setRequestHeader("Content-Type", "application/json");
      this.__xhr.send(JSON.stringify({ message: input }));
    });
  }
}

/**
 * Store an object in local storage
 * @param {String} name
 * @param {any} what
 */
const storeLocally = (name, what) => {
  localStorage.setItem(name, what);
};

/**
 * Calculate and display character, words and line counts
 * @param {Element} box
 */
// const calcStats = (box) => {
// 	updateCount("char", box.value.length);
// 	updateCount(
// 		"word",
// 		box.value === "" ? 0 : box.value.replace(/\s+/g, " ").split(" ").length
// 	);
// 	updateCount("line", box.value === "" ? 0 : box.value.split(/\n/).length);
// };

var depth = 0;
const dbgLogFn = (what, fn) => {
  if (DEBUGGING) {
    return (...arg) => {
      console.log("DEBUG:", what);
      return fn(...arg);
    };
  }

  return fn;
};

const dbgLog = (what) => {
  if (DEBUGGING) {
    console.log("DEBUG", what);
  }
};

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
    } / (${CHARACTER_LIMIT} - ${CHAR_COUNT_OFFSET} - ${offset}))) = ${r}`,
  );
  return 1 <= r;
};

class PreviewSettings {
  /**
   *
   * @param {Boolean} em_dash Rewrite -- into —
   */
  constructor(em_dash = true, ooc = false) {
    this.em_dash = em_dash;
    this.ooc = false;
  }
}

/**
 *
 * @param {HTMLTextAreaElement} box
 * @param {HTMLOListElement} preview
 * @param {PreviewSettings} settings
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

    if (line.length > CHARACTER_LIMIT) {
      li.className = "overlimit";
    }

    li.onclick = function () {
      if (li.classList.contains("copied")) {
        li.classList.remove("copied");
        return;
      }

      navigator.clipboard.writeText(content.textContent);
      li.classList.add("copied");
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
 * @param {PreviewSettings} settings
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

  if (settings.ooc) {
    totalOffset += 4;
    finishLine = (input) => {
      return `${prefix} ((${input}))`;
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
 * @param {PreviewSettings} settings
 * @param {String} prefix
 */
const formatLines = (lines, settings, prefix) => {
  if (settings.em_dash) {
    lines = lines.replace(/--/g, "—");
  }

  lines = lines.replace(/[ \t]+/g, " ");
  var all_lines = lines.split(/\n/);
  var count = 0;
  var result = [];

  all_lines.forEach((line) => {
    if (/^\s*$/.test(line)) {
      return;
    }
    count++;
  });

  all_lines.forEach((line) => {
    if (/^\s*$/.test(line)) {
      return;
    }

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

const initialize = () => {
  var timeoutID = null;
  const preview_settings = new PreviewSettings();

  /** @type {HTMLTextAreaElement} */
  const textbox = document.querySelector("#textbox");

  /** @type {HTMLPreElement} */
  const previewbox = document.querySelector("#preview");

  /** @type {HTMLInputElement} */
  const filenameBox = document.querySelector("#filename");

  /** @type {Chat2Connection} */
  var chat2connection;

  textbox.value = localStorage.getItem(STORAGE_NAME) || "";
  textbox.spellcheck = document.querySelector("#spellcheck")?.checked ?? true;
  preview_settings.ooc = document.querySelector("#ooc")?.checked ?? false;

  /** Place caret at end of content */
  textbox.setSelectionRange(textbox.value.length, textbox.value.length);
  populatePreview(textbox, previewbox, preview_settings, getChatPrefix());
  // calcStats(textbox);

  /**
   * Keyboard shortcuts
   * @param {Event} event
   */
  document.onkeydown = function (event) {
    if (event.ctrlKey) {
      switch (event.key) {
        case "o":
          document.querySelector("#open input").click();
          event.preventDefault();
          break;
        case "/":
          document.querySelector("#help-icon").click();
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
  textbox.onkeydown = function (event) {
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
   * Calculate stats when a key is depressed, reset the save timeout
   */
  textbox.onkeyup = function () {
    populatePreview(textbox, previewbox, preview_settings, getChatPrefix());

    window.clearTimeout(timeoutID);
    timeoutID = window.setTimeout(() => {
      storeLocally(STORAGE_NAME, textbox.value);
    }, 1000);
  };

  /** Load contents from a text file */
  document.querySelector("#open a").onclick = function () {
    document.querySelector("#open input").click();
  };

  /**
   * @this {FileReader}
   */
  document.querySelector("#open input").onchange = function () {
    var reader = new FileReader();
    reader.file = this.files[0];

    /** Custom property so the filenameBox can be set from within reader.onload() */
    reader.onload = function () {
      filenameBox.value = this.file.name;
      textbox.value = this.result;
    };
    reader.readAsText(this.files[0]);
  };

  makeModal("settings");
  makeModal("about");
  makeModal("help");

  document.querySelectorAll("input[name='chatype']").forEach((node) => {
    node.onchange = function () {
      populatePreview(textbox, previewbox, preview_settings, getChatPrefix());
    };
  });

  document.querySelector("#customchat-input").oninput = () => {
    var current_chat = document.querySelector(
      "input[name='chatype']:checked",
    ).id;

    if (current_chat === "customchat") {
      populatePreview(textbox, previewbox, preview_settings, getChatPrefix());
    }
  };

  /** Toggle spell-checking */
  document.querySelector("#spellcheck").onchange = function () {
    textbox.spellcheck = this.checked;
  };

  /** Toggle em conversion */
  document.querySelector("#emdash").onchange = function () {
    preview_settings.em_dash = this.checked;
    populatePreview(textbox, previewbox, preview_settings, getChatPrefix());
  };

  document.querySelector("#ooc").onchange = function () {
    preview_settings.ooc = this.checked;
    populatePreview(textbox, previewbox, preview_settings, getChatPrefix());
  };

  window.onbeforeunload = function () {
    storeLocally(STORAGE_NAME, textbox.value);
  };
};

document.onreadystatechange = () => {
  if (document.readyState === "interactive") {
    initialize();
  }
};
