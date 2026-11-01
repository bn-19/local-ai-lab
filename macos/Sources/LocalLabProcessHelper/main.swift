import Darwin
import Foundation

guard CommandLine.arguments.count >= 2 else {
    FileHandle.standardError.write(Data("usage: LocalLabProcessHelper executable [arguments...]\n".utf8))
    exit(64)
}

guard setpgid(0, 0) == 0 else {
    perror("LocalLabProcessHelper: setpgid")
    exit(70)
}

let arguments = Array(CommandLine.arguments.dropFirst())
let duplicated = arguments.map { strdup($0) }
defer { duplicated.forEach { free($0) } }
var argv = duplicated + [nil]
execv(arguments[0], &argv)
perror("LocalLabProcessHelper: execv")
exit(errno == ENOENT ? 127 : 126)
