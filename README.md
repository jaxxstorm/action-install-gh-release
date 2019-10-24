# `install-tf2pulumi` GitHub Action

This repository contains an action for use with GitHub Actions, which installs a specified version of [`tf2pulumi`][1] on either MacOS or Linux.

The `tf2pulumi` binary is installed at `~/.tf2pulumi`, and the directory is added to `PATH`.

## Usage

```yaml
- name: Install tf2pulumi
  uses: pulumi/install-tf2pulumi@releases/v1
  with:
    tf2pulumi-version: 0.6.0
```

[1]: https://github.com/pulumi/tf2pulumi
