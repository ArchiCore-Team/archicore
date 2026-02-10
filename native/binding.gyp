{
  "targets": [
    {
      "target_name": "archicore_chunker",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-std=c++17", "-O3", "-Wall", "-Wextra"],
      "sources": [
        "chunker/src/chunker.cpp",
        "chunker/src/tokenizer.cpp",
        "chunker/src/boundaries.cpp",
        "chunker/src/binding.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "common/include",
        "chunker/include"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17", "/O2", "/EHsc"]
            }
          },
          "defines": ["_CRT_SECURE_NO_WARNINGS"]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": ["-fexceptions"]
        }]
      ]
    },
    {
      "target_name": "archicore_indexer",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "cflags_cc": ["-std=c++17", "-O3", "-Wall", "-Wextra"],
      "sources": [
        "indexer/src/indexer.cpp",
        "indexer/src/hasher.cpp",
        "indexer/src/merkle.cpp",
        "indexer/src/binding.cpp"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "common/include",
        "indexer/include"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "NAPI_DISABLE_CPP_EXCEPTIONS"
      ],
      "conditions": [
        ["OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": {
              "ExceptionHandling": 1,
              "AdditionalOptions": ["/std:c++17", "/O2", "/EHsc"]
            }
          },
          "defines": ["_CRT_SECURE_NO_WARNINGS"]
        }],
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "CLANG_CXX_LANGUAGE_STANDARD": "c++17",
            "MACOSX_DEPLOYMENT_TARGET": "10.15"
          }
        }],
        ["OS=='linux'", {
          "cflags_cc": ["-fexceptions"]
        }]
      ]
    }
  ]
}
