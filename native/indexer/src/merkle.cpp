/**
 * @file merkle.cpp
 * @brief Merkle tree implementation for directory hashing
 * @version 1.0.0
 */

#ifdef _WIN32
#define NOMINMAX
#endif

#include "indexer.h"
#include <map>
#include <set>
#include <algorithm>
#include <sstream>

namespace archicore {
namespace indexer {

// xxHash64 for combining hashes
static uint64_t combine_hashes(uint64_t h1, uint64_t h2) {
    // Use a simple but effective combination
    constexpr uint64_t PRIME = 0x9E3779B185EBCA87ULL;
    return (h1 ^ (h2 + PRIME + (h1 << 6) + (h1 >> 2)));
}

/**
 * @brief Node in the Merkle tree
 */
struct MerkleNode {
    std::string name;
    uint64_t hash;
    bool is_file;
    std::map<std::string, std::unique_ptr<MerkleNode>> children;

    MerkleNode(const std::string& n = "", uint64_t h = 0, bool file = false)
        : name(n), hash(h), is_file(file) {}
};

struct MerkleTree::Impl {
    std::unique_ptr<MerkleNode> root;
    bool dirty;

    Impl() : root(std::make_unique<MerkleNode>("", 0, false)), dirty(false) {}

    /**
     * @brief Split path into components
     */
    static std::vector<std::string> split_path(const std::string& path) {
        std::vector<std::string> components;
        std::string component;

        for (char c : path) {
            if (c == '/' || c == '\\') {
                if (!component.empty()) {
                    components.push_back(component);
                    component.clear();
                }
            } else {
                component += c;
            }
        }
        if (!component.empty()) {
            components.push_back(component);
        }

        return components;
    }

    /**
     * @brief Get or create node for path
     */
    MerkleNode* get_or_create_node(const std::string& path, bool is_file) {
        auto components = split_path(path);
        MerkleNode* current = root.get();

        for (size_t i = 0; i < components.size(); i++) {
            const std::string& comp = components[i];
            bool is_last = (i == components.size() - 1);

            auto it = current->children.find(comp);
            if (it == current->children.end()) {
                auto node = std::make_unique<MerkleNode>(comp, 0, is_last && is_file);
                current->children[comp] = std::move(node);
                it = current->children.find(comp);
            }
            current = it->second.get();
        }

        return current;
    }

    /**
     * @brief Recursively compute hash for a node
     */
    uint64_t compute_node_hash(MerkleNode* node) {
        if (node->is_file) {
            return node->hash;
        }

        // For directories, combine children hashes
        uint64_t combined = 0;

        // Sort children for deterministic hash
        std::vector<std::pair<std::string, MerkleNode*>> sorted_children;
        for (auto& [name, child] : node->children) {
            sorted_children.push_back({name, child.get()});
        }
        std::sort(sorted_children.begin(), sorted_children.end(),
            [](const auto& a, const auto& b) { return a.first < b.first; });

        for (auto& [name, child] : sorted_children) {
            uint64_t child_hash = compute_node_hash(child);
            combined = combine_hashes(combined, child_hash);
        }

        node->hash = combined;
        return combined;
    }

    /**
     * @brief Find node for path
     */
    MerkleNode* find_node(const std::string& path) {
        auto components = split_path(path);
        MerkleNode* current = root.get();

        for (const auto& comp : components) {
            auto it = current->children.find(comp);
            if (it == current->children.end()) {
                return nullptr;
            }
            current = it->second.get();
        }

        return current;
    }

    /**
     * @brief Remove node for path
     */
    bool remove_node(const std::string& path) {
        auto components = split_path(path);
        if (components.empty()) return false;

        MerkleNode* parent = root.get();

        for (size_t i = 0; i < components.size() - 1; i++) {
            auto it = parent->children.find(components[i]);
            if (it == parent->children.end()) {
                return false;
            }
            parent = it->second.get();
        }

        return parent->children.erase(components.back()) > 0;
    }

    /**
     * @brief Collect changed paths between two trees
     */
    void collect_diff(
        MerkleNode* node1,
        MerkleNode* node2,
        const std::string& current_path,
        std::vector<std::string>& changed_paths
    ) {
        // Null checks
        if (!node1 && !node2) return;

        if (!node1 || !node2 || node1->hash != node2->hash) {
            if (!current_path.empty()) {
                changed_paths.push_back(current_path);
            }
        }

        // Get all children names
        std::set<std::string> all_names;
        if (node1) {
            for (const auto& [name, _] : node1->children) {
                all_names.insert(name);
            }
        }
        if (node2) {
            for (const auto& [name, _] : node2->children) {
                all_names.insert(name);
            }
        }

        // Compare children
        for (const auto& name : all_names) {
            MerkleNode* child1 = nullptr;
            MerkleNode* child2 = nullptr;

            if (node1) {
                auto it = node1->children.find(name);
                if (it != node1->children.end()) {
                    child1 = it->second.get();
                }
            }
            if (node2) {
                auto it = node2->children.find(name);
                if (it != node2->children.end()) {
                    child2 = it->second.get();
                }
            }

            std::string child_path = current_path.empty() ? name : (current_path + "/" + name);
            collect_diff(child1, child2, child_path, changed_paths);
        }
    }

    /**
     * @brief Serialize node to bytes
     */
    void serialize_node(const MerkleNode* node, std::vector<uint8_t>& out) {
        // Write name length and name
        uint32_t name_len = static_cast<uint32_t>(node->name.size());
        out.insert(out.end(),
            reinterpret_cast<uint8_t*>(&name_len),
            reinterpret_cast<uint8_t*>(&name_len) + 4);
        out.insert(out.end(), node->name.begin(), node->name.end());

        // Write hash
        out.insert(out.end(),
            reinterpret_cast<const uint8_t*>(&node->hash),
            reinterpret_cast<const uint8_t*>(&node->hash) + 8);

        // Write is_file flag
        out.push_back(node->is_file ? 1 : 0);

        // Write children count and children
        uint32_t child_count = static_cast<uint32_t>(node->children.size());
        out.insert(out.end(),
            reinterpret_cast<uint8_t*>(&child_count),
            reinterpret_cast<uint8_t*>(&child_count) + 4);

        for (const auto& [name, child] : node->children) {
            serialize_node(child.get(), out);
        }
    }

    /**
     * @brief Deserialize node from bytes
     */
    std::unique_ptr<MerkleNode> deserialize_node(const uint8_t*& data, const uint8_t* end) {
        if (data + 4 > end) return nullptr;

        // Read name
        uint32_t name_len;
        memcpy(&name_len, data, 4);
        data += 4;

        if (data + name_len > end) return nullptr;
        std::string name(reinterpret_cast<const char*>(data), name_len);
        data += name_len;

        // Read hash
        if (data + 8 > end) return nullptr;
        uint64_t hash;
        memcpy(&hash, data, 8);
        data += 8;

        // Read is_file
        if (data + 1 > end) return nullptr;
        bool is_file = (*data++ != 0);

        auto node = std::make_unique<MerkleNode>(name, hash, is_file);

        // Read children
        if (data + 4 > end) return nullptr;
        uint32_t child_count;
        memcpy(&child_count, data, 4);
        data += 4;

        for (uint32_t i = 0; i < child_count; i++) {
            auto child = deserialize_node(data, end);
            if (!child) return nullptr;
            node->children[child->name] = std::move(child);
        }

        return node;
    }
};

MerkleTree::MerkleTree() : impl_(std::make_unique<Impl>()) {}

MerkleTree::~MerkleTree() = default;

void MerkleTree::add_file(const std::string& path, uint64_t content_hash) {
    MerkleNode* node = impl_->get_or_create_node(path, true);
    node->hash = content_hash;
    node->is_file = true;
    impl_->dirty = true;
}

void MerkleTree::remove_file(const std::string& path) {
    impl_->remove_node(path);
    impl_->dirty = true;
}

uint64_t MerkleTree::compute_hash(const std::string& dir_path) {
    MerkleNode* node = impl_->find_node(dir_path);
    if (!node) return 0;
    return impl_->compute_node_hash(node);
}

uint64_t MerkleTree::root_hash() const {
    if (impl_->dirty) {
        const_cast<Impl*>(impl_.get())->compute_node_hash(impl_->root.get());
        const_cast<Impl*>(impl_.get())->dirty = false;
    }
    return impl_->root->hash;
}

std::vector<std::string> MerkleTree::diff(const MerkleTree& other) const {
    std::vector<std::string> changed_paths;
    impl_->collect_diff(impl_->root.get(), other.impl_->root.get(), "", changed_paths);
    return changed_paths;
}

void MerkleTree::clear() {
    impl_->root = std::make_unique<MerkleNode>("", 0, false);
    impl_->dirty = false;
}

std::vector<uint8_t> MerkleTree::serialize() const {
    std::vector<uint8_t> data;
    // Write magic number
    uint32_t magic = 0x4D524B4C;  // "MRKL"
    data.insert(data.end(),
        reinterpret_cast<uint8_t*>(&magic),
        reinterpret_cast<uint8_t*>(&magic) + 4);

    // Write version
    uint32_t version = 1;
    data.insert(data.end(),
        reinterpret_cast<uint8_t*>(&version),
        reinterpret_cast<uint8_t*>(&version) + 4);

    // Serialize tree
    impl_->serialize_node(impl_->root.get(), data);

    return data;
}

bool MerkleTree::deserialize(const std::vector<uint8_t>& data) {
    if (data.size() < 8) return false;

    const uint8_t* ptr = data.data();
    const uint8_t* end = ptr + data.size();

    // Check magic
    uint32_t magic;
    memcpy(&magic, ptr, 4);
    ptr += 4;
    if (magic != 0x4D524B4C) return false;

    // Check version
    uint32_t version;
    memcpy(&version, ptr, 4);
    ptr += 4;
    if (version != 1) return false;

    // Deserialize tree
    auto root = impl_->deserialize_node(ptr, end);
    if (!root) return false;

    impl_->root = std::move(root);
    impl_->dirty = false;

    return true;
}

} // namespace indexer
} // namespace archicore
