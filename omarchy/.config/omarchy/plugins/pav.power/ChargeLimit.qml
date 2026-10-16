import QtQuick
import Quickshell.Io
import qs.Commons
import qs.Ui

Column {
  id: root

  property color foreground: Color.foreground
  property string fontFamily: Style.font.family
  property bool panelOpen: false
  property bool cursorActive: false
  property int selectedIndex: 1
  readonly property var presets: [60, 80, 100]
  property int actual: -1
  property int saved: -1
  property string errorText: ""
  readonly property bool busy: operation.running
  readonly property bool updating: busy && operation.command[2] === "set"
  property int pendingLimit: -1
  signal cursorEntered()

  spacing: Style.space(10)

  function selectCurrent() {
    var index = presets.indexOf(actual)
    selectedIndex = index >= 0 ? index : 1
  }

  function selectByDelta(delta) {
    selectedIndex = (selectedIndex + delta + presets.length) % presets.length
  }

  function activateSelected() {
    setLimit(presets[selectedIndex])
  }

  function refresh() {
    if (busy) return
    operation.command = ["pkexec", "/usr/local/libexec/omarchy-charge-limit", "status"]
    operation.running = true
  }

  function setLimit(limit) {
    if (busy) { pendingLimit = limit; return }
    errorText = ""
    operation.command = ["pkexec", "/usr/local/libexec/omarchy-charge-limit", "set", String(limit)]
    operation.running = true
  }

  function finished(exitCode) {
    try {
      var result = JSON.parse(output.text)
      if (exitCode !== 0 || result.error) throw new Error(result.error || "Charge-limit operation failed")
      if (typeof result.actual !== "number" || result.actual % 1 !== 0 || result.actual < 0 || result.actual > 100)
        throw new Error("Invalid charge-limit response")
      if (result.saved !== null && presets.indexOf(result.saved) < 0)
        throw new Error("Invalid saved charge limit")
      actual = result.actual
      saved = result.saved === null ? -1 : result.saved
      errorText = ""
      if (!cursorActive) selectCurrent()
    } catch (error) {
      actual = -1
      saved = -1
      errorText = output.text.trim().charAt(0) === "{" ? String(error.message) : (errors.text.trim() || "Cannot read charge limit. Check the helper installation.")
    }
    if (pendingLimit >= 0) {
      var next = pendingLimit
      pendingLimit = -1
      setLimit(next)
    }
  }

  onPanelOpenChanged: if (panelOpen) refresh()
  Component.onCompleted: if (panelOpen) refresh()

  Process {
    id: operation
    stdout: StdioCollector { id: output; waitForEnd: true }
    stderr: StdioCollector { id: errors; waitForEnd: true }
    onExited: function(exitCode, exitStatus) { root.finished(exitCode) }
  }

  Timer {
    interval: 5000
    running: root.panelOpen
    repeat: true
    onTriggered: root.refresh()
  }

  PanelSeparator { width: parent.width; foreground: root.foreground }

  PanelSectionHeader {
    text: "CHARGE LIMIT"
    foreground: root.foreground
    fontFamily: root.fontFamily
  }

  Row {
    id: choices
    width: parent.width
    spacing: Style.space(6)

    Repeater {
      model: root.presets
      Button {
        required property int modelData
        required property int index
        width: (choices.width - choices.spacing * (root.presets.length - 1)) / root.presets.length
        text: modelData + "%"
        fontSize: Style.font.bodySmall
        foreground: root.foreground
        fontFamily: root.fontFamily
        bordered: true
        active: root.actual === modelData
        hasCursor: root.cursorActive && root.selectedIndex === index
        enabled: !root.updating
        opacity: enabled ? 1 : 0.5
        verticalPadding: Style.spacing.controlPaddingY + Style.space(2)
        onClicked: root.setLimit(modelData)
        onHovered: function(hovering) {
          if (hovering) {
            root.selectedIndex = index
            root.cursorEntered()
          }
        }
      }
    }
  }

  Text {
    width: parent.width
    textFormat: Text.PlainText
    text: root.errorText !== "" ? root.errorText.slice(0, 240)
      : root.updating ? "Applying charge limit..."
      : root.actual < 0 ? (root.busy ? "Reading charge limit..." : "Charge limit unavailable")
      : root.saved < 0 ? "Current limit: " + root.actual + "%. Choose a limit to save it."
      : root.actual === root.saved ? "Limit " + root.actual + "%. Restored automatically at startup."
      : "Current " + root.actual + "%. Saved " + root.saved + "% for startup."
    wrapMode: Text.WordWrap
    color: root.foreground
    opacity: 0.7
    font.family: root.fontFamily
    font.pixelSize: Style.font.bodySmall
  }
}
