import ApplicationServices
import Foundation

func usage() -> Never {
  fputs("usage: os-input.swift check | keycodes <pid> <key-code>... | hid-keycodes <key-code>... | hid-shortcut <modifiers> <key-code>\n", stderr)
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
default:
  usage()
}
