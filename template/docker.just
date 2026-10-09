# The registry path, e.g. registry.example.com/team/__APP_NAME__ (or IMAGE=…).
image := env("IMAGE", "__APP_NAME__")
tag := env("TAG", "latest")

# List the docker recipes.
default:
    @just --list docker

# Build for servers (amd64) and push it to the registry
push:
    docker build -t {{ image }}:{{ tag }} --platform linux/amd64 . --push

# Build for this machine and load it into the local Docker
[macos]
load:
    docker build -t {{ image }}:{{ tag }} --platform linux/arm64 . --load
[linux]
load:
    docker build -t {{ image }}:{{ tag }} . --load
