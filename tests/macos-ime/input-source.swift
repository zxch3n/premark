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

func allSources(includeAllInstalled: Bool = false) -> [TISInputSource] {
  let list = TISCreateInputSourceList(nil, includeAllInstalled).takeRetainedValue() as NSArray
  return list.compactMap { $0 as! TISInputSource? }
}

func currentSourceID() -> String {
  let source = TISCopyCurrentKeyboardInputSource().takeRetainedValue()
  return stringProperty(source, kTISPropertyInputSourceID) ?? ""
}

func printSource(_ source: TISInputSource) {
  let id = stringProperty(source, kTISPropertyInputSourceID) ?? ""
  let name = stringProperty(source, kTISPropertyLocalizedName) ?? ""
  let enabled = boolProperty(source, kTISPropertyInputSourceIsEnabled)
  print("\(id)\t\(enabled ? "enabled" : "disabled")\t\(name)")
}

func findSource(_ targetID: String, includeAllInstalled: Bool = false) -> TISInputSource? {
  allSources(includeAllInstalled: includeAllInstalled).first(where: {
    stringProperty($0, kTISPropertyInputSourceID) == targetID
  })
}

let args = CommandLine.arguments
let command = args.count > 1 ? args[1] : "current"

switch command {
case "current":
  print(currentSourceID())
case "list":
  for source in allSources(includeAllInstalled: false) {
    printSource(source)
  }
case "list-all":
  for source in allSources(includeAllInstalled: true) {
    printSource(source)
  }
case "select":
  guard args.count > 2 else {
    fputs("usage: input-source.swift select <input-source-id>\n", stderr)
    exit(2)
  }
  let targetID = args[2]
  guard let source = findSource(targetID, includeAllInstalled: true) else {
    fputs("input source not found: \(targetID)\n", stderr)
    exit(3)
  }
  let status = TISSelectInputSource(source)
  if status != noErr {
    fputs("failed to select \(targetID): \(status)\n", stderr)
    exit(4)
  }
  print(currentSourceID())
case "enable":
  guard args.count > 2 else {
    fputs("usage: input-source.swift enable <input-source-id>\n", stderr)
    exit(2)
  }
  let targetID = args[2]
  guard let source = findSource(targetID, includeAllInstalled: true) else {
    fputs("input source not found: \(targetID)\n", stderr)
    exit(3)
  }
  let status = TISEnableInputSource(source)
  if status != noErr {
    fputs("failed to enable \(targetID): \(status)\n", stderr)
    exit(4)
  }
  printSource(source)
default:
  fputs("unknown command: \(command)\n", stderr)
  exit(2)
}
