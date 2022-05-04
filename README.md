# `install-gh-release` GitHub Action

This repository contains an action for use with GitHub Actions, which will install any GitHub release into your action environment:

This is especially useful when installing arbitrary Go binaries. It can lookup the latest version, or download a specific tag.

## Usage

```yaml
- name: Install go-task
  uses: jaxxstorm/action-install-gh-release@v1.5.0
  with: # Grab the latest version
    repo: go-task/task
- name: Install tf2pulumi
  uses: jaxxstorm/action-install-gh-release@v1.5.0
  with: # Grab a specific tag
    repo: pulumi/tf2pulumi
    tag: v0.7.0
- name: Install tfsec
  uses: jaxxstorm/action-install-gh-release@v1.5.0
  with: # Grab a specific platform and architecture
    repo: aquasecurity/tfsec
    platform: linux
    arch: x86-64
```

## Finding a release

By default, this action will lookup the Platform and Architecture of the runner and use those values to interpolate and match a release package. **The release package name is first converted to lowercase**. The match pattern is:

```js
`(osPlatform|osArchs).*(osPlatform|osArchs).*\.(tar\.gz|zip)`;
```

Natively, the action will only match the following platforms: `linux`, `darwin`, `windows`.

Some examples of matches:

- `my_package_linux_x86_64.tar.gz` (or `.zip`)
- `my_package_x86_64_linux.tar.gz` (or `.zip`)
- `my_package.linux.x86_64.tar.gz` (or `.zip`)
- `my_package.x86_64.linux.tar.gz` (or `.zip`)
- `linux_x86_64_my_package.tar.gz` (or `.zip`)
- `x86_64_linux_my_package.tar.gz` (or `.zip`)
- `linux.x86_64.my_package.tar.gz` (or `.zip`)
- `x86_64.linux.my_package.tar.gz` (or `.zip`)
- `linux_x86_64.tar.gz` (or `.zip`)
- `x86_64_linux.tar.gz` (or `.zip`)
- `linux.x86_64.tar.gz` (or `.zip`)
- `x86_64.linux.tar.gz` (or `.zip`)
