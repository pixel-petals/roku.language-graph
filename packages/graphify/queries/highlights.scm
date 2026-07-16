;; Keywords
[
  "if"
  "then"
  "else"
  "end"
  "while"
  "for"
  "to"
  "step"
  "each"
  "in"
  "exit"
  "function"
  "sub"
  "return"
  "goto"
  "and"
  "or"
  "not"
  "and"
  "AND"
  "OR"
  "NOT"
  "XOR"
  "MOD"
  "mod"
  "as"
] @keyword

;; Control flow
[
  "if"
  "while"
  "for"
  "return"
  "exit"
] @keyword.control

;; Function definitions
(function_statement
  name: (identifier) @function)

(sub_statement
  name: (identifier) @function)

;; Function calls
(call_expression
  function: (identifier) @function.call)

;; Types
[
  "Boolean"
  "Integer"
  "LongInteger"
  "Float"
  "Double"
  "String"
  "Object"
  "Dynamic"
  "Void"
  "Invalid"
] @type

(type) @type

;; Literals
(boolean) @constant.builtin
(invalid_literal) @constant.builtin
(number) @number
(string) @string
(integer) @number
(long_integer) @number
(float) @number
(double) @number
(hexadecimal) @number

;; Comments
(comment) @comment

;; Operators
[
  "="
  "+"
  "-"
  "*"
  "/"
  "^"
  "&"
  "|"
  "?"
  "?."
  "?@"
  "?["
  "?("
  "<<"
  ">>"
  "<"
  ">"
  "<="
  ">="
  "<>"
  "!="
  "."
  "\."
] @operator

;; Punctuation
[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
  ","
  ";"
  ":"
] @punctuation.bracket

;; Identifiers
(identifier) @variable

;; Member access
(member_access
  property: (identifier) @property)

;; Parameters
(parameter
  name: (identifier) @parameter)

;; Key-value pairs
(key_value_pair
  key: (identifier) @property)
