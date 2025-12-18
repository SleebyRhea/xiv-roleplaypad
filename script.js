const STORAGE_NAME = "rp-wordpad";
const DEFAULT_FILE_NAME = "rp-wordpad.txt";
const CHARACTER_LIMIT = 500;

/**
 * The amount of characters that make up: (##/##)
 *
 * Since in RP its /unlikely/ that anyone will be posting into the hundreds
 * for a single post, this is sufficient and saves a lot of effort.
 */
const CHAR_COUNT_OFFSET = 8;

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
const calcStats = (box) => {
	updateCount("char", box.value.length);
	updateCount(
		"word",
		box.value === "" ? 0 : box.value.replace(/\s+/g, " ").split(" ").length
	);
	updateCount("line", box.value === "" ? 0 : box.value.split(/\n/).length);
};

var depth = 0;
const dbgLogFn = (what, fn) => {
	return (...arg) => {
		console.log("DEBUG:", what);
		return fn(...arg);
	};
};

const dbgLog = (what) => {
	console.log("DEBUG", what);
};

/**
 * @param {Number} size
 * @returns {Boolean}
 */
const isOverLimit = (size) => {
	var r = Math.floor((size - 1) / (CHARACTER_LIMIT - CHAR_COUNT_OFFSET));

	// dbgLog(`Math.floor((${size - 1} / (${CHARACTER_LIMIT} - ${CHAR_COUNT_OFFSET}))) = ${r}`)
	return 1 <= r;
};

/**
 *
 * @param {HTMLTextAreaElement} box
 * @param {HTMLOListElement} preview
 */
const populatePreview = (box, preview) => {
	var list_objects = [];
	formatLines(box.value).forEach((line, i, self) => {
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

		li.appendChild(content);
		li.appendChild(metadata);

		li.onclick = function () {
			if (li.classList.contains("copied")) {
				li.classList.remove("copied");
				return;
			}

			navigator.clipboard.writeText(content.textContent);
			li.classList.add("copied");
		};
		list_objects.push(li);
		// list_objects.push(document.createElement("hr"));
	});

	preview.replaceChildren(...list_objects);
};

/**
 * Split a string into lines each within the CHARACTER_LIMIT
 * @param {String} line
 * @param {Boolean} singular
 */
const processLine = (line, singular) => {
	line = line.replace(/\s+/g, " ");

	if (singular && line.length <= CHARACTER_LIMIT) {
		console.log(
			`processLine: Line length(${line.length}) <= ${CHARACTER_LIMIT}`
		);
		return [line];
	}

	if (!isOverLimit(line.length)) {
		console.log(`Not over line limit: ${line.length}`);
		return [line];
	}

	console.log(`Over line limit: ${line.length}`);

	var words = line.split(" ");
	var results = [""];
	var count = 0;
	var on = 0;
	words.forEach((word) => {
		count += word.length + 1;
		console.log(`On word '${word}' [${count}]`);

		if (isOverLimit(count)) {
			console.log(`Breaking up words on: ${word}`);
			count = 0;
			results[++on] = "";
		}

		results[on] += word + " ";
	});

	console.log("Final result:", results);

	return results;
};

/**
 *
 * @param {HTMLTextAreaElement} box
 */
const formatLines = (lines) => {
	lines = lines.replace(/[ \t]+/g, " ");
	var all_lines = lines.split(/\n/);
	var count = 0;
	var final_string = "";
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

		result.push(...processLine(line, !count > 1));
	});

	count = result.length;

	if (count <= 1) return result;

	result.forEach((line, i, self) => {
		self[i] = `${line.replace(/\s?$/, "")} (${i + 1}/${count})`;
	});

	return result;
};

/**
 * Update a statusbar column with metadata
 * @param {String} item
 * @param {Number} value
 */
const updateCount = (item, value) => {
	document.querySelector("#" + item + "-count").textContent = value;
};

/**
 * With a name, find an element on the DOM and assign it an onclick
 * @param {String} name
 * @param {(HTMLDialogElement)=>void} onclick
 */
const makeModal = (name, onclick) => {
	/** @type {HTMLDialogElement} */
	var modal = document.querySelector(`#${name}`);

	if (!modal) {
		return;
	}

	if (!onclick) {
		onclick = (m) => {
			return m.showModal();
		};
	}

	document.querySelector(`#${name}-icon`).onclick = (e) => {
		return onclick(modal, e);
	};
};

const initialize = () => {
	var timeoutID = null;

	/** @type {HTMLTextAreaElement} */
	const textbox = document.querySelector("#textbox");

	/** @type {HTMLPreElement} */
	const previewbox = document.querySelector("#preview");

	/** @type {HTMLInputElement} */
	const filenameBox = document.querySelector("#filename");

	textbox.value = localStorage.getItem(STORAGE_NAME) || "";
	textbox.spellcheck = document.querySelector("#spellcheck").checked;

	/** Place caret at end of content */
	textbox.setSelectionRange(textbox.value.length, textbox.value.length);
	calcStats(textbox);
	populatePreview(textbox, previewbox);

	/**
	 * Keyboard shortcuts
	 * @param {Event} event
	 */
	document.onkeydown = function (event) {
		if (event.ctrlKey) {
			switch (event.key) {
				case "s":
					document.querySelector("#save a").click();
					event.preventDefault();
					break;
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

		if (event.key == "-") {
			var prior = textbox.selectionStart - 1;
			console.log(prior, textbox.value.charAt(prior));

			if (textbox.value.charAt(prior) === "-") {
				event.preventDefault();

				textbox.value =
					textbox.value.slice(0, prior) +
					"—" +
					textbox.value.slice(prior + 1, textbox.value.length);

				textbox.setSelectionRange(prior + 1, prior + 1);
			}
		}
	};

	/**
	 * Calculate stats when a key is depressed, reset the save timeout
	 */
	textbox.onkeyup = function () {
		calcStats(textbox);
		populatePreview(textbox, previewbox);

		window.clearTimeout(timeoutID);
		timeoutID = window.setTimeout(() => {
			storeLocally(STORAGE_NAME, textbox.value);
		}, 1000);
	};

	/**
	 * Save textarea contents as a text file
	 */
	document.querySelector("#save a").onclick = function () {
		this.download = (filenameBox.value || DEFAULT_FILE_NAME).replace(
			/^([^.]*)$/,
			"$1.txt"
		);
		this.href = URL.createObjectURL(
			new Blob([document.querySelector("#textbox").value], { type: "text/plain" })
		);
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

	/** Toggle spell-checking */
	document.querySelector("#spellcheck").onchange = function () {
		textbox.spellcheck = this.checked;
	};

	// makeModal("settings");
	makeModal("about");
	makeModal("help");

	window.onbeforeunload = function () {
		storeLocally(STORAGE_NAME, textbox.value);
	};
};

document.onreadystatechange = () => {
	if (document.readyState === "interactive") {
		initialize();
	}
};
