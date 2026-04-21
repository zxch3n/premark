import ApplicationServices
import Foundation

func usage() -> Never {
  fputs("usage: os-input.swift check | keycodes <pid> <key-code>... | hid-keycodes <key-code>... | hid-shortcut <modifiers> <key-code> | hid-click <x> <y> [click-count] | hid-drag <from-x> <from-y> <to-x> <to-y> [steps]\n", stderr)
  exit(2)
}

func modifierFlags(_ raw: String) -> CGEventFlags {
  var flags = CGEventFlags()
  for part in raw.split(separator: ",") {
    switch part.lowercased() {
    case "command", "cmd", "meta":
      flags.insert(.maskCommand)
    case "shift":
      flags.insert(.maskShift)
    case "option", "alt":
      flags.insert(.maskAlternate)
    case "control", "ctrl":
      flags.insert(.maskControl)
    case "", "none":
      continue
    default:
      fputs("unknown modifier: \(part)\n", stderr)
      exit(3)
    }
  }
  return flags
}

func postKey(code: CGKeyCode, flags: CGEventFlags = [], pid: Int32? = nil) {
  let source = CGEventSource(stateID: .hidSystemState)
  guard
    let keyDown = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true),
    let keyUp = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
  else {
    fputs("failed to create CGEvent for key code: \(code)\n", stderr)
    exit(4)
  }
  keyDown.flags = flags
  keyUp.flags = flags
  if let pid {
    keyDown.postToPid(pid)
    usleep(30_000)
    keyUp.postToPid(pid)
  } else {
    keyDown.post(tap: .cghidEventTap)
    usleep(30_000)
    keyUp.post(tap: .cghidEventTap)
  }
}

func parseDouble(_ raw: String, name: String) -> Double {
  guard let value = Double(raw) else {
    fputs("invalid \(name): \(raw)\n", stderr)
    exit(3)
  }
  return value
}

func parseInt(_ raw: String, name: String) -> Int {
  guard let value = Int(raw) else {
    fputs("invalid \(name): \(raw)\n", stderr)
    exit(3)
  }
  return value
}

func postMouse(type: CGEventType, x: Double, y: Double, clickState: Int = 1) {
  let source = CGEventSource(stateID: .hidSystemState)
  guard
    let event = CGEvent(
      mouseEventSource: source,
      mouseType: type,
      mouseCursorPosition: CGPoint(x: x, y: y),
      mouseButton: .left
    )
  else {
    fputs("failed to create mouse event\n", stderr)
    exit(4)
  }
  event.setIntegerValueField(.mouseEventClickState, value: Int64(clickState))
  event.post(tap: .cghidEventTap)
}

func hidClick(x: Double, y: Double, clickCount: Int) {
  postMouse(type: .mouseMoved, x: x, y: y)
  usleep(80_000)
  for clickIndex in 1...max(1, clickCount) {
    postMouse(type: .leftMouseDown, x: x, y: y, clickState: clickIndex)
    usleep(35_000)
    postMouse(type: .leftMouseUp, x: x, y: y, clickState: clickIndex)
    usleep(80_000)
  }
}

func hidDrag(fromX: Double, fromY: Double, toX: Double, toY: Double, steps: Int) {
  let clampedSteps = max(2, steps)
  postMouse(type: .mouseMoved, x: fromX, y: fromY)
  usleep(80_000)
  postMouse(type: .leftMouseDown, x: fromX, y: fromY)
  usleep(80_000)
  for step in 1...clampedSteps {
    let ratio = Double(step) / Double(clampedSteps)
    let x = fromX + (toX - fromX) * ratio
    let y = fromY + (toY - fromY) * ratio
    postMouse(type: .leftMouseDragged, x: x, y: y)
    usleep(35_000)
  }
  postMouse(type: .leftMouseUp, x: toX, y: toY)
}

let args = CommandLine.arguments
guard args.count >= 2 else {
  usage()
}

switch args[1] {
case "check":
  print("ok")
case "keycodes":
  guard args.count >= 4, let pid = Int32(args[2]) else {
    usage()
  }
  for rawCode in args.dropFirst(3) {
    guard let code = CGKeyCode(rawCode) else {
      fputs("invalid key code: \(rawCode)\n", stderr)
      exit(3)
    }
    postKey(code: code, pid: pid)
    usleep(90_000)
  }
case "hid-keycodes":
  guard args.count >= 3 else {
    usage()
  }
  for rawCode in args.dropFirst(2) {
    guard let code = CGKeyCode(rawCode) else {
      fputs("invalid key code: \(rawCode)\n", stderr)
      exit(3)
    }
    postKey(code: code)
    usleep(120_000)
  }
case "hid-shortcut":
  guard args.count == 4, let code = CGKeyCode(args[3]) else {
    usage()
  }
  postKey(code: code, flags: modifierFlags(args[2]))
case "hid-click":
  guard args.count == 4 || args.count == 5 else {
    usage()
  }
  let x = parseDouble(args[2], name: "x")
  let y = parseDouble(args[3], name: "y")
  let clickCount = args.count == 5 ? parseInt(args[4], name: "click-count") : 1
  hidClick(x: x, y: y, clickCount: clickCount)
case "hid-drag":
  guard args.count == 6 || args.count == 7 else {
    usage()
  }
  let fromX = parseDouble(args[2], name: "from-x")
  let fromY = parseDouble(args[3], name: "from-y")
  let toX = parseDouble(args[4], name: "to-x")
  let toY = parseDouble(args[5], name: "to-y")
  let steps = args.count == 7 ? parseInt(args[6], name: "steps") : 10
  hidDrag(fromX: fromX, fromY: fromY, toX: toX, toY: toY, steps: steps)
default:
  usage()
}
