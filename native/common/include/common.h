/**
 * @file common.h
 * @brief Common types and utilities for ArchiCore native modules
 * @version 1.0.0
 */

#ifndef ARCHICORE_COMMON_H
#define ARCHICORE_COMMON_H

// Windows compatibility: prevent min/max macro conflicts
#ifdef _WIN32
#define NOMINMAX
#define WIN32_LEAN_AND_MEAN
// Undefine Windows macros that conflict with our enum values
#ifdef INTERFACE
#undef INTERFACE
#endif
#endif

#include <string>
#include <vector>
#include <cstdint>
#include <memory>
#include <functional>
#include <optional>
#include <chrono>
#include <filesystem>

namespace archicore {

/**
 * @brief Result wrapper for operations that can fail
 */
template<typename T>
struct Result {
    bool success;
    T value;
    std::string error;

    static Result<T> ok(T val) {
        return Result<T>{true, std::move(val), ""};
    }

    static Result<T> fail(const std::string& err) {
        return Result<T>{false, T{}, err};
    }
};

/**
 * @brief File information structure
 */
struct FileInfo {
    std::string path;
    uint64_t size;
    uint64_t mtime;
    bool is_directory;
};

/**
 * @brief Source location information
 */
struct SourceLocation {
    uint32_t line_start;
    uint32_t line_end;
    uint32_t column_start;
    uint32_t column_end;
    uint32_t byte_offset;
    uint32_t byte_length;
};

/**
 * @brief Chunk type enumeration
 */
enum class ChunkType : uint8_t {
    UNKNOWN = 0,
    FUNCTION = 1,
    CLASS = 2,
    STRUCT = 3,
    INTERFACE = 4,
    ENUM = 5,
    MODULE = 6,
    IMPORT = 7,
    EXPORT = 8,
    COMMENT = 9,
    BLOCK = 10,
    STATEMENT = 11
};

/**
 * @brief Convert ChunkType to string
 */
inline const char* chunk_type_to_string(ChunkType type) {
    switch (type) {
        case ChunkType::FUNCTION: return "function";
        case ChunkType::CLASS: return "class";
        case ChunkType::STRUCT: return "struct";
        case ChunkType::INTERFACE: return "interface";
        case ChunkType::ENUM: return "enum";
        case ChunkType::MODULE: return "module";
        case ChunkType::IMPORT: return "import";
        case ChunkType::EXPORT: return "export";
        case ChunkType::COMMENT: return "comment";
        case ChunkType::BLOCK: return "block";
        case ChunkType::STATEMENT: return "statement";
        default: return "unknown";
    }
}

/**
 * @brief Language enumeration
 */
enum class Language : uint8_t {
    UNKNOWN = 0,
    JAVASCRIPT = 1,
    TYPESCRIPT = 2,
    PYTHON = 3,
    RUST = 4,
    GO = 5,
    JAVA = 6,
    CPP = 7,
    C = 8,
    CSHARP = 9,
    RUBY = 10,
    PHP = 11,
    SWIFT = 12,
    KOTLIN = 13
};

/**
 * @brief Detect language from file extension
 */
inline Language detect_language(const std::string& path) {
    namespace fs = std::filesystem;
    std::string ext = fs::path(path).extension().string();

    // Convert to lowercase
    for (auto& c : ext) {
        c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
    }

    if (ext == ".js" || ext == ".mjs" || ext == ".cjs") return Language::JAVASCRIPT;
    if (ext == ".ts" || ext == ".tsx" || ext == ".mts") return Language::TYPESCRIPT;
    if (ext == ".py" || ext == ".pyw") return Language::PYTHON;
    if (ext == ".rs") return Language::RUST;
    if (ext == ".go") return Language::GO;
    if (ext == ".java") return Language::JAVA;
    if (ext == ".cpp" || ext == ".cc" || ext == ".cxx" || ext == ".hpp" || ext == ".hxx" || ext == ".h") return Language::CPP;
    if (ext == ".c") return Language::C;
    if (ext == ".cs") return Language::CSHARP;
    if (ext == ".rb") return Language::RUBY;
    if (ext == ".php") return Language::PHP;
    if (ext == ".swift") return Language::SWIFT;
    if (ext == ".kt" || ext == ".kts") return Language::KOTLIN;

    return Language::UNKNOWN;
}

/**
 * @brief Get current timestamp in milliseconds
 */
inline uint64_t current_timestamp_ms() {
    using namespace std::chrono;
    return static_cast<uint64_t>(
        duration_cast<milliseconds>(
            system_clock::now().time_since_epoch()
        ).count()
    );
}

/**
 * @brief Memory-mapped file reader (cross-platform)
 */
class MappedFile {
public:
    MappedFile() : data_(nullptr), size_(0) {}
    ~MappedFile() { close(); }

    // Disable copy
    MappedFile(const MappedFile&) = delete;
    MappedFile& operator=(const MappedFile&) = delete;

    // Enable move
    MappedFile(MappedFile&& other) noexcept
        : data_(other.data_), size_(other.size_)
#ifdef _WIN32
        , file_handle_(other.file_handle_), mapping_handle_(other.mapping_handle_)
#else
        , fd_(other.fd_)
#endif
    {
        other.data_ = nullptr;
        other.size_ = 0;
#ifdef _WIN32
        other.file_handle_ = nullptr;
        other.mapping_handle_ = nullptr;
#else
        other.fd_ = -1;
#endif
    }

    bool open(const std::string& path);
    void close();

    const char* data() const { return data_; }
    size_t size() const { return size_; }
    bool is_open() const { return data_ != nullptr; }

    std::string_view view() const {
        return std::string_view(data_, size_);
    }

private:
    char* data_;
    size_t size_;

#ifdef _WIN32
    void* file_handle_ = nullptr;
    void* mapping_handle_ = nullptr;
#else
    int fd_ = -1;
#endif
};

} // namespace archicore

// Platform-specific implementations
#ifdef _WIN32
// Windows.h must be included after NOMINMAX is defined
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
// Undefine problematic Windows macros
#ifdef INTERFACE
#undef INTERFACE
#endif
#ifdef min
#undef min
#endif
#ifdef max
#undef max
#endif

inline bool archicore::MappedFile::open(const std::string& path) {
    close();

    file_handle_ = CreateFileA(
        path.c_str(),
        GENERIC_READ,
        FILE_SHARE_READ,
        nullptr,
        OPEN_EXISTING,
        FILE_ATTRIBUTE_NORMAL,
        nullptr
    );

    if (file_handle_ == INVALID_HANDLE_VALUE) {
        file_handle_ = nullptr;
        return false;
    }

    LARGE_INTEGER file_size;
    if (!GetFileSizeEx(file_handle_, &file_size)) {
        CloseHandle(file_handle_);
        file_handle_ = nullptr;
        return false;
    }

    size_ = static_cast<size_t>(file_size.QuadPart);

    if (size_ == 0) {
        // Handle empty files
        CloseHandle(file_handle_);
        file_handle_ = nullptr;
        data_ = nullptr;
        return true;
    }

    mapping_handle_ = CreateFileMappingA(
        file_handle_,
        nullptr,
        PAGE_READONLY,
        0, 0,
        nullptr
    );

    if (mapping_handle_ == nullptr) {
        CloseHandle(file_handle_);
        file_handle_ = nullptr;
        return false;
    }

    data_ = static_cast<char*>(MapViewOfFile(
        mapping_handle_,
        FILE_MAP_READ,
        0, 0, 0
    ));

    if (data_ == nullptr) {
        CloseHandle(mapping_handle_);
        CloseHandle(file_handle_);
        mapping_handle_ = nullptr;
        file_handle_ = nullptr;
        return false;
    }

    return true;
}

inline void archicore::MappedFile::close() {
    if (data_ != nullptr) {
        UnmapViewOfFile(data_);
        data_ = nullptr;
    }
    if (mapping_handle_ != nullptr) {
        CloseHandle(mapping_handle_);
        mapping_handle_ = nullptr;
    }
    if (file_handle_ != nullptr) {
        CloseHandle(file_handle_);
        file_handle_ = nullptr;
    }
    size_ = 0;
}

#else
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>

inline bool archicore::MappedFile::open(const std::string& path) {
    close();

    fd_ = ::open(path.c_str(), O_RDONLY);
    if (fd_ == -1) {
        return false;
    }

    struct stat st;
    if (fstat(fd_, &st) == -1) {
        ::close(fd_);
        fd_ = -1;
        return false;
    }

    size_ = static_cast<size_t>(st.st_size);

    if (size_ == 0) {
        // Handle empty files
        ::close(fd_);
        fd_ = -1;
        data_ = nullptr;
        return true;
    }

    data_ = static_cast<char*>(mmap(
        nullptr,
        size_,
        PROT_READ,
        MAP_PRIVATE,
        fd_,
        0
    ));

    if (data_ == MAP_FAILED) {
        data_ = nullptr;
        ::close(fd_);
        fd_ = -1;
        return false;
    }

    return true;
}

inline void archicore::MappedFile::close() {
    if (data_ != nullptr) {
        munmap(data_, size_);
        data_ = nullptr;
    }
    if (fd_ != -1) {
        ::close(fd_);
        fd_ = -1;
    }
    size_ = 0;
}

#endif

#endif // ARCHICORE_COMMON_H
