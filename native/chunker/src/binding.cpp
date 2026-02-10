/**
 * @file binding.cpp
 * @brief N-API bindings for ArchiCore Semantic Chunker
 * @version 1.0.0
 *
 * Exposes the C++ Chunker to Node.js via N-API.
 */

#include <napi.h>
#include "chunker.h"

namespace archicore {
namespace chunker {

/**
 * @brief Convert ChunkConfig from JS object
 */
ChunkerConfig config_from_js(const Napi::Object& obj) {
    ChunkerConfig config;

    if (obj.Has("maxChunkTokens")) {
        config.max_chunk_tokens = obj.Get("maxChunkTokens").As<Napi::Number>().Uint32Value();
    }
    if (obj.Has("minChunkTokens")) {
        config.min_chunk_tokens = obj.Get("minChunkTokens").As<Napi::Number>().Uint32Value();
    }
    if (obj.Has("overlapTokens")) {
        config.overlap_tokens = obj.Get("overlapTokens").As<Napi::Number>().Uint32Value();
    }
    if (obj.Has("respectBoundaries")) {
        config.respect_boundaries = obj.Get("respectBoundaries").As<Napi::Boolean>().Value();
    }
    if (obj.Has("includeContext")) {
        config.include_context = obj.Get("includeContext").As<Napi::Boolean>().Value();
    }
    if (obj.Has("preserveImports")) {
        config.preserve_imports = obj.Get("preserveImports").As<Napi::Boolean>().Value();
    }
    if (obj.Has("language")) {
        std::string lang = obj.Get("language").As<Napi::String>().Utf8Value();
        if (lang == "javascript") config.language = Language::JAVASCRIPT;
        else if (lang == "typescript") config.language = Language::TYPESCRIPT;
        else if (lang == "python") config.language = Language::PYTHON;
        else if (lang == "rust") config.language = Language::RUST;
        else if (lang == "go") config.language = Language::GO;
        else if (lang == "java") config.language = Language::JAVA;
        else if (lang == "cpp" || lang == "c++") config.language = Language::CPP;
        else if (lang == "c") config.language = Language::C;
        else if (lang == "csharp" || lang == "c#") config.language = Language::CSHARP;
        else if (lang == "ruby") config.language = Language::RUBY;
        else if (lang == "php") config.language = Language::PHP;
        else if (lang == "swift") config.language = Language::SWIFT;
        else if (lang == "kotlin") config.language = Language::KOTLIN;
    }

    return config;
}

/**
 * @brief Convert SourceLocation to JS object
 */
Napi::Object location_to_js(Napi::Env env, const SourceLocation& loc) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("lineStart", Napi::Number::New(env, loc.line_start));
    obj.Set("lineEnd", Napi::Number::New(env, loc.line_end));
    obj.Set("columnStart", Napi::Number::New(env, loc.column_start));
    obj.Set("columnEnd", Napi::Number::New(env, loc.column_end));
    obj.Set("byteOffset", Napi::Number::New(env, loc.byte_offset));
    obj.Set("byteLength", Napi::Number::New(env, loc.byte_length));
    return obj;
}

/**
 * @brief Convert ChunkContext to JS object
 */
Napi::Object context_to_js(Napi::Env env, const ChunkContext& ctx) {
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("parentName", Napi::String::New(env, ctx.parent_name));
    obj.Set("namespaceName", Napi::String::New(env, ctx.namespace_name));

    Napi::Array imports = Napi::Array::New(env, ctx.imports.size());
    for (size_t i = 0; i < ctx.imports.size(); i++) {
        imports.Set(i, Napi::String::New(env, ctx.imports[i]));
    }
    obj.Set("imports", imports);

    return obj;
}

/**
 * @brief Convert CodeChunk to JS object
 */
Napi::Object chunk_to_js(Napi::Env env, const CodeChunk& chunk) {
    Napi::Object obj = Napi::Object::New(env);

    obj.Set("content", Napi::String::New(env, chunk.content));
    obj.Set("tokenCount", Napi::Number::New(env, chunk.token_count));
    obj.Set("location", location_to_js(env, chunk.location));
    obj.Set("type", Napi::String::New(env, chunk_type_to_string(chunk.type)));
    obj.Set("context", context_to_js(env, chunk.context));
    obj.Set("chunkIndex", Napi::Number::New(env, chunk.chunk_index));
    obj.Set("hash", Napi::String::New(env, chunk.hash));

    return obj;
}

/**
 * @brief Convert ChunkResult to JS object
 */
Napi::Object result_to_js(Napi::Env env, const ChunkResult& result) {
    Napi::Object obj = Napi::Object::New(env);

    Napi::Array chunks = Napi::Array::New(env, result.chunks.size());
    for (size_t i = 0; i < result.chunks.size(); i++) {
        chunks.Set(i, chunk_to_js(env, result.chunks[i]));
    }
    obj.Set("chunks", chunks);

    obj.Set("totalTokens", Napi::Number::New(env, result.total_tokens));
    obj.Set("totalLines", Napi::Number::New(env, result.total_lines));
    obj.Set("chunkingTimeMs", Napi::Number::New(env, result.chunking_time_ms));

    if (!result.error.empty()) {
        obj.Set("error", Napi::String::New(env, result.error));
    }

    return obj;
}

/**
 * @brief Wrapper class for Chunker
 */
class ChunkerWrapper : public Napi::ObjectWrap<ChunkerWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports) {
        Napi::Function func = DefineClass(env, "Chunker", {
            InstanceMethod("chunk", &ChunkerWrapper::Chunk),
            InstanceMethod("chunkFile", &ChunkerWrapper::ChunkFile),
            InstanceMethod("setConfig", &ChunkerWrapper::SetConfig),
            InstanceMethod("getConfig", &ChunkerWrapper::GetConfig),
        });

        Napi::FunctionReference* constructor = new Napi::FunctionReference();
        *constructor = Napi::Persistent(func);
        env.SetInstanceData(constructor);

        exports.Set("Chunker", func);
        return exports;
    }

    ChunkerWrapper(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<ChunkerWrapper>(info) {
        Napi::Env env = info.Env();

        ChunkerConfig config;
        if (info.Length() > 0 && info[0].IsObject()) {
            config = config_from_js(info[0].As<Napi::Object>());
        }

        chunker_ = std::make_unique<Chunker>(config);
    }

private:
    std::unique_ptr<Chunker> chunker_;

    /**
     * @brief chunk(source: string, filepath?: string): ChunkResult
     */
    Napi::Value Chunk(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "Source code string expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string source = info[0].As<Napi::String>().Utf8Value();
        std::string filepath;

        if (info.Length() > 1 && info[1].IsString()) {
            filepath = info[1].As<Napi::String>().Utf8Value();
        }

        ChunkResult result = chunker_->chunk(source, filepath);
        return result_to_js(env, result);
    }

    /**
     * @brief chunkFile(filepath: string): ChunkResult
     */
    Napi::Value ChunkFile(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsString()) {
            Napi::TypeError::New(env, "File path expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        std::string filepath = info[0].As<Napi::String>().Utf8Value();
        ChunkResult result = chunker_->chunk_file(filepath);

        if (!result.error.empty()) {
            Napi::Error::New(env, result.error).ThrowAsJavaScriptException();
            return env.Undefined();
        }

        return result_to_js(env, result);
    }

    /**
     * @brief setConfig(config: ChunkerConfig): void
     */
    Napi::Value SetConfig(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        if (info.Length() < 1 || !info[0].IsObject()) {
            Napi::TypeError::New(env, "Config object expected")
                .ThrowAsJavaScriptException();
            return env.Undefined();
        }

        ChunkerConfig config = config_from_js(info[0].As<Napi::Object>());
        chunker_->set_config(config);

        return env.Undefined();
    }

    /**
     * @brief getConfig(): ChunkerConfig
     */
    Napi::Value GetConfig(const Napi::CallbackInfo& info) {
        Napi::Env env = info.Env();

        const ChunkerConfig& config = chunker_->get_config();

        Napi::Object obj = Napi::Object::New(env);
        obj.Set("maxChunkTokens", Napi::Number::New(env, config.max_chunk_tokens));
        obj.Set("minChunkTokens", Napi::Number::New(env, config.min_chunk_tokens));
        obj.Set("overlapTokens", Napi::Number::New(env, config.overlap_tokens));
        obj.Set("respectBoundaries", Napi::Boolean::New(env, config.respect_boundaries));
        obj.Set("includeContext", Napi::Boolean::New(env, config.include_context));
        obj.Set("preserveImports", Napi::Boolean::New(env, config.preserve_imports));

        return obj;
    }
};

/**
 * @brief Standalone function: chunk(source, options?)
 */
Napi::Value ChunkSource(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Source code string expected")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string source = info[0].As<Napi::String>().Utf8Value();

    ChunkerConfig config;
    std::string filepath;

    if (info.Length() > 1 && info[1].IsObject()) {
        Napi::Object opts = info[1].As<Napi::Object>();
        config = config_from_js(opts);

        if (opts.Has("filepath")) {
            filepath = opts.Get("filepath").As<Napi::String>().Utf8Value();
        }
    }

    Chunker chunker(config);
    ChunkResult result = chunker.chunk(source, filepath);

    return result_to_js(env, result);
}

/**
 * @brief Standalone function: chunkFile(filepath, options?)
 */
Napi::Value ChunkFile(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "File path expected")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string filepath = info[0].As<Napi::String>().Utf8Value();

    ChunkerConfig config;
    if (info.Length() > 1 && info[1].IsObject()) {
        config = config_from_js(info[1].As<Napi::Object>());
    }

    Chunker chunker(config);
    ChunkResult result = chunker.chunk_file(filepath);

    if (!result.error.empty()) {
        Napi::Error::New(env, result.error).ThrowAsJavaScriptException();
        return env.Undefined();
    }

    return result_to_js(env, result);
}

/**
 * @brief Standalone function: countTokens(text)
 */
Napi::Value CountTokens(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Text string expected")
            .ThrowAsJavaScriptException();
        return env.Undefined();
    }

    std::string text = info[0].As<Napi::String>().Utf8Value();

    Tokenizer tokenizer;
    uint32_t count = tokenizer.count_tokens(text);

    return Napi::Number::New(env, count);
}

/**
 * @brief Module initialization
 */
Napi::Object Init(Napi::Env env, Napi::Object exports) {
    ChunkerWrapper::Init(env, exports);

    exports.Set("chunk", Napi::Function::New(env, ChunkSource));
    exports.Set("chunkFile", Napi::Function::New(env, ChunkFile));
    exports.Set("countTokens", Napi::Function::New(env, CountTokens));

    // Version info
    exports.Set("version", Napi::String::New(env, "1.0.0"));

    return exports;
}

NODE_API_MODULE(archicore_chunker, Init)

} // namespace chunker
} // namespace archicore
