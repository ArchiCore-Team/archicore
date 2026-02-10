/**
 * @file chunker.cpp
 * @brief Main Semantic Code Chunker implementation
 * @version 1.0.0
 *
 * Implements the core chunking logic that combines:
 * - Semantic boundary detection
 * - Token counting
 * - Sliding window with overlap
 * - Context extraction
 */

// Prevent Windows min/max macros from conflicting with std::min/std::max
#ifdef _WIN32
#define NOMINMAX
#endif

#include "chunker.h"
#include <algorithm>
#include <chrono>
#include <functional>
#include <sstream>

namespace archicore {
namespace chunker {

// Simple hash function for content deduplication
static std::string compute_content_hash(const std::string& content) {
    // Simple FNV-1a hash
    uint64_t hash = 14695981039346656037ULL;
    for (unsigned char c : content) {
        hash ^= c;
        hash *= 1099511628211ULL;
    }

    // Convert to hex string
    char buf[17];
    snprintf(buf, sizeof(buf), "%016llx", static_cast<unsigned long long>(hash));
    return std::string(buf);
}

// Helper to count lines in a string
static uint32_t count_lines(const std::string& str) {
    uint32_t lines = 1;
    for (char c : str) {
        if (c == '\n') lines++;
    }
    return lines;
}

// Helper to get line and column at byte offset
static std::pair<uint32_t, uint32_t> offset_to_location(const std::string& source, size_t offset) {
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

// Helper to find the start of the line containing offset
static size_t find_line_start(const std::string& source, size_t offset) {
    while (offset > 0 && source[offset - 1] != '\n') {
        offset--;
    }
    return offset;
}

// Helper to find the end of the line containing offset
static size_t find_line_end(const std::string& source, size_t offset) {
    while (offset < source.size() && source[offset] != '\n') {
        offset++;
    }
    return offset;
}

Chunker::Chunker(const ChunkerConfig& config)
    : config_(config)
    , tokenizer_(std::make_unique<Tokenizer>())
    , boundary_detector_(std::make_unique<BoundaryDetector>())
{
}

Chunker::~Chunker() = default;

void Chunker::set_config(const ChunkerConfig& config) {
    config_ = config;
}

ChunkResult Chunker::chunk(const std::string& source, const std::string& filepath) {
    auto start_time = std::chrono::high_resolution_clock::now();

    ChunkResult result;
    result.total_lines = count_lines(source);
    result.total_tokens = tokenizer_->count_tokens(source);

    if (source.empty()) {
        auto end_time = std::chrono::high_resolution_clock::now();
        result.chunking_time_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();
        return result;
    }

    // Detect language
    Language language = config_.language;
    if (language == Language::UNKNOWN && !filepath.empty()) {
        language = detect_language(filepath);
    }

    // Detect semantic boundaries
    std::vector<SemanticBoundary> boundaries;
    if (config_.respect_boundaries) {
        boundaries = boundary_detector_->detect(source, language);
    }

    // Create chunks
    if (config_.respect_boundaries && !boundaries.empty()) {
        result.chunks = create_chunks_with_boundaries(source, boundaries, language);
    } else {
        result.chunks = create_sliding_window_chunks(source, language);
    }

    // Post-process: add context and compute hashes
    for (auto& chunk : result.chunks) {
        chunk.hash = compute_content_hash(chunk.content);
        if (config_.include_context && !boundaries.empty()) {
            extract_context(chunk, source, boundaries);
        }
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    result.chunking_time_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();

    return result;
}

ChunkResult Chunker::chunk_file(const std::string& filepath) {
    MappedFile file;
    if (!file.open(filepath)) {
        ChunkResult result;
        result.error = "Failed to open file: " + filepath;
        return result;
    }

    std::string source(file.data(), file.size());
    return chunk(source, filepath);
}

std::vector<CodeChunk> Chunker::create_chunks_with_boundaries(
    const std::string& source,
    const std::vector<SemanticBoundary>& boundaries,
    Language language
) {
    std::vector<CodeChunk> chunks;
    uint32_t chunk_index = 0;

    // Group boundaries into semantic units
    std::vector<std::pair<size_t, size_t>> regions;
    std::vector<ChunkType> region_types;
    std::vector<std::string> region_names;

    size_t current_start = 0;
    ChunkType current_type = ChunkType::UNKNOWN;
    std::string current_name;

    for (size_t i = 0; i < boundaries.size(); i++) {
        const auto& boundary = boundaries[i];

        if (boundary.is_start) {
            // Start of a new semantic unit
            if (boundary.byte_offset > current_start) {
                // Save the region before this boundary
                regions.push_back({current_start, boundary.byte_offset});
                region_types.push_back(current_type);
                region_names.push_back(current_name);
            }
            current_start = boundary.byte_offset;
            current_type = boundary.type;
            current_name = boundary.name;
        } else {
            // End of a semantic unit
            size_t end_offset = boundary.byte_offset + 1;
            if (end_offset <= source.size()) {
                regions.push_back({current_start, end_offset});
                region_types.push_back(current_type);
                region_names.push_back(current_name);
                current_start = end_offset;
                current_type = ChunkType::UNKNOWN;
                current_name = "";
            }
        }
    }

    // Don't forget the last region
    if (current_start < source.size()) {
        regions.push_back({current_start, source.size()});
        region_types.push_back(current_type);
        region_names.push_back(current_name);
    }

    // Process each region
    for (size_t i = 0; i < regions.size(); i++) {
        auto [start, end] = regions[i];
        std::string region_content = source.substr(start, end - start);

        // Skip empty regions
        bool all_whitespace = true;
        for (char c : region_content) {
            if (!std::isspace(static_cast<unsigned char>(c))) {
                all_whitespace = false;
                break;
            }
        }
        if (all_whitespace) continue;

        uint32_t region_tokens = tokenizer_->count_tokens(region_content);

        if (region_tokens <= config_.max_chunk_tokens) {
            // Region fits in one chunk
            auto [line_start, col_start] = offset_to_location(source, start);
            auto [line_end, col_end] = offset_to_location(source, end);

            CodeChunk chunk;
            chunk.content = region_content;
            chunk.token_count = region_tokens;
            chunk.location = {
                line_start, line_end,
                col_start, col_end,
                static_cast<uint32_t>(start),
                static_cast<uint32_t>(end - start)
            };
            chunk.type = region_types[i];
            chunk.context.parent_name = region_names[i];
            chunk.chunk_index = chunk_index++;

            chunks.push_back(std::move(chunk));
        } else {
            // Region is too large, need to split
            // Use sliding window within the region
            size_t pos = start;
            size_t overlap_bytes = 0;

            while (pos < end) {
                // Find chunk end based on token count
                size_t chunk_start = pos;
                if (overlap_bytes > 0 && pos > start) {
                    chunk_start = pos - std::min(overlap_bytes, pos - start);
                }

                std::string remaining = source.substr(chunk_start, end - chunk_start);
                size_t chunk_byte_len = tokenizer_->find_token_boundary(
                    remaining,
                    config_.max_chunk_tokens
                );

                // Adjust to line boundary
                size_t chunk_end = chunk_start + chunk_byte_len;
                if (chunk_end < end) {
                    chunk_end = find_line_end(source, chunk_end);
                    if (chunk_end < source.size()) chunk_end++; // Include newline
                }
                chunk_end = std::min(chunk_end, end);

                std::string chunk_content = source.substr(chunk_start, chunk_end - chunk_start);
                uint32_t chunk_tokens = tokenizer_->count_tokens(chunk_content);

                auto [line_start, col_start] = offset_to_location(source, chunk_start);
                auto [line_end, col_end] = offset_to_location(source, chunk_end);

                CodeChunk chunk;
                chunk.content = chunk_content;
                chunk.token_count = chunk_tokens;
                chunk.location = {
                    line_start, line_end,
                    col_start, col_end,
                    static_cast<uint32_t>(chunk_start),
                    static_cast<uint32_t>(chunk_end - chunk_start)
                };
                chunk.type = region_types[i];
                chunk.context.parent_name = region_names[i];
                chunk.chunk_index = chunk_index++;

                chunks.push_back(std::move(chunk));

                // Calculate overlap for next chunk
                overlap_bytes = tokenizer_->find_token_boundary(
                    chunk_content,
                    config_.overlap_tokens
                );

                pos = chunk_end;

                // Avoid infinite loop
                if (chunk_end <= chunk_start) break;
            }
        }
    }

    return chunks;
}

std::vector<CodeChunk> Chunker::create_sliding_window_chunks(
    const std::string& source,
    Language /* language */
) {
    std::vector<CodeChunk> chunks;
    uint32_t chunk_index = 0;

    size_t pos = 0;
    size_t overlap_bytes = 0;

    while (pos < source.size()) {
        // Calculate chunk start with overlap
        size_t chunk_start = pos;
        if (overlap_bytes > 0 && pos > 0) {
            chunk_start = pos - std::min(overlap_bytes, pos);
        }

        // Find chunk end based on token count
        std::string remaining = source.substr(chunk_start);
        size_t chunk_byte_len = tokenizer_->find_token_boundary(
            remaining,
            config_.max_chunk_tokens
        );

        // Adjust to line boundary
        size_t chunk_end = chunk_start + chunk_byte_len;
        if (chunk_end < source.size()) {
            chunk_end = find_line_end(source, chunk_end);
            if (chunk_end < source.size()) chunk_end++; // Include newline
        }
        chunk_end = std::min(chunk_end, source.size());

        std::string chunk_content = source.substr(chunk_start, chunk_end - chunk_start);

        // Skip chunks that are too small (unless it's the last one)
        uint32_t chunk_tokens = tokenizer_->count_tokens(chunk_content);
        if (chunk_tokens < config_.min_chunk_tokens && chunk_end < source.size()) {
            // Extend to next line
            chunk_end = find_line_end(source, chunk_end + 1);
            if (chunk_end < source.size()) chunk_end++;
            chunk_end = std::min(chunk_end, source.size());
            chunk_content = source.substr(chunk_start, chunk_end - chunk_start);
            chunk_tokens = tokenizer_->count_tokens(chunk_content);
        }

        auto [line_start, col_start] = offset_to_location(source, chunk_start);
        auto [line_end, col_end] = offset_to_location(source, chunk_end);

        CodeChunk chunk;
        chunk.content = chunk_content;
        chunk.token_count = chunk_tokens;
        chunk.location = {
            line_start, line_end,
            col_start, col_end,
            static_cast<uint32_t>(chunk_start),
            static_cast<uint32_t>(chunk_end - chunk_start)
        };
        chunk.type = ChunkType::BLOCK;
        chunk.chunk_index = chunk_index++;

        chunks.push_back(std::move(chunk));

        // Calculate overlap for next chunk
        overlap_bytes = tokenizer_->find_token_boundary(
            chunk_content,
            config_.overlap_tokens
        );

        pos = chunk_end;

        // Avoid infinite loop
        if (chunk_end <= chunk_start) break;
    }

    return chunks;
}

void Chunker::extract_context(
    CodeChunk& chunk,
    const std::string& source,
    const std::vector<SemanticBoundary>& boundaries
) {
    // Find the enclosing scope for this chunk
    int best_depth = -1;
    std::string best_parent;
    std::string best_namespace;

    for (const auto& boundary : boundaries) {
        if (boundary.is_start &&
            boundary.byte_offset <= chunk.location.byte_offset &&
            boundary.scope_depth > best_depth) {

            if (boundary.type == ChunkType::FUNCTION ||
                boundary.type == ChunkType::CLASS) {
                best_parent = boundary.name;
                best_depth = boundary.scope_depth;
            } else if (boundary.type == ChunkType::MODULE) {
                best_namespace = boundary.name;
            }
        }
    }

    chunk.context.parent_name = best_parent;
    chunk.context.namespace_name = best_namespace;

    // Extract imports if configured
    if (config_.preserve_imports) {
        for (const auto& boundary : boundaries) {
            if (boundary.type == ChunkType::IMPORT) {
                // Get the import line
                size_t line_start = find_line_start(source, boundary.byte_offset);
                size_t line_end = find_line_end(source, boundary.byte_offset);
                std::string import_line = source.substr(line_start, line_end - line_start);

                // Only include if not already in chunk
                if (chunk.location.byte_offset > line_end ||
                    chunk.location.byte_offset + chunk.location.byte_length < line_start) {
                    chunk.context.imports.push_back(import_line);
                }
            }
        }
    }
}

std::string Chunker::compute_hash(const std::string& content) {
    return compute_content_hash(content);
}

} // namespace chunker
} // namespace archicore
