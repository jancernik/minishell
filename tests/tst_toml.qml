import QtQuick
import QtTest
import "../services/Toml.js" as Toml

TestCase {
    name: "Toml"

    function parseError(source) {
        try {
            Toml.parse(source);
        } catch (error) {
            return String(error);
        }
        return "";
    }

    function test_quotedTableKeyContainingBracket() {
        const document = Toml.parse('["theme]palette"]\nvalue = 7\n');
        compare(document["theme]palette"].value, 7);
    }

    function test_specialPropertyNamesSurvive() {
        const document = Toml.parse('["__proto__"]\nvalue = 1\n[extras]\n"__proto__" = "kept"\n');
        verify(Object.prototype.hasOwnProperty.call(document, "__proto__"));
        compare(document["__proto__"].value, 1);
        verify(Object.prototype.hasOwnProperty.call(document.extras, "__proto__"));
        compare(document.extras["__proto__"], "kept");
        compare(JSON.parse(JSON.stringify(document))["__proto__"].value, 1);
    }

    function test_overflowingRadixNumbersAreRejected() {
        for (const [prefix, digit, count] of [["0x", "f", 300], ["0o", "7", 400], ["0b", "1", 1200]]) {
            const error = parseError(`large = ${prefix}${digit.repeat(count)}\n`);
            verify(error.includes("number must be finite."), error);
        }
    }
}
