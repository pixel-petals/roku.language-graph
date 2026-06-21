# Tree-Sitter BrightScript Grammar

A complete Tree-Sitter grammar for Roku's BrightScript language, enabling advanced syntax analysis and integration with tools like Graphify.

## Overview

This grammar provides comprehensive parsing support for BrightScript, including:

- **Control Flow**: if/else, while, for, for-each loops
- **Functions & Subroutines**: Full parameter and return type support
- **Expressions**: All operators with correct precedence (arithmetic, logical, bitwise, comparison)
- **Types**: Boolean, Integer, LongInteger, Float, Double, String, Object, Dynamic, Void, Invalid
- **Data Structures**: Arrays, Associative Arrays (objects)
- **Advanced Features**: 
  - Optional chaining operators (`?.`, `?@`, `?[`, `?(`)
  - Member access and subscript operations
  - XML literals
  - CreateObject calls
  - Type designators (`%`, `$`, `!`, `#`)
- **Comments**: Apostrophe (`'`) and REM-style comments

## Project Structure

```
tree-sitter-brightscript/
├── grammar.js              # Main grammar definition
├── package.json           # NPM package configuration
├── queries/
│   └── highlights.scm    # Syntax highlighting queries
├── corpus/
│   └── test_cases.txt    # Test cases for validation
└── README.md             # This file
```

## Setup

### Prerequisites

- Node.js (v14+)
- npm or yarn
- tree-sitter CLI: `npm install -g tree-sitter-cli`

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/tree-sitter-brightscript.git
cd tree-sitter-brightscript
```

2. Install dependencies:
```bash
npm install
```

3. Build the parser:
```bash
npm run build
```

Or manually:
```bash
tree-sitter generate
node-gyp configure
node-gyp build
```

## Usage

### Command Line

Parse a BrightScript file and display the syntax tree:
```bash
tree-sitter parse example.brs
```

Test the grammar against corpus tests:
```bash
npm test
```

### Integration with Graphify

The generated parser can be integrated with Graphify for code analysis:

```javascript
const Parser = require('tree-sitter');
const BrightScript = require('tree-sitter-brightscript');

const parser = new Parser();
parser.setLanguage(BrightScript);

const code = `
function add(a as Integer, b as Integer) as Integer
  return a + b
end function
`;

const tree = parser.parse(code);
console.log(tree.rootNode.toString());
```

### Editor Integration

#### VS Code

Create an extension using this grammar:
1. Use the generated bindings in `/bindings/node`
2. Configure the extension to recognize `.brs` and `.bs` files
3. Use the highlights.scm queries for syntax highlighting

#### Neovim

Install using nvim-treesitter:
```lua
-- In your neovim config
local parser_config = require("nvim-treesitter.parsers").get_parser_configs()

parser_config.brightscript = {
  install_info = {
    url = "https://github.com/yourusername/tree-sitter-brightscript",
    files = {"src/parser.c"},
    branch = "main"
  },
  filetype = "brs"
}
```

## Grammar Features

### Expression Precedence (highest to lowest)

1. Primary expressions (literals, identifiers, parenthesized)
2. Postfix operations (member access, subscripts, optional chaining)
3. Function calls
4. Exponentiation (`^`) - right associative
5. Unary operators (`-`, `+`, `not`)
6. Multiplicative (`*`, `/`, `mod`)
7. Additive (`+`, `-`)
8. Shift (`<<`, `>>`)
9. Relational (`<`, `>`, `<=`, `>=`)
10. Equality (`=`, `<>`, `!=`)
11. Bitwise AND (`&`)
12. Bitwise XOR (`^`, `XOR`)
13. Bitwise OR (`|`)
14. Logical AND (`and`, `AND`)
15. Logical OR (`or`, `OR`)
16. Ternary (`?:`)

### Statements

- Assignment statements
- If/else if/else statements
- While loops with exit while
- For loops with optional step
- For-each loops
- Function definitions with parameters and return types
- Subroutine definitions
- Return statements
- Exit statements
- Goto statements
- Print statements
- Empty statements (`;`)

### Types

Built-in types:
- `Boolean` - true/false values
- `Integer` - 32-bit signed integer
- `LongInteger` - 64-bit signed integer (Roku OS 7.0+)
- `Float` - 32-bit IEEE floating point
- `Double` - 64-bit IEEE floating point
- `String` - text values
- `Object` - generic object reference
- `Dynamic` - untyped reference
- `Void` - no return value
- `Invalid` - null/undefined value

Type designators (suffix notation):
- `%` - Integer (e.g., `x% = 5`)
- `$` - String (e.g., `s$ = "hello"`)
- `!` - Float (e.g., `f! = 3.14`)
- `#` - Double (e.g., `d# = 2.71828`)

### Optional Chaining (Roku OS 11.0+)

```brightscript
obj?.property        ' Optional member access
obj?@interface       ' Optional interface check
arr?[index]         ' Optional subscript
func?(arg1, arg2)   ' Optional function call
```

## Example Code Parsed

```brightscript
function fibonacci(n as Integer) as Integer
  if n <= 1 then
    return n
  else
    return fibonacci(n - 1) + fibonacci(n - 2)
  end if
end function

sub main()
  result = fibonacci(10)
  print "Fibonacci(10) = " + result
end sub

main()
```

## Development

### Running Tests

```bash
npm test
```

### Adding New Test Cases

Add test cases to `corpus/test_cases.txt` in the format:

```
==================
Test Name
==================

source code here

---

(expected
  (syntax
    (tree)))
```

### Modifying the Grammar

Edit `grammar.js` following Tree-Sitter conventions:
- Use `$` prefix for rule references
- Use `field()` for named captures
- Use `token()` for single-token rules
- Use `prec()` for precedence
- Use `seq()` for sequences
- Use `choice()` for alternatives
- Use `repeat()` for zero-or-more matches
- Use `repeat1()` for one-or-more matches

After changes, rebuild:
```bash
npm run build
```

## Limitations and Future Work

Current limitations:
- XML parsing is simplified (full XML validation not included)
- Preprocessor directives not fully supported
- Component interfaces (@) partially supported
- BrighterScript extensions (classes, namespaces, imports) not included

Future enhancements:
- Full XML support with validation
- BrighterScript feature support
- Improved error recovery
- Extended debugging queries
- Folding ranges support

## BrighterScript Extensions

For BrighterScript (superset of BrightScript) support, extend this grammar with:
- `class` definitions with inheritance
- `namespace` declarations
- `import` statements
- Additional type annotations
- Enhanced error handling

## Contributing

Contributions are welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass
5. Submit a pull request

## References

- [Roku BrightScript Language Reference](https://developer.roku.com/docs/references/brightscript/language/brightscript-language-reference.md)
- [BrighterScript GitHub](https://github.com/rokucommunity/brighterscript)
- [Tree-Sitter Documentation](https://tree-sitter.github.io/tree-sitter/)
- [Tree-Sitter Grammar DSL](https://tree-sitter.github.io/tree-sitter/creating-parsers/2-the-grammar-dsl.html)

## License

MIT License - see LICENSE file for details

## Support

For issues, questions, or suggestions:
- Open an issue on GitHub
- Check existing issues for similar problems
- Include BrightScript code samples with bug reports
