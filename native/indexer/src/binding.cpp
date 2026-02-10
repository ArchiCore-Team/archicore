/**
 * @file binding.cpp
 * @brief N-API bindings for ArchiCore Incremental Indexer
 * @version 1.0.0
 */

#include <napi.h>
#include "indexer.h"

namespace archicore {
namespace indexer {

/**
 * @brief Convert IndexerConfig from JS object
 */
IndexerConfig config_from_js(const Napi::Object& obj) {
    IndexerConfig config;

    if (obj.Has("includePatterns") && obj.Get("includePatterns").IsArray()) {
        Napi::Array arr = obj.Get("includePatterns").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            config.include_patterns.push_back(arr.Get(i).As<Napi::String>().Utf8Value());
        }
    }

    if (obj.Has("excludePatterns") && obj.Get("excludePatterns").IsArray()) {
        Napi::Array arr = obj.Get("excludePatterns").As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            config.exclude_patterns.push_back(arr.Get(i).As<Napi::String>().Utf8Value());
        }
    }

    if (obj.Has("followSymlinks")) {
        config.follow_symlinks = obj.Get("followSymlinks").As<Napi::Boolean>().Value();
    }

    if (obj.Has("computeContentHash")) {
        config.compute_content_hash = obj.Get("computeContentHash").As<Napi::Boolean>().Value();
    }

    if (obj.Has("detectRenames")) {
        config.detect_renames = obj.Get("detectRenames").As<Napi::Boolean>().Value();
    }

    if (obj.Has("maxFileSize")) {
        config.max_file_size = obj.Get("maxFileSize").As<Napi::Number>().Uint32Value();
    }

    if (obj.Has("parallelWorkers")) {
        config.parallel_workers = obj.Get("parallelWorkers").As<Napi::Number>().Uint32Value();
    }

    return config;
}

/**
 * @brief Convert Language to string
 */
std::string language_to_string(Language lang) {
    switch (lang) {
        case Language::JAVASCRIPT: return "javascript";
        case Language::TYPESCRIPT: return "typescript";
        case Language::PYTHON: return "python";
        case Language::RUST: return "rust";
        case Language::GO: return "go";
        case Language::JAVA: return "java";
        case Language::CPP: return "cpp";
        case Language::C: return "c";
        case Language::CSHARP: return "csharp";
        case Language::RUBY: return "ruby";
        case Language::PHP: return "php";
        case Language::SWIFT: return "swift";
        case Language::KOTLIN: return "kotlin";
        default: return "unknown";
    }
}

/**
 * @brief Convert FileEntry to JS object
 */
Napi::Object file_entry_to_js(Napi::Env env, const FileEntry& entry) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("path", Napi::String::New(env, entry.path));
    obj.Set("contentHash", Napi::String::New(env, std::to_string(entry.content_hash)));
    obj.Set("size", Napi::Number::New(env, static_cast<double>(entry.size)));
    obj.Set("mtime", Napi::Number::New(env, static_cast<double>(entry.mtime)));
    obj.Set("language", Napi::String::New(env, language_to_string(entry.language)));
    obj.Set("isIndexed", Napi::Boolean::New(env, entry.is_indexed));
    return obj;
}

/**
 * @brief Convert DirEntry to JS object
 */
Napi::Object dir_entry_to_js(Napi::Env env, const DirEntry& entry) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("path", Napi::String::New(env, entry.path));
    obj.Set("merkleHash", Napi::String::New(env, std::to_string(entry.merkle_hash)));
    obj.Set("fileCount", Napi::Number::New(env, entry.file_count));
    obj.Set("dirCount", Napi::Number::New(env, entry.dir_count));
    return obj;
}

/**
 * @brief Convert FileChange to JS object
 */
Napi::Object file_change_to_js(Napi::Env env, const FileChange& change) {
    Napi::Object obj = Napi::Object::New(env);

    const char* type_str;
    switch (change.type) {
        case ChangeType::ADDED: type_str = "added"; break;
        case ChangeType::MODIFIED: type_str = "modified"; break;
        case ChangeType::DELETED: type_str = "deleted"; break;
        case ChangeType::RENAMED: type_str = "renamed"; break;
    }
    obj.Set("type", Napi::String::New(env, type_str));
    obj.Set("path", Napi::String::New(env, change.path));

    if (!change.old_path.empty()) {
        obj.Set("oldPath", Napi::String::New(env, change.old_path));
    }

    obj.Set("oldHash", Napi::String::New(env, std::to_string(change.old_hash)));
    obj.Set("newHash", Napi::String::New(env, std::to_string(change.new_hash)));

    return obj;
}

/**
 * @brief Convert ScanResult to JS object
 */
Napi::Object scan_result_to_js(Napi::Env env, const ScanResult& result) {
    Napi::Object obj = Napi::Object::New(env);

    Napi::Array files = Napi::Array::New(env, result.files.size());
    for (size_t i = 0; i < result.files.size(); i++) {
        files.Set(i, file_entry_to_js(env, result.files[i]));
    }
    obj.Set("files", files);

    Napi::Array directories = Napi::Array::New(env, result.directories.size());
    for (size_t i = 0; i < result.directories.size(); i++) {
        directories.Set(i, dir_entry_to_js(env, result.directories[i]));
    }
    obj.Set("directories", directories);

    obj.Set("totalSize", Napi::Number::New(env, static_cast<double>(result.total_size)));
    obj.Set("totalFiles", Napi::Number::New(env, result.total_files));
    obj.Set("totalDirs", Napi::Number::New(env, result.total_dirs));
    obj.Set("scanTimeMs", Napi::Number::New(env, result.scan_time_ms));

    if (!result.error.empty()) {
        obj.Set("error", Napi::String::New(env, result.error));
    }

    return obj;
}

/**
 * @brief Convert DiffResult to JS object
 */
Napi::Object diff_result_to_js(Napi::Env env, const DiffResult& result) {
    Napi::Object obj = Napi::Object::New(env);

    Napi::Array changes = Napi::Array::New(env, result.changes.size());
    for (size_t i = 0; i < result.changes.size(); i++) {
        changes.Set(i, file_change_to_js(env, result.changes[i]));
    }
    obj.Set("changes", changes);

    obj.Set("addedCount", Napi::Number::New(env, result.added_count));
    obj.Set("modifiedCount", Napi::Number::New(env, result.modified_count));
    obj.Set("deletedCount", Napi::Number::New(env, result.deleted_count));
    obj.Set("renamedCount", Napi::Number::New(env, result.renamed_count));
    obj.Set("diffTimeMs", Napi::Number::New(env, result.diff_time_ms));

    if (!result.error.empty()) {
        obj.Set("error", Napi::String::New(env, result.error));
    }

    return obj;
}

/**
 * @brief Wrapper for FileIndex
 */
class FileIndexWrapper : public Napi::ObjectWrap<FileIndexWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "FileIndex", {
            InstanceMethod("add", &FileIndexWrapper::Add),
            InstanceMethod("remove", &FileIndexWrapper::Remove),
            InstanceMethod("get", &FileIndexWrapper::Get),
            InstanceMethod("contains", &FileIndexWrapper::Contains),
            InstanceMethod("getAll", &FileIndexWrapper::GetAll),
            InstanceMethod("getByLanguage", &FileIndexWrapper::GetByLanguage),
            InstanceMethod("size", &FileIndexWrapper::Size),
            InstanceMethod("clear", &FileIndexWrapper::Clear),
            InstanceMethod("save", &FileIndexWrapper::Save),
            InstanceMethod("load", &FileIndexWrapper::Load),
            InstanceMethod("merkleHash", &FileIndexWrapper::MerkleHash),
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        exports.Set("FileIndex", func);

        return exports;
    }

    FileIndexWrapper(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<FileIndexWrapper>(info)
        , index_(std::make_unique<FileIndex>()) {}

    FileIndex& get_index() { return *index_; }

private:
    std::unique_ptr<FileIndex> index_;

    Napi::Value Add(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            Napi::TypeError::New(env, "FileEntry object expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        Napi::Object obj = info[0].As<Napi::Object>();

        FileEntry entry;
        entry.path = obj.Get("path").As<Napi::String>().Utf8Value();
        entry.content_hash = std::stoull(obj.Get("contentHash").As<Napi::String>().Utf8Value());
        entry.size = static_cast<uint64_t>(obj.Get("size").As<Napi::Number>().DoubleValue());
        entry.mtime = static_cast<uint64_t>(obj.Get("mtime").As<Napi::Number>().DoubleValue());
        entry.is_indexed = obj.Get("isIndexed").As<Napi::Boolean>().Value();

        index_->add(entry);

        return env.Undefined();
    }

    Napi::Value Remove(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Path string expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string path = info[0].As<Napi::String>().Utf8Value();
        index_->remove(path);

        return env.Undefined();
    }

    Napi::Value Get(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Path string expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string path = info[0].As<Napi::String>().Utf8Value();
        const FileEntry* entry = index_->get(path);

        if (!entry) {
            return env.Null();
        }

        return file_entry_to_js(env, *entry);
    }

    Napi::Value Contains(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            return Napi::Boolean::New(env, false);
        }

        std::string path = info[0].As<Napi::String>().Utf8Value();
        return Napi::Boolean::New(env, index_->contains(path));
    }

    Napi::Value GetAll(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        auto entries = index_->get_all();

        Napi::Array result = Napi::Array::New(env, entries.size());
        for (size_t i = 0; i < entries.size(); i++) {
            result.Set(i, file_entry_to_js(env, entries[i]));
        }

        return result;
    }

    Napi::Value GetByLanguage(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Language string expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string lang_str = info[0].As<Napi::String>().Utf8Value();
        Language lang = Language::UNKNOWN;

        if (lang_str == "javascript") lang = Language::JAVASCRIPT;
        else if (lang_str == "typescript") lang = Language::TYPESCRIPT;
        else if (lang_str == "python") lang = Language::PYTHON;
        else if (lang_str == "rust") lang = Language::RUST;
        else if (lang_str == "go") lang = Language::GO;
        else if (lang_str == "java") lang = Language::JAVA;
        else if (lang_str == "cpp") lang = Language::CPP;
        else if (lang_str == "c") lang = Language::C;
        else if (lang_str == "csharp") lang = Language::CSHARP;

        auto entries = index_->get_by_language(lang);

        Napi::Array result = Napi::Array::New(env, entries.size());
        for (size_t i = 0; i < entries.size(); i++) {
            result.Set(i, file_entry_to_js(env, entries[i]));
        }

        return result;
    }

    Napi::Value Size(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        return Napi::Number::New(env, static_cast<double>(index_->size()));
    }

    Napi::Value Clear(const Napi::CallbackInfo& info) {
        index_->clear();
        return info.Env().Undefined();
    }

    Napi::Value Save(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Path string expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string path = info[0].As<Napi::String>().Utf8Value();
        bool success = index_->save(path);

        return Napi::Boolean::New(env, success);
    }

    Napi::Value Load(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Path string expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string path = info[0].As<Napi::String>().Utf8Value();
        bool success = index_->load(path);

        return Napi::Boolean::New(env, success);
    }

    Napi::Value MerkleHash(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();
        uint64_t hash = index_->merkle_hash();
        return Napi::String::New(env, std::to_string(hash));
    }
};

/**
 * @brief Wrapper for Indexer
 */
class IndexerWrapper : public Napi::ObjectWrap<IndexerWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "Indexer", {
            InstanceMethod("scan", &IndexerWrapper::Scan),
            InstanceMethod("diff", &IndexerWrapper::Diff),
            InstanceMethod("setConfig", &IndexerWrapper::SetConfig),
            InstanceMethod("getConfig", &IndexerWrapper::GetConfig),
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        exports.Set("Indexer", func);

        return exports;
    }

    IndexerWrapper(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<IndexerWrapper>(info) {
        Napi::Env env = info.Env();

        IndexerConfig config;
        if (info.Length() > 0 && info[0].IsObject()) {
            config = config_from_js(info[0].As<Napi::Object>());
        }

        indexer_ = std::make_unique<Indexer>(config);
    }

private:
    std::unique_ptr<Indexer> indexer_;

    Napi::Value Scan(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Root path expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string root_path = info[0].As<Napi::String>().Utf8Value();

        // Optional progress callback
        Napi::Function callback;
        ProgressCallback progress = nullptr;

        if (info.Length() > 1 && info[1].IsFunction()) {
            callback = info[1].As<Napi::Function>();
            // Note: Can't easily use callback in native code due to threading
            // For now, we'll skip progress callback in native
        }

        ScanResult result = indexer_->scan(root_path, progress);

        if (!result.error.empty()) {
            Napi::Error::New(env, result.error).ThrowAsJavaScriptException();
            return env.Undefined();
        }

        return scan_result_to_js(env, result);
    }

    Napi::Value Diff(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 2 || !info[0].IsObject() || !info[1].IsObject()) {
            Napi::TypeError::New(env, "Two ScanResult objects expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        // Convert JS objects to ScanResult
        Napi::Object old_obj = info[0].As<Napi::Object>();
        Napi::Object new_obj = info[1].As<Napi::Object>();

        ScanResult old_scan, new_scan;

        // Parse old_scan files
        if (old_obj.Has("files") && old_obj.Get("files").IsArray()) {
            Napi::Array files = old_obj.Get("files").As<Napi::Array>();
            for (uint32_t i = 0; i < files.Length(); i++) {
                Napi::Object f = files.Get(i).As<Napi::Object>();
                FileEntry entry;
                entry.path = f.Get("path").As<Napi::String>().Utf8Value();
                entry.content_hash = std::stoull(f.Get("contentHash").As<Napi::String>().Utf8Value());
                old_scan.files.push_back(entry);
            }
        }

        // Parse new_scan files
        if (new_obj.Has("files") && new_obj.Get("files").IsArray()) {
            Napi::Array files = new_obj.Get("files").As<Napi::Array>();
            for (uint32_t i = 0; i < files.Length(); i++) {
                Napi::Object f = files.Get(i).As<Napi::Object>();
                FileEntry entry;
                entry.path = f.Get("path").As<Napi::String>().Utf8Value();
                entry.content_hash = std::stoull(f.Get("contentHash").As<Napi::String>().Utf8Value());
                new_scan.files.push_back(entry);
            }
        }

        DiffResult result = indexer_->diff(old_scan, new_scan);

        return diff_result_to_js(env, result);
    }

    Napi::Value SetConfig(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            Napi::TypeError::New(env, "Config object expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        IndexerConfig config = config_from_js(info[0].As<Napi::Object>());
        indexer_->set_config(config);

        return env.Undefined();
    }

    Napi::Value GetConfig(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        const IndexerConfig& config = indexer_->get_config();

        Napi::Object obj = Napi::Object::New(env);

        Napi::Array include = Napi::Array::New(env, config.include_patterns.size());
        for (size_t i = 0; i < config.include_patterns.size(); i++) {
            include.Set(i, Napi::String::New(env, config.include_patterns[i]));
        }
        obj.Set("includePatterns", include);

        Napi::Array exclude = Napi::Array::New(env, config.exclude_patterns.size());
        for (size_t i = 0; i < config.exclude_patterns.size(); i++) {
            exclude.Set(i, Napi::String::New(env, config.exclude_patterns[i]));
        }
        obj.Set("excludePatterns", exclude);

        obj.Set("followSymlinks", Napi::Boolean::New(env, config.follow_symlinks));
        obj.Set("computeContentHash", Napi::Boolean::New(env, config.compute_content_hash));
        obj.Set("detectRenames", Napi::Boolean::New(env, config.detect_renames));
        obj.Set("maxFileSize", Napi::Number::New(env, config.max_file_size));
        obj.Set("parallelWorkers", Napi::Number::New(env, config.parallel_workers));

        return obj;
    }
};

/**
 * @brief Standalone function: hashFile(path)
 */
Napi::Value HashFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "File path expected")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string path = info[0].As<Napi::String>().Utf8Value();

    FileHasher hasher;
    uint64_t hash = hasher.hash_file(path);

    return Napi::String::New(env, std::to_string(hash));
}

/**
 * @brief Standalone function: hashString(content)
 */
Napi::Value HashString(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "String expected")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string content = info[0].As<Napi::String>().Utf8Value();

    FileHasher hasher;
    uint64_t hash = hasher.hash_string(content);

    return Napi::String::New(env, std::to_string(hash));
}

/**
 * @brief Standalone function: scan(rootPath, config?)
 */
Napi::Value ScanDirectory(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Root path expected")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string root_path = info[0].As<Napi::String>().Utf8Value();

    IndexerConfig config;
    if (info.Length() > 1 && info[1].IsObject()) {
        config = config_from_js(info[1].As<Napi::Object>());
    }

    Indexer indexer(config);
    ScanResult result = indexer.scan(root_path);

    if (!result.error.empty()) {
        Napi::Error::New(env, result.error).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return scan_result_to_js(env, result);
}

/**
 * @brief Standalone function: globMatch(path, pattern)
 */
Napi::Value GlobMatch(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2 || !info[0].IsString() || !info[1].IsString()) {
        Napi::TypeError::New(env, "Path and pattern strings expected")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string path = info[0].As<Napi::String>().Utf8Value();
    std::string pattern = info[1].As<Napi::String>().Utf8Value();

    return Napi::Boolean::New(env, glob_match(path, pattern));
}

/**
 * @brief Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    IndexerWrapper::Init(env, exports);
    FileIndexWrapper::Init(env, exports);

    exports.Set("hashFile", Napi::Function::New(env, HashFile));
    exports.Set("hashString", Napi::Function::New(env, HashString));
    exports.Set("scan", Napi::Function::New(env, ScanDirectory));
    exports.Set("globMatch", Napi::Function::New(env, GlobMatch));

    // Version info
    exports.Set("version", Napi::String::New(env, "1.0.0"));

    return exports;
}

NODE_API_MODULE(archicore_indexer, Init)

} // namespace indexer
} // namespace archicore
