/**
 * @file boundaries.cpp
 * @brief Semantic boundary detection for code chunking
 * @version 1.0.0
 *
 * Detects semantic boundaries in source code including:
 * - Function/method definitions
 * - Class/struct/interface declarations
 * - Module/namespace boundaries
 * - Import/export statements
 * - Block structures
 */

#ifdef _WIN32
#define NOMINMAX
#endif

#include "chunker.h"
#include <regex>
#include <stack>
#include <algorithm>

namespace archicore {
namespace chunker {

struct BoundaryDetector::Impl {
    // Helper to find line and column from byte offset
    static std::pair<uint32_t, uint32_t> offset_to_line_col(
        const std::string& source,
        size_t offset
    ) {
        uint32_t line = 1;
        uint32_t col = 1;
        for (size_t i = 0; i < offset && i < source.size(); i++) {
            if (source[i] == '\n') {
                line++;
                col = 1;
            } else {
                col++;
            }
        }
        return {line, col};
    }

    // Skip whitespace and return new position
    static size_t skip_whitespace(const std::string& source, size_t pos) {
        while (pos < source.size() && std::isspace(static_cast<unsigned char>(source[pos]))) {
            pos++;
        }
        return pos;
    }

    // Skip to end of line
    static size_t skip_to_eol(const std::string& source, size_t pos) {
        while (pos < source.size() && source[pos] != '\n') {
            pos++;
        }
        return pos;
    }

    // Skip string literal
    static size_t skip_string(const std::string& source, size_t pos, char quote) {
        pos++; // Skip opening quote
        while (pos < source.size()) {
            if (source[pos] == '\\' && pos + 1 < source.size()) {
                pos += 2; // Skip escaped char
            } else if (source[pos] == quote) {
                return pos + 1;
            } else {
                pos++;
            }
        }
        return pos;
    }

    // Skip template string (backtick)
    static size_t skip_template_string(const std::string& source, size_t pos) {
        pos++; // Skip opening backtick
        while (pos < source.size()) {
            if (source[pos] == '\\' && pos + 1 < source.size()) {
                pos += 2;
            } else if (source[pos] == '$' && pos + 1 < source.size() && source[pos + 1] == '{') {
                // Skip ${...} expression
                int depth = 1;
                pos += 2;
                while (pos < source.size() && depth > 0) {
                    if (source[pos] == '{') depth++;
                    else if (source[pos] == '}') depth--;
                    pos++;
                }
            } else if (source[pos] == '`') {
                return pos + 1;
            } else {
                pos++;
            }
        }
        return pos;
    }

    // Skip comment
    static size_t skip_comment(const std::string& source, size_t pos) {
        if (pos + 1 >= source.size()) return pos;

        if (source[pos] == '/' && source[pos + 1] == '/') {
            // Line comment
            return skip_to_eol(source, pos);
        } else if (source[pos] == '/' && source[pos + 1] == '*') {
            // Block comment
            pos += 2;
            while (pos + 1 < source.size()) {
                if (source[pos] == '*' && source[pos + 1] == '/') {
                    return pos + 2;
                }
                pos++;
            }
        } else if (source[pos] == '#') {
            // Python-style comment
            return skip_to_eol(source, pos);
        }
        return pos;
    }

    // Extract identifier at position
    static std::string extract_identifier(const std::string& source, size_t pos) {
        std::string id;
        while (pos < source.size()) {
            char c = source[pos];
            if (std::isalnum(static_cast<unsigned char>(c)) || c == '_' || c == '$') {
                id += c;
                pos++;
            } else {
                break;
            }
        }
        return id;
    }

    // Find matching brace
    static size_t find_matching_brace(const std::string& source, size_t pos, char open, char close) {
        if (pos >= source.size() || source[pos] != open) return pos;

        int depth = 1;
        pos++;
        while (pos < source.size() && depth > 0) {
            char c = source[pos];
            if (c == open) {
                depth++;
            } else if (c == close) {
                depth--;
            } else if (c == '"' || c == '\'') {
                pos = skip_string(source, pos, c);
                continue;
            } else if (c == '`') {
                pos = skip_template_string(source, pos);
                continue;
            } else if (c == '/' && pos + 1 < source.size() && (source[pos + 1] == '/' || source[pos + 1] == '*')) {
                pos = skip_comment(source, pos);
                continue;
            }
            pos++;
        }
        return pos;
    }
};

BoundaryDetector::BoundaryDetector() : impl_(std::make_unique<Impl>()) {}

BoundaryDetector::~BoundaryDetector() = default;

std::vector<SemanticBoundary> BoundaryDetector::detect(
    const std::string& source,
    Language language
) {
    switch (language) {
        case Language::JAVASCRIPT:
            return detect_javascript(source);
        case Language::TYPESCRIPT:
            return detect_typescript(source);
        case Language::PYTHON:
            return detect_python(source);
        case Language::RUST:
            return detect_rust(source);
        case Language::GO:
            return detect_go(source);
        case Language::JAVA:
        case Language::KOTLIN:
            return detect_java(source);
        case Language::CPP:
        case Language::C:
        case Language::CSHARP:
            return detect_cpp(source);
        default:
            return detect_generic(source);
    }
}

std::vector<SemanticBoundary> BoundaryDetector::detect_javascript(const std::string& source) {
    std::vector<SemanticBoundary> boundaries;
    size_t pos = 0;
    int scope_depth = 0;
    std::stack<std::pair<size_t, ChunkType>> scope_stack;

    // Regular expressions for JavaScript patterns
    std::regex func_regex(R"((?:async\s+)?function\s*(\*?)\s*([a-zA-Z_$][a-zA-Z0-9_$]*)?\s*\()");
    std::regex arrow_regex(R"((?:const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>)");
    std::regex class_regex(R"(class\s+([a-zA-Z_$][a-zA-Z0-9_$]*))");
    std::regex method_regex(R"((?:async\s+)?([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\([^)]*\)\s*\{)");
    std::regex import_regex(R"(import\s+)");
    std::regex export_regex(R"(export\s+(?:default\s+)?(?:async\s+)?(?:function|class|const|let|var))");

    while (pos < source.size()) {
        // Skip whitespace
        pos = Impl::skip_whitespace(source, pos);
        if (pos >= source.size()) break;

        char c = source[pos];

        // Skip comments
        if (c == '/' && pos + 1 < source.size()) {
            if (source[pos + 1] == '/' || source[pos + 1] == '*') {
                size_t comment_start = pos;
                pos = Impl::skip_comment(source, pos);

                // Track doc comments as potential boundaries
                if (pos - comment_start > 50) {
                    auto [line, col] = Impl::offset_to_line_col(source, comment_start);
                    boundaries.push_back({
                        static_cast<uint32_t>(line),
                        static_cast<uint32_t>(col),
                        static_cast<uint32_t>(comment_start),
                        ChunkType::COMMENT,
                        "",
                        scope_depth,
                        true
                    });
                }
                continue;
            }
        }

        // Skip string literals
        if (c == '"' || c == '\'') {
            pos = Impl::skip_string(source, pos, c);
            continue;
        }
        if (c == '`') {
            pos = Impl::skip_template_string(source, pos);
            continue;
        }

        // Check for patterns
        std::string_view remaining(source.data() + pos, source.size() - pos);
        std::string remaining_str(remaining.substr(0, std::min(remaining.size(), size_t(200))));
        std::smatch match;

        // Check for import
        if (std::regex_search(remaining_str, match, import_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::IMPORT,
                "",
                scope_depth,
                true
            });
            pos = Impl::skip_to_eol(source, pos);
            continue;
        }

        // Check for export
        if (std::regex_search(remaining_str, match, export_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::EXPORT,
                "",
                scope_depth,
                true
            });
            pos += match.length();
            continue;
        }

        // Check for class
        if (std::regex_search(remaining_str, match, class_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            std::string name = match[1].str();
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::CLASS,
                name,
                scope_depth,
                true
            });
            pos += match.length();

            // Find the opening brace
            while (pos < source.size() && source[pos] != '{') pos++;
            if (pos < source.size()) {
                scope_stack.push({pos, ChunkType::CLASS});
                scope_depth++;
                pos++;
            }
            continue;
        }

        // Check for function
        if (std::regex_search(remaining_str, match, func_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            std::string name = match[2].str();
            if (name.empty()) name = "<anonymous>";
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::FUNCTION,
                name,
                scope_depth,
                true
            });
            pos += match.length();

            // Find the opening brace
            while (pos < source.size() && source[pos] != '{') pos++;
            if (pos < source.size()) {
                scope_stack.push({pos, ChunkType::FUNCTION});
                scope_depth++;
                pos++;
            }
            continue;
        }

        // Check for arrow function
        if (std::regex_search(remaining_str, match, arrow_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            std::string name = match[1].str();
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::FUNCTION,
                name,
                scope_depth,
                true
            });
            pos += match.length();

            // Arrow functions might have { or not
            size_t temp_pos = Impl::skip_whitespace(source, pos);
            if (temp_pos < source.size() && source[temp_pos] == '{') {
                scope_stack.push({temp_pos, ChunkType::FUNCTION});
                scope_depth++;
                pos = temp_pos + 1;
            }
            continue;
        }

        // Track scope changes
        if (c == '{') {
            scope_stack.push({pos, ChunkType::BLOCK});
            scope_depth++;
            pos++;
        } else if (c == '}') {
            if (!scope_stack.empty()) {
                auto [start_pos, type] = scope_stack.top();
                scope_stack.pop();
                scope_depth--;

                // Add end boundary for functions and classes
                if (type == ChunkType::FUNCTION || type == ChunkType::CLASS) {
                    auto [line, col] = Impl::offset_to_line_col(source, pos);
                    boundaries.push_back({
                        static_cast<uint32_t>(line),
                        static_cast<uint32_t>(col),
                        static_cast<uint32_t>(pos),
                        type,
                        "",
                        scope_depth,
                        false  // is_start = false
                    });
                }
            }
            pos++;
        } else {
            pos++;
        }
    }

    // Sort boundaries by offset
    std::sort(boundaries.begin(), boundaries.end(),
              [](const SemanticBoundary& a, const SemanticBoundary& b) {
                  return a.byte_offset < b.byte_offset;
              });

    return boundaries;
}

std::vector<SemanticBoundary> BoundaryDetector::detect_typescript(const std::string& source) {
    // TypeScript extends JavaScript, so we use the same base detection
    // and add TypeScript-specific patterns
    std::vector<SemanticBoundary> boundaries = detect_javascript(source);

    // Additional TypeScript patterns
    std::regex interface_regex(R"(interface\s+([a-zA-Z_$][a-zA-Z0-9_$]*))");
    std::regex type_regex(R"(type\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=)");
    std::regex enum_regex(R"(enum\s+([a-zA-Z_$][a-zA-Z0-9_$]*))");

    size_t pos = 0;
    while (pos < source.size()) {
        std::string_view remaining(source.data() + pos, source.size() - pos);
        std::string remaining_str(remaining.substr(0, std::min(remaining.size(), size_t(200))));
        std::smatch match;

        if (std::regex_search(remaining_str, match, interface_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::INTERFACE,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, enum_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::ENUM,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        pos++;
    }

    std::sort(boundaries.begin(), boundaries.end(),
              [](const SemanticBoundary& a, const SemanticBoundary& b) {
                  return a.byte_offset < b.byte_offset;
              });

    return boundaries;
}

std::vector<SemanticBoundary> BoundaryDetector::detect_python(const std::string& source) {
    std::vector<SemanticBoundary> boundaries;

    std::regex func_regex(R"((?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\()");
    std::regex class_regex(R"(class\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex import_regex(R"((?:from\s+[.\w]+\s+)?import\s+)");

    size_t pos = 0;
    int current_indent = 0;

    while (pos < source.size()) {
        // Track indentation
        size_t line_start = pos;
        int indent = 0;
        while (pos < source.size() && (source[pos] == ' ' || source[pos] == '\t')) {
            indent += (source[pos] == '\t') ? 4 : 1;
            pos++;
        }

        if (pos >= source.size()) break;

        // Skip empty lines and comments
        if (source[pos] == '\n') {
            pos++;
            continue;
        }
        if (source[pos] == '#') {
            pos = Impl::skip_to_eol(source, pos);
            pos++;
            continue;
        }

        current_indent = indent;

        std::string_view remaining(source.data() + pos, source.size() - pos);
        std::string remaining_str(remaining.substr(0, std::min(remaining.size(), size_t(200))));
        std::smatch match;

        // Check for class
        if (std::regex_search(remaining_str, match, class_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, line_start);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(line_start),
                ChunkType::CLASS,
                match[1].str(),
                current_indent / 4,
                true
            });
        }
        // Check for function
        else if (std::regex_search(remaining_str, match, func_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, line_start);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(line_start),
                ChunkType::FUNCTION,
                match[1].str(),
                current_indent / 4,
                true
            });
        }
        // Check for import
        else if (std::regex_search(remaining_str, match, import_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, line_start);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(line_start),
                ChunkType::IMPORT,
                "",
                0,
                true
            });
        }

        // Move to next line
        pos = Impl::skip_to_eol(source, pos);
        if (pos < source.size()) pos++;
    }

    return boundaries;
}

std::vector<SemanticBoundary> BoundaryDetector::detect_rust(const std::string& source) {
    std::vector<SemanticBoundary> boundaries;

    std::regex fn_regex(R"((?:pub\s+)?(?:async\s+)?fn\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex struct_regex(R"((?:pub\s+)?struct\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex enum_regex(R"((?:pub\s+)?enum\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex impl_regex(R"(impl(?:<[^>]+>)?\s+(?:([a-zA-Z_][a-zA-Z0-9_]*)\s+for\s+)?([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex trait_regex(R"((?:pub\s+)?trait\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex mod_regex(R"((?:pub\s+)?mod\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex use_regex(R"(use\s+)");

    size_t pos = 0;
    while (pos < source.size()) {
        pos = Impl::skip_whitespace(source, pos);
        if (pos >= source.size()) break;

        // Skip comments
        if (source[pos] == '/' && pos + 1 < source.size()) {
            if (source[pos + 1] == '/' || source[pos + 1] == '*') {
                pos = Impl::skip_comment(source, pos);
                continue;
            }
        }

        std::string_view remaining(source.data() + pos, source.size() - pos);
        std::string remaining_str(remaining.substr(0, std::min(remaining.size(), size_t(200))));
        std::smatch match;

        if (std::regex_search(remaining_str, match, fn_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::FUNCTION,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, struct_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::STRUCT,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, enum_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::ENUM,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, impl_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            std::string name = match[2].str();
            if (!match[1].str().empty()) {
                name = match[1].str() + " for " + name;
            }
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::CLASS, // impl blocks are like class extensions
                name,
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, trait_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::INTERFACE,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, mod_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::MODULE,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, use_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::IMPORT,
                "",
                0,
                true
            });
            pos = Impl::skip_to_eol(source, pos);
            continue;
        }

        pos++;
    }

    return boundaries;
}

std::vector<SemanticBoundary> BoundaryDetector::detect_go(const std::string& source) {
    std::vector<SemanticBoundary> boundaries;

    std::regex func_regex(R"(func\s+(?:\([^)]+\)\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\()");
    std::regex type_regex(R"(type\s+([a-zA-Z_][a-zA-Z0-9_]*)\s+(struct|interface))");
    std::regex import_regex(R"(import\s+)");
    std::regex package_regex(R"(package\s+([a-zA-Z_][a-zA-Z0-9_]*))");

    size_t pos = 0;
    while (pos < source.size()) {
        pos = Impl::skip_whitespace(source, pos);
        if (pos >= source.size()) break;

        // Skip comments
        if (source[pos] == '/' && pos + 1 < source.size()) {
            if (source[pos + 1] == '/' || source[pos + 1] == '*') {
                pos = Impl::skip_comment(source, pos);
                continue;
            }
        }

        std::string_view remaining(source.data() + pos, source.size() - pos);
        std::string remaining_str(remaining.substr(0, std::min(remaining.size(), size_t(200))));
        std::smatch match;

        if (std::regex_search(remaining_str, match, package_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::MODULE,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, func_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::FUNCTION,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, type_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            ChunkType type = (match[2].str() == "struct") ? ChunkType::STRUCT : ChunkType::INTERFACE;
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                type,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, import_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::IMPORT,
                "",
                0,
                true
            });
            pos += match.length();
            // Handle import block
            pos = Impl::skip_whitespace(source, pos);
            if (pos < source.size() && source[pos] == '(') {
                pos = Impl::find_matching_brace(source, pos, '(', ')');
            }
            continue;
        }

        pos++;
    }

    return boundaries;
}

std::vector<SemanticBoundary> BoundaryDetector::detect_java(const std::string& source) {
    std::vector<SemanticBoundary> boundaries;

    std::regex class_regex(R"((?:public\s+|private\s+|protected\s+)?(?:abstract\s+)?(?:final\s+)?class\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex interface_regex(R"((?:public\s+)?interface\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex enum_regex(R"((?:public\s+)?enum\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex method_regex(R"((?:public\s+|private\s+|protected\s+)?(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?[a-zA-Z_][a-zA-Z0-9_<>,\s]*\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:throws\s+[^{]+)?\{)");
    std::regex import_regex(R"(import\s+)");
    std::regex package_regex(R"(package\s+)");

    size_t pos = 0;
    while (pos < source.size()) {
        pos = Impl::skip_whitespace(source, pos);
        if (pos >= source.size()) break;

        // Skip comments
        if (source[pos] == '/' && pos + 1 < source.size()) {
            if (source[pos + 1] == '/' || source[pos + 1] == '*') {
                pos = Impl::skip_comment(source, pos);
                continue;
            }
        }

        std::string_view remaining(source.data() + pos, source.size() - pos);
        std::string remaining_str(remaining.substr(0, std::min(remaining.size(), size_t(300))));
        std::smatch match;

        if (std::regex_search(remaining_str, match, package_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::MODULE,
                "",
                0,
                true
            });
            pos = Impl::skip_to_eol(source, pos);
            continue;
        }

        if (std::regex_search(remaining_str, match, import_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::IMPORT,
                "",
                0,
                true
            });
            pos = Impl::skip_to_eol(source, pos);
            continue;
        }

        if (std::regex_search(remaining_str, match, class_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::CLASS,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, interface_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::INTERFACE,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, enum_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::ENUM,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        pos++;
    }

    return boundaries;
}

std::vector<SemanticBoundary> BoundaryDetector::detect_cpp(const std::string& source) {
    std::vector<SemanticBoundary> boundaries;

    std::regex class_regex(R"((?:template\s*<[^>]+>\s*)?class\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex struct_regex(R"((?:template\s*<[^>]+>\s*)?struct\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex namespace_regex(R"(namespace\s+([a-zA-Z_][a-zA-Z0-9_]*))");
    std::regex func_regex(R"((?:[a-zA-Z_][a-zA-Z0-9_:*&<>,\s]*\s+)?([a-zA-Z_][a-zA-Z0-9_]*)\s*\([^)]*\)\s*(?:const\s*)?(?:override\s*)?(?:final\s*)?\{)");
    std::regex include_regex(R"(#include\s+)");
    std::regex define_regex(R"(#define\s+)");

    size_t pos = 0;
    while (pos < source.size()) {
        pos = Impl::skip_whitespace(source, pos);
        if (pos >= source.size()) break;

        // Skip comments
        if (source[pos] == '/' && pos + 1 < source.size()) {
            if (source[pos + 1] == '/' || source[pos + 1] == '*') {
                pos = Impl::skip_comment(source, pos);
                continue;
            }
        }

        std::string_view remaining(source.data() + pos, source.size() - pos);
        std::string remaining_str(remaining.substr(0, std::min(remaining.size(), size_t(300))));
        std::smatch match;

        if (std::regex_search(remaining_str, match, include_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::IMPORT,
                "",
                0,
                true
            });
            pos = Impl::skip_to_eol(source, pos);
            continue;
        }

        if (std::regex_search(remaining_str, match, namespace_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::MODULE,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, class_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::CLASS,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        if (std::regex_search(remaining_str, match, struct_regex, std::regex_constants::match_continuous)) {
            auto [line, col] = Impl::offset_to_line_col(source, pos);
            boundaries.push_back({
                static_cast<uint32_t>(line),
                static_cast<uint32_t>(col),
                static_cast<uint32_t>(pos),
                ChunkType::STRUCT,
                match[1].str(),
                0,
                true
            });
            pos += match.length();
            continue;
        }

        pos++;
    }

    return boundaries;
}

std::vector<SemanticBoundary> BoundaryDetector::detect_generic(const std::string& source) {
    std::vector<SemanticBoundary> boundaries;

    // Generic boundary detection based on braces and common patterns
    size_t pos = 0;
    int brace_depth = 0;
    uint32_t line = 1;

    while (pos < source.size()) {
        char c = source[pos];

        if (c == '\n') {
            line++;
        } else if (c == '{') {
            if (brace_depth == 0) {
                // Potential block start
                boundaries.push_back({
                    line,
                    1,
                    static_cast<uint32_t>(pos),
                    ChunkType::BLOCK,
                    "",
                    brace_depth,
                    true
                });
            }
            brace_depth++;
        } else if (c == '}') {
            brace_depth--;
            if (brace_depth == 0) {
                // Block end
                boundaries.push_back({
                    line,
                    1,
                    static_cast<uint32_t>(pos),
                    ChunkType::BLOCK,
                    "",
                    brace_depth,
                    false
                });
            }
        }

        pos++;
    }

    return boundaries;
}

} // namespace chunker
} // namespace archicore
