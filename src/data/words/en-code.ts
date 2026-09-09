import type { Corpus } from "../types";

/**
 * Programming vocabulary and symbol-heavy tokens.
 *
 * Code typing exercises the keys ordinary prose never touches -- brackets,
 * operators, the top number row -- which is exactly where most developers'
 * accuracy quietly falls apart.
 */
const corpus: Corpus = {
  id: "en-code",
  label: "Code · symbols and keywords",
  kind: "code",
  language: "en",
  wpmUnit: "chars5",
  source: {
    name: "Common programming keywords and operators",
    license: "CC0-1.0",
  },
  words: [
    "const", "let", "var", "function", "return", "async", "await", "class",
    "extends", "implements", "interface", "type", "enum", "import", "export",
    "default", "from", "as", "if", "else", "switch", "case", "break",
    "continue", "for", "while", "do", "try", "catch", "finally", "throw",
    "new", "this", "super", "static", "public", "private", "protected",
    "readonly", "yield", "typeof", "instanceof", "delete", "void", "null",
    "undefined", "true", "false", "boolean", "number", "string", "symbol",
    "object", "array", "promise", "map", "set", "filter", "reduce", "forEach",
    "()", "{}", "[]", "=>", "===", "!==", "&&", "||", "??", "?.", "...",
    "++", "--", "+=", "-=", "*=", "/=", "%=", "<=", ">=", "<<", ">>",
    "/**", "*/", "//", "$", "#", "@", "&", "|", "^", "~", "`", "\\",
    "i++", "j--", "n / 2", "x * y", "a[i]", "obj.key", "fn(x)", "!flag",
    "0x1f", "1e-9", "255", "1024", "3.14159", "42", "-1", "0.5",
  ],
};

export default corpus;
