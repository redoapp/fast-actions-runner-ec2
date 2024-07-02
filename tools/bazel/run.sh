#!/usr/bin/env sh
[ -z "${BUILD_WORKING_DIRECTORY-}" ] || cd "$BUILD_WORKING_DIRECTORY"
exec "$@"
