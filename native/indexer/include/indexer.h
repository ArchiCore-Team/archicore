/**
 * @file indexer.h
 * @brief Incremental Index Engine for ArchiCore
 * @version 1.0.0
 *
 * High-performance incremental file indexing with:
 * - Content-aware hashing (xxHash64)
 * - Merkle tree for directory changes
 * - Delta detection between commits
 * - Memory-mapped file reading
 */

#ifndef ARCHICORE_INDEXER_H
#define ARCHICORE_INDEXER_H

#include "common.h"
#include <string>
#include <vector>
#include <memory>
#include <unordered_map>
#include <unordered_set>
#include <functional>
#include <mutex>

namespace archicore {
namespace indexer {

// Forward declarations
class MerkleTree;
class FileIndex;

/**
 * @brief File entry in the index
 */
struct FileEntry {
    std::string path;           // Relative path from root
    uint64_t content_hash;      // xxHash64 of content
    uint64_t size;              // File size in bytes
    uint64_t mtime;             // Last modification time (ms since epoch)
    Language language;          // Detected language
    bool is_indexed;            // Whether content has been indexed
};

/**
 * @brief Directory entry with Merkle hash
 */
struct DirEntry {
    std::string path;           // Relative path from root
    uint64_t merkle_hash;       // Combined hash of all children
    uint32_t file_count;        // Number of files (recursive)
    uint32_t dir_count;         // Number of subdirs (recursive)
};

/**
 * @brief Change type enumeration
 */
enum class ChangeType {
    ADDED,
    MODIFIED,
    DELETED,
    RENAMED
};

/**
 * @brief Represents a detected file change
 */
struct FileChange {
    ChangeType type;
    std::string path;
    std::string old_path;       // For renames
    uint64_t old_hash;
    uint64_t new_hash;
};

/**
 * @brief Result of scanning operation
 */
struct ScanResult {
    std::vector<FileEntry> files;
    std::vector<DirEntry> directories;
    uint64_t total_size;
    uint32_t total_files;
    uint32_t total_dirs;
    double scan_time_ms;
    std::string error;
};

/**
 * @brief Result of diff operation
 */
struct DiffResult {
    std::vector<FileChange> changes;
    uint32_t added_count;
    uint32_t modified_count;
    uint32_t deleted_count;
    uint32_t renamed_count;
    double diff_time_ms;
    std::string error;
};

/**
 * @brief Configuration for the indexer
 */
struct IndexerConfig {
    std::vector<std::string> include_patterns;  // Glob patterns to include
    std::vector<std::string> exclude_patterns;  // Glob patterns to exclude
    bool follow_symlinks = false;
    bool compute_content_hash = true;
    bool detect_renames = true;
    uint32_t max_file_size = 10 * 1024 * 1024;  // 10MB default
    uint32_t parallel_workers = 4;
};

/**
 * @brief Callback for progress reporting
 */
using ProgressCallback = std::function<void(uint32_t processed, uint32_t total, const std::string& current_file)>;

/**
 * @brief Fast xxHash64 hasher for files
 */
class FileHasher {
public:
    FileHasher();
    ~FileHasher();

    /**
     * @brief Hash file content
     * @param path File path
     * @return Content hash (0 on error)
     */
    uint64_t hash_file(const std::string& path);

    /**
     * @brief Hash string content
     * @param content String content
     * @return Content hash
     */
    uint64_t hash_string(const std::string& content);

    /**
     * @brief Hash multiple files in parallel
     * @param paths File paths
     * @return Vector of hashes (0 for errors)
     */
    std::vector<uint64_t> hash_files_parallel(
        const std::vector<std::string>& paths,
        uint32_t num_workers = 4
    );

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

/**
 * @brief Merkle tree for directory hashing
 */
class MerkleTree {
public:
    MerkleTree();
    ~MerkleTree();

    /**
     * @brief Add a file to the tree
     * @param path File path
     * @param content_hash File content hash
     */
    void add_file(const std::string& path, uint64_t content_hash);

    /**
     * @brief Remove a file from the tree
     * @param path File path
     */
    void remove_file(const std::string& path);

    /**
     * @brief Compute Merkle hash for a directory
     * @param dir_path Directory path
     * @return Merkle hash of directory
     */
    uint64_t compute_hash(const std::string& dir_path);

    /**
     * @brief Get the root hash
     * @return Root Merkle hash
     */
    uint64_t root_hash() const;

    /**
     * @brief Compare with another tree and get changed paths
     * @param other Other Merkle tree
     * @return List of changed directory paths
     */
    std::vector<std::string> diff(const MerkleTree& other) const;

    /**
     * @brief Clear the tree
     */
    void clear();

    /**
     * @brief Serialize to bytes
     * @return Serialized tree
     */
    std::vector<uint8_t> serialize() const;

    /**
     * @brief Deserialize from bytes
     * @param data Serialized tree
     * @return true on success
     */
    bool deserialize(const std::vector<uint8_t>& data);

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

/**
 * @brief Main Indexer class
 */
class Indexer {
public:
    explicit Indexer(const IndexerConfig& config = IndexerConfig{});
    ~Indexer();

    /**
     * @brief Scan a directory and build index
     * @param root_path Directory to scan
     * @param progress Optional progress callback
     * @return Scan result with all files
     */
    ScanResult scan(
        const std::string& root_path,
        ProgressCallback progress = nullptr
    );

    /**
     * @brief Compute diff between two scans
     * @param old_scan Previous scan result
     * @param new_scan New scan result
     * @return Diff result with changes
     */
    DiffResult diff(
        const ScanResult& old_scan,
        const ScanResult& new_scan
    );

    /**
     * @brief Incremental update - detect changes since last scan
     * @param root_path Directory to scan
     * @param previous_index Previous file index
     * @return Diff result with changes
     */
    DiffResult incremental_update(
        const std::string& root_path,
        const FileIndex& previous_index
    );

    /**
     * @brief Update configuration
     * @param config New configuration
     */
    void set_config(const IndexerConfig& config);

    /**
     * @brief Get current configuration
     * @return Current configuration
     */
    const IndexerConfig& get_config() const;

    /**
     * @brief Get the Merkle tree
     * @return Reference to internal Merkle tree
     */
    const MerkleTree& get_merkle_tree() const;

private:
    IndexerConfig config_;
    std::unique_ptr<MerkleTree> merkle_tree_;
    std::unique_ptr<FileHasher> hasher_;

    bool should_include(const std::string& path) const;
    bool should_exclude(const std::string& path) const;
    std::vector<FileChange> detect_renames(
        const std::vector<FileEntry>& old_files,
        const std::vector<FileEntry>& new_files
    );
};

/**
 * @brief Persistent file index
 */
class FileIndex {
public:
    FileIndex();
    ~FileIndex();

    /**
     * @brief Add or update a file entry
     * @param entry File entry to add
     */
    void add(const FileEntry& entry);

    /**
     * @brief Remove a file entry
     * @param path File path
     */
    void remove(const std::string& path);

    /**
     * @brief Get a file entry
     * @param path File path
     * @return File entry or nullptr if not found
     */
    const FileEntry* get(const std::string& path) const;

    /**
     * @brief Check if file exists in index
     * @param path File path
     * @return true if exists
     */
    bool contains(const std::string& path) const;

    /**
     * @brief Get all file entries
     * @return All entries
     */
    std::vector<FileEntry> get_all() const;

    /**
     * @brief Get files by language
     * @param language Language to filter
     * @return Matching entries
     */
    std::vector<FileEntry> get_by_language(Language language) const;

    /**
     * @brief Get total file count
     * @return Number of files
     */
    size_t size() const;

    /**
     * @brief Clear the index
     */
    void clear();

    /**
     * @brief Save index to file
     * @param path File path
     * @return true on success
     */
    bool save(const std::string& path) const;

    /**
     * @brief Load index from file
     * @param path File path
     * @return true on success
     */
    bool load(const std::string& path);

    /**
     * @brief Get Merkle hash for the index
     * @return Merkle root hash
     */
    uint64_t merkle_hash() const;

private:
    struct Impl;
    std::unique_ptr<Impl> impl_;
};

/**
 * @brief Utility: Match path against glob pattern
 * @param path Path to match
 * @param pattern Glob pattern
 * @return true if matches
 */
bool glob_match(const std::string& path, const std::string& pattern);

} // namespace indexer
} // namespace archicore

#endif // ARCHICORE_INDEXER_H
