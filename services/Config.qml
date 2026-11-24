pragma Singleton

import QtQuick
import Quickshell
import Quickshell.Io
import "ConfigLogic.js" as ConfigLogic
import "Toml.js" as Toml

// Loads the settings in $XDG_CONFIG_HOME/minishell/config.toml and checks them
// against config/schema.json. Both files are watched, so outside edits apply at
// once. An invalid file keeps the last good values and reports the error. Edits
// from the settings window are saved after a short delay, as a full file with
// every setting and its description.
Singleton {
    id: root

    readonly property string schemaPath: Quickshell.shellDir + "/config/schema.json"
    readonly property string userConfigHome: {
        const xdg = String(Quickshell.env("XDG_CONFIG_HOME") ?? "");
        return xdg.startsWith("/") ? xdg : String(Quickshell.env("HOME")) + "/.config";
    }
    readonly property string userConfigDirectory: userConfigHome + "/minishell"
    readonly property string userConfigPath: userConfigDirectory + "/config.toml"

    property int schemaVersion: 1
    property int configVersion: 1
    property int revision: 0
    property int schemaRevision: 0
    property bool applyingValues: false
    property int applicationGeneration: 0
    property var overrides: ({})
    property var settings: []
    property var categories: []
    // Settings window pages from the schema's x-ui.pages, each with its sections.
    property var pages: []
    property var settingMap: ({})
    property var pendingSchema: null

    // Set in debug builds (MINISHELL_DEBUG=1), which load the debug module and its
    // settings. The variable is fixed for the process lifetime, so this never changes.
    readonly property bool debugMode: String(Quickshell.env("MINISHELL_DEBUG") ?? "") === "1"
    // Set for a second instance beside the session's shell, such as a live test.
    // It registers no global shortcuts and never takes the notification server.
    readonly property bool isolated: String(Quickshell.env("MINISHELL_ISOLATED") ?? "") === "1"

    property bool schemaReady: false
    property bool directoryReady: false
    property bool configReady: false
    property bool configValid: true
    property bool dirty: false
    property bool saving: false
    property bool saveQueued: false
    property bool creatingFile: false
    property bool initializePending: false
    property bool retryReloading: false
    property int retryGeneration: 0
    property string retryText: ""
    property string retryBaseText: ""
    property string lastLoadedText: ""
    property string writeText: ""

    property string schemaError: ""
    property string configError: ""
    property string saveError: ""

    readonly property string errorMessage: configError || saveError || schemaError
    readonly property bool canEdit: schemaReady && directoryReady && configReady && configValid && configError === ""
    // An invalid config blocks saving until a load succeeds. A queued save resumes then.
    onConfigValidChanged: {
        if (root.configValid && (root.dirty || root.saveQueued))
            saveTimer.restart();
    }

    function beginValueApplication(): void {
        root.applyingValues = true;
        const generation = ++root.applicationGeneration;
        Qt.callLater(() => {
            if (root.applicationGeneration === generation)
                root.applyingValues = false;
        });
    }

    // Bindings that call this re-evaluate when the values or the schema change.
    function value(path: string, fallback: var): var {
        void root.revision;
        void root.schemaRevision;

        const setting = root.settingMap[path];
        const configured = ConfigLogic.lookup(root.overrides, path);
        if (configured.found && ConfigLogic.validateValue(setting, configured.value))
            return configured.value;
        if (setting)
            return ConfigLogic.clone(setting.defaultValue);
        return fallback;
    }

    function boolValue(path: string, fallback: bool): bool {
        const result = root.value(path, fallback);
        return typeof result === "boolean" ? result : fallback;
    }

    function intValue(path: string, fallback: int): int {
        const result = root.value(path, fallback);
        return typeof result === "number" && isFinite(result) ? Math.round(result) : fallback;
    }

    function realValue(path: string, fallback: real): real {
        const result = root.value(path, fallback);
        return typeof result === "number" && isFinite(result) ? result : fallback;
    }

    function stringValue(path: string, fallback: string): string {
        const result = root.value(path, fallback);
        return typeof result === "string" ? result : fallback;
    }

    function hasOverride(path: string): bool {
        void root.revision;
        const setting = root.settingMap[path];
        const configured = ConfigLogic.lookup(root.overrides, path);
        return configured.found && setting && !ConfigLogic.equal(configured.value, setting.defaultValue);
    }

    function activateSchema(candidate: var): void {
        root.beginValueApplication();
        root.schemaVersion = candidate.version;
        root.categories = candidate.categories;
        root.pages = candidate.pages;
        root.settings = candidate.settings;
        root.settingMap = candidate.map;
        root.pendingSchema = null;
        root.schemaReady = true;
        root.schemaError = "";
        root.schemaRevision++;
        root.revision++;
        if (root.initializePending && root.directoryReady) {
            root.initializePending = false;
            root.initializeUserFile();
        }
    }

    function tryActivatePendingSchema(values: var, version: int): bool {
        if (!root.pendingSchema)
            return false;

        const validationError = ConfigLogic.schemaCompatibilityError(root.pendingSchema, values, version);
        if (validationError !== "") {
            root.schemaError = `Schema is waiting for compatible config: ${validationError}`;
            return false;
        }

        root.activateSchema(root.pendingSchema);
        return true;
    }

    function applyOverrides(next: var): void {
        root.beginValueApplication();
        root.overrides = next;
        root.tryActivatePendingSchema(next, root.configVersion);
        root.revision++;
        root.scheduleSave();
    }

    function setValue(path: string, value: var): bool {
        const setting = root.settingMap[path];
        if (!root.canEdit || !ConfigLogic.validateValue(setting, value))
            return false;

        const next = ConfigLogic.clone(root.overrides);
        if (ConfigLogic.equal(value, setting.defaultValue))
            ConfigLogic.remove(next, path);
        else
            ConfigLogic.assign(next, path, value);

        if (ConfigLogic.equal(next, root.overrides)) {
            if (root.saveError !== "")
                root.retrySave();
            return true;
        }

        root.applyOverrides(next);
        return true;
    }

    function resetValue(path: string): void {
        if (!root.canEdit || !root.hasOverride(path))
            return;

        const next = ConfigLogic.clone(root.overrides);
        ConfigLogic.remove(next, path);
        root.applyOverrides(next);
    }

    function loadSchema(source: string): void {
        try {
            const candidate = ConfigLogic.parseSchema(source, root.debugMode);

            if (root.schemaReady && root.configReady) {
                if (!root.configValid) {
                    root.pendingSchema = candidate;
                    root.schemaError = "Schema is waiting for a valid config file.";
                    return;
                }

                const validationError = root.compatibilityError(candidate);
                if (validationError !== "") {
                    root.pendingSchema = candidate;
                    root.schemaError = `Schema is waiting for compatible config: ${validationError}`;
                    return;
                }
            }

            root.activateSchema(candidate);
            if (root.configReady && root.configValid) {
                const validationError = root.compatibilityError(candidate);
                root.configValid = validationError === "";
                root.configError = validationError === "" ? "" : `Config error: ${validationError}`;
            }
        } catch (error) {
            root.pendingSchema = null;
            root.schemaError = `Schema error: ${error}`;
        }
    }

    function loadUserDocument(source: string): void {
        try {
            const parsed = Toml.parse(source);
            if (!ConfigLogic.isTable(parsed))
                throw new Error("Configuration must be a TOML table.");

            const active = ConfigLogic.checkedDocument(parsed, root.schemaVersion, root.settings);
            const candidate = root.pendingSchema;
            const pending = candidate ? root.checkedFor(parsed, candidate) : null;
            const activatePending = candidate && pending.error === "";
            if (!activatePending && active.error !== "")
                throw new Error(active.error);

            const selected = activatePending ? pending : active;
            root.beginValueApplication();
            root.overrides = selected.overrides;
            root.configVersion = selected.document.version;
            if (activatePending)
                root.activateSchema(candidate);
            else if (candidate)
                root.schemaError = `Schema is waiting for compatible config: ${pending.error}`;

            saveTimer.stop();
            root.dirty = false;
            root.saveQueued = false;
            root.configReady = true;
            root.configValid = true;
            root.configError = "";
            root.saveError = "";
            root.lastLoadedText = source;
            root.revision++;
        } catch (error) {
            root.configValid = false;
            root.configError = `Config error: ${error}`;
        }
    }

    // The first problem the current values have with `candidate`, or "".
    function compatibilityError(candidate: var): string {
        return ConfigLogic.schemaCompatibilityError(candidate, root.overrides, root.configVersion);
    }

    function checkedFor(document: var, schema: var): var {
        return ConfigLogic.checkedDocument(document, schema.version, schema.settings);
    }

    function serializedDocument(): string {
        return ConfigLogic.serializedDocument(root.overrides, root.settings, root.categories, root.schemaVersion);
    }

    function initializeUserFile(): void {
        if (root.creatingFile)
            return;
        if (!root.schemaReady) {
            root.initializePending = true;
            return;
        }

        root.initializePending = false;
        root.creatingFile = true;
        root.beginValueApplication();
        root.overrides = {};
        root.configVersion = root.pendingSchema ? root.pendingSchema.version : root.schemaVersion;
        root.tryActivatePendingSchema(root.overrides, root.configVersion);
        saveTimer.stop();
        root.dirty = false;
        root.saveQueued = false;
        root.configReady = true;
        root.configValid = true;
        root.configError = "";
        root.revision++;
        root.write(root.serializedDocument());
    }

    // Writes `text` to the config file. userFile reports the result with onSaved or onSaveFailed.
    function write(text: string): void {
        root.dirty = false;
        root.saving = true;
        root.saveQueued = false;
        root.writeText = text;
        saveWatchdog.restart();
        userFile.setText(text);
    }

    function scheduleSave(): void {
        root.dirty = true;
        root.saveError = "";
        if (root.saving)
            root.saveQueued = true;
        else
            saveTimer.restart();
    }

    function retrySave(): void {
        if (!root.dirty || root.saving || root.retryReloading || !root.directoryReady || !root.configValid)
            return;

        saveTimer.stop();
        root.saveError = "";
        root.retryText = root.serializedDocument();
        root.retryBaseText = root.lastLoadedText;
        root.retryReloading = true;
        root.retryGeneration++;
        retryWatchdog.restart();
        userFile.reload();
    }

    function flushSave(): void {
        // A queued save resumes when the directory is created, the config
        // becomes valid again, or the current write succeeds.
        if (!root.directoryReady || !root.configValid || root.saving) {
            root.saveQueued = true;
            return;
        }

        root.write(root.serializedDocument());
    }

    function endRetry(): void {
        retryWatchdog.stop();
        root.retryReloading = false;
        root.retryText = "";
        root.retryBaseText = "";
    }

    function finishRetryReload(diskText: string): void {
        if (!root.retryReloading)
            return;

        const pendingText = root.retryText;
        const baseText = root.retryBaseText;
        root.endRetry();

        if (diskText === pendingText) {
            root.lastLoadedText = diskText;
            root.dirty = false;
            root.saveError = "";
            return;
        }

        if (diskText !== baseText) {
            root.loadUserDocument(diskText);
            return;
        }

        root.write(pendingText);
    }

    FileView {
        id: schemaFile

        path: root.schemaPath
        blockLoading: true
        watchChanges: true
        onFileChanged: reload()
        onTextChanged: root.loadSchema(text())
        onLoadFailed: error => {
            root.pendingSchema = null;
            root.schemaError = `Could not load schema: ${FileViewError.toString(error)}`;
        }
        Component.onCompleted: root.loadSchema(text())
    }

    FileView {
        id: userFile

        path: root.directoryReady ? root.userConfigPath : ""
        blockLoading: true
        blockWrites: true
        atomicWrites: true
        printErrors: false
        watchChanges: true

        onFileChanged: reload()
        onTextChanged: {
            if (!root.directoryReady)
                return;
            if (root.retryReloading) {
                root.finishRetryReload(text());
                return;
            }
            if (root.saving && root.writeText !== "" && text() === root.writeText)
                return;
            if (root.dirty && root.configValid && text() === root.lastLoadedText)
                return;
            root.loadUserDocument(text());
        }
        onLoaded: {
            if (!root.retryReloading)
                return;
            const generation = root.retryGeneration;
            Qt.callLater(() => {
                if (root.retryReloading && root.retryGeneration === generation)
                    root.finishRetryReload(userFile.text());
            });
        }
        onLoadFailed: error => {
            if (root.retryReloading) {
                const pendingText = root.retryText;
                root.endRetry();
                if (error === FileViewError.FileNotFound) {
                    root.write(pendingText);
                } else {
                    root.dirty = true;
                    root.saveError = `Could not retry config save: ${FileViewError.toString(error)}`;
                }
            } else if (error === FileViewError.FileNotFound) {
                root.initializeUserFile();
            } else {
                root.configValid = false;
                root.configError = `Could not load config: ${FileViewError.toString(error)}`;
            }
        }
        onSaved: {
            saveWatchdog.stop();
            root.saving = false;
            root.creatingFile = false;
            root.saveError = "";
            if (root.writeText !== "")
                root.lastLoadedText = root.writeText;
            root.writeText = "";
            if (root.dirty || root.saveQueued)
                saveTimer.restart();
        }
        onSaveFailed: error => {
            saveWatchdog.stop();
            root.saving = false;
            root.creatingFile = false;
            root.writeText = "";
            root.dirty = true;
            root.saveError = `Could not save config: ${FileViewError.toString(error)}`;
        }
    }

    Process {
        id: ensureDirectory

        command: ["mkdir", "-p", root.userConfigDirectory]
        running: true
    }

    // Process.exited also passes a QProcess::ExitStatus, which has no QML type
    // information. A typed handler that takes only the exit code lints cleanly.
    Connections {
        target: ensureDirectory

        function onExited(exitCode: int): void {
            if (exitCode === 0) {
                root.directoryReady = true;
                if (root.dirty || root.saveQueued)
                    saveTimer.restart();
            } else {
                root.configValid = false;
                root.configError = `Could not create ${root.userConfigDirectory}.`;
            }
        }
    }

    Timer {
        id: saveTimer

        interval: 250
        repeat: false
        onTriggered: root.flushSave()
    }

    // A write that never reports back would leave `saving` set, and every
    // later save would queue behind it without an error.
    Timer {
        id: saveWatchdog

        interval: 4000
        repeat: false
        onTriggered: {
            if (!root.saving)
                return;

            root.saving = false;
            root.writeText = "";
            root.dirty = true;
            root.saveError = "Saving the config did not complete; retrying.";
            saveTimer.restart();
        }
    }

    // A reload that never reports back would leave `retryReloading` set, and
    // no failed save could be retried. This reports the failure and waits for
    // the next edit.
    Timer {
        id: retryWatchdog

        interval: 4000
        repeat: false
        onTriggered: {
            if (!root.retryReloading)
                return;

            root.endRetry();
            root.dirty = true;
            root.saveError = "Could not retry config save: timed out.";
        }
    }
}
