cmake_minimum_required(VERSION 3.15)
project(archicore_native VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

# Build type
if(NOT CMAKE_BUILD_TYPE)
    set(CMAKE_BUILD_TYPE Release)
endif()

# Compiler flags
if(MSVC)
    add_compile_options(/W4 /O2 /EHsc)
    add_definitions(-D_CRT_SECURE_NO_WARNINGS)
else()
    add_compile_options(-Wall -Wextra -Wpedantic -O3)
    if(APPLE)
        add_compile_options(-mmacosx-version-min=10.15)
    endif()
endif()

# Find Node.js and node-addon-api
execute_process(
    COMMAND node -p "require('node-addon-api').include"
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_ADDON_API_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

execute_process(
    COMMAND node -p "require('node-api-headers').include_dir"
    WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
    OUTPUT_VARIABLE NODE_API_HEADERS_DIR
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
string(REPLACE "\"" "" NODE_API_HEADERS_DIR ${NODE_API_HEADERS_DIR})

# Common include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/common/include
    ${NODE_ADDON_API_DIR}
    ${NODE_API_HEADERS_DIR}
)

# Define NAPI_VERSION
add_definitions(-DNAPI_VERSION=8)
add_definitions(-DNAPI_DISABLE_CPP_EXCEPTIONS)

# Add subdirectories
add_subdirectory(chunker)
add_subdirectory(indexer)

# Test executable (optional, built separately)
option(BUILD_TESTS "Build test executables" OFF)
if(BUILD_TESTS)
    enable_testing()
    add_subdirectory(test)
endif()
