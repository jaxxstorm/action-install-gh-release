# `install-install-gh-release` GitHub Action

This repository contains an action for use with GitHub Actions, which will install any GitHub release into your action environment:

This is especially useful when installing arbitrary Go binaries. It can lookup the latest version, or download a specific tag

## Usage

```yaml
- name: Install go-task
  uses: jaxxstorm/action-install-gh-release@release/v1-alpha
  with: # Grab the latest version
    repo: go-task/task
- name: Install tf2pulumi
  uses: jaxxstorm/action-install-gh-release@release/v1-alpha
  with: # Grab a specific tag
    repo: pulumi/tf2pulumi
    tag: v0.7.0
```

