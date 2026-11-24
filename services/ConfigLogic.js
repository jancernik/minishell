.pragma library
.import "Toml.js" as Toml

// Schema and settings logic for Config.qml. It keeps no state and touches no
// files, so the tests can run it directly.

// Schema keys become TOML keys and dotted paths.
const safeKey = /^[A-Za-z][A-Za-z0-9_-]*$/;
// Width of the description comments in the written config file.
const commentWidth = 88;

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function equal(left, right) {
    return JSON.stringify(left) === JSON.stringify(right);
}

function isWholeNumber(value) {
    return isFinite(value) && Math.floor(value) === value;
}

function isPositiveInteger(value) {
    return typeof value === "number" && isWholeNumber(value) && value >= 1;
}

function isCount(value) {
    return isWholeNumber(value) && value >= 0;
}

function isTable(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}

// { found, value } at a dotted `path` of `object`.
function lookup(object, path) {
    const parts = path.split(".");
    let cursor = object;

    for (const part of parts) {
        if (cursor === null || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part))
            return {
                found: false,
                value: undefined
            };
        cursor = cursor[part];
    }

    return {
        found: true,
        value: cursor
    };
}

// Sets a dotted `path` of `object`, creating tables on the way.
function assign(object, path, value) {
    const parts = path.split(".");
    let cursor = object;

    for (let index = 0; index < parts.length - 1; index++) {
        const part = parts[index];
        if (!isTable(cursor[part]))
            cursor[part] = {};
        cursor = cursor[part];
    }

    cursor[parts[parts.length - 1]] = value;
}

// Deletes a dotted `path` of `object` and the tables it leaves empty.
function remove(object, path) {
    const parts = path.split(".");
    const stack = [];
    let cursor = object;

    for (let index = 0; index < parts.length - 1; index++) {
        const part = parts[index];
        if (cursor === null || typeof cursor !== "object" || !Object.prototype.hasOwnProperty.call(cursor, part))
            return;
        stack.push({
            parent: cursor,
            key: part
        });
        cursor = cursor[part];
    }

    if (cursor === null || typeof cursor !== "object")
        return;

    delete cursor[parts[parts.length - 1]];

    for (let index = stack.length - 1; index >= 0; index--) {
        const entry = stack[index];
        const child = entry.parent[entry.key];
        if (isTable(child) && Object.keys(child).length === 0)
            delete entry.parent[entry.key];
        else
            break;
    }
}

// The value at `parts` of `object`, or null.
function lookupParts(object, parts) {
    let cursor = object;
    for (const part of parts) {
        if (!isTable(cursor) || !Object.prototype.hasOwnProperty.call(cursor, part))
            return null;
        cursor = cursor[part];
    }
    return cursor;
}

function collectTablePaths(object, prefix, output) {
    for (const key of Object.keys(object).sort()) {
        if (!isTable(object[key]))
            continue;
        const path = prefix.concat([key]);
        output.push(path);
        collectTablePaths(object[key], path, output);
    }
}

function validateValue(setting, value) {
    if (!setting)
        return false;

    if (setting.type === "boolean" && typeof value !== "boolean")
        return false;
    if (setting.type === "string" && typeof value !== "string")
        return false;
    if (setting.type === "number" && (typeof value !== "number" || !isFinite(value)))
        return false;
    if (setting.type === "integer" && (typeof value !== "number" || !isWholeNumber(value)))
        return false;
    if (setting.enumValues.length > 0 && setting.enumValues.indexOf(value) < 0)
        return false;
    if ((setting.type === "number" || setting.type === "integer") && setting.minimum !== null && value < setting.minimum)
        return false;
    if ((setting.type === "number" || setting.type === "integer") && setting.maximum !== null && value > setting.maximum)
        return false;
    if (setting.type === "string" && setting.minimumLength !== null && value.length < setting.minimumLength)
        return false;
    if (setting.type === "string" && setting.maximumLength !== null && value.length > setting.maximumLength)
        return false;
    if (setting.type === "string" && setting.pattern !== "" && !(new RegExp(setting.pattern)).test(value))
        return false;
    if (setting.format === "color" && !/^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(value))
        return false;

    return true;
}

// The first problem with `values` against `settings`, or "".
function validateOverridesFor(values, settings) {
    if (!isTable(values))
        return "The configuration root must be a TOML table.";

    for (const setting of settings) {
        const parts = setting.path.split(".");
        let cursor = values;
        let prefix = "";

        for (let index = 0; index < parts.length - 1; index++) {
            const part = parts[index];
            prefix = prefix === "" ? part : prefix + "." + part;
            if (!Object.prototype.hasOwnProperty.call(cursor, part))
                break;

            cursor = cursor[part];
            if (!isTable(cursor))
                return `Invalid object for ${prefix}.`;
        }

        const configured = lookup(values, setting.path);
        if (configured.found && !validateValue(setting, configured.value))
            return `Invalid value for ${setting.path}.`;
    }

    return "";
}

// The first problem with switching to schema `candidate` while the config holds
// `values` at `version`, or "".
function schemaCompatibilityError(candidate, values, version) {
    if (version > candidate.version)
        return `Config version ${version} is newer than supported version ${candidate.version}.`;
    if (version < candidate.version)
        return `No migration from config version ${version} is available.`;
    return validateOverridesFor(values, candidate.settings);
}

function inferControl(specification, ui) {
    if (ui.control !== undefined)
        return ui.control;
    if (specification.enum)
        return "enum";
    if (specification.format === "color")
        return "color";
    if (specification.type === "boolean")
        return "boolean";
    if (specification.type === "number" || specification.type === "integer")
        return "number";
    return "string";
}

function collectSettings(properties, prefix, categoryId, output, map) {
    for (const key of Object.keys(properties || {})) {
        if (!safeKey.test(key))
            throw new Error(`Schema key ${key} is not a safe path segment.`);

        const specification = properties[key];
        const path = prefix === "" ? key : prefix + "." + key;
        if (!isTable(specification))
            throw new Error(`Schema setting ${path} must be an object.`);

        if (specification.type === "object" && specification.properties) {
            if (!isTable(specification.properties))
                throw new Error(`Schema properties for ${path} must be an object.`);
            if (Object.keys(specification.properties).length === 0)
                throw new Error(`Schema object ${path} must contain settings.`);
            collectSettings(specification.properties, path, categoryId, output, map);
            continue;
        }

        if (!Object.prototype.hasOwnProperty.call(specification, "default"))
            throw new Error(`Schema setting ${path} has no default.`);
        if (typeof specification.type !== "string" || specification.type === "")
            throw new Error(`Schema setting ${path} has no type.`);

        const ui = specification["x-ui"] === undefined ? {} : specification["x-ui"];
        if (!isTable(ui))
            throw new Error(`Schema UI metadata for ${path} must be an object.`);
        if (ui.control !== undefined && (typeof ui.control !== "string" || ui.control === ""))
            throw new Error(`Schema control for ${path} must be a non-empty string.`);
        const enumValues = specification.enum;
        if (enumValues !== undefined && (!Array.isArray(enumValues) || enumValues.length === 0))
            throw new Error(`Schema enum for ${path} must be a non-empty array.`);
        if (ui.optionLabels !== undefined && !Array.isArray(ui.optionLabels))
            throw new Error(`Schema option labels for ${path} must be an array.`);
        for (const keyword of ["unit", "page", "section", "card", "group", "keywords"])
            if (ui[keyword] !== undefined && typeof ui[keyword] !== "string")
                throw new Error(`Schema UI ${keyword} for ${path} must be a string.`);
        const dependsOn = ui.dependsOn === undefined ? [] : [].concat(ui.dependsOn);
        if (dependsOn.some(dependency => typeof dependency !== "string"))
            throw new Error(`Schema dependsOn for ${path} must be a path or a list of paths.`);
        for (const keyword of ["minimum", "maximum", "minLength", "maxLength"])
            if (specification[keyword] !== undefined && typeof specification[keyword] !== "number")
                throw new Error(`Schema ${keyword} for ${path} must be numeric.`);
        for (const keyword of ["step", "decimals", "order", "displayScale"])
            if (ui[keyword] !== undefined && typeof ui[keyword] !== "number")
                throw new Error(`Schema UI ${keyword} for ${path} must be numeric.`);

        const setting = {
            path: path,
            category: categoryId,
            type: specification.type,
            format: String(specification.format || ""),
            title: String(specification.title || key),
            description: String(specification.description || ""),
            defaultValue: clone(specification.default),
            minimum: specification.minimum === undefined ? null : Number(specification.minimum),
            maximum: specification.maximum === undefined ? null : Number(specification.maximum),
            minimumLength: specification.minLength === undefined ? null : Number(specification.minLength),
            maximumLength: specification.maxLength === undefined ? null : Number(specification.maxLength),
            pattern: specification.pattern === undefined ? "" : String(specification.pattern),
            step: ui.step === undefined ? 1 : Number(ui.step),
            decimals: ui.decimals === undefined ? 0 : Number(ui.decimals),
            unit: ui.unit ?? "",
            displayScale: ui.displayScale ?? 1,
            page: ui.page ?? "",
            section: ui.section ?? "",
            card: ui.card ?? "",
            group: ui.group ?? "",
            keywords: ui.keywords ?? "",
            dependsOn: dependsOn,
            order: ui.order === undefined ? 0 : Number(ui.order),
            control: inferControl(specification, ui),
            enumValues: Array.isArray(specification.enum) ? clone(specification.enum) : [],
            optionLabels: Array.isArray(ui.optionLabels) ? clone(ui.optionLabels) : []
        };

        const supportedTypes = ["boolean", "integer", "number", "string"];
        const supportedControls = ["boolean", "color", "enum", "font", "number", "string"];
        if (supportedTypes.indexOf(setting.type) < 0)
            throw new Error(`Schema type for ${path} is not supported.`);
        if (supportedControls.indexOf(setting.control) < 0)
            throw new Error(`Schema control for ${path} is not supported.`);
        if (setting.control === "boolean" && setting.type !== "boolean")
            throw new Error(`Schema boolean control for ${path} requires a boolean.`);
        if (setting.control === "number" && setting.type !== "number" && setting.type !== "integer")
            throw new Error(`Schema number control for ${path} requires a number.`);
        if ((setting.control === "string" || setting.control === "font") && setting.type !== "string")
            throw new Error(`Schema string control for ${path} requires a string.`);
        if (setting.control === "color" && setting.type !== "string")
            throw new Error(`Schema color control for ${path} requires a string.`);
        if (setting.control === "color" && setting.format !== "color")
            throw new Error(`Schema color control for ${path} requires color format.`);
        if (setting.format === "color" && setting.control !== "color")
            throw new Error(`Schema color format for ${path} requires a color control.`);
        if (!isFinite(setting.order))
            throw new Error(`Schema order for ${path} must be finite.`);
        if (!isFinite(setting.step) || setting.step <= 0)
            throw new Error(`Schema step for ${path} must be positive.`);
        if (!isFinite(setting.displayScale) || setting.displayScale <= 0)
            throw new Error(`Schema displayScale for ${path} must be positive.`);
        if (!isCount(setting.decimals))
            throw new Error(`Schema decimals for ${path} must be a non-negative integer.`);
        if (setting.type === "number" || setting.type === "integer") {
            const minimum = setting.minimum;
            const maximum = setting.maximum;
            const bounded = [minimum, maximum].every(value => value !== null && isFinite(value));
            if (!bounded || minimum > maximum)
                throw new Error(`Schema range for ${path} is invalid.`);
            if (setting.type === "integer" && ![minimum, maximum, setting.step].every(value => isWholeNumber(value)))
                throw new Error(`Schema integer range for ${path} must use integers.`);
        }
        if (setting.minimumLength !== null && !isCount(setting.minimumLength))
            throw new Error(`Schema minLength for ${path} is invalid.`);
        if (setting.maximumLength !== null && !isCount(setting.maximumLength))
            throw new Error(`Schema maxLength for ${path} is invalid.`);
        const hasLengthRange = setting.minimumLength !== null && setting.maximumLength !== null;
        if (hasLengthRange && setting.minimumLength > setting.maximumLength)
            throw new Error(`Schema string length range for ${path} is invalid.`);
        if (setting.control === "enum" && setting.enumValues.length === 0)
            throw new Error(`Schema enum control for ${path} has no options.`);
        if (setting.control !== "enum" && setting.enumValues.length > 0)
            throw new Error(`Schema enum for ${path} requires an enum control.`);
        for (let index = 0; index < setting.enumValues.length; index++) {
            if (!validateValue(setting, setting.enumValues[index]))
                throw new Error(`Schema enum option for ${path} is invalid.`);
            if (setting.enumValues.indexOf(setting.enumValues[index]) !== index)
                throw new Error(`Schema enum options for ${path} must be unique.`);
        }
        if (setting.optionLabels.length > 0 && setting.optionLabels.length !== setting.enumValues.length)
            throw new Error(`Schema option labels for ${path} do not match its enum.`);
        if (!validateValue(setting, setting.defaultValue))
            throw new Error(`Schema default for ${path} is invalid.`);

        output.push(setting);
        map[path] = setting;
    }
}

// The settings window pages in `ui`, each with its sections. Throws unless every
// visible setting is placed on one of them and every dependency is a boolean setting.
function collectPages(ui, visibleSettings, map) {
    const definitions = ui?.pages;
    if (!Array.isArray(definitions) || definitions.length === 0)
        throw new Error("Schema x-ui.pages must list the settings pages.");

    const result = [];
    for (const page of definitions) {
        if (!isTable(page) || typeof page.id !== "string" || typeof page.title !== "string")
            throw new Error("Schema pages need a string id and title.");
        if (!Array.isArray(page.sections) || page.sections.length === 0)
            throw new Error(`Schema page ${page.id} must list sections.`);
        const sections = page.sections.map(section => {
            if (!isTable(section) || typeof section.id !== "string" || typeof section.title !== "string")
                throw new Error(`Schema sections of page ${page.id} need a string id and title.`);
            return {
                id: section.id,
                title: section.title,
                layout: String(section.layout ?? "rows")
            };
        });
        result.push({
            id: page.id,
            title: page.title,
            icon: String(page.icon ?? ""),
            sections: sections
        });
    }

    for (const setting of visibleSettings) {
        const page = result.find(candidate => candidate.id === setting.page);
        if (!page || !page.sections.some(section => section.id === setting.section))
            throw new Error(`Schema setting ${setting.path} is not placed on a known page and section.`);
        for (const dependency of setting.dependsOn)
            if (map[dependency]?.type !== "boolean")
                throw new Error(`Schema dependency ${dependency} of ${setting.path} must be a boolean setting.`);
    }
    return result;
}

// `document` at `targetVersion`. There are no migrations, so any other version
// is an error.
function migrateDocument(document, targetVersion) {
    const next = clone(document);
    const version = next.version;

    if (!isPositiveInteger(version))
        throw new Error("Config version must be a positive integer.");
    if (version > targetVersion)
        throw new Error(`Config version ${version} is newer than supported version ${targetVersion}.`);
    if (version < targetVersion)
        throw new Error(`No migration from config version ${version} is available.`);

    next.version = targetVersion;
    return next;
}

// `source` migrated to `version` and checked against `settings`, as
// { document, overrides, error }. `overrides` is the document without its version.
function checkedDocument(source, version, settings) {
    try {
        const document = migrateDocument(source, version);
        const overrides = clone(document);
        delete overrides.version;
        return {
            document,
            overrides,
            error: validateOverridesFor(overrides, settings)
        };
    } catch (error) {
        return {
            document: null,
            overrides: null,
            error: String(error)
        };
    }
}

// Appends `text` as `#` comment lines wrapped at commentWidth, keeping its line breaks.
function appendComment(lines, text) {
    for (const paragraph of String(text || "").split("\n")) {
        const words = paragraph.trim().split(/\s+/).filter(word => word !== "");
        if (words.length === 0) {
            lines.push("#");
            continue;
        }

        let line = "#";
        for (const word of words) {
            if (line.length > 1 && line.length + word.length + 1 > commentWidth) {
                lines.push(line);
                line = "# " + word;
            } else {
                line += " " + word;
            }
        }
        lines.push(line);
    }
}

// The schema in `source` as { version, categories, pages, settings, map }.
// Throws on the first problem. The debug category is kept only for debug builds.
function parseSchema(source, debugMode) {
    const document = JSON.parse(source);
    if (!document || document.type !== "object" || !isTable(document.properties))
        throw new Error("Schema root must be an object with properties.");

    if (!Object.prototype.hasOwnProperty.call(document, "x-config-version"))
        throw new Error("Schema must declare x-config-version.");
    const version = document["x-config-version"];
    if (!isPositiveInteger(version))
        throw new Error("Schema version must be a positive integer.");

    const versionSpec = document.properties.version;
    const pinned = versionSpec && versionSpec.const === version && versionSpec.default === version;
    const required = Array.isArray(document.required) && document.required.indexOf("version") >= 0;
    if (!pinned || versionSpec.type !== "integer" || !required)
        throw new Error("Schema version property does not match x-config-version.");

    const nextCategories = [];
    const nextSettings = [];
    const nextMap = {};

    for (const categoryId of Object.keys(document.properties)) {
        if (categoryId === "version")
            continue;
        if (categoryId === "debug" && !debugMode)
            continue;
        if (!safeKey.test(categoryId))
            throw new Error(`Schema category ${categoryId} has an invalid key.`);

        const category = document.properties[categoryId];
        if (!category || category.type !== "object" || !isTable(category.properties))
            throw new Error(`Schema category ${categoryId} must be an object.`);
        if (Object.keys(category.properties).length === 0)
            throw new Error(`Schema category ${categoryId} must contain settings.`);

        const ui = category["x-ui"] === undefined ? {} : category["x-ui"];
        if (!isTable(ui))
            throw new Error(`Schema UI metadata for ${categoryId} must be an object.`);
        if (ui.order !== undefined && typeof ui.order !== "number")
            throw new Error(`Schema order for ${categoryId} must be numeric.`);
        const order = ui.order === undefined ? 0 : ui.order;
        if (!isFinite(order))
            throw new Error(`Schema order for ${categoryId} must be finite.`);

        nextCategories.push({
            id: categoryId,
            title: String(category.title || categoryId),
            description: String(category.description || ""),
            order: order,
            hidden: ui.hidden === true
        });
        collectSettings(category.properties, categoryId, categoryId, nextSettings, nextMap);
    }

    nextCategories.sort((left, right) => left.order - right.order);
    nextSettings.sort((left, right) => {
        const leftCategory = nextCategories.findIndex(entry => entry.id === left.category);
        const rightCategory = nextCategories.findIndex(entry => entry.id === right.category);
        return leftCategory === rightCategory ? left.order - right.order : leftCategory - rightCategory;
    });

    const hiddenCategories = nextCategories.filter(category => category.hidden).map(category => category.id);
    const visibleSettings = nextSettings.filter(setting => hiddenCategories.indexOf(setting.category) < 0);
    const nextPages = collectPages(document["x-ui"], visibleSettings, nextMap);

    return {
        version: version,
        categories: nextCategories,
        pages: nextPages,
        settings: nextSettings,
        map: nextMap
    };
}

// Every setting at its configured or default value, with unknown keys kept.
function canonicalDocument(overrides, settings, version) {
    const document = clone(overrides || {});
    document.version = version;
    for (const setting of settings) {
        const configured = lookup(overrides, setting.path);
        const valid = configured.found && validateValue(setting, configured.value);
        assign(document, setting.path, clone(valid ? configured.value : setting.defaultValue));
    }
    return document;
}

// The canonical TOML file: settings in schema order with their descriptions.
function serializedDocument(overrides, settings, categories, version) {
    const document = canonicalDocument(overrides, settings, version);
    const lines = [];
    appendComment(lines, "Minishell configuration.");
    appendComment(lines, "Defaults, validation, and descriptions are defined by config/schema.json.");
    lines.push("");
    lines.push(`version = ${Toml.formatValue(document.version)}`);

    const rootValues = Object.keys(document).filter(key => key !== "version" && !isTable(document[key])).sort();
    for (const key of rootValues)
        lines.push(`${Toml.formatKey(key)} = ${Toml.formatValue(document[key])}`);

    const settingsByTable = {};
    const orderedTablePaths = [];
    const seenTables = {};
    for (const setting of settings) {
        const parts = setting.path.split(".");
        const tablePath = parts.slice(0, -1);
        const identifier = JSON.stringify(tablePath);
        if (!settingsByTable[identifier])
            settingsByTable[identifier] = [];
        settingsByTable[identifier].push(setting);
        if (!seenTables[identifier]) {
            seenTables[identifier] = true;
            orderedTablePaths.push(tablePath);
        }
    }

    const discoveredPaths = [];
    collectTablePaths(document, [], discoveredPaths);
    discoveredPaths.sort((left, right) => {
        const leftName = JSON.stringify(left);
        const rightName = JSON.stringify(right);
        return leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
    });
    for (const tablePath of discoveredPaths) {
        const identifier = JSON.stringify(tablePath);
        if (!seenTables[identifier]) {
            seenTables[identifier] = true;
            orderedTablePaths.push(tablePath);
        }
    }

    for (const tablePath of orderedTablePaths) {
        if (tablePath.length === 0)
            continue;
        const table = lookupParts(document, tablePath);
        if (!isTable(table))
            continue;

        lines.push("");
        if (tablePath.length === 1) {
            const category = categories.find(entry => entry.id === tablePath[0]);
            if (category) {
                appendComment(lines, category.title);
                if (category.description !== "")
                    appendComment(lines, category.description);
            }
        }
        lines.push(`[${tablePath.map(part => Toml.formatKey(part)).join(".")}]`);

        const identifier = JSON.stringify(tablePath);
        const tableSettings = settingsByTable[identifier] || [];
        const knownKeys = new Set();
        let wroteValue = false;
        for (const setting of tableSettings) {
            const key = setting.path.split(".").pop();
            knownKeys.add(key);
            if (wroteValue)
                lines.push("");
            appendComment(lines, setting.title);
            if (setting.description !== "")
                appendComment(lines, setting.description);
            lines.push(`${Toml.formatKey(key)} = ${Toml.formatValue(table[key])}`);
            wroteValue = true;
        }

        const isExtraValue = key => !knownKeys.has(key) && !isTable(table[key]);
        const additionalKeys = Object.keys(table).filter(isExtraValue).sort();
        for (const key of additionalKeys) {
            if (wroteValue)
                lines.push("");
            lines.push(`${Toml.formatKey(key)} = ${Toml.formatValue(table[key])}`);
            wroteValue = true;
        }
    }

    return lines.join("\n") + "\n";
}
