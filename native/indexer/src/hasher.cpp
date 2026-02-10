/**
 * @file hasher.cpp
 * @brief Fast file hashing with xxHash64
 * @version 1.0.0
 */

#ifdef _WIN32
#define NOMINMAX
#endif

#include "indexer.h"
#include <fstream>
#include <thread>
#include <future>
#include <queue>

namespace archicore {
namespace indexer {

// xxHash64 constants
static constexpr uint64_t PRIME64_1 = 0x9E3779B185EBCA87ULL;
static constexpr uint64_t PRIME64_2 = 0xC2B2AE3D27D4EB4FULL;
static constexpr uint64_t PRIME64_3 = 0x165667B19E3779F9ULL;
static constexpr uint64_t PRIME64_4 = 0x85EBCA77C2B2AE63ULL;
static constexpr uint64_t PRIME64_5 = 0x27D4EB2F165667C5ULL;

/**
 * @brief xxHash64 implementation
 */
class XXHash64 {
public:
    static uint64_t hash(const void* data, size_t len, uint64_t seed = 0) {
        const uint8_t* p = static_cast<const uint8_t*>(data);
        const uint8_t* end = p + len;
        uint64_t h64;

        if (len >= 32) {
            const uint8_t* limit = end - 32;
            uint64_t v1 = seed + PRIME64_1 + PRIME64_2;
            uint64_t v2 = seed + PRIME64_2;
            uint64_t v3 = seed;
            uint64_t v4 = seed - PRIME64_1;

            do {
                v1 = round(v1, read64(p)); p += 8;
                v2 = round(v2, read64(p)); p += 8;
                v3 = round(v3, read64(p)); p += 8;
                v4 = round(v4, read64(p)); p += 8;
            } while (p <= limit);

            h64 = rotl64(v1, 1) + rotl64(v2, 7) + rotl64(v3, 12) + rotl64(v4, 18);
            h64 = merge_round(h64, v1);
            h64 = merge_round(h64, v2);
            h64 = merge_round(h64, v3);
            h64 = merge_round(h64, v4);
        } else {
            h64 = seed + PRIME64_5;
        }

        h64 += static_cast<uint64_t>(len);

        while (p + 8 <= end) {
            h64 ^= round(0, read64(p));
            h64 = rotl64(h64, 27) * PRIME64_1 + PRIME64_4;
            p += 8;
        }

        while (p + 4 <= end) {
            h64 ^= static_cast<uint64_t>(read32(p)) * PRIME64_1;
            h64 = rotl64(h64, 23) * PRIME64_2 + PRIME64_3;
            p += 4;
        }

        while (p < end) {
            h64 ^= static_cast<uint64_t>(*p) * PRIME64_5;
            h64 = rotl64(h64, 11) * PRIME64_1;
            p++;
        }

        h64 ^= h64 >> 33;
        h64 *= PRIME64_2;
        h64 ^= h64 >> 29;
        h64 *= PRIME64_3;
        h64 ^= h64 >> 32;

        return h64;
    }

private:
    static uint64_t rotl64(uint64_t x, int r) {
        return (x << r) | (x >> (64 - r));
    }

    static uint64_t read64(const void* p) {
        uint64_t val;
        memcpy(&val, p, sizeof(val));
        return val;
    }

    static uint32_t read32(const void* p) {
        uint32_t val;
        memcpy(&val, p, sizeof(val));
        return val;
    }

    static uint64_t round(uint64_t acc, uint64_t input) {
        acc += input * PRIME64_2;
        acc = rotl64(acc, 31);
        acc *= PRIME64_1;
        return acc;
    }

    static uint64_t merge_round(uint64_t acc, uint64_t val) {
        val = round(0, val);
        acc ^= val;
        acc = acc * PRIME64_1 + PRIME64_4;
        return acc;
    }
};

/**
 * @brief Streaming xxHash64 for large files
 */
class XXHash64Stream {
public:
    XXHash64Stream(uint64_t seed = 0) : seed_(seed) {
        reset();
    }

    void reset() {
        total_len_ = 0;
        v1_ = seed_ + PRIME64_1 + PRIME64_2;
        v2_ = seed_ + PRIME64_2;
        v3_ = seed_;
        v4_ = seed_ - PRIME64_1;
        mem_size_ = 0;
    }

    void update(const void* data, size_t len) {
        const uint8_t* p = static_cast<const uint8_t*>(data);
        const uint8_t* end = p + len;

        total_len_ += len;

        // Fill buffer if we have leftover
        if (mem_size_ > 0) {
            size_t to_fill = 32 - mem_size_;
            if (len < to_fill) {
                memcpy(mem_ + mem_size_, p, len);
                mem_size_ += len;
                return;
            }
            memcpy(mem_ + mem_size_, p, to_fill);
            p += to_fill;

            v1_ = round(v1_, read64(mem_));
            v2_ = round(v2_, read64(mem_ + 8));
            v3_ = round(v3_, read64(mem_ + 16));
            v4_ = round(v4_, read64(mem_ + 24));
            mem_size_ = 0;
        }

        // Process 32-byte blocks
        if (p + 32 <= end) {
            const uint8_t* limit = end - 32;
            do {
                v1_ = round(v1_, read64(p)); p += 8;
                v2_ = round(v2_, read64(p)); p += 8;
                v3_ = round(v3_, read64(p)); p += 8;
                v4_ = round(v4_, read64(p)); p += 8;
            } while (p <= limit);
        }

        // Store remainder
        if (p < end) {
            mem_size_ = end - p;
            memcpy(mem_, p, mem_size_);
        }
    }

    uint64_t finalize() {
        uint64_t h64;

        if (total_len_ >= 32) {
            h64 = rotl64(v1_, 1) + rotl64(v2_, 7) + rotl64(v3_, 12) + rotl64(v4_, 18);
            h64 = merge_round(h64, v1_);
            h64 = merge_round(h64, v2_);
            h64 = merge_round(h64, v3_);
            h64 = merge_round(h64, v4_);
        } else {
            h64 = seed_ + PRIME64_5;
        }

        h64 += total_len_;

        const uint8_t* p = mem_;
        const uint8_t* end = p + mem_size_;

        while (p + 8 <= end) {
            h64 ^= round(0, read64(p));
            h64 = rotl64(h64, 27) * PRIME64_1 + PRIME64_4;
            p += 8;
        }

        while (p + 4 <= end) {
            h64 ^= static_cast<uint64_t>(read32(p)) * PRIME64_1;
            h64 = rotl64(h64, 23) * PRIME64_2 + PRIME64_3;
            p += 4;
        }

        while (p < end) {
            h64 ^= static_cast<uint64_t>(*p) * PRIME64_5;
            h64 = rotl64(h64, 11) * PRIME64_1;
            p++;
        }

        h64 ^= h64 >> 33;
        h64 *= PRIME64_2;
        h64 ^= h64 >> 29;
        h64 *= PRIME64_3;
        h64 ^= h64 >> 32;

        return h64;
    }

private:
    static uint64_t rotl64(uint64_t x, int r) {
        return (x << r) | (x >> (64 - r));
    }

    static uint64_t read64(const void* p) {
        uint64_t val;
        memcpy(&val, p, sizeof(val));
        return val;
    }

    static uint32_t read32(const void* p) {
        uint32_t val;
        memcpy(&val, p, sizeof(val));
        return val;
    }

    static uint64_t round(uint64_t acc, uint64_t input) {
        acc += input * PRIME64_2;
        acc = rotl64(acc, 31);
        acc *= PRIME64_1;
        return acc;
    }

    static uint64_t merge_round(uint64_t acc, uint64_t val) {
        val = round(0, val);
        acc ^= val;
        acc = acc * PRIME64_1 + PRIME64_4;
        return acc;
    }

    uint64_t seed_;
    uint64_t total_len_;
    uint64_t v1_, v2_, v3_, v4_;
    uint8_t mem_[32];
    size_t mem_size_;
};

struct FileHasher::Impl {
    static constexpr size_t BUFFER_SIZE = 64 * 1024;  // 64KB buffer

    uint64_t hash_file_impl(const std::string& path) {
        // Try memory mapping first
        MappedFile mapped;
        if (mapped.open(path)) {
            if (mapped.size() == 0) return 0;
            return XXHash64::hash(mapped.data(), mapped.size());
        }

        // Fall back to streaming
        std::ifstream file(path, std::ios::binary);
        if (!file.is_open()) return 0;

        XXHash64Stream hasher;
        char buffer[BUFFER_SIZE];

        while (file) {
            file.read(buffer, BUFFER_SIZE);
            std::streamsize bytes_read = file.gcount();
            if (bytes_read > 0) {
                hasher.update(buffer, static_cast<size_t>(bytes_read));
            }
        }

        return hasher.finalize();
    }
};

FileHasher::FileHasher() : impl_(std::make_unique<Impl>()) {}

FileHasher::~FileHasher() = default;

uint64_t FileHasher::hash_file(const std::string& path) {
    return impl_->hash_file_impl(path);
}

uint64_t FileHasher::hash_string(const std::string& content) {
    return XXHash64::hash(content.data(), content.size());
}

std::vector<uint64_t> FileHasher::hash_files_parallel(
    const std::vector<std::string>& paths,
    uint32_t num_workers
) {
    std::vector<uint64_t> results(paths.size(), 0);

    if (paths.empty()) return results;

    // Limit workers to actual CPU count
    num_workers = std::min(num_workers, std::thread::hardware_concurrency());
    num_workers = std::max(num_workers, 1u);

    // For small number of files, use single thread
    if (paths.size() <= num_workers) {
        for (size_t i = 0; i < paths.size(); i++) {
            results[i] = hash_file(paths[i]);
        }
        return results;
    }

    // Parallel hashing with thread pool
    std::vector<std::future<void>> futures;
    std::atomic<size_t> next_index{0};

    for (uint32_t w = 0; w < num_workers; w++) {
        futures.push_back(std::async(std::launch::async, [&]() {
            FileHasher local_hasher;
            size_t idx;
            while ((idx = next_index.fetch_add(1)) < paths.size()) {
                results[idx] = local_hasher.hash_file(paths[idx]);
            }
        }));
    }

    for (auto& f : futures) {
        f.wait();
    }

    return results;
}

} // namespace indexer
} // namespace archicore
