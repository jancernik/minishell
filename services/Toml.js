.pragma library

// Reads and writes the part of TOML the config file uses: tables, dotted and
// quoted keys, strings, integers, floats, booleans and arrays. Multiline strings,
// inline tables, array tables and dates fail with the line number.

const escapeValues = {
    b: "\b",
    t: "\t",
    n: "\n",
    f: "\f",
    r: "\r",
    "\"": "\"",
    "\\": "\\"
};

const escapeSequences = {
    "\b": "\\b",
    "\t": "\\t",
    "\n": "\\n",
    "\f": "\\f",
    "\r": "\\r",
    "\"": "\\\"",
    "\\": "\\\\"
};

function fail(lineNumber, message) {
    throw new Error(`TOML line ${lineNumber}: ${message}`);
}

function findUnquoted(line, target, lineNumber) {
    let quote = "";
    let escaped = false;

    for (let index = 0; index < line.length; index++) {
        const character = line[index];
        if (quote === "\"") {
            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === quote) {
                quote = "";
            }
        } else if (quote === "'") {
            if (character === quote)
                quote = "";
        } else if (character === "\"" || character === "'") {
            quote = character;
        } else if (character === target) {
            return index;
        }
    }

    if (quote !== "")
        fail(lineNumber, "unterminated string.");
    return -1;
}

function stripComment(line, lineNumber) {
    const index = findUnquoted(line, "#", lineNumber);
    return index < 0 ? line : line.slice(0, index);
}

function decodeEscape(source, index, lineNumber) {
    const character = source[index];
    if (Object.prototype.hasOwnProperty.call(escapeValues, character))
        return {
            value: escapeValues[character],
            next: index + 1
        };

    const width = character === "u" ? 4 : character === "U" ? 8 : 0;
    if (width === 0)
        fail(lineNumber, `invalid escape \\${character}.`);

    const digits = source.slice(index + 1, index + 1 + width);
    if (digits.length !== width || !/^[0-9a-fA-F]+$/.test(digits))
        fail(lineNumber, "invalid Unicode escape.");

    const codePoint = parseInt(digits, 16);
    if (codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff))
        fail(lineNumber, "invalid Unicode code point.");

    return {
        value: String.fromCodePoint(codePoint),
        next: index + 1 + width
    };
}

function parseQuoted(source, start, lineNumber) {
    const quote = source[start];
    let value = "";

    for (let index = start + 1; index < source.length; index++) {
        const character = source[index];
        if (character === quote)
            return {
                value: value,
                next: index + 1
            };
        if (quote === "\"" && character === "\\") {
            if (index + 1 >= source.length)
                fail(lineNumber, "unterminated escape.");
            const decoded = decodeEscape(source, index + 1, lineNumber);
            value += decoded.value;
            index = decoded.next - 1;
            continue;
        }
        const code = character.charCodeAt(0);
        if (code < 0x20 && character !== "\t")
            fail(lineNumber, "control character in string.");
        value += character;
    }

    fail(lineNumber, "unterminated string.");
}

function parseKeyPath(source, lineNumber) {
    const parts = [];
    let index = 0;

    if (source.trim() === "")
        fail(lineNumber, "empty key segment.");

    while (index < source.length) {
        while (index < source.length && /\s/.test(source[index]))
            index++;
        if (index >= source.length)
            fail(lineNumber, "empty key segment.");

        let part = "";
        if (source[index] === "\"" || source[index] === "'") {
            const parsed = parseQuoted(source, index, lineNumber);
            part = parsed.value;
            index = parsed.next;
        } else {
            const start = index;
            while (index < source.length && /[A-Za-z0-9_-]/.test(source[index]))
                index++;
            part = source.slice(start, index);
            if (part === "")
                fail(lineNumber, "invalid bare key.");
        }

        if (part === "")
            fail(lineNumber, "empty key segment.");
        parts.push(part);

        while (index < source.length && /\s/.test(source[index]))
            index++;
        if (index >= source.length)
            break;
        if (source[index] !== ".")
            fail(lineNumber, "unexpected text after key.");
        index++;
        if (index >= source.length)
            fail(lineNumber, "empty key segment.");
    }

    return parts;
}

function findAssignment(line, lineNumber) {
    const index = findUnquoted(line, "=", lineNumber);
    if (index < 0)
        fail(lineNumber, "expected a key/value assignment.");
    return index;
}

function parseNumber(token, lineNumber) {
    let radix = 0;
    if (/^0x[0-9a-fA-F](?:_?[0-9a-fA-F])*$/.test(token))
        radix = 16;
    else if (/^0o[0-7](?:_?[0-7])*$/.test(token))
        radix = 8;
    else if (/^0b[01](?:_?[01])*$/.test(token))
        radix = 2;

    if (radix !== 0) {
        const value = parseInt(token.replace(/_/g, "").slice(2), radix);
        if (!isFinite(value))
            fail(lineNumber, "number must be finite.");
        return value;
    }

    const digits = "[0-9](?:_?[0-9])*";
    const whole = "(?:0|[1-9](?:_?[0-9])*)";
    const exponent = `[eE][+-]?${digits}`;
    const integer = new RegExp(`^[+-]?${whole}$`);
    const float = new RegExp(`^[+-]?(?:${whole}\\.${digits}(?:${exponent})?|${whole}${exponent})$`);
    if (!integer.test(token) && !float.test(token))
        fail(lineNumber, `unsupported value ${token}.`);

    const value = Number(token.replace(/_/g, ""));
    if (!isFinite(value))
        fail(lineNumber, "number must be finite.");
    return value;
}

function parseValue(source, lineNumber) {
    let index = 0;

    function skipWhitespace() {
        while (index < source.length && /\s/.test(source[index]))
            index++;
    }

    function value() {
        skipWhitespace();
        if (index >= source.length)
            fail(lineNumber, "missing value.");

        const character = source[index];
        if (character === "\"" || character === "'") {
            if (source.slice(index, index + 3) === character.repeat(3))
                fail(lineNumber, "multiline strings are not supported.");
            const parsed = parseQuoted(source, index, lineNumber);
            index = parsed.next;
            return parsed.value;
        }

        if (character === "[") {
            index++;
            const result = [];
            skipWhitespace();
            if (source[index] === "]") {
                index++;
                return result;
            }
            while (index < source.length) {
                result.push(value());
                skipWhitespace();
                if (source[index] === "]") {
                    index++;
                    return result;
                }
                if (source[index] !== ",")
                    fail(lineNumber, "expected a comma in array.");
                index++;
                skipWhitespace();
                if (source[index] === "]") {
                    index++;
                    return result;
                }
            }
            fail(lineNumber, "unterminated array.");
        }

        if (character === "{")
            fail(lineNumber, "inline tables are not supported.");

        const start = index;
        while (index < source.length && !/[\s,\]]/.test(source[index]))
            index++;
        const token = source.slice(start, index);
        if (token === "true")
            return true;
        if (token === "false")
            return false;
        return parseNumber(token, lineNumber);
    }

    const result = value();
    skipWhitespace();
    if (index !== source.length)
        fail(lineNumber, "unexpected text after value.");
    return result;
}

function ensureTable(root, path, lineNumber) {
    let cursor = root;
    for (const part of path) {
        if (!Object.prototype.hasOwnProperty.call(cursor, part)) {
            cursor[part] = Object.create(null);
        } else if (cursor[part] === null || typeof cursor[part] !== "object" || Array.isArray(cursor[part])) {
            fail(lineNumber, `table ${path.join(".")} conflicts with a value.`);
        }
        cursor = cursor[part];
    }
    return cursor;
}

function assign(root, path, value, lineNumber) {
    const parent = ensureTable(root, path.slice(0, -1), lineNumber);
    const key = path[path.length - 1];
    if (Object.prototype.hasOwnProperty.call(parent, key))
        fail(lineNumber, `duplicate key ${path.join(".")}.`);
    parent[key] = value;
}

function parse(source) {
    const root = Object.create(null);
    let tablePath = [];
    const explicitTables = {};
    const lines = String(source || "").replace(/^\uFEFF/, "").split(/\r?\n/);

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const lineNumber = lineIndex + 1;
        const line = stripComment(lines[lineIndex], lineNumber).trim();
        if (line === "")
            continue;

        if (line.startsWith("[")) {
            if (line.startsWith("[["))
                fail(lineNumber, "array tables are not supported.");
            const match = line.match(/^\[(.+)\]$/);
            if (!match)
                fail(lineNumber, "invalid table header.");
            tablePath = parseKeyPath(match[1], lineNumber);
            const identifier = JSON.stringify(tablePath);
            if (explicitTables[identifier])
                fail(lineNumber, `duplicate table ${tablePath.join(".")}.`);
            explicitTables[identifier] = true;
            ensureTable(root, tablePath, lineNumber);
            continue;
        }

        const assignment = findAssignment(line, lineNumber);
        const keyPath = parseKeyPath(line.slice(0, assignment).trim(), lineNumber);
        const parsedValue = parseValue(line.slice(assignment + 1).trim(), lineNumber);
        assign(root, tablePath.concat(keyPath), parsedValue, lineNumber);
    }

    return root;
}

function formatKey(key) {
    return /^[A-Za-z0-9_-]+$/.test(key) ? key : quoteString(key);
}

function quoteString(value) {
    let output = "\"";
    const source = String(value);
    for (let index = 0; index < source.length; index++) {
        const character = source[index];
        if (Object.prototype.hasOwnProperty.call(escapeSequences, character)) {
            output += escapeSequences[character];
        } else if (character.charCodeAt(0) < 0x20) {
            output += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
        } else {
            output += character;
        }
    }
    return output + "\"";
}

function formatValue(value) {
    if (typeof value === "string")
        return quoteString(value);
    if (typeof value === "boolean")
        return value ? "true" : "false";
    if (typeof value === "number") {
        if (!isFinite(value))
            throw new Error("Cannot serialize a non-finite TOML number.");
        return Object.is(value, -0) ? "0" : String(value);
    }
    if (Array.isArray(value))
        return `[${value.map(entry => formatValue(entry)).join(", ")}]`;
    throw new Error("Only TOML scalar values and arrays can be serialized.");
}
