cmake_minimum_required(VERSION 3.15)
project(archicore_indexer VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Source files
set(INDEXER_SOURCES
    src/indexer.cpp
    src/hasher.cpp
    src/merkle.cpp
    src/binding.cpp
)

# Create shared library for Node.js addon
add_library(archicore_indexer SHARED ${INDEXER_SOURCES})

# Include directories
target_include_directories(archicore_indexer PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/common/include
)

# Set output properties for Node.js addon
set_target_properties(archicore_indexer PROPERTIES
    PREFIX ""
    SUFFIX ".node"
    POSITION_INDEPENDENT_CODE ON
)

# Platform-specific settings
if(WIN32)
    target_compile_definitions(archicore_indexer PRIVATE
        _CRT_SECURE_NO_WARNINGS
        NOMINMAX
    )
endif()

if(APPLE)
    set_target_properties(archicore_indexer PROPERTIES
        LINK_FLAGS "-undefined dynamic_lookup"
    )
elseif(UNIX)
    set_target_properties(archicore_indexer PROPERTIES
        LINK_FLAGS "-Wl,--allow-shlib-undefined"
    )
endif()

# Threading support
find_package(Threads REQUIRED)
target_link_libraries(archicore_indexer PRIVATE Threads::Threads)
