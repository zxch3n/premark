import Carbon
import Foundation

func stringProperty(_ source: TISInputSource, _ key: CFString) -> String? {
  guard let pointer = TISGetInputSourceProperty(source, key) else {
    return nil
  }
  return Unmanaged<CFString>.fromOpaque(pointer).takeUnretainedValue() as String
}

func boolProperty(_ source: TISInputSource, _ key: CFString) -> Bool {
  guard let pointer = TISGetInputSourceProperty(source, key) else {
    return false
  }
  return CFBooleanGetValue(Unmanaged<CFBoolean>.fromOpaque(pointer).takeUnretainedValue())
}

func allSources() -> [TISInputSource] {
  let list = TISCreateInputSourceList(nil, false).takeRetainedValue() as NSArray
  return list.compactMap { $0 as! TISInputSource? }
}

func currentSourceID() -> String {
  let source = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
  return stringProperty(source, kTISPropertyInputSourceID) ?? ""
}

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : "current"

switch command {
case "current":
  print(currentSourceID())
case "list":
  for source in allSources() {
    let id = stringProperty(source, kTISPropertyInputSourceID) ?? ""
    let name = stringProperty(source, kTISPropertyLocalizedName) ?? ""
    let enabled = boolProperty(source, kTISPropertyInputSourceIsEnabled)
    print("\(id)\t\(enabled ? "enabled" : "disabled")\t\(name)")
  }
case "select":
  guard args.count > 2 else {
    fputs("usage: input-source.swift select <input-source-id>\n", stderr)
    exit(2)
  }
  let targetID = args[2]
  guard let source = allSources().first(where: {
    stringProperty($0, kTISPropertyInputSourceID) == targetID
  }) else {
    fputs("input source not found: \(targetID)\n", stderr)
    exit(3)
  }
  let status = TISSelectInputSource(source)
  if status != noErr {
    fputs("failed to select \(targetID): \(status)\n", stderr)
    exit(4)
  }
  print(currentSourceID())
default:
  fputs("unknown command: \(command)\n", stderr)
  exit(2)
}
