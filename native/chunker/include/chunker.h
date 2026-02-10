/**
 * @file chunker.h
 * @brief Semantic Code Chunker for ArchiCore
 * @version 1.0.0
 *
 * Provides fast semantic code chunking for better RAG quality.
 * Features:
 * - Sliding window with configurable overlap
 * - Semantic boundary detection (functions, classes, blocks)
 * - tiktoken-compatible token counting
 * - Metadata for each chunk (line numbers, type, context)
 */

#ifndef ARCHICORE_CHUNKER_H
#define ARCHICORE_CHUNKER_H

#include "common.h"
#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <regex>

namespace archicore {
namespace chunker {

/**
 * @brief Configuration for the chunker
 */
struct ChunkerConfig {
    uint32_t max_chunk_tokens = 512;      // Maximum tokens per chunk
    uint32_t min_chunk_tokens = 64;       // Minimum tokens per chunk
    uint32_t overlap_tokens = 50;         // Token overlap between chunks
    bool respect_boundaries = true;        // Respect semantic boundaries
    bool include_context = true;           // Include context from parent scope
    bool preserve_imports = true;          // Keep imports with related code
    Language language = Language::UNKNOWN; // Source language (auto-detect if UNKNOWN)
};

/**
 * @brief Context information for a chunk
 */
struct ChunkContext {
    std::string parent_name;       // Parent function/class name
    std::string namespace_name;    // Namespace/module name
    std::vector<std::string> imports; // Relevant imports
};

/**
 * @brief Represents a single code chunk
 */
struct CodeChunk {
    std::string content;           // The actual code content
    uint32_t token_count;          // Number of tokens
    SourceLocation location;       // Source location info
    ChunkType type;                // Type of code in this chunk
    ChunkContext context;          // Context information
    uint32_t chunk_index;          // Index in the sequence
    std::string hash;              // Content hash for deduplication
};

/**
 * @brief Result of chunking operation
 */
struct ChunkResult {
    std::vector<CodeChunk> chunks;
    uint32_t total_tokens;
    uint32_t total_lines;
    double chunking_time_ms;
    std::string error;
};

/**
 * @brief Semantic boundary information
 */
struct SemanticBoundary {
    uint32_t line;
    uint32_t column;
    uint32_t byte_offset;
    ChunkType type;
    std::string name;
    int32_t scope_depth;
    bool is_start;

    // Default constructor
    SemanticBoundary()
        : line(0), column(0), byte_offset(0), type(ChunkType::UNKNOWN),
          name(), scope_depth(0), is_start(true) {}

    // Full constructor for MSVC compatibility
    SemanticBoundary(uint32_t l, uint32_t c, uint32_t offset, ChunkType t,
                     const std::string& n, int32_t depth, bool start)
        : line(l), column(c), byte_offset(offset), type(t),
          name(n), scope_depth(depth), is_start(start) {}
};

// Forward declarations
class Tokenizer;
class BoundaryDetector;

/**
 * @brief Main Chunker class
 */
class Chunker {
public:
    explicit Chunker(const ChunkerConfig& config = ChunkerConfig{});
    ~Chunker();

    /**
     * @brief Chunk source code into semantic pieces
     * @param source The source code to chunk
     * @param filepath Path to the file (for language detection)
     * @return ChunkResult containing the chunks
     */
    ChunkResult chunk(const std::string& source, const std::string& filepath = "");

    /**
     * @brief Chunk source code from a file using memory mapping
     * @param filepath Path to the source file
     * @return ChunkResult containing the chunks
     */
    ChunkResult chunk_file(const std::string& filepath);

    /**
     * @brief Update chunker configuration
     * @param config New configuration
     */
    void set_config(const ChunkerConfig& config);

    /**
     * @brief Get current configuration
     * @return Current configuration
     */
    const ChunkerConfig& get_config() const { return config_; }

private:
    ChunkerConfig config_;
    std::unique_ptr<Tokenizer> tokenizer_;
    std::unique_ptr<BoundaryDetector> boundary_detector_;

    std::vector<CodeChunk> create_chunks_with_boundaries(
        const std::string& source,
        const std::vector<SemanticBoundary>& boundaries,
        Language language
    );

    std::vector<CodeChunk> create_sliding_window_chunks(
        const std::string& source,
        Language language
    );

    void extract_context(
        CodeChunk& chunk,
        const std::string& source,
        const std::vector<SemanticBoundary>& boundaries
    );

    std::string compute_hash(const std::string& content);
};

/**
 * @brief Tokenizer for counting tokens (tiktoken-compatible)
 *
 * Uses a simplified BPE-like algorithm compatible with OpenAI's tiktoken
 * for cl100k_base encoding (used by GPT-4, GPT-3.5-turbo, etc.)
 */
class Tokenizer {
public:
    Tokenizer();
    ~Tokenizer();

    /**
     * @brief Count tokens in text
     * @param text The text to count tokens for
     * @return Number of tokens
     */
    uint32_t count_tokens(const std::string& text);

    /**
     * @brief Encode text to token IDs
     * @param text The text to encode
     * @return Vector of token IDs
     */
    std::vector<uint32_t> encode(const std::string& text);

    /**
     * @brief Find byte offset at token boundary
     * @param text The text
     * @param target_tokens Target token count
     * @return Byte offset closest to target token count
     */
    size_t find_token_boundary(const std::string& text, uint32_t target_tokens);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

/**
 * @brief Detects semantic boundaries in source code
 */
class BoundaryDetector {
public:
    BoundaryDetector();
    ~BoundaryDetector();

    /**
     * @brief Detect semantic boundaries in source code
     * @param source The source code
     * @param language The programming language
     * @return Vector of detected boundaries
     */
    std::vector<SemanticBoundary> detect(
        const std::string& source,
        Language language
    );

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;

    std::vector<SemanticBoundary> detect_javascript(const std::string& source);
    std::vector<SemanticBoundary> detect_typescript(const std::string& source);
    std::vector<SemanticBoundary> detect_python(const std::string& source);
    std::vector<SemanticBoundary> detect_rust(const std::string& source);
    std::vector<SemanticBoundary> detect_go(const std::string& source);
    std::vector<SemanticBoundary> detect_java(const std::string& source);
    std::vector<SemanticBoundary> detect_cpp(const std::string& source);
    std::vector<SemanticBoundary> detect_generic(const std::string& source);
};

} // namespace chunker
} // namespace archicore

#endif // ARCHICORE_CHUNKER_H
