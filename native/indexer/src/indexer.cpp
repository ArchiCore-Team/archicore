/**
 * @file indexer.cpp
 * @brief Main Indexer implementation
 * @version 1.0.0
 */

#include "indexer.h"
#include <filesystem>
#include <algorithm>
#include <chrono>
#include <regex>
#include <fstream>

namespace fs = std::filesystem;

namespace archicore {
namespace indexer {

/**
 * @brief Simple glob pattern matching
 */
bool glob_match(const std::string& path, const std::string& pattern) {
    // Convert glob to regex
    std::string regex_str;
    regex_str.reserve(pattern.size() * 2);

    for (size_t i = 0; i < pattern.size(); i++) {
        char c = pattern[i];
        switch (c) {
            case '*':
                if (i + 1 < pattern.size() && pattern[i + 1] == '*') {
                    // ** matches any path
                    regex_str += ".*";
                    i++;
                } else {
                    // * matches anything except /
                    regex_str += "[^/\\\\]*";
                }
                break;
            case '?':
                regex_str += "[^/\\\\]";
                break;
            case '.':
            case '(':
            case ')':
            case '[':
            case ']':
            case '{':
            case '}':
            case '+':
            case '^':
            case '$':
            case '|':
            case '\\':
                regex_str += '\\';
                regex_str += c;
                break;
            default:
                regex_str += c;
                break;
        }
    }

    try {
        std::regex rx(regex_str, std::regex::icase);
        return std::regex_match(path, rx);
    } catch (...) {
        return false;
    }
}

/**
 * @brief FileIndex implementation
 */
struct FileIndex::Impl {
    std::unordered_map<std::string, FileEntry> entries;
    std::unique_ptr<MerkleTree> merkle;
    mutable std::mutex mutex;

    Impl() : merkle(std::make_unique<MerkleTree>()) {}
};

FileIndex::FileIndex() : impl_(std::make_unique<Impl>()) {}

FileIndex::~FileIndex() = default;

void FileIndex::add(const FileEntry& entry) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    impl_->entries[entry.path] = entry;
    impl_->merkle->add_file(entry.path, entry.content_hash);
}

void FileIndex::remove(const std::string& path) {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    impl_->entries.erase(path);
    impl_->merkle->remove_file(path);
}

const FileEntry* FileIndex::get(const std::string& path) const {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    auto it = impl_->entries.find(path);
    if (it != impl_->entries.end()) {
        return &it->second;
    }
    return nullptr;
}

bool FileIndex::contains(const std::string& path) const {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    return impl_->entries.find(path) != impl_->entries.end();
}

std::vector<FileEntry> FileIndex::get_all() const {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    std::vector<FileEntry> result;
    result.reserve(impl_->entries.size());
    for (const auto& [path, entry] : impl_->entries) {
        result.push_back(entry);
    }
    return result;
}

std::vector<FileEntry> FileIndex::get_by_language(Language language) const {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    std::vector<FileEntry> result;
    for (const auto& [path, entry] : impl_->entries) {
        if (entry.language == language) {
            result.push_back(entry);
        }
    }
    return result;
}

size_t FileIndex::size() const {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    return impl_->entries.size();
}

void FileIndex::clear() {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    impl_->entries.clear();
    impl_->merkle->clear();
}

bool FileIndex::save(const std::string& path) const {
    std::lock_guard<std::mutex> lock(impl_->mutex);

    std::ofstream file(path, std::ios::binary);
    if (!file.is_open()) return false;

    // Write magic and version
    uint32_t magic = 0x4649444E;  // "FIDN"
    uint32_t version = 1;
    file.write(reinterpret_cast<const char*>(&magic), 4);
    file.write(reinterpret_cast<const char*>(&version), 4);

    // Write entry count
    uint32_t count = static_cast<uint32_t>(impl_->entries.size());
    file.write(reinterpret_cast<const char*>(&count), 4);

    // Write entries
    for (const auto& [_, entry] : impl_->entries) {
        uint32_t path_len = static_cast<uint32_t>(entry.path.size());
        file.write(reinterpret_cast<const char*>(&path_len), 4);
        file.write(entry.path.data(), path_len);
        file.write(reinterpret_cast<const char*>(&entry.content_hash), 8);
        file.write(reinterpret_cast<const char*>(&entry.size), 8);
        file.write(reinterpret_cast<const char*>(&entry.mtime), 8);
        uint8_t lang = static_cast<uint8_t>(entry.language);
        file.write(reinterpret_cast<const char*>(&lang), 1);
        uint8_t indexed = entry.is_indexed ? 1 : 0;
        file.write(reinterpret_cast<const char*>(&indexed), 1);
    }

    // Write Merkle tree
    auto merkle_data = impl_->merkle->serialize();
    uint32_t merkle_size = static_cast<uint32_t>(merkle_data.size());
    file.write(reinterpret_cast<const char*>(&merkle_size), 4);
    file.write(reinterpret_cast<const char*>(merkle_data.data()), merkle_size);

    return true;
}

bool FileIndex::load(const std::string& path) {
    std::lock_guard<std::mutex> lock(impl_->mutex);

    std::ifstream file(path, std::ios::binary);
    if (!file.is_open()) return false;

    // Read magic and version
    uint32_t magic, version;
    file.read(reinterpret_cast<char*>(&magic), 4);
    file.read(reinterpret_cast<char*>(&version), 4);

    if (magic != 0x4649444E || version != 1) return false;

    // Read entries
    uint32_t count;
    file.read(reinterpret_cast<char*>(&count), 4);

    impl_->entries.clear();

    for (uint32_t i = 0; i < count; i++) {
        FileEntry entry;

        uint32_t path_len;
        file.read(reinterpret_cast<char*>(&path_len), 4);
        entry.path.resize(path_len);
        file.read(entry.path.data(), path_len);
        file.read(reinterpret_cast<char*>(&entry.content_hash), 8);
        file.read(reinterpret_cast<char*>(&entry.size), 8);
        file.read(reinterpret_cast<char*>(&entry.mtime), 8);
        uint8_t lang;
        file.read(reinterpret_cast<char*>(&lang), 1);
        entry.language = static_cast<Language>(lang);
        uint8_t indexed;
        file.read(reinterpret_cast<char*>(&indexed), 1);
        entry.is_indexed = (indexed != 0);

        impl_->entries[entry.path] = entry;
    }

    // Read Merkle tree
    uint32_t merkle_size;
    file.read(reinterpret_cast<char*>(&merkle_size), 4);

    std::vector<uint8_t> merkle_data(merkle_size);
    file.read(reinterpret_cast<char*>(merkle_data.data()), merkle_size);

    impl_->merkle->deserialize(merkle_data);

    return true;
}

uint64_t FileIndex::merkle_hash() const {
    std::lock_guard<std::mutex> lock(impl_->mutex);
    return impl_->merkle->root_hash();
}

/**
 * @brief Indexer implementation
 */
Indexer::Indexer(const IndexerConfig& config)
    : config_(config)
    , merkle_tree_(std::make_unique<MerkleTree>())
    , hasher_(std::make_unique<FileHasher>())
{
    // Set default patterns if empty
    if (config_.exclude_patterns.empty()) {
        config_.exclude_patterns = {
            "**/node_modules/**",
            "**/.git/**",
            "**/dist/**",
            "**/build/**",
            "**/__pycache__/**",
            "**/*.min.js",
            "**/*.min.css",
            "**/vendor/**",
            "**/.venv/**",
            "**/target/**"
        };
    }
}

Indexer::~Indexer() = default;

bool Indexer::should_include(const std::string& path) const {
    if (config_.include_patterns.empty()) return true;

    for (const auto& pattern : config_.include_patterns) {
        if (glob_match(path, pattern)) return true;
    }
    return false;
}

bool Indexer::should_exclude(const std::string& path) const {
    for (const auto& pattern : config_.exclude_patterns) {
        if (glob_match(path, pattern)) return true;
    }
    return false;
}

ScanResult Indexer::scan(
    const std::string& root_path,
    ProgressCallback progress
) {
    auto start_time = std::chrono::high_resolution_clock::now();

    ScanResult result;
    result.total_size = 0;
    result.total_files = 0;
    result.total_dirs = 0;

    fs::path root(root_path);
    if (!fs::exists(root) || !fs::is_directory(root)) {
        result.error = "Invalid directory: " + root_path;
        return result;
    }

    // First pass: collect all files
    std::vector<std::string> file_paths;
    std::vector<fs::path> dir_paths;

    try {
        for (const auto& entry : fs::recursive_directory_iterator(
            root,
            config_.follow_symlinks ?
                fs::directory_options::follow_directory_symlink :
                fs::directory_options::none
        )) {
            std::string rel_path = fs::relative(entry.path(), root).string();

            // Normalize path separators
            std::replace(rel_path.begin(), rel_path.end(), '\\', '/');

            if (should_exclude(rel_path)) continue;

            if (entry.is_directory()) {
                dir_paths.push_back(entry.path());
                result.total_dirs++;
            } else if (entry.is_regular_file()) {
                if (!should_include(rel_path)) continue;

                // Check file size
                auto file_size = entry.file_size();
                if (file_size > config_.max_file_size) continue;

                file_paths.push_back(entry.path().string());
                result.total_files++;
            }
        }
    } catch (const std::exception& e) {
        result.error = std::string("Scan error: ") + e.what();
        return result;
    }

    // Hash files in parallel
    std::vector<uint64_t> hashes;
    if (config_.compute_content_hash) {
        hashes = hasher_->hash_files_parallel(file_paths, config_.parallel_workers);
    } else {
        hashes.resize(file_paths.size(), 0);
    }

    // Build file entries
    merkle_tree_->clear();

    for (size_t i = 0; i < file_paths.size(); i++) {
        fs::path file_path(file_paths[i]);
        std::string rel_path = fs::relative(file_path, root).string();
        std::replace(rel_path.begin(), rel_path.end(), '\\', '/');

        FileEntry entry;
        entry.path = rel_path;
        entry.content_hash = hashes[i];

        try {
            entry.size = fs::file_size(file_path);
            auto mtime = fs::last_write_time(file_path);
            entry.mtime = std::chrono::duration_cast<std::chrono::milliseconds>(
                mtime.time_since_epoch()
            ).count();
        } catch (...) {
            entry.size = 0;
            entry.mtime = 0;
        }

        entry.language = detect_language(rel_path);
        entry.is_indexed = false;

        result.files.push_back(entry);
        result.total_size += entry.size;

        merkle_tree_->add_file(rel_path, entry.content_hash);

        if (progress && i % 100 == 0) {
            progress(static_cast<uint32_t>(i), static_cast<uint32_t>(file_paths.size()), rel_path);
        }
    }

    // Build directory entries
    for (const auto& dir_path : dir_paths) {
        std::string rel_path = fs::relative(dir_path, root).string();
        std::replace(rel_path.begin(), rel_path.end(), '\\', '/');

        DirEntry entry;
        entry.path = rel_path;
        entry.merkle_hash = merkle_tree_->compute_hash(rel_path);

        // Count files and dirs
        entry.file_count = 0;
        entry.dir_count = 0;
        for (const auto& file : result.files) {
            if (file.path.find(rel_path) == 0) {
                entry.file_count++;
            }
        }

        result.directories.push_back(entry);
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    result.scan_time_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();

    if (progress) {
        progress(result.total_files, result.total_files, "");
    }

    return result;
}

std::vector<FileChange> Indexer::detect_renames(
    const std::vector<FileEntry>& old_files,
    const std::vector<FileEntry>& new_files
) {
    std::vector<FileChange> renames;

    // Build hash -> path maps
    std::unordered_map<uint64_t, std::vector<std::string>> old_hashes;
    std::unordered_map<uint64_t, std::vector<std::string>> new_hashes;

    std::unordered_set<std::string> old_paths;
    std::unordered_set<std::string> new_paths;

    for (const auto& entry : old_files) {
        if (entry.content_hash != 0) {
            old_hashes[entry.content_hash].push_back(entry.path);
        }
        old_paths.insert(entry.path);
    }

    for (const auto& entry : new_files) {
        if (entry.content_hash != 0) {
            new_hashes[entry.content_hash].push_back(entry.path);
        }
        new_paths.insert(entry.path);
    }

    // Find potential renames: same hash, different path
    for (const auto& [hash, old_file_paths] : old_hashes) {
        auto new_it = new_hashes.find(hash);
        if (new_it == new_hashes.end()) continue;

        for (const auto& old_path : old_file_paths) {
            // Skip if file still exists
            if (new_paths.count(old_path)) continue;

            for (const auto& new_path : new_it->second) {
                // Skip if file existed before
                if (old_paths.count(new_path)) continue;

                FileChange change;
                change.type = ChangeType::RENAMED;
                change.old_path = old_path;
                change.path = new_path;
                change.old_hash = hash;
                change.new_hash = hash;

                renames.push_back(change);
            }
        }
    }

    return renames;
}

DiffResult Indexer::diff(
    const ScanResult& old_scan,
    const ScanResult& new_scan
) {
    auto start_time = std::chrono::high_resolution_clock::now();

    DiffResult result;
    result.added_count = 0;
    result.modified_count = 0;
    result.deleted_count = 0;
    result.renamed_count = 0;

    // Build maps for quick lookup
    std::unordered_map<std::string, const FileEntry*> old_files;
    std::unordered_map<std::string, const FileEntry*> new_files;

    for (const auto& entry : old_scan.files) {
        old_files[entry.path] = &entry;
    }

    for (const auto& entry : new_scan.files) {
        new_files[entry.path] = &entry;
    }

    // Detect renames first if enabled
    std::unordered_set<std::string> renamed_old_paths;
    std::unordered_set<std::string> renamed_new_paths;

    if (config_.detect_renames) {
        auto renames = detect_renames(old_scan.files, new_scan.files);
        for (auto& rename : renames) {
            renamed_old_paths.insert(rename.old_path);
            renamed_new_paths.insert(rename.path);
            result.changes.push_back(rename);
            result.renamed_count++;
        }
    }

    // Find added and modified files
    for (const auto& [path, new_entry] : new_files) {
        if (renamed_new_paths.count(path)) continue;

        auto old_it = old_files.find(path);
        if (old_it == old_files.end()) {
            // Added
            FileChange change;
            change.type = ChangeType::ADDED;
            change.path = path;
            change.old_hash = 0;
            change.new_hash = new_entry->content_hash;
            result.changes.push_back(change);
            result.added_count++;
        } else {
            // Check if modified
            const FileEntry* old_entry = old_it->second;
            if (old_entry->content_hash != new_entry->content_hash) {
                FileChange change;
                change.type = ChangeType::MODIFIED;
                change.path = path;
                change.old_hash = old_entry->content_hash;
                change.new_hash = new_entry->content_hash;
                result.changes.push_back(change);
                result.modified_count++;
            }
        }
    }

    // Find deleted files
    for (const auto& [path, old_entry] : old_files) {
        if (renamed_old_paths.count(path)) continue;

        if (new_files.find(path) == new_files.end()) {
            FileChange change;
            change.type = ChangeType::DELETED;
            change.path = path;
            change.old_hash = old_entry->content_hash;
            change.new_hash = 0;
            result.changes.push_back(change);
            result.deleted_count++;
        }
    }

    auto end_time = std::chrono::high_resolution_clock::now();
    result.diff_time_ms = std::chrono::duration<double, std::milli>(end_time - start_time).count();

    return result;
}

DiffResult Indexer::incremental_update(
    const std::string& root_path,
    const FileIndex& previous_index
) {
    // Scan new state
    ScanResult new_scan = scan(root_path);

    // Build old scan from index
    ScanResult old_scan;
    old_scan.files = previous_index.get_all();

    return diff(old_scan, new_scan);
}

void Indexer::set_config(const IndexerConfig& config) {
    config_ = config;
}

const IndexerConfig& Indexer::get_config() const {
    return config_;
}

const MerkleTree& Indexer::get_merkle_tree() const {
    return *merkle_tree_;
}

} // namespace indexer
} // namespace archicore
