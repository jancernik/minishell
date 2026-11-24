import QtQuick
import QtTest
import "../services/ConfigLogic.js" as ConfigLogic
import "../services/Toml.js" as Toml

TestCase {
    name: "ConfigLogic"

    function readSchema(): string {
        const request = new XMLHttpRequest();
        request.open("GET", Qt.resolvedUrl("../config/schema.json"), false);
        request.send();
        return request.responseText;
    }

    function setting(overrides) {
        return Object.assign({
            path: "a.b",
            type: "integer",
            format: "",
            enumValues: [],
            minimum: 0,
            maximum: 10,
            minimumLength: null,
            maximumLength: null,
            pattern: ""
        }, overrides ?? {});
    }

    function schemaWith(specification) {
        return JSON.stringify({
            type: "object",
            "x-config-version": 1,
            required: ["version"],
            "x-ui": {
                pages: [
                    {
                        id: "p",
                        title: "P",
                        sections: [
                            {
                                id: "s",
                                title: "S"
                            }
                        ]
                    }
                ]
            },
            properties: {
                version: {
                    type: "integer",
                    const: 1,
                    default: 1
                },
                cat: {
                    type: "object",
                    properties: {
                        value: Object.assign({
                            "x-ui": {
                                page: "p",
                                section: "s"
                            }
                        }, specification)
                    }
                }
            }
        });
    }

    function test_realSchemaParses() {
        const schema = ConfigLogic.parseSchema(readSchema(), false);
        compare(schema.version, 1);
        verify(schema.settings.length > 50, schema.settings.length);
        verify(schema.pages.length > 0);
        verify(!schema.categories.some(category => category.id === "debug"));
        for (const entry of schema.settings) {
            verify(ConfigLogic.validateValue(entry, entry.defaultValue), entry.path);
            compare(schema.map[entry.path], entry);
        }
        const debug = ConfigLogic.parseSchema(readSchema(), true);
        verify(debug.categories.some(category => category.id === "debug"));
    }

    function test_defaultsRoundTripThroughToml() {
        const schema = ConfigLogic.parseSchema(readSchema(), false);
        const text = ConfigLogic.serializedDocument({}, schema.settings, schema.categories, schema.version);
        verify(text.startsWith("# Minishell configuration."));
        const checked = ConfigLogic.checkedDocument(Toml.parse(text), schema.version, schema.settings);
        compare(checked.error, "");
        compare(checked.document, ConfigLogic.canonicalDocument({}, schema.settings, schema.version));
        const settings = schema.settings;
        const again = ConfigLogic.serializedDocument(checked.overrides, settings, schema.categories, schema.version);
        compare(again, text);
    }

    function test_serializationKeepsUnknownKeysAndOverrides() {
        const schema = ConfigLogic.parseSchema(readSchema(), false);
        const overrides = {
            ui: {
                radius: 4,
                extra: "kept"
            },
            custom: {
                nested: {
                    flag: true
                }
            }
        };
        const text = ConfigLogic.serializedDocument(overrides, schema.settings, schema.categories, schema.version);
        const parsed = Toml.parse(text);
        compare(parsed.ui.radius, 4);
        compare(parsed.ui.extra, "kept");
        compare(parsed.custom.nested.flag, true);
    }

    function test_valuesMustFitTheirSetting() {
        verify(ConfigLogic.validateValue(setting(), 5));
        verify(!ConfigLogic.validateValue(setting(), 5.5));
        verify(!ConfigLogic.validateValue(setting(), 11));
        verify(!ConfigLogic.validateValue(setting(), "5"));
        verify(!ConfigLogic.validateValue(null, 5));
        verify(ConfigLogic.validateValue(setting({
            type: "number"
        }), 5.5));
        verify(!ConfigLogic.validateValue(setting({
            type: "number"
        }), Infinity));
        const color = setting({
            type: "string",
            format: "color",
            minimum: null,
            maximum: null
        });
        verify(ConfigLogic.validateValue(color, "#a0b1c2"));
        verify(ConfigLogic.validateValue(color, "#a0b1c2ff"));
        verify(!ConfigLogic.validateValue(color, "red"));
        const choice = setting({
            type: "string",
            enumValues: ["a", "b"],
            minimum: null,
            maximum: null
        });
        verify(ConfigLogic.validateValue(choice, "b"));
        verify(!ConfigLogic.validateValue(choice, "c"));
        const patterned = setting({
            type: "string",
            pattern: "^x+$",
            minimum: null,
            maximum: null,
            maximumLength: 3
        });
        verify(ConfigLogic.validateValue(patterned, "xx"));
        verify(!ConfigLogic.validateValue(patterned, "xxxx"));
        verify(!ConfigLogic.validateValue(patterned, "xy"));
    }

    function test_dottedPathEditsCreateAndPruneTables() {
        const object = {};
        ConfigLogic.assign(object, "a.b.c", 1);
        ConfigLogic.assign(object, "a.d", 2);
        compare(ConfigLogic.lookup(object, "a.b.c"), {
            found: true,
            value: 1
        });
        compare(ConfigLogic.lookup(object, "a.x").found, false);
        ConfigLogic.remove(object, "a.b.c");
        compare(object, {
            a: {
                d: 2
            }
        });
        ConfigLogic.remove(object, "a.d");
        compare(object, {});
        ConfigLogic.remove(object, "missing.path");
        compare(object, {});
    }

    function test_invalidOverridesNameTheirPath() {
        const settings = [setting()];
        compare(ConfigLogic.validateOverridesFor({
            a: {
                b: 3
            }
        }, settings), "");
        compare(ConfigLogic.validateOverridesFor({
            a: {
                b: 30
            }
        }, settings), "Invalid value for a.b.");
        compare(ConfigLogic.validateOverridesFor({
            a: 1
        }, settings), "Invalid object for a.");
        compare(ConfigLogic.validateOverridesFor([], settings), "The configuration root must be a TOML table.");
    }

    function test_onlyTheCurrentConfigVersionLoads() {
        compare(ConfigLogic.migrateDocument({
            version: 1,
            a: 1
        }, 1), {
            version: 1,
            a: 1
        });
        const newer = ConfigLogic.checkedDocument({
            version: 2
        }, 1, []);
        verify(newer.error.includes("newer than supported"), newer.error);
        const older = ConfigLogic.checkedDocument({
            version: 1
        }, 2, []);
        verify(older.error.includes("No migration"), older.error);
        verify(ConfigLogic.checkedDocument({
            version: 0
        }, 1, []).error.includes("positive integer"));
    }

    function test_invalidSchemasAreRejected_data() {
        return [
            {
                tag: "no default",
                specification: {
                    type: "integer",
                    minimum: 0,
                    maximum: 1
                },
                message: "has no default"
            },
            {
                tag: "inverted range",
                specification: {
                    type: "integer",
                    default: 0,
                    minimum: 5,
                    maximum: 1
                },
                message: "range"
            },
            {
                tag: "invalid default",
                specification: {
                    type: "integer",
                    default: 9,
                    minimum: 0,
                    maximum: 1
                },
                message: "default"
            },
            {
                tag: "color without format",
                specification: {
                    type: "string",
                    default: "#000000",
                    "x-ui": {
                        page: "p",
                        section: "s",
                        control: "color"
                    }
                },
                message: "color format"
            },
            {
                tag: "unplaced",
                specification: {
                    type: "boolean",
                    default: true,
                    "x-ui": {
                        page: "nowhere",
                        section: "s"
                    }
                },
                message: "not placed"
            }
        ];
    }

    function test_invalidSchemasAreRejected(data) {
        let message = "";
        try {
            ConfigLogic.parseSchema(schemaWith(data.specification), false);
        } catch (error) {
            message = String(error);
        }
        verify(message.includes(data.message), message);
    }

    function test_commentsWrapAt88() {
        const lines = [];
        ConfigLogic.appendComment(lines, "word ".repeat(40) + "\n\nnext");
        verify(lines.every(line => line.length <= 88), JSON.stringify(lines));
        verify(lines.includes("#"));
        compare(lines[lines.length - 1], "# next");
    }
}
