import ApplicationServices
import Foundation

func usage() -> Never {
  fputs("usage: os-input.swift check | keycodes <pid> <key-code>... | hid-keycodes <key-code>...\n", stderr)
  exit(2)
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
  let source = CGEventSource(stateID: .hidSystemState)
  for rawCode in args.dropFirst(3) {
    guard let code = CGKeyCode(rawCode) else {
      fputs("invalid key code: \(rawCode)\n", stderr)
      exit(3)
    }
    guard
      let keyDown = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true),
      let keyUp = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
    else {
      fputs("failed to create CGEvent for key code: \(code)\n", stderr)
      exit(4)
    }
    keyDown.postToPid(pid)
    usleep(30_000)
    keyUp.postToPid(pid)
    usleep(90_000)
  }
case "hid-keycodes":
  guard args.count >= 3 else {
    usage()
  }
  let source = CGEventSource(stateID: .hidSystemState)
  for rawCode in args.dropFirst(2) {
    guard let code = CGKeyCode(rawCode) else {
      fputs("invalid key code: \(rawCode)\n", stderr)
      exit(3)
    }
    guard
      let keyDown = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: true),
      let keyUp = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false)
    else {
      fputs("failed to create CGEvent for key code: \(code)\n", stderr)
      exit(4)
    }
    keyDown.post(tap: .cghidEventTap)
    usleep(30_000)
    keyUp.post(tap: .cghidEventTap)
    usleep(120_000)
  }
default:
  usage()
}
