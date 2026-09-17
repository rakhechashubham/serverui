export type FileType =
  "image" | "video" | "audio" | "pdf" | "text" | "code" | "archive" | "document" | "unknown";

const IMAGE_EXT = new Set(["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "avif", "ico"]);
const VIDEO_EXT = new Set(["mp4", "webm", "ogv", "mov", "m4v"]);
const AUDIO_EXT = new Set(["mp3", "wav", "m4a", "aac", "flac", "oga", "ogg"]);
const PDF_EXT = new Set(["pdf"]);
const ARCHIVE_EXT = new Set(["zip", "tar", "gz", "tgz", "rar", "7z"]);
const DOCUMENT_EXT = new Set(["doc", "docx", "xls", "xlsx", "ppt", "pptx", "odt", "ods"]);
const TEXT_EXT = new Set([
  "txt",
  "log",
  "csv",
  "json",
  "yaml",
  "yml",
  "xml",
  "ini",
  "conf",
  "cfg",
  "toml",
  "md",
  "markdown",
  "env",
  "example",
  "properties",
  "service",
  "socket",
  "timer",
]);
const CODE_EXT = new Set([
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "go",
  "py",
  "rs",
  "java",
  "kt",
  "cpp",
  "cc",
  "c",
  "h",
  "hpp",
  "cs",
  "css",
  "scss",
  "html",
  "htm",
  "sql",
  "sh",
  "bash",
  "zsh",
  "rb",
  "php",
  "swift",
  "vue",
  "svelte",
  "dockerfile",
  "makefile",
]);

const TEXT_NAMES = new Set([
  "hostname",
  "hosts",
  "passwd",
  "group",
  "shadow",
  "fstab",
  "motd",
  "issue",
  "profile",
  "environment",
  "shells",
  "services",
  "protocols",
  "networks",
  "crontab",
  "sudoers",
  "os-release",
  "machine-id",
  "debian_version",
  "authorized_keys",
  "known_hosts",
  "readme",
  "license",
  "changelog",
  "authors",
  "copying",
]);

const CODE_NAMES = new Set(["dockerfile", "makefile", "cmakelists.txt", "gemfile", "rakefile"]);

const CODE_LANG: Record<string, string> = {
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  go: "go",
  py: "python",
  rs: "rust",
  java: "java",
  cpp: "cpp",
  cc: "cpp",
  c: "c",
  h: "c",
  hpp: "cpp",
  css: "css",
  html: "xml",
  htm: "xml",
  xml: "xml",
  json: "json",
  yml: "yaml",
  yaml: "yaml",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  sql: "sql",
  rb: "ruby",
  php: "php",
  md: "markdown",
};

export function fileExtension(name: string) {
  const base = name.split("/").pop() || name;
  const index = base.lastIndexOf(".");
  if (index <= 0) return "";
  return base.slice(index + 1).toLowerCase();
}

function fileBaseName(name: string) {
  return (name.split("/").pop() || name).toLowerCase();
}

function typeFromMime(mime: string, name: string): FileType | null {
  const value = mime.toLowerCase();
  if (!value) return null;
  if (value.startsWith("image/")) return "image";
  if (value.startsWith("video/")) return "video";
  if (value.startsWith("audio/")) return "audio";
  if (value === "application/pdf") return "pdf";
  if (
    value === "application/zip" ||
    value === "application/gzip" ||
    value === "application/x-gzip" ||
    value === "application/x-tar" ||
    value === "application/x-7z-compressed" ||
    value === "application/vnd.rar"
  ) {
    return "archive";
  }
  if (
    value.includes("msword") ||
    value.includes("officedocument") ||
    value.includes("opendocument") ||
    value.includes("ms-excel") ||
    value.includes("ms-powerpoint")
  ) {
    return "document";
  }
  if (
    value.includes("javascript") ||
    value.includes("typescript") ||
    value.includes("python") ||
    value.includes("shellscript") ||
    value.includes("x-c") ||
    value.includes("java") ||
    value.includes("dockerfile") ||
    value.includes("makefile")
  ) {
    return "code";
  }
  if (
    value.startsWith("text/") ||
    value === "application/json" ||
    value === "application/xml" ||
    value === "application/yaml" ||
    value === "application/sql" ||
    value === "application/x-yaml"
  ) {
    const ext = fileExtension(name);
    return CODE_EXT.has(ext) || CODE_NAMES.has(fileBaseName(name)) ? "code" : "text";
  }
  return null;
}

export function getFileType(input: { name: string; mime?: string }): FileType {
  const fromMime = typeFromMime(input.mime || "", input.name);
  if (fromMime) return fromMime;

  const base = fileBaseName(input.name);
  if (CODE_NAMES.has(base)) return "code";
  if (TEXT_NAMES.has(base)) return "text";

  const ext = fileExtension(input.name);
  if (IMAGE_EXT.has(ext)) return "image";
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (PDF_EXT.has(ext)) return "pdf";
  if (ARCHIVE_EXT.has(ext)) return "archive";
  if (DOCUMENT_EXT.has(ext)) return "document";
  if (CODE_EXT.has(ext)) return "code";
  if (TEXT_EXT.has(ext) || ext === "example") return "text";
  return "unknown";
}

export function getFileViewer(file: { name: string; mime?: string }): FileType {
  return getFileType(file);
}

export function looksLikeText(content: string) {
  if (!content) return true;
  const sample = content.slice(0, 8192);
  if (sample.includes("\u0000")) return false;
  let binary = 0;
  for (let i = 0; i < sample.length; i += 1) {
    const code = sample.charCodeAt(i);
    if (code === 0xfffd || code < 9 || (code > 13 && code < 32) || code === 0x7f) {
      binary += 1;
    }
  }
  return binary / sample.length < 0.08;
}

export function getHighlightLanguage(name: string) {
  const base = fileBaseName(name);
  if (base === "dockerfile") return "dockerfile";
  if (base === "makefile") return "makefile";
  return CODE_LANG[fileExtension(name)] || "";
}

export function viewerTitle(name: string) {
  return name.split("/").pop() || name;
}
